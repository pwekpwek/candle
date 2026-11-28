import { test, expect, type Page } from "@playwright/test";
import { WE5, expectNoSideScroll, expectTapHeight } from "./helpers-flow";
import {
  COST,
  addItemFromList,
  addPackagingItem,
  backToSheet,
  field,
  fillCounts,
  itemEditor,
  openItems,
  openMaterials,
  saveSheetButton,
  setLabour,
  setScenarioMargin,
  setScenarioPrice,
  tid,
  vatSwitch,
  visible,
  SLOW,
  waitForHeading,
} from "./helpers-cost";
import { buildWE5, checkScreen, createBatch, openBatch } from "./helpers-schedule";
import { fillLot, lotEditor, openAddLot, openLots, saveBatchChanges, expectDone } from "./helpers-lots";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
test.setTimeout(300_000);

/** The label around a radio or switch is the tap target. */
const labelOf = (control: ReturnType<Page["locator"]>) => control.locator("xpath=ancestor::label");

test("TrueCandle Cost on a phone: prices, items, counts, a sheet created, edited and read, no sideways scroll", async ({ page }) => {
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];

  // ---- Material form: default price ----
  await openMaterials(page);
  await checkScreen(page, "materials list");
  await visible(page.getByTestId("material-row")).filter({ hasText: WE5.wax })
    .getByRole("button", { name: WE5.wax, exact: true }).first().tap();
  const materialEditor = visible(page.getByTestId("material-editor"));
  await expect(materialEditor).toBeVisible({ timeout: SLOW });
  const priceField = materialEditor.getByLabel(/^Default price per kg in pesos/);
  await expect(priceField).toBeVisible();
  await priceField.fill("180.00");
  await expectNoSideScroll(page, "material form with a default price");
  await checkScreen(page, "material form with a default price");
  await materialEditor.getByRole("button", { name: "Save", exact: true }).tap();
  await expectDone(page, "Saved.");
  await expect(visible(page.getByTestId("material-row")).filter({ hasText: WE5.wax }).getByTestId("material-price")).toHaveText(
    "₱180.00 per kg",
    { timeout: SLOW },
  );
  await checkScreen(page, "materials list with a price");

  // ---- Lot form: amount paid and quantity received ----
  await openLots(page);
  await openAddLot(page);
  await fillLot(page, { material: WE5.wax, code: "PH-LOT-1" });
  await lotEditor(page).getByLabel(/^Amount paid in pesos/).fill("3600.00");
  await lotEditor(page).getByLabel(/^Quantity received/).fill("20");
  await expect(lotEditor(page).getByLabel("Unit", { exact: true })).toBeVisible();
  await checkScreen(page, "lot form with a purchase");
  await expectTapHeight(lotEditor(page).getByRole("button", { name: "Save", exact: true }), "lot form: Save");
  await lotEditor(page).getByRole("button", { name: "Save", exact: true }).tap();
  await expectDone(page, "Added.");

  // ---- Packaging and items ----
  await openItems(page);
  await checkScreen(page, "items list, empty");
  await expectTapHeight(visible(page.getByRole("button", { name: "Add item" })).first(), "items: Add item");
  await addPackagingItem(page, "Ribbon", "3.25");
  await openItems(page);
  await expect(tid(page, "item-row")).toHaveCount(1, { timeout: SLOW });
  await expectTapHeight(page.getByRole("button", { name: "Edit item Ribbon", exact: true }), "items: Edit item");
  await expectTapHeight(page.getByRole("button", { name: "Delete item Ribbon", exact: true }), "items: Delete item");
  await checkScreen(page, "items list with an item");
  await page.getByRole("button", { name: "Add item" }).first().tap();
  await expect(itemEditor(page)).toBeVisible({ timeout: SLOW });
  await itemEditor(page).getByLabel("Price each in pesos").fill("1.234");
  await itemEditor(page).getByRole("button", { name: "Save", exact: true }).tap();
  await expect(visible(page.getByText("Use 2 decimal places at most."))).toBeVisible();
  await checkScreen(page, "item form with errors");
  await itemEditor(page).getByRole("button", { name: "Cancel", exact: true }).tap();
  await expect(itemEditor(page)).toHaveCount(0);

  // ---- Batch: candle counts ----
  const batchId = await createBatch(page, formulaUrl, { date: "2026-11-20", label: "PH-COST" });
  await openBatch(page, batchId, "PH-COST");
  await fillCounts(page, "6", "5");
  await checkScreen(page, "batch form with candle counts");
  await saveBatchChanges(page);
  await expect(tid(page, "batch-counts")).toHaveText("6 made, 5 sellable");
  const newSheet = tid(page, "cost-section").getByRole("link", { name: COST.newSheet });
  await expect(newSheet).toBeVisible({ timeout: SLOW });
  await newSheet.scrollIntoViewIfNeeded();
  await expectTapHeight(newSheet, "batch: New cost sheet");
  await expectTapHeight(tid(page, "cost-section").getByRole("link", { name: COST.allSheets }), "batch: All cost sheets");
  await checkScreen(page, "batch page, Costs section empty");

  // ---- New-sheet form ----
  await newSheet.tap();
  await expect(page).toHaveURL(/\/costs\/new\?batch=/, { timeout: SLOW });
  await waitForHeading(page, COST.newTitle);
  await expect(field(page, COST.candlesLabel)).toHaveValue("6", { timeout: SLOW });
  await expect(field(page, COST.sellableLabel)).toHaveValue("5");
  await checkScreen(page, "new cost sheet form");
  // An error in view, focus on the field.
  await field(page, COST.sellableLabel).fill("9");
  const create = visible(page.getByRole("button", { name: COST.createButton }));
  await expectTapHeight(create, "new sheet: Create cost sheet");
  await create.tap();
  await expect(visible(page.getByText(COST.errSellableOver))).toBeVisible();
  await expect(field(page, COST.sellableLabel)).toBeFocused();
  await checkScreen(page, "new cost sheet form with an error");
  await field(page, COST.sellableLabel).fill("5");
  await field(page, COST.titleLabel).fill("Phone sheet");
  await create.tap();
  await expect(page).toHaveURL(/\/costs\/[0-9a-f-]{36}\/edit$/, { timeout: SLOW });
  await waitForHeading(page, COST.editTitle);
  await expect(field(page, COST.titleLabel)).toBeVisible({ timeout: SLOW });

  // ---- Editor: the results sit below the form on a phone ----
  const results = tid(page, "cost-live-results");
  await expect(results).toBeVisible({ timeout: SLOW });
  const form = visible(page.locator("form"));
  const formBox = (await form.boundingBox())!;
  const resultsBox = (await results.boundingBox())!;
  expect(resultsBox.y, "editor: results start below the form").toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  expect(resultsBox.x, "editor: results left edge").toBeGreaterThanOrEqual(0);
  expect(resultsBox.x + resultsBox.width, "editor: results right edge").toBeLessThanOrEqual(375);
  await checkScreen(page, "editor, as made");

  await addItemFromList(page, "Ribbon");
  await setLabour(page, "2", "50.00");
  await field(page, COST.testingLabelField).fill("20.00");
  await setScenarioMargin(page, "Wholesale", "40");
  await setScenarioPrice(page, "Retail", "300.00");
  await expect(results.getByTestId("cost-labour")).toHaveText("₱100.00", { timeout: SLOW });
  await checkScreen(page, "editor, filled in");

  // Tap targets in the editor.
  await expectTapHeight(visible(page.getByRole("button", { name: COST.itemAddFromList })), "editor: Add from list");
  await expectTapHeight(visible(page.getByRole("button", { name: COST.itemAddOneOff })), "editor: Add a one-off item");
  await expectTapHeight(visible(page.getByRole("button", { name: COST.itemRemove("Ribbon") })), "editor: Remove item");
  await expectTapHeight(labelOf(vatSwitch(page)), "editor: VAT switch");
  await expectTapHeight(
    labelOf(visible(page.getByRole("radio", { name: COST.overheadPercent }))),
    "editor: overhead radio",
  );
  await expectTapHeight(
    labelOf(visible(page.getByRole("group", { name: COST.scenarioModeLabel("Retail") }).getByRole("radio", { name: COST.scenarioModePrice }))),
    "editor: scenario radio",
  );
  await expectTapHeight(
    labelOf(visible(page.getByRole("group", { name: COST.linePriceLegend(WE5.wax) }).getByRole("radio").first())),
    "editor: line price radio",
  );
  await expectTapHeight(saveSheetButton(page), "editor: Save");

  // Errors: in view, no sideways growth.
  await field(page, COST.testingLabelField).fill("abc");
  await saveSheetButton(page).tap();
  await expect(visible(page.getByText(COST.errMoney))).toBeVisible();
  await expect(field(page, COST.testingLabelField)).toBeFocused();
  await expectNoSideScroll(page, "editor with an error");
  await checkScreen(page, "editor with an error");
  await field(page, COST.testingLabelField).fill("20.00");

  // Save: the feedback is in view.
  await saveSheetButton(page).tap();
  const saved = visible(page.getByText(COST.saved, { exact: true }));
  await expect(saved).toBeVisible({ timeout: SLOW });
  await expect(saved).toBeInViewport();
  await checkScreen(page, "editor, saved");
  await backToSheet(page);

  // ---- Sheet page ----
  await expect(tid(page, "cost-labour")).toHaveText("₱100.00");
  await expect(tid(page, "cost-testing")).toHaveText("₱20.00");
  await expect(tid(page, "cost-per-sellable")).toBeVisible();
  await expectTapHeight(page.getByRole("link", { name: COST.edit, exact: true }), "sheet: Edit");
  await expectTapHeight(page.getByRole("button", { name: COST.copyUpdate, exact: true }), "sheet: Copy and update");
  await expectTapHeight(page.getByRole("button", { name: COST.deleteButton, exact: true }), "sheet: Delete");
  await expectTapHeight(visible(page.getByRole("link", { name: COST.formulaLink(WE5.name) })), "sheet: formula link");
  await checkScreen(page, "cost sheet page");
  const scenarios = tid(page, "cost-scenarios");
  await scenarios.scrollIntoViewIfNeeded();
  const table = (await scenarios.locator("table").boundingBox())!;
  expect(table.x, "scenarios table: left edge").toBeGreaterThanOrEqual(0);
  expect(table.x + table.width, "scenarios table: right edge").toBeLessThanOrEqual(375);

  // The delete dialog fits the screen.
  await page.getByRole("button", { name: COST.deleteButton, exact: true }).tap();
  const dialog = page.getByRole("dialog", { name: COST.deleteTitle });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x, "dialog: left edge").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "dialog: right edge").toBeLessThanOrEqual(375);
  await expectTapHeight(dialog.getByRole("button", { name: COST.deleteKeep }), "dialog: Keep it");
  await expectTapHeight(dialog.getByRole("button", { name: COST.deleteConfirm }), "dialog: Delete cost sheet");
  await dialog.getByRole("button", { name: COST.deleteKeep }).tap();
  await expect(dialog).toHaveCount(0);

  // Copy and update on a phone.
  await page.getByRole("button", { name: COST.copyUpdate, exact: true }).tap();
  await expect(visible(page.getByText(COST.copiedNotice))).toBeVisible({ timeout: SLOW });
  await checkScreen(page, "copied cost sheet page");

  // ---- The list, and the sections on the batch and formula pages ----
  await page.goto("/costs");
  await waitForHeading(page, COST.listTitle);
  await expect(tid(page, "cost-sheet-row")).toHaveCount(2, { timeout: SLOW });
  await expectTapHeight(tid(page, "cost-sheet-row").first(), "list: sheet row");
  await checkScreen(page, "cost sheets list");
  await page.goto(`/batches/${batchId}`);
  await expect(tid(page, "cost-section").getByTestId("cost-sheet-row")).toHaveCount(2, { timeout: SLOW });
  await expectTapHeight(tid(page, "cost-section").getByTestId("cost-sheet-row").first(), "batch: sheet row");
  await checkScreen(page, "batch page with cost sheets");
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await expect(tid(page, "cost-section").getByTestId("cost-sheet-row")).toHaveCount(2, { timeout: SLOW });
  await expectTapHeight(
    tid(page, "cost-section").getByRole("link", { name: COST.newSheetFromVersion(1) }),
    "formula: New cost sheet from version",
  );
  await checkScreen(page, "formula page with cost sheets");

  // The new-sheet form from a version.
  await tid(page, "cost-section").getByRole("link", { name: COST.newSheetFromVersion(1) }).tap();
  await expect(page).toHaveURL(/\/costs\/new\?version=/, { timeout: SLOW });
  await waitForHeading(page, COST.newTitle);
  await expect(field(page, COST.candlesLabel)).toHaveValue("6", { timeout: SLOW });
  await checkScreen(page, "new cost sheet form from a version");
});
