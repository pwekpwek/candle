import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MaterialsView } from "@/components/materials";
import { getDataLayer, openDatabase } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { MaterialType } from "@/lib/types";
import { seedFormula } from "../db/harness";

const M = MESSAGES.materials;
const V01 = "Use numbers only, with a period for decimals (for example 462.5). No commas.";

beforeEach(async () => {
  // The components use the singleton on the default database: start each test empty.
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.meta.clear(),
  ]);
  db.close();
});

afterEach(() => cleanup());

const repo = () => getDataLayer().materials;

function seed(type: MaterialType, name: string, extra: Record<string, unknown> = {}) {
  return repo().create({ type, name, ...extra });
}

async function renderLibrary() {
  render(<MaterialsView />);
  await waitFor(() => expect(screen.queryByText(M.loading)).not.toBeInTheDocument());
}

function nameField() {
  return screen.getByLabelText(M.nameLabel) as HTMLInputElement;
}

function pressSave() {
  fireEvent.click(screen.getByRole("button", { name: M.save }));
}

async function openRow(name: string) {
  fireEvent.click(await screen.findByRole("button", { name }));
  return screen.findByRole("dialog");
}

describe("library page", () => {
  it("shows the empty state with an Add material action", async () => {
    await renderLibrary();
    expect(screen.getByRole("heading", { name: "Materials" })).toBeInTheDocument();
    expect(await screen.findByText(M.empty.title)).toBeInTheDocument();
    expect(screen.getByText(M.empty.description)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: M.empty.action }).length).toBeGreaterThan(0);
  });

  it("adds a material of each type with only a name", async () => {
    const types: [MaterialType, string][] = [
      ["wax", "Wax"],
      ["fragranceOil", "Oil"],
      ["wick", "Wick"],
      ["vessel", "Vessel"],
    ];
    await renderLibrary();
    for (const [type, tag] of types) {
      fireEvent.click(screen.getAllByRole("button", { name: M.addMaterial })[0]);
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: M.addTitleGeneric })).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("radio", { name: tag }));
      fireEvent.change(nameField(), { target: { value: `  Test ${type}  ` } });
      pressSave();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(await screen.findByRole("button", { name: `Test ${type}` })).toBeInTheDocument();
    }
    const saved = await repo().list();
    expect(saved.map((m) => [m.type, m.name]).sort()).toEqual(
      types.map(([type]) => [type, `Test ${type}`]).sort(),
    );
    expect(await screen.findByText(M.addedDone, { exact: false })).toBeInTheDocument();
  });

  it("round-trips optional fields, including clearing one", async () => {
    await seed("wax", "Soy 464", {
      supplier: "Acme",
      notes: "Good throw",
      wax: { maxFragranceBp: 1050, maxFragranceBasis: "total" },
    });
    await renderLibrary();
    await openRow("Soy 464");
    expect(screen.getByRole("heading", { name: M.editTitle["wax"] })).toBeInTheDocument();
    expect(nameField().value).toBe("Soy 464");
    expect((screen.getByLabelText(M.supplierLabel) as HTMLInputElement).value).toBe("Acme");
    expect((screen.getByLabelText(M.supplierMaxLabel) as HTMLInputElement).value).toBe("10.5");
    expect((screen.getByLabelText(M.basisLabel) as HTMLSelectElement).value).toBe("total");
    expect((screen.getByLabelText(M.notesLabel) as HTMLTextAreaElement).value).toBe("Good throw");

    fireEvent.change(screen.getByLabelText(M.supplierLabel), { target: { value: "" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const [wax] = await repo().list();
    expect(wax.supplier).toBeUndefined();
    expect(wax.notes).toBe("Good throw");
    expect(wax.wax).toEqual({ maxFragranceBp: 1050, maxFragranceBasis: "total" });
  });

  it("keeps vessel and wick details through an edit", async () => {
    await seed("vessel", "Tin 180", { vessel: { capacityMl: 240, defaultFillMg: 180500 } });
    await seed("wick", "CD 10", { wick: { size: "CD-10" } });
    await renderLibrary();

    await openRow("Tin 180");
    expect((screen.getByLabelText(M.capacityLabel) as HTMLInputElement).value).toBe("240");
    expect((screen.getByLabelText(M.defaultFillLabel) as HTMLInputElement).value).toBe("180.5");
    fireEvent.change(nameField(), { target: { value: "Tin 200" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await openRow("CD 10");
    expect((screen.getByLabelText(M.wickSizeLabel) as HTMLInputElement).value).toBe("CD-10");
    fireEvent.click(screen.getByRole("button", { name: M.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const all = await repo().list();
    expect(all.find((m) => m.type === "vessel")).toMatchObject({
      name: "Tin 200",
      vessel: { capacityMl: 240, defaultFillMg: 180500 },
    });
    expect(all.find((m) => m.type === "wick")?.wick).toEqual({ size: "CD-10" });
  });

  it("refuses a missing name and focuses it, saving nothing", async () => {
    await renderLibrary();
    fireEvent.click(screen.getAllByRole("button", { name: M.addMaterial })[0]);
    await screen.findByRole("dialog");
    pressSave();
    const input = nameField();
    expect(await screen.findByText(M.nameRequired)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(await repo().list({ includeArchived: true })).toHaveLength(0);
  });

  it("shows V-01 for a badly formatted number and focuses that field", async () => {
    await renderLibrary();
    fireEvent.click(screen.getAllByRole("button", { name: M.addMaterial })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Vessel" }));
    fireEvent.change(nameField(), { target: { value: "Jar" } });
    const fill = screen.getByLabelText(M.defaultFillLabel);
    fireEvent.change(fill, { target: { value: "1,5" } });
    pressSave();
    expect(await screen.findByText(V01)).toBeInTheDocument();
    expect(document.activeElement).toBe(fill);
    expect(await repo().list()).toHaveLength(0);

    // The error clears on the next valid keystroke (FLOW-06).
    fireEvent.change(fill, { target: { value: "150" } });
    expect(screen.queryByText(V01)).not.toBeInTheDocument();
  });

  it("validates a wax maximum on blur", async () => {
    await renderLibrary();
    fireEvent.click(screen.getAllByRole("button", { name: M.addMaterial })[0]);
    await screen.findByRole("dialog");
    const percent = screen.getByLabelText(M.supplierMaxLabel);
    fireEvent.change(percent, { target: { value: "60" } });
    fireEvent.blur(percent);
    expect(await screen.findByText(M.maxFragranceInvalid)).toBeInTheDocument();
  });

  it("edits a material and updates the list", async () => {
    await seed("fragranceOil", "Lavender", { supplier: "Acme" });
    await renderLibrary();
    await openRow("Lavender");
    fireEvent.change(nameField(), { target: { value: "Lavender 40" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Lavender 40" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lavender" })).not.toBeInTheDocument();
    expect((await repo().list())[0].supplier).toBe("Acme");
  });

  it("archives, hides, shows with a tag on request, and unarchives", async () => {
    await seed("wick", "CD 10");
    await seed("wick", "CD 12");
    await renderLibrary();

    await openRow("CD 10");
    fireEvent.click(screen.getByRole("button", { name: M.archive }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "CD 10" })).not.toBeInTheDocument();
    expect(await screen.findByText(M.archivedDone, { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(M.showArchived));
    expect(await screen.findByRole("button", { name: "CD 10" })).toBeInTheDocument();
    expect(screen.getByText(M.archivedTag)).toBeInTheDocument();

    await openRow("CD 10");
    fireEvent.click(screen.getByRole("button", { name: M.unarchive }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(M.showArchived));
    expect(await screen.findByRole("button", { name: "CD 10" })).toBeInTheDocument();
    expect(screen.queryByText(M.archivedTag)).not.toBeInTheDocument();
    expect((await repo().list()).map((m) => m.name)).toEqual(["CD 10", "CD 12"]);
  });

  it("filters by type and offers to add when a type is empty", async () => {
    await seed("wax", "Soy 464");
    await seed("fragranceOil", "Lavender");
    await renderLibrary();

    fireEvent.click(screen.getByRole("radio", { name: M.filterOils }));
    expect(await screen.findByRole("button", { name: "Lavender" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Soy 464" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: M.filterWicks }));
    expect(await screen.findByText(M.typeEmpty("wick"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: M.typeAdd("wick") }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: M.addTitle["wick"] })).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.change(nameField(), { target: { value: "CD 8" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((await repo().list({ type: "wick" })).map((m) => m.name)).toEqual(["CD 8"]);
  });

  it("shows how many formulas use each material", async () => {
    const wax = await seed("wax", "Soy 464");
    await seed("wax", "Palm");
    const db = openDatabase();
    await seedFormula(db, 2, { waxId: wax.id });
    await seedFormula(db, 1, { waxId: wax.id });
    db.close();
    await renderLibrary();

    const soy = (await screen.findByRole("button", { name: "Soy 464" })).closest('[role="row"]');
    const palm = screen.getByRole("button", { name: "Palm" }).closest('[role="row"]');
    expect(within(soy as HTMLElement).getByText(M.usedIn(2))).toBeInTheDocument();
    expect(within(palm as HTMLElement).getByText(M.usedIn(0))).toBeInTheDocument();
    expect(within(soy as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("explains archiving a material that saved formulas use", async () => {
    const wax = await seed("wax", "Soy 464");
    const db = openDatabase();
    await seedFormula(db, 1, { waxId: wax.id });
    await seedFormula(db, 1, { waxId: wax.id });
    await seedFormula(db, 1, { waxId: wax.id });
    db.close();
    await renderLibrary();

    const dialog = await openRow("Soy 464");
    expect(within(dialog).getByText(M.archiveUsedIn(3))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: M.archive }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText(M.archiveUsedIn(3), { exact: false })).toBeInTheDocument();
    expect((await repo().get(wax.id))?.archivedAt).not.toBeNull();
  });

  it("keeps the form open with a message when saving fails", async () => {
    await renderLibrary();
    fireEvent.click(screen.getAllByRole("button", { name: M.addMaterial })[0]);
    await screen.findByRole("dialog");
    fireEvent.change(nameField(), { target: { value: "Soy" } });
    const original = repo().create;
    repo().create = () => Promise.reject(new Error("disk full"));
    try {
      pressSave();
      expect(await screen.findByText(M.saveFailed)).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(nameField().value).toBe("Soy");
    } finally {
      repo().create = original;
    }
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await repo().list()).toHaveLength(1);
  });

  it("shows a retry when the library cannot be read", async () => {
    const original = repo().list;
    repo().list = () => Promise.reject(new Error("blocked"));
    try {
      render(<MaterialsView />);
      expect(await screen.findByText(M.loadFailedTitle)).toBeInTheDocument();
    } finally {
      repo().list = original;
    }
    fireEvent.click(screen.getByRole("button", { name: M.retry }));
    expect(await screen.findByText(M.empty.title)).toBeInTheDocument();
  });
});
