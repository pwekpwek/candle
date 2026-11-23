import { test, expect, type Locator, type Page } from "@playwright/test";
import { MESSAGES } from "@/lib/messages";
import { WE5, expectNoSideScroll, expectTapHeight } from "./helpers-flow";
import { expectNoPageScroll, expectNoVerdicts } from "./helpers-burn";
import {
  SLOW,
  SUPPLIER_A,
  SUPPLIER_B,
  buildWE5WithWick,
  clearFiltersButton,
  createLot,
  createLotBatch,
  createSupplier,
  expectCount,
  expectDone,
  exportCsvButton,
  filterField,
  filterToggle,
  fillLot,
  lotEditor,
  lotPicker,
  lotRow,
  openAddLot,
  openAddSupplier,
  openBatches,
  openLots,
  openSuppliers,
  search,
  searchBox,
  setSelectFilter,
  supplierEditor,
  supplierRow,
  visible,
  waitForHeading,
} from "./helpers-lots";
import { checkScreen, iso, openBatch } from "./helpers-schedule";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

const S = MESSAGES.suppliers;
const L = MESSAGES.lots;
const B = MESSAGES.batches;
const T = MESSAGES.batchTrace;
const WICK = "Example Wick 1";

/** expectTapHeight, after waiting for the element (boundingBox alone would wait out the whole test). */
async function tapHeight(target: Locator, what: string) {
  await expect(target, `${what}: visible`).toBeVisible({ timeout: SLOW });
  await expectTapHeight(target, what);
}

/** The element sits fully inside the 375px viewport. */
async function expectInsideViewport(target: Locator, what: string) {
  const box = await target.boundingBox();
  expect(box, `${what}: has a box`).not.toBeNull();
  expect(box!.x, `${what}: left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${what}: right edge`).toBeLessThanOrEqual(375);
}

async function expectInView(target: Locator, what: string) {
  await expect(target, `${what}: visible`).toBeVisible({ timeout: SLOW });
  await expect(target, `${what}: in the viewport`).toBeInViewport();
}

/** Every page of this slice: no sideways scroll, nothing under the bars, 16px inputs, no verdict words. */
async function checkNewScreen(page: Page, where: string) {
  await expectNoPageScroll(page, where);
  await checkScreen(page, where);
  await expectNoVerdicts(page, where);
}

const LONG_UNBROKEN = "ExampleNotesWithoutAnySpacesSoTheyMustWrapInsideTheCardAndNeverPushThePageWiderThanThePhoneScreenAtAll";

test("suppliers, lots, batch form, batch page and filtered list at 375px", async ({ page }) => {
  test.setTimeout(600_000);
  await buildWE5WithWick(page, WICK);
  const formulaUrl = page.url().split("?")[0];

  // ---- /materials: the new links and the lot count link (after lots exist, below).
  await page.goto("/materials");
  await waitForHeading(page, "Materials");
  await tapHeight(visible(page.getByRole("link", { name: L.title, exact: true })), "materials: Lots link");
  await tapHeight(
    visible(page.getByRole("link", { name: S.title, exact: true })),
    "materials: Suppliers link",
  );
  await checkNewScreen(page, "materials");

  // ---- Suppliers: empty state, field error, save feedback, long text.
  await openSuppliers(page);
  await expect(page.getByText(S.empty.title)).toBeVisible({ timeout: SLOW });
  await checkNewScreen(page, "suppliers, empty");
  await tapHeight(
    page.getByTestId("empty-state").getByRole("button", { name: S.empty.action }),
    "suppliers: empty-state Add supplier",
  );
  await tapHeight(
    page.locator("main header").getByRole("button", { name: S.addSupplier }),
    "suppliers: header Add supplier",
  );
  await openAddSupplier(page);
  const sheet = supplierEditor(page);
  await tapHeight(sheet.getByLabel("Name", { exact: true }), "supplier form: Name");
  await tapHeight(sheet.getByRole("button", { name: "Save", exact: true }), "supplier form: Save");
  await tapHeight(sheet.getByRole("button", { name: S.cancel, exact: true }), "supplier form: Cancel");
  await sheet.getByRole("button", { name: "Save", exact: true }).tap();
  const nameError = sheet.getByText(S.nameRequired);
  await expectInView(nameError, "supplier name error");
  await expectInsideViewport(nameError, "supplier name error");
  await expectNoPageScroll(page, "supplier form with an error");
  await sheet.getByLabel("Name", { exact: true }).fill(SUPPLIER_A);
  await sheet.getByLabel("Contact notes (optional)").fill(LONG_UNBROKEN);
  await sheet.getByRole("button", { name: "Save", exact: true }).tap();
  const added = visible(page.getByText(/(^|\s)Added\.$/));
  await expectInView(added, "supplier saved notice");
  await expectInsideViewport(added, "supplier saved notice");
  await expectNoPageScroll(page, "suppliers just saved");
  await expect(supplierRow(page, SUPPLIER_A)).toContainText(LONG_UNBROKEN);
  await tapHeight(
    page.getByRole("button", { name: `Edit supplier ${SUPPLIER_A}`, exact: true }),
    "suppliers: Edit",
  );
  await tapHeight(
    page.getByRole("button", { name: `Archive supplier ${SUPPLIER_A}`, exact: true }),
    "suppliers: Archive",
  );
  await tapHeight(
    page.getByRole("button", { name: `Delete supplier ${SUPPLIER_A}`, exact: true }),
    "suppliers: Delete",
  );
  await tapHeight(page.locator("label", { hasText: S.showArchived }), "suppliers: Show archived (label)");
  await checkNewScreen(page, "suppliers, one supplier with long notes");
  await createSupplier(page, SUPPLIER_B);

  // ---- Lots: field error, save feedback.
  await openLots(page);
  await expect(page.getByText(L.empty.title)).toBeVisible({ timeout: SLOW });
  await checkNewScreen(page, "lots, empty");
  await openAddLot(page);
  const lotSheet = lotEditor(page);
  await tapHeight(lotSheet.getByLabel("Material", { exact: true }), "lot form: Material");
  await tapHeight(lotSheet.getByLabel("Supplier", { exact: true }), "lot form: Supplier");
  await tapHeight(lotSheet.getByLabel("Lot code", { exact: true }), "lot form: Lot code");
  await tapHeight(lotSheet.getByLabel("Received date (optional)"), "lot form: Received date");
  await tapHeight(lotSheet.getByRole("button", { name: "Save", exact: true }), "lot form: Save");
  await lotSheet.getByRole("button", { name: "Save", exact: true }).tap();
  const codeError = lotSheet.getByText(L.codeRequired);
  await expectInView(codeError, "lot code error");
  await expectInsideViewport(codeError, "lot code error");
  await expectInsideViewport(lotSheet.getByText(L.materialRequired), "lot material error");
  await expectNoPageScroll(page, "lot form with errors");
  await fillLot(page, {
    material: WICK,
    supplier: SUPPLIER_A,
    code: "LOT-WICK-A",
    receivedOn: iso(-4),
    notes: LONG_UNBROKEN,
  });
  await lotSheet.getByRole("button", { name: "Save", exact: true }).tap();
  const lotAdded = visible(page.getByText(/(^|\s)Added\.$/));
  await expectInView(lotAdded, "lot saved notice");
  await expectInsideViewport(lotAdded, "lot saved notice");
  await expectNoPageScroll(page, "lots just saved");
  await expect(lotRow(page, "LOT-WICK-A")).toContainText(LONG_UNBROKEN);

  // More lots through the same screen (a wax and an oil, from the second supplier).
  await createLot(page, { material: WE5.wax, supplier: SUPPLIER_B, code: "LOT-WAX-B", receivedOn: iso(-9) });
  await createLot(page, { material: "Lavender", supplier: SUPPLIER_B, code: "LOT-LAV-B" });

  await openLots(page);
  await tapHeight(page.getByLabel(L.filterMaterialLabel), "lots: material filter");
  await tapHeight(page.locator("label", { hasText: L.showArchived }), "lots: Show archived (label)");
  await tapHeight(page.getByRole("button", { name: "Edit lot LOT-WICK-A", exact: true }), "lots: Edit");
  await tapHeight(page.getByRole("button", { name: "Archive lot LOT-WICK-A", exact: true }), "lots: Archive");
  await tapHeight(page.getByRole("button", { name: "Delete lot LOT-WICK-A", exact: true }), "lots: Delete");
  await checkNewScreen(page, "lots, three lots");

  // ---- /materials lot count link goes to the filtered list.
  await page.goto("/materials");
  await waitForHeading(page, "Materials");
  const countLink = visible(page.getByTestId("material-row"))
    .filter({ hasText: WICK })
    .getByRole("link", { name: "1 lot", exact: true });
  await tapHeight(countLink, "materials: lot count link");
  await countLink.tap();
  await expect(page).toHaveURL(/\/materials\/lots\?material=/, { timeout: SLOW });
  await waitForHeading(page, "Lots");
  await expect(page.getByLabel(L.filterMaterialLabel).locator("option:checked")).toHaveText(WICK, {
    timeout: SLOW,
  });
  await checkNewScreen(page, "lots filtered by material");

  // ---- Batch form with lot pickers.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await visible(page.getByRole("link", { name: "Create batch" })).first().tap();
  await expect(page).toHaveURL(/\/batches\/new\?version=/, { timeout: SLOW });
  await waitForHeading(page, "Create batch");
  const waxPicker = lotPicker(page, WE5.wax);
  await expect(waxPicker).toBeVisible({ timeout: SLOW });
  await tapHeight(waxPicker, "batch form: wax lot picker");
  await tapHeight(lotPicker(page, "Lavender"), "batch form: oil lot picker");
  await tapHeight(lotPicker(page, `wick ${WICK}`), "batch form: wick lot picker");
  // A component with no lots shows a hint and an "Add a lot" link that is a full-size target.
  await tapHeight(
    visible(page.getByRole("link", { name: B.lotAddLink })).first(),
    "batch form: Add a lot link",
  );
  await checkNewScreen(page, "batch form with lot pickers");
  await page.getByRole("button", { name: "Create batch" }).scrollIntoViewIfNeeded();
  await tapHeight(page.getByRole("button", { name: "Create batch" }), "batch form: Create batch");

  // ---- Batch page lots section, and a second batch for the list.
  const idA = await createLotBatch(page, formulaUrl, WE5.name, {
    date: iso(-6),
    label: "PH-LOT-A",
    lots: { [WE5.wax]: "LOT-WAX-B", Lavender: "LOT-LAV-B", [`wick ${WICK}`]: "LOT-WICK-A" },
  });
  await createLotBatch(page, formulaUrl, WE5.name, { date: iso(-2), label: "PH-LOT-B" });
  await openBatch(page, idA, "PH-LOT-A");
  const section = visible(page.getByRole("region", { name: B.lotsRecordedHeading }));
  await expect(section).toBeVisible({ timeout: SLOW });
  await expect(section.getByRole("link", { name: "LOT-WAX-B", exact: true })).toBeVisible({ timeout: SLOW });
  await tapHeight(section.getByRole("link", { name: "LOT-WAX-B", exact: true }), "batch page: lot link");
  await section.scrollIntoViewIfNeeded();
  await expectNoPageScroll(page, "batch page lots section");
  await checkNewScreen(page, "batch page with lots");
  // Edit the code in the library: the hint wraps inside the card at 375px.
  await openLots(page);
  await page.getByRole("button", { name: "Edit lot LOT-WAX-B", exact: true }).tap();
  await lotEditor(page).getByLabel("Lot code", { exact: true }).fill(`LOT-WAX-B-${LONG_UNBROKEN}`.slice(0, 60));
  await lotEditor(page).getByRole("button", { name: "Save", exact: true }).tap();
  await expectDone(page, "Saved.");
  await openBatch(page, idA, "PH-LOT-A");
  await expect(visible(page.getByText(B.lotNowCode(`LOT-WAX-B-${LONG_UNBROKEN}`.slice(0, 60))))).toBeVisible({
    timeout: SLOW,
  });
  await checkNewScreen(page, "batch page with a changed lot code");

  // ---- The batches list: search, the Filters disclosure, tap targets, no sideways scroll.
  await openBatches(page);
  await expectCount(page, 2, 2);
  await checkNewScreen(page, "batches list");
  await tapHeight(searchBox(page), "batches: search box");
  const toggle = filterToggle(page);
  await tapHeight(toggle, "batches: Filters button");
  await expect(toggle).toHaveText(T.filtersToggle(0));
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  // The filters are hidden until the button opens them.
  await expect(visible(page.getByLabel("Cure plan", { exact: true }))).toHaveCount(0);
  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(filterField(page, "cure")).toBeVisible();
  for (const key of ["formula", "from", "to", "lot", "supplier", "cure", "burn"] as const) {
    await tapHeight(filterField(page, key), `batches: ${key} filter`);
    await expectInsideViewport(filterField(page, key), `batches: ${key} filter`);
  }
  await expectNoPageScroll(page, "batches list with the filters open");
  await checkNewScreen(page, "batches list, filters open");

  // A filter narrows the list and shows in the button label and the URL.
  await setSelectFilter(page, "lot", "LOT-LAV-B · Lavender");
  await expect(toggle).toHaveText(T.filtersToggle(1));
  await expectCount(page, 1, 2);
  await expect(visible(page.getByTestId("batch-row"))).toHaveCount(1);
  await expect(clearFiltersButton(page)).toBeVisible();
  await tapHeight(clearFiltersButton(page), "batches: Clear filters");
  await tapHeight(exportCsvButton(page), "batches: Export CSV");
  await tapHeight(visible(page.getByTestId("batch-row")).first().getByRole("link").first(), "batches: row link");
  await checkNewScreen(page, "batches list, filtered");

  // Filtered list with the filters closed again: still no sideways scroll, and Back keeps the view.
  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expectNoPageScroll(page, "filtered list, filters closed");
  await visible(page.getByTestId("batch-row")).first().getByRole("link").first().tap();
  await expect(page).toHaveURL(new RegExp(`/batches/${idA}$`), { timeout: SLOW });
  await page.goBack();
  await waitForHeading(page, "Batches");
  await expectCount(page, 1, 2);
  await expect(filterToggle(page)).toHaveText(T.filtersToggle(1));

  // Search at 375px, no match state, and the empty state is not wider than the screen.
  await clearFiltersButton(page).tap();
  await expectCount(page, 2, 2);
  await search(page, "no-such-thing-in-any-batch");
  await expectCount(page, 0, 2);
  await expect(visible(page.getByText(T.noMatchTitle))).toBeVisible();
  await expectNoSideScroll(page, "no-match state");
  await checkNewScreen(page, "batches list, no match");
  await clearFiltersButton(page).tap();
  await expectCount(page, 2, 2);
});
