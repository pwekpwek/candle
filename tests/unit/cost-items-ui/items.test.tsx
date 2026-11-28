import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ItemsView, toItemInput, validateItem, emptyItemValues } from "@/components/cost-items";
import { getDataLayer, openDatabase } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";

const C = MESSAGES.costItems;

beforeEach(async () => {
  const db = openDatabase();
  await Promise.all(db.tables.map((table) => table.clear()));
  db.close();
});
afterEach(() => cleanup());

const repo = () => getDataLayer().costItems;
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const pressSave = () => fireEvent.click(screen.getByRole("button", { name: C.save }));

async function renderView() {
  render(<ItemsView />);
  await waitFor(() => expect(screen.queryByText(C.loading)).not.toBeInTheDocument());
}

async function openAdd() {
  fireEvent.click(screen.getAllByRole("button", { name: C.addItem })[0]);
  return screen.findByRole("dialog");
}

describe("packaging and items form model", () => {
  const ctx = { items: [{ id: "a", name: "Demo Label" }], editingId: null };
  const values = (extra = {}) => ({ ...emptyItemValues(), name: "Demo Box", price: "18", ...extra });

  it("turns pesos into whole centavos and sends the trimmed fields", () => {
    expect(toItemInput(values({ price: "6.75", notes: "note" }))).toEqual({
      name: "Demo Box",
      unitCentavos: 675,
      notes: "note",
    });
  });

  it("checks name, price and notes", () => {
    expect(validateItem(values(), ctx)).toEqual({});
    expect(validateItem(values({ name: "  " }), ctx).name).toBe(C.nameRequired);
    expect(validateItem(values({ name: "x".repeat(61) }), ctx).name).toBe(C.nameTooLong);
    expect(validateItem(values({ name: " demo LABEL " }), ctx).name).toBe(C.nameDuplicate);
    expect(validateItem(values({ name: "demo label" }), { ...ctx, editingId: "a" })).toEqual({});
    expect(validateItem(values({ price: "" }), ctx).price).toBe(C.priceRequired);
    expect(validateItem(values({ price: "x" }), ctx).price).toBe(C.priceInvalid);
    expect(validateItem(values({ price: "-1" }), ctx).price).toBe(C.priceInvalid);
    expect(validateItem(values({ price: "1.999" }), ctx).price).toBe(C.priceDecimals);
    expect(validateItem(values({ price: "10000000.01" }), ctx).price).toBe(C.priceRange);
    expect(validateItem(values({ price: "0" }), ctx)).toEqual({});
    expect(validateItem(values({ notes: "n".repeat(2001) }), ctx).notes).toBe(C.notesTooLong);
  });
});

describe("packaging and items page", () => {
  it("shows an empty state with an add action", async () => {
    await renderView();
    expect(screen.getByRole("heading", { name: C.title })).toBeInTheDocument();
    expect(await screen.findByText(C.empty.title)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: C.empty.action })[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("adds an item and lists it with its price each", async () => {
    await renderView();
    await openAdd();
    fireEvent.change(field(C.nameLabel), { target: { value: "  Demo Label  " } });
    fireEvent.change(field(C.priceLabel), { target: { value: "6.75" } });
    fireEvent.change(field(C.notesLabel), { target: { value: "Fictional" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const row = (await screen.findByRole("heading", { name: "Demo Label" })).closest("li") as HTMLElement;
    expect(within(row).getByTestId("item-price")).toHaveTextContent("₱6.75 each");
    const [saved] = await repo().list();
    expect(saved).toMatchObject({ name: "Demo Label", unitCentavos: 675, notes: "Fictional" });
  });

  it("shows field errors, focuses the first and saves nothing", async () => {
    await renderView();
    await openAdd();
    pressSave();
    const name = field(C.nameLabel);
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    expect(name).toHaveFocus();
    expect(screen.getByText(C.nameRequired)).toBeInTheDocument();
    expect(screen.getByText(C.priceRequired)).toBeInTheDocument();
    expect(field(C.priceLabel)).toHaveAttribute("aria-invalid", "true");
    expect(await repo().list({ includeArchived: true })).toEqual([]);
  });

  it("shows a duplicate name as a field error, including an archived item", async () => {
    const existing = await repo().create({ name: "Demo Box", unitCentavos: 1800 });
    await repo().setArchived(existing.id, true);
    await renderView();
    await openAdd();
    fireEvent.change(field(C.nameLabel), { target: { value: "demo box" } });
    fireEvent.change(field(C.priceLabel), { target: { value: "5" } });
    pressSave();
    await waitFor(() => expect(field(C.nameLabel)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText(C.nameDuplicate)).toBeInTheDocument();
    expect(await repo().list({ includeArchived: true })).toHaveLength(1);
  });

  it("shows the data layer's duplicate refusal as a name field error", async () => {
    await renderView();
    await openAdd();
    // The list the form saw did not have this name yet: another tab added it first.
    await repo().create({ name: "Demo Tag", unitCentavos: 100 });
    fireEvent.change(field(C.nameLabel), { target: { value: "Demo Tag" } });
    fireEvent.change(field(C.priceLabel), { target: { value: "1" } });
    pressSave();
    await waitFor(() => expect(field(C.nameLabel)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText(C.nameDuplicate)).toBeInTheDocument();
  });

  it("edits an item", async () => {
    await repo().create({ name: "Demo Box", unitCentavos: 1800 });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: C.editLabel("Demo Box") }));
    await screen.findByRole("dialog");
    expect(field(C.priceLabel).value).toBe("18.00");
    fireEvent.change(field(C.priceLabel), { target: { value: "19.5" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [saved] = await repo().list();
    expect(saved.unitCentavos).toBe(1950);
  });

  it("archives, hides and unarchives with Show archived", async () => {
    await repo().create({ name: "Demo Box", unitCentavos: 1800 });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: C.archiveLabel("Demo Box") }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Demo Box" })).not.toBeInTheDocument());
    expect(await screen.findByText(C.allArchived)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(C.showArchived));
    expect(await screen.findByRole("heading", { name: "Demo Box" })).toBeInTheDocument();
    expect(screen.getByText(C.archivedTag)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: C.unarchiveLabel("Demo Box") }));
    await waitFor(() => expect(screen.queryByText(C.archivedTag)).not.toBeInTheDocument());
    const [saved] = await repo().list();
    expect(saved.archivedAt).toBeNull();
  });

  it("deletes after a confirmation", async () => {
    await repo().create({ name: "Demo Box", unitCentavos: 1800 });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: C.deleteLabel("Demo Box") }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(C.deleteBody("Demo Box", 0))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: C.deleteConfirm }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await repo().list({ includeArchived: true })).toEqual([]);
  });

  it("says how many cost sheets keep their own copy", () => {
    expect(C.deleteBody("Demo Box", 1)).toContain("1 cost sheet will keep its own copy");
    expect(C.deleteBody("Demo Box", 3)).toContain("3 cost sheets will keep their own copy");
  });
});
