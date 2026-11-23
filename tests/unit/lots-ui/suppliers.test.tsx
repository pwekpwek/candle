import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SuppliersView } from "@/components/lots";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { batchUsingLot, clearDatabase, waitLoaded } from "./helpers";

const S = MESSAGES.suppliers;

beforeEach(clearDatabase);
afterEach(() => cleanup());

const repo = () => getDataLayer().suppliers;

async function renderView() {
  render(<SuppliersView />);
  await waitLoaded(S.loading);
}

function pressSave() {
  fireEvent.click(screen.getByRole("button", { name: S.save }));
}

describe("suppliers page", () => {
  it("shows the empty state with an add action", async () => {
    await renderView();
    expect(screen.getByRole("heading", { name: S.title })).toBeInTheDocument();
    expect(await screen.findByText(S.empty.title)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: S.empty.action })[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("adds a supplier with a name and notes", async () => {
    await renderView();
    fireEvent.click(screen.getAllByRole("button", { name: S.addSupplier })[0]);
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(S.nameLabel), { target: { value: "  Example Supplier Co  " } });
    fireEvent.change(screen.getByLabelText(S.notesLabel), { target: { value: "orders@example.test" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "Example Supplier Co" })).toBeInTheDocument();
    expect(screen.getByText("orders@example.test")).toBeInTheDocument();
    expect(screen.getByText(S.addedDone, { exact: false })).toBeInTheDocument();
    const [saved] = await repo().list();
    expect(saved.name).toBe("Example Supplier Co");
    expect(saved.notes).toBe("orders@example.test");
  });

  it("edits a supplier", async () => {
    await repo().create({ name: "Example Supplier Co" });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: S.editLabel("Example Supplier Co") }));
    await screen.findByRole("dialog");
    expect((screen.getByLabelText(S.nameLabel) as HTMLInputElement).value).toBe("Example Supplier Co");
    fireEvent.change(screen.getByLabelText(S.nameLabel), { target: { value: "Example Supplier Ltd" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "Example Supplier Ltd" })).toBeInTheDocument();
    expect(screen.getByText(S.savedDone, { exact: false })).toBeInTheDocument();
  });

  it("shows field errors for a missing, too long and duplicate name, and saves nothing", async () => {
    await repo().create({ name: "Example Supplier Co" });
    await renderView();
    fireEvent.click(screen.getAllByRole("button", { name: S.addSupplier })[0]);
    await screen.findByRole("dialog");
    const name = screen.getByLabelText(S.nameLabel);

    pressSave();
    expect(await screen.findByText(S.nameRequired)).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name.getAttribute("aria-describedby")).toBeTruthy();

    fireEvent.change(name, { target: { value: "x".repeat(81) } });
    fireEvent.blur(name);
    expect(await screen.findByText(S.nameTooLong)).toBeInTheDocument();

    fireEvent.change(name, { target: { value: " example SUPPLIER co " } });
    fireEvent.blur(name);
    expect(await screen.findByText(S.nameDuplicate)).toBeInTheDocument();
    pressSave();
    expect(await screen.findByText(S.nameDuplicate)).toBeInTheDocument();
    expect(await repo().list()).toHaveLength(1);

    fireEvent.change(name, { target: { value: "Another Example Co" } });
    expect(screen.queryByText(S.nameDuplicate)).not.toBeInTheDocument();
  });

  it("counts a duplicate among archived suppliers", async () => {
    const hidden = await repo().create({ name: "Archived Example Co" });
    await repo().setArchived(hidden.id, true);
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: S.addSupplier }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(S.nameLabel), { target: { value: "archived example co" } });
    fireEvent.blur(screen.getByLabelText(S.nameLabel));
    expect(await screen.findByText(S.nameDuplicate)).toBeInTheDocument();
  });

  it("archives and unarchives, hiding archived suppliers until asked", async () => {
    await repo().create({ name: "Example Supplier Co" });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: S.archiveLabel("Example Supplier Co") }));
    expect(await screen.findByText(S.archivedDone, { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(S.allArchived)).toBeInTheDocument());
    expect((await repo().list({ includeArchived: true }))[0].archivedAt).not.toBeNull();

    fireEvent.click(screen.getByLabelText(S.showArchived));
    const row = await screen.findByTestId("supplier-row");
    expect(within(row).getByText(S.archivedTag)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: S.unarchiveLabel("Example Supplier Co") }));
    expect(await screen.findByText(S.unarchivedDone, { exact: false })).toBeInTheDocument();
    await waitFor(async () => expect((await repo().list())).toHaveLength(1));
  });

  it("deletes an unused supplier only after confirmation", async () => {
    await repo().create({ name: "Example Supplier Co" });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: S.deleteLabel("Example Supplier Co") }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(S.deleteBody("Example Supplier Co"))).toBeInTheDocument();
    expect(await repo().list()).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole("button", { name: S.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await repo().list()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: S.deleteLabel("Example Supplier Co") }));
    fireEvent.click(await screen.findByRole("button", { name: S.deleteConfirm }));
    await waitFor(() => expect(screen.queryByTestId("supplier-row")).not.toBeInTheDocument());
    expect(await repo().list({ includeArchived: true })).toHaveLength(0);
    expect(await screen.findByText(S.deletedDone, { exact: false })).toBeInTheDocument();
  });

  it("shows lot counts and offers no Delete for a supplier that lots use", async () => {
    const used = await repo().create({ name: "Used Example Co" });
    await repo().create({ name: "Unused Example Co" });
    const layer = getDataLayer();
    const wax = await layer.materials.create({ type: "wax", name: "Example Wax" });
    await layer.materialLots.create({ materialId: wax.id, supplierId: used.id, code: "LOT-TEST-001" });
    await layer.materialLots.create({ materialId: wax.id, supplierId: used.id, code: "LOT-TEST-002" });
    await renderView();

    const usedRow = (await screen.findByRole("heading", { name: "Used Example Co" })).closest("li") as HTMLElement;
    const unusedRow = screen.getByRole("heading", { name: "Unused Example Co" }).closest("li") as HTMLElement;
    expect(within(usedRow).getByText(S.lotCount(2))).toBeInTheDocument();
    expect(within(usedRow).queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(within(usedRow).getByText(S.usedHint)).toBeInTheDocument();
    expect(within(unusedRow).getByText(S.lotCount(0))).toBeInTheDocument();
    expect(within(unusedRow).getByRole("button", { name: S.deleteLabel("Unused Example Co") })).toBeInTheDocument();
  });

  it("offers no Delete for a supplier named on a batch, even when the lot is gone from view", async () => {
    let supplierId = "";
    await batchUsingLot(async (lib) => {
      const supplier = await repo().create({ name: "Batch Example Co" });
      supplierId = supplier.id;
      const lot = await getDataLayer().materialLots.create({
        materialId: lib.waxId,
        supplierId,
        code: "LOT-TEST-001",
      });
      return lot.id;
    });
    await renderView();
    const row = (await screen.findByRole("heading", { name: "Batch Example Co" })).closest("li") as HTMLElement;
    expect(within(row).queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(within(row).getByText(S.batchCount(1))).toBeInTheDocument();
  });
});
