import { test, expect, type Page } from "@playwright/test";
import {
  SLOW,
  WE5,
  addPhotos,
  createSession,
  parseCsv,
  readText,
  waitForHeading,
  type SessionSpec,
} from "./helpers-burn";
import {
  addCurePlan,
  buildWE5,
  createBatch,
  exportBackup,
  fmt,
  iso,
  milestoneRow,
  openBatch,
  openSchedule,
  planProduction,
  restoreFile,
  scheduleGroup,
  scheduleRows,
  submitCreate,
  visible,
} from "./helpers-schedule";
import { WE9A, expectPlanned, expectNoSideScroll, scaleToTen } from "./helpers-flow";

const VIEWPORTS = [
  { name: "desktop 1280x800", width: 1280, height: 800 },
  { name: "phone 375x812", width: 375, height: 812 },
] as const;

/** The words the app must never write: observations and scheduling only. */
const JUDGEMENT = /\b(passed|failed|safe|cured|ready|certified)\b/i;

async function expectNoJudgement(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  const hit = text.match(JUDGEMENT);
  expect(hit, `${where}: visible text has "${hit?.[0]}"`).toBeNull();
}

const RUN_A: SessionSpec = {
  date: iso(-3),
  label: "Run A",
  planned: "Planned burn test",
  candles: [
    {
      label: "A1",
      wickText: "Cotton 8",
      burns: [
        { minutes: "240", before: "250", after: "238.5", diameter: "50", depth: "10", flame: "40", soot: "Light" },
        { minutes: "120", before: "238.5", after: "232.75", diameter: "60", depth: "15", flame: "45", soot: "Moderate" },
      ],
      coldThrow: "Faint lavender",
    },
    {
      label: "A2",
      wickText: "Wooden 15",
      burns: [{ minutes: "180", before: "200", after: "190.1", soot: "None seen" }],
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

for (const vp of VIEWPORTS) {
  test.describe(`v0.2 integration at ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    const phone = vp.width === 375;

    const noScroll = async (page: Page, where: string) => {
      if (phone) await expectNoSideScroll(page, where);
    };

    test("formula, batches, cure, schedule, burns, reports and a restore keep every link", async ({
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(600_000);
      const producedA = iso(-10);
      const producedB = iso(-6);

      // 1. Formula: version 1, then scale to version 2.
      await buildWE5(page);
      const formulaUrl = page.url().split("?")[0];
      await noScroll(page, "formula page v1");

      // 2. Batch A from version 1 (before scaling), batch B from version 2.
      const idA = await createBatch(page, formulaUrl, { date: producedA, label: "INT-A" });
      await waitForHeading(page, "INT-A");
      await expect(page.getByRole("link", { name: "version 1" })).toBeVisible({ timeout: SLOW });
      await noScroll(page, "batch A");

      await page.goto(formulaUrl);
      await waitForHeading(page, WE5.name);
      await scaleToTen(page);
      await expectPlanned(page, WE9A);

      const idB = await createBatch(page, formulaUrl, { date: producedB, label: "INT-B" });
      await waitForHeading(page, "INT-B");
      await expect(page.getByRole("link", { name: "version 2" })).toBeVisible({ timeout: SLOW });
      await expect(page.getByRole("link", { name: "version 1" })).toHaveCount(0);
      await expectPlanned(page, WE9A);
      await openBatch(page, idA, "INT-A");
      await expect(
        page.getByText("Made from version 1. The formula's latest version is 2."),
      ).toBeVisible({ timeout: SLOW });

      // 3. Cure plan with a planned burn test on batch A.
      await addCurePlan(page, idA, {
        cure: "14",
        rows: [{ kind: "burnTest", offset: "3" }],
      });
      await expect(milestoneRow(page, "Planned burn test")).toContainText(
        `Due ${fmt(iso(-7))}`,
        { timeout: SLOW },
      );
      await noScroll(page, "batch A with cure plan");

      // Plan production, then turn the entry into a batch.
      const planId = await planProduction(page, formulaUrl, { date: iso(5), label: "INT-C" });
      await visible(page.getByRole("link", { name: "Create batch" })).click();
      await waitForHeading(page, "Create batch");
      await expect(page.getByText("From planned production.")).toBeVisible({ timeout: SLOW });
      const idC = await submitCreate(page);
      await waitForHeading(page, "INT-C");
      await page.goto(`/schedule/plan/${planId}`);
      await waitForHeading(page, "INT-C");
      await expect(page.getByText("Batch made from this entry:")).toBeVisible({ timeout: SLOW });
      await expect(
        visible(page.getByRole("link", { name: "INT-C", exact: true })),
      ).toHaveAttribute("href", `/batches/${idC}`);
      await noScroll(page, "planned entry");
      await openSchedule(page);
      const done = scheduleGroup(page, "Done");
      await expect(scheduleRows(done).filter({ hasText: "INT-C" })).toHaveCount(1, {
        timeout: SLOW,
      });
      await expect(done).toContainText("Planned production");
      await noScroll(page, "schedule");

      // 4. Burn sessions on two batches; A is linked to the planned test.
      const sessionA = await createSession(page, idA, RUN_A);
      await waitForHeading(page, "Run A");
      await expect(page.getByText(`Marked done on ${fmt(iso(-3))}.`)).toBeVisible();
      await expect(page.getByText("Weight lost: 17.25 g")).toBeVisible();
      await expect(page.getByText("Average rate: 2.88 g/h")).toBeVisible();
      await addPhotos(page, 1);
      await noScroll(page, "session A");
      await page.goto(`/batches/${idA}`);
      await waitForHeading(page, "INT-A");
      await expect(milestoneRow(page, "Planned burn test")).toContainText(
        `Done on ${fmt(iso(-3))}`,
        { timeout: SLOW },
      );
      const sessionB = await createSession(page, idB, RUN_B);
      await waitForHeading(page, "Run B");
      await expect(page.getByText("Weight lost: 12.00 g")).toBeVisible();
      await expectNoJudgement(page, "session B");

      // 5. Compare, reports, CSV.
      await page.goto("/burn-tests");
      await waitForHeading(page, "Burn tests");
      await expect(page.getByTestId("burn-row").filter({ visible: true })).toHaveCount(2, {
        timeout: SLOW,
      });
      await noScroll(page, "burn tests list");
      await page.getByRole("checkbox", { name: "Select Run A to compare" }).check();
      await page.getByRole("checkbox", { name: "Select Run B to compare" }).check();
      await page.getByRole("button", { name: "Compare", exact: true }).click();
      await expect(page).toHaveURL(/\/burn-tests\/compare\?sessions=/, { timeout: SLOW });
      await waitForHeading(page, "Compare burn tests");
      const table = page.getByTestId("compare-table");
      await expect(table).toBeVisible({ timeout: SLOW });
      const row = (name: string) =>
        table.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
      await expect(row("Total weight loss")).toContainText("17.25 g");
      await expect(row("Total weight loss")).toContainText("12.00 g");
      await expect(row("Average rate")).toContainText("2.88 g/h");
      await expectNoJudgement(page, "comparison");
      await noScroll(page, "comparison");

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download CSV" }).click();
      const download = await downloadPromise;
      const csvFile = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(csvFile);
      const csv = readText(csvFile);
      expect(csv.charCodeAt(0), "UTF-8 BOM").toBe(0xfeff);
      const rows = parseCsv(csv.slice(1));
      expect(rows[0].slice(0, 8)).toEqual([
        "Test date",
        "Session",
        "Batch",
        "Formula",
        "Version",
        "Candle",
        "Wick",
        "Burn",
      ]);
      expect(rows[0]).toContain("Weight loss (g)");
      expect(rows[0]).toContain("Rate (g/h)");
      expect(rows, "header plus one row per burn (A1 x2, A2 x1, B1 x1)").toHaveLength(1 + 4);
      const col = (r: string[], name: string) => r[rows[0].indexOf(name)];
      const a1 = rows.filter((r) => col(r, "Candle") === "A1");
      expect(a1).toHaveLength(2);
      expect(col(a1[0], "Batch")).toBe("INT-A");
      expect(col(a1[0], "Version")).toBe("1");
      expect(Number(col(a1[0], "Weight loss (g)"))).toBe(11.5);
      const b1 = rows.find((r) => col(r, "Candle") === "B1")!;
      expect(col(b1, "Batch")).toBe("INT-B");
      expect(col(b1, "Version")).toBe("2");

      const reports = [
        { name: "session report", url: `/burn-tests/${sessionA}/report`, heading: "Burn test report" },
        {
          name: "comparison report",
          url: `/burn-tests/compare/report?sessions=${sessionA},${sessionB}`,
          heading: "Burn test comparison report",
        },
      ];
      for (const report of reports) {
        await page.emulateMedia({ media: "screen" });
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(report.url);
        await waitForHeading(page, report.heading);
        await expect(page.getByTestId("report-session").first()).toBeVisible({ timeout: SLOW });
        const printButton = page.getByRole("button", { name: "Print or save as PDF" });
        const backLink = page.getByRole("link", { name: "Back", exact: true });
        await expect(printButton).toBeVisible();
        await expect(backLink).toBeVisible();
        await expectNoJudgement(page, `${report.name} on screen`);
        await noScroll(page, `${report.name} on screen`);

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
        expect(chrome.some(Boolean), `${report.name}: nav shown in print`).toBe(false);
        const wide = await page.evaluate(() => {
          const limit = window.innerWidth + 1;
          const tooWide: string[] = [];
          for (const el of document.querySelectorAll("article *")) {
            const b = el.getBoundingClientRect();
            if (b.width > 0 && b.right > limit) tooWide.push(`${el.tagName} ${Math.round(b.right)}`);
          }
          return { tooWide, scrollWidth: document.documentElement.scrollWidth };
        });
        expect(wide.tooWide, `${report.name}: elements wider than the print page`).toEqual([]);
        expect(wide.scrollWidth).toBeLessThanOrEqual(795);
        await expectNoJudgement(page, `${report.name} in print`);
      }
      await page.emulateMedia({ media: "screen" });
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 6. Backup, then restore in a fresh profile.
      const { file, backup } = await exportBackup(page, testInfo);
      expect(backup.formatVersion).toBe(5);
      expect(backup.counts).toMatchObject({
        formulas: 1,
        formulaVersions: 2,
        batches: 3,
        curePlans: 1,
        productionPlans: 1,
        burnSessions: 2,
        burnPhotos: 1,
      });
      expect(backup.data.productionPlans[0]).toMatchObject({ id: planId, batchId: idC });
      await noScroll(page, "backup page");

      const ctx = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: vp.width, height: vp.height },
      });
      try {
        const fresh = await ctx.newPage();
        await restoreFile(fresh, file, true);

        // Each batch -> its formula version.
        await openBatch(fresh, idA, "INT-A");
        const linkA = fresh.getByRole("link", { name: "version 1" });
        await expect(linkA).toHaveAttribute("href", /\/formulas\/[^/]+\/versions\/[^/]+$/);
        await expect(
          fresh.getByText("Made from version 1. The formula's latest version is 2."),
        ).toBeVisible();
        await linkA.click();
        await expect(fresh).toHaveURL(/\/versions\//, { timeout: SLOW });
        await waitForHeading(fresh, WE5.name);
        await expectPlanned(fresh, { "Soy 464": "1000.0 g", "Total mixture": "1080.0 g" });

        await openBatch(fresh, idB, "INT-B");
        const linkB = fresh.getByRole("link", { name: "version 2" });
        await expect(linkB).toHaveAttribute("href", /\/formulas\/[^/]+\/versions\/[^/]+$/);
        await linkB.click();
        await expect(fresh).toHaveURL(/\/versions\//, { timeout: SLOW });
        await waitForHeading(fresh, WE5.name);
        await expectPlanned(fresh, WE9A);

        // Planned production entry -> its batch; Done on the schedule.
        await fresh.goto(`/schedule/plan/${planId}`);
        await waitForHeading(fresh, "INT-C");
        await expect(fresh.getByText("Batch made from this entry:")).toBeVisible({ timeout: SLOW });
        await expect(
          visible(fresh.getByRole("link", { name: "INT-C", exact: true })),
        ).toHaveAttribute("href", `/batches/${idC}`);
        await expect(visible(fresh.getByRole("link", { name: "Create batch" }))).toHaveCount(0);
        await noScroll(fresh, "restored entry");
        await openSchedule(fresh);
        await expect(
          scheduleRows(scheduleGroup(fresh, "Done")).filter({ hasText: "INT-C" }),
        ).toHaveCount(1, { timeout: SLOW });
        await noScroll(fresh, "restored schedule");

        // Cure plan with the milestone done on the test date, and Run A listed.
        await openBatch(fresh, idA, "INT-A");
        const curing = visible(fresh.getByRole("region", { name: "Curing" }));
        await expect(curing).toContainText("Cure time: 14 days", { timeout: SLOW });
        await expect(milestoneRow(fresh, "Planned burn test")).toContainText(
          `Done on ${fmt(iso(-3))}`,
        );
        const burns = visible(fresh.getByRole("region", { name: "Burn tests", exact: true }));
        await expect(burns.getByTestId("burn-row")).toContainText("Run A", { timeout: SLOW });
        await expect(burns.getByTestId("burn-row")).toContainText("1 photo");
        await noScroll(fresh, "restored batch A");

        // Each session -> its batch; the linked one -> milestone and photo.
        await fresh.goto(`/burn-tests/${sessionB}`);
        await waitForHeading(fresh, "Run B");
        await expect(fresh.locator(`a[href="/batches/${idB}"]`).first()).toBeVisible({ timeout: SLOW });
        await expect(fresh.getByText("Weight lost: 12.00 g")).toBeVisible();
        await expectNoJudgement(fresh, "restored session B");

        await fresh.goto(`/burn-tests/${sessionA}`);
        await waitForHeading(fresh, "Run A");
        await expect(fresh.locator(`a[href="/batches/${idA}"]`).first()).toBeVisible({ timeout: SLOW });
        await expect(fresh.getByText(`Marked done on ${fmt(iso(-3))}.`)).toBeVisible();
        await expect(fresh.getByText("Weight lost: 17.25 g")).toBeVisible();
        await expect(fresh.getByText("1 of 12", { exact: true })).toBeVisible({ timeout: SLOW });
        const thumb = fresh.getByRole("button", { name: /^Open photo \d+ of 1$/ });
        await expect(thumb).toHaveCount(1);
        await expect
          .poll(() => thumb.locator("img").evaluate((el: HTMLImageElement) => el.naturalWidth), {
            timeout: SLOW,
          })
          .toBeGreaterThan(0);
        await expectNoJudgement(fresh, "restored session A");
        await noScroll(fresh, "restored session A");

        // Comparison and reports still work and still avoid judgement words.
        const compareUrl = `/burn-tests/compare?sessions=${sessionA},${sessionB}`;
        await fresh.goto(compareUrl);
        await waitForHeading(fresh, "Compare burn tests");
        await expect(fresh.getByTestId("compare-table")).toBeVisible({ timeout: SLOW });
        await expectNoJudgement(fresh, "restored comparison");
        await noScroll(fresh, "restored comparison");
        for (const url of [
          `/burn-tests/${sessionA}/report`,
          `/burn-tests/compare/report?sessions=${sessionA},${sessionB}`,
        ]) {
          await fresh.goto(url);
          await expect(fresh.getByTestId("report-session").first()).toBeVisible({ timeout: SLOW });
          await expectNoJudgement(fresh, `restored ${url}`);
        }
        await expect(fresh.locator("article img")).toHaveCount(1);
      } finally {
        await ctx.close();
      }
    });
  });
}
