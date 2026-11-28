import { test, expect, type Page } from "@playwright/test";
import { expectNoSideScroll, expectTapHeight } from "./helpers-flow";
import { seedBatch, SLOW, waitForHeading } from "./helpers-burn";
import {
  FIX,
  tid,
  addInvestigationPhotos,
  checkBox,
  hypothesisCards,
  issueBox,
  openNewExperiment,
  saveInvestigationButton,
  seedExperiment,
  vfield,
} from "./helpers-candlefix";
import { checkScreen, visible } from "./helpers-schedule";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
test.setTimeout(300_000);

async function noPageScroll(page: Page, where: string) {
  await expectNoSideScroll(page, where);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${where}: scrollWidth`).toBeLessThanOrEqual(375);
}

test("record an issue on a phone: editor, errors, save, page, batch section and list", async ({ page }) => {
  const batch = await seedBatch(page, { daysAgo: 5, label: "PH-01" });
  await page.goto(`/batches/${batch.id}`);
  await waitForHeading(page, "PH-01");
  const section = tid(page, "investigations-section");
  await expect(section).toContainText("No investigations yet", { timeout: SLOW });
  const record = section.getByRole("link", { name: "Record an issue" });
  await expectTapHeight(record, "batch: Record an issue");
  await checkScreen(page, "batch page, investigations section empty");

  await record.tap();
  await expect(page).toHaveURL(/\/investigations\/new\?batch=/, { timeout: SLOW });
  await waitForHeading(page, "Record an issue");
  await expect(vfield(page, FIX.dateLabel)).toBeVisible({ timeout: SLOW });
  await checkScreen(page, "editor, empty");

  // Errors: in view, and the page does not grow sideways.
  await saveInvestigationButton(page).tap();
  const error = page.getByText("Choose at least one issue.");
  await expect(error).toBeVisible();
  await expect(issueBox(page, "frosting")).toBeFocused();
  await expectNoSideScroll(page, "editor with an issue error");

  // Fill it in.
  await issueBox(page, "frosting").check();
  await issueBox(page, "other").check();
  await saveInvestigationButton(page).tap();
  await expect(page.getByText("Describe the other issue you saw.")).toBeVisible();
  await expect(vfield(page, "Describe the other issue")).toBeFocused();
  await vfield(page, "Describe the other issue").fill("A pale ring near the wall with a very long description that must wrap");
  await vfield(page, "Title (optional)").fill("Phone frosting");
  await vfield(page, "Observation notes (optional)").fill("Seen on the morning after the pour.");
  await checkBox(page, "frosting.pour-temperature").check();
  await page.getByLabel("Note on: Pour temperature as recorded on the batch").fill("Written down as warm");
  await visible(page.getByRole("button", { name: "Add hypothesis" })).tap();
  await vfield(page, "Hypothesis 1: Your hypothesis").fill("The container was cold when I poured.");
  await vfield(page, "Hypothesis 1: Status").selectOption({ label: "Follow-up observations don't fit it" });
  await expect(hypothesisCards(page)).toHaveCount(1);
  await expectTapHeight(page.getByRole("button", { name: "Remove hypothesis 1" }), "editor: Remove hypothesis");
  await expectTapHeight(page.getByRole("button", { name: "Add hypothesis" }), "editor: Add hypothesis");
  await expectTapHeight(visible(tid(page, "check-item-frosting.pour-temperature")).locator("xpath=ancestor::label"), "editor: a thing to check");
  await checkScreen(page, "editor, filled");

  await saveInvestigationButton(page).tap();
  await expect(page).toHaveURL(/\/investigations\/[0-9a-f-]{36}/, { timeout: SLOW });
  const id = new URL(page.url()).pathname.split("/")[2];
  await waitForHeading(page, "Phone frosting");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: SLOW });
  await expect(tid(page, "check-item-frosting.pour-temperature")).toHaveAttribute("data-ticked", "true");
  await expect(tid(page, "hypothesis-status")).toHaveAttribute("data-status", "doesNotFit");
  await expectNoSideScroll(page, "investigation page just saved");

  // Photos on the page.
  await addInvestigationPhotos(page, 2);
  await expectTapHeight(page.getByRole("button", { name: "Add photos" }), "page: Add photos");
  await expectTapHeight(page.getByRole("button", { name: "Open photo 1 of 2" }), "page: photo thumbnail");
  await expectTapHeight(page.getByRole("link", { name: "Edit", exact: true }), "page: Edit");
  await expectTapHeight(page.getByRole("button", { name: "Archive", exact: true }), "page: Archive");
  await expectTapHeight(page.getByRole("button", { name: "Delete", exact: true }), "page: Delete");
  await expectTapHeight(page.getByRole("link", { name: "Follow up hypothesis 1" }), "page: Follow up");
  await checkScreen(page, "investigation page with photos");

  // The edit screen.
  await page.getByRole("link", { name: "Edit", exact: true }).tap();
  await expect(page).toHaveURL(new RegExp(`/investigations/${id}/edit$`), { timeout: SLOW });
  await waitForHeading(page, "Edit investigation");
  await expect(vfield(page, FIX.dateLabel)).toBeVisible({ timeout: SLOW });
  await issueBox(page, "frosting").uncheck();
  await expect(visible(tid(page, "no-longer-listed"))).toBeVisible();
  await checkScreen(page, "editor, with kept checks");
  await visible(page.getByRole("link", { name: "Cancel" })).tap();

  // The delete dialog fits the screen.
  await waitForHeading(page, "Phone frosting");
  await page.getByRole("button", { name: "Delete", exact: true }).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("delete-impact")).toContainText("its 2 photos", { timeout: SLOW });
  const box = (await dialog.boundingBox())!;
  expect(box.x, "dialog: left edge").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "dialog: right edge").toBeLessThanOrEqual(375);
  await dialog.getByRole("button", { name: "Keep investigation" }).tap();
  await expect(dialog).toHaveCount(0);

  // The batch section and the list.
  await page.goto(`/batches/${batch.id}`);
  await waitForHeading(page, "PH-01");
  await expect(tid(page, "investigation-row")).toHaveCount(1, { timeout: SLOW });
  await expectTapHeight(tid(page, "investigation-row").first(), "batch: investigation row");
  await checkScreen(page, "batch page with an investigation");

  await page.goto("/investigations");
  await waitForHeading(page, "Investigations");
  await expect(tid(page, "investigation-list-row")).toHaveCount(1, { timeout: SLOW });
  await expectTapHeight(page.getByRole("checkbox", { name: "Show archived" }).locator("xpath=ancestor::label"), "list: Show archived");
  await checkScreen(page, "investigations list");
});

test("a corrective experiment and the before-and-after cards on a phone", async ({ page }) => {
  const s = await seedExperiment(page);

  // Investigation page with the experiment card and timeline.
  await page.goto(`/investigations/${s.investigationId}`);
  await waitForHeading(page, "Frosted tops");
  await expect(tid(page, "experiment-card")).toHaveCount(1, { timeout: SLOW });
  await expect(tid(page, "timeline-event").first()).toBeVisible();
  await expectTapHeight(page.getByRole("link", { name: "Compare before and after" }), "page: Compare");
  await expectTapHeight(page.getByRole("link", { name: /^Edit experiment with/ }), "page: Edit experiment");
  await checkScreen(page, "investigation page with an experiment");

  // Experiment editor.
  await openNewExperiment(page, s.investigationId, 1);
  await vfield(page, "Follow-up batch").selectOption({ index: 1 });
  await expect(visible(tid(page, "experiment-burn-tests")).getByLabel("Follow run")).toBeVisible({
    timeout: SLOW,
  });
  await checkScreen(page, "experiment editor");

  // The comparison: cards, not the table.
  await page.goto(`/investigations/${s.investigationId}/compare`);
  await waitForHeading(page, "Before and after");
  const cards = tid(page, "before-after-card");
  await expect(cards).toHaveCount(2, { timeout: SLOW });
  await expect(tid(page, "before-after-cards")).toBeVisible();
  await expect(tid(page, "before-after-table")).toBeHidden();
  await expect(cards.nth(0)).toContainText("Before");
  await expect(cards.nth(0)).toContainText("ORIG");
  await expect(cards.nth(0)).toContainText("version 1");
  await expect(cards.nth(0)).toContainText("Not recorded");
  await expect(cards.nth(0)).toContainText("Frosting");
  await expect(cards.nth(1)).toContainText("After");
  await expect(cards.nth(1)).toContainText("REV");
  await expect(cards.nth(1)).toContainText("version 2");
  await expect(cards.nth(1)).toContainText("11.5");
  await expect(cards.nth(1)).toContainText("Larger vessels, 200 g each");
  const rowIn = (card: ReturnType<Page["getByTestId"]>, label: string) =>
    card.locator("div").filter({ has: page.getByText(label, { exact: true }) });
  await expect(rowIn(cards.nth(0), "Total weight loss").first()).toContainText("Not recorded");
  await checkScreen(page, "before and after cards");
  const viewport = page.viewportSize()!;
  for (const card of [cards.nth(0), cards.nth(1)]) {
    const b = (await card.boundingBox())!;
    expect(b.x, "card left edge").toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, "card right edge").toBeLessThanOrEqual(viewport.width);
  }
  await noPageScroll(page, "compare cards");

  // The follow-up batch page and the burn test delete refusal fit too.
  await page.goto(`/burn-tests/${s.sessionId}`);
  await waitForHeading(page, "Follow run");
  await page.getByRole("button", { name: "Delete", exact: true }).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("delete-blocked-experiments")).toBeVisible({ timeout: SLOW });
  const box = (await dialog.boundingBox())!;
  expect(box.x + box.width, "refusal dialog: right edge").toBeLessThanOrEqual(375);
});
