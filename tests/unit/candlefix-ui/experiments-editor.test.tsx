import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ExperimentEditor } from "@/components/candlefix/experiments";
import { openDatabase } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { MAX_EXPERIMENT_SESSIONS } from "@/lib/types";
import { clearDatabase, layer, makeExperiment, makeSession, polyfillBrowser, seedWorld } from "./harness";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    bfcacheId: "t",
  }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));

const X = MESSAGES.candleFixExperiments;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  await clearDatabase();
});
afterEach(cleanup);


const choose = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function openNew(investigationId: string, hypothesisId?: string) {
  render(<ExperimentEditor mode="new" investigationId={investigationId} hypothesisId={hypothesisId ?? null} />);
  return screen.findByLabelText(X.hypothesisField);
}

describe("new corrective experiment", () => {
  it("preselects the hypothesis from the query and offers every batch except the investigation's own", async () => {
    const w = await seedWorld();
    // A second batch of the first version, and a batch of another formula.
    await layer().batches.create({
      batchId: crypto.randomUUID(),
      versionId: w.first.version.id,
      producedOn: "2026-11-22",
      label: "FIX-C",
      entries: [],
    });
    const select = (await openNew(w.investigation.id, w.hypothesisId)) as HTMLSelectElement;
    expect(select.value).toBe(w.hypothesisId);
    const batchSelect = screen.getByLabelText(X.batchField) as HTMLSelectElement;
    const options = within(batchSelect).getAllByRole("option").map((o) => o.textContent ?? "");
    expect(options.some((t) => t.includes("FIX-A"))).toBe(false);
    const fixB = options.find((t) => t.includes("FIX-B"));
    expect(fixB).toBe(X.batchOption("FIX-B", w.second.formula.name, 2, "Nov 20, 2026"));
    expect(options.some((t) => t.includes("FIX-C"))).toBe(true);
  });

  it("requires a hypothesis and a follow-up batch, with errors tied to the fields, and does not save", async () => {
    const w = await seedWorld();
    await openNew(w.investigation.id);
    fireEvent.click(screen.getByRole("button", { name: X.save }));
    const hyp = screen.getByLabelText(X.hypothesisField);
    expect(hyp.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(hyp.getAttribute("aria-describedby")!)?.textContent).toContain(X.errHypothesis);
    expect(screen.getByLabelText(X.batchField).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(hyp);
    expect(await layer().correctiveExperiments.listByInvestigation(w.investigation.id)).toHaveLength(0);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("lists only the chosen batch's burn tests, limited to 8, and saves the experiment", async () => {
    const w = await seedWorld();
    const mine: string[] = [];
    for (let i = 0; i < 9; i++) mine.push((await makeSession(w.followUp, `2026-11-${21 + i}`, `Follow ${i + 1}`)).id);
    await makeSession(w.original, "2026-11-15", "Original test");
    await openNew(w.investigation.id, w.hypothesisId);
    expect(screen.getByText(X.burnTestsChooseBatch)).toBeTruthy();
    choose(X.batchField, w.followUp.id);
    await screen.findByLabelText(/Follow 1/);
    expect(screen.queryByLabelText(/Original test/)).toBeNull();
    const boxes = () => screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes()).toHaveLength(9);
    for (let i = 0; i < MAX_EXPERIMENT_SESSIONS; i++) fireEvent.click(boxes()[i]);
    expect(boxes()[8].disabled).toBe(true);
    expect(screen.getByText(X.burnTestsLimit(MAX_EXPERIMENT_SESSIONS))).toBeTruthy();
    fireEvent.click(boxes()[7]);
    expect(boxes()[8].disabled).toBe(false);

    choose(X.changeField, "  Less fragrance oil  ");
    fireEvent.click(screen.getByRole("button", { name: X.save }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    expect(nav.replace).toHaveBeenCalledWith(`/investigations/${w.investigation.id}?saved=experiment`);
    const saved = await layer().correctiveExperiments.listByInvestigation(w.investigation.id);
    expect(saved).toHaveLength(1);
    expect(saved[0].followUpBatchId).toBe(w.followUp.id);
    expect(saved[0].hypothesisId).toBe(w.hypothesisId);
    expect(saved[0].change).toBe("Less fragrance oil");
    expect(saved[0].burnSessionIds).toHaveLength(7);
    expect(saved[0].burnSessionIds.every((id) => mine.includes(id))).toBe(true);
  });

  it("does not save twice on a double press", async () => {
    const w = await seedWorld();
    await openNew(w.investigation.id, w.hypothesisId);
    choose(X.batchField, w.followUp.id);
    const save = screen.getByRole("button", { name: X.save });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(await layer().correctiveExperiments.listByInvestigation(w.investigation.id)).toHaveLength(1);
  });

  it("says so when the investigation has no hypothesis", async () => {
    const w = await seedWorld();
    const db = openDatabase();
    await db.investigations.update(w.investigation.id, { hypotheses: [] });
    db.close();
    render(<ExperimentEditor mode="new" investigationId={w.investigation.id} />);
    expect(await screen.findByText(X.noHypothesesTitle)).toBeTruthy();
  });

  it("shows a not-found state for a missing investigation", async () => {
    render(<ExperimentEditor mode="new" investigationId={crypto.randomUUID()} />);
    expect(await screen.findByText(X.investigationMissingTitle)).toBeTruthy();
  });
});

describe("edit corrective experiment", () => {
  it("shows the hypothesis and follow-up batch read-only and saves the burn tests, change and notes", async () => {
    const w = await seedWorld();
    const s1 = await makeSession(w.followUp, "2026-11-25", "Trial one");
    const s2 = await makeSession(w.followUp, "2026-11-26", "Trial two");
    const e = await makeExperiment(w, { burnSessionIds: [s1.id], change: "Old change" });
    render(<ExperimentEditor mode="edit" investigationId={w.investigation.id} experimentId={e.id} />);
    const batch = await screen.findByTestId("experiment-batch");
    expect(batch.textContent).toContain("FIX-B");
    expect(screen.getByTestId("experiment-hypothesis").textContent).toContain("The wick is small for the tin.");
    expect(screen.queryByLabelText(X.batchField)).toBeNull();
    expect(screen.getByText(X.fixedNote)).toBeTruthy();

    const one = (await screen.findByLabelText(/Trial one/)) as HTMLInputElement;
    const two = screen.getByLabelText(/Trial two/) as HTMLInputElement;
    expect(one.checked).toBe(true);
    expect(two.checked).toBe(false);
    fireEvent.click(two);
    choose(X.changeField, "New change");
    choose(X.notesField, "Some notes");
    fireEvent.click(screen.getByRole("button", { name: X.save }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/investigations/${w.investigation.id}?saved=experiment`));
    const stored = await layer().correctiveExperiments.get(e.id);
    expect(stored?.burnSessionIds.sort()).toEqual([s1.id, s2.id].sort());
    expect(stored?.change).toBe("New change");
    expect(stored?.notes).toBe("Some notes");
    expect(stored?.followUpBatchId).toBe(w.followUp.id);
    expect(stored?.hypothesisId).toBe(w.hypothesisId);
  });

  it("flags a change longer than 500 characters on blur", async () => {
    const w = await seedWorld();
    const e = await makeExperiment(w);
    render(<ExperimentEditor mode="edit" investigationId={w.investigation.id} experimentId={e.id} />);
    const field = await screen.findByLabelText(X.changeField);
    fireEvent.change(field, { target: { value: "x".repeat(501) } });
    fireEvent.blur(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByText(X.errChangeLong(500)).length).toBeGreaterThan(0);
  });

  it("deletes only the experiment after a confirmation; the follow-up batch and its burn tests stay", async () => {
    const w = await seedWorld();
    const s = await makeSession(w.followUp, "2026-11-25", "Trial one");
    const e = await makeExperiment(w, { burnSessionIds: [s.id] });
    render(<ExperimentEditor mode="edit" investigationId={w.investigation.id} experimentId={e.id} />);
    fireEvent.click(await screen.findByRole("button", { name: X.deleteButton }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(X.deleteBody)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: X.deleteConfirm }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/investigations/${w.investigation.id}`));
    expect(await layer().correctiveExperiments.get(e.id)).toBeUndefined();
    expect(await layer().batches.get(w.followUp.id)).toBeDefined();
    expect(await layer().burnSessions.get(s.id)).toBeDefined();
  });

  it("shows a not-found state for another investigation's experiment", async () => {
    const w = await seedWorld();
    const e = await makeExperiment(w);
    render(<ExperimentEditor mode="edit" investigationId={crypto.randomUUID()} experimentId={e.id} />);
    expect(await screen.findByText(X.investigationMissingTitle)).toBeTruthy();
  });
});
