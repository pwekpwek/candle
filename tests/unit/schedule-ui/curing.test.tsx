import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BatchDetail, formatProducedOn } from "@/components/batches";
import { MESSAGES } from "@/lib/messages";
import { addDays, todayLocal } from "@/lib/schedule";
import { clearDatabase, daysFromToday, layer, polyfillBrowser, seedBatch } from "./harness";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/",
}));

const S = MESSAGES.schedule;
const B = MESSAGES.batches;
const fmt = formatProducedOn;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.search = "";
  await clearDatabase();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A batch made 10 days ago with a cure end (14 d), two burn tests (7 d, 10 d) and a check (30 d). */
async function seedPlanned() {
  const producedOn = daysFromToday(-10);
  const s = await seedBatch(producedOn, "Run 1");
  const plan = await layer().curePlans.save(s.batch.id, [
    { kind: "cureEnd", offsetDays: 14 },
    { kind: "burnTest", label: "Burn A", offsetDays: 7 },
    { kind: "burnTest", offsetDays: 10 },
    { kind: "check", label: "Wick check", offsetDays: 30 },
  ]);
  return { ...s, producedOn, plan };
}

const milestoneRow = (name: string) =>
  screen
    .getAllByTestId("milestone-row")
    .find((row) => within(row).queryByText(name, { exact: true }) !== null)!;

describe("Curing section", () => {
  it("without a plan: explains and offers Add cure plan", async () => {
    const s = await seedBatch(daysFromToday(-1));
    render(<BatchDetail batchId={s.batch.id} />);
    expect(await screen.findByRole("heading", { name: S.curingHeading })).toBeInTheDocument();
    expect(await screen.findByText(S.curingEmpty)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: S.addCurePlan })).toHaveAttribute(
      "href",
      `/batches/${s.batch.id}/cure-plan`,
    );
    expect(screen.queryByRole("button", { name: S.removeCurePlan })).not.toBeInTheDocument();
  });

  it("with a plan: cure time, planned cure end, every milestone with date and state", async () => {
    const s = await seedPlanned();
    render(<BatchDetail batchId={s.batch.id} />);
    expect(await screen.findByText(S.cureTime(14), { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText(S.plannedCureEnd(fmt(addDays(s.producedOn, 14))), { exact: false }),
    ).toBeInTheDocument();

    expect(await screen.findAllByTestId("milestone-row")).toHaveLength(4);

    const burnA = milestoneRow("Burn A");
    expect(burnA).toHaveTextContent(S.dueOn(fmt(addDays(s.producedOn, 7))));
    expect(burnA).toHaveTextContent(S.stateOverdue);

    const defaultBurn = milestoneRow(S.kindName.burnTest);
    expect(defaultBurn).toHaveTextContent(S.dueOn(fmt(todayLocal())));
    expect(defaultBurn).toHaveTextContent(S.stateDue);

    const cureEnd = milestoneRow(S.kindName.cureEnd);
    expect(cureEnd).toHaveTextContent(S.dueOn(fmt(addDays(s.producedOn, 14))));
    expect(cureEnd).toHaveTextContent(S.stateUpcoming);

    expect(within(milestoneRow("Wick check")).getByText(S.stateUpcoming)).toBeInTheDocument();
    // Ordered by offset: 7, 10, 14, 30.
    const names = screen
      .getAllByTestId("milestone-row")
      .map((r) => r.querySelector("p")!.textContent);
    expect(names).toEqual(["Burn A", S.kindName.burnTest, S.kindName.cureEnd, "Wick check"]);
    expect(screen.getByRole("link", { name: S.editCurePlan })).toHaveAttribute(
      "href",
      `/batches/${s.batch.id}/cure-plan`,
    );
  });

  it("never claims anything about the candle", async () => {
    const s = await seedPlanned();
    render(<BatchDetail batchId={s.batch.id} />);
    await screen.findAllByTestId("milestone-row");
    const text = screen.getByRole("heading", { name: S.curingHeading }).closest("section")!
      .textContent!;
    expect(text).not.toMatch(/safe|ready|finished|compliant|cured\b/i);
  });

  it("marks a milestone done with today's date, and back to not done", async () => {
    const s = await seedPlanned();
    render(<BatchDetail batchId={s.batch.id} />);
    await screen.findAllByTestId("milestone-row");

    fireEvent.click(screen.getByRole("button", { name: S.markDoneFor("Burn A") }));
    await waitFor(() =>
      expect(milestoneRow("Burn A")).toHaveTextContent(S.stateDone(fmt(todayLocal()))),
    );
    expect(milestoneRow("Burn A")).not.toHaveTextContent(S.dueOn(fmt(addDays(s.producedOn, 7))));
    const stored = await layer().curePlans.get(s.batch.id);
    expect(stored?.milestones.find((m) => m.label === "Burn A")?.doneOn).toBe(todayLocal());

    fireEvent.click(screen.getByRole("button", { name: S.markNotDoneFor("Burn A") }));
    await waitFor(() => expect(milestoneRow("Burn A")).toHaveTextContent(S.stateOverdue));
    const undone = await layer().curePlans.get(s.batch.id);
    expect(undone?.milestones.find((m) => m.label === "Burn A")?.doneOn).toBeNull();
  });

  it("shows an error when marking done fails", async () => {
    const s = await seedPlanned();
    render(<BatchDetail batchId={s.batch.id} />);
    await screen.findAllByTestId("milestone-row");
    vi.spyOn(layer().curePlans, "setMilestoneDone").mockRejectedValue(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: S.markDoneFor("Burn A") }));
    expect(await screen.findByText(S.markFailed)).toBeInTheDocument();
  });

  it("moves due dates when the production date is saved on the same page, and keeps done dates", async () => {
    const s = await seedPlanned();
    render(<BatchDetail batchId={s.batch.id} />);
    await screen.findAllByTestId("milestone-row");

    fireEvent.click(screen.getByRole("button", { name: S.markDoneFor("Burn A") }));
    await waitFor(() =>
      expect(milestoneRow("Burn A")).toHaveTextContent(S.stateDone(fmt(todayLocal()))),
    );

    const newDate = daysFromToday(-20);
    fireEvent.change(screen.getByLabelText(B.producedOnFieldLabel), { target: { value: newDate } });
    fireEvent.click(screen.getByRole("button", { name: B.saveChanges }));
    expect(await screen.findByText(B.changesSaved)).toBeInTheDocument();

    // Open milestones moved with the date.
    await waitFor(() =>
      expect(milestoneRow(S.kindName.cureEnd)).toHaveTextContent(S.dueOn(fmt(addDays(newDate, 14)))),
    );
    expect(milestoneRow("Wick check")).toHaveTextContent(S.dueOn(fmt(addDays(newDate, 30))));
    expect(milestoneRow(S.kindName.burnTest)).toHaveTextContent(S.dueOn(fmt(addDays(newDate, 10))));
    expect(
      screen.getByText(S.plannedCureEnd(fmt(addDays(newDate, 14))), { exact: false }),
    ).toBeInTheDocument();
    // The done milestone keeps the date it was marked.
    expect(milestoneRow("Burn A")).toHaveTextContent(S.stateDone(fmt(todayLocal())));
    const stored = await layer().curePlans.get(s.batch.id);
    expect(stored?.milestones.find((m) => m.label === "Burn A")?.doneOn).toBe(todayLocal());
  });

  it("removes the plan after a confirmation that counts the milestones", async () => {
    const s = await seedPlanned();
    render(<BatchDetail batchId={s.batch.id} />);
    fireEvent.click(await screen.findByRole("button", { name: S.removeCurePlan }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(S.removeBody(4))).toBeInTheDocument();
    // Keeping it deletes nothing.
    fireEvent.click(within(dialog).getByRole("button", { name: S.removeKeep }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await layer().curePlans.get(s.batch.id)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: S.removeCurePlan }));
    const again = await screen.findByRole("dialog");
    fireEvent.click(within(again).getByRole("button", { name: S.removeConfirm }));
    expect(await screen.findByText(S.curingEmpty)).toBeInTheDocument();
    expect(await layer().curePlans.get(s.batch.id)).toBeUndefined();
  });

  it("shows 'Cure plan saved' once from ?cureSaved=1 and cleans the URL", async () => {
    const s = await seedPlanned();
    nav.search = "cureSaved=1";
    render(<BatchDetail batchId={s.batch.id} />);
    expect(await screen.findByText(S.cureSavedNotice)).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/batches/${s.batch.id}`, { scroll: false }));
  });
});

describe("Delete batch dialog", () => {
  it("says the cure plan goes too and that the planned entry becomes open again", async () => {
    const s = await seedPlanned();
    const entry = await layer().productionPlans.create({
      planId: crypto.randomUUID(),
      versionId: s.version.id,
      plannedOn: daysFromToday(-12),
    });
    // Link the entry by making a second batch from it, then plan that batch.
    const { batch } = await layer().batches.create({
      batchId: crypto.randomUUID(),
      versionId: s.version.id,
      producedOn: daysFromToday(-3),
      entries: [],
      productionPlanId: entry.plan.id,
    });
    await layer().curePlans.save(batch.id, [
      { kind: "cureEnd", offsetDays: 14 },
      { kind: "burnTest", offsetDays: 7 },
    ]);

    render(<BatchDetail batchId={batch.id} />);
    fireEvent.click(await screen.findByRole("button", { name: B.deleteBatch }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(B.deleteCureNote(2))).toBeInTheDocument();
    expect(within(dialog).getByText(B.deletePlanNote)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: B.deleteConfirm }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/batches"));
    expect(await layer().curePlans.get(batch.id)).toBeUndefined();
    expect((await layer().productionPlans.get(entry.plan.id))?.plan.batchId).toBeNull();
  });

  it("adds nothing when the batch has no plan and no entry", async () => {
    const s = await seedBatch(daysFromToday(-1));
    render(<BatchDetail batchId={s.batch.id} />);
    fireEvent.click(await screen.findByRole("button", { name: B.deleteBatch }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: B.deleteConfirm });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(within(dialog).queryByText(/cure plan/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(B.deletePlanNote)).not.toBeInTheDocument();
  });
});
