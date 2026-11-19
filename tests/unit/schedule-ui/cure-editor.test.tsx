import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { formatProducedOn } from "@/components/batches";
import { CurePlanEditor } from "@/components/schedule";
import { DataError } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { addDays } from "@/lib/schedule";
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
const fmt = formatProducedOn;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.search = "";
  await clearDatabase();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const cureTime = () => screen.getByLabelText(S.cureTimeLabel) as HTMLInputElement;
const rows = () => screen.getAllByTestId("cure-row");
const offsetIn = (row: HTMLElement) => within(row).getByLabelText(S.offsetLabel) as HTMLInputElement;
const labelIn = (row: HTMLElement) =>
  (within(row).queryByLabelText(S.labelOptional) ??
    within(row).getByLabelText(S.labelRequired)) as HTMLInputElement;
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: S.cureSave }));

async function renderEditor(batchId: string) {
  render(<CurePlanEditor batchId={batchId} />);
  await screen.findByLabelText(S.cureTimeLabel);
}

describe("cure-plan editor: create", () => {
  it("saves a cure time, a burn test and another milestone, then goes back with a confirmation flag", async () => {
    const producedOn = daysFromToday(-3);
    const s = await seedBatch(producedOn);
    await renderEditor(s.batch.id);
    expect(screen.getByRole("heading", { level: 1, name: S.editorAddTitle })).toBeInTheDocument();

    type(cureTime(), "14");
    // The resulting date shows next to the field.
    expect(screen.getByText(S.plannedCureEnd(fmt(addDays(producedOn, 14))))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: S.addBurnTest }));
    type(offsetIn(rows()[0]), "7");
    expect(within(rows()[0]).getByText(S.dueOn(fmt(addDays(producedOn, 7))))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: S.addOther }));
    type(labelIn(rows()[1]), "  Wick check ");
    type(offsetIn(rows()[1]), "21");
    save();

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(`/batches/${s.batch.id}?cureSaved=1`),
    );
    const plan = await layer().curePlans.get(s.batch.id);
    expect(plan?.milestones.map((m) => [m.kind, m.label, m.offsetDays, m.doneOn])).toEqual(
      expect.arrayContaining([
        ["cureEnd", undefined, 14, null],
        ["burnTest", undefined, 7, null],
        ["check", "Wick check", 21, null],
      ]),
    );
    expect(plan?.milestones).toHaveLength(3);
  });

  it("allows a plan with only a burn test (no cure time)", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    fireEvent.click(screen.getByRole("button", { name: S.addBurnTest }));
    type(offsetIn(rows()[0]), "0");
    save();
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const plan = await layer().curePlans.get(s.batch.id);
    expect(plan?.milestones).toHaveLength(1);
    expect(plan?.milestones[0].offsetDays).toBe(0);
  });
});

describe("cure-plan editor: edit", () => {
  it("keeps milestone ids and done dates, and removes what the maker removed", async () => {
    const s = await seedBatch(daysFromToday(-5));
    const first = await layer().curePlans.save(s.batch.id, [
      { kind: "cureEnd", offsetDays: 14 },
      { kind: "burnTest", label: "Burn A", offsetDays: 7 },
      { kind: "check", label: "Wick check", offsetDays: 30 },
    ]);
    const burn = first.milestones.find((m) => m.label === "Burn A")!;
    const cure = first.milestones.find((m) => m.kind === "cureEnd")!;
    await layer().curePlans.setMilestoneDone(s.batch.id, burn.id, "2026-11-01");

    await renderEditor(s.batch.id);
    expect(screen.getByRole("heading", { level: 1, name: S.editorEditTitle })).toBeInTheDocument();
    expect(cureTime().value).toBe("14");
    expect(rows()).toHaveLength(2);
    expect(offsetIn(rows()[0]).value).toBe("7");
    expect(labelIn(rows()[0]).value).toBe("Burn A");

    type(offsetIn(rows()[0]), "8");
    type(cureTime(), "21");
    // Remove the other milestone.
    fireEvent.click(screen.getByRole("button", { name: S.removeRowFor(2) }));
    save();
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());

    const plan = await layer().curePlans.get(s.batch.id);
    expect(plan?.milestones).toHaveLength(2);
    const burnAfter = plan!.milestones.find((m) => m.id === burn.id)!;
    expect(burnAfter.offsetDays).toBe(8);
    expect(burnAfter.doneOn).toBe("2026-11-01");
    expect(plan!.milestones.find((m) => m.id === cure.id)?.offsetDays).toBe(21);
  });

  it("clearing the cure time removes the cure end", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await layer().curePlans.save(s.batch.id, [
      { kind: "cureEnd", offsetDays: 14 },
      { kind: "burnTest", offsetDays: 7 },
    ]);
    await renderEditor(s.batch.id);
    type(cureTime(), "");
    save();
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const plan = await layer().curePlans.get(s.batch.id);
    expect(plan?.milestones.map((m) => m.kind)).toEqual(["burnTest"]);
  });
});

describe("cure-plan editor: field errors", () => {
  it("cure time: -1, 366 and 1.5 are refused on blur", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    for (const [text, message] of [
      ["-1", S.errDaysRange],
      ["366", S.errDaysRange],
      ["1.5", S.errDaysWhole],
    ] as const) {
      type(cureTime(), text);
      fireEvent.blur(cureTime());
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(cureTime()).toHaveAttribute("aria-invalid", "true");
    }
    // A good value clears the message.
    type(cureTime(), "365");
    expect(screen.queryByText(S.errDaysWhole)).not.toBeInTheDocument();
    expect(cureTime()).not.toHaveAttribute("aria-invalid");
  });

  it("row days: -1, 366, 1.5 and empty are refused on blur", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    fireEvent.click(screen.getByRole("button", { name: S.addBurnTest }));
    const offset = () => offsetIn(rows()[0]);
    for (const [text, message] of [
      ["-1", S.errDaysRange],
      ["366", S.errDaysRange],
      ["1.5", S.errDaysWhole],
      ["", S.errDaysRequired],
    ] as const) {
      type(offset(), text);
      fireEvent.blur(offset());
      expect(await within(rows()[0]).findByText(message)).toBeInTheDocument();
    }
  });

  it("Other needs a label; labels over 60 characters are refused", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    fireEvent.click(screen.getByRole("button", { name: S.addOther }));
    fireEvent.blur(labelIn(rows()[0]));
    expect(await screen.findByText(S.errLabelRequired)).toBeInTheDocument();

    type(labelIn(rows()[0]), "x".repeat(61));
    fireEvent.blur(labelIn(rows()[0]));
    expect(await screen.findByText(S.errLabelTooLong)).toBeInTheDocument();

    type(labelIn(rows()[0]), "x".repeat(60));
    expect(screen.queryByText(S.errLabelTooLong)).not.toBeInTheDocument();

    // A burn test's label is optional, but still at most 60 characters.
    fireEvent.click(screen.getByRole("button", { name: S.addBurnTest }));
    type(labelIn(rows()[1]), "y".repeat(61));
    fireEvent.blur(labelIn(rows()[1]));
    expect(await within(rows()[1]).findByText(S.errLabelTooLong)).toBeInTheDocument();
  });

  it("Save with nothing entered shows the form-level error and saves nothing", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    save();
    expect(await screen.findByText(S.errPlanEmpty)).toBeInTheDocument();
    expect(cureTime()).toHaveFocus();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(await layer().curePlans.get(s.batch.id)).toBeUndefined();
  });

  it("Save marks every problem and focuses and scrolls to the first one", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    type(cureTime(), "2.5");
    fireEvent.click(screen.getByRole("button", { name: S.addOther }));
    save();
    expect(await screen.findByText(S.errDaysWhole)).toBeInTheDocument();
    expect(within(rows()[0]).getByText(S.errLabelRequired)).toBeInTheDocument();
    expect(within(rows()[0]).getByText(S.errDaysRequired)).toBeInTheDocument();
    await waitFor(() => expect(cureTime()).toHaveFocus());
    expect(scroll).toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("stops at 20 dates, counting the cure time", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    type(cureTime(), "14");
    for (let i = 0; i < 19; i++) {
      fireEvent.click(screen.getByRole("button", { name: S.addBurnTest }));
    }
    expect(rows()).toHaveLength(19);
    expect(screen.getByRole("button", { name: S.addBurnTest })).toBeDisabled();
    expect(screen.getByRole("button", { name: S.addOther })).toBeDisabled();
    expect(screen.getByText(S.limitReached(20))).toBeInTheDocument();
    // Removing one makes room again.
    fireEvent.click(screen.getByRole("button", { name: S.removeRowFor(19) }));
    expect(screen.getByRole("button", { name: S.addBurnTest })).toBeEnabled();
  });
});

describe("cure-plan editor: save feedback", () => {
  it("shows a busy label while saving, then goes back", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    type(cureTime(), "14");
    let release!: () => void;
    const real = layer().curePlans.save.bind(layer().curePlans);
    vi.spyOn(layer().curePlans, "save").mockImplementation(
      (...args) => new Promise((resolve) => (release = () => resolve(real(...args)))),
    );
    save();
    const busy = await screen.findByRole("button", { name: S.cureSaving });
    expect(busy).toHaveAttribute("aria-busy", "true");
    release();
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  });

  it("keeps the entries and says so when the save fails", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    type(cureTime(), "14");
    vi.spyOn(layer().curePlans, "save").mockRejectedValue(new DataError("storage", "no space"));
    save();
    expect(await screen.findByText(S.cureSaveFailed)).toBeInTheDocument();
    expect(cureTime().value).toBe("14");
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: S.cureSave })).toBeEnabled();
  });

  it("explains when the batch was deleted meanwhile", async () => {
    const s = await seedBatch(daysFromToday(-1));
    await renderEditor(s.batch.id);
    type(cureTime(), "14");
    await layer().batches.delete(s.batch.id);
    save();
    // Either the live page switches to "not found" or the save reports it.
    await waitFor(() =>
      expect(
        screen.queryByText(S.cureBatchGone) ?? screen.queryByText(MESSAGES.batches.notFoundTitle),
      ).not.toBeNull(),
    );
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows batch not found for an unknown batch", async () => {
    render(<CurePlanEditor batchId="missing" />);
    expect(await screen.findByText(MESSAGES.batches.notFoundTitle)).toBeInTheDocument();
  });
});
