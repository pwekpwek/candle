import { test, expect, type Locator } from "@playwright/test";
import { expectInputsAtLeast16, expectNoSideScroll, expectTapHeight } from "./helpers-flow";
import {
  SLOW,
  WE5,
  batchLabel,
  addCurePlan,
  buildWE5,
  checkScreen,
  createBatch,
  cureRows,
  cureTimeField,
  iso,
  mainNav,
  openSchedule,
  plannedDate,
  planProduction,
  scheduleGroup,
  scheduleRows,
  submitCreate,
  visible,
  waitForHeading,
} from "./helpers-schedule";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

const LONG_LABEL = "W".repeat(60);
/** A long label made of words, as a maker would type it. */
const PLAN_LABEL = "Autumn lavender run, second pour";

/** The element sits fully inside the 375px viewport. */
async function expectInsideViewport(target: Locator, what: string) {
  const box = await target.boundingBox();
  expect(box, `${what}: has a box`).not.toBeNull();
  expect(box!.x, `${what}: left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${what}: right edge`).toBeLessThanOrEqual(375);
}

/** Notice text is on screen right now (not merely in the page). */
async function expectInView(target: Locator, what: string) {
  await expect(target, `${what}: visible`).toBeVisible({ timeout: SLOW });
  await expect(target, `${what}: in the viewport`).toBeInViewport();
}

test("the planned production screens at 375px", async ({ page }) => {
  test.setTimeout(240_000);

  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];

  // Formula page header with Plan production next to Create batch.
  const plan = visible(page.getByRole("link", { name: "Plan production" })).first();
  await expect(plan).toBeVisible();
  await expectTapHeight(plan, "formula: Plan production");
  await expectTapHeight(visible(page.getByRole("link", { name: "Create batch" })).first(), "formula: Create batch");
  await checkScreen(page, "formula page");

  // Create page.
  await plan.tap();
  await expect(page).toHaveURL(/\/schedule\/plan\/new\?version=/, { timeout: SLOW });
  await waitForHeading(page, "Plan production");
  await expect(plannedDate(page)).toBeVisible({ timeout: SLOW });
  const createUrl = page.url();
  await checkScreen(page, "plan production (create)");
  await expectTapHeight(plannedDate(page), "create plan: date");
  await expectTapHeight(batchLabel(page), "create plan: label");
  await expectTapHeight(
    page.getByRole("button", { name: "Save planned production" }),
    "create plan: save",
  );

  // A field error at this width.
  await page.getByRole("button", { name: "Save planned production" }).tap();
  await expect(page.getByText("Enter the planned date.")).toBeVisible();
  expect(page.url()).toBe(createUrl);
  await expectNoSideScroll(page, "create plan (error)");
  await expectInputsAtLeast16(page, "create plan (error)");

  // Save: the confirmation is on screen, and the entry page fits.
  await plannedDate(page).fill(iso(5));
  await batchLabel(page).fill(PLAN_LABEL);
  await page.getByRole("button", { name: "Save planned production" }).tap();
  await expect(page).toHaveURL(/\/schedule\/plan\/(?!new)[0-9a-f-]{36}/, { timeout: SLOW });
  const planId = new URL(page.url()).pathname.split("/").pop()!;
  await expectInView(page.getByText("Planned production saved"), "entry: saved notice");
  await waitForHeading(page, PLAN_LABEL);
  await checkScreen(page, "planned production entry");
  const createBatchLink = visible(page.getByRole("link", { name: "Create batch" }));
  await expectTapHeight(createBatchLink, "entry: Create batch");
  await expectTapHeight(page.getByRole("button", { name: "Delete entry" }), "entry: Delete entry");
  await expectTapHeight(page.getByRole("button", { name: "Save changes" }), "entry: Save changes");
  await expectTapHeight(plannedDate(page), "entry: date");

  // Saving a change shows its feedback on screen.
  await plannedDate(page).fill(iso(6));
  await page.getByRole("button", { name: "Save changes" }).tap();
  await expectInView(page.getByText("Changes saved"), "entry: changes saved");
  await expectNoSideScroll(page, "entry (saved)");

  // A second entry for the Schedule page.
  await page.goto(createUrl);
  await waitForHeading(page, "Plan production");
  await plannedDate(page).fill(iso(30));
  await batchLabel(page).fill("Second run");
  await page.getByRole("button", { name: "Save planned production" }).tap();
  await expect(page).toHaveURL(/\/schedule\/plan\/(?!new)[0-9a-f-]{36}/, { timeout: SLOW });
  await expect(page.getByText("Planned production saved")).toBeVisible({ timeout: SLOW });

  // Create batch from the first entry.
  await page.goto(`/schedule/plan/${planId}`);
  await waitForHeading(page, PLAN_LABEL);
  await visible(page.getByRole("link", { name: "Create batch" })).tap();
  await waitForHeading(page, "Create batch");
  await expect(page.getByText("From planned production.")).toBeVisible({ timeout: SLOW });
  await expect(batchLabel(page)).toHaveValue(PLAN_LABEL, { timeout: SLOW });
  await checkScreen(page, "create batch from entry");
  await batchLabel(page).fill("PH-01");
  const batchUrlId = await submitCreate(page);
  await waitForHeading(page, "PH-01");

  // The entry is linked now: the notice with an action wraps inside the screen.
  await page.goto(`/batches/new?version=${new URL(createUrl).searchParams.get("version")}&plan=${planId}`);
  await waitForHeading(page, "Create batch");
  const already = page.getByText("This entry already has a batch.");
  await expect(already).toBeVisible({ timeout: SLOW });
  const open = visible(page.getByRole("link", { name: "Open the batch" }));
  await expectTapHeight(open, "already linked: Open the batch");
  await expectInsideViewport(open, "already linked: Open the batch");
  await expectInsideViewport(already, "already linked: text");
  await checkScreen(page, "create batch from a linked entry");
  await open.tap();
  await expect(page).toHaveURL(new RegExp(`/batches/${batchUrlId}$`), { timeout: SLOW });
  await waitForHeading(page, "PH-01");
  expect(formulaUrl).toContain("/formulas/");
});

test("cure plan, Schedule page and nav badge at 375px", async ({ page }) => {
  test.setTimeout(300_000);

  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  await planProduction(page, formulaUrl, { date: iso(30), label: "Second run" });

  // A batch made today.
  await page.goto(formulaUrl);
  await waitForHeading(page, WE5.name);
  await visible(page.getByRole("link", { name: "Create batch" })).first().tap();
  await waitForHeading(page, "Create batch");
  await batchLabel(page).fill("PH-02");
  const id = await submitCreate(page);
  await waitForHeading(page, "PH-02");

  // Batch page, no plan yet.
  const curing = visible(page.getByRole("region", { name: "Curing" }));
  await expect(curing).toBeVisible({ timeout: SLOW });
  const add = curing.getByRole("link", { name: "Add cure plan" });
  await expectTapHeight(add, "batch: Add cure plan");
  await checkScreen(page, "batch page (no cure plan)");
  await add.tap();
  await waitForHeading(page, "Add cure plan");
  await expect(cureTimeField(page)).toBeVisible({ timeout: SLOW });

  // The editor with several rows and field errors.
  await expectTapHeight(cureTimeField(page), "editor: cure time");
  await cureTimeField(page).fill("14");
  await page.getByRole("button", { name: "Add burn test" }).tap();
  await page.getByRole("button", { name: "Add other milestone" }).tap();
  await page.getByRole("button", { name: "Add other milestone" }).tap();
  await expect(cureRows(page)).toHaveCount(3);
  await cureRows(page).nth(0).getByLabel("Days after production").fill("0");
  await cureRows(page).nth(1).getByLabel("Label").fill(LONG_LABEL);
  await cureRows(page).nth(1).getByLabel("Days after production").fill("7");
  await cureRows(page).nth(2).getByLabel("Days after production").fill("400");
  await page.getByRole("button", { name: "Save cure plan" }).tap();
  await expect(page.getByText("Enter a label for this milestone.")).toBeVisible();
  await expect(page.getByText("Use 0 to 365 days.")).toBeVisible();
  await checkScreen(page, "cure-plan editor (with errors)");
  await expectTapHeight(page.getByRole("button", { name: "Add burn test" }), "editor: Add burn test");
  await expectTapHeight(page.getByRole("button", { name: "Add other milestone" }), "editor: Add other");
  await expectTapHeight(page.getByRole("button", { name: "Remove milestone 1" }), "editor: Remove");
  await expectTapHeight(page.getByRole("button", { name: "Save cure plan" }), "editor: Save");
  await expectTapHeight(page.getByRole("link", { name: "Cancel" }), "editor: Cancel");
  await expectTapHeight(cureRows(page).nth(1).getByLabel("Label"), "editor: row label");
  await expectTapHeight(cureRows(page).nth(1).getByLabel("Days after production"), "editor: row days");
  await expectTapHeight(cureRows(page).nth(1).getByLabel("Type"), "editor: row type select");

  // Fix the errors and save: the confirmation is on screen.
  await cureRows(page).nth(2).getByLabel("Label").fill("Cover check");
  await cureRows(page).nth(2).getByLabel("Days after production").fill("10");
  await page.getByRole("button", { name: "Save cure plan" }).tap();
  await expect(page).toHaveURL(new RegExp(`/batches/${id}$`), { timeout: SLOW });
  await expectInView(page.getByText("Cure plan saved"), "batch: cure plan saved");

  // Batch page with a plan.
  await expect(visible(page.getByRole("region", { name: "Curing" }))).toContainText("Cure time: 14 days");
  await checkScreen(page, "batch page (cure plan)");
  await expectTapHeight(visible(page.getByRole("link", { name: "Edit cure plan" })), "batch: Edit cure plan");
  await expectTapHeight(visible(page.getByRole("button", { name: "Remove cure plan" })), "batch: Remove cure plan");
  await expectTapHeight(
    visible(page.getByRole("button", { name: `Mark done: ${LONG_LABEL}` })),
    "batch: Mark done",
  );
  await visible(page.getByRole("button", { name: `Mark done: ${LONG_LABEL}` })).tap();
  await expect(visible(page.getByText(/^Done on /))).toBeVisible({ timeout: SLOW });
  await expectTapHeight(visible(page.getByRole("button", { name: `Mark not done: ${LONG_LABEL}` })), "batch: Mark not done");
  await expectNoSideScroll(page, "batch page (milestone done)");

  // The delete dialog with its extra lines fits.
  await visible(page.getByRole("button", { name: "Delete batch" })).tap();
  const dialog = page.getByRole("dialog", { name: "Delete this batch?" });
  await expect(dialog.getByText("Its cure plan, with 4 milestones, is deleted too.")).toBeVisible({ timeout: SLOW });
  await expectNoSideScroll(page, "delete dialog");
  await expectInsideViewport(dialog, "delete dialog");
  await dialog.getByRole("button", { name: "Keep batch" }).tap();

  // The five-item phone bar, with the Schedule badge (the day-0 burn test is due today).
  const nav = mainNav(page);
  await expect(nav.getByRole("link")).toHaveCount(5);
  const badgeLink = nav.getByRole("link", { name: "Schedule, 1 due or overdue", exact: true });
  await expect(badgeLink).toBeVisible({ timeout: SLOW });
  const links = nav.getByRole("link");
  for (let i = 0; i < 5; i++) {
    const link = links.nth(i);
    const name = (await link.getAttribute("aria-label")) ?? (await link.innerText());
    await expectTapHeight(link, `nav: ${name}`);
    await expectInsideViewport(link, `nav: ${name}`);
    const box = (await link.boundingBox())!;
    expect(box.width, `nav: ${name}: width`).toBeGreaterThanOrEqual(44);
  }
  const badge = nav.getByTestId("nav-attention-badge");
  await expect(badge).toHaveText("1");
  const linkBox = (await badgeLink.boundingBox())!;
  const badgeBox = (await badge.boundingBox())!;
  expect(badgeBox.x, "badge inside its link (left)").toBeGreaterThanOrEqual(linkBox.x);
  expect(badgeBox.x + badgeBox.width, "badge inside its link (right)").toBeLessThanOrEqual(
    linkBox.x + linkBox.width + 0.5,
  );
  expect(badgeBox.y, "badge inside its link (top)").toBeGreaterThanOrEqual(linkBox.y);
  // The badge sits clear of the "Schedule" text under the icon.
  const text = (await badgeLink.locator("span.truncate").boundingBox())!;
  expect(badgeBox.y + badgeBox.height, "badge above the label").toBeLessThanOrEqual(text.y + 0.5);

  // Schedule page: a due-today row, an upcoming one, a done one and a planned entry.
  await badgeLink.tap();
  await waitForHeading(page, "Schedule");
  await expect(page.getByText("Loading schedule…")).toHaveCount(0, { timeout: SLOW });
  await expect(scheduleRows(scheduleGroup(page, "Due today"))).toHaveCount(1, { timeout: SLOW });
  await expect(scheduleRows(scheduleGroup(page, "Upcoming"))).toHaveCount(3);
  await expect(scheduleGroup(page, "Done")).toContainText(`Done on`);
  await checkScreen(page, "schedule page");
  const rows = page.getByTestId("schedule-row").filter({ visible: true });
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const buttons = rows.nth(i).getByRole("button");
    for (let b = 0; b < (await buttons.count()); b++) {
      await expectTapHeight(buttons.nth(b), `schedule row ${i}: button`);
    }
  }
  await expectInsideViewport(visible(page.getByRole("heading", { level: 1, name: "Schedule" })), "schedule heading");
});

// Regression (found by this suite, fixed by the lead): the links inside a Schedule row were
// inline text, about 18px tall. Tap targets must be at least 44px (FLOW-03).
test("Schedule row links are at least 44px tall at 375px", async ({ page }) => {
  test.setTimeout(240_000);
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  const id = await createBatch(page, formulaUrl, { date: iso(-20), label: "TAP-01" });
  await addCurePlan(page, id, { cure: "14" });
  await planProduction(page, formulaUrl, { date: iso(30), label: "Tap run" });
  await openSchedule(page);
  await expectTapHeight(
    scheduleGroup(page, "Overdue").getByRole("link", { name: "TAP-01" }),
    "schedule: batch link",
  );
  await expectTapHeight(
    scheduleGroup(page, "Upcoming").getByRole("link", { name: "Planned production" }),
    "schedule: entry link",
  );
});

// Regression (found by this suite, fixed by the lead): PageHeader's h1 did not break an
// unbroken word, so a 40-character label with no spaces made the entry page (and the batch
// page) wider than 375px.
test("a 40-character label without spaces does not widen the entry page", async ({ page }) => {
  test.setTimeout(240_000);
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  await planProduction(page, formulaUrl, { date: iso(5), label: "W".repeat(40) });
  await waitForHeading(page, "W".repeat(40));
  await expectNoSideScroll(page, "entry page with an unbroken label");
});
