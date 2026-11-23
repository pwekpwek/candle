import { test, expect, type Page } from "@playwright/test";
import { MESSAGES } from "@/lib/messages";
import { addCurePlan, batchLabel, fmt, iso, openBatch, openCreateForm } from "./helpers-schedule";
import {
  expectNoVerdicts,
  createSession,
  createWick,
  parseCsv,
  readText,
} from "./helpers-burn";
import {
  FILTER_LABELS,
  SLOW,
  SUPPLIER_A,
  SUPPLIER_B,
  batchRows,
  buildSecondFormula,
  buildWE5WithWick,
  clearBatchLot,
  clearFiltersButton,
  createLot,
  createLotBatch,
  createSupplier,
  expectCount,
  expectDone,
  exportCsvButton,
  filterField,
  fillLot,
  listedBatchTitles,
  lotDetailRow,
  lotDetailRows,
  lotEditor,
  lotOptionTexts,
  lotPicker,
  lotRow,
  lotRows,
  openAddLot,
  openAddSupplier,
  openBatches,
  openLots,
  setDateFilter,
  setSelectFilter,
  openSuppliers,
  saveBatchChanges,
  search,
  searchBox,
  setBatchLot,
  supplierEditor,
  supplierRow,
  supplierRows,
  todayStamp,
  visible,
  waitForHeading,
} from "./helpers-lots";
import { WE5 } from "./helpers-flow";

test.use({ viewport: { width: 1280, height: 800 } });

const S = MESSAGES.suppliers;
const L = MESSAGES.lots;
const B = MESSAGES.batches;
const T = MESSAGES.batchTrace;
const WICK = "Example Wick 1";


// ------------------------------------------------------------ suppliers

test("suppliers: add, edit, field errors, archive and delete; a supplier a lot uses cannot be deleted", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await createWick(page, WICK);

  // Add, with save feedback.
  await createSupplier(page, SUPPLIER_A, "Orders by phone, ask for the example desk.");
  await expectDone(page, "Added.");
  const rowA = supplierRow(page, SUPPLIER_A);
  await expect(rowA).toBeVisible({ timeout: SLOW });
  await expect(rowA).toContainText("Orders by phone, ask for the example desk.");
  await expect(rowA).toContainText("0 lots");
  await expectNoVerdicts(page, "suppliers page");

  // An empty name is a field error and nothing is saved.
  await openAddSupplier(page);
  await supplierEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(supplierEditor(page).getByText(S.nameRequired)).toBeVisible();
  await expect(supplierEditor(page).getByText(S.fixFirst)).toBeVisible();
  await expect(supplierEditor(page).getByLabel("Name", { exact: true })).toBeFocused();

  // A duplicate name (trimmed, any case) is a field error too.
  await supplierEditor(page).getByLabel("Name", { exact: true }).fill("  example WAX co ");
  await supplierEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(supplierEditor(page).getByText(S.nameDuplicate)).toBeVisible();
  await expect(supplierRows(page)).toHaveCount(1);
  // The error clears on the next valid keystroke.
  await supplierEditor(page).getByLabel("Name", { exact: true }).fill(SUPPLIER_B);
  await expect(supplierEditor(page).getByText(S.nameDuplicate)).toHaveCount(0);
  await supplierEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Added.");
  await expect(supplierRows(page)).toHaveCount(2);

  // Edit: rename keeps the notes.
  await page.getByRole("button", { name: `Edit supplier ${SUPPLIER_A}`, exact: true }).click();
  const sheet = supplierEditor(page);
  await expect(sheet.getByLabel("Name", { exact: true })).toHaveValue(SUPPLIER_A);
  await expect(sheet.getByLabel("Contact notes (optional)")).toHaveValue(
    "Orders by phone, ask for the example desk.",
  );
  await sheet.getByLabel("Name", { exact: true }).fill("Example Wax Company");
  // Renaming to the other supplier's name is refused; the supplier's own name is fine.
  await sheet.getByLabel("Name", { exact: true }).fill(SUPPLIER_B);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByText(S.nameDuplicate)).toBeVisible();
  await sheet.getByLabel("Name", { exact: true }).fill("Example Wax Company");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Saved.");
  await expect(supplierRow(page, "Example Wax Company")).toContainText("Orders by phone");
  await expect(supplierRow(page, SUPPLIER_A)).toHaveCount(0);

  // Archive hides it; Show archived brings it back; Unarchive restores it.
  await page
    .getByRole("button", { name: "Archive supplier Example Wax Company", exact: true })
    .click();
  await expectDone(page, "Archived.");
  await expect(supplierRow(page, "Example Wax Company")).toHaveCount(0);
  await page.getByLabel(S.showArchived).check();
  const archivedRow = supplierRow(page, "Example Wax Company");
  await expect(archivedRow).toContainText(S.archivedTag);
  await page
    .getByRole("button", { name: "Unarchive supplier Example Wax Company", exact: true })
    .click();
  await expectDone(page, "Unarchived.");
  await expect(archivedRow).not.toContainText(S.archivedTag);
  await page.getByLabel(S.showArchived).uncheck();
  await expect(supplierRow(page, "Example Wax Company")).toBeVisible();

  // Delete an unused supplier, after confirmation (Cancel keeps it).
  await page.getByRole("button", { name: `Delete supplier ${SUPPLIER_B}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(S.deleteTitle)).toBeVisible();
  await expect(dialog).toContainText(S.deleteBody(SUPPLIER_B));
  await dialog.getByRole("button", { name: S.cancel, exact: true }).click();
  await expect(supplierRow(page, SUPPLIER_B)).toBeVisible();
  await page.getByRole("button", { name: `Delete supplier ${SUPPLIER_B}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: S.deleteConfirm, exact: true }).click();
  await expectDone(page, "Deleted.");
  await expect(supplierRow(page, SUPPLIER_B)).toHaveCount(0);

  // A supplier a lot uses: no Delete, a hint instead, and its lot count.
  await createLot(page, { material: WICK, supplier: "Example Wax Company", code: "LOT-TEST-001" });
  await openSuppliers(page);
  const used = supplierRow(page, "Example Wax Company");
  await expect(used).toContainText("1 lot", { timeout: SLOW });
  await expect(used).toContainText(S.usedHint);
  await expect(
    page.getByRole("button", { name: "Delete supplier Example Wax Company", exact: true }),
  ).toHaveCount(0);
  // Archiving is still allowed.
  await expect(
    page.getByRole("button", { name: "Archive supplier Example Wax Company", exact: true }),
  ).toBeVisible();
});

// ------------------------------------------------------------ lots

test("lots: add, field errors, edit with a fixed material, archive, delete; /materials links to the lot list", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await buildWE5WithWick(page, WICK);
  const formulaUrl = page.url().split("?")[0];
  await createSupplier(page, SUPPLIER_A);
  await createSupplier(page, SUPPLIER_B);

  // Add with material, supplier, code and received date.
  const received = iso(-5);
  await openLots(page);
  await expectNoVerdicts(page, "lots page, empty");
  await openAddLot(page);
  await fillLot(page, {
    material: WICK,
    supplier: SUPPLIER_A,
    code: "LOT-TEST-001",
    receivedOn: received,
    notes: "Example notes for this lot.",
  });
  await lotEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Added.");
  const row = lotRow(page, "LOT-TEST-001");
  await expect(row).toContainText(`${WICK} · Wick`);
  await expect(row).toContainText(SUPPLIER_A);
  await expect(row).toContainText(L.received(fmt(received)));
  await expect(row).toContainText("Used in 0 batches");
  await expect(row).toContainText("Example notes for this lot.");

  // Field errors: empty form.
  await openAddLot(page);
  const sheet = lotEditor(page);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByText(L.materialRequired)).toBeVisible();
  await expect(sheet.getByText(L.codeRequired)).toBeVisible();
  await expect(sheet.getByText(L.fixFirst)).toBeVisible();
  // The first field with an error has focus.
  await expect(sheet.getByLabel("Material", { exact: true })).toBeFocused();

  // Duplicate code for the same material and supplier (trimmed, any case).
  await fillLot(page, { material: WICK, supplier: SUPPLIER_A, code: " lot-test-001 " });
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByText(L.codeDuplicate)).toBeVisible();
  await expect(lotRows(page)).toHaveCount(1);
  // The same code from another supplier is a different lot: the error goes away.
  await sheet.getByLabel("Supplier", { exact: true }).selectOption({ label: SUPPLIER_B });
  await expect(sheet.getByText(L.codeDuplicate)).toHaveCount(0);
  await sheet.getByLabel("Supplier", { exact: true }).selectOption({ label: SUPPLIER_A });

  // A future received date.
  await sheet.getByLabel("Received date (optional)").fill(iso(1));
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByText(L.receivedFuture)).toBeVisible();
  await expect(sheet.getByText(L.codeDuplicate)).toBeVisible();
  await expect(lotRows(page)).toHaveCount(1);

  // Fix both: another code, today as the received date. Saved.
  await sheet.getByLabel("Lot code", { exact: true }).fill("LOT-TEST-002");
  await sheet.getByLabel("Received date (optional)").fill(iso(0));
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Added.");
  await expect(lotRows(page)).toHaveCount(2);

  // A lot with no supplier and no date, for a wax.
  await openAddLot(page);
  await fillLot(page, { material: WE5.wax, code: "LOT-WAX-001" });
  await lotEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Added.");
  const waxRow = lotRow(page, "LOT-WAX-001");
  await expect(waxRow).toContainText(L.noSupplier);
  await expect(waxRow).toContainText(L.receivedUnknown);

  // Edit: the material is read only; code and notes change.
  await page.getByRole("button", { name: "Edit lot LOT-TEST-001", exact: true }).click();
  const edit = lotEditor(page);
  const material = edit.getByLabel("Material", { exact: true });
  await expect(material).toHaveValue(`${WICK} (Wick)`);
  await expect(material).not.toBeEditable();
  await expect(edit.getByText(L.materialFixedHint)).toBeVisible();
  await expect(edit.getByLabel("Lot code", { exact: true })).toHaveValue("LOT-TEST-001");
  await expect(edit.getByLabel("Supplier", { exact: true })).toHaveValue(/.+/);
  await edit.getByLabel("Lot code", { exact: true }).fill("LOT-TEST-001B");
  await edit.getByLabel("Notes (optional)").fill("Corrected code.");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Saved.");
  await expect(lotRow(page, "LOT-TEST-001B")).toContainText("Corrected code.");
  await expect(lotRow(page, "LOT-TEST-001")).toHaveCount(0);

  // Editing a lot's own code to itself is not a duplicate (the form checks "other" lots).
  await page.getByRole("button", { name: "Edit lot LOT-TEST-001B", exact: true }).click();
  await lotEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Saved.");

  // Archive hides a lot from the batch picker for new choices.
  await openBatchFormFor(page, formulaUrl);
  await expect.poll(() => lotOptionTexts(page, `wick ${WICK}`), { timeout: SLOW }).toHaveLength(2);
  const before = await lotOptionTexts(page, `wick ${WICK}`);
  expect(before.some((t) => t.startsWith("LOT-TEST-001B"))).toBe(true);
  expect(before.some((t) => t.startsWith("LOT-TEST-002"))).toBe(true);

  await openLots(page);
  await expect(lotRows(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Archive lot LOT-TEST-001B", exact: true }).click();
  await expectDone(page, "Archived.");
  await expect(lotRow(page, "LOT-TEST-001B")).toHaveCount(0);
  await page.getByLabel(L.showArchived).check();
  await expect(lotRow(page, "LOT-TEST-001B")).toContainText(L.archivedTag);

  await openBatchFormFor(page, formulaUrl);
  await expect.poll(() => lotOptionTexts(page, `wick ${WICK}`), { timeout: SLOW }).toHaveLength(1);
  const after = await lotOptionTexts(page, `wick ${WICK}`);
  expect(after[0]).toContain("LOT-TEST-002");

  // Unarchive brings it back.
  await openLots(page);
  await page.getByLabel(L.showArchived).check();
  await page.getByRole("button", { name: "Unarchive lot LOT-TEST-001B", exact: true }).click();
  await expectDone(page, "Unarchived.");
  await openBatchFormFor(page, formulaUrl);
  await expect.poll(() => lotOptionTexts(page, `wick ${WICK}`), { timeout: SLOW }).toHaveLength(2);

  // Delete an unused lot after confirmation (Cancel keeps it).
  await openLots(page);
  await page.getByRole("button", { name: "Delete lot LOT-TEST-002", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(L.deleteBody("LOT-TEST-002"));
  await dialog.getByRole("button", { name: L.cancel, exact: true }).click();
  await expect(lotRow(page, "LOT-TEST-002")).toBeVisible();
  await page.getByRole("button", { name: "Delete lot LOT-TEST-002", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: L.deleteConfirm, exact: true }).click();
  await expectDone(page, "Deleted.");
  await expect(lotRow(page, "LOT-TEST-002")).toHaveCount(0);
  await expectNoVerdicts(page, "lots page");

  // /materials shows a lot count link that preselects the material filter.
  await page.goto("/materials");
  await waitForHeading(page, "Materials");
  const link = visible(page.getByRole("link", { name: "1 lot", exact: true }));
  // Two materials have one lot each: the wick (LOT-TEST-001B) and the wax (LOT-WAX-001).
  await expect(link.first()).toBeVisible({ timeout: SLOW });
  expect(await link.count()).toBe(2);
  const wickRow = visible(page.getByTestId("material-row")).filter({ hasText: WICK });
  await wickRow.getByRole("link", { name: "1 lot", exact: true }).click();
  await expect(page).toHaveURL(/\/materials\/lots\?material=[0-9a-f-]{36}$/, { timeout: SLOW });
  await waitForHeading(page, "Lots");
  const filter = page.getByLabel(L.filterMaterialLabel);
  await expect(filter.locator("option:checked")).toHaveText(WICK, { timeout: SLOW });
  await expect(lotRows(page)).toHaveCount(1);
  await expect(lotRow(page, "LOT-TEST-001B")).toBeVisible();
  await expect(lotRow(page, "LOT-WAX-001")).toHaveCount(0);
  // Choosing "All materials" lists both.
  await filter.selectOption({ label: L.filterAllMaterials });
  await expect(lotRows(page)).toHaveCount(2);

  // The Materials page header links to the two new lists.
  await page.goto("/materials");
  await visible(page.getByRole("link", { name: "Lots", exact: true })).click();
  await expect(page).toHaveURL(/\/materials\/lots$/, { timeout: SLOW });
  await page.goto("/materials");
  await visible(page.getByRole("link", { name: "Suppliers", exact: true })).click();
  await expect(page).toHaveURL(/\/materials\/suppliers$/, { timeout: SLOW });
  await waitForHeading(page, "Suppliers");
});

/** Opens the Create batch form for a formula and waits for the lot pickers. */
async function openBatchFormFor(page: Page, formulaUrl: string) {
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await openCreateForm(page);
  await expect(lotPicker(page, `wick ${WICK}`)).toBeVisible({ timeout: SLOW });
}

// ------------------------------------------------------------ acceptance: two batches, one version

test("two batches from one saved version keep their own lots and suppliers", async ({ page }) => {
  test.setTimeout(420_000);
  await buildWE5WithWick(page, WICK);
  const formulaUrl = page.url().split("?")[0];
  await createSupplier(page, SUPPLIER_A);
  await createSupplier(page, SUPPLIER_B);
  await createLot(page, { material: WE5.wax, supplier: SUPPLIER_A, code: "LOT-WAX-A", receivedOn: iso(-20) });
  await createLot(page, { material: WE5.wax, supplier: SUPPLIER_B, code: "LOT-WAX-B" });
  await createLot(page, { material: "Lavender", supplier: SUPPLIER_A, code: "LOT-LAV-A" });
  await createLot(page, { material: "Lavender", supplier: SUPPLIER_B, code: "LOT-LAV-B" });
  await createLot(page, { material: WICK, supplier: SUPPLIER_A, code: "LOT-WICK-A" });

  // The picker offers only the lots of that component's material, with supplier and received date.
  await openBatchFormFor(page, formulaUrl);
  const waxOptions = await lotOptionTexts(page, WE5.wax);
  expect(waxOptions).toHaveLength(2);
  expect(waxOptions.find((t) => t.startsWith("LOT-WAX-A"))).toBe(
    `LOT-WAX-A · ${SUPPLIER_A} · received ${fmt(iso(-20))}`,
  );
  expect(waxOptions.find((t) => t.startsWith("LOT-WAX-B"))).toBe(`LOT-WAX-B · ${SUPPLIER_B}`);
  expect(await lotOptionTexts(page, "Lavender")).toHaveLength(2);
  expect(await lotOptionTexts(page, "wick " + WICK)).toHaveLength(1);
  // A component with no lots says so and offers a way to add one.
  await expect(visible(page.getByText(B.lotNoLotsHint("Vanilla")))).toBeVisible();
  await expect(visible(page.getByRole("link", { name: B.lotAddLink })).first()).toHaveAttribute(
    "href",
    /\/materials\/lots\?material=[0-9a-f-]{36}$/,
  );

  // Batch A: wax and oil lots from the first supplier.
  const idA = await createLotBatch(page, formulaUrl, WE5.name, {
    date: iso(-10),
    label: "TRACE-A",
    lots: { [WE5.wax]: "LOT-WAX-A", Lavender: "LOT-LAV-A" },
  });
  await waitForHeading(page, "TRACE-A");
  // Batch B: lots from the second supplier, and a wick lot.
  const idB = await createLotBatch(page, formulaUrl, WE5.name, {
    date: iso(-3),
    label: "TRACE-B",
    lots: { [WE5.wax]: "LOT-WAX-B", Lavender: "LOT-LAV-B", ["wick " + WICK]: "LOT-WICK-A" },
  });
  await waitForHeading(page, "TRACE-B");

  // Both come from the same saved version.
  await openBatch(page, idA, "TRACE-A");
  const versionLinkA = await page.getByRole("link", { name: "version 1" }).first().getAttribute("href");
  await openBatch(page, idB, "TRACE-B");
  const versionLinkB = await page.getByRole("link", { name: "version 1" }).first().getAttribute("href");
  expect(versionLinkA).toBe(versionLinkB);
  expect(idA).not.toBe(idB);

  // Each batch page shows its own recorded lots.
  async function expectLots(
    id: string,
    title: string,
    expected: Record<string, { code: string; supplier: string } | null>,
  ) {
    await openBatch(page, id, title);
    await expect(lotDetailRows(page)).toHaveCount(Object.keys(expected).length, { timeout: SLOW });
    for (const [material, lot] of Object.entries(expected)) {
      const r = lotDetailRow(page, material);
      if (lot === null) {
        await expect(r).toContainText(B.lotNone);
      } else {
        await expect(r.getByRole("link", { name: lot.code, exact: true })).toBeVisible({ timeout: SLOW });
        await expect(r).toContainText(B.lotSupplierLabel(lot.supplier));
      }
    }
  }
  await expectLots(idA, "TRACE-A", {
    [WE5.wax]: { code: "LOT-WAX-A", supplier: SUPPLIER_A },
    Lavender: { code: "LOT-LAV-A", supplier: SUPPLIER_A },
    Vanilla: null,
    Cedar: null,
    [WICK]: null,
  });
  await expect(lotDetailRows(page).filter({ hasText: "LOT-WAX-B" })).toHaveCount(0);
  await expectNoVerdicts(page, "batch page with lots");
  await expectLots(idB, "TRACE-B", {
    [WE5.wax]: { code: "LOT-WAX-B", supplier: SUPPLIER_B },
    Lavender: { code: "LOT-LAV-B", supplier: SUPPLIER_B },
    Vanilla: null,
    Cedar: null,
    [WICK]: { code: "LOT-WICK-A", supplier: SUPPLIER_A },
  });
  await expect(lotDetailRows(page).filter({ hasText: "LOT-WAX-A" })).toHaveCount(0);

  // The edit form shows the chosen lots too.
  await expect(lotPicker(page, WE5.wax).locator("option:checked")).toContainText("LOT-WAX-B");
  await expect(lotPicker(page, `wick ${WICK}`).locator("option:checked")).toContainText("LOT-WICK-A");

  // The library shows how many batches use a lot, and offers no Delete for it.
  await openLots(page);
  const usedLot = lotRow(page, "LOT-WAX-A");
  await expect(usedLot).toContainText("Used in 1 batch");
  await expect(usedLot).toContainText(L.usedHint);
  await expect(page.getByRole("button", { name: "Delete lot LOT-WAX-A", exact: true })).toHaveCount(0);
  await expect(lotRow(page, "LOT-LAV-B")).toContainText("Used in 1 batch");

  // Editing a lot's code in the library: the batch keeps the recorded code and shows a hint.
  await page.getByRole("button", { name: "Edit lot LOT-WAX-A", exact: true }).click();
  await lotEditor(page).getByLabel("Lot code", { exact: true }).fill("LOT-WAX-A2");
  await lotEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Saved.");

  await openBatch(page, idA, "TRACE-A");
  const wax = lotDetailRow(page, WE5.wax);
  await expect(wax.getByRole("link", { name: "LOT-WAX-A", exact: true })).toBeVisible({ timeout: SLOW });
  await expect(wax).toContainText(B.lotNowCode("LOT-WAX-A2"));
  // Other lots on that batch, and the other batch, show no hint.
  await expect(lotDetailRow(page, "Lavender")).not.toContainText("now recorded");
  await openBatch(page, idB, "TRACE-B");
  await expect(lotDetailRows(page).filter({ hasText: "now recorded" })).toHaveCount(0);

  // Renaming a supplier: the batch keeps the supplier it recorded and shows a hint.
  await openSuppliers(page);
  await page.getByRole("button", { name: `Edit supplier ${SUPPLIER_A}`, exact: true }).click();
  await supplierEditor(page).getByLabel("Name", { exact: true }).fill("Example Wax Company");
  await supplierEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Saved.");
  await openBatch(page, idA, "TRACE-A");
  await expect(lotDetailRow(page, "Lavender")).toContainText(B.lotSupplierLabel(SUPPLIER_A), {
    timeout: SLOW,
  });
  await expect(lotDetailRow(page, "Lavender")).toContainText(B.lotNowSupplier("Example Wax Company"));

  // Archive a linked lot. The batch keeps showing it, with an Archived badge.
  await openLots(page);
  await page.getByRole("button", { name: "Archive lot LOT-LAV-A", exact: true }).click();
  await expectDone(page, "Archived.");
  await openBatch(page, idA, "TRACE-A");
  const lav = lotDetailRow(page, "Lavender");
  await expect(lav.getByRole("link", { name: "LOT-LAV-A", exact: true })).toBeVisible({ timeout: SLOW });
  await expect(lav).toContainText(B.lotArchivedBadge);

  // Editing the batch keeps the archived link (and the recorded snapshot of the edited lot).
  const picker = lotPicker(page, "Lavender");
  await expect(picker.locator("option:checked")).toContainText("LOT-LAV-A");
  await expect(picker.locator("option:checked")).toContainText("(archived)");
  await batchLabel(page).fill("TRACE-A2");
  await saveBatchChanges(page);
  await openBatch(page, idA, "TRACE-A2");
  const lavAfter = lotDetailRow(page, "Lavender");
  await expect(lavAfter.getByRole("link", { name: "LOT-LAV-A", exact: true })).toBeVisible({ timeout: SLOW });
  await expect(lavAfter).toContainText(B.lotArchivedBadge);
  await expect(lotPicker(page, "Lavender").locator("option:checked")).toContainText("LOT-LAV-A");
  const waxAfter = lotDetailRow(page, WE5.wax);
  await expect(waxAfter.getByRole("link", { name: "LOT-WAX-A", exact: true })).toBeVisible();
  await expect(waxAfter).toContainText(B.lotNowCode("LOT-WAX-A2"));

  // The archived lot is not offered for a new batch (the other Lavender lot still is).
  await openBatchFormFor(page, formulaUrl);
  const lavOptions = await lotOptionTexts(page, "Lavender");
  expect(lavOptions).toHaveLength(1);
  expect(lavOptions[0]).toContain("LOT-LAV-B");

  // Clearing a lot on a batch and saving removes the link.
  await openBatch(page, idB, "TRACE-B");
  await clearBatchLot(page, `wick ${WICK}`);
  await saveBatchChanges(page);
  await openBatch(page, idB, "TRACE-B");
  await expect(lotDetailRow(page, WICK)).toContainText(B.lotNone, { timeout: SLOW });
  // Choosing a different lot takes a fresh snapshot.
  await setBatchLot(page, "Lavender", "LOT-LAV-B");
  await saveBatchChanges(page);
});

// ------------------------------------------------------------ search, filters, URL, CSV

test.describe.serial("search, filters, URL state and CSV on /batches", () => {
  test.describe.configure({ timeout: 180_000 });
  let page: Page;
  const formula2Name = "Second Example Formula";
  const ids: Record<string, string> = {};

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
    page = await ctx.newPage();
    await buildWE5WithWick(page, WICK);
    const url1 = page.url().split("?")[0];
    await createSupplier(page, SUPPLIER_A);
    await createSupplier(page, SUPPLIER_B);
    await createLot(page, { material: WE5.wax, supplier: SUPPLIER_A, code: "LOT-WAX-A", receivedOn: iso(-30) });
    await createLot(page, { material: WE5.wax, supplier: SUPPLIER_B, code: "LOT-WAX-B" });
    await createLot(page, { material: "Lavender", supplier: SUPPLIER_A, code: "LOT-LAV-A" });
    await createLot(page, { material: WICK, supplier: SUPPLIER_A, code: "LOT-WICK-A" });
    const url2 = await buildSecondFormula(page, formula2Name);

    ids.A = await createLotBatch(page, url1, WE5.name, {
      date: iso(-10),
      label: "SRCH-A",
      lots: { [WE5.wax]: "LOT-WAX-A", Lavender: "LOT-LAV-A", ["wick " + WICK]: "LOT-WICK-A" },
    });
    await addCurePlan(page, ids.A, { rows: [{ kind: "check", label: "Check A", offset: "3" }] });
    await createSession(page, ids.A, {
      date: iso(0),
      label: "Search burn",
      candles: [
        {
          label: "A",
          wickText: "Generated wick 1",
          burns: [{ minutes: "240", before: "250.00", after: "238.50", soot: "None seen" }],
        },
      ],
    });
    ids.B = await createLotBatch(page, url1, WE5.name, {
      date: iso(-5),
      label: "SRCH-B",
      lots: { [WE5.wax]: "LOT-WAX-B" },
    });
    await addCurePlan(page, ids.B, { rows: [{ kind: "check", label: "Check B", offset: "4" }] });
    ids.C = await createLotBatch(page, url1, WE5.name, { date: iso(-1), label: "SRCH-C" });
    ids.D = await createLotBatch(page, url2, formula2Name, {
      date: iso(-3),
      label: "SRCH-D",
      lots: { [WE5.wax]: "LOT-WAX-B" },
    });
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  const urlParams = () => new URL(page.url()).searchParams;

  /** Titles listed, latest production date first: C (-1), D (-3), B (-5), A (-10). */
  async function expectListed(titles: string[], total = 4) {
    await expectCount(page, titles.length, total);
    expect(await listedBatchTitles(page)).toEqual(titles);
  }

  test("the list shows every batch with its lot codes, newest first", async () => {
    await openBatches(page);
    await expectListed(["SRCH-C", "SRCH-D", "SRCH-B", "SRCH-A"]);
    const rowA = batchRows(page).filter({ hasText: "SRCH-A" });
    await expect(rowA).toContainText(B.rowLots("LOT-WAX-A, LOT-LAV-A, LOT-WICK-A"));
    await expect(batchRows(page).filter({ hasText: "SRCH-C" })).not.toContainText("Lots:");
    // No filter is set: no Clear button, an empty search box, every select on its "all" choice.
    await expect(clearFiltersButton(page)).toHaveCount(0);
    await expect(searchBox(page)).toHaveValue("");
    expect(page.url()).toMatch(/\/batches$/);
    await expectNoVerdicts(page, "batches list");
  });

  test("search by batch label, formula name, lot code and supplier name", async () => {
    await openBatches(page);

    await search(page, "SRCH-A");
    await expectListed(["SRCH-A"]);
    // Case-insensitive.
    await search(page, "srch-b");
    await expectListed(["SRCH-B"]);
    // Formula name.
    await search(page, "Second Example Formula");
    await expectListed(["SRCH-D"]);
    // Lot code.
    await search(page, "LOT-LAV-A");
    await expectListed(["SRCH-A"]);
    await search(page, "LOT-WAX-B");
    await expectListed(["SRCH-D", "SRCH-B"]);
    // Supplier name (recorded on the batch's lots).
    await search(page, SUPPLIER_B);
    await expectListed(["SRCH-D", "SRCH-B"]);
    // One word of a supplier name is enough ("supplier" is only in the second supplier's name).
    await search(page, "supplier");
    await expectListed(["SRCH-D", "SRCH-B"]);
    // Every term must match, so more words narrow the result (and accents and case do not matter).
    await search(page, "EXAMPLE wax");
    await expectListed(["SRCH-D", "SRCH-B", "SRCH-A"]);
    // Every term must match.
    await search(page, "LOT-WAX-B SRCH-D");
    await expectListed(["SRCH-D"]);
    // No match: the empty result state, the count and the Clear button.
    await search(page, "no-such-thing");
    await expectCount(page, 0, 4);
    await expect(visible(page.getByText(T.noMatchTitle))).toBeVisible();
    await expect(visible(page.getByText(T.noMatchDescription))).toBeVisible();
    await expect(batchRows(page)).toHaveCount(0);
    await expect(exportCsvButton(page)).toBeDisabled();
    await clearFiltersButton(page).click();
    await expectListed(["SRCH-C", "SRCH-D", "SRCH-B", "SRCH-A"]);
    await expect(searchBox(page)).toHaveValue("");
    expect(page.url()).toMatch(/\/batches$/);

    // Typing alone (no Enter) writes the URL after a short wait.
    await searchBox(page).fill("SRCH-C");
    await expect(page).toHaveURL((u) => u.searchParams.get("q") === "SRCH-C", { timeout: SLOW });
    await expectListed(["SRCH-C"]);
  });

  test("each filter, the count, the date range error and Clear filters", async () => {
    await openBatches(page);
    const select = (key: Exclude<keyof typeof FILTER_LABELS, "from" | "to">, label: string) =>
      setSelectFilter(page, key, label);

    // Formula.
    await select("formula", "Second Example Formula");
    await expectListed(["SRCH-D"]);
    expect(urlParams().get("formula")).toMatch(/^[0-9a-f-]{36}$/);
    await select("formula", WE5.name);
    await expectListed(["SRCH-C", "SRCH-B", "SRCH-A"]);
    await select("formula", T.allFormulas);
    await expectListed(["SRCH-C", "SRCH-D", "SRCH-B", "SRCH-A"]);
    expect(page.url()).toMatch(/\/batches$/);

    // Date range, inclusive.
    await setDateFilter(page, "from", iso(-4));
    await expectListed(["SRCH-C", "SRCH-D"]);
    expect(urlParams().get("from")).toBe(iso(-4));
    await setDateFilter(page, "to", iso(-6));
    // From after to: a field error, and no batch matches.
    await expect(visible(page.getByText(T.dateRangeError))).toBeVisible();
    await expectCount(page, 0, 4);
    await setDateFilter(page, "from", "");
    await expect(page.getByText(T.dateRangeError)).toHaveCount(0);
    await expectListed(["SRCH-A"]);
    expect(urlParams().get("to")).toBe(iso(-6));
    await setDateFilter(page, "from", iso(-5));
    await setDateFilter(page, "to", iso(-3));
    await expectListed(["SRCH-D", "SRCH-B"]);
    // The end dates themselves are included.
    await setDateFilter(page, "from", iso(-3));
    await setDateFilter(page, "to", iso(-3));
    await expectListed(["SRCH-D"]);
    await clearFiltersButton(page).click();
    await expectListed(["SRCH-C", "SRCH-D", "SRCH-B", "SRCH-A"]);
    await expect(filterField(page, "from")).toHaveValue("");
    await expect(filterField(page, "to")).toHaveValue("");

    // Lot.
    await select("lot", "LOT-WAX-B · Soy 464");
    await expectListed(["SRCH-D", "SRCH-B"]);
    expect(urlParams().get("lot")).toMatch(/^[0-9a-f-]{36}$/);
    await select("lot", "LOT-LAV-A · Lavender");
    await expectListed(["SRCH-A"]);
    await select("lot", T.allLots);

    // Supplier.
    await select("supplier", SUPPLIER_B);
    await expectListed(["SRCH-D", "SRCH-B"]);
    await select("supplier", SUPPLIER_A);
    await expectListed(["SRCH-A"]);
    await select("supplier", T.allSuppliers);

    // Cure plan.
    await select("cure", T.withIt);
    await expectListed(["SRCH-B", "SRCH-A"]);
    expect(urlParams().get("cure")).toBe("yes");
    await select("cure", T.withoutIt);
    await expectListed(["SRCH-C", "SRCH-D"]);
    expect(urlParams().get("cure")).toBe("no");
    await select("cure", T.any);

    // Burn tests.
    await select("burn", T.withIt);
    await expectListed(["SRCH-A"]);
    await select("burn", T.withoutIt);
    await expectListed(["SRCH-C", "SRCH-D", "SRCH-B"]);
    expect(urlParams().get("burn")).toBe("no");

    // Filters combine: a cure plan but no burn test.
    await select("cure", T.withIt);
    await expectListed(["SRCH-B"]);
    // Search and filters combine too.
    await search(page, "SRCH-A");
    await expectListed([]);
    await expect(visible(page.getByText(T.noMatchTitle))).toBeVisible();

    // Clear filters resets the search, every control and the URL.
    await clearFiltersButton(page).click();
    await expectListed(["SRCH-C", "SRCH-D", "SRCH-B", "SRCH-A"]);
    await expect(searchBox(page)).toHaveValue("");
    for (const key of ["formula", "lot", "supplier", "cure", "burn"] as const) {
      await expect(filterField(page, key).locator("option:checked")).toHaveText(
        { formula: T.allFormulas, lot: T.allLots, supplier: T.allSuppliers, cure: T.any, burn: T.any }[key],
      );
    }
    expect(page.url()).toMatch(/\/batches$/);
    await expect(clearFiltersButton(page)).toHaveCount(0);
  });

  test("the URL carries the query, reload keeps it, and Back from a batch returns to the same list", async () => {
    await openBatches(page);
    await search(page, SUPPLIER_B);
    await setSelectFilter(page, "cure", T.withIt);
    await expectListed(["SRCH-B"]);
    const query = urlParams();
    expect(query.get("q")).toBe(SUPPLIER_B);
    expect(query.get("cure")).toBe("yes");
    const filtered = page.url();

    async function expectView() {
      await expectListed(["SRCH-B"]);
      await expect(searchBox(page)).toHaveValue(SUPPLIER_B);
      await expect(filterField(page, "cure").locator("option:checked")).toHaveText(T.withIt);
      await expect(filterField(page, "burn").locator("option:checked")).toHaveText(T.any);
      await expect(clearFiltersButton(page)).toBeVisible();
    }

    // Reload keeps it.
    await page.reload();
    await waitForHeading(page, "Batches");
    await expectView();
    expect(page.url()).toBe(filtered);

    // Open the batch, then Back.
    await batchRows(page).first().getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/batches/${ids.B}$`), { timeout: SLOW });
    await waitForHeading(page, "SRCH-B");
    await page.goBack();
    await waitForHeading(page, "Batches");
    expect(page.url()).toBe(filtered);
    await expectView();

    // Opening the same address again gives the same view.
    await page.goto(filtered);
    await waitForHeading(page, "Batches");
    await expectView();

    // Values the app does not understand are dropped, the rest still works.
    await page.goto("/batches?from=not-a-date&cure=maybe&q=SRCH-A");
    await waitForHeading(page, "Batches");
    await expectListed(["SRCH-A"]);
    await expect(filterField(page, "from")).toHaveValue("");
    await expect(filterField(page, "cure").locator("option:checked")).toHaveText(T.any);
  });

  test("Export CSV downloads only the filtered batches, one row per component", async ({}, testInfo) => {
    const header = [
      "batch",
      "batchId",
      "productionDate",
      "formula",
      "version",
      "component",
      "material",
      "plannedG",
      "measuredG",
      "lotCode",
      "supplier",
      "lotReceived",
      "curePlan",
      "burnTests",
    ].map((k) => MESSAGES.batchCsv[k as keyof typeof MESSAGES.batchCsv] as string);

    async function exportCsv() {
      const downloadPromise = page.waitForEvent("download");
      await exportCsvButton(page).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`candlelab-batches-${todayStamp()}.csv`);
      expect(download.suggestedFilename()).toMatch(/^candlelab-batches-\d{8}\.csv$/);
      const file = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(file);
      const text = readText(file);
      expect(text.startsWith("﻿"), "starts with the BOM").toBe(true);
      expect(text.endsWith("\r\n"), "CRLF line ends").toBe(true);
      return parseCsv(text.slice(1));
    }

    // Filtered by supplier: SRCH-B (5 components) and SRCH-D (2 components).
    await openBatches(page);
    await setSelectFilter(page, "supplier", SUPPLIER_B);
    await expectListed(["SRCH-D", "SRCH-B"]);
    const rows = await exportCsv();
    expect(rows[0]).toEqual(header);
    const body = rows.slice(1);
    expect(body).toHaveLength(7);
    expect(new Set(body.map((r) => r[0]))).toEqual(new Set(["SRCH-D", "SRCH-B"]));
    expect(body.every((r) => r.length === header.length)).toBe(true);
    // The list's order: SRCH-D first.
    expect(body.slice(0, 2).map((r) => r[0])).toEqual(["SRCH-D", "SRCH-D"]);
    const d = body.filter((r) => r[0] === "SRCH-D");
    expect(d.map((r) => r[5])).toEqual(["Wax", "Fragrance oil"]);
    expect(d[0].slice(1, 3)).toEqual([ids.D, iso(-3)]);
    expect(d[0][3]).toBe(formula2Name);
    expect(d[0][4]).toBe("1");
    expect(d[0][9]).toBe("LOT-WAX-B");
    expect(d[0][10]).toBe(SUPPLIER_B);
    expect(d[1][9]).toBe("");
    expect(d[1][10]).toBe("");
    expect(d.map((r) => r.slice(12))).toEqual([["No", "0"], ["No", "0"]]);
    const b = body.filter((r) => r[0] === "SRCH-B");
    expect(b.map((r) => r[5])).toEqual(["Wax", "Fragrance oil", "Fragrance oil", "Fragrance oil", "Wick"]);
    expect(b.map((r) => r[6])).toEqual([WE5.wax, "Lavender", "Vanilla", "Cedar", WICK]);
    expect(b.map((r) => r[9])).toEqual(["LOT-WAX-B", "", "", "", ""]);
    expect(b.map((r) => r[10])).toEqual([SUPPLIER_B, "", "", "", ""]);
    expect(b[0][7]).toMatch(/^1000(\.0+)?$/);
    expect(b[4][7], "a wick has no planned weight").toBe("");
    expect(b.every((r) => r[12] === "Yes" && r[13] === "0")).toBe(true);
    expect(body.some((r) => r[0] === "SRCH-A" || r[0] === "SRCH-C")).toBe(false);

    // Filtered by search: SRCH-A with three lots, a cure plan and a burn test.
    await clearFiltersButton(page).click();
    await expectListed(["SRCH-C", "SRCH-D", "SRCH-B", "SRCH-A"]);
    await search(page, "SRCH-A");
    await expectListed(["SRCH-A"]);
    const a = (await exportCsv()).slice(1);
    expect(a).toHaveLength(5);
    expect(a.map((r) => r[9])).toEqual(["LOT-WAX-A", "LOT-LAV-A", "", "", "LOT-WICK-A"]);
    expect(a.map((r) => r[10])).toEqual([SUPPLIER_A, SUPPLIER_A, "", "", SUPPLIER_A]);
    expect(a[0][11]).toBe(iso(-30));
    expect(a[1][11]).toBe("");
    expect(a.every((r) => r[12] === "Yes" && r[13] === "1")).toBe(true);

    // Unfiltered: every batch (5 + 5 + 5 + 2 rows).
    await clearFiltersButton(page).click();
    await expectListed(["SRCH-C", "SRCH-D", "SRCH-B", "SRCH-A"]);
    const all = (await exportCsv()).slice(1);
    expect(all).toHaveLength(17);
    expect(all.slice(0, 5).every((r) => r[0] === "SRCH-C")).toBe(true);
  });
});
