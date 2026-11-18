import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import {
  SLOW,
  WE5,
  WE8,
  WE9A,
  enterWE8,
  expectEmptyMeasured,
  expectPlanned,
  expectWE5Panel,
  expectWE8ActualBlend,
  expectWE8Figures,
  fillWE5,
  measuredInput,
  openNewFormula,
  saveFromEditor,
  scaleToTen,
  waitForHeading,
} from "./helpers-flow";

test.use({ viewport: { width: 1280, height: 800 } });

// TEST-27: the PRD "v0.1 acceptance (round trip)" in one browser, then a clean one.
test("round trip: create, measure, reload, scale, export, restore in a clean browser", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);

  // 1. Create WE-5 through the editor.
  await openNewFormula(page);
  await fillWE5(page);
  await expectWE5Panel(page);

  // 2. Version 1 is saved; enter the WE-8 weights.
  await saveFromEditor(page);
  await waitForHeading(page, WE5.name);
  await enterWE8(page);
  await expectWE8Figures(page);

  // 3. Reload: planned and measured figures are unchanged.
  await page.reload();
  await waitForHeading(page, WE5.name);
  await expectPlanned(page, {
    "Soy 464": "1000.0 g",
    Lavender: "40.0 g",
    Vanilla: "26.7 g",
    Cedar: "13.3 g",
    Fragrance: "80.0 g",
    "Total mixture": "1080.0 g",
  });
  await expectWE8Figures(page);

  // 4. Scale to 10 vessels (WE-9a): version 2, planned weights, nothing measured.
  await scaleToTen(page);
  await expectPlanned(page, WE9A);
  await expectEmptyMeasured(page);

  // 5. Export a backup from Backup and restore.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Backup and restore" })
    .click();
  await waitForHeading(page, "Backup and restore");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^candlelab-backup-\d{8}-\d{6}\.json$/,
  );
  const backupPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, "utf8"));
  expect(backup.counts).toMatchObject({
    formulas: 1,
    formulaVersions: 2,
    materials: 4,
    measurements: 1,
  });
  expect(backup.data.formulaVersions).toHaveLength(2);
  expect(backup.data.materials).toHaveLength(4);
  expect(backup.data.measurements).toHaveLength(1);
  await expect(page.getByText(/^Exported .* · 1 formula · 2 versions$/)).toBeVisible();

  // 6. A clean browser context: first-run list, then restore the file.
  const baseURL = testInfo.project.use.baseURL;
  const clean = await browser.newContext({
    baseURL,
    viewport: { width: 1280, height: 800 },
  });
  try {
    const fresh = await clean.newPage();
    await fresh.goto("/");
    await waitForHeading(fresh, "Saved formulas");
    await expect(
      fresh.getByText("Your formulas will live here."),
    ).toBeVisible({ timeout: SLOW });

    await fresh.goto("/backup");
    await waitForHeading(fresh, "Backup and restore");
    await fresh.locator("input[type=file]").setInputFiles(backupPath);
    await expect(
      fresh.getByText("Will add 1 formula, 2 versions, 4 materials, 1 measurement"),
    ).toBeVisible({ timeout: SLOW });
    await fresh.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(fresh.getByText("Restore finished.")).toBeVisible({ timeout: SLOW });
    await expect(
      fresh.getByText(/1 formula, 2 versions, 4 materials, 1 measurement/).last(),
    ).toBeVisible();
    await fresh.getByRole("link", { name: "Open saved formulas" }).click();

    // 7. The list shows v2 at 1800.0 g; version 2 and then version 1 open with their figures.
    await waitForHeading(fresh, "Saved formulas");
    const row = fresh.getByTestId("formula-row");
    await expect(row).toHaveCount(1, { timeout: SLOW });
    await expect(row).toContainText(WE5.name);
    await expect(row).toContainText("v2");
    await expect(row).toContainText("1800.0 g");

    await row.getByRole("link", { name: WE5.name }).click();
    await waitForHeading(fresh, WE5.name);
    await expectPlanned(fresh, WE9A);
    await expectEmptyMeasured(fresh);

    await fresh.getByRole("link", { name: /^v1\b/ }).click();
    await expect(fresh).toHaveURL(/\/versions\//, { timeout: SLOW });
    await expectPlanned(fresh, {
      "Soy 464": "1000.0 g",
      Lavender: "40.0 g",
      Vanilla: "26.7 g",
      Cedar: "13.3 g",
      Fragrance: "80.0 g",
      "Total mixture": "1080.0 g",
    });
    for (const [name, grams] of Object.entries(WE8)) {
      await expect(measuredInput(fresh, name)).toHaveValue(grams, { timeout: SLOW });
    }
    await expectWE8ActualBlend(fresh);
  } finally {
    await clean.close();
  }
});
