import "fake-indexeddb/auto";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MaterialPicker } from "@/components/materials";
import { getDataLayer, openDatabase } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.materials;

beforeEach(async () => {
  const db = openDatabase();
  await Promise.all([db.materials.clear(), db.meta.clear()]);
  db.close();
});

afterEach(() => cleanup());

const repo = () => getDataLayer().materials;

function Harness(props: {
  type?: "wax" | "wick";
  initial?: string | null;
  allowNone?: boolean;
  excludeIds?: string[];
  onChange?: (id: string | null) => void;
}) {
  const [value, setValue] = useState<string | null>(props.initial ?? null);
  return (
    <MaterialPicker
      type={props.type ?? "wax"}
      label="Wax"
      value={value}
      allowNone={props.allowNone}
      excludeIds={props.excludeIds}
      onChange={(id) => {
        setValue(id);
        props.onChange?.(id);
      }}
    />
  );
}

async function select() {
  const el = (await screen.findByLabelText("Wax")) as HTMLSelectElement;
  await waitFor(() => expect(el).not.toBeDisabled());
  return el;
}

function optionTexts(el: HTMLSelectElement) {
  return Array.from(el.options).map((o) => o.text);
}

describe("MaterialPicker", () => {
  it("lists only unarchived materials of its type, by name", async () => {
    await repo().create({ type: "wax", name: "Soy 464" });
    await repo().create({ type: "wax", name: "Palm" });
    const old = await repo().create({ type: "wax", name: "Old wax" });
    await repo().setArchived(old.id, true);
    await repo().create({ type: "fragranceOil", name: "Lavender" });
    render(<Harness />);
    const el = await select();
    await waitFor(() => expect(optionTexts(el)).toEqual([M.pickerChoose, "Palm", "Soy 464"]));
  });

  it("selects through the keyboard-native select", async () => {
    const soy = await repo().create({ type: "wax", name: "Soy 464" });
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const el = await select();
    await waitFor(() => expect(optionTexts(el)).toContain("Soy 464"));
    fireEvent.change(el, { target: { value: soy.id } });
    expect(onChange).toHaveBeenCalledWith(soy.id);
    expect(el.value).toBe(soy.id);
  });

  it("quick-adds with a name only, then selects the new material", async () => {
    await repo().create({ type: "wax", name: "Soy 464" });
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const el = await select();
    fireEvent.click(await screen.findByRole("button", { name: M.pickerAddRow("wax") }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: " Beeswax " } });
    fireEvent.click(screen.getByRole("button", { name: M.pickerCreate }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const [created] = (await repo().list({ type: "wax" })).filter((m) => m.name === "Beeswax");
    expect(created).toBeDefined();
    expect(onChange).toHaveBeenCalledWith(created.id);
    await waitFor(() => expect(el.value).toBe(created.id));
    expect(el.options[el.selectedIndex].text).toBe("Beeswax");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the quick-add first when the library has none of that type", async () => {
    await repo().create({ type: "fragranceOil", name: "Lavender" });
    render(<Harness />);
    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: M.pickerAddRow("wax") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: M.pickerAddRow("wax") })).not.toBeInTheDocument();
  });

  it("asks for a name and focuses the field when it is blank", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = await screen.findByRole("textbox");
    fireEvent.click(screen.getByRole("button", { name: M.pickerCreate }));
    expect(await screen.findByText(M.nameRequired)).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(await repo().list()).toHaveLength(0);
  });

  it("adds on Enter and keeps the typed name when saving fails", async () => {
    render(<Harness />);
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Soy" } });
    const original = repo().create;
    repo().create = () => Promise.reject(new Error("blocked"));
    try {
      fireEvent.keyDown(input, { key: "Enter" });
      expect(await screen.findByText(M.saveFailed)).toBeInTheDocument();
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Soy");
    } finally {
      repo().create = original;
    }
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(async () => expect(await repo().list()).toHaveLength(1));
  });

  it("still shows an archived current value, marked Archived", async () => {
    const old = await repo().create({ type: "wax", name: "Old wax" });
    await repo().create({ type: "wax", name: "Soy 464" });
    await repo().setArchived(old.id, true);
    render(<Harness initial={old.id} />);
    const el = await select();
    await waitFor(() => expect(el.value).toBe(old.id));
    expect(el.options[el.selectedIndex].text).toBe(`Old wax (${M.archivedTag})`);
    expect(optionTexts(el)).toContain("Soy 464");
  });

  it("shows a value whose material is missing instead of dropping it", async () => {
    await repo().create({ type: "wax", name: "Soy 464" });
    render(<Harness initial="9f4a6b1e-0000-4000-8000-000000000000" />);
    const el = await select();
    await waitFor(() => expect(el.options[el.selectedIndex].text).toBe(M.pickerMissing));
  });

  it("offers None when allowed and reports null", async () => {
    const wick = await repo().create({ type: "wick", name: "CD 10" });
    const onChange = vi.fn();
    render(<Harness type="wick" allowNone initial={wick.id} onChange={onChange} />);
    const el = (await screen.findByLabelText("Wax")) as HTMLSelectElement;
    await waitFor(() => expect(optionTexts(el)).toEqual([M.pickerNone, "CD 10"]));
    fireEvent.change(el, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("leaves out excluded materials but keeps the current one", async () => {
    const a = await repo().create({ type: "wax", name: "A wax" });
    const b = await repo().create({ type: "wax", name: "B wax" });
    await repo().create({ type: "wax", name: "C wax" });
    render(<Harness initial={a.id} excludeIds={[a.id, b.id]} />);
    const el = await select();
    await waitFor(() => expect(optionTexts(el)).toEqual([M.pickerChoose, "A wax", "C wax"]));
  });
});
