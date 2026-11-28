import { expect, type Locator, type Page } from "@playwright/test";
import { MESSAGES } from "@/lib/messages";
import { createSession, makeJpeg, makePng, seedBatch, SLOW, waitForHeading } from "./helpers-burn";
import { expectSavedAs, saveButton } from "./helpers-checks";
import { createBatch, iso, visible } from "./helpers-schedule";

export { SLOW, waitForHeading };

export const FIX = MESSAGES.candleFix;

/** The issue keys the editor offers (FIX_ISSUES), as written in its test ids. */
export type IssueKey =
  | "frosting"
  | "tunneling"
  | "sinkhole"
  | "soot"
  | "weakColdThrow"
  | "weakHotThrow"
  | "wetSpots"
  | "cracking"
  | "mushrooming"
  | "other";

export type HypothesisSpec = {
  text: string;
  /** The status as the select shows it, e.g. "Being tested". Default: the form's own default. */
  status?: string;
  notes?: string;
};

export type InvestigationSpec = {
  /** YYYY-MM-DD. Default: the form's own default (today). */
  date?: string;
  title?: string;
  issues: IssueKey[];
  /** Required when `issues` has "other". */
  other?: string;
  notes?: string;
  /** Things to check to tick, by item id ("frosting.pour-temperature"), with an optional note. */
  checks?: { itemId: string; note?: string }[];
  hypotheses?: HypothesisSpec[];
};

/** Next keeps hidden routes mounted: only look at visible fields. */
export const vfield = (page: Page, label: string): Locator =>
  visible(page.getByLabel(label, { exact: true }));

export const issueBox = (page: Page, issue: IssueKey): Locator =>
  visible(page.getByTestId(`issue-checkbox-${issue}`));

export const checkBox = (page: Page, itemId: string): Locator =>
  visible(page.getByTestId(`check-item-${itemId}`));

/** The "Hypothesis N" cards (editor or page). */
export const hypothesisCards = (page: Page) =>
  page.getByTestId("hypothesis-card").filter({ visible: true });

export const saveInvestigationButton = (page: Page, name: string = FIX.save) =>
  visible(page.getByRole("button", { name }));

export async function openNewInvestigation(page: Page, batchId: string) {
  await page.goto(`/investigations/new?batch=${batchId}`);
  await waitForHeading(page, "Record an issue");
  await expect(vfield(page, FIX.dateLabel)).toBeVisible({ timeout: SLOW });
}

export async function openEditInvestigation(page: Page, investigationId: string) {
  await page.goto(`/investigations/${investigationId}/edit`);
  await waitForHeading(page, "Edit investigation");
  await expect(vfield(page, FIX.dateLabel)).toBeVisible({ timeout: SLOW });
}

/** Adds a hypothesis card to the open editor and fills it. */
export async function addHypothesis(page: Page, spec: HypothesisSpec) {
  const before = await hypothesisCards(page).count();
  await visible(page.getByRole("button", { name: "Add hypothesis" })).click();
  await expect(hypothesisCards(page)).toHaveCount(before + 1);
  const n = before + 1;
  await vfield(page, `Hypothesis ${n}: Your hypothesis`).fill(spec.text);
  if (spec.status) await vfield(page, `Hypothesis ${n}: Status`).selectOption({ label: spec.status });
  if (spec.notes) await vfield(page, `Hypothesis ${n}: Notes (optional)`).fill(spec.notes);
}

/** Fills the open editor (new) from a spec. Does not save. */
export async function fillInvestigation(page: Page, spec: InvestigationSpec) {
  if (spec.date !== undefined) await vfield(page, FIX.dateLabel).fill(spec.date);
  if (spec.title !== undefined) await vfield(page, FIX.titleLabel).fill(spec.title);
  for (const issue of spec.issues) await issueBox(page, issue).check();
  if (spec.other !== undefined) await vfield(page, FIX.otherLabel).fill(spec.other);
  if (spec.notes !== undefined) await vfield(page, FIX.notesLabel).fill(spec.notes);
  for (const c of spec.checks ?? []) {
    await checkBox(page, c.itemId).check();
    if (c.note !== undefined) {
      const row = checkBox(page, c.itemId).locator("xpath=ancestor::li[1]");
      await row.getByRole("textbox").fill(c.note);
    }
  }
  for (const h of spec.hypotheses ?? []) await addHypothesis(page, h);
}

/** Saves a new investigation and waits for its page. Returns the investigation id. */
export async function saveInvestigation(page: Page): Promise<string> {
  await saveInvestigationButton(page).click();
  await expect(page).toHaveURL(/\/investigations\/(?!new)[0-9a-f-]{36}/, { timeout: SLOW });
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: SLOW });
  return new URL(page.url()).pathname.split("/")[2];
}

/** Records a whole investigation on a batch. Ends on its page; returns its id. Needs only `page`. */
export async function recordInvestigation(
  page: Page,
  batchId: string,
  spec: InvestigationSpec,
): Promise<string> {
  await openNewInvestigation(page, batchId);
  await fillInvestigation(page, spec);
  return saveInvestigation(page);
}

/** Adds `count` generated images on the investigation page and waits until the count shows. */
export async function addInvestigationPhotos(page: Page, count: number, startAt = 0, total = count) {
  const files = [];
  for (let i = 0; i < count; i++) {
    const seed = startAt + i + 1;
    files.push(
      seed % 2 === 0
        ? { name: `generated-${seed}.png`, mimeType: "image/png", buffer: await makePng(page, seed) }
        : { name: `generated-${seed}.jpg`, mimeType: "image/jpeg", buffer: await makeJpeg(page, seed, 400, 300) },
    );
  }
  await page.getByTestId("photo-input").setInputFiles(files);
  await expect(page.getByText(`${total} of 12`, { exact: true })).toBeVisible({ timeout: SLOW });
}

export type ExperimentSpec = {
  /** 1-based position of the hypothesis (uses its "Follow up hypothesis N" link), or a text it contains. */
  hypothesis: number | string;
  /** The follow-up batch's label (the option text contains it). */
  batchTitle: string;
  /** Burn test labels to list. */
  burnTests: string[];
  change?: string;
  notes?: string;
};

/** Opens the new-experiment editor for a hypothesis. */
export async function openNewExperiment(
  page: Page,
  investigationId: string,
  hypothesis: number | string,
) {
  if (typeof hypothesis === "number") {
    await page.goto(`/investigations/${investigationId}`);
    await expect(page.getByTestId("hypothesis-card").first()).toBeVisible({ timeout: SLOW });
    await page.getByRole("link", { name: `Follow up hypothesis ${hypothesis}` }).click();
  } else {
    await page.goto(`/investigations/${investigationId}/experiments/new`);
  }
  await waitForHeading(page, "New corrective experiment");
  await expect(vfield(page, "Follow-up batch")).toBeVisible({ timeout: SLOW });
  if (typeof hypothesis === "string") {
    const select = vfield(page, "Hypothesis to follow");
    const value = await select.locator("option", { hasText: hypothesis }).first().getAttribute("value");
    await select.selectOption({ value: value ?? "" });
  }
}

/** Creates a corrective experiment. Ends on the investigation page; returns the experiment id. */
export async function createExperiment(
  page: Page,
  investigationId: string,
  spec: ExperimentSpec,
): Promise<string> {
  await openNewExperiment(page, investigationId, spec.hypothesis);
  const batch = vfield(page, "Follow-up batch");
  const value = await batch.locator("option", { hasText: spec.batchTitle }).first().getAttribute("value");
  await batch.selectOption({ value: value ?? "" });
  const group = visible(page.getByTestId("experiment-burn-tests"));
  for (const test of spec.burnTests) await group.getByLabel(test).check();
  if (spec.change !== undefined) await vfield(page, "What changed").fill(spec.change);
  if (spec.notes !== undefined) await vfield(page, "Notes").fill(spec.notes);
  await visible(page.getByRole("button", { name: "Save experiment" })).click();
  await expect(page).toHaveURL(new RegExp(`/investigations/${investigationId}(\\?saved=experiment)?$`), {
    timeout: SLOW,
  });
  const card = page.getByTestId("experiment-card").last();
  await expect(card).toBeVisible({ timeout: SLOW });
  // The experiment's id is the last part of its "Edit experiment" link.
  const href = await card.getByRole("link", { name: /^Edit experiment with/ }).getAttribute("href");
  return href!.split("/").pop()!;
}

/**
 * Revises the formula at `formulaUrl` (changing the total weight) so it gets
 * version `nextVersion`, then makes a batch from that version. Returns the new batch id.
 */
export async function reviseAndMakeBatch(
  page: Page,
  formulaUrl: string,
  nextVersion: number,
  spec: { label: string; daysAgo: number; amount?: string },
): Promise<string> {
  await page.goto(formulaUrl);
  await visible(
    page
      .getByRole("link", { name: "Revise", exact: true })
      .or(page.getByRole("button", { name: "Revise", exact: true })),
  )
    .first()
    .click();
  await expect(
    page.getByText(`Revising version ${nextVersion - 1}. Saving creates version ${nextVersion}.`),
  ).toBeVisible({ timeout: SLOW });
  await visible(page.getByLabel("Fill weight per vessel (g)")).fill(spec.amount ?? "200");
  await saveButton(page).click();
  await expect(page).toHaveURL(/\/formulas\/[^/?]+(\?saved=1)?$/, { timeout: SLOW });
  await expectSavedAs(page, nextVersion);
  return createBatch(page, formulaUrl, { date: iso(-spec.daysAgo), label: spec.label });
}

/**
 * The whole CandleFix story on generated data, ending on the investigation page:
 * WE-5 version 1 and a batch "ORIG" with an investigation (two hypotheses), the
 * formula revised to version 2, a follow-up batch "REV" with one burn test
 * ("Follow run", weights recorded), and a corrective experiment that follows
 * hypothesis 2 with that batch and burn test.
 */
export async function seedExperiment(page: Page) {
  const orig = await seedBatch(page, { daysAgo: 12, label: "ORIG" });
  const investigationId = await recordInvestigation(page, orig.id, {
    title: "Frosted tops",
    issues: ["frosting"],
    notes: "White patches over the surface.",
    checks: [{ itemId: "frosting.pour-temperature", note: "Written down as warm" }],
    hypotheses: [
      { text: "The container was cold when I poured." },
      { text: "The pour was too hot.", status: "Being tested" },
    ],
  });
  const followId = await reviseAndMakeBatch(page, orig.formulaUrl, 2, { label: "REV", daysAgo: 6 });
  const sessionId = await createSession(page, followId, {
    date: iso(-2),
    label: "Follow run",
    candles: [
      {
        label: "F1",
        wickText: "Cotton 8",
        burns: [{ minutes: "240", before: "250", after: "238.5", diameter: "50", flame: "40", soot: "Light" }],
      },
    ],
  });
  const experimentId = await createExperiment(page, investigationId, {
    hypothesis: 2,
    batchTitle: "REV",
    burnTests: ["Follow run"],
    change: "Larger vessels, 200 g each",
  });
  return { origId: orig.id, formulaUrl: orig.formulaUrl, followId, sessionId, investigationId, experimentId };
}

/** A test id, among the visible elements only (Next keeps earlier routes mounted, hidden). */
export const tid = (page: Page, id: string): Locator => page.getByTestId(id).filter({ visible: true });
