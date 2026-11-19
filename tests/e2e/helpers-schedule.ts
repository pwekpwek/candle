import { readFileSync } from "node:fs";
import {
  expect,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  SLOW,
  WE5,
  expectClearOfFixedBars,
  expectInputsAtLeast16,
  expectNoSideScroll,
  expectWE5Panel,
  fillWE5,
  openNewFormula,
  saveFromEditor,
  waitForHeading,
} from "./helpers-flow";

export { SLOW, WE5, waitForHeading };

/** Local calendar date `offset` days from today, as YYYY-MM-DD (the app's "today" is local too). */
export function iso(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "Nov 18, 2026": how the screens write a stored date. */
export function fmt(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A stored date plus whole days (calendar arithmetic, like the app's). */
export function plus(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Next keeps hidden routes mounted: only look at visible fields. */
export const visible = (l: Locator) => l.locator("visible=true");
export const productionDate = (p: Page) => visible(p.getByLabel("Production date"));
export const batchLabel = (p: Page) => visible(p.getByLabel("Label (optional)"));
export const plannedDate = (p: Page) => visible(p.getByLabel("Planned date"));

export const mainNav = (p: Page) =>
  p.getByRole("navigation", { name: "Main" }).filter({ visible: true });

/** Builds and saves WE-5 as version 1; ends on the formula page. */
export async function buildWE5(page: Page) {
  await openNewFormula(page);
  await fillWE5(page);
  await expectWE5Panel(page);
  await saveFromEditor(page);
  await waitForHeading(page, WE5.name);
}

export async function openCreateForm(page: Page) {
  await visible(page.getByRole("link", { name: "Create batch" })).first().click();
  await expect(page).toHaveURL(/\/batches\/new\?version=/, { timeout: SLOW });
  await waitForHeading(page, "Create batch");
  await expect(productionDate(page)).toBeVisible({ timeout: SLOW });
}

/** Submits the create form, waits for the saved batch page and returns its id. */
export async function submitCreate(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Create batch" }).click();
  await expect(page).toHaveURL(/\/batches\/(?!new)[0-9a-f-]{36}/, { timeout: SLOW });
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByText("Batch saved")).toBeVisible({ timeout: SLOW });
  return id;
}

/** From the formula page: Create batch, fill date and label, save. Returns the batch id. */
export async function createBatch(
  page: Page,
  formulaUrl: string,
  spec: { date: string; label?: string },
): Promise<string> {
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await openCreateForm(page);
  await productionDate(page).fill(spec.date);
  if (spec.label !== undefined) await batchLabel(page).fill(spec.label);
  return submitCreate(page);
}

export type CureRow = { kind: "burnTest" | "check"; label?: string; offset: string };

export const cureRows = (p: Page) => p.getByTestId("cure-row").filter({ visible: true });
export const cureTimeField = (p: Page) => visible(p.getByLabel("Cure time (days)"));

/** Fills the cure time and appends a row per entry (after any rows already there). */
export async function fillCureForm(page: Page, plan: { cure?: string; rows?: CureRow[] }) {
  if (plan.cure !== undefined) await cureTimeField(page).fill(plan.cure);
  for (const row of plan.rows ?? []) {
    const before = await cureRows(page).count();
    await page
      .getByRole("button", {
        name: row.kind === "burnTest" ? "Add burn test" : "Add other milestone",
      })
      .click();
    await expect(cureRows(page)).toHaveCount(before + 1);
    const r = cureRows(page).nth(before);
    if (row.label !== undefined) await r.getByLabel(/^Label/).fill(row.label);
    await r.getByLabel("Days after production").fill(row.offset);
  }
}

/** Opens the editor for a batch and saves a plan. Ends on the batch page with the saved notice. */
export async function addCurePlan(
  page: Page,
  batchId: string,
  plan: { cure?: string; rows?: CureRow[] },
) {
  await page.goto(`/batches/${batchId}/cure-plan`);
  await waitForHeading(page, "Add cure plan");
  await fillCureForm(page, plan);
  await page.getByRole("button", { name: "Save cure plan" }).click();
  await expect(page).toHaveURL(new RegExp(`/batches/${batchId}`), { timeout: SLOW });
  await expect(page.getByText("Cure plan saved")).toBeVisible({ timeout: SLOW });
}

export const milestoneRows = (p: Page) => p.getByTestId("milestone-row").filter({ visible: true });
export const milestoneRow = (p: Page, name: string) =>
  milestoneRows(p).filter({ has: p.getByText(name, { exact: true }) });

export const scheduleGroup = (p: Page, name: string) =>
  p.getByRole("region", { name, exact: true }).filter({ visible: true });
export const scheduleRows = (group: Locator) => group.getByTestId("schedule-row");

export async function openSchedule(page: Page) {
  await page.goto("/schedule");
  await waitForHeading(page, "Schedule");
  await expect(page.getByText("Loading schedule…")).toHaveCount(0, { timeout: SLOW });
}

export async function openBatch(page: Page, id: string, heading: string) {
  await page.goto(`/batches/${id}`);
  await waitForHeading(page, heading);
  await expect(productionDate(page)).toBeVisible({ timeout: SLOW });
}

export async function formulaMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** Plans production from the formula page. Ends on the entry page; returns the entry id. */
export async function planProduction(
  page: Page,
  formulaUrl: string,
  spec: { date: string; label?: string },
): Promise<string> {
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await visible(page.getByRole("link", { name: "Plan production" })).first().click();
  await expect(page).toHaveURL(/\/schedule\/plan\/new\?version=/, { timeout: SLOW });
  await waitForHeading(page, "Plan production");
  await plannedDate(page).fill(spec.date);
  if (spec.label !== undefined) await batchLabel(page).fill(spec.label);
  await page.getByRole("button", { name: "Save planned production" }).click();
  await expect(page).toHaveURL(/\/schedule\/plan\/(?!new)[0-9a-f-]{36}/, { timeout: SLOW });
  await expect(page.getByText("Planned production saved")).toBeVisible({ timeout: SLOW });
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Exports a backup from /backup. Returns the saved file path and its parsed content. */
export async function exportBackup(page: Page, testInfo: TestInfo) {
  await page.goto("/backup");
  await waitForHeading(page, "Backup and restore");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  return { file, backup: JSON.parse(readFileSync(file, "utf8")) };
}

export async function cleanContext(browser: Browser, testInfo: TestInfo) {
  const ctx = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 1280, height: 800 },
  });
  return { ctx, page: await ctx.newPage() };
}

export async function restoreFile(page: Page, file: string, addMode: boolean) {
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

/** The phone layout checks every screen gets (TEST-28). */
export async function checkScreen(page: Page, where: string) {
  await expectNoSideScroll(page, where);
  await expectClearOfFixedBars(page, where);
  await expectInputsAtLeast16(page, where);
  await page.evaluate(() => window.scrollTo(0, 0));
}
