import { expect, type Locator, type Page } from "@playwright/test";
import {
  SLOW,
  WE5,
  expectWE5Panel,
  fillWE5,
  openNewFormula,
  saveFromEditor,
  waitForHeading,
} from "./helpers-flow";
import { batchLabel, openCreateForm, productionDate, submitCreate, visible } from "./helpers-schedule";

/*
 * Helpers for the v0.3 lots slice (suppliers, lots, lot pickers on batches,
 * search and filters on /batches). They only use screens, never seed state, so
 * the upgrade-chain test can reuse them against a profile with other data.
 */

export { SLOW, visible, waitForHeading };

/** The two example suppliers every lots test uses (clearly fake). */
export const SUPPLIER_A = "Example Wax Co";
export const SUPPLIER_B = "Second Example Supplier";

export const supplierEditor = (p: Page) => p.getByTestId("supplier-editor");
export const lotEditor = (p: Page) => p.getByTestId("lot-editor");
export const supplierRows = (p: Page) => p.getByTestId("supplier-row").filter({ visible: true });
export const lotRows = (p: Page) => p.getByTestId("lot-row").filter({ visible: true });

export const supplierRow = (p: Page, name: string) =>
  supplierRows(p).filter({ has: p.getByRole("heading", { name, exact: true }) });
export const lotRow = (p: Page, code: string) =>
  lotRows(p).filter({ has: p.getByRole("heading", { name: code, exact: true }) });

export async function openSuppliers(page: Page) {
  await page.goto("/materials/suppliers");
  await waitForHeading(page, "Suppliers");
  await expect(page.getByText("Loading suppliers…")).toHaveCount(0, { timeout: SLOW });
}

export async function openLots(page: Page, material?: string) {
  await page.goto(material ? `/materials/lots?material=${material}` : "/materials/lots");
  await waitForHeading(page, "Lots");
  await expect(page.getByText("Loading lots…")).toHaveCount(0, { timeout: SLOW });
}

/** Opens the add-supplier sheet (the header button; an empty list also offers one). */
export async function openAddSupplier(page: Page) {
  await page.getByRole("button", { name: "Add supplier" }).first().click();
  await expect(supplierEditor(page)).toBeVisible({ timeout: SLOW });
}

export async function openAddLot(page: Page) {
  await page.getByRole("button", { name: "Add lot" }).first().click();
  await expect(lotEditor(page)).toBeVisible({ timeout: SLOW });
}

/**
 * The status line after a save: "<name> Added." / "Saved." / "Archived." and so
 * on. Matches the end of the line, case-sensitively, so a row's hint ("... can
 * only be archived.") does not count.
 */
export async function expectDone(page: Page, text: string) {
  const pattern = new RegExp("(^|\\s)" + text.split(".").join("\\.") + "$");
  await expect(visible(page.getByText(pattern))).toBeVisible({ timeout: SLOW });
}

/** Adds a supplier on /materials/suppliers and waits for the "Added." line. */
export async function createSupplier(page: Page, name: string, notes?: string) {
  await openSuppliers(page);
  await openAddSupplier(page);
  const sheet = supplierEditor(page);
  await sheet.getByLabel("Name", { exact: true }).fill(name);
  if (notes !== undefined) await sheet.getByLabel("Contact notes (optional)").fill(notes);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Added.");
  await expect(supplierEditor(page)).toHaveCount(0);
}

export type LotSpec = {
  /** Material name as the lot form lists it. */
  material: string;
  supplier?: string;
  code: string;
  /** YYYY-MM-DD */
  receivedOn?: string;
  notes?: string;
};

/** Fills the (open) lot sheet; does not save. */
export async function fillLot(page: Page, lot: Partial<LotSpec> & { materialReadOnly?: boolean }) {
  const sheet = lotEditor(page);
  if (lot.material !== undefined) {
    await sheet.getByLabel("Material", { exact: true }).selectOption({ label: lot.material });
  }
  if (lot.supplier !== undefined) {
    await sheet.getByLabel("Supplier", { exact: true }).selectOption({ label: lot.supplier });
  }
  if (lot.code !== undefined) await sheet.getByLabel("Lot code", { exact: true }).fill(lot.code);
  if (lot.receivedOn !== undefined) {
    await sheet.getByLabel("Received date (optional)").fill(lot.receivedOn);
  }
  if (lot.notes !== undefined) await sheet.getByLabel("Notes (optional)").fill(lot.notes);
}

/** Adds a lot on /materials/lots and waits for the "Added." line. */
export async function createLot(page: Page, lot: LotSpec) {
  await openLots(page);
  await openAddLot(page);
  await fillLot(page, lot);
  await lotEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Added.");
  await expect(lotEditor(page)).toHaveCount(0);
}

/** The lot picker of a component on the batch form. `component` is the material name, or "wick NAME" / "vessel NAME". */
export const lotPicker = (p: Page, component: string) =>
  visible(p.getByLabel(`Lot for ${component}`, { exact: true }));

/**
 * Chooses a lot on the batch form (create or edit). `lotText` is a part of the
 * option text ("LOT-1 · Example Wax Co · received Nov 1, 2026"), usually the code.
 */
export async function setBatchLot(page: Page, component: string, lotText: string) {
  const select = lotPicker(page, component);
  await expect(select).toBeVisible({ timeout: SLOW });
  const option = select.locator("option", { hasText: lotText });
  await expect(option.first(), `a "${component}" lot option with "${lotText}"`).toBeAttached({
    timeout: SLOW,
  });
  await select.selectOption({ value: (await option.first().getAttribute("value")) ?? "" });
}

/** Clears the lot of a component on the batch form. */
export async function clearBatchLot(page: Page, component: string) {
  await lotPicker(page, component).selectOption({ value: "" });
}

/** The option texts of a lot picker (without "No lot recorded"). */
export async function lotOptionTexts(page: Page, component: string): Promise<string[]> {
  const texts = await lotPicker(page, component).locator("option").allTextContents();
  return texts.filter((t) => t !== "No lot recorded");
}

/** Saves the batch edit form on the batch page and waits for the success line. */
export async function saveBatchChanges(page: Page) {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible({ timeout: SLOW });
}

/** Creates a batch from the formula page with a date, an optional label and lots ({component: lotText}). Returns the batch id. */
export async function createLotBatch(
  page: Page,
  formulaUrl: string,
  formulaName: string,
  spec: { date: string; label?: string; lots?: Record<string, string> },
): Promise<string> {
  await page.goto(formulaUrl);
  await waitForHeading(page, formulaName);
  await openCreateForm(page);
  await productionDate(page).fill(spec.date);
  if (spec.label !== undefined) await batchLabel(page).fill(spec.label);
  for (const [component, lotText] of Object.entries(spec.lots ?? {})) {
    await setBatchLot(page, component, lotText);
  }
  return submitCreate(page);
}

/** The "Recorded lots" section of the batch page. */
export const lotsSection = (p: Page) => visible(p.getByRole("region", { name: "Recorded lots" }));
export const lotDetailRows = (p: Page) => lotsSection(p).getByTestId("lot-detail-row");
/** The row of one component, found by its material name. */
export const lotDetailRow = (p: Page, material: string) =>
  lotDetailRows(p).filter({ hasText: material });

/** Picker block "Add a wick" quick-add, as the other helpers do for wax and oils. */
async function quickAddWick(page: Page, name: string) {
  const label = "Wick (optional)";
  const box = page.getByTestId("material-picker").filter({
    has: page.getByRole("combobox", { name: label, exact: true }),
  });
  const open = box.getByRole("button", { name: "Add a wick" });
  const nameField = box.getByLabel("Add a wick: name");
  await expect(open.or(nameField)).toBeVisible({ timeout: SLOW });
  if (await open.isVisible()) await open.click();
  await nameField.fill(name);
  await box.getByRole("button", { name: "Add and select" }).click();
  await expect(
    box.getByRole("combobox", { name: label, exact: true }).locator("option:checked"),
  ).toHaveText(name, { timeout: SLOW });
}

/** WE-5 plus a wick (so a batch can record a wick lot). Needs an empty library. Ends on the formula page. */
export async function buildWE5WithWick(page: Page, wick: string) {
  await openNewFormula(page);
  await fillWE5(page);
  await quickAddWick(page, wick);
  await expectWE5Panel(page);
  await saveFromEditor(page);
  await waitForHeading(page, WE5.name);
}

/**
 * A second, simple formula (one wax, one oil) built from materials already in
 * the library. Ends on its formula page; returns that page's URL.
 */
export async function buildSecondFormula(page: Page, name: string): Promise<string> {
  await page.goto("/formulas/new");
  await waitForHeading(page, "New formula");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Total mixture weight (g)").fill("1000");
  await page.getByLabel("Fragrance percentage (%)").fill("8");
  await page.getByRole("combobox", { name: "Wax", exact: true }).selectOption({ label: WE5.wax });
  await page
    .getByRole("combobox", { name: "Oil 1", exact: true })
    .selectOption({ label: WE5.oils[0].name });
  await page.getByRole("button", { name: "Save formula" }).click();
  await expect(page).toHaveURL(/\/formulas\/[^/?]+(\?saved=1)?$/, { timeout: SLOW });
  await expect(page.getByText("Saved as version 1")).toBeVisible({ timeout: SLOW });
  await waitForHeading(page, name);
  return page.url().split("?")[0];
}

// ---- /batches: search, filters, count ----

export const searchBox = (p: Page) => visible(p.getByRole("searchbox", { name: "Search batches" }));
export const filterToggle = (p: Page) => visible(p.getByRole("button", { name: /^Filters/ }));
export const clearFiltersButton = (p: Page) => visible(p.getByRole("button", { name: "Clear filters" }));
export const exportCsvButton = (p: Page) => visible(p.getByRole("button", { name: "Export CSV" }));
export const batchRows = (p: Page) => p.getByTestId("batch-row").filter({ visible: true });

export const FILTER_LABELS = {
  formula: "Formula",
  from: "Produced from",
  to: "Produced to",
  lot: "Lot",
  supplier: "Supplier",
  cure: "Cure plan",
  burn: "Burn tests",
} as const;

/** A filter control on /batches by its label. */
export const filterField = (p: Page, key: keyof typeof FILTER_LABELS): Locator =>
  visible(p.getByLabel(FILTER_LABELS[key], { exact: true }));

export async function openBatches(page: Page, query = "") {
  await page.goto(`/batches${query}`);
  await waitForHeading(page, "Batches");
  await expect(page.getByText("Loading batches…")).toHaveCount(0, { timeout: SLOW });
  await expect(searchBox(page)).toBeVisible({ timeout: SLOW });
}

/** Waits for the "N of M batches" line. */
export async function expectCount(page: Page, shown: number, total: number) {
  const text = `${shown} of ${total} ${total === 1 ? "batch" : "batches"}`;
  await expect(visible(page.getByText(text, { exact: true }))).toBeVisible({ timeout: SLOW });
}

/** The titles of the listed batches, in order. */
export async function listedBatchTitles(page: Page): Promise<string[]> {
  const rows = batchRows(page);
  const count = await rows.count();
  const titles: string[] = [];
  for (let i = 0; i < count; i++) {
    titles.push((await rows.nth(i).getByRole("link").first().innerText()).trim());
  }
  return titles;
}

/** Types into the search box and waits for the URL to carry the (debounced) query. */
export async function search(page: Page, text: string) {
  await searchBox(page).fill(text);
  await searchBox(page).press("Enter");
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === text.trim(), { timeout: SLOW });
}

/** Today as YYYYMMDD (local), the date in the CSV file name. */
export function todayStamp(date = new Date()): string {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

const FILTER_PARAMS = {
  from: "from",
  to: "to",
} as const;

/**
 * Sets a date filter and waits for the URL to carry it. The list reads the
 * URL, so two changes made before the first one lands would race.
 */
export async function setDateFilter(page: Page, key: keyof typeof FILTER_PARAMS, value: string) {
  await filterField(page, key).fill(value);
  await expect(page).toHaveURL((u) => (u.searchParams.get(FILTER_PARAMS[key]) ?? "") === value, {
    timeout: SLOW,
  });
}

/** Chooses an option of a select filter by its text and waits until the control shows it (the URL has been applied). */
export async function setSelectFilter(
  page: Page,
  key: Exclude<keyof typeof FILTER_LABELS, "from" | "to">,
  label: string,
) {
  const field = filterField(page, key);
  await field.selectOption({ label });
  await expect(field.locator("option:checked")).toHaveText(label, { timeout: SLOW });
}
