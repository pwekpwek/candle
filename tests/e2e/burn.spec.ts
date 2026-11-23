import { statSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import {
  SLOW,
  addPhotos,
  burnField,
  candleEditors,
  candleField,
  createSession,
  createWick,
  expectNoPageScroll,
  expectNoVerdicts,
  field,
  fillBurn,
  fillCandle,
  makeBatch,
  makeJpeg,
  parseCsv,
  readText,
  saveSession,
  seedBatch,
  waitForHeading,
  type SessionSpec,
} from "./helpers-burn";
import {
  cleanContext,
  exportBackup,
  fmt,
  iso,
  milestoneRow,
  productionDate,
  restoreFile,
  visible,
} from "./helpers-schedule";
import { WE5 } from "./helpers-flow";

test.use({ viewport: { width: 1280, height: 800 } });

const burnsSection = (p: Page) => visible(p.getByRole("region", { name: "Burn tests", exact: true }));
const candleSections = (p: Page) => p.getByTestId("candle-section").filter({ visible: true });
const burnRows = (p: Page) => p.getByTestId("burn-row").filter({ visible: true });

/** Two batches with a session each: the data the compare, report and wording tests use. */
const RUN_A: SessionSpec = {
  date: iso(-3),
  label: "Run A",
  candles: [
    {
      label: "A1",
      wickText: "Cotton 8",
      burns: [
        { minutes: "240", before: "250", after: "238.5", diameter: "50", depth: "10", flame: "40", soot: "Light" },
        { minutes: "120", before: "238.5", after: "232.75", diameter: "60", depth: "15", flame: "45", soot: "Moderate" },
      ],
      coldThrow: "Faint lavender",
      hotThrow: "Clear lavender with warm vanilla",
    },
    {
      label: "A2",
      wickText: "Wooden 15",
      burns: [{ minutes: "180", before: "200", after: "190.1", diameter: "48", depth: "11", flame: "30", soot: "None seen" }],
    },
  ],
  conclusion: "Run A: the melt pool reached the edge by hour three.",
};
const RUN_B: SessionSpec = {
  date: iso(-1),
  label: "Run B",
  candles: [
    {
      label: "B1",
      wickText: "Cotton 10",
      burns: [{ minutes: "300", before: "180", after: "168", diameter: "55", depth: "14", flame: "35", soot: "Moderate" }],
    },
  ],
  conclusion: "Run B: soot appeared late in the burn.",
};

async function seedTwoSessions(page: Page) {
  const a = await seedBatch(page, { daysAgo: 10, label: "BT-A" });
  const b = await makeBatch(page, a.formulaUrl, { daysAgo: 6, label: "BT-B" });
  const sessionA = await createSession(page, a.id, RUN_A);
  const sessionB = await createSession(page, b, RUN_B);
  return { batchA: a.id, batchB: b, sessionA, sessionB };
}

test("record a burn test: errors, two candles, link to the planned test, figures", async ({ page }) => {
  test.setTimeout(300_000);
  const produced = iso(-5);
  const testDate = iso(-1);

  const batch = await seedBatch(page, { daysAgo: 5, label: "BT-01", burnTestOffset: "3" });
  await createWick(page, "CD-12 cotton");

  // The batch page: Burn tests section is empty, the Curing section lists the planned test.
  await page.goto(`/batches/${batch.id}`);
  await waitForHeading(page, "BT-01");
  const section = burnsSection(page);
  await expect(section).toBeVisible({ timeout: SLOW });
  await expect(section).toContainText("No burn tests yet");
  const planned = milestoneRow(page, "Planned burn test");
  await expect(planned).toHaveCount(1, { timeout: SLOW });
  await expect(planned).toContainText("Due ");

  await section.getByRole("link", { name: "Record burn test" }).click();
  await expect(page).toHaveURL(/\/burn-tests\/new\?batch=/, { timeout: SLOW });
  await waitForHeading(page, "Record burn test");
  await expect(field(page, "Test date")).toBeVisible({ timeout: SLOW });
  await expect(page.getByText("Photos can be added after you save this burn test.")).toBeVisible();
  const editorUrl = page.url();

  // Nothing filled: errors shown and focus goes to the first one.
  await field(page, "Test date").fill("");
  await page.getByRole("button", { name: "Save burn test" }).click();
  await expect(page.getByText("Enter the test date.")).toBeVisible();
  await expect(page.getByText("Choose a wick from the library, or type its name.")).toBeVisible();
  await expect(page.getByText("Some entries need fixing. They are marked below.")).toBeVisible();
  await expect(field(page, "Test date")).toBeFocused();
  expect(page.url()).toBe(editorUrl);

  // Date errors.
  await field(page, "Test date").fill(iso(1));
  await field(page, "Test date").blur();
  await expect(page.getByText("The test date cannot be in the future.")).toBeVisible();
  await field(page, "Test date").fill(iso(-6));
  await field(page, "Test date").blur();
  await expect(page.getByText(/The test date cannot be before the batch was produced/)).toBeVisible();
  await field(page, "Test date").fill(testDate);
  await field(page, "Test date").blur();
  await expect(page.getByText(/The test date cannot be/)).toHaveCount(0);

  // Candle 1 takes a wick from the library, then a burn with bad entries.
  await candleField(page, 1, "Wick").selectOption({ label: "CD-12 cotton" });
  await candleField(page, 1, "Wick").blur();
  await expect(page.getByText("Choose a wick from the library, or type its name.")).toHaveCount(0);
  await candleEditors(page).first().getByRole("button", { name: "Add burn" }).click();
  const duration = burnField(page, 1, 1, "Duration (minutes)");
  for (const [value, message] of [
    ["0", "Enter 1 to 1440 minutes."],
    ["1.5", "Enter whole minutes, for example 120."],
    ["1441", "Enter 1 to 1440 minutes."],
  ] as const) {
    await duration.fill(value);
    await duration.blur();
    await expect(page.getByText(message)).toBeVisible();
  }
  await duration.fill("240");
  await duration.blur();
  await expect(page.getByText(/Enter (1 to 1440 minutes|whole minutes)/)).toHaveCount(0);

  // Weights: after above before, then 3 decimals.
  const before = burnField(page, 1, 1, "Weight before (g)");
  const after = burnField(page, 1, 1, "Weight after (g)");
  await before.fill("250");
  await after.fill("260");
  await after.blur();
  await expect(page.getByText("The weight after cannot be above the weight before.")).toBeVisible();
  await before.fill("123.456");
  await before.blur();
  await expect(page.getByText("Use at most 2 decimals.")).toBeVisible();

  // Fix them and complete the burn and the rest of candle 1.
  await fillBurn(page, 1, 1, {
    minutes: "240",
    before: "250.00",
    after: "238.5",
    diameter: "50",
    depth: "10",
    flame: "40",
    soot: "Light",
    notes: "Steady flame, small mushrooming",
  });
  await expect(page.getByText(/at most 2 decimals|cannot be above/)).toHaveCount(0);
  await candleEditors(page).first().getByRole("button", { name: "Add burn" }).click();
  await fillBurn(page, 1, 2, {
    minutes: "120",
    before: "238.5",
    after: "232.75",
    diameter: "60",
    depth: "15",
    flame: "45",
    soot: "Moderate",
  });
  await candleField(page, 1, "Cold throw (optional)").fill("Faint lavender");
  await candleField(page, 1, "Hot throw (optional)").fill("Clear lavender with warm vanilla");

  // Candle 2: a free-text wick and one burn.
  await page.getByRole("button", { name: "Add candle" }).click();
  await expect(candleEditors(page)).toHaveCount(2);
  await fillCandle(page, 2, {
    label: "Control",
    wickText: "Hand-trimmed cotton 8 ply",
    burns: [{ minutes: "60", diameter: "45", depth: "12", flame: "30", soot: "None seen" }],
  });

  // Link the planned burn test, write the closing words.
  const link = field(page, "Planned burn test (optional)");
  const option = link.locator("option", { hasText: "Planned burn test, due" });
  await expect(option).toHaveCount(1);
  await link.selectOption({ value: (await option.getAttribute("value"))! });
  await field(page, "Your conclusion (optional)").fill("Even melt pool by the second burn.");
  await field(page, "Notes (optional)").fill("Room at 21 degrees.");
  await field(page, "Label (optional)").fill("Calibration burn");

  const id = await saveSession(page);

  // Session page: saved notice, figures, planned test done on the test date.
  await waitForHeading(page, "Calibration burn");
  await expect(page.getByText("Burn test saved")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/burn-tests/${id}$`), { timeout: SLOW });
  await expect(candleSections(page)).toHaveCount(2);
  const first = candleSections(page).nth(0);
  await expect(first).toContainText("Wick: CD-12 cotton");
  const rows = first.getByTestId("burn-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("4 h");
  await expect(rows.nth(0)).toContainText("250.00 g");
  await expect(rows.nth(0)).toContainText("238.50 g");
  await expect(rows.nth(0)).toContainText("11.50 g");
  await expect(rows.nth(0)).toContainText("2.88 g/h");
  await expect(rows.nth(0)).toContainText("Light");
  await expect(rows.nth(1)).toContainText("5.75 g");
  await expect(first).toContainText("Time burned: 6 h");
  await expect(first).toContainText("Weight lost: 17.25 g");
  await expect(first).toContainText("Average rate: 2.88 g/h");
  await expect(first).toContainText("Soot seen: light, moderate");
  await expect(first).toContainText("Faint lavender");
  await expect(first).toContainText("Clear lavender with warm vanilla");
  const second = candleSections(page).nth(1);
  await expect(second).toContainText("Control");
  await expect(second).toContainText("Wick: Hand-trimmed cotton 8 ply");
  await expect(second.getByTestId("burn-row")).toContainText("Not recorded");
  await expect(page.getByText("Even melt pool by the second burn.")).toBeVisible();
  await expect(page.getByText(`Marked done on ${fmt(testDate)}.`)).toBeVisible();

  // Batch page: the session is listed and the planned test is done on the test date.
  await page.goto(`/batches/${batch.id}`);
  await waitForHeading(page, "BT-01");
  const row = burnsSection(page).getByTestId("burn-row");
  await expect(row).toHaveCount(1, { timeout: SLOW });
  await expect(row).toContainText("Calibration burn");
  await expect(row).toContainText("2 candles");
  await expect(row).toContainText("0 photos");
  await expect(row).toContainText("Planned test: Planned burn test");
  await expect(milestoneRow(page, "Planned burn test")).toContainText(`Done on ${fmt(testDate)}`, {
    timeout: SLOW,
  });
  expect(produced < testDate).toBe(true);

  // ---- Edit: change a burn, remove a candle, move the date.
  await page.goto(`/burn-tests/${id}`);
  await waitForHeading(page, "Calibration burn");
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/burn-tests/${id}/edit$`), { timeout: SLOW });
  await waitForHeading(page, "Edit burn test");
  await expect(candleEditors(page)).toHaveCount(2, { timeout: SLOW });
  await expect(field(page, "Label (optional)")).toHaveValue("Calibration burn");
  await expect(burnField(page, 1, 1, "Weight after (g)")).toHaveValue("238.5");
  await burnField(page, 1, 2, "Duration (minutes)").fill("60");
  await page.getByRole("button", { name: "Remove candle 2" }).click();
  await expect(candleEditors(page)).toHaveCount(1);
  const movedDate = iso(-2);
  await field(page, "Test date").fill(movedDate);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/burn-tests/${id}$`), { timeout: SLOW });
  await expect(page.getByText("Burn test saved")).toBeVisible({ timeout: SLOW });
  await expect(candleSections(page)).toHaveCount(1);
  await expect(page.getByText(`Marked done on ${fmt(movedDate)}.`)).toBeVisible();

  // Persists across a reload.
  await page.reload();
  await waitForHeading(page, "Calibration burn");
  await expect(candleSections(page)).toHaveCount(1, { timeout: SLOW });
  const reloaded = candleSections(page).nth(0).getByTestId("burn-row");
  await expect(reloaded.nth(1)).toContainText("1 h");
  await expect(reloaded.nth(1)).toContainText("5.75 g");
  await expect(reloaded.nth(1)).toContainText("5.75 g/h");
  await expect(page.getByText(fmt(movedDate)).first()).toBeVisible();
  await expect(page.getByText("Control")).toHaveCount(0);

  // The milestone's done date moved with the session.
  await page.goto(`/batches/${batch.id}`);
  await waitForHeading(page, "BT-01");
  await expect(milestoneRow(page, "Planned burn test")).toContainText(`Done on ${fmt(movedDate)}`, {
    timeout: SLOW,
  });
  await expect(burnsSection(page).getByTestId("burn-row")).toContainText("1 candle");
  await expectNoVerdicts(page, "batch page");

  // The production date cannot move past the burn test.
  const later = iso(-1);
  await productionDate(page).fill(later);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText(`A burn test on this batch is dated ${fmt(movedDate)}. The production date can't be later than that.`),
  ).toBeVisible();
  await page.reload();
  await waitForHeading(page, "BT-01");
  await expect(productionDate(page)).toHaveValue(produced);
});

test("photos: add, view, delete, bad file, the limit of 12", async ({ page }) => {
  test.setTimeout(300_000);
  const batch = await seedBatch(page, { daysAgo: 4, label: "PH-01" });
  await createSession(page, batch.id, {
    date: iso(-1),
    label: "Photo burn",
    candles: [{ label: "P1", wickText: "Cotton 8", burns: [{ minutes: "90" }] }],
  });
  await waitForHeading(page, "Photo burn");
  await expect(page.getByText("0 of 12")).toBeVisible({ timeout: SLOW });
  await expect(page.getByText(/No photos yet/)).toBeVisible();

  // Two generated images (a JPEG and a PNG).
  await addPhotos(page, 2);
  const thumbs = page.getByRole("button", { name: /^Open photo \d+ of 2$/ });
  await expect(thumbs).toHaveCount(2);
  for (const img of await thumbs.locator("img").all()) {
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: SLOW }).toBeGreaterThan(0);
    await expect(img).toBeVisible();
  }
  await expect(page.getByText("Added 2 photos.")).toBeVisible();

  // The larger view.
  await thumbs.first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Photo 1 of 2" })).toBeVisible();
  const big = dialog.getByRole("img");
  await expect.poll(() => big.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: SLOW }).toBeGreaterThan(0);
  await expect(big).toBeVisible();

  // Delete with a confirmation: keeping first, then deleting.
  await dialog.getByRole("button", { name: "Delete photo" }).click();
  await expect(dialog.getByRole("heading", { name: "Delete this photo?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Keep photo" }).click();
  await expect(page.getByText("2 of 12")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete photo" }).click();
  await dialog.getByRole("button", { name: "Delete photo" }).click();
  await expect(dialog).toHaveCount(0, { timeout: SLOW });
  await expect(page.getByText("1 of 12")).toBeVisible({ timeout: SLOW });
  await page.reload();
  await waitForHeading(page, "Photo burn");
  await expect(page.getByText("1 of 12")).toBeVisible({ timeout: SLOW });
  await expect(page.getByRole("button", { name: /^Open photo \d+ of 1$/ })).toHaveCount(1);

  // Not an image: a clear message, nothing added.
  await page.getByTestId("photo-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("these are not a photo"),
  });
  await expect(page.getByText("notes.txt is not an image, so it was not added.")).toBeVisible({ timeout: SLOW });
  await expect(page.getByText("1 of 12")).toBeVisible();

  // The limit: add 11 more (small images) and adding is no longer offered.
  const files = [];
  for (let i = 0; i < 11; i++) {
    files.push({ name: `small-${i}.jpg`, mimeType: "image/jpeg", buffer: await makeJpeg(page, i + 20, 160, 120) });
  }
  await page.getByTestId("photo-input").setInputFiles(files);
  await expect(page.getByText("12 of 12")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: "Add photos" })).toHaveCount(0);
  await expect(page.getByText("This test has 12 photos, which is the most it can hold.")).toBeVisible();
  await expectNoVerdicts(page, "session page with photos");
});

test("a batch with burn tests cannot be deleted until they are", async ({ page }) => {
  test.setTimeout(300_000);
  const batch = await seedBatch(page, { daysAgo: 4, label: "DEL-01" });
  const sessionId = await createSession(page, batch.id, {
    date: iso(-1),
    label: "To delete",
    candles: [{ label: "D1", wickText: "Cotton 8", burns: [{ minutes: "60" }] }],
  });
  await addPhotos(page, 2);

  // The batch dialog explains the refusal and offers no delete.
  await page.goto(`/batches/${batch.id}`);
  await waitForHeading(page, "DEL-01");
  await expect(burnsSection(page).getByTestId("burn-row")).toHaveCount(1, { timeout: SLOW });
  await page.getByRole("button", { name: "Delete batch" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("This batch has 1 burn test.", { timeout: SLOW });
  await expect(dialog).toContainText("A batch cannot be deleted until its burn tests are deleted.");
  await expect(dialog.getByRole("button", { name: "Delete batch" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Keep batch" }).click();
  await expect(dialog).toHaveCount(0);

  // Delete the session: the confirmation counts its photos.
  await page.goto(`/burn-tests/${sessionId}`);
  await waitForHeading(page, "To delete");
  await expect(page.getByText("2 of 12")).toBeVisible({ timeout: SLOW });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm.getByRole("heading", { name: "Delete this burn test?" })).toBeVisible();
  await expect(confirm).toContainText("Its 2 photos will be deleted too.", { timeout: SLOW });
  await confirm.getByRole("button", { name: "Delete burn test" }).click();
  await expect(page).toHaveURL(new RegExp(`/batches/${batch.id}$`), { timeout: SLOW });
  await waitForHeading(page, "DEL-01");
  await expect(burnsSection(page)).toContainText("No burn tests yet", { timeout: SLOW });

  // Now the batch can be deleted.
  await page.getByRole("button", { name: "Delete batch" }).click();
  const batchDialog = page.getByRole("dialog");
  await expect(batchDialog.getByRole("button", { name: "Delete batch" })).toBeEnabled({ timeout: SLOW });
  await expect(batchDialog).not.toContainText("burn test");
  await batchDialog.getByRole("button", { name: "Delete batch" }).click();
  await expect(page).toHaveURL(/\/batches$/, { timeout: SLOW });
  await page.goto(`/batches/${batch.id}`);
  await expect(page.getByText("Batch not found").first()).toBeVisible({ timeout: SLOW });
});

test("compare two burn tests and download the CSV", async ({ page }) => {
  test.setTimeout(300_000);
  const { sessionA } = await seedTwoSessions(page);

  await page.goto("/burn-tests");
  await waitForHeading(page, "Burn tests");
  await expect(burnRows(page)).toHaveCount(2, { timeout: SLOW });
  await expect(page.getByText("0 of 4 selected")).toBeVisible();
  const compare = page.getByRole("button", { name: "Compare", exact: true });
  await expect(compare).toBeDisabled();
  await page.getByRole("checkbox", { name: "Select Run A to compare" }).check();
  await expect(page.getByText("1 of 4 selected")).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Run B to compare" }).check();
  await expect(page.getByText("2 of 4 selected")).toBeVisible();
  await compare.click();
  await expect(page).toHaveURL(/\/burn-tests\/compare\?sessions=/, { timeout: SLOW });
  await waitForHeading(page, "Compare burn tests");

  // The table: sessions grouped, candles as columns, rows of figures.
  const table = page.getByTestId("compare-table");
  await expect(table).toBeVisible({ timeout: SLOW });
  for (const name of ["Run A", "Run B"]) {
    await expect(table.getByRole("columnheader", { name: new RegExp(name) })).toBeVisible();
  }
  for (const name of ["A1", "A2", "B1"]) {
    await expect(table.getByRole("columnheader", { name, exact: true })).toBeVisible();
  }
  const row = (name: string) =>
    table.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
  await expect(row("Total weight loss")).toContainText("17.25 g");
  await expect(row("Total weight loss")).toContainText("9.90 g");
  await expect(row("Total weight loss")).toContainText("12.00 g");
  await expect(row("Average rate")).toContainText("2.88 g/h");
  await expect(row("Burns")).toContainText("2");
  await expect(row("Wick")).toContainText("Cotton 8");
  await expect(row("Wick")).toContainText("Wooden 15");
  await expect(row("Wick")).toContainText("Cotton 10");
  await expect(row("Cold throw")).toContainText("Faint lavender");
  const conclusion = row("Conclusion, in the maker's own words");
  await expect(conclusion).toHaveCount(1);
  await expect(conclusion).toContainText("Run A: the melt pool reached the edge by hour three.");
  await expect(conclusion).toContainText("Run B: soot appeared late in the burn.");
  await expectNoPageScroll(page, "compare at 1280");
  await expectNoVerdicts(page, "compare page");

  // CSV: BOM, header row, one row per burn.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^candlelab-burn-tests-\d{8}\.csv$/);
  const file = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const text = readText(file);
  expect(text.charCodeAt(0), "UTF-8 BOM").toBe(0xfeff);
  const rows = parseCsv(text.slice(1));
  const header = rows[0];
  expect(header).toEqual([
    "Test date",
    "Session",
    "Batch",
    "Formula",
    "Version",
    "Candle",
    "Wick",
    "Burn",
    "Duration (min)",
    "Weight before (g)",
    "Weight after (g)",
    "Weight loss (g)",
    "Rate (g/h)",
    "Melt pool diameter (mm)",
    "Melt pool depth (mm)",
    "Flame height (mm)",
    "Soot",
    "Burn notes",
    "Cold throw",
    "Hot throw",
    "Candle notes",
    "Maker's conclusion",
  ]);
  // Burns: A1 x2, A2 x1, B1 x1.
  expect(rows.length, "header plus one row per burn").toBe(1 + 4);
  expect(rows.every((r) => r.length === header.length)).toBe(true);
  const col = (r: string[], name: string) => r[header.indexOf(name)];
  const a1 = rows.filter((r) => col(r, "Candle") === "A1");
  expect(a1).toHaveLength(2);
  expect(col(a1[0], "Test date")).toBe(iso(-3));
  expect(col(a1[0], "Session")).toBe("Run A");
  expect(col(a1[0], "Batch")).toBe("BT-A");
  expect(col(a1[0], "Formula")).toBe(WE5.name);
  expect(col(a1[0], "Wick")).toBe("Cotton 8");
  expect(col(a1[0], "Burn")).toBe("1");
  expect(col(a1[0], "Duration (min)")).toBe("240");
  expect(Number(col(a1[0], "Weight loss (g)"))).toBe(11.5);
  expect(Number(col(a1[0], "Rate (g/h)"))).toBeCloseTo(2.88, 2);
  expect(col(a1[0], "Soot")).toBe("Light");
  expect(col(a1[0], "Maker's conclusion")).toBe("Run A: the melt pool reached the edge by hour three.");
  expect(col(rows.find((r) => col(r, "Candle") === "B1")!, "Session")).toBe("Run B");

  // The session page has its own CSV: three burns for Run A.
  await page.goto(`/burn-tests/${sessionA}`);
  await waitForHeading(page, "Run A");
  const single = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const singleFile = test.info().outputPath("single.csv");
  await (await single).saveAs(singleFile);
  expect(parseCsv(readText(singleFile).slice(1))).toHaveLength(1 + 3);
});

test("report and print layout, single and comparison", async ({ page }) => {
  test.setTimeout(300_000);
  const { sessionA, sessionB } = await seedTwoSessions(page);
  await page.goto(`/burn-tests/${sessionA}`);
  await waitForHeading(page, "Run A");
  await addPhotos(page, 2);

  const reports = [
    { name: "session report", url: `/burn-tests/${sessionA}/report`, heading: "Burn test report", photos: 2 },
    {
      name: "comparison report",
      url: `/burn-tests/compare/report?sessions=${sessionA},${sessionB}`,
      heading: "Burn test comparison report",
      photos: 2,
    },
  ];
  for (const report of reports) {
    await page.emulateMedia({ media: "screen" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(report.url);
    await waitForHeading(page, report.heading);
    await expect(page.getByTestId("report-session").first()).toBeVisible({ timeout: SLOW });
    const printButton = page.getByRole("button", { name: "Print or save as PDF" });
    const backLink = page.getByRole("link", { name: "Back", exact: true });
    await expect(printButton).toBeVisible();
    await expect(backLink).toBeVisible();
    await expect(page.getByText("These are the maker's own observations.")).toBeVisible();
    await expect(page.getByText("does not certify or rate candles")).toBeVisible();
    await expectNoVerdicts(page, report.name);
    await expectNoPageScroll(page, `${report.name} on screen`);

    // Print: an A4-wide page at 96 dpi.
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: "print" });
    await expect(printButton).toBeHidden();
    await expect(backLink).toBeHidden();
    await expect(page.getByText("These are the maker's own observations.")).toBeVisible();
    await expect(page.getByText("does not certify or rate candles")).toBeVisible();
    const chrome = await page.evaluate(() =>
      [...document.querySelectorAll("nav")].map((el) => {
        const b = el.getBoundingClientRect();
        return getComputedStyle(el).display !== "none" && b.width > 0 && b.height > 0;
      }),
    );
    expect(chrome.some(Boolean), `${report.name}: side nav or phone bar shown in print`).toBe(false);

    // Tables and every element inside the report fit the page width.
    const wide = await page.evaluate(() => {
      const limit = window.innerWidth + 1;
      const tooWide: string[] = [];
      for (const el of document.querySelectorAll("article *")) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.right > limit) tooWide.push(`${el.tagName}.${(el as HTMLElement).className.toString().slice(0, 40)} ${Math.round(b.right)}`);
      }
      return { tooWide, scrollWidth: document.documentElement.scrollWidth, tables: document.querySelectorAll("article table").length };
    });
    expect(wide.tables).toBeGreaterThan(0);
    expect(wide.tooWide, `${report.name}: elements wider than the print page`).toEqual([]);
    expect(wide.scrollWidth).toBeLessThanOrEqual(795);

    // Photos are in the report and loaded.
    const imgs = page.locator("article img");
    await expect(imgs).toHaveCount(report.photos);
    for (const img of await imgs.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: SLOW }).toBeGreaterThan(0);
    }

    // The browser can lay it out as a PDF.
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    expect(pdf.length, `${report.name}: PDF size`).toBeGreaterThan(2000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  }
});

test("backup includes photos and restores them", async ({ page, browser }, testInfo) => {
  test.setTimeout(300_000);
  const batch = await seedBatch(page, { daysAgo: 4, label: "BK-01" });
  const sessionId = await createSession(page, batch.id, {
    date: iso(-1),
    label: "Backup burn",
    candles: [{ label: "K1", wickText: "Cotton 8", burns: [{ minutes: "90", before: "200", after: "195" }] }],
    conclusion: "Kept for the backup test.",
  });
  await addPhotos(page, 3);

  const { file, backup } = await exportBackup(page, testInfo);
  expect(backup.formatVersion).toBe(5);
  expect(backup.counts.burnPhotos).toBe(3);
  expect(backup.data.burnPhotos).toHaveLength(3);
  for (const photo of backup.data.burnPhotos) {
    expect(typeof photo.dataBase64).toBe("string");
    expect(photo.dataBase64.length).toBeGreaterThan(100);
    expect(photo.sessionId).toBe(sessionId);
    expect(Buffer.from(photo.dataBase64, "base64").length).toBe(photo.byteLength);
  }
  expect(backup.data.burnSessions).toHaveLength(1);

  // The page shows the file size, matching the real file to the display rounding.
  const line = page.getByText(/^Backup file: /);
  await expect(line).toBeVisible({ timeout: SLOW });
  const shown = (await line.innerText()).match(/Backup file: ([\d.]+) (B|KB|MB|GB)/);
  expect(shown, "size line").not.toBeNull();
  const unit = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 ** 3 }[shown![2] as "B" | "KB" | "MB" | "GB"];
  const actual = statSync(file).size;
  expect(Math.abs(Number(shown![1]) * unit - actual)).toBeLessThanOrEqual(unit * 0.5 + 1);
  await expect(page.getByText(/^Photos on this device: 3 photos, /)).toBeVisible();

  // Restore into a clean context.
  const { ctx, page: fresh } = await cleanContext(browser, testInfo);
  try {
    await restoreFile(fresh, file, true);
    await fresh.goto("/burn-tests");
    await waitForHeading(fresh, "Burn tests");
    await expect(fresh.getByTestId("burn-row").filter({ visible: true })).toHaveCount(1, { timeout: SLOW });
    await fresh.getByRole("link", { name: "Backup burn" }).click();
    await waitForHeading(fresh, "Backup burn");
    await expect(fresh.getByText("3 of 12")).toBeVisible({ timeout: SLOW });
    const thumbs = fresh.getByRole("button", { name: /^Open photo \d+ of 3$/ });
    await expect(thumbs).toHaveCount(3);
    for (const img of await thumbs.locator("img").all()) {
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: SLOW }).toBeGreaterThan(0);
    }
    await expect(fresh.getByText("Kept for the backup test.")).toBeVisible();
    await expect(fresh.getByText("Wick: Cotton 8")).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test("wording: no verdict words on any burn screen", async ({ page }) => {
  test.setTimeout(300_000);
  const { batchA, sessionA, sessionB } = await seedTwoSessions(page);
  await page.goto(`/burn-tests/${sessionA}`);
  await waitForHeading(page, "Run A");
  await addPhotos(page, 1);
  await expectNoVerdicts(page, "session page");

  const screens: [string, string, string | RegExp][] = [
    ["new editor", `/burn-tests/new?batch=${batchA}`, "Record burn test"],
    ["edit editor", `/burn-tests/${sessionA}/edit`, "Edit burn test"],
    ["list", "/burn-tests", "Burn tests"],
    ["comparison", `/burn-tests/compare?sessions=${sessionA},${sessionB}`, "Compare burn tests"],
    ["session report", `/burn-tests/${sessionA}/report`, "Burn test report"],
    ["comparison report", `/burn-tests/compare/report?sessions=${sessionA},${sessionB}`, "Burn test comparison report"],
    ["batch page", `/batches/${batchA}`, "BT-A"],
  ];
  for (const [name, url, heading] of screens) {
    await page.goto(url);
    await waitForHeading(page, heading);
    await page.waitForTimeout(500);
    await expectNoVerdicts(page, name);
  }

  // An error state too: the editor with nothing filled.
  await page.goto(`/burn-tests/new?batch=${batchA}`);
  await waitForHeading(page, "Record burn test");
  await field(page, "Test date").fill("");
  await page.getByRole("button", { name: "Save burn test" }).click();
  await expect(page.getByText("Enter the test date.")).toBeVisible();
  await expectNoVerdicts(page, "editor with errors");
});
