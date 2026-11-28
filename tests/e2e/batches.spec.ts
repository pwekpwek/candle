import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import {
  SLOW,
  WE5,
  WE8,
  WE9A,
  expectClearOfFixedBars,
  expectInputsAtLeast16,
  expectNoSideScroll,
  expectPlanned,
  expectTapHeight,
  expectWE5Panel,
  fillWE5,
  measuredInput,
  openNewFormula,
  saveFromEditor,
  scaleToTen,
  waitForHeading,
} from "./helpers-flow";

test.use({ viewport: { width: 1280, height: 800 } });

/** Next keeps hidden routes mounted: only look at the visible field. */
const dateField = (p: Page) => p.getByLabel("Production date").locator("visible=true");
const labelField = (p: Page) => p.getByLabel("Label (optional)").locator("visible=true");

const WE5_PLANNED = {
  "Soy 464": "1000.0 g",
  Lavender: "40.0 g",
  Vanilla: "26.7 g",
  Cedar: "13.3 g",
  Fragrance: "80.0 g",
  "Total mixture": "1080.0 g",
};

const GOOD_BACKUP = path.join(process.cwd(), "tests", "fixtures", "backups", "good.json");

/** Builds and saves WE-5 as version 1; ends on the formula page. */
async function buildWE5(page: Page) {
  await openNewFormula(page);
  await fillWE5(page);
  await expectWE5Panel(page);
  await saveFromEditor(page);
  await waitForHeading(page, WE5.name);
}

/** Opens Create batch from the formula page (or version view) and waits for the form. */
async function openCreateForm(page: Page) {
  await page.getByRole("link", { name: "Create batch" }).first().click();
  await expect(page).toHaveURL(/\/batches\/new\?version=/, { timeout: SLOW });
  await waitForHeading(page, "Create batch");
  await expect(dateField(page)).toBeVisible({ timeout: SLOW });
}

type BatchSpec = {
  date: string;
  label?: string;
  weights?: Record<string, string>;
};

async function fillBatchForm(page: Page, spec: BatchSpec) {
  await dateField(page).fill(spec.date);
  if (spec.label !== undefined) await labelField(page).fill(spec.label);
  for (const [name, grams] of Object.entries(spec.weights ?? {})) {
    await measuredInput(page, name).fill(grams);
  }
}

/** Submits the create form, waits for the saved batch page and returns its id. */
async function submitCreate(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Create batch" }).click();
  // The page drops "?created=1" as soon as it shows the notice, so wait for the batch path.
  await expect(page).toHaveURL(/\/batches\/(?!new)[0-9a-f-]{36}/, { timeout: SLOW });
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByText("Batch saved")).toBeVisible({ timeout: SLOW });
  return id;
}

async function createBatch(page: Page, spec: BatchSpec): Promise<string> {
  await openCreateForm(page);
  await fillBatchForm(page, spec);
  return submitCreate(page);
}

function batchTitle(id: string) {
  return `Batch ${id.slice(0, 8).toUpperCase()}`;
}

async function openBatch(page: Page, id: string, heading: string) {
  await page.goto(`/batches/${id}`);
  await waitForHeading(page, heading);
  await expect(dateField(page)).toBeVisible({ timeout: SLOW });
}

async function openBatchesList(page: Page) {
  await page.goto("/batches");
  await waitForHeading(page, "Batches");
  await expect(page.getByText("Loading batches…")).toHaveCount(0, { timeout: SLOW });
}

async function formulaMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** Exports a backup from /backup and returns the saved file path and its parsed content. */
async function exportBackup(page: Page, testInfo: TestInfo) {
  await page.goto("/backup");
  await waitForHeading(page, "Backup and restore");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  return { file, backup: JSON.parse(readFileSync(file, "utf8")) };
}

async function cleanContext(browser: Browser, testInfo: TestInfo) {
  const ctx = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 1280, height: 800 },
  });
  return { ctx, page: await ctx.newPage() };
}

async function restoreFile(page: Page, file: string, addMode: boolean) {
  await page.goto("/backup");
  await waitForHeading(page, "Backup and restore");
  await page.locator("input[type=file]").setInputFiles(file);
  const restore = page.getByRole("button", { name: "Restore", exact: true });
  await expect(restore).toBeEnabled({ timeout: SLOW });
  if (addMode) await page.getByRole("radio", { name: "Add to what's here" }).check();
  await expect(page.getByText(/^Will add /)).toBeVisible({ timeout: SLOW });
  await restore.click();
  await expect(page.getByText("Restore finished.")).toBeVisible({ timeout: SLOW });
}

test("two batches survive reload and stay on version 1 after a scale", async ({ page }) => {
  test.setTimeout(240_000);

  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];

  // Batch A: dated, labelled, every component weighed (WE-8).
  const idA = await createBatch(page, { date: "2026-11-16", label: "LV-01", weights: WE8 });
  await waitForHeading(page, "LV-01");

  // Batch B: back on the same version, no label, only the wax weighed.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  const idB = await createBatch(page, {
    date: "2026-11-17",
    weights: { "Soy 464": "1000.5" },
  });
  expect(idB).not.toBe(idA);
  await waitForHeading(page, batchTitle(idB));

  // Reload batch A: own date, label, weights and a link to version 1.
  await page.goto(`/batches/${idA}`);
  await page.reload();
  await waitForHeading(page, "LV-01");
  await expect(dateField(page)).toHaveValue("2026-11-16", { timeout: SLOW });
  await expect(labelField(page)).toHaveValue("LV-01");
  for (const [name, grams] of Object.entries(WE8)) {
    await expect(measuredInput(page, name)).toHaveValue(grams);
  }
  await expect(page.getByRole("link", { name: WE5.name }).first()).toHaveAttribute(
    "href",
    /\/formulas\/[^/]+$/,
  );
  await expect(page.getByRole("link", { name: "version 1" })).toHaveAttribute(
    "href",
    /\/formulas\/[^/]+\/versions\/[^/]+$/,
  );
  await expectPlanned(page, WE5_PLANNED);

  // Reload batch B: its own values; other components empty.
  await page.goto(`/batches/${idB}`);
  await page.reload();
  await waitForHeading(page, batchTitle(idB));
  await expect(dateField(page)).toHaveValue("2026-11-17", { timeout: SLOW });
  await expect(labelField(page)).toHaveValue("");
  await expect(measuredInput(page, "Soy 464")).toHaveValue("1000.5");
  await expect(measuredInput(page, "Lavender")).toHaveValue("");
  await expect(page.getByRole("link", { name: "version 1" })).toBeVisible();

  // The list, after a reload: newest first, both rows with their own text.
  await openBatchesList(page);
  await page.reload();
  await waitForHeading(page, "Batches");
  const rows = page.getByTestId("batch-row");
  await expect(rows).toHaveCount(2, { timeout: SLOW });
  await expect(rows.nth(0)).toContainText(batchTitle(idB));
  await expect(rows.nth(0)).toContainText("Nov 17, 2026");
  await expect(rows.nth(0)).toContainText("1 of 4 weighed");
  await expect(rows.nth(0)).toContainText(`${WE5.name} · version 1`);
  await expect(rows.nth(1)).toContainText("LV-01");
  await expect(rows.nth(1)).toContainText("Nov 16, 2026");
  await expect(rows.nth(1)).toContainText("4 of 4 weighed");
  await expect(rows.nth(1)).toContainText(`${WE5.name} · version 1`);

  // The formula page lists both batches.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  const section = page.getByRole("region", { name: "Batches" }).or(
    page.locator("section").filter({ has: page.getByRole("heading", { name: "Batches" }) }),
  );
  await expect(section.getByRole("link", { name: /version 1 · Nov/ })).toHaveCount(2, {
    timeout: SLOW,
  });

  // Scale to 10 vessels (version 2); the batches stay on version 1 with WE-5 plans.
  await scaleToTen(page);
  await expectPlanned(page, WE9A);
  for (const [id, heading] of [
    [idA, "LV-01"],
    [idB, batchTitle(idB)],
  ] as const) {
    await openBatch(page, id, heading);
    await expect(page.getByRole("link", { name: "version 1" })).toBeVisible();
    await expect(
      page.getByText("Made from version 1. The formula's latest version is 2."),
    ).toBeVisible();
    await expectPlanned(page, WE5_PLANNED);
  }
});

test("create form errors, then edit a batch and see it persist", async ({ page }) => {
  test.setTimeout(240_000);

  await buildWE5(page);
  await openCreateForm(page);
  const createUrl = page.url();
  await openBatchesList(page);
  await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: SLOW });
  await page.goBack();
  await waitForHeading(page, "Create batch");
  await expect(dateField(page)).toBeVisible({ timeout: SLOW });

  const create = page.getByRole("button", { name: "Create batch" });
  const date = dateField(page);

  // Cleared date.
  await date.fill("");
  await create.click();
  await expect(page.getByText("Enter the production date.")).toBeVisible();
  await expect(date).toHaveAttribute("aria-invalid", "true");
  await expect(date).toBeFocused();
  expect(page.url()).toBe(createUrl);

  // Future date.
  await date.fill("2099-01-01");
  await create.click();
  await expect(page.getByText("The production date cannot be in the future.")).toBeVisible();
  await expect(date).toHaveAttribute("aria-invalid", "true");
  expect(page.url()).toBe(createUrl);

  // Label of 41 characters.
  await date.fill("2026-11-16");
  const label = labelField(page);
  // Submitted with a click straight from the field: the blur error must not
  // move the button away from the first click.
  await label.fill("L".repeat(41));
  await page.getByRole("button", { name: "Create batch" }).click();
  await expect(page.getByText("Use 40 characters or fewer.")).toBeVisible();
  await expect(label).toHaveAttribute("aria-invalid", "true");
  await expect(label).toBeFocused();
  expect(page.url()).toBe(createUrl);

  // A weight with too many decimals for a 0.1 g scale.
  await label.fill("EDIT-1");
  await measuredInput(page, "Soy 464").fill("1.234");
  await page.getByRole("button", { name: "Create batch" }).click();
  await expect(measuredInput(page, "Soy 464")).toHaveAttribute("aria-invalid", "true");
  await expect(measuredInput(page, "Soy 464")).toBeFocused();
  expect(page.url()).toBe(createUrl);

  // Nothing was created.
  await openBatchesList(page);
  await expect(page.getByTestId("batch-row")).toHaveCount(0);
  await expect(page.getByTestId("empty-state")).toBeVisible();

  // Create a valid batch, then edit it.
  await page.goBack();
  await waitForHeading(page, "Create batch");
  await fillBatchForm(page, {
    date: "2026-11-16",
    label: "EDIT-1",
    weights: { "Soy 464": "1003.2" },
  });
  const id = await submitCreate(page);
  await waitForHeading(page, "EDIT-1");

  await dateField(page).fill("2026-11-15");
  await measuredInput(page, "Lavender").fill("40.4");
  await measuredInput(page, "Soy 464").fill("1001.0");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible({ timeout: SLOW });

  await page.reload();
  await waitForHeading(page, "EDIT-1");
  await expect(dateField(page)).toHaveValue("2026-11-15", { timeout: SLOW });
  await expect(measuredInput(page, "Soy 464")).toHaveValue("1001.0");
  await expect(measuredInput(page, "Lavender")).toHaveValue("40.4");
  expect(page.url()).toContain(id);
  await openBatchesList(page);
  await expect(page.getByTestId("batch-row")).toContainText("Nov 15, 2026");
  await expect(page.getByTestId("batch-row")).toContainText("2 of 4 weighed");
});

test("archived formula keeps batches; formula delete is refused until batches are gone", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  const idA = await createBatch(page, { date: "2026-11-16", label: "A-1" });
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  const idB = await createBatch(page, { date: "2026-11-17", label: "B-1" });

  // Archive the formula.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await formulaMenu(page, "Archive");
  await expect(
    page.getByText("Archived. It no longer shows in your active formulas."),
  ).toBeVisible({ timeout: SLOW });

  // List and batch page flag it; the batch still opens and saves.
  await openBatchesList(page);
  const rows = page.getByTestId("batch-row");
  await expect(rows).toHaveCount(2, { timeout: SLOW });
  await expect(rows.nth(0)).toContainText("Formula archived");
  await expect(rows.nth(1)).toContainText("Formula archived");
  await rows.getByRole("link", { name: "A-1" }).click();
  await waitForHeading(page, "A-1");
  await expect(page.getByText("Formula archived").first()).toBeVisible({ timeout: SLOW });
  await measuredInput(page, "Soy 464").fill("999.9");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible({ timeout: SLOW });
  await page.reload();
  await expect(measuredInput(page, "Soy 464")).toHaveValue("999.9", { timeout: SLOW });

  // Deleting the formula is refused; it still exists.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await formulaMenu(page, "Delete permanently");
  // The dialog keeps the delete title; the refusal is its status notice.
  const refused = page.getByRole("dialog");
  await expect(refused.getByText("This formula cannot be deleted")).toBeVisible({ timeout: SLOW });
  await expect(refused.getByText("This formula has 2 batches")).toBeVisible();
  await expect(refused.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
  await refused.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(refused).toBeHidden();
  await page.reload();
  await waitForHeading(page, WE5.name);

  // Delete both batches through the confirm dialog.
  for (const [id, heading] of [
    [idA, "A-1"],
    [idB, "B-1"],
  ] as const) {
    await openBatch(page, id, heading);
    await page.getByRole("button", { name: "Delete batch" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this batch?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Keep batch" })).toBeVisible();
    await dialog.getByRole("button", { name: "Delete batch" }).click();
    await expect(page).toHaveURL(/\/batches$/, { timeout: SLOW });
  }
  await waitForHeading(page, "Batches");
  await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: SLOW });
  await expect(page.getByText("No batches yet")).toBeVisible();

  // Now the formula can be deleted: the normal destructive confirm appears and works.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await formulaMenu(page, "Delete permanently");
  const confirm = page.getByRole("dialog", { name: "Delete this formula permanently?" });
  await expect(confirm).toBeVisible({ timeout: SLOW });
  await expect(confirm.getByText("This formula cannot be deleted")).toHaveCount(0);
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).not.toHaveURL(new RegExp(formulaUrl.split("/").pop()! + "$"), {
    timeout: SLOW,
  });
  await page.goto(formulaUrl);
  await expect(page.getByRole("heading", { level: 1, name: WE5.name })).toHaveCount(0);
});

test("backup round trip restores batches in a clean browser", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);

  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  const idA = await createBatch(page, { date: "2026-11-16", label: "LV-01", weights: WE8 });
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  const idB = await createBatch(page, { date: "2026-11-17", weights: { "Soy 464": "1000.5" } });

  const { file, backup } = await exportBackup(page, testInfo);
  // The app now writes format 7 (TrueCandle Cost); batches are unchanged by it.
  expect(backup.formatVersion).toBe(7);
  expect(backup.data.batches).toHaveLength(2);
  expect(backup.counts).toMatchObject({ batches: 2, formulas: 1 });
  expect(backup.data.batches.map((b: { id: string }) => b.id).sort()).toEqual(
    [idA, idB].sort(),
  );

  const { ctx, page: fresh } = await cleanContext(browser, testInfo);
  try {
    await fresh.goto("/batches");
    await waitForHeading(fresh, "Batches");
    await expect(fresh.getByTestId("empty-state")).toBeVisible({ timeout: SLOW });

    await restoreFile(fresh, file, true);

    await openBatch(fresh, idA, "LV-01");
    await expect(dateField(fresh)).toHaveValue("2026-11-16");
    await expect(labelField(fresh)).toHaveValue("LV-01");
    for (const [name, grams] of Object.entries(WE8)) {
      await expect(measuredInput(fresh, name)).toHaveValue(grams);
    }
    await expectPlanned(fresh, WE5_PLANNED);
    const link = fresh.getByRole("link", { name: "version 1" });
    await expect(link).toHaveAttribute("href", /\/formulas\/[^/]+\/versions\/[^/]+$/);
    await link.click();
    await expect(fresh).toHaveURL(/\/versions\//, { timeout: SLOW });
    await waitForHeading(fresh, WE5.name);
    await expectPlanned(fresh, WE5_PLANNED);

    await openBatch(fresh, idB, batchTitle(idB));
    await expect(dateField(fresh)).toHaveValue("2026-11-17");
    await expect(labelField(fresh)).toHaveValue("");
    await expect(measuredInput(fresh, "Soy 464")).toHaveValue("1000.5");
    await expect(measuredInput(fresh, "Lavender")).toHaveValue("");
    await expect(fresh.getByRole("link", { name: "version 1" })).toBeVisible();

    await openBatchesList(fresh);
    await expect(fresh.getByTestId("batch-row")).toHaveCount(2, { timeout: SLOW });
  } finally {
    await ctx.close();
  }
});

test("a v0.1 backup restores and batches can be made from it", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const { ctx, page } = await cleanContext(browser, testInfo);
  try {
    const old = JSON.parse(readFileSync(GOOD_BACKUP, "utf8"));
    expect(old.formatVersion).toBe(1);

    await restoreFile(page, GOOD_BACKUP, true);

    // Formulas list shows both formulas.
    await page.goto("/");
    await waitForHeading(page, "Saved formulas");
    const formulaRows = page.getByTestId("formula-row");
    // One formula is archived in the fixture: it shows under "Archived".
    await expect(formulaRows).toHaveCount(1, { timeout: SLOW });
    await expect(formulaRows.first()).toContainText("Lavender Vanilla Cedar");
    const toggle = (n: string) =>
      page.getByRole("radio", { name: n }).or(page.getByRole("tab", { name: n })).or(page.getByRole("button", { name: n, exact: true })).first();
    await toggle("Archived").click();
    await expect(formulaRows).toHaveCount(1, { timeout: SLOW });
    await expect(formulaRows.first()).toContainText("Unscented Pillar");
    await toggle("Active").click();
    await expect(formulaRows.first()).toContainText("Lavender Vanilla Cedar", { timeout: SLOW });

    // A formula opens, and so does a version.
    await formulaRows.first().getByRole("link").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: SLOW });
    await expect(page.getByRole("table", { name: "Measured weights" }).locator("visible=true")).toBeVisible({
      timeout: SLOW,
    });
    await expect(page.getByRole("heading", { name: "Batches" })).toBeVisible();
    await expect(page.getByText("No batches made from this formula yet.")).toBeVisible();

    // Materials page: the 6 active materials (the 7th is archived).
    await page.goto("/materials");
    await waitForHeading(page, "Materials");
    await expect(page.getByTestId("material-row")).toHaveCount(6, { timeout: SLOW });
    for (const name of ["Tin 180", "Cedarwood", "Soy wax", "Vanilla", "Lavender", "Wick A"]) {
      await expect(page.getByTestId("material-row").filter({ hasText: name }).first()).toBeVisible();
    }

    // No batches yet.
    await openBatchesList(page);
    await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: SLOW });
    await expect(page.getByText("No batches yet")).toBeVisible();

    // Create a batch from a restored version.
    await page.goto("/");
    await waitForHeading(page, "Saved formulas");
    await expect(formulaRows).toHaveCount(1, { timeout: SLOW });
    await formulaRows.first().getByRole("link").first().click();
    await expect(page.getByRole("link", { name: "Create batch" }).first()).toBeVisible({
      timeout: SLOW,
    });
    const id = await createBatch(page, { date: "2026-11-16", label: "OLD-1" });
    await waitForHeading(page, "OLD-1");
    await openBatchesList(page);
    const rows = page.getByTestId("batch-row");
    await expect(rows).toHaveCount(1, { timeout: SLOW });
    await expect(rows.first()).toContainText("OLD-1");
    await expect(rows.first()).toContainText("Nov 16, 2026");
    await expect(rows.first().getByRole("link")).toHaveAttribute("href", `/batches/${id}`);
  } finally {
    await ctx.close();
  }
});

test.describe("phone (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  async function checkScreen(page: Page, where: string) {
    await expectNoSideScroll(page, where);
    await expectClearOfFixedBars(page, where);
    await expectInputsAtLeast16(page, where);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  test("create, reopen, errors and notices at 375px", async ({ page }) => {
    test.setTimeout(240_000);

    await buildWE5(page);

    // Create form.
    await page.getByRole("link", { name: "Create batch" }).first().tap();
    await expect(page).toHaveURL(/\/batches\/new\?version=/, { timeout: SLOW });
    await waitForHeading(page, "Create batch");
    await expect(dateField(page)).toBeVisible({ timeout: SLOW });
    const createUrl = page.url();
    await checkScreen(page, "create batch");
    await expectTapHeight(page.getByRole("button", { name: "Create batch" }), "create: button");
    await expectTapHeight(dateField(page), "create: date");
    await expectTapHeight(labelField(page), "create: label");
    await expectTapHeight(measuredInput(page, WE5.wax), "create: measured input");

    // A field error at this width.
    await dateField(page).fill("");
    await page.getByRole("button", { name: "Create batch" }).tap();
    await expect(page.getByText("Enter the production date.")).toBeVisible();
    await expect(dateField(page)).toHaveAttribute("aria-invalid", "true");
    expect(page.url()).toBe(createUrl);
    await expectNoSideScroll(page, "create (error)");
    await expectInputsAtLeast16(page, "create (error)");

    // Valid create.
    await dateField(page).fill("2026-11-16");
    await labelField(page).fill("PH-01");
    await measuredInput(page, WE5.wax).fill("1003.2");
    await page.getByRole("button", { name: "Create batch" }).tap();
    // The page drops "?created=1" as soon as it shows the notice, so wait for the batch path.
    await expect(page).toHaveURL(/\/batches\/(?!new)[0-9a-f-]{36}/, { timeout: SLOW });
    const id = new URL(page.url()).pathname.split("/").pop()!;
    await waitForHeading(page, "PH-01");
    await expect(page.getByText("Batch saved")).toBeVisible({ timeout: SLOW });
    await checkScreen(page, "batch page (created)");

    // Reload the batch page, check it and save at this width.
    await page.reload();
    await waitForHeading(page, "PH-01");
    await expect(measuredInput(page, WE5.wax)).toHaveValue("1003.2", { timeout: SLOW });
    await checkScreen(page, "batch page (reloaded)");
    await expectTapHeight(page.getByRole("button", { name: "Save changes" }), "batch: Save changes");
    await expectTapHeight(page.getByRole("button", { name: "Delete batch" }), "batch: Delete batch");
    await measuredInput(page, "Lavender").fill("40.4");
    await page.getByRole("button", { name: "Save changes" }).tap();
    await expect(page.getByText("Changes saved")).toBeVisible({ timeout: SLOW });
    await expectNoSideScroll(page, "batch page (saved)");

    // The list.
    const nav = page.getByRole("navigation", { name: "Main" });
    await expectTapHeight(nav.getByRole("link", { name: "Batches" }), "nav: Batches");
    await nav.getByRole("link", { name: "Batches" }).tap();
    await waitForHeading(page, "Batches");
    const rows = page.getByTestId("batch-row");
    await expect(rows).toHaveCount(1, { timeout: SLOW });
    await expectTapHeight(rows.getByRole("link", { name: "PH-01" }), "list: batch link");
    await checkScreen(page, "batches list");
    await rows.getByRole("link", { name: "PH-01" }).tap();
    await waitForHeading(page, "PH-01");
    await expect(page).toHaveURL(new RegExp(`/batches/${id}$`));
    await expect(measuredInput(page, "Lavender")).toHaveValue("40.4", { timeout: SLOW });
  });
});
