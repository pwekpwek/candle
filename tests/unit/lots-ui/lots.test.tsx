import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LotsView } from "@/components/lots";
import { MaterialsView } from "@/components/materials";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { batchUsingLot, clearDatabase, waitLoaded } from "./helpers";

const L = MESSAGES.lots;

beforeEach(clearDatabase);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const layer = () => getDataLayer();

async function renderView(initialMaterialId: string | null = null) {
  render(<LotsView initialMaterialId={initialMaterialId} />);
  await waitLoaded(L.loading);
}

function pressSave() {
  fireEvent.click(screen.getByRole("button", { name: L.save }));
}

async function openAdd() {
  fireEvent.click(screen.getAllByRole("button", { name: L.addLot })[0]);
  return screen.findByRole("dialog");
}

function field(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

async function seed() {
  const wax = await layer().materials.create({ type: "wax", name: "Example Wax" });
  const oil = await layer().materials.create({ type: "fragranceOil", name: "Example Oil" });
  const supplier = await layer().suppliers.create({ name: "Example Supplier Co" });
  return { wax, oil, supplier };
}

describe("lots page", () => {
  it("shows the empty state with an add action", async () => {
    await renderView();
    expect(screen.getByRole("heading", { name: L.title })).toBeInTheDocument();
    expect(await screen.findByText(L.empty.title)).toBeInTheDocument();
    expect(screen.getByText(L.empty.description)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: L.empty.action })[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("tells the maker to add a material first when the library is empty", async () => {
    await renderView();
    await openAdd();
    expect(screen.getByText(L.noMaterials)).toBeInTheDocument();
  });

  it("adds a lot with a supplier, a received date and notes, and lists it", async () => {
    const { wax, supplier } = await seed();
    await renderView();
    await openAdd();
    // Materials are grouped by type; only the types that have a material appear.
    const select = field(L.materialLabel) as unknown as HTMLSelectElement;
    expect(Array.from(select.querySelectorAll("optgroup")).map((g) => g.label)).toEqual(["Wax", "Oil"]);
    fireEvent.change(select, { target: { value: wax.id } });
    fireEvent.change(field(L.supplierLabel), { target: { value: supplier.id } });
    fireEvent.change(field(L.codeLabel), { target: { value: "  LOT-TEST-001  " } });
    fireEvent.change(field(L.receivedLabel), { target: { value: "2026-11-10" } });
    fireEvent.change(field(L.notesLabel), { target: { value: "Example notes" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const row = (await screen.findByRole("heading", { name: "LOT-TEST-001" })).closest("li") as HTMLElement;
    expect(within(row).getByText("Example Wax · Wax")).toBeInTheDocument();
    expect(within(row).getByText("Example Supplier Co")).toBeInTheDocument();
    expect(within(row).getByText(L.received("Nov 10, 2026"))).toBeInTheDocument();
    expect(within(row).getByText(L.usedIn(0))).toBeInTheDocument();
    expect(screen.getByText(L.addedDone, { exact: false })).toBeInTheDocument();
    const [saved] = await layer().materialLots.list();
    expect(saved).toMatchObject({
      materialId: wax.id,
      supplierId: supplier.id,
      code: "LOT-TEST-001",
      receivedOn: "2026-11-10",
      notes: "Example notes",
    });
  });

  it("saves a lot with no supplier and no received date, and says so in the list", async () => {
    const { wax } = await seed();
    await renderView();
    await openAdd();
    fireEvent.change(field(L.materialLabel), { target: { value: wax.id } });
    fireEvent.change(field(L.codeLabel), { target: { value: "LOT-TEST-002" } });
    pressSave();
    const row = (await screen.findByRole("heading", { name: "LOT-TEST-002" })).closest("li") as HTMLElement;
    expect(within(row).getByText(L.noSupplier)).toBeInTheDocument();
    expect(within(row).getByText(L.receivedUnknown)).toBeInTheDocument();
  });

  it("shows field errors for material, code, date and notes, and saves nothing", async () => {
    const { wax, supplier } = await seed();
    await layer().materialLots.create({ materialId: wax.id, supplierId: supplier.id, code: "LOT-TEST-001" });
    await renderView();
    await openAdd();

    pressSave();
    expect(await screen.findByText(L.materialRequired)).toBeInTheDocument();
    expect(screen.getByText(L.codeRequired)).toBeInTheDocument();
    expect(field(L.codeLabel)).toHaveAttribute("aria-invalid", "true");
    expect(field(L.codeLabel).getAttribute("aria-describedby")).toBeTruthy();

    fireEvent.change(field(L.materialLabel), { target: { value: wax.id } });
    fireEvent.change(field(L.supplierLabel), { target: { value: supplier.id } });
    fireEvent.change(field(L.codeLabel), { target: { value: "c".repeat(61) } });
    fireEvent.blur(field(L.codeLabel));
    expect(await screen.findByText(L.codeTooLong)).toBeInTheDocument();

    fireEvent.change(field(L.codeLabel), { target: { value: " lot-test-001 " } });
    fireEvent.blur(field(L.codeLabel));
    expect(await screen.findByText(L.codeDuplicate)).toBeInTheDocument();

    // The same code with no supplier is a different lot.
    fireEvent.change(field(L.supplierLabel), { target: { value: "" } });
    expect(screen.queryByText(L.codeDuplicate)).not.toBeInTheDocument();
    fireEvent.change(field(L.supplierLabel), { target: { value: supplier.id } });

    const future = new Date();
    future.setDate(future.getDate() + 2);
    const text = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    fireEvent.change(field(L.receivedLabel), { target: { value: text } });
    fireEvent.blur(field(L.receivedLabel));
    expect(await screen.findByText(L.receivedFuture)).toBeInTheDocument();

    fireEvent.change(field(L.notesLabel), { target: { value: "n".repeat(2001) } });
    fireEvent.blur(field(L.notesLabel));
    expect(await screen.findByText(L.notesTooLong)).toBeInTheDocument();

    pressSave();
    await waitFor(() => expect(screen.getByText(L.fixFirst)).toBeInTheDocument());
    expect(await layer().materialLots.list()).toHaveLength(1);
  });

  it("shows the material read-only when editing, and saves the other fields", async () => {
    const { wax, supplier } = await seed();
    await layer().materialLots.create({ materialId: wax.id, supplierId: supplier.id, code: "LOT-TEST-001" });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: L.editLabel("LOT-TEST-001") }));
    await screen.findByRole("dialog");
    const material = field(L.materialLabel);
    expect(material.tagName).toBe("INPUT");
    expect(material).toHaveAttribute("readonly");
    expect(material.value).toBe("Example Wax (Wax)");
    expect(screen.getByText(L.materialFixedHint)).toBeInTheDocument();
    expect(field(L.codeLabel).value).toBe("LOT-TEST-001");

    fireEvent.change(field(L.codeLabel), { target: { value: "LOT-TEST-001B" } });
    fireEvent.change(field(L.supplierLabel), { target: { value: "" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "LOT-TEST-001B" })).toBeInTheDocument();
    const [saved] = await layer().materialLots.list();
    expect(saved.materialId).toBe(wax.id);
    expect(saved.supplierId).toBeNull();
    expect(screen.getByText(L.savedDone, { exact: false })).toBeInTheDocument();
  });

  it("keeps an archived supplier selectable on the lot that has it, and hides it elsewhere", async () => {
    const { wax, supplier } = await seed();
    const other = await layer().suppliers.create({ name: "Hidden Example Co" });
    await layer().materialLots.create({ materialId: wax.id, supplierId: supplier.id, code: "LOT-TEST-001" });
    await layer().suppliers.setArchived(supplier.id, true);
    await layer().suppliers.setArchived(other.id, true);
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: L.editLabel("LOT-TEST-001") }));
    await screen.findByRole("dialog");
    const options = Array.from((field(L.supplierLabel) as unknown as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual([L.noSupplier, L.supplierArchivedOption("Example Supplier Co")]);
    expect((field(L.supplierLabel) as unknown as HTMLSelectElement).value).toBe(supplier.id);
  });

  it("archives and unarchives, hiding archived lots until asked", async () => {
    const { wax } = await seed();
    await layer().materialLots.create({ materialId: wax.id, supplierId: null, code: "LOT-TEST-001" });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: L.archiveLabel("LOT-TEST-001") }));
    expect(await screen.findByText(L.archivedDone, { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(L.allArchived)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(L.showArchived));
    const row = await screen.findByTestId("lot-row");
    expect(within(row).getByText(L.archivedTag)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: L.unarchiveLabel("LOT-TEST-001") }));
    expect(await screen.findByText(L.unarchivedDone, { exact: false })).toBeInTheDocument();
    await waitFor(async () => expect(await layer().materialLots.list()).toHaveLength(1));
  });

  it("deletes an unused lot only after confirmation", async () => {
    const { wax } = await seed();
    await layer().materialLots.create({ materialId: wax.id, supplierId: null, code: "LOT-TEST-001" });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: L.deleteLabel("LOT-TEST-001") }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(L.deleteBody("LOT-TEST-001"))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: L.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await layer().materialLots.list()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: L.deleteLabel("LOT-TEST-001") }));
    fireEvent.click(await screen.findByRole("button", { name: L.deleteConfirm }));
    await waitFor(() => expect(screen.queryByTestId("lot-row")).not.toBeInTheDocument());
    expect(await layer().materialLots.list({ includeArchived: true })).toHaveLength(0);
  });

  it("offers no Delete for a lot a batch uses, and shows how many batches use it", async () => {
    await batchUsingLot(async (lib) => {
      const lot = await layer().materialLots.create({
        materialId: lib.waxId,
        supplierId: null,
        code: "LOT-TEST-001",
      });
      return lot.id;
    });
    await layer().materialLots.create({ materialId: (await layer().materials.list())[0].id, supplierId: null, code: "LOT-TEST-099" });
    await renderView();
    const used = (await screen.findByRole("heading", { name: "LOT-TEST-001" })).closest("li") as HTMLElement;
    expect(within(used).getByText(L.usedIn(1))).toBeInTheDocument();
    expect(within(used).queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(within(used).getByText(L.usedHint)).toBeInTheDocument();
    expect(within(used).getByRole("button", { name: L.archiveLabel("LOT-TEST-001") })).toBeInTheDocument();
  });

  it("filters by material, preselects it from ?material=, and preselects it on Add", async () => {
    const { wax, oil } = await seed();
    await layer().materialLots.create({ materialId: wax.id, supplierId: null, code: "WAX-LOT-1" });
    await layer().materialLots.create({ materialId: oil.id, supplierId: null, code: "OIL-LOT-1" });
    await renderView(oil.id);
    expect(await screen.findByRole("heading", { name: "OIL-LOT-1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "WAX-LOT-1" })).not.toBeInTheDocument();
    expect(field(L.filterMaterialLabel).value).toBe(oil.id);

    await openAdd();
    expect(field(L.materialLabel).value).toBe(oil.id);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: L.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.change(field(L.filterMaterialLabel), { target: { value: "" } });
    expect(await screen.findByRole("heading", { name: "WAX-LOT-1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "OIL-LOT-1" })).toBeInTheDocument();
  });

  it("treats an unknown ?material= value as all materials", async () => {
    const { wax } = await seed();
    await layer().materialLots.create({ materialId: wax.id, supplierId: null, code: "WAX-LOT-1" });
    await renderView("not-a-material");
    expect(await screen.findByRole("heading", { name: "WAX-LOT-1" })).toBeInTheDocument();
    expect(field(L.filterMaterialLabel).value).toBe("");
  });

  it("says when a filtered material has no lots yet", async () => {
    const { wax, oil } = await seed();
    await layer().materialLots.create({ materialId: wax.id, supplierId: null, code: "WAX-LOT-1" });
    await renderView(oil.id);
    expect(await screen.findByText(L.materialEmpty("Example Oil"))).toBeInTheDocument();
  });
});

describe("materials page links", () => {
  it("links to Lots and Suppliers and shows each material's lot count", async () => {
    const { wax, oil } = await seed();
    await layer().materialLots.create({ materialId: wax.id, supplierId: null, code: "WAX-LOT-1" });
    await layer().materialLots.create({ materialId: wax.id, supplierId: null, code: "WAX-LOT-2" });
    render(<MaterialsView />);
    await waitLoaded(MESSAGES.materials.loading);

    expect(await screen.findByRole("link", { name: L.title })).toHaveAttribute("href", "/materials/lots");
    expect(screen.getByRole("link", { name: MESSAGES.suppliers.title })).toHaveAttribute(
      "href",
      "/materials/suppliers",
    );
    const countLink = await screen.findByRole("link", { name: L.lotCount(2) });
    expect(countLink).toHaveAttribute("href", `/materials/lots?material=${wax.id}`);
    expect(screen.queryByRole("link", { name: L.lotCount(0) })).not.toBeInTheDocument();
    expect(oil.id).toBeTruthy();
  });
});
