import { test, expect, type Page } from "@playwright/test";
import { WB1_EXPECTED, WB1_INPUTS } from "../fixtures/cost-worked-batch";
import { WE5 } from "./helpers-flow";
import {
  COST,
  WB1,
  addItemFromList,
  addPackagingItem,
  backToSheet,
  countsMade,
  countsSellable,
  expectFigure,
  expectScenario,
  expectWB1Totals,
  field,
  fillCounts,
  linePriceGroup,
  openNewSheetFromVersion,
  openSheet,
  openSheetEditor,
  recordPurchase,
  saveSheet,
  saveSheetButton,
  setDefaultPrice,
  setItemLine,
  setLabour,
  setOverheadPercent,
  setScenarioMargin,
  setScenarioPrice,
  setUpWB1,
  sheetIdFromUrl,
  submitNewSheet,
  tid,
  vatSwitch,
  visible,
  waitForHeading,
  SLOW,
} from "./helpers-cost";
import { buildWE5, cleanContext, createBatch, formulaMenu, openBatch } from "./helpers-schedule";
import { lotRow, openLots, saveBatchChanges } from "./helpers-lots";

test.use({ viewport: { width: 1280, height: 800 } });
test.setTimeout(300_000);

const E = WB1_EXPECTED;

/** A cost sheet row of the list. */
const sheetRows = (page: Page) => tid(page, "cost-sheet-row");

/** From a batch page: opens the new-sheet form. */
async function openNewSheetFromBatch(page: Page, batchId: string) {
  await page.goto(`/batches/${batchId}`);
  await expect(tid(page, "cost-section")).toBeVisible({ timeout: SLOW });
  await tid(page, "cost-section").getByRole("link", { name: COST.newSheet }).click();
  await expect(page).toHaveURL(/\/costs\/new\?batch=/, { timeout: SLOW });
  await waitForHeading(page, COST.newTitle);
  await expect(field(page, COST.candlesLabel)).toBeVisible({ timeout: SLOW });
}

/** A saved version-1 formula (WE-5) and a version cost sheet for it with 6 candles. Ends in the editor. */
async function versionSheetOf(page: Page, formulaUrl: string, made = "6", sellable = made): Promise<string> {
  await openNewSheetFromVersion(page, formulaUrl, WE5.name);
  await field(page, COST.candlesLabel).fill(made);
  await field(page, COST.sellableLabel).fill(sellable);
  return submitNewSheet(page);
}

test.describe("WB-1 through the screens", () => {
  test.describe.configure({ mode: "serial" });
  let page: Page;
  let batchId = "";
  let sheetId = "";

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page } = await cleanContext(browser, testInfo));
  });
  test.afterAll(async () => {
    await page?.context().close();
  });

  test("prices, lots, packaging and a batch, then a cost sheet that reproduces every WB-1 figure, VAT off and on", async () => {
    const set = await setUpWB1(page);
    batchId = set.batchId;

    // The price fields show up where the maker entered them.
    await page.goto("/materials");
    await waitForHeading(page, "Materials");
    const oilRow = visible(page.getByTestId("material-row")).filter({ hasText: WB1.oilA });
    await expect(oilRow.getByTestId("material-price")).toHaveText("₱1,850.00 per kg", { timeout: SLOW });
    const vesselRow = visible(page.getByTestId("material-row")).filter({ hasText: WB1.vessel });
    await expect(vesselRow.getByTestId("material-price")).toHaveText("₱38.50 each");
    await openLots(page);
    await expect(lotRow(page, WB1_INPUTS.lot.soy.code)).toContainText("₱217.50 per kg");
    await expect(lotRow(page, WB1_INPUTS.lotOilB.code)).toContainText("₱2,550.00 per kg");
    await expect(lotRow(page, WB1_INPUTS.lotWick.code)).toContainText("₱4.50 each");
    await page.goto("/materials/items");
    await waitForHeading(page, "Packaging and items");
    await expect(tid(page, "item-row")).toHaveCount(3, { timeout: SLOW });
    await expect(tid(page, "item-row").filter({ hasText: WB1.items.carton })).toContainText("₱45.00");

    // The batch records its counts.
    await openBatch(page, batchId, WB1_INPUTS.batchLabel);
    await expect(tid(page, "batch-counts")).toHaveText("12 made, 10 sellable");
    await expect(countsMade(page)).toHaveValue("12");
    await expect(countsSellable(page)).toHaveValue("10");

    // Start the sheet from the batch: the counts come across.
    await openNewSheetFromBatch(page, batchId);
    await expect(field(page, COST.candlesLabel)).toHaveValue("12");
    await expect(field(page, COST.sellableLabel)).toHaveValue("10");
    await field(page, COST.titleLabel).fill("WB-1 costing");
    sheetId = await submitNewSheet(page);

    // The editor: items, labour, overhead, testing, scenarios.
    await addItemFromList(page, WB1.items.label);
    await addItemFromList(page, WB1.items.giftBox);
    await addItemFromList(page, WB1.items.carton);
    await setItemLine(page, 2, { per: "batch" });
    await setLabour(page, WB1_INPUTS.labourHours, WB1_INPUTS.labourRate);
    await setOverheadPercent(page, WB1_INPUTS.overheadPercent);
    await field(page, COST.testingLabelField).fill(WB1_INPUTS.testing);
    await setScenarioMargin(page, "Wholesale", WB1_INPUTS.wholesaleMargin);
    await setScenarioPrice(page, "Retail", WB1_INPUTS.retailPrice);
    // The live results already show the batch total and the cost per sellable candle.
    await expect(tid(page, "cost-live-results").getByTestId("cost-batch-total")).toHaveText(E.batchTotal, {
      timeout: SLOW,
    });
    await expect(tid(page, "cost-live-results").getByTestId("cost-per-sellable")).toHaveText(E.perSellable);
    await saveSheet(page);
    await backToSheet(page);

    // The sheet page: every material line with its price source.
    const lines = tid(page, "cost-material-line");
    await expect(lines).toHaveCount(5);
    const expectedLines = [
      { name: WB1.wax, qty: "1,630.50 g measured", source: "Lot SOY-DEMO-01: ₱4,350.00 for 20 kg" },
      { name: WB1.oilA, qty: "130.44 g measured", source: "Material price ₱1,850.00 per kg" },
      { name: WB1.oilB, qty: "32.61 g measured", source: "Lot FO-B-DEMO: ₱1,275.00 for 500 g" },
      { name: WB1.wick, qty: "1 per candle × 12", source: "Lot WICK-DEMO-7: ₱450.00 for 100 pieces" },
      { name: WB1.vessel, qty: "1 per candle × 12", source: "Material price ₱38.50 each" },
    ];
    for (const [i, line] of expectedLines.entries()) {
      const row = lines.nth(i);
      await expect(row, line.name).toContainText(line.name);
      await expect(row.getByTestId("cost-price-source"), line.name).toHaveText(line.source);
      await expect(row, line.name).toContainText(line.qty);
      await expect(row, line.name).toContainText(E.materialLines[i]);
    }
    const itemLines = tid(page, "cost-item-lines");
    for (const [i, name] of [WB1.items.label, WB1.items.giftBox, WB1.items.carton].entries()) {
      const row = itemLines.locator("li").nth(i);
      await expect(row).toContainText(name);
      await expect(row).toContainText(E.itemLines[i]);
    }
    await expect(itemLines.locator("li").nth(0)).toContainText("₱6.75 each · 1 per sellable candle × 10");
    await expect(itemLines.locator("li").nth(2)).toContainText("₱45.00 each · 1 per batch");

    // Totals, cost per sellable candle and its parts.
    await expectWB1Totals(page);
    await expect(tid(page, "cost-section")).toHaveCount(0);
    // Scenarios, VAT off.
    const w = E.vatOff.wholesale;
    const r = E.vatOff.retail;
    await expectScenario(page, "wholesale", [w.price, w.profit, w.margin, w.batchProfit]);
    await expectScenario(page, "retail", [r.price, r.profit, r.margin, r.batchProfit]);
    await expect(tid(page, "cost-scenarios")).toContainText("Set by target margin 40%");
    await expect(tid(page, "cost-scenarios")).toContainText("Set by price");

    // VAT on: prices include 12% VAT, margins on the price without it.
    await page.getByRole("link", { name: COST.edit, exact: true }).click();
    await waitForHeading(page, COST.editTitle);
    await expect(vatSwitch(page)).toBeVisible({ timeout: SLOW });
    await expect(vatSwitch(page)).not.toBeChecked();
    await vatSwitch(page).check();
    await saveSheet(page);
    await backToSheet(page);
    const wv = E.vatOn.wholesale;
    const rv = E.vatOn.retail;
    await expectScenario(page, "wholesale", [wv.price, wv.exVat, wv.vat, wv.profit, wv.margin, wv.batchProfit]);
    await expectScenario(page, "retail", [rv.price, rv.exVat, rv.vat, rv.profit, rv.margin, rv.batchProfit]);
    // The cost side does not move with the switch.
    await expectWB1Totals(page);
    await expect(tid(page, "cost-scenarios")).toContainText(COST.vatOnNote);

    // The batch page lists the sheet with its cost per sellable candle.
    await page.goto(`/batches/${batchId}`);
    const row = tid(page, "cost-section").getByTestId("cost-sheet-row");
    await expect(row).toHaveCount(1, { timeout: SLOW });
    await expect(row).toContainText("WB-1 costing");
    await expect(row).toContainText(`${E.perSellable} per sellable candle`);
    await expect(row).toContainText("12 made, 10 sellable");
    await expect(row.getByTestId("cost-incomplete-badge")).toHaveCount(0);
  });

  test("a saved sheet is a snapshot; Copy and update picks up new prices in a new sheet and the original stays", async () => {
    expect(sheetId, "the first test made the sheet").not.toBe("");
    await setDefaultPrice(page, WB1.oilA, "2000.00");
    await recordPurchase(page, WB1_INPUTS.lot.soy.code, { paid: "5220.00", quantity: "20", unit: "kg" });

    // The saved sheet still shows the old figures and sources.
    await openSheet(page, sheetId);
    await expectFigure(page, "cost-materials", E.materials);
    await expectFigure(page, "cost-per-sellable", E.perSellable);
    await expect(tid(page, "cost-material-line").nth(0)).toContainText(E.materialLines[0]);
    await expect(tid(page, "cost-price-source").nth(0)).toHaveText("Lot SOY-DEMO-01: ₱4,350.00 for 20 kg");
    await expect(tid(page, "cost-price-source").nth(1)).toHaveText("Material price ₱1,850.00 per kg");

    // Copy and update: a new sheet with the new prices.
    await page.getByRole("button", { name: COST.copyUpdate, exact: true }).click();
    await expect(page).toHaveURL((url) => /\/costs\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(sheetId), {
      timeout: SLOW,
    });
    const copyId = new URL(page.url()).pathname.split("/")[2];
    expect(copyId).not.toBe(sheetId);
    await expect(visible(page.getByText(COST.copiedNotice))).toBeVisible({ timeout: SLOW });
    const copiedFrom = tid(page, "cost-copied-from");
    await expect(copiedFrom).toContainText(COST.copiedFrom);
    await expect(copiedFrom.getByRole("link", { name: "WB-1 costing" })).toHaveAttribute("href", `/costs/${sheetId}`);
    // New prices: soy lot 5,220.00 for 20 kg, oil A 2,000.00 per kg.
    await expect(tid(page, "cost-price-source").nth(0)).toHaveText("Lot SOY-DEMO-01: ₱5,220.00 for 20 kg", {
      timeout: SLOW,
    });
    await expect(tid(page, "cost-price-source").nth(1)).toHaveText("Material price ₱2,000.00 per kg");
    await expect(tid(page, "cost-material-line").nth(0)).toContainText("₱425.56");
    await expect(tid(page, "cost-material-line").nth(1)).toContainText("₱260.88");
    await expectFigure(page, "cost-materials", "₱1,285.60");
    // Everything the maker typed on the sheet is carried over.
    await expectFigure(page, "cost-labour", E.labour);
    await expectFigure(page, "cost-testing", E.testing);
    await expectFigure(page, "cost-packaging", E.packaging);
    await expect(tid(page, "cost-scenarios")).toContainText(COST.vatOnNote);
    await expect(tid(page, "cost-per-sellable")).not.toHaveText(E.perSellable);

    // The original is unchanged and not marked as a copy.
    await openSheet(page, sheetId);
    await expectWB1Totals(page);
    await expect(tid(page, "cost-copied-from")).toHaveCount(0);
    await expect(tid(page, "cost-price-source").nth(0)).toHaveText("Lot SOY-DEMO-01: ₱4,350.00 for 20 kg");

    // Both sheets are listed.
    await page.goto("/costs");
    await waitForHeading(page, COST.listTitle);
    await expect(sheetRows(page)).toHaveCount(2, { timeout: SLOW });
  });
});

test("a version sheet needs candles made; a line with no price shows the incomplete warning until a price is typed", async ({ page }) => {
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  await setDefaultPrice(page, WE5.wax, "180.00");
  await setDefaultPrice(page, WE5.oils[0].name, "1500.00");
  await setDefaultPrice(page, WE5.oils[1].name, "1200.00");
  // Cedar has no price.

  await openNewSheetFromVersion(page, formulaUrl, WE5.name);
  // WE-5 was sized for 6 vessels: the form suggests 6.
  await expect(field(page, COST.candlesLabel)).toHaveValue("6");
  await expect(visible(page.getByText(COST.candlesHintVessels(6)))).toBeVisible();
  await field(page, COST.candlesLabel).fill("");
  await visible(page.getByRole("button", { name: COST.createButton })).click();
  await expect(visible(page.getByText(COST.errCandlesRequired))).toBeVisible();
  await expect(field(page, COST.candlesLabel)).toBeFocused();
  await expect(page).toHaveURL(/\/costs\/new\?version=/);
  await field(page, COST.candlesLabel).fill("6");
  await field(page, COST.titleLabel).fill("Version sheet");
  await expect(field(page, COST.sellableLabel)).toHaveValue("6");
  const sheetId = await submitNewSheet(page);

  // The editor: Cedar has no price, so the warning shows.
  const live = tid(page, "cost-live-results");
  await expect(live.getByText(COST.incompleteTitle)).toBeVisible({ timeout: SLOW });
  await expect(live).toContainText(COST.incompleteBody(1));
  const cedar = linePriceGroup(page, WE5.oils[2].name);
  await expect(cedar.getByTestId("cost-original-price")).toHaveText("No price");
  await expect(cedar.getByRole("radio", { name: COST.priceNone })).toBeChecked();
  // The other lines name the material price they got.
  await expect(linePriceGroup(page, WE5.wax).getByTestId("cost-original-price")).toHaveText("Material price ₱180.00 per kg");

  // The sheet is saved: its row on the formula page carries the Incomplete badge.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  const row = tid(page, "cost-section").getByTestId("cost-sheet-row");
  await expect(row).toHaveCount(1, { timeout: SLOW });
  await expect(row).toContainText("Version sheet");
  await expect(row).toContainText("From version 1 of");
  await expect(row.getByTestId("cost-incomplete-badge")).toBeVisible();

  // Type a price for Cedar: the warning goes.
  await openSheetEditor(page, sheetId);
  await expect(tid(page, "cost-live-results").getByText(COST.incompleteTitle)).toBeVisible({ timeout: SLOW });
  await linePriceGroup(page, WE5.oils[2].name).getByRole("radio", { name: COST.priceTyped }).check();
  await field(page, COST.priceTypedLabelKg(WE5.oils[2].name)).fill("1100.00");
  await expect(tid(page, "cost-live-results").getByText(COST.incompleteTitle)).toHaveCount(0);
  await saveSheet(page);
  await backToSheet(page);
  await expect(tid(page, "cost-results").getByText(COST.incompleteTitle)).toHaveCount(0);
  await expect(tid(page, "cost-price-source").nth(3)).toHaveText("Typed on this sheet: ₱1,100.00 per kg");
  await expect(tid(page, "cost-price-source").nth(0)).toHaveText("Material price ₱180.00 per kg");
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await expect(tid(page, "cost-section").getByTestId("cost-sheet-row")).toHaveCount(1, { timeout: SLOW });
  await expect(tid(page, "cost-section").getByTestId("cost-incomplete-badge")).toHaveCount(0);
});

test("field errors put focus on the first bad field; a good save says Saved; a double click makes one sheet", async ({ page }) => {
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  const batchId = await createBatch(page, formulaUrl, { date: "2026-11-20", label: "ERR-01" });

  // Batch form: sellable above made.
  await openBatch(page, batchId, "ERR-01");
  await fillCounts(page, "5", "7");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(visible(page.getByText("Sellable cannot be more than candles made."))).toBeVisible();
  await expect(countsSellable(page)).toBeFocused();
  await expect(page.getByText("Changes saved")).toHaveCount(0);
  // A candles made of 0 is refused too, and it is the first field.
  await countsMade(page).fill("0");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(visible(page.getByText("Enter a whole number from 1 to 100,000."))).toBeVisible();
  await expect(countsMade(page)).toBeFocused();
  await fillCounts(page, "5", "4");
  await saveBatchChanges(page);
  await expect(tid(page, "batch-counts")).toHaveText("5 made, 4 sellable");

  // New-sheet form: sellable above made, then candles missing.
  await openNewSheetFromBatch(page, batchId);
  await expect(field(page, COST.candlesLabel)).toHaveValue("5");
  await expect(field(page, COST.sellableLabel)).toHaveValue("4");
  await field(page, COST.sellableLabel).fill("9");
  await visible(page.getByRole("button", { name: COST.createButton })).click();
  await expect(visible(page.getByText(COST.errSellableOver))).toBeVisible();
  await expect(field(page, COST.sellableLabel)).toBeFocused();
  await expect(page).toHaveURL(/\/costs\/new\?batch=/);
  await field(page, COST.candlesLabel).fill("");
  await field(page, COST.sellableLabel).fill("4");
  await visible(page.getByRole("button", { name: COST.createButton })).click();
  await expect(visible(page.getByText(COST.errCandlesRequired))).toBeVisible();
  await expect(field(page, COST.candlesLabel)).toBeFocused();
  await field(page, COST.candlesLabel).fill("5");

  // A double click on Create makes one sheet only.
  await visible(page.getByRole("button", { name: COST.createButton })).dblclick();
  await expect(page).toHaveURL(/\/costs\/[0-9a-f-]{36}\/edit$/, { timeout: SLOW });
  await waitForHeading(page, COST.editTitle);
  await expect(field(page, COST.titleLabel)).toBeVisible({ timeout: SLOW });
  const sheetId = sheetIdFromUrl(page);
  await page.goto("/costs");
  await waitForHeading(page, COST.listTitle);
  await expect(sheetRows(page)).toHaveCount(1, { timeout: SLOW });
  await page.waitForTimeout(500);
  await expect(sheetRows(page)).toHaveCount(1);

  // Editor: three bad values at once. Focus goes to the first in the form.
  await openSheetEditor(page, sheetId);
  await setLabour(page, "3.5", "abc");
  await field(page, COST.testingLabelField).fill("1.234");
  await setScenarioMargin(page, "Wholesale", "100");
  await saveSheetButton(page).click();
  await expect(visible(page.getByText(COST.fixFields))).toBeVisible();
  await expect(visible(page.getByText(COST.errMoney))).toHaveCount(2);
  await expect(visible(page.getByText(COST.errMarginRange))).toHaveCount(1);
  await expect(field(page, COST.labourRateLabel)).toBeFocused();
  await expect(field(page, COST.labourRateLabel)).toHaveAttribute("aria-invalid", "true");
  await expect(visible(page.getByText(COST.saved, { exact: true }))).toHaveCount(0);
  // The results say they are from the last valid values.
  await expect(tid(page, "cost-live-results")).toContainText(COST.resultsStale);

  // Fix them one by one; each Save focuses what is left.
  await field(page, COST.labourRateLabel).fill("95.00");
  await saveSheetButton(page).click();
  await expect(field(page, COST.testingLabelField)).toBeFocused();
  await expect(visible(page.getByText(COST.errMoney))).toHaveCount(1);
  await field(page, COST.testingLabelField).fill("abc");
  await saveSheetButton(page).click();
  await expect(visible(page.getByText(COST.errMoney))).toHaveCount(1);
  await expect(field(page, COST.testingLabelField)).toBeFocused();
  await field(page, COST.testingLabelField).fill("150.00");
  await saveSheetButton(page).click();
  await expect(field(page, COST.scenarioMarginLabel("Wholesale"))).toBeFocused();
  await expect(visible(page.getByText(COST.errMarginRange))).toBeVisible();
  await field(page, COST.scenarioMarginLabel("Wholesale")).fill("40");
  await saveSheet(page);
  await expect(visible(page.getByText(COST.errMarginRange))).toHaveCount(0);
  await expect(visible(page.getByText(COST.fixFields))).toHaveCount(0);

  // Sellable above made in the editor.
  await countsInEditor(page, "5", "6");
  await saveSheetButton(page).click();
  await expect(visible(page.getByText(COST.errSellableOver))).toBeVisible();
  await expect(field(page, COST.sellableLabel)).toBeFocused();
  await countsInEditor(page, "5", "5");
  await saveSheet(page);
  // Saving again after a change shows Saved again; an edit clears the notice.
  await field(page, COST.titleLabel).fill("Renamed");
  await expect(visible(page.getByText(COST.saved, { exact: true }))).toHaveCount(0);
  await saveSheet(page);
  await backToSheet(page);
  await expect(page.getByRole("heading", { level: 1, name: "Renamed" })).toBeVisible();
  await expect(tid(page, "cost-per-sellable")).toBeVisible();
});

async function countsInEditor(page: Page, made: string, sellable: string) {
  await field(page, COST.candlesLabel).fill(made);
  await field(page, COST.sellableLabel).fill(sellable);
}

/** WE-5, a batch "DEL-01" with 4 candles and a cost sheet based on it. */
async function batchWithSheet(page: Page) {
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  const batchId = await createBatch(page, formulaUrl, { date: "2026-11-20", label: "DEL-01" });
  await openBatch(page, batchId, "DEL-01");
  await fillCounts(page, "4", "4");
  await saveBatchChanges(page);
  await openNewSheetFromBatch(page, batchId);
  await field(page, COST.titleLabel).fill("Sheet to delete");
  const sheetId = await submitNewSheet(page);
  return { formulaUrl, batchId, sheetId };
}

/** Deletes a sheet from its page through the confirmation. Ends on the list. */
async function deleteSheet(page: Page, sheetId: string) {
  await openSheet(page, sheetId);
  await page.getByRole("button", { name: COST.deleteButton, exact: true }).click();
  await page.getByRole("dialog", { name: COST.deleteTitle }).getByRole("button", { name: COST.deleteConfirm }).click();
  await expect(page).toHaveURL(/\/costs$/, { timeout: SLOW });
}

test("delete rules: the batch delete dialog says a cost sheet keeps the batch", async ({ page }) => {
  const { batchId } = await batchWithSheet(page);
  await openBatch(page, batchId, "DEL-01");
  await page.getByRole("button", { name: "Delete batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this batch?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/1 cost sheet/, { timeout: SLOW });
  await expect(dialog).not.toContainText("burn test");
  await expect(dialog.getByRole("button", { name: "Delete batch" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Keep batch" }).click();
  await expect(dialog).toBeHidden();
});

test("delete rules: a batch with a sheet is not deleted; after deleting the sheet it is", async ({ page }) => {
  const { batchId, sheetId } = await batchWithSheet(page);

  // Refused up front: the dialog offers no delete, and the batch is still there.
  await openBatch(page, batchId, "DEL-01");
  await page.getByRole("button", { name: "Delete batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this batch?" });
  await expect(dialog.getByTestId("delete-blocked-cost-sheets")).toBeVisible({ timeout: SLOW });
  await expect(dialog.getByRole("button", { name: "Delete batch" })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/batches/${batchId}$`));
  await dialog.getByRole("button", { name: "Keep batch" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await waitForHeading(page, "DEL-01");
  await expect(tid(page, "cost-section").getByTestId("cost-sheet-row")).toHaveCount(1, { timeout: SLOW });

  // Deleting a sheet asks first; keeping it changes nothing.
  await openSheet(page, sheetId);
  await page.getByRole("button", { name: COST.deleteButton, exact: true }).click();
  const sheetDialog = page.getByRole("dialog", { name: COST.deleteTitle });
  await expect(sheetDialog).toBeVisible();
  await expect(sheetDialog).toContainText("Sheet to delete will be removed from this device.");
  await sheetDialog.getByRole("button", { name: COST.deleteKeep }).click();
  await expect(sheetDialog).toBeHidden();
  await expect(tid(page, "cost-per-sellable")).toBeVisible();
  await deleteSheet(page, sheetId);
  await expect(page.getByText(COST.listEmptyTitle)).toBeVisible({ timeout: SLOW });
  await page.goto(`/costs/${sheetId}`);
  await waitForHeading(page, COST.notFoundTitle);

  // Now the batch can be deleted.
  await openBatch(page, batchId, "DEL-01");
  await page.getByRole("button", { name: "Delete batch" }).click();
  const again = page.getByRole("dialog", { name: "Delete this batch?" });
  await expect(again.getByRole("button", { name: "Delete batch" })).toBeEnabled({ timeout: SLOW });
  await again.getByRole("button", { name: "Delete batch" }).click();
  await expect(page).toHaveURL(/\/batches$/, { timeout: SLOW });
});

test("delete rules: the formula delete dialog says a version cost sheet keeps the formula", async ({ page }) => {
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  await versionSheetOf(page, formulaUrl);
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await formulaMenu(page, "Delete permanently");
  const refused = page.getByRole("dialog");
  await expect(refused).toBeVisible({ timeout: SLOW });
  await expect(refused.getByText("This formula cannot be deleted")).toBeVisible({ timeout: SLOW });
  await expect(refused).toContainText(/1 cost sheet/);
  await expect(refused).not.toContainText("batch");
  await expect(refused.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
  await refused.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(refused).toBeHidden();
});

test("delete rules: a formula with a version sheet is not deleted; after deleting the sheet it is", async ({ page }) => {
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  const sheetId = await versionSheetOf(page, formulaUrl);

  // Refused up front: the dialog offers no delete, and the formula is still there.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await formulaMenu(page, "Delete permanently");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("formula-delete-blocked-cost-sheets")).toBeVisible({ timeout: SLOW });
  await expect(dialog.getByRole("button", { name: "Close", exact: true }).first()).toBeVisible({ timeout: SLOW });
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(dialog).toBeHidden();
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);

  await deleteSheet(page, sheetId);
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await formulaMenu(page, "Delete permanently");
  const confirm = page.getByRole("dialog", { name: "Delete this formula permanently?" });
  await expect(confirm.getByRole("button", { name: "Delete permanently" })).toBeEnabled({ timeout: SLOW });
  await expect(confirm.getByText("This formula cannot be deleted")).toHaveCount(0);
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).not.toHaveURL(new RegExp(formulaUrl.split("/").pop()! + "$"), { timeout: SLOW });
});

test("deleting a packaging item a sheet used keeps the sheet's line", async ({ page }) => {
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  await addPackagingItem(page, "Ribbon", "3.25");
  const sheetId = await versionSheetOf(page, formulaUrl, "6", "6");
  await addItemFromList(page, "Ribbon");
  await saveSheet(page);

  await page.goto("/materials/items");
  await waitForHeading(page, "Packaging and items");
  await page.getByRole("button", { name: "Delete item Ribbon", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this item?" });
  await expect(dialog).toContainText("1 cost sheet will keep its own copy.", { timeout: SLOW });
  await dialog.getByRole("button", { name: "Delete item", exact: true }).click();
  await expect(visible(page.getByText(/(^|\s)Deleted\.$/))).toBeVisible({ timeout: SLOW });
  await expect(tid(page, "item-row")).toHaveCount(0);

  await openSheet(page, sheetId);
  const items = tid(page, "cost-item-lines");
  await expect(items).toContainText("Ribbon");
  await expect(items).toContainText("₱3.25 each · 1 per sellable candle × 6");
  await expect(items).toContainText("₱19.50");
  // The editor still opens the line, as a one-off.
  await openSheetEditor(page, sheetId);
  await expect(tid(page, "cost-edit-item")).toHaveCount(1);
  await expect(tid(page, "cost-edit-item").getByLabel(COST.itemName, { exact: true })).toHaveValue("Ribbon");
});

test("0 sellable: no cost per candle, and the scenarios say why", async ({ page }) => {
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  const sheetId = await versionSheetOf(page, formulaUrl, "4", "0");
  await setScenarioMargin(page, "Wholesale", "40");
  await setScenarioPrice(page, "Retail", "250.00");
  const live = tid(page, "cost-live-results");
  await expect(live.getByTestId("cost-per-sellable-none")).toHaveText(COST.perSellableNone, { timeout: SLOW });
  await expect(live.getByTestId("cost-per-sellable")).toHaveCount(0);
  await saveSheet(page);
  await backToSheet(page);

  await expect(tid(page, "cost-per-sellable")).toHaveCount(0);
  await expect(tid(page, "cost-per-sellable-none")).toHaveText(COST.perSellableNone);
  await expect(page.getByText(COST.candlesLine(4, 0))).toBeVisible();
  const scenarios = tid(page, "cost-scenarios");
  await expect(scenarios).toContainText("Set by target margin 40%");
  await expectScenario(page, "wholesale", [COST.reasonNoSellable, COST.notAvailable, COST.notAvailable, COST.notAvailable]);
  await expectScenario(page, "retail", [COST.reasonNoSellable, COST.notAvailable, COST.notAvailable, COST.notAvailable]);

  await page.goto("/costs");
  await waitForHeading(page, COST.listTitle);
  await expect(sheetRows(page)).toHaveCount(1, { timeout: SLOW });
  await expect(sheetRows(page)).toContainText(COST.noSellable);
  await expect(sheetRows(page)).toContainText("4 made, 0 sellable");

  // Raising sellable brings the figures back.
  await openSheetEditor(page, sheetId);
  await field(page, COST.sellableLabel).fill("4");
  await expect(tid(page, "cost-live-results").getByTestId("cost-per-sellable")).toBeVisible({ timeout: SLOW });
});

