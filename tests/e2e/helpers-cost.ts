import { expect, type Locator, type Page } from "@playwright/test";
import { MESSAGES } from "@/lib/messages";
import { WB1_EXPECTED, WB1_INPUTS } from "../fixtures/cost-worked-batch";
import { SLOW, WE5, measuredInput, saveFromEditor, waitForHeading } from "./helpers-flow";
import {
  createSupplier,
  expectDone,
  fillLot,
  lotEditor,
  openAddLot,
  openLots,
  saveBatchChanges,
  setBatchLot,
} from "./helpers-lots";
import { batchLabel, openBatch, openCreateForm, productionDate, submitCreate, visible } from "./helpers-schedule";

/*
 * Helpers for the v0.3 TrueCandle Cost e2e tests. Screens only, never seeded
 * state, so the upgrade-chain test can reuse `recordCostThroughScreens` on a
 * real profile. Every locator looks at visible elements only: Next keeps
 * earlier routes mounted, hidden.
 */

export { SLOW, visible, waitForHeading };

export const COST = MESSAGES.cost;

/** A test id among the visible elements only. */
export const tid = (page: Page, id: string): Locator => page.getByTestId(id).filter({ visible: true });

/** A visible field by its exact label. */
export const field = (page: Page, label: string): Locator =>
  visible(page.getByLabel(label, { exact: true }));

/** The fictional names the WB-1 tests use. */
export const WB1 = {
  formula: "Demo Cost Candle",
  wax: "Demo Soy Wax",
  oilA: "Demo Oil A",
  oilB: "Demo Oil B",
  wick: "Demo Wick",
  vessel: "Demo Vessel",
  supplier: "Demo Supply Co",
  items: { label: "Label", giftBox: "Gift box", carton: "Shipping carton" },
} as const;

// ---- materials: quick-add in the formula editor, default prices ----

async function quickAdd(page: Page, label: string, group: string, name: string) {
  const box = page.getByTestId("material-picker").filter({
    has: page.getByRole("combobox", { name: label, exact: true }),
  });
  const open = box.getByRole("button", { name: group });
  const nameField = box.getByLabel(`${group}: name`);
  await expect(open.or(nameField)).toBeVisible({ timeout: SLOW });
  if (await open.isVisible()) await open.click();
  await nameField.fill(name);
  await box.getByRole("button", { name: "Add and select" }).click();
  await expect(
    box.getByRole("combobox", { name: label, exact: true }).locator("option:checked"),
  ).toHaveText(name, { timeout: SLOW });
}

/**
 * Builds the WB-1 formula through the editor: one wax, oil A and oil B in
 * 4 : 1 parts, a wick and a vessel, 0.01 g precision. The library must be
 * empty. Ends on the formula page; returns its URL.
 */
export async function buildWB1Formula(page: Page): Promise<string> {
  await page.goto("/formulas/new");
  await waitForHeading(page, "New formula");
  await page.getByLabel("Name", { exact: true }).fill(WB1.formula);
  await page.getByLabel("Total mixture weight (g)").fill("1000");
  await page.getByLabel("Fragrance percentage (%)").fill("8");
  await page.getByRole("radio", { name: "0.01 g" }).check();
  await quickAdd(page, "Wax", "Add a wax", WB1.wax);
  await quickAdd(page, "Oil 1", "Add an oil", WB1.oilA);
  await page.getByRole("button", { name: "+ Add oil" }).click();
  await quickAdd(page, "Oil 2", "Add an oil", WB1.oilB);
  await page.getByLabel("Parts (Oil 1)").fill("4");
  await page.getByLabel("Parts (Oil 2)").fill("1");
  await quickAdd(page, "Wick (optional)", "Add a wick", WB1.wick);
  await quickAdd(page, "Vessel (optional)", "Add a vessel", WB1.vessel);
  await saveFromEditor(page);
  await waitForHeading(page, WB1.formula);
  return page.url().split("?")[0];
}

export async function openMaterials(page: Page) {
  await page.goto("/materials");
  await waitForHeading(page, "Materials");
  await expect(visible(page.getByTestId("material-row")).first()).toBeVisible({ timeout: SLOW });
}

/** Sets (or, with "", clears) a material's default price on /materials and waits for "Saved.". */
export async function setDefaultPrice(page: Page, material: string, price: string) {
  await openMaterials(page);
  const row = visible(page.getByTestId("material-row")).filter({ hasText: material });
  await row.getByRole("button", { name: material, exact: true }).first().click();
  const editor = visible(page.getByTestId("material-editor"));
  await expect(editor).toBeVisible({ timeout: SLOW });
  await editor.getByLabel(/^Default price (per kg|each) in pesos/).fill(price);
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Saved.");
  await expect(visible(page.getByTestId("material-editor"))).toHaveCount(0);
}

// ---- lots: purchase prices ----

export type Purchase = { paid: string; quantity: string; unit?: "kg" | "g" };

async function fillPurchase(page: Page, purchase: Purchase) {
  const sheet = lotEditor(page);
  await sheet.getByLabel(/^Amount paid in pesos/).fill(purchase.paid);
  await sheet.getByLabel(/^Quantity received/).fill(purchase.quantity);
  if (purchase.unit !== undefined && (await sheet.getByLabel("Unit", { exact: true }).count()) > 0) {
    await sheet.getByLabel("Unit", { exact: true }).selectOption({ label: purchase.unit });
  }
}

/** Adds a lot with a purchase on /materials/lots. */
export async function createPricedLot(
  page: Page,
  lot: { material: string; supplier?: string; code: string; purchase: Purchase },
) {
  await openLots(page);
  await openAddLot(page);
  // The material first: it decides whether the quantity is kg or g, or pieces.
  await fillLot(page, { material: lot.material, supplier: lot.supplier, code: lot.code });
  await fillPurchase(page, lot.purchase);
  await lotEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Added.");
  await expect(lotEditor(page)).toHaveCount(0);
}

/** Records (or changes) the purchase of an existing lot. */
export async function recordPurchase(page: Page, code: string, purchase: Purchase) {
  await openLots(page);
  await visible(page.getByRole("button", { name: `Edit lot ${code}`, exact: true })).click();
  await expect(lotEditor(page)).toBeVisible({ timeout: SLOW });
  await fillPurchase(page, purchase);
  await lotEditor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Saved.");
  await expect(lotEditor(page)).toHaveCount(0);
}

// ---- packaging and other items ----

export async function openItems(page: Page) {
  await page.goto("/materials/items");
  await waitForHeading(page, "Packaging and items");
  await expect(page.getByText("Loading items…")).toHaveCount(0, { timeout: SLOW });
}

export const itemEditor = (p: Page) => visible(p.getByTestId("item-editor"));

export async function addPackagingItem(page: Page, name: string, price: string) {
  await openItems(page);
  await page.getByRole("button", { name: "Add item" }).first().click();
  const sheet = itemEditor(page);
  await expect(sheet).toBeVisible({ timeout: SLOW });
  await sheet.getByLabel("Name", { exact: true }).fill(name);
  await sheet.getByLabel("Price each in pesos").fill(price);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expectDone(page, "Added.");
  await expect(itemEditor(page)).toHaveCount(0);
}

// ---- batches ----

export const countsMade = (p: Page) => field(p, "Candles made (optional)");
export const countsSellable = (p: Page) => field(p, "Sellable (optional)");

/** Types the candle counts on the open batch form (create or edit). */
export async function fillCounts(page: Page, made: string, sellable: string) {
  await countsMade(page).fill(made);
  await countsSellable(page).fill(sellable);
}

/** Opens a batch, sets its counts and saves ("Changes saved"). */
export async function setBatchCounts(page: Page, batchId: string, heading: string, made: string, sellable: string) {
  await openBatch(page, batchId, heading);
  await fillCounts(page, made, sellable);
  await saveBatchChanges(page);
}

export type WB1Batch = { label?: string; made: string; sellable: string };

/**
 * Creates the WB-1 batch from the formula page: measured weights, the three
 * lots linked, candle counts. Returns the batch id.
 */
export async function createWB1Batch(page: Page, formulaUrl: string, spec: WB1Batch): Promise<string> {
  await page.goto(formulaUrl);
  await waitForHeading(page, WB1.formula);
  await openCreateForm(page);
  await productionDate(page).fill("2026-11-20");
  await batchLabel(page).fill(spec.label ?? WB1_INPUTS.batchLabel);
  await measuredInput(page, WB1.wax).fill("1630.50");
  await measuredInput(page, WB1.oilA).fill("130.44");
  await measuredInput(page, WB1.oilB).fill("32.61");
  await setBatchLot(page, WB1.wax, WB1_INPUTS.lot.soy.code);
  await setBatchLot(page, WB1.oilB, WB1_INPUTS.lotOilB.code);
  await setBatchLot(page, `wick ${WB1.wick}`, WB1_INPUTS.lotWick.code);
  await fillCounts(page, spec.made, spec.sellable);
  return submitCreate(page);
}

/**
 * Everything WB-1 needs before a sheet: formula, default prices, supplier,
 * three priced lots, three packaging items and the batch. Returns the formula
 * URL and the batch id.
 */
export async function setUpWB1(page: Page): Promise<{ formulaUrl: string; batchId: string }> {
  const formulaUrl = await buildWB1Formula(page);
  await setDefaultPrice(page, WB1.oilA, WB1_INPUTS.defaultPrices.fragranceOilA);
  await setDefaultPrice(page, WB1.vessel, WB1_INPUTS.defaultPrices.vessel);
  await createSupplier(page, WB1.supplier);
  const { soy } = WB1_INPUTS.lot;
  await createPricedLot(page, {
    material: WB1.wax,
    supplier: WB1.supplier,
    code: soy.code,
    purchase: { paid: soy.paid, quantity: soy.received, unit: soy.unit },
  });
  const oilB = WB1_INPUTS.lotOilB;
  await createPricedLot(page, {
    material: WB1.oilB,
    supplier: WB1.supplier,
    code: oilB.code,
    purchase: { paid: oilB.paid, quantity: oilB.received, unit: oilB.unit },
  });
  const wick = WB1_INPUTS.lotWick;
  await createPricedLot(page, {
    material: WB1.wick,
    supplier: WB1.supplier,
    code: wick.code,
    purchase: { paid: wick.paid, quantity: wick.received },
  });
  await addPackagingItem(page, WB1.items.label, WB1_INPUTS.items.label.price);
  await addPackagingItem(page, WB1.items.giftBox, WB1_INPUTS.items.giftBox.price);
  await addPackagingItem(page, WB1.items.carton, WB1_INPUTS.items.shippingCarton.price);
  const batchId = await createWB1Batch(page, formulaUrl, {
    made: String(WB1_INPUTS.candlesMade),
    sellable: String(WB1_INPUTS.sellable),
  });
  return { formulaUrl, batchId };
}

// ---- cost sheets ----

export const sheetIdFromUrl = (page: Page): string => new URL(page.url()).pathname.split("/")[2];

/** On the new-sheet form: clicks "Create cost sheet" and waits for the editor. Returns the sheet id. */
export async function submitNewSheet(page: Page): Promise<string> {
  await visible(page.getByRole("button", { name: COST.createButton })).click();
  await expect(page).toHaveURL(/\/costs\/[0-9a-f-]{36}\/edit$/, { timeout: SLOW });
  await waitForHeading(page, COST.editTitle);
  await expect(field(page, COST.titleLabel)).toBeVisible({ timeout: SLOW });
  return sheetIdFromUrl(page);
}

/** From a batch page: "New cost sheet", optional title, Create. Ends in the editor; returns the sheet id. */
export async function createSheetFromBatch(
  page: Page,
  batchId: string,
  spec: { title?: string; made?: string; sellable?: string } = {},
): Promise<string> {
  await page.goto(`/batches/${batchId}`);
  await expect(tid(page, "cost-section")).toBeVisible({ timeout: SLOW });
  await tid(page, "cost-section").getByRole("link", { name: COST.newSheet }).click();
  await expect(page).toHaveURL(/\/costs\/new\?batch=/, { timeout: SLOW });
  await waitForHeading(page, COST.newTitle);
  await expect(field(page, COST.candlesLabel)).toBeVisible({ timeout: SLOW });
  if (spec.title !== undefined) await field(page, COST.titleLabel).fill(spec.title);
  if (spec.made !== undefined) await field(page, COST.candlesLabel).fill(spec.made);
  if (spec.sellable !== undefined) await field(page, COST.sellableLabel).fill(spec.sellable);
  return submitNewSheet(page);
}

/** From the formula page: "New cost sheet from version n", optional fields. Ends on the new-sheet form. */
export async function openNewSheetFromVersion(page: Page, formulaUrl: string, formulaName: string, version = 1) {
  await page.goto(formulaUrl);
  await waitForHeading(page, formulaName);
  await tid(page, "cost-section")
    .getByRole("link", { name: COST.newSheetFromVersion(version) })
    .click();
  await expect(page).toHaveURL(/\/costs\/new\?version=/, { timeout: SLOW });
  await waitForHeading(page, COST.newTitle);
  await expect(field(page, COST.candlesLabel)).toBeVisible({ timeout: SLOW });
}

export const saveSheetButton = (p: Page) => visible(p.getByRole("button", { name: COST.save, exact: true }));

/** Clicks Save in the editor and waits for the "Saved" feedback. */
export async function saveSheet(page: Page) {
  await saveSheetButton(page).click();
  await expect(visible(page.getByText(COST.saved, { exact: true }))).toBeVisible({ timeout: SLOW });
}

/** From the editor (after a save): follow "Back to the cost sheet" and wait for the sheet page. */
export async function backToSheet(page: Page) {
  await visible(page.getByRole("link", { name: COST.backToSheet })).click();
  await expect(page).toHaveURL(/\/costs\/[0-9a-f-]{36}$/, { timeout: SLOW });
  await expect(tid(page, "cost-per-sellable").or(tid(page, "cost-per-sellable-none"))).toBeVisible({
    timeout: SLOW,
  });
}

export async function openSheet(page: Page, sheetId: string) {
  await page.goto(`/costs/${sheetId}`);
  await expect(tid(page, "cost-results")).toBeVisible({ timeout: SLOW });
}

export async function openSheetEditor(page: Page, sheetId: string) {
  await page.goto(`/costs/${sheetId}/edit`);
  await waitForHeading(page, COST.editTitle);
  await expect(field(page, COST.titleLabel)).toBeVisible({ timeout: SLOW });
}

/** The "Add from list" picker plus button: adds a packaging item as a new line. */
export async function addItemFromList(page: Page, name: string) {
  const before = await tid(page, "cost-edit-item").count();
  await field(page, COST.itemPickerLabel).selectOption({ label: name });
  await visible(page.getByRole("button", { name: COST.itemAddFromList })).click();
  await expect(tid(page, "cost-edit-item")).toHaveCount(before + 1);
}

/** Sets how an item line is charged and its quantity (line `index`, 0-based). */
export async function setItemLine(page: Page, index: number, spec: { per?: "sellable" | "batch"; quantity?: string }) {
  const line = tid(page, "cost-edit-item").nth(index);
  if (spec.per !== undefined) {
    await line.getByLabel(COST.itemPer, { exact: true }).selectOption(spec.per);
  }
  if (spec.quantity !== undefined) await line.getByLabel(COST.itemQuantity, { exact: true }).fill(spec.quantity);
}

export async function setLabour(page: Page, hours: string, rate: string) {
  await field(page, COST.labourHoursLabel).fill(hours);
  await field(page, COST.labourRateLabel).fill(rate);
}

export async function setOverheadPercent(page: Page, percent: string) {
  await visible(page.getByRole("radio", { name: COST.overheadPercent })).check();
  await field(page, COST.overheadPercentLabel).fill(percent);
}

export const scenarioGroup = (p: Page, name: "Wholesale" | "Retail") =>
  visible(p.getByRole("group", { name: COST.scenarioModeLabel(name) }));

export async function setScenarioMargin(page: Page, name: "Wholesale" | "Retail", percent: string) {
  await scenarioGroup(page, name).getByRole("radio", { name: COST.scenarioModeMargin }).check();
  await field(page, COST.scenarioMarginLabel(name)).fill(percent);
}

export async function setScenarioPrice(page: Page, name: "Wholesale" | "Retail", pesos: string) {
  await scenarioGroup(page, name).getByRole("radio", { name: COST.scenarioModePrice }).check();
  await field(page, COST.scenarioPriceLabel(name)).fill(pesos);
}

export const vatSwitch = (p: Page) => visible(p.getByRole("switch", { name: COST.vatSwitch }));

/** The price group of a material line in the editor. */
export const linePriceGroup = (p: Page, material: string) =>
  visible(p.getByRole("group", { name: COST.linePriceLegend(material) }));

// ---- reading figures ----

/** A figure by its test id, among the visible elements. */
export async function expectFigure(page: Page, testId: string, text: string) {
  await expect(tid(page, testId), testId).toHaveText(text, { timeout: SLOW });
}

/** The WB-1 totals, per sellable candle and its four parts. */
export async function expectWB1Totals(page: Page) {
  const e = WB1_EXPECTED;
  await expectFigure(page, "cost-materials", e.materials);
  await expectFigure(page, "cost-labour", e.labour);
  await expectFigure(page, "cost-overhead", e.overhead);
  await expectFigure(page, "cost-production", e.production);
  await expectFigure(page, "cost-per-candle-made", e.perCandleMade);
  await expectFigure(page, "cost-non-sellable", e.nonSellableCost);
  await expectFigure(page, "cost-testing", e.testing);
  await expectFigure(page, "cost-packaging", e.packaging);
  await expectFigure(page, "cost-batch-total", e.batchTotal);
  await expectFigure(page, "cost-per-sellable", e.perSellable);
  await expectFigure(page, "cost-part-production", e.breakdown.production);
  await expectFigure(page, "cost-part-nonsellable", e.breakdown.nonSellableShare);
  await expectFigure(page, "cost-part-testing", e.breakdown.testing);
  await expectFigure(page, "cost-part-packaging", e.breakdown.packaging);
}

/** The cells of one scenario column, top to bottom (the first cell is the price). */
export async function scenarioColumn(page: Page, name: "wholesale" | "retail"): Promise<string[]> {
  const scenarios = tid(page, "cost-scenarios");
  const heads = scenarios.locator("thead th[data-testid]");
  const count = await heads.count();
  let index = -1;
  for (let i = 0; i < count; i++) {
    if ((await heads.nth(i).getAttribute("data-testid")) === `scenario-${name}`) index = i;
  }
  expect(index, `${name} column`).toBeGreaterThanOrEqual(0);
  const rows = scenarios.locator("tbody tr");
  const n = await rows.count();
  const cells: string[] = [];
  for (let r = 0; r < n; r++) cells.push((await rows.nth(r).locator("td").nth(index).innerText()).trim());
  return cells;
}

/** Waits until a scenario column reads exactly `expected` (labels in the row-th order of the table). */
export async function expectScenario(page: Page, name: "wholesale" | "retail", expected: string[]) {
  await expect.poll(() => scenarioColumn(page, name), { timeout: SLOW }).toEqual(expected);
}

// ---- the upgrade chain ----

/**
 * The real-profile upgrade chain (`tests/upgrade-chain/chain.spec.ts`, phase
 * cost7): on a profile where WE-5 exists with a "C6-01" batch whose wax row
 * links lot "LOT-C6-001", record prices, candle counts and a cost sheet
 * through the screens. Ends on the sheet page with the cost per sellable
 * candle showing.
 */
export async function recordCostThroughScreens(page: Page, batchId: string): Promise<void> {
  await setDefaultPrice(page, WE5.wax, "180.00");
  await recordPurchase(page, "LOT-C6-001", { paid: "3600.00", quantity: "20", unit: "kg" });
  await setBatchCounts(page, batchId, "C6-01", "6", "5");
  await createSheetFromBatch(page, batchId, { title: "Chain cost sheet" });
  await saveSheet(page);
  await backToSheet(page);
  await expect(tid(page, "cost-per-sellable")).toBeVisible({ timeout: SLOW });
}
