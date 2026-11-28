import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { InvestigationEditor } from "@/components/candlefix/investigation";
import { MESSAGES } from "@/lib/messages";
import { localToday } from "@/components/batches/text";
import { clearAll, layer, polyfillBrowser, seedBatches, seedInvestigation } from "./investigation-harness";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));

const M = MESSAGES.candleFix;
const CHECKS = MESSAGES.candleFixChecks;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  await clearAll();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const save = () => fireEvent.click(screen.getByRole("button", { name: /^Save/ }));

describe("investigation editor: new", () => {
  it("saves an investigation with issues, a ticked thing to check with a note, and a hypothesis", async () => {
    const s = await seedBatches();
    render(<InvestigationEditor mode="new" batchId={s.original.id} />);
    const date = await screen.findByLabelText(M.dateLabel);
    expect(date).toHaveValue(localToday());

    fireEvent.change(date, { target: { value: "2026-11-14" } });
    fireEvent.change(screen.getByLabelText(M.titleLabel), { target: { value: "  Rough top  " } });
    fireEvent.click(screen.getByRole("checkbox", { name: M.issueLabels.frosting }));
    fireEvent.click(screen.getByRole("checkbox", { name: M.issueLabels.other }));
    fireEvent.change(screen.getByLabelText(M.otherLabel), { target: { value: "Pitting" } });
    fireEvent.change(screen.getByLabelText(M.notesLabel), { target: { value: "Seen on day 2" } });

    // Things to check for the chosen issue.
    expect(screen.getByRole("group", { name: M.checkGroup("Frosting") })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("check-item-frosting.pour-temperature"));
    const noteLabel = CHECKS.frosting["pour-temperature"];
    fireEvent.change(screen.getByLabelText(M.checkNoteLabel(noteLabel)), { target: { value: "58 C" } });

    fireEvent.click(screen.getByRole("button", { name: M.addHypothesis }));
    const card = screen.getByTestId("hypothesis-card");
    expect(within(card).getByRole("heading", { name: M.hypothesisHeading(1) })).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText(`${M.hypothesisHeading(1)}: ${M.hypothesisTextLabel}`), {
      target: { value: "The container was cold." },
    });
    fireEvent.change(within(card).getByLabelText(`${M.hypothesisHeading(1)}: ${M.hypothesisStatusLabel}`), {
      target: { value: "testing" },
    });

    save();
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const list = await layer().investigations.listByBatch(s.original.id);
    expect(list).toHaveLength(1);
    const inv = list[0].investigation;
    expect(nav.replace).toHaveBeenCalledWith(`/investigations/${inv.id}?saved=1`);
    expect(inv).toMatchObject({
      observedOn: "2026-11-14",
      title: "Rough top",
      issues: ["frosting", "other"],
      otherIssue: "Pitting",
      notes: "Seen on day 2",
    });
    expect(inv.checks).toEqual([
      { itemId: "frosting.pour-temperature", issue: "frosting", label: noteLabel, checked: true, note: "58 C" },
    ]);
    expect(inv.hypotheses).toHaveLength(1);
    expect(inv.hypotheses[0]).toMatchObject({ text: "The container was cold.", status: "testing" });
  });

  it("shows the Other text field only while Other is chosen and requires it", async () => {
    const s = await seedBatches();
    render(<InvestigationEditor mode="new" batchId={s.original.id} />);
    await screen.findByLabelText(M.dateLabel);
    expect(screen.queryByLabelText(M.otherLabel)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: M.issueLabels.other }));
    const other = screen.getByLabelText(M.otherLabel);
    fireEvent.blur(other);
    expect(await screen.findByText(M.errOtherRequired)).toBeInTheDocument();
    expect(other).toHaveAttribute("aria-invalid", "true");
    expect(other.getAttribute("aria-describedby")).toBeTruthy();
    // The error clears on the next valid change.
    fireEvent.change(other, { target: { value: "Pitting" } });
    await waitFor(() => expect(screen.queryByText(M.errOtherRequired)).toBeNull());
  });

  it("moves focus to the first invalid field and writes nothing", async () => {
    const s = await seedBatches();
    render(<InvestigationEditor mode="new" batchId={s.original.id} />);
    const date = await screen.findByLabelText(M.dateLabel);
    fireEvent.change(date, { target: { value: "2026-11-01" } }); // before the batch was produced
    save();
    expect(await screen.findByText(M.errDateBeforeProduced("Nov 10, 2026"))).toBeInTheDocument();
    expect(screen.getByText(M.errIssuesRequired)).toBeInTheDocument();
    await waitFor(() => expect(date).toHaveFocus());

    // With the date right, the first issue checkbox takes the focus.
    fireEvent.change(date, { target: { value: "2026-11-12" } });
    save();
    const first = screen.getByRole("checkbox", { name: M.issueLabels.frosting });
    await waitFor(() => expect(first).toHaveFocus());
    expect(first).toHaveAttribute("aria-invalid", "true");
    expect(await layer().investigations.listByBatch(s.original.id)).toHaveLength(0);
  });

  it("does not submit twice while saving", async () => {
    const s = await seedBatches();
    const create = vi.spyOn(layer().investigations, "create");
    render(<InvestigationEditor mode="new" batchId={s.original.id} />);
    await screen.findByLabelText(M.dateLabel);
    fireEvent.change(screen.getByLabelText(M.dateLabel), { target: { value: "2026-11-14" } });
    fireEvent.click(screen.getByRole("checkbox", { name: M.issueLabels.frosting }));
    const button = screen.getByRole("button", { name: /^Save/ });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable error when the save fails, and keeps the form", async () => {
    const s = await seedBatches();
    const create = vi.spyOn(layer().investigations, "create").mockRejectedValueOnce(new Error("boom"));
    render(<InvestigationEditor mode="new" batchId={s.original.id} />);
    await screen.findByLabelText(M.dateLabel);
    fireEvent.click(screen.getByRole("checkbox", { name: M.issueLabels.frosting }));
    save();
    expect(await screen.findByText(M.saveFailed)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: M.issueLabels.frosting })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: M.retry }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(2);
    // Same id both times: a retried create writes once.
    expect(create.mock.calls[0][0].investigationId).toBe(create.mock.calls[1][0].investigationId);
    expect(await layer().investigations.listByBatch(s.original.id)).toHaveLength(1);
  });

  it("says so when the batch is missing", async () => {
    await seedBatches();
    render(<InvestigationEditor mode="new" batchId="nope" />);
    expect(await screen.findByRole("heading", { name: M.batchMissingTitle })).toBeInTheDocument();
  });
});

describe("investigation editor: edit", () => {
  it("keeps hypothesis ids and ticks from issues no longer chosen", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id, {
      issues: ["frosting", "soot"],
      checks: [
        { itemId: "frosting.cure-time", issue: "frosting", label: "Old wording", checked: true },
        { itemId: "soot.wick-size", issue: "soot", label: "Wick size then", checked: true, note: "CD-10" },
      ],
      hypotheses: [{ text: "Cold container", status: "open" }, { text: "Fast cooling", status: "testing" }],
    });
    render(<InvestigationEditor mode="edit" investigationId={inv.id} />);
    await screen.findByLabelText(M.dateLabel);
    // The stored tick keeps the label it was ticked with.
    expect(screen.getByRole("checkbox", { name: "Old wording" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: M.issueLabels.soot })); // soot no longer chosen
    const kept = screen.getByTestId("no-longer-listed");
    expect(within(kept).getByRole("heading", { name: M.noLongerListedHeading })).toBeInTheDocument();
    expect(within(kept).getByText("Wick size then")).toBeInTheDocument();
    expect(within(kept).getByText("CD-10")).toBeInTheDocument();

    const cards = screen.getAllByTestId("hypothesis-card");
    fireEvent.change(within(cards[0]).getByLabelText(`${M.hypothesisHeading(1)}: ${M.hypothesisTextLabel}`), {
      target: { value: "Cold container, 12 C room" },
    });
    save();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/investigations/${inv.id}?saved=1`));

    const after = (await layer().investigations.get(inv.id))!.investigation;
    expect(after.issues).toEqual(["frosting"]);
    expect(after.hypotheses.map((h) => h.id)).toEqual(inv.hypotheses.map((h) => h.id));
    expect(after.hypotheses[0].text).toBe("Cold container, 12 C room");
    expect(after.checks.map((c) => c.itemId).sort()).toEqual(["frosting.cure-time", "soot.wick-size"]);
    expect(after.checks.find((c) => c.itemId === "soot.wick-size")).toMatchObject({
      label: "Wick size then",
      checked: true,
      note: "CD-10",
    });
    expect(after.checks.find((c) => c.itemId === "frosting.cure-time")!.label).toBe("Old wording");
  });

  it("refuses to remove a hypothesis a corrective experiment follows, names it and keeps the form", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id, {
      hypotheses: [{ text: "Cold container", status: "open" }, { text: "Fast cooling", status: "open" }],
    });
    await layer().correctiveExperiments.create({
      experimentId: crypto.randomUUID(),
      investigationId: inv.id,
      hypothesisId: inv.hypotheses[0].id,
      followUpBatchId: s.followUp.id,
      burnSessionIds: [],
    });
    render(<InvestigationEditor mode="edit" investigationId={inv.id} />);
    await screen.findByLabelText(M.dateLabel);
    fireEvent.change(screen.getByLabelText(M.titleLabel), { target: { value: "New title" } });
    fireEvent.click(screen.getByRole("button", { name: M.removeHypothesisFor(1) }));
    expect(screen.getAllByTestId("hypothesis-card")).toHaveLength(1);

    save();
    expect(await screen.findByText(M.errHypothesisInUse(1, "Cold container"))).toBeInTheDocument();
    // The hypothesis is back, in its place, and the typed title is still there.
    const cards = screen.getAllByTestId("hypothesis-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByLabelText(`${M.hypothesisHeading(1)}: ${M.hypothesisTextLabel}`)).toHaveValue("Cold container");
    expect(screen.getByLabelText(M.titleLabel)).toHaveValue("New title");
    expect(nav.replace).not.toHaveBeenCalled();
    const stored = (await layer().investigations.get(inv.id))!.investigation;
    expect(stored.title).toBe("Rough top");
    expect(stored.hypotheses).toHaveLength(2);
  });

  it("removes a hypothesis nothing follows", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id, {
      hypotheses: [{ text: "Cold container", status: "open" }, { text: "Fast cooling", status: "open" }],
    });
    render(<InvestigationEditor mode="edit" investigationId={inv.id} />);
    await screen.findByLabelText(M.dateLabel);
    fireEvent.click(screen.getByRole("button", { name: M.removeHypothesisFor(1) }));
    save();
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const stored = (await layer().investigations.get(inv.id))!.investigation;
    expect(stored.hypotheses.map((h) => h.text)).toEqual(["Fast cooling"]);
    expect(stored.hypotheses[0].id).toBe(inv.hypotheses[1].id);
  });

  it("says so when the investigation is missing", async () => {
    await seedBatches();
    render(<InvestigationEditor mode="edit" investigationId="nope" />);
    expect(await screen.findByRole("heading", { name: M.notFoundTitle })).toBeInTheDocument();
  });
});
