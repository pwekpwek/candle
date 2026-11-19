import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  SLOW,
  WE5,
  addCurePlan,
  batchLabel,
  buildWE5,
  cleanContext,
  createBatch,
  cureRows,
  cureTimeField,
  fillCureForm,
  exportBackup,
  fmt,
  formulaMenu,
  iso,
  mainNav,
  milestoneRow,
  milestoneRows,
  openBatch,
  openSchedule,
  plannedDate,
  planProduction,
  plus,
  productionDate,
  restoreFile,
  scheduleGroup,
  scheduleRows,
  submitCreate,
  visible,
  waitForHeading,
} from "./helpers-schedule";

test.use({ viewport: { width: 1280, height: 800 } });

const GOOD_V2 = path.join(process.cwd(), "tests", "fixtures", "backups", "good-v2.json");

/** Saves the production date on the batch page and waits for the confirmation. */
async function saveProductionDate(page: Page, date: string) {
  await productionDate(page).fill(date);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible({ timeout: SLOW });
}

async function expectMilestone(
  page: Page,
  name: string,
  expected: { due?: string; state: string },
) {
  const row = milestoneRow(page, name);
  await expect(row).toHaveCount(1, { timeout: SLOW });
  if (expected.due !== undefined) {
    await expect(row).toContainText(`Due ${fmt(expected.due)}`);
  } else {
    // A done milestone never shows a due date.
    await expect(row).not.toContainText("Due ");
  }
  await expect(row).toContainText(expected.state);
}

test("cure plan: errors, save, date moves, done keeps its date, persists", async ({ page }) => {
  test.setTimeout(240_000);
  const today = iso(0);

  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  const produced = iso(-20);
  const id = await createBatch(page, formulaUrl, { date: produced, label: "CP-01" });
  await waitForHeading(page, "CP-01");

  // The Curing section starts empty, with the way in.
  const curing = visible(page.getByRole("region", { name: "Curing" }));
  await expect(curing).toBeVisible({ timeout: SLOW });
  await expect(curing.getByRole("link", { name: "Add cure plan" })).toBeVisible();
  await curing.getByRole("link", { name: "Add cure plan" }).click();
  await expect(page).toHaveURL(new RegExp(`/batches/${id}/cure-plan$`), { timeout: SLOW });
  await waitForHeading(page, "Add cure plan");
  const editorUrl = page.url();
  const save = page.getByRole("button", { name: "Save cure plan" });

  // Nothing entered.
  await save.click();
  await expect(page.getByText("Add a cure time, a burn test or another milestone.")).toBeVisible();
  expect(page.url()).toBe(editorUrl);

  // Cure time errors: 366, 1.5, -1.
  const cure = cureTimeField(page);
  await cure.fill("366");
  await save.click();
  await expect(page.getByText("Use 0 to 365 days.")).toBeVisible();
  await expect(cure).toHaveAttribute("aria-invalid", "true");
  await expect(cure).toBeFocused();
  await cure.fill("1.5");
  await save.click();
  await expect(page.getByText("Enter a whole number of days.")).toBeVisible();
  await expect(cure).toHaveAttribute("aria-invalid", "true");
  await cure.fill("-1");
  await save.click();
  await expect(page.getByText("Use 0 to 365 days.")).toBeVisible();
  await expect(cure).toHaveAttribute("aria-invalid", "true");
  expect(page.url()).toBe(editorUrl);

  // A valid cure time clears its own error on typing.
  await cure.fill("14");
  await expect(cure).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Planned cure end: " + fmt(plus(produced, 14)))).toBeVisible();

  // "Other" without a label, with no days; then a day count out of range.
  await page.getByRole("button", { name: "Add other milestone" }).click();
  await expect(cureRows(page)).toHaveCount(1);
  const row = cureRows(page).first();
  await save.click();
  await expect(page.getByText("Enter a label for this milestone.")).toBeVisible();
  await expect(page.getByText("Enter the number of days.")).toBeVisible();
  await expect(row.getByLabel("Label")).toHaveAttribute("aria-invalid", "true");
  await row.getByLabel("Days after production").fill("366");
  await row.getByLabel("Days after production").blur();
  await expect(page.getByText("Use 0 to 365 days.")).toBeVisible();
  expect(page.url()).toBe(editorUrl);

  // Nothing was saved: Cancel goes back to a batch with no plan.
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(new RegExp(`/batches/${id}$`), { timeout: SLOW });
  await expect(
    visible(page.getByRole("region", { name: "Curing" })).getByRole("link", {
      name: "Add cure plan",
    }),
  ).toBeVisible({ timeout: SLOW });
  await expect(milestoneRows(page)).toHaveCount(0);

  // Now a valid plan: cure 14, a burn test on day 3, an Other with a label on day 25.
  await visible(page.getByRole("link", { name: "Add cure plan" })).click();
  await waitForHeading(page, "Add cure plan");
  await fillCureForm(page, {
    cure: "14",
    rows: [
      { kind: "burnTest", offset: "3" },
      { kind: "check", label: "Wick check", offset: "25" },
    ],
  });
  await expect(cureRows(page).nth(0)).toContainText(`Due ${fmt(plus(produced, 3))}`);
  await save.click();
  await expect(page).toHaveURL(new RegExp(`/batches/${id}$`), { timeout: SLOW });
  await expect(page.getByText("Cure plan saved")).toBeVisible({ timeout: SLOW });

  // Curing: cure time, planned end, and three rows by day offset.
  const section = visible(page.getByRole("region", { name: "Curing" }));
  await expect(section).toContainText("Cure time: 14 days");
  await expect(section).toContainText(`Planned cure end: ${fmt(plus(produced, 14))}`);
  await expect(milestoneRows(page)).toHaveCount(3);
  await expect(milestoneRows(page).nth(0)).toContainText("Planned burn test");
  await expect(milestoneRows(page).nth(1)).toContainText("Planned cure end");
  await expect(milestoneRows(page).nth(2)).toContainText("Wick check");
  await expectMilestone(page, "Planned burn test", { due: plus(produced, 3), state: "Overdue" });
  await expectMilestone(page, "Planned cure end", { due: plus(produced, 14), state: "Overdue" });
  await expectMilestone(page, "Wick check", { due: plus(produced, 25), state: "Upcoming" });

  // Move the production date 5 days later: every open milestone moves by 5.
  const moved = iso(-15);
  await saveProductionDate(page, moved);
  await expectMilestone(page, "Planned burn test", { due: plus(moved, 3), state: "Overdue" });
  await expectMilestone(page, "Planned cure end", { due: plus(moved, 14), state: "Overdue" });
  await expectMilestone(page, "Wick check", { due: plus(moved, 25), state: "Upcoming" });
  await expect(section).toContainText(`Planned cure end: ${fmt(plus(moved, 14))}`);

  // Mark one done: it shows "Done on <today>" and no due date.
  await page.getByRole("button", { name: "Mark done: Wick check" }).click();
  await expectMilestone(page, "Wick check", { state: `Done on ${fmt(today)}` });
  await expect(page.getByRole("button", { name: "Mark not done: Wick check" })).toBeVisible();

  // Move the date again: open ones move, the done one keeps its done date.
  const moved2 = iso(-10);
  await saveProductionDate(page, moved2);
  await expectMilestone(page, "Planned burn test", { due: plus(moved2, 3), state: "Overdue" });
  await expectMilestone(page, "Planned cure end", { due: plus(moved2, 14), state: "Upcoming" });
  await expectMilestone(page, "Wick check", { state: `Done on ${fmt(today)}` });

  // Reload: all of it persists.
  await page.reload();
  await waitForHeading(page, "CP-01");
  await expect(productionDate(page)).toHaveValue(moved2, { timeout: SLOW });
  await expect(milestoneRows(page)).toHaveCount(3, { timeout: SLOW });
  await expectMilestone(page, "Planned burn test", { due: plus(moved2, 3), state: "Overdue" });
  await expectMilestone(page, "Planned cure end", { due: plus(moved2, 14), state: "Upcoming" });
  await expectMilestone(page, "Wick check", { state: `Done on ${fmt(today)}` });

  // Undo: the milestone is open again, due by the current production date.
  await page.getByRole("button", { name: "Mark not done: Wick check" }).click();
  await expectMilestone(page, "Wick check", { due: plus(moved2, 25), state: "Upcoming" });
  await page.reload();
  await waitForHeading(page, "CP-01");
  await expectMilestone(page, "Wick check", { due: plus(moved2, 25), state: "Upcoming" });

  // The editor opens on the saved plan.
  await visible(page.getByRole("link", { name: "Edit cure plan" })).click();
  await waitForHeading(page, "Edit cure plan");
  await expect(cureTimeField(page)).toHaveValue("14", { timeout: SLOW });
  await expect(cureRows(page)).toHaveCount(2);
  await expect(cureRows(page).nth(1).getByLabel("Label")).toHaveValue("Wick check");
  await expect(cureRows(page).nth(1).getByLabel("Days after production")).toHaveValue("25");
});

test("schedule page groups items and the nav badge counts them", async ({ page }) => {
  test.setTimeout(240_000);
  const today = iso(0);
  const nav = mainNav(page);

  // A fresh browser: nothing scheduled, no count.
  await openSchedule(page);
  await expect(page.getByText("Nothing scheduled yet")).toBeVisible({ timeout: SLOW });
  await expect(nav.getByRole("link", { name: "Schedule", exact: true })).toBeVisible();
  await expect(page.getByTestId("nav-attention-badge")).toHaveCount(0);

  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];

  // Batch A: its cure end passed 6 days ago. Batch B: a burn test falls due today.
  const idA = await createBatch(page, formulaUrl, { date: iso(-20), label: "OLD-1" });
  await addCurePlan(page, idA, { cure: "14" });
  const idB = await createBatch(page, formulaUrl, { date: iso(-3), label: "NEW-1" });
  await addCurePlan(page, idB, { rows: [{ kind: "burnTest", offset: "3" }, { kind: "check", label: "Trim wicks", offset: "40" }] });
  expect(idA).not.toBe(idB);

  await openSchedule(page);
  const overdue = scheduleGroup(page, "Overdue");
  const due = scheduleGroup(page, "Due today");
  const upcoming = scheduleGroup(page, "Upcoming");
  await expect(scheduleRows(overdue)).toHaveCount(1, { timeout: SLOW });
  await expect(overdue).toContainText("Planned cure end");
  await expect(overdue).toContainText(`Due ${fmt(plus(iso(-20), 14))}`);
  await expect(overdue).toContainText("OLD-1");
  await expect(overdue).toContainText(`${WE5.name}, version 1`);
  await expect(scheduleRows(due)).toHaveCount(1);
  await expect(due).toContainText("Planned burn test");
  await expect(due).toContainText(`Due ${fmt(today)}`);
  await expect(due).toContainText("NEW-1");
  await expect(scheduleRows(due)).toHaveAttribute("data-state", "due");
  await expect(scheduleRows(upcoming)).toHaveCount(1);
  await expect(upcoming).toContainText("Trim wicks");
  await expect(scheduleGroup(page, "Done")).toHaveCount(0);

  // The rows link to their batch.
  await expect(overdue.getByRole("link", { name: "OLD-1" })).toHaveAttribute("href", `/batches/${idA}`);
  await expect(due.getByRole("link", { name: "NEW-1" })).toHaveAttribute("href", `/batches/${idB}`);

  // The nav name carries the count: overdue + due today, not upcoming.
  const badgeLink = nav.getByRole("link", { name: "Schedule, 2 due or overdue", exact: true });
  await expect(badgeLink).toBeVisible({ timeout: SLOW });
  await expect(page.getByTestId("nav-attention-badge").filter({ visible: true })).toHaveText("2");

  // Mark both done from the Schedule page: they move to Done and the badge goes.
  await page.getByRole("button", { name: "Mark done: Planned cure end" }).click();
  await expect(nav.getByRole("link", { name: "Schedule, 1 due or overdue", exact: true })).toBeVisible({
    timeout: SLOW,
  });
  await page.getByRole("button", { name: "Mark done: Planned burn test" }).click();
  const done = scheduleGroup(page, "Done");
  await expect(scheduleRows(done)).toHaveCount(2, { timeout: SLOW });
  await expect(done).toContainText("Planned cure end");
  await expect(done).toContainText("Planned burn test");
  await expect(done).toContainText(`Done on ${fmt(today)}`);
  await expect(overdue).toHaveCount(0);
  await expect(due).toHaveCount(0);
  await expect(scheduleRows(upcoming)).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Schedule", exact: true })).toBeVisible({ timeout: SLOW });
  await expect(page.getByTestId("nav-attention-badge")).toHaveCount(0);

  // Undo from the Done group brings one back and the count returns.
  await page.getByRole("button", { name: "Mark not done: Planned burn test" }).click();
  await expect(scheduleRows(scheduleGroup(page, "Due today"))).toHaveCount(1, { timeout: SLOW });
  await expect(nav.getByRole("link", { name: "Schedule, 1 due or overdue", exact: true })).toBeVisible({
    timeout: SLOW,
  });

  // The batch page agrees, and the schedule survives a reload.
  await page.reload();
  await waitForHeading(page, "Schedule");
  await expect(scheduleRows(scheduleGroup(page, "Done"))).toHaveCount(1, { timeout: SLOW });
  await openBatch(page, idA, "OLD-1");
  await expect(milestoneRow(page, "Planned cure end")).toContainText(`Done on ${fmt(today)}`, {
    timeout: SLOW,
  });
});

test("planned production: from the formula to a batch, edit, delete, formula delete", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const today = iso(0);
  const nav = mainNav(page);

  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];

  // A plain batch, to compare the delete dialog against.
  const plainId = await createBatch(page, formulaUrl, { date: iso(-1), label: "PLAIN-1" });

  // Plan production: errors first.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await visible(page.getByRole("link", { name: "Plan production" })).first().click();
  await expect(page).toHaveURL(/\/schedule\/plan\/new\?version=/, { timeout: SLOW });
  await waitForHeading(page, "Plan production");
  await expect(page.getByRole("region", { name: "Planned for" })).toContainText(WE5.name);
  const createUrl = page.url();
  await page.getByRole("button", { name: "Save planned production" }).click();
  await expect(page.getByText("Enter the planned date.")).toBeVisible();
  await expect(plannedDate(page)).toHaveAttribute("aria-invalid", "true");
  await plannedDate(page).fill(iso(10));
  await batchLabel(page).fill("L".repeat(41));
  await page.getByRole("button", { name: "Save planned production" }).click();
  await expect(page.getByText("Use 40 characters or fewer.")).toBeVisible();
  expect(page.url()).toBe(createUrl);
  await openSchedule(page);
  await expect(page.getByText("Nothing scheduled yet")).toBeVisible({ timeout: SLOW });

  // Save for real: a date in the future and a label.
  const planned = iso(10);
  const planId = await planProduction(page, formulaUrl, { date: planned, label: "Spring run" });
  await waitForHeading(page, "Spring run");
  await expect(visible(page.getByText(`Planned ${fmt(planned)}`)).first()).toBeVisible();
  await expect(page.getByText("No batch made from this entry yet.")).toBeVisible();

  // The formula page lists the open entry.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  const onFormula = visible(page.getByRole("region", { name: "Planned production" }));
  await expect(onFormula).toContainText(`Planned ${fmt(planned)}`, { timeout: SLOW });
  await expect(onFormula).toContainText("Spring run");

  // Schedule page: Upcoming, no badge (it is not due).
  await openSchedule(page);
  const upcoming = scheduleGroup(page, "Upcoming");
  await expect(scheduleRows(upcoming)).toHaveCount(1, { timeout: SLOW });
  await expect(upcoming).toContainText("Planned production");
  await expect(upcoming).toContainText("Spring run");
  await expect(upcoming).toContainText(`Planned ${fmt(planned)}`);
  await expect(upcoming).toContainText(`${WE5.name}, version 1`);
  await expect(page.getByTestId("nav-attention-badge")).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Schedule", exact: true })).toBeVisible();

  // Open the entry from the Schedule page and move its date.
  await upcoming.getByRole("link", { name: "Planned production" }).click();
  await expect(page).toHaveURL(new RegExp(`/schedule/plan/${planId}$`), { timeout: SLOW });
  await waitForHeading(page, "Spring run");
  const moved = iso(12);
  await plannedDate(page).fill(moved);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible({ timeout: SLOW });
  await page.getByRole("navigation", { name: "Main" }).filter({ visible: true })
    .getByRole("link", { name: "Schedule", exact: true }).click();
  await waitForHeading(page, "Schedule");
  await expect(scheduleGroup(page, "Upcoming")).toContainText(`Planned ${fmt(moved)}`, {
    timeout: SLOW,
  });
  await expect(scheduleGroup(page, "Upcoming")).not.toContainText(`Planned ${fmt(planned)}`);

  // Create batch from the entry: the form says so and defaults to today.
  await page.goto(`/schedule/plan/${planId}`);
  await waitForHeading(page, "Spring run");
  await visible(page.getByRole("link", { name: "Create batch" })).click();
  await expect(page).toHaveURL(new RegExp(`/batches/new\\?version=[0-9a-f-]{36}&plan=${planId}$`), {
    timeout: SLOW,
  });
  await waitForHeading(page, "Create batch");
  await expect(page.getByText("From planned production.")).toBeVisible({ timeout: SLOW });
  await expect(
    page.getByText(`This batch is made from the entry Spring run, planned for ${fmt(moved)}. Saving links them.`),
  ).toBeVisible();
  await expect(productionDate(page)).toHaveValue(today, { timeout: SLOW });
  await expect(batchLabel(page)).toHaveValue("Spring run");
  const batchId = await submitCreate(page);
  await waitForHeading(page, "Spring run");

  // The entry now links to the batch and has no Create batch.
  await page.goto(`/schedule/plan/${planId}`);
  await waitForHeading(page, "Spring run");
  await expect(page.getByText("Batch made from this entry:")).toBeVisible({ timeout: SLOW });
  const batchLink = visible(page.getByRole("link", { name: "Spring run", exact: true }));
  await expect(batchLink).toHaveAttribute("href", `/batches/${batchId}`);
  await expect(visible(page.getByRole("link", { name: "Create batch" }))).toHaveCount(0);
  await expect(page.getByText("No batch made from this entry yet.")).toHaveCount(0);
  // Going back to the create link for a done entry is refused with an explanation.
  await page.goBack();
  await page.goto(`/schedule/plan/${planId}`);
  await expect(page.getByText(`produced ${fmt(today)}`)).toBeVisible({ timeout: SLOW });

  // Schedule: in Done, no longer Upcoming.
  await openSchedule(page);
  const done = scheduleGroup(page, "Done");
  await expect(scheduleRows(done)).toHaveCount(1, { timeout: SLOW });
  await expect(done).toContainText("Planned production");
  await expect(done).toContainText("Spring run");
  await expect(done).toContainText("Done on");
  await expect(scheduleGroup(page, "Upcoming")).toHaveCount(0);
  // The formula page no longer lists it as open.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await expect(visible(page.getByRole("region", { name: "Planned production" }))).toHaveCount(0);

  // The batch has no cure plan yet, so only the entry note shows in its delete dialog.
  await openBatch(page, plainId, "PLAIN-1");
  await page.getByRole("button", { name: "Delete batch" }).click();
  const plainDialog = page.getByRole("dialog", { name: "Delete this batch?" });
  await expect(plainDialog).toBeVisible();
  await expect(plainDialog.getByText("Checking what goes with this batch…")).toHaveCount(0, { timeout: SLOW });
  await expect(plainDialog).not.toContainText("cure plan");
  await expect(plainDialog).not.toContainText("planned production entry");
  await plainDialog.getByRole("button", { name: "Keep batch" }).click();
  await expect(plainDialog).toBeHidden();

  await openBatch(page, batchId, "Spring run");
  await page.getByRole("button", { name: "Delete batch" }).click();
  const noCure = page.getByRole("dialog", { name: "Delete this batch?" });
  await expect(noCure.getByText("The planned production entry it came from becomes open again.")).toBeVisible({
    timeout: SLOW,
  });
  await expect(noCure).not.toContainText("cure plan");
  await noCure.getByRole("button", { name: "Keep batch" }).click();

  // Give it a cure plan: now the dialog names both.
  await addCurePlan(page, batchId, { cure: "5" });
  await page.getByRole("button", { name: "Delete batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this batch?" });
  await expect(dialog.getByText("Its cure plan, with 1 milestone, is deleted too.")).toBeVisible({
    timeout: SLOW,
  });
  await expect(dialog.getByText("The planned production entry it came from becomes open again.")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete batch" }).click();
  await expect(page).toHaveURL(/\/batches$/, { timeout: SLOW });

  // The entry is open again and the cure plan is gone from the Schedule.
  await page.goto(`/schedule/plan/${planId}`);
  await waitForHeading(page, "Spring run");
  await expect(page.getByText("No batch made from this entry yet.")).toBeVisible({ timeout: SLOW });
  await expect(visible(page.getByRole("link", { name: "Create batch" }))).toBeVisible();
  await openSchedule(page);
  await expect(scheduleGroup(page, "Upcoming")).toContainText(`Planned ${fmt(moved)}`, { timeout: SLOW });
  await expect(scheduleGroup(page, "Done")).toHaveCount(0);
  await expect(page.getByText("Planned cure end")).toHaveCount(0);

  // The formula still has PLAIN-1, so it cannot be deleted. Remove that batch first.
  await openBatch(page, plainId, "PLAIN-1");
  await page.getByRole("button", { name: "Delete batch" }).click();
  await page.getByRole("dialog", { name: "Delete this batch?" }).getByRole("button", { name: "Delete batch" }).click();
  await expect(page).toHaveURL(/\/batches$/, { timeout: SLOW });

  // Formula delete: the dialog counts the open entry; deleting removes it from the Schedule.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await formulaMenu(page, "Delete permanently");
  const confirm = page.getByRole("dialog", { name: "Delete this formula permanently?" });
  await expect(confirm.getByText("Its 1 planned production entry will be deleted too.")).toBeVisible({
    timeout: SLOW,
  });
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).not.toHaveURL(new RegExp(formulaUrl.split("/").pop()! + "$"), { timeout: SLOW });
  await openSchedule(page);
  await expect(page.getByText("Nothing scheduled yet")).toBeVisible({ timeout: SLOW });
  await page.goto(`/schedule/plan/${planId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Planned production not found" })).toBeVisible({
    timeout: SLOW,
  });
});

test("backup round trip (format 4 since BurnMatrix) keeps cure plans and the entry-to-batch link", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const today = iso(0);

  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];

  // Batch A with a cure plan; one milestone done.
  const produced = iso(-20);
  const idA = await createBatch(page, formulaUrl, { date: produced, label: "CP-01" });
  await addCurePlan(page, idA, {
    cure: "14",
    rows: [{ kind: "burnTest", offset: "3" }, { kind: "check", label: "Wick check", offset: "25" }],
  });
  await page.getByRole("button", { name: "Mark done: Planned burn test" }).click();
  await expect(milestoneRow(page, "Planned burn test")).toContainText(`Done on ${fmt(today)}`, {
    timeout: SLOW,
  });

  // An entry that made batch B.
  const planId = await planProduction(page, formulaUrl, { date: iso(7), label: "Run 2" });
  await visible(page.getByRole("link", { name: "Create batch" })).click();
  await waitForHeading(page, "Create batch");
  await expect(batchLabel(page)).toHaveValue("Run 2", { timeout: SLOW });
  const idB = await submitCreate(page);
  await waitForHeading(page, "Run 2");

  const { file, backup } = await exportBackup(page, testInfo);
  expect(backup.formatVersion).toBe(4);
  expect(backup.schemaVersion).toBe(4);
  expect(backup.counts).toMatchObject({ batches: 2, curePlans: 1, productionPlans: 1 });
  expect(backup.data.curePlans).toHaveLength(1);
  expect(backup.data.curePlans[0].id).toBe(idA);
  expect(backup.data.curePlans[0].milestones).toHaveLength(3);
  expect(backup.data.productionPlans[0]).toMatchObject({ id: planId, batchId: idB });

  const { ctx, page: fresh } = await cleanContext(browser, testInfo);
  try {
    await openSchedule(fresh);
    await expect(fresh.getByText("Nothing scheduled yet")).toBeVisible({ timeout: SLOW });

    await restoreFile(fresh, file, true);

    // Batch A: cure plan, milestones and the done date survive.
    await openBatch(fresh, idA, "CP-01");
    const section = visible(fresh.getByRole("region", { name: "Curing" }));
    await expect(section).toContainText("Cure time: 14 days", { timeout: SLOW });
    await expect(section).toContainText(`Planned cure end: ${fmt(plus(produced, 14))}`);
    await expect(milestoneRows(fresh)).toHaveCount(3);
    await expectMilestone(fresh, "Planned burn test", { state: `Done on ${fmt(today)}` });
    await expectMilestone(fresh, "Planned cure end", { due: plus(produced, 14), state: "Overdue" });
    await expectMilestone(fresh, "Wick check", { due: plus(produced, 25), state: "Upcoming" });

    // Batch B has no cure plan; the entry links to it and is done.
    await openBatch(fresh, idB, "Run 2");
    await expect(visible(fresh.getByRole("link", { name: "Add cure plan" }))).toBeVisible({ timeout: SLOW });
    await fresh.goto(`/schedule/plan/${planId}`);
    await waitForHeading(fresh, "Run 2");
    await expect(fresh.getByText("Batch made from this entry:")).toBeVisible({ timeout: SLOW });
    await expect(visible(fresh.getByRole("link", { name: "Run 2", exact: true }))).toHaveAttribute(
      "href",
      `/batches/${idB}`,
    );
    await expect(visible(fresh.getByRole("link", { name: "Create batch" }))).toHaveCount(0);

    // Schedule: cure end overdue, the rest done; the badge counts the overdue one.
    await openSchedule(fresh);
    await expect(scheduleRows(scheduleGroup(fresh, "Overdue"))).toHaveCount(1, { timeout: SLOW });
    await expect(scheduleGroup(fresh, "Overdue")).toContainText("Planned cure end");
    await expect(scheduleGroup(fresh, "Upcoming")).toContainText("Wick check");
    await expect(scheduleGroup(fresh, "Done")).toContainText("Planned burn test");
    await expect(scheduleGroup(fresh, "Done")).toContainText("Run 2");
    await expect(
      mainNav(fresh).getByRole("link", { name: "Schedule, 1 due or overdue", exact: true }),
    ).toBeVisible({ timeout: SLOW });

    // Deleting batch B reopens the restored entry.
    await openBatch(fresh, idB, "Run 2");
    await fresh.getByRole("button", { name: "Delete batch" }).click();
    const dialog = fresh.getByRole("dialog", { name: "Delete this batch?" });
    await expect(
      dialog.getByText("The planned production entry it came from becomes open again."),
    ).toBeVisible({ timeout: SLOW });
    await dialog.getByRole("button", { name: "Delete batch" }).click();
    await expect(fresh).toHaveURL(/\/batches$/, { timeout: SLOW });
    await openSchedule(fresh);
    await expect(scheduleGroup(fresh, "Upcoming")).toContainText("Planned production", { timeout: SLOW });
  } finally {
    await ctx.close();
  }
});

test("a format 2 backup from the previous version restores and takes a cure plan", async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const { ctx, page } = await cleanContext(browser, testInfo);
  try {
    await restoreFile(page, GOOD_V2, true);

    await page.goto("/batches");
    await waitForHeading(page, "Batches");
    await expect(page.getByTestId("batch-row")).toHaveCount(2, { timeout: SLOW });
    await page.getByTestId("batch-row").getByRole("link", { name: "BT-01" }).click();
    await waitForHeading(page, "BT-01");
    await expect(productionDate(page)).toHaveValue("2026-11-10", { timeout: SLOW });

    // No plans came with a format 2 file.
    const section = visible(page.getByRole("region", { name: "Curing" }));
    await expect(section.getByRole("link", { name: "Add cure plan" })).toBeVisible({ timeout: SLOW });
    await openSchedule(page);
    await expect(page.getByText("Nothing scheduled yet")).toBeVisible({ timeout: SLOW });

    // Add one to BT-01.
    await page.goto("/batches");
    await page.getByTestId("batch-row").getByRole("link", { name: "BT-01" }).click();
    await waitForHeading(page, "BT-01");
    await visible(page.getByRole("link", { name: "Add cure plan" })).click();
    await waitForHeading(page, "Add cure plan");
    await cureTimeField(page).fill("10");
    await page.getByRole("button", { name: "Save cure plan" }).click();
    await expect(page.getByText("Cure plan saved")).toBeVisible({ timeout: SLOW });
    const after = visible(page.getByRole("region", { name: "Curing" }));
    await expect(after).toContainText("Cure time: 10 days");
    await expect(after).toContainText("Planned cure end: Nov 20, 2026");
    await page.reload();
    await waitForHeading(page, "BT-01");
    await expect(visible(page.getByRole("region", { name: "Curing" }))).toContainText("Cure time: 10 days", {
      timeout: SLOW,
    });

    // It shows on the Schedule page.
    await openSchedule(page);
    await expect(page.getByTestId("schedule-row")).toHaveCount(1, { timeout: SLOW });
    await expect(page.getByTestId("schedule-row")).toContainText("BT-01");

    // And a new entry can be planned from the restored formula.
    await page.goto("/");
    await waitForHeading(page, "Saved formulas");
    await page.getByTestId("formula-row").first().getByRole("link").first().click();
    await visible(page.getByRole("link", { name: "Plan production" })).first().click();
    await waitForHeading(page, "Plan production");
    await plannedDate(page).fill(iso(3));
    await page.getByRole("button", { name: "Save planned production" }).click();
    await expect(page.getByText("Planned production saved")).toBeVisible({ timeout: SLOW });
  } finally {
    await ctx.close();
  }
});
