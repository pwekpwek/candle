import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectInputsAtLeast16, expectNoSideScroll, expectTapHeight } from "./helpers-flow";
import {
  SLOW,
  addPhotos,
  burnField,
  candleEditors,
  expectNoVerdicts,
  field,
  fillBurn,
  fillCandle,
  makeBatch,
  saveSession,
  seedBatch,
  waitForHeading,
  createSession,
  type SessionSpec,
} from "./helpers-burn";
import { checkScreen, iso, visible } from "./helpers-schedule";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

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

const burnsSection = (p: Page) => visible(p.getByRole("region", { name: "Burn tests", exact: true }));

const RUN_A: SessionSpec = {
  date: iso(-3),
  label: "Run A",
  candles: [
    {
      label: "A1",
      wickText: "Cotton 8",
      burns: [
        { minutes: "240", before: "250", after: "238.5", diameter: "50", depth: "10", flame: "40", soot: "Light", notes: "Steady flame" },
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

test("the burn editor and session screens at 375px", async ({ page }) => {
  test.setTimeout(300_000);
  const batch = await seedBatch(page, { daysAgo: 5, label: "PH-01", burnTestOffset: "3" });

  // Batch page: the Burn tests section, empty.
  await page.goto(`/batches/${batch.id}`);
  await waitForHeading(page, "PH-01");
  const section = burnsSection(page);
  await expect(section).toContainText("No burn tests yet", { timeout: SLOW });
  const record = section.getByRole("link", { name: "Record burn test" });
  await expectTapHeight(record, "batch: Record burn test");
  await expectTapHeight(section.getByRole("link", { name: "Compare burn tests" }), "batch: Compare burn tests");
  await checkScreen(page, "batch page, no burn tests");

  // Editor.
  await record.tap();
  await expect(page).toHaveURL(/\/burn-tests\/new\?batch=/, { timeout: SLOW });
  await waitForHeading(page, "Record burn test");
  await expect(field(page, "Test date")).toBeVisible({ timeout: SLOW });
  await checkScreen(page, "editor (new, empty)");
  await expectTapHeight(field(page, "Test date"), "editor: date");
  await expectTapHeight(page.getByRole("button", { name: "Add candle" }), "editor: Add candle");
  await expectTapHeight(page.getByRole("button", { name: "Save burn test" }), "editor: Save");

  // One field error, in view and not wider than the screen.
  await candleEditors(page).first().getByRole("button", { name: "Add burn" }).tap();
  const duration = burnField(page, 1, 1, "Duration (minutes)");
  await duration.fill("1441");
  await duration.blur();
  const error = page.getByText("Enter 1 to 1440 minutes.");
  await expectInView(error, "duration error");
  await expectInsideViewport(error, "duration error");
  await expectNoSideScroll(page, "editor with an error");
  expect(await expectInputsAtLeast16(page, "editor"), "editor has fields").toBeGreaterThan(5);
  await expectTapHeight(candleEditors(page).first().getByRole("button", { name: "Remove burn" }), "editor: Remove burn");

  // Two candles with burns.
  await fillBurn(page, 1, 1, RUN_A.candles[0].burns![0]);
  await fillCandle(page, 1, { label: "A1", wickText: "Cotton 8" });
  await candleEditors(page).first().getByRole("button", { name: "Add burn" }).tap();
  await fillBurn(page, 1, 2, RUN_A.candles[0].burns![1]);
  await page.getByRole("button", { name: "Add candle" }).tap();
  await expect(candleEditors(page)).toHaveCount(2);
  await fillCandle(page, 2, RUN_A.candles[1]);
  await expectTapHeight(page.getByRole("button", { name: "Remove candle 2" }), "editor: Remove candle");
  await field(page, "Test date").fill(iso(-3));
  await field(page, "Label (optional)").fill("Run A");
  await field(page, "Your conclusion (optional)").fill(RUN_A.conclusion!);
  await checkScreen(page, "editor with two candles and burns");

  // Save: the confirmation is in view.
  const id = await saveSession(page);
  await waitForHeading(page, "Run A");
  await expectInView(page.getByText("Burn test saved"), "saved notice");
  await expectNoSideScroll(page, "session page just saved");

  // Session page: actions, burns table scrolling inside its own region, photos.
  await expectTapHeight(page.getByRole("link", { name: "Edit", exact: true }), "session: Edit");
  await expectTapHeight(page.getByRole("link", { name: "Report", exact: true }), "session: Report");
  await expectTapHeight(page.getByRole("button", { name: "Download CSV" }), "session: Download CSV");
  await expectTapHeight(page.getByRole("button", { name: "Delete", exact: true }), "session: Delete");
  const tableRegion = page.getByRole("region", { name: "A1: Burns" });
  await expect(tableRegion).toBeVisible();
  await expectInsideViewport(tableRegion, "burns table region");
  await expectNoSideScroll(page, "session page with the burns table");
  await addPhotos(page, 2);
  await expectTapHeight(page.getByRole("button", { name: "Add photos" }), "session: Add photos");
  const thumb = page.getByRole("button", { name: "Open photo 1 of 2" });
  await expectTapHeight(thumb, "session: photo thumbnail");
  await checkScreen(page, "session page with burns and photos");

  // The larger view stays on screen.
  await thumb.tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectInsideViewport(dialog, "photo dialog");
  await expectTapHeight(dialog.getByRole("button", { name: "Close" }).last(), "photo dialog: Close");
  await dialog.getByRole("button", { name: "Close" }).last().tap();
  await expect(dialog).toHaveCount(0);

  // Batch page with a session.
  await page.goto(`/batches/${batch.id}`);
  await waitForHeading(page, "PH-01");
  await expect(burnsSection(page).getByTestId("burn-row")).toHaveCount(1, { timeout: SLOW });
  await expectTapHeight(burnsSection(page).getByTestId("burn-row"), "batch: session row");
  await checkScreen(page, "batch page with a burn test");

  // Report.
  await page.goto(`/burn-tests/${id}/report`);
  await waitForHeading(page, "Burn test report");
  await expect(page.getByTestId("report-session")).toBeVisible({ timeout: SLOW });
  await expectTapHeight(page.getByRole("button", { name: "Print or save as PDF" }), "report: Print");
  await expectTapHeight(page.getByRole("link", { name: "Back", exact: true }), "report: Back");
  await checkScreen(page, "session report");
  await expectNoVerdicts(page, "session report at 375px");
});

async function seedTwo(page: Page) {
  const a = await seedBatch(page, { daysAgo: 10, label: "BT-A" });
  const b = await makeBatch(page, a.formulaUrl, { daysAgo: 6, label: "BT-B" });
  const sessionA = await createSession(page, a.id, RUN_A);
  const sessionB = await createSession(page, b, {
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
  });
  return { sessionA, sessionB };
}

test("the burn list and comparison at 375px", async ({ page }) => {
  test.setTimeout(300_000);
  await seedTwo(page);

  // The list with its picker.
  await page.goto("/burn-tests");
  await waitForHeading(page, "Burn tests");
  await expect(page.getByTestId("burn-row").filter({ visible: true })).toHaveCount(2, { timeout: SLOW });
  await checkScreen(page, "burn tests list");
  const pickA = page.getByRole("checkbox", { name: "Select Run A to compare" });
  const pickB = page.getByRole("checkbox", { name: "Select Run B to compare" });
  await expectTapHeight(page.locator("label", { has: pickA }), "list: checkbox label");
  await pickA.check();
  await pickB.check();
  await expect(page.getByText("2 of 4 selected")).toBeVisible();
  await expectTapHeight(page.getByRole("button", { name: "Compare", exact: true }), "list: Compare");
  await expectTapHeight(page.getByRole("button", { name: "Clear selection" }), "list: Clear selection");
  await page.getByRole("button", { name: "Compare", exact: true }).tap();
  await expect(page).toHaveURL(/\/burn-tests\/compare\?sessions=/, { timeout: SLOW });

  // Comparison: the table scrolls inside its own region, not the page.
  await waitForHeading(page, "Compare burn tests");
  await expect(page.getByTestId("compare-table")).toBeVisible({ timeout: SLOW });
  await expectInsideViewport(page.getByTestId("compare-scroll"), "compare scroll region");
  const overflow = await page
    .getByTestId("compare-scroll")
    .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(overflow.scroll, "the table is wider than the phone and scrolls in its region").toBeGreaterThan(overflow.client);
  await expectTapHeight(page.getByRole("link", { name: "Report", exact: true }), "compare: Report");
  await expectTapHeight(page.getByRole("button", { name: "Download CSV" }), "compare: Download CSV");
  await expectTapHeight(page.getByRole("link", { name: "Change selection" }), "compare: Change selection");
  await checkScreen(page, "comparison");
});

test("the comparison report at 375px", async ({ page }) => {
  test.setTimeout(300_000);
  const { sessionA, sessionB } = await seedTwo(page);
  await page.goto(`/burn-tests/compare/report?sessions=${sessionA},${sessionB}`);
  await waitForHeading(page, "Burn test comparison report");
  await expect(page.getByTestId("report-session").first()).toBeVisible({ timeout: SLOW });
  await expectTapHeight(page.getByRole("button", { name: "Print or save as PDF" }), "comparison report: Print");
  await checkScreen(page, "comparison report");
  await expectNoVerdicts(page, "comparison report at 375px");
});
