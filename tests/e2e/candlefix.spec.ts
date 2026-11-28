import { test, expect, type Page } from "@playwright/test";
import { seedBatch, SLOW, waitForHeading, expectNoVerdicts } from "./helpers-burn";
import {
  FIX,
  tid,
  addInvestigationPhotos,
  checkBox,
  hypothesisCards,
  issueBox,
  openEditInvestigation,
  openNewExperiment,
  openNewInvestigation,
  recordInvestigation,
  saveInvestigationButton,
  seedExperiment,
  vfield,
} from "./helpers-candlefix";
import { visible } from "./helpers-schedule";

test.use({ viewport: { width: 1280, height: 800 } });
test.setTimeout(300_000);

const investigationsSection = (p: Page) => tid(p, "investigations-section");
const investigationRows = (p: Page) => tid(p, "investigation-row");
const listRows = (p: Page) => tid(p, "investigation-list-row");

async function openBatchPage(page: Page, id: string, heading: string) {
  await page.goto(`/batches/${id}`);
  await waitForHeading(page, heading);
  await expect(investigationsSection(page)).toBeVisible({ timeout: SLOW });
}

async function openInvestigation(page: Page, id: string, heading: string) {
  await page.goto(`/investigations/${id}`);
  await waitForHeading(page, heading);
  await expect(tid(page, "observed-block")).toBeVisible({ timeout: SLOW });
}

test("record an issue: field errors first, then save, reload and the batch page", async ({ page }) => {
  const batch = await seedBatch(page, { daysAgo: 5, label: "FIX-01" });
  await openBatchPage(page, batch.id, "FIX-01");
  await expect(investigationsSection(page)).toContainText("No investigations yet");
  await page.getByRole("link", { name: "Record an issue" }).click();
  await expect(page).toHaveURL(new RegExp(`/investigations/new\\?batch=${batch.id}`), { timeout: SLOW });
  await waitForHeading(page, "Record an issue");
  await expect(vfield(page, FIX.dateLabel)).toBeVisible({ timeout: SLOW });

  // No issue chosen: the error shows and the focus goes to the first invalid field.
  await saveInvestigationButton(page).click();
  await expect(page.getByText("Choose at least one issue.")).toBeVisible();
  await expect(page).toHaveURL(/\/investigations\/new/);
  await expect(issueBox(page, "frosting")).toBeFocused();

  // "Other" without a description.
  await issueBox(page, "other").check();
  await expect(vfield(page, "Describe the other issue")).toBeVisible();
  await saveInvestigationButton(page).click();
  await expect(page.getByText("Describe the other issue you saw.")).toBeVisible();
  await expect(vfield(page, "Describe the other issue")).toBeFocused();
  await expect(page).toHaveURL(/\/investigations\/new/);

  // Things to check appear for the chosen issues only; nothing is a verdict.
  await issueBox(page, "frosting").check();
  await expect(page.getByRole("group", { name: "Things to check for Frosting" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Things to check for Other" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Things to check for Tunneling" })).toHaveCount(0);

  // A valid form.
  await vfield(page, "Title (optional)").fill("Frosted tops");
  await vfield(page, "Describe the other issue").fill("Pale ring at the wall");
  await vfield(page, "Observation notes (optional)").fill("White patches over the surface.");
  await checkBox(page, "frosting.pour-temperature").check();
  await expect(page.getByLabel("Note on: Pour temperature as recorded on the batch")).toBeVisible();
  await page.getByLabel("Note on: Pour temperature as recorded on the batch").fill("Written down as warm");
  await visible(page.getByRole("button", { name: "Add hypothesis" })).click();
  await vfield(page, "Hypothesis 1: Your hypothesis").fill("The container was cold when I poured.");
  await visible(page.getByRole("button", { name: "Add hypothesis" })).click();
  await vfield(page, "Hypothesis 2: Your hypothesis").fill("The pour was too hot.");
  await vfield(page, "Hypothesis 2: Status").selectOption({ label: "Being tested" });
  await vfield(page, "Hypothesis 2: Notes (optional)").fill("Try 5 degrees cooler.");
  await saveInvestigationButton(page).click();

  // The investigation page.
  await expect(page).toHaveURL(/\/investigations\/[0-9a-f-]{36}/, { timeout: SLOW });
  const id = new URL(page.url()).pathname.split("/")[2];
  await waitForHeading(page, "Frosted tops");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: SLOW });
  const verify = async () => {
    const observed = tid(page, "observed-block");
    await expect(observed).toContainText("What you observed");
    await expect(tid(page, "observed-issues")).toContainText("Frosting");
    await expect(tid(page, "observed-issues")).toContainText("Other");
    await expect(observed).toContainText("Other: Pale ring at the wall");
    await expect(observed).toContainText("White patches over the surface.");
    const ticked = tid(page, "check-item-frosting.pour-temperature");
    await expect(ticked).toHaveAttribute("data-ticked", "true");
    await expect(ticked).toContainText("Written down as warm");
    const block = tid(page, "hypotheses-block");
    await expect(block).toContainText("Hypotheses (your ideas to test)");
    await expect(hypothesisCards(page)).toHaveCount(2);
    await expect(hypothesisCards(page).nth(0)).toContainText("Hypothesis 1");
    await expect(hypothesisCards(page).nth(0)).toContainText("The container was cold when I poured.");
    await expect(hypothesisCards(page).nth(0).getByTestId("hypothesis-status")).toHaveAttribute("data-status", "open");
    await expect(hypothesisCards(page).nth(1)).toContainText("Hypothesis 2");
    await expect(hypothesisCards(page).nth(1).getByTestId("hypothesis-status")).toHaveAttribute(
      "data-status",
      "testing",
    );
    await expect(hypothesisCards(page).nth(1)).toContainText("Try 5 degrees cooler.");
    // Observations and ideas never share a block.
    await expect(observed).not.toContainText("The container was cold");
    await expect(block).not.toContainText("White patches");
    // The header names the exact formula version of the batch.
    await expect(page.getByRole("link", { name: "version 1" })).toBeVisible();
    await expect(page.getByRole("link", { name: "FIX-01" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lavender Vanilla Cedar" })).toBeVisible();
  };
  await verify();
  await expectNoVerdicts(page, "investigation page");

  await expect(page).toHaveURL(new RegExp(`/investigations/${id}$`));
  // Reload: all of it is still there and the notice is gone.
  await page.reload();
  await waitForHeading(page, "Frosted tops");
  await expect(tid(page, "observed-block")).toBeVisible({ timeout: SLOW });
  await verify();
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);

  // The batch page lists it.
  await openBatchPage(page, batch.id, "FIX-01");
  await expect(investigationRows(page)).toHaveCount(1, { timeout: SLOW });
  await expect(investigationRows(page).first()).toContainText("Frosted tops");
  await expect(investigationRows(page).first()).toHaveAttribute("href", `/investigations/${id}`);
  await expect(investigationsSection(page).getByRole("heading", { name: "Investigations" })).toBeVisible();
});

test("edit: change a status; unticking an issue keeps its checked item under 'From issues no longer listed'", async ({
  page,
}) => {
  const batch = await seedBatch(page, { daysAgo: 5, label: "FIX-02" });
  const id = await recordInvestigation(page, batch.id, {
    title: "Two issues",
    issues: ["frosting", "tunneling"],
    checks: [
      { itemId: "frosting.pour-temperature", note: "Warm" },
      { itemId: "tunneling.wick-size" },
    ],
    hypotheses: [{ text: "The wick was too small." }],
  });
  await waitForHeading(page, "Two issues");

  await openEditInvestigation(page, id);
  await expect(issueBox(page, "frosting")).toBeChecked();
  await expect(checkBox(page, "frosting.pour-temperature")).toBeChecked();
  await vfield(page, "Hypothesis 1: Status").selectOption({ label: "Being tested" });
  await issueBox(page, "frosting").uncheck();
  const kept = visible(tid(page, "no-longer-listed"));
  await expect(kept).toBeVisible();
  await expect(kept).toContainText("From issues no longer listed");
  await expect(kept).toContainText("Pour temperature as recorded on the batch");
  await expect(kept).toContainText("Warm");
  await expect(page.getByRole("group", { name: "Things to check for Frosting" })).toHaveCount(0);
  await saveInvestigationButton(page, "Save changes").click();

  await expect(page).toHaveURL(new RegExp(`/investigations/${id}`), { timeout: SLOW });
  await waitForHeading(page, "Two issues");
  await expect(tid(page, "observed-issues")).toContainText("Tunneling");
  await expect(tid(page, "observed-issues")).not.toContainText("Frosting");
  await expect(hypothesisCards(page).first().getByTestId("hypothesis-status")).toHaveAttribute(
    "data-status",
    "testing",
  );
  const view = tid(page, "no-longer-listed");
  await expect(view).toContainText("From issues no longer listed");
  await expect(view.getByTestId("check-item-frosting.pour-temperature")).toHaveAttribute("data-ticked", "true");
  await expect(view).toContainText("Warm");

  // It stays after a reload and when the editor opens again.
  await page.reload();
  await waitForHeading(page, "Two issues");
  await expect(tid(page, "no-longer-listed")).toContainText("Pour temperature as recorded on the batch", {
    timeout: SLOW,
  });
  await openEditInvestigation(page, id);
  await expect(visible(tid(page, "no-longer-listed"))).toContainText("Warm");
  await expect(checkBox(page, "tunneling.wick-size")).toBeChecked();
});

test("photos: add two, open one, delete one with a confirmation", async ({ page }) => {
  const batch = await seedBatch(page, { daysAgo: 4, label: "FIX-03" });
  const id = await recordInvestigation(page, batch.id, { title: "With photos", issues: ["soot"] });
  await waitForHeading(page, "With photos");
  await expect(page.getByRole("heading", { name: "Photos", exact: true })).toBeVisible();
  await expect(page.getByText(/No photos yet/)).toBeVisible({ timeout: SLOW });

  await addInvestigationPhotos(page, 2);
  const thumbs = page.getByRole("button", { name: /^Open photo \d+ of 2$/ });
  await expect(thumbs).toHaveCount(2);

  await thumbs.first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Photo 1 of 2" })).toBeVisible();
  const big = dialog.getByRole("img");
  await expect.poll(() => big.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: SLOW }).toBeGreaterThan(0);

  // Keep first, then delete.
  await dialog.getByRole("button", { name: "Delete photo" }).click();
  await expect(dialog.getByRole("heading", { name: "Delete this photo?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Keep photo" }).click();
  await expect(page.getByText("2 of 12", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete photo" }).click();
  await dialog.getByRole("button", { name: "Delete photo" }).click();
  await expect(dialog).toHaveCount(0, { timeout: SLOW });
  await expect(page.getByText("1 of 12", { exact: true })).toBeVisible({ timeout: SLOW });

  await page.reload();
  await waitForHeading(page, "With photos");
  await expect(page.getByText("1 of 12", { exact: true })).toBeVisible({ timeout: SLOW });
  await expect(page.getByRole("button", { name: /^Open photo \d+ of 1$/ })).toHaveCount(1);
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
});

test("a hypothesis to a follow-up batch: experiment, timeline and before-and-after", async ({ page }) => {
  const s = await seedExperiment(page);

  // The investigation page: experiment card and timeline.
  await openInvestigation(page, s.investigationId, "Frosted tops");
  const section = tid(page, "experiments-section");
  await expect(section).toContainText("Corrective experiments");
  const card = section.getByTestId("experiment-card");
  await expect(card).toHaveCount(1, { timeout: SLOW });
  await expect(card).toContainText("Hypothesis: The pour was too hot.");
  await expect(card).toContainText("REV");
  await expect(card).toContainText("version 2");
  await expect(card).toContainText("Larger vessels, 200 g each");
  await expect(card.getByRole("link", { name: "Follow run" })).toBeVisible();
  await expect(card.getByRole("link", { name: /^Edit experiment with/ })).toBeVisible();
  const events = section.getByTestId("timeline").getByTestId("timeline-event");
  await expect(events.first()).toBeVisible();
  const timeline = await section.getByTestId("timeline").innerText();
  for (const word of ["Batch made", "Issue observed", "Hypothesis added", "Follow-up batch made", "Burn test"]) {
    expect(timeline, `timeline mentions ${word}`).toContain(word);
  }
  await expectNoVerdicts(page, "investigation page with an experiment");

  // The original batch is not offered as the follow-up; the revised one is.
  await openNewExperiment(page, s.investigationId, 1);
  const options = await vfield(page, "Follow-up batch").locator("option").allInnerTexts();
  expect(options.some((o) => o.startsWith("ORIG,"))).toBe(false);
  expect(options.some((o) => o.startsWith("REV, Lavender Vanilla Cedar, version 2, made "))).toBe(true);
  // The burn tests of the chosen batch appear after choosing it.
  await expect(visible(tid(page, "experiment-burn-tests"))).toContainText(
    "Choose a follow-up batch to see its burn tests.",
  );
  await vfield(page, "Follow-up batch").selectOption({ label: options.find((o) => o.startsWith("REV,"))! });
  await expect(visible(tid(page, "experiment-burn-tests")).getByLabel("Follow run")).toBeVisible({
    timeout: SLOW,
  });
  await visible(page.getByRole("link", { name: "Cancel" })).click();
  await expect(page).toHaveURL(new RegExp(`/investigations/${s.investigationId}$`), { timeout: SLOW });

  // Before and after.
  await page.getByRole("link", { name: "Compare before and after" }).click();
  await expect(page).toHaveURL(new RegExp(`/investigations/${s.investigationId}/compare$`), { timeout: SLOW });
  await waitForHeading(page, "Before and after");
  const table = tid(page, "before-after-table");
  await expect(table).toBeVisible({ timeout: SLOW });
  await expect(tid(page, "before-after-cards")).toBeHidden();
  const columns = table.getByTestId("before-after-column");
  await expect(columns).toHaveCount(2);
  await expect(columns.nth(0)).toContainText("Before");
  await expect(columns.nth(0)).toContainText("ORIG");
  await expect(columns.nth(1)).toContainText("After");
  await expect(columns.nth(1)).toContainText("REV");
  const row = (name: string) => table.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
  const cells = (name: string) => row(name).getByRole("cell");
  await expect(cells("Formula and version").nth(0)).toContainText("version 1");
  await expect(cells("Formula and version").nth(1)).toContainText("version 2");
  await expect(cells("Hypothesis followed").nth(1)).toContainText("The pour was too hot.");
  await expect(cells("What changed").nth(1)).toContainText("Larger vessels, 200 g each");
  await expect(cells("Issues observed").nth(0)).toContainText("Frosting");
  await expect(cells("Issues observed").nth(1)).toContainText("None recorded");
  await expect(cells("Burn tests").nth(0)).toHaveText("0");
  await expect(cells("Burn tests").nth(1)).toHaveText("1");
  // Figures: nothing recorded before, weights recorded after (250 g to 238.5 g).
  await expect(cells("Total weight loss").nth(0)).toContainText("Not recorded");
  await expect(cells("Total weight loss").nth(1)).not.toContainText("Not recorded");
  await expect(cells("Total weight loss").nth(1)).toContainText("11.5");
  await expect(cells("Last melt pool diameter (largest candle)").nth(0)).toContainText("Not recorded");
  await expect(cells("Last melt pool diameter (largest candle)").nth(1)).toContainText("50");
  await expect(page.getByTestId("melt-pool-note")).toContainText("last diameter recorded for each candle");
  await expect(cells("Largest flame height").nth(1)).toContainText("40");
  await expectNoVerdicts(page, "compare page");

  // The follow-up batch page names the investigation it follows up.
  await openBatchPage(page, s.followId, "REV");
  const links = tid(page, "follow-up-links");
  await expect(links).toContainText("Follow-up batch for", { timeout: SLOW });
  await expect(links).toContainText("Frosted tops");
  await expect(links.getByRole("link")).toHaveAttribute("href", `/investigations/${s.investigationId}`);
});

test("delete rules: refusals, the editor alert, then experiment and investigation deletes", async ({ page }) => {
  const s = await seedExperiment(page);
  await openInvestigation(page, s.investigationId, "Frosted tops");
  await addInvestigationPhotos(page, 2);

  // The original batch is kept by its investigation.
  await openBatchPage(page, s.origId, "ORIG");
  await page.getByRole("button", { name: "Delete batch" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("delete-blocked-investigations")).toContainText("This batch has 1 investigation.", {
    timeout: SLOW,
  });
  await expect(dialog.getByRole("button", { name: "Delete batch" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Keep batch" }).click();
  await expect(dialog).toHaveCount(0);

  // The follow-up batch is kept by the experiment (and by its burn test).
  await openBatchPage(page, s.followId, "REV");
  await page.getByRole("button", { name: "Delete batch" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("delete-blocked-follow-up")).toContainText(
    "This batch is the follow-up batch of 1 corrective experiment.",
    { timeout: SLOW },
  );
  await expect(dialog).toContainText("This batch has 1 burn test.");
  await expect(dialog.getByRole("button", { name: "Delete batch" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Keep batch" }).click();
  await expect(dialog).toHaveCount(0);

  // The listed burn test is kept by the experiment.
  await page.goto(`/burn-tests/${s.sessionId}`);
  await waitForHeading(page, "Follow run");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("delete-blocked-experiments")).toContainText(
    "This burn test is listed by 1 corrective experiment",
    { timeout: SLOW },
  );
  await expect(dialog.getByRole("button", { name: "Delete burn test" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Keep burn test" }).click();
  await expect(dialog).toHaveCount(0);

  // The followed hypothesis cannot be removed in the editor; the form stays.
  await openEditInvestigation(page, s.investigationId);
  await vfield(page, "Title (optional)").fill("Frosted tops, edited");
  await expect(hypothesisCards(page)).toHaveCount(2);
  await visible(page.getByRole("button", { name: "Remove hypothesis 2" })).click();
  await expect(hypothesisCards(page)).toHaveCount(1);
  await saveInvestigationButton(page, "Save changes").click();
  const alert = page.getByText(/^Hypothesis 2 \(The pour was too hot\.\) has a corrective experiment, so it cannot be removed/);
  await expect(alert).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/investigations/${s.investigationId}/edit`));
  await expect(hypothesisCards(page)).toHaveCount(2);
  await expect(vfield(page, "Hypothesis 2: Your hypothesis")).toHaveValue("The pour was too hot.");
  await expect(vfield(page, "Title (optional)")).toHaveValue("Frosted tops, edited");
  await visible(page.getByRole("link", { name: "Cancel" })).click();
  await expect(page).toHaveURL(new RegExp(`/investigations/${s.investigationId}$`), { timeout: SLOW });

  // The delete dialog counts what goes with the investigation. Keep it for now.
  await waitForHeading(page, "Frosted tops");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delete this investigation?" })).toBeVisible();
  await expect(dialog.getByTestId("delete-impact")).toContainText("its 2 photos and 1 corrective experiment", {
    timeout: SLOW,
  });
  await dialog.getByRole("button", { name: "Keep investigation" }).click();
  await expect(dialog).toHaveCount(0);

  // Delete the experiment alone: the follow-up batch and burn test stay.
  await page.getByRole("link", { name: /^Edit experiment with/ }).click();
  await expect(page).toHaveURL(new RegExp(`/experiments/${s.experimentId}$`), { timeout: SLOW });
  await waitForHeading(page, "Edit corrective experiment");
  await visible(page.getByRole("button", { name: "Delete experiment" })).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delete this corrective experiment?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Keep it" }).click();
  await expect(dialog).toHaveCount(0);
  await visible(page.getByRole("button", { name: "Delete experiment" })).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete experiment" }).click();
  await expect(page).toHaveURL(new RegExp(`/investigations/${s.investigationId}$`), { timeout: SLOW });
  await waitForHeading(page, "Frosted tops");
  await expect(page.getByText("No corrective experiments yet")).toBeVisible({ timeout: SLOW });
  await expect(tid(page, "experiment-card")).toHaveCount(0);

  // The burn test and the follow-up batch are untouched: the burn test can be deleted again.
  await page.goto(`/burn-tests/${s.sessionId}`);
  await waitForHeading(page, "Follow run");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Delete burn test" })).toBeEnabled({ timeout: SLOW });
  await expect(dialog.getByTestId("delete-blocked-experiments")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Keep burn test" }).click();

  // Now the investigation's delete shows photos only, and goes back to the batch page.
  await openInvestigation(page, s.investigationId, "Frosted tops");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("delete-impact")).toContainText("its 2 photos.", { timeout: SLOW });
  await expect(dialog.getByTestId("delete-impact")).not.toContainText("corrective experiment");
  await dialog.getByRole("button", { name: "Delete investigation" }).click();
  await expect(page).toHaveURL(new RegExp(`/batches/${s.origId}$`), { timeout: SLOW });
  await waitForHeading(page, "ORIG");
  await expect(investigationsSection(page)).toContainText("No investigations yet", { timeout: SLOW });
  await expect(investigationRows(page)).toHaveCount(0);

  // The follow-up batch is no longer a follow-up.
  await openBatchPage(page, s.followId, "REV");
  await expect(tid(page, "follow-up-links")).toHaveCount(0);
  await page.goto(`/investigations/${s.investigationId}`);
  await expect(page.getByText("Investigation not found").first()).toBeVisible({ timeout: SLOW });
});

test("archive hides it from the list, not from its batch; unarchive brings it back", async ({ page }) => {
  const batch = await seedBatch(page, { daysAgo: 3, label: "FIX-06" });
  const id = await recordInvestigation(page, batch.id, { title: "To archive", issues: ["cracking"] });
  await waitForHeading(page, "To archive");

  await page.goto("/investigations");
  await waitForHeading(page, "Investigations");
  await expect(listRows(page)).toHaveCount(1, { timeout: SLOW });
  await expect(listRows(page).first()).toContainText("To archive");
  await expect(listRows(page).first()).toContainText("FIX-06");
  await expect(listRows(page).first()).toContainText("version 1");
  await expect(page.getByRole("checkbox", { name: "Show archived" })).not.toBeChecked();

  await openInvestigation(page, id, "To archive");
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unarchive" })).toBeVisible({ timeout: SLOW });
  await expect(tid(page, "investigation-archived")).toBeVisible();

  // Hidden from the list; shown with "Show archived", with a badge.
  await page.goto("/investigations");
  await waitForHeading(page, "Investigations");
  await expect(page.getByText("No investigations yet")).toBeVisible({ timeout: SLOW });
  await expect(listRows(page)).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Show archived" }).click();
  await expect(page).toHaveURL(/archived=1/);
  await expect(listRows(page)).toHaveCount(1, { timeout: SLOW });
  await expect(listRows(page).first()).toContainText("Archived");

  // Still on the batch page, with the badge.
  await openBatchPage(page, batch.id, "FIX-06");
  await expect(investigationRows(page)).toHaveCount(1, { timeout: SLOW });
  await expect(investigationRows(page).first().getByTestId("investigation-archived")).toBeVisible();

  // Unarchive.
  await investigationRows(page).first().click();
  await waitForHeading(page, "To archive");
  await page.getByRole("button", { name: "Unarchive" }).click();
  await expect(page.getByRole("button", { name: "Archive", exact: true })).toBeVisible({ timeout: SLOW });
  await expect(tid(page, "investigation-archived")).toHaveCount(0);
  await page.goto("/investigations");
  await expect(listRows(page)).toHaveCount(1, { timeout: SLOW });
  await expect(listRows(page).first()).not.toContainText("Archived");
});

test("the list opens from the Batches page; empty until something is recorded", async ({ page }) => {
  await page.goto("/batches");
  await waitForHeading(page, "Batches");
  await visible(page.getByRole("link", { name: "Investigations" })).first().click();
  await expect(page).toHaveURL(/\/investigations$/, { timeout: SLOW });
  await waitForHeading(page, "Investigations");
  await expect(page.getByText("No investigations yet")).toBeVisible({ timeout: SLOW });
  await expect(page.getByRole("link", { name: "Go to batches" })).toBeVisible();
});

test("two fast clicks on Save investigation create one investigation", async ({ page }) => {
  const batch = await seedBatch(page, { daysAgo: 2, label: "FIX-07" });
  await openNewInvestigation(page, batch.id);
  await issueBox(page, "sinkhole").check();
  await vfield(page, "Title (optional)").fill("Double click");
  const save = saveInvestigationButton(page);
  await save.dblclick({ noWaitAfter: true });
  await expect(page).toHaveURL(/\/investigations\/[0-9a-f-]{36}/, { timeout: SLOW });
  await waitForHeading(page, "Double click");

  await page.goto("/investigations");
  await waitForHeading(page, "Investigations");
  await expect(listRows(page)).toHaveCount(1, { timeout: SLOW });
  await openBatchPage(page, batch.id, "FIX-07");
  await expect(investigationRows(page)).toHaveCount(1, { timeout: SLOW });
});
