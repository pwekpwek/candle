import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SessionEditor } from "@/components/burn/session";
import { DataError } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { addDays, todayLocal } from "@/lib/schedule";
import { clearAll, daysFromToday, layer, polyfillBrowser, seedBatch, seedSession } from "./session-harness";

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

const M = MESSAGES.burn;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.search = "";
  await clearAll();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const blur = (label: string | RegExp) => fireEvent.blur(screen.getByLabelText(label));

async function openNew(batchId: string) {
  render(<SessionEditor mode="new" batchId={batchId} />);
  return screen.findByLabelText(M.dateLabel);
}

const BURN1 = (field: string) => `Candle 1, burn 1: ${field}`;

describe("new burn test", () => {
  it("starts with today, Candle 1 and a note about photos", async () => {
    const s = await seedBatch(daysFromToday(-5), "Run 1");
    await openNew(s.batch.id);
    expect(screen.getByLabelText(M.dateLabel)).toHaveValue(todayLocal());
    expect(screen.getByLabelText("Candle 1: " + M.candleLabelLabel)).toHaveValue("Candle 1");
    expect(screen.getByText(M.photosAfterSave)).toBeInTheDocument();
    expect(screen.getByText(/^For Run 1, produced /)).toBeInTheDocument();
  });

  it("saves a session: wick from the library, a burn in grams, then goes to the session page", async () => {
    const s = await seedBatch(daysFromToday(-5), "Run 1");
    await openNew(s.batch.id);
    type(M.labelLabel, "Round 1");
    type("Candle 1: " + M.wickLabel, s.lib.wickId);
    fireEvent.click(screen.getByRole("button", { name: M.addBurn }));
    type(BURN1(M.durationLabel), "120");
    type(BURN1(M.weightBeforeLabel), "200.50");
    type(BURN1(M.weightAfterLabel), "197.25");
    type(BURN1(M.meltDiameterLabel), "55");
    type(BURN1(M.sootLabel), "light");
    type("Candle 1: " + M.coldThrowLabel, "Soft vanilla");
    type(M.conclusionLabel, "Even melt pool.");
    fireEvent.click(screen.getByRole("button", { name: M.save }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const list = await layer().burnSessions.listByBatch(s.batch.id);
    expect(list).toHaveLength(1);
    const { session } = list[0];
    expect(nav.replace).toHaveBeenCalledWith(`/burn-tests/${session.id}?saved=1`);
    expect(session).toMatchObject({
      label: "Round 1",
      testedOn: todayLocal(),
      milestoneId: null,
      conclusion: "Even melt pool.",
    });
    expect(session.candles[0]).toMatchObject({
      label: "Candle 1",
      wick: { materialId: s.lib.wickId, name: "Wick A" },
      coldThrow: "Soft vanilla",
    });
    expect(session.candles[0].burns[0]).toMatchObject({
      durationMin: 120,
      weightBeforeMg: 200500,
      weightAfterMg: 197250,
      meltPoolDiameterMm: 55,
      soot: "light",
    });
  });

  it("shows field errors on blur, then on Save focuses the first one and writes nothing", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await openNew(s.batch.id);
    type(M.dateLabel, addDays(todayLocal(), 2));
    blur(M.dateLabel);
    expect(await screen.findByText(M.errDateFuture)).toBeInTheDocument();
    expect(screen.getByLabelText(M.dateLabel)).toHaveAttribute("aria-invalid", "true");

    type(M.dateLabel, addDays(s.batch.producedOn, -1));
    blur(M.dateLabel);
    expect(await screen.findByText(/cannot be before the batch was produced/)).toBeInTheDocument();

    type(M.dateLabel, todayLocal());
    fireEvent.click(screen.getByRole("button", { name: M.addBurn }));
    type(BURN1(M.weightBeforeLabel), "100");
    type(BURN1(M.weightAfterLabel), "101");
    blur(BURN1(M.weightAfterLabel));
    expect(await screen.findByText(M.errWeightAfterAbove)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: M.save }));
    // The wick is not chosen and the duration is empty. The first invalid field in the page takes focus.
    await waitFor(() => expect(screen.getByLabelText("Candle 1: " + M.wickLabel)).toHaveFocus());
    expect(screen.getByText(M.errWickRequired)).toBeInTheDocument();
    expect(screen.getByText(M.errDurationRequired)).toBeInTheDocument();
    expect(await layer().burnSessions.list()).toHaveLength(0);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("without library wicks the wick is typed text", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await layer().materials.setArchived(s.lib.wickId, true);
    await openNew(s.batch.id);
    type("Candle 1: " + M.wickTextLabel, "ECO 8");
    fireEvent.click(screen.getByRole("button", { name: M.save }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const [{ session }] = await layer().burnSessions.listByBatch(s.batch.id);
    expect(session.candles[0].wick).toEqual({ materialId: null, name: "ECO 8" });
  });

  it("archived wicks are not offered for a new candle", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await layer().materials.setArchived(s.lib.wickId, true);
    await openNew(s.batch.id);
    const select = screen.getByLabelText("Candle 1: " + M.wickLabel);
    expect(within(select).queryByRole("option", { name: "Wick A" })).not.toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: M.wickArchived("Wick A") })).not.toBeInTheDocument();
  });

  it("adds and removes candles and burns within the limits", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await openNew(s.batch.id);
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByRole("button", { name: M.addCandle }));
    expect(screen.getAllByTestId("candle-editor")).toHaveLength(8);
    expect(screen.getByRole("button", { name: M.addCandle })).toBeDisabled();
    expect(screen.getByLabelText("Candle 8: " + M.candleLabelLabel)).toHaveValue("Candle 8");
    fireEvent.click(screen.getByRole("button", { name: M.removeCandleFor(8) }));
    expect(screen.getAllByTestId("candle-editor")).toHaveLength(7);

    fireEvent.click(screen.getAllByRole("button", { name: M.addBurn })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: M.addBurn })[0]);
    expect(screen.getAllByTestId("burn-editor")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: M.removeBurnFor(1, 1) }));
    expect(screen.getAllByTestId("burn-editor")).toHaveLength(1);
  });

  it("the only candle cannot be removed", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await openNew(s.batch.id);
    expect(screen.queryByRole("button", { name: M.removeCandleFor(1) })).not.toBeInTheDocument();
  });

  it("number fields have numeric keyboards", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await openNew(s.batch.id);
    fireEvent.click(screen.getByRole("button", { name: M.addBurn }));
    expect(screen.getByLabelText(BURN1(M.durationLabel))).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText(BURN1(M.weightBeforeLabel))).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText(BURN1(M.flameLabel))).toHaveAttribute("inputmode", "numeric");
  });

  it("a failed save keeps the form and offers Try again, which reuses the same session id", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await openNew(s.batch.id);
    type("Candle 1: " + M.wickLabel, s.lib.wickId);
    const spy = vi.spyOn(layer().burnSessions, "create");
    spy.mockRejectedValueOnce(new DataError("storage", "boom"));
    fireEvent.click(screen.getByRole("button", { name: M.save }));
    expect(await screen.findByText(M.saveFailed)).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: M.retry }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0].sessionId).toBe(spy.mock.calls[0][0].sessionId);
    expect(await layer().burnSessions.list()).toHaveLength(1);
  });

  it("says so when the device is out of space", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await openNew(s.batch.id);
    type("Candle 1: " + M.wickLabel, s.lib.wickId);
    vi.spyOn(layer().burnSessions, "create").mockRejectedValueOnce(new DataError("storage-full", "full"));
    fireEvent.click(screen.getByRole("button", { name: M.save }));
    expect(await screen.findByText(M.saveStorageFull)).toBeInTheDocument();
  });

  it("a missing batch shows a not found page", async () => {
    render(<SessionEditor mode="new" batchId="nope" />);
    expect(await screen.findByRole("heading", { name: M.batchMissingTitle })).toBeInTheDocument();
  });
});

describe("planned burn test link", () => {
  async function seedPlanned() {
    const s = await seedBatch(daysFromToday(-10), "Run 1");
    const plan = await layer().curePlans.save(s.batch.id, [
      { kind: "burnTest", label: "Week one", offsetDays: 5 },
      { kind: "burnTest", label: "Week two", offsetDays: 8 },
    ]);
    const [one, two] = plan.milestones;
    return { ...s, one, two };
  }

  it("offers the planned tests with their due dates; saving marks the planned test done", async () => {
    const s = await seedPlanned();
    await openNew(s.batch.id);
    const select = screen.getByLabelText(M.plannedLabel);
    expect(within(select).getAllByRole("option")).toHaveLength(3);
    expect(within(select).getByRole("option", { name: /Week one, due / })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: s.one.id } });
    type("Candle 1: " + M.wickLabel, s.lib.wickId);
    fireEvent.click(screen.getByRole("button", { name: M.save }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const plan = await layer().curePlans.get(s.batch.id);
    expect(plan?.milestones.find((m) => m.id === s.one.id)?.doneOn).toBe(todayLocal());
  });

  it("marks a planned test linked to another session as taken and disabled", async () => {
    const s = await seedPlanned();
    await seedSession(s.batch.id, todayLocal(), { milestoneId: s.one.id });
    await openNew(s.batch.id);
    const taken = screen.getByRole("option", { name: /Week one, due .*linked to another burn test/ });
    expect(taken).toBeDisabled();
    expect(screen.getByRole("option", { name: /Week two, due / })).not.toBeDisabled();
  });

  it("says so when the batch has none", async () => {
    const s = await seedBatch(daysFromToday(-5));
    await openNew(s.batch.id);
    expect(screen.getByText(M.plannedNoOptions)).toBeInTheDocument();
  });
});

describe("edit burn test", () => {
  it("loads the stored values and keeps candle and burn ids on save", async () => {
    const s = await seedBatch(daysFromToday(-5), "Run 1");
    const stored = await seedSession(s.batch.id, daysFromToday(-1), { label: "Round 1", conclusion: "Mine" });
    render(<SessionEditor mode="edit" sessionId={stored.id} />);
    expect(await screen.findByLabelText(M.dateLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(M.dateLabel)).toHaveValue(daysFromToday(-1));
    expect(screen.getByLabelText(M.labelLabel)).toHaveValue("Round 1");
    expect(screen.getByLabelText("Candle 1: " + M.wickTextLabel)).toHaveValue("CD-10");
    expect(screen.getByLabelText(BURN1(M.weightBeforeLabel))).toHaveValue("200");
    expect(screen.getByLabelText(BURN1(M.weightAfterLabel))).toHaveValue("197");
    expect(screen.queryByText(M.photosAfterSave)).not.toBeInTheDocument();

    type(BURN1(M.durationLabel), "130");
    fireEvent.click(screen.getByRole("button", { name: M.saveChanges }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/burn-tests/${stored.id}?saved=1`));
    const after = (await layer().burnSessions.get(stored.id))!.session;
    expect(after.candles[0].id).toBe(stored.candles[0].id);
    expect(after.candles[0].burns.map((b) => b.id)).toEqual(stored.candles[0].burns.map((b) => b.id));
    expect(after.candles[0].burns[0].durationMin).toBe(130);
    expect(after.conclusion).toBe("Mine");
  });

  it("keeps an archived wick selected, and still offers no other archived wick", async () => {
    const s = await seedBatch(daysFromToday(-5));
    const stored = await seedSession(s.batch.id, todayLocal(), {
      candles: [{ label: "A", wick: { materialId: s.lib.wickId }, burns: [] }],
    });
    await layer().materials.setArchived(s.lib.wickId, true);
    render(<SessionEditor mode="edit" sessionId={stored.id} />);
    const select = (await screen.findByLabelText("Candle 1: " + M.wickLabel)) as HTMLSelectElement;
    expect(select.value).toBe(s.lib.wickId);
    expect(within(select).getByRole("option", { name: M.wickArchived("Wick A") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: M.saveChanges }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const after = (await layer().burnSessions.get(stored.id))!.session;
    expect(after.candles[0].wick).toEqual({ materialId: s.lib.wickId, name: "Wick A" });
  });

  it("a link that no longer resolves shows as not linked, and saving stores no link", async () => {
    const s = await seedBatch(daysFromToday(-10));
    const plan = await layer().curePlans.save(s.batch.id, [{ kind: "burnTest", offsetDays: 5 }]);
    const stored = await seedSession(s.batch.id, todayLocal(), { milestoneId: plan.milestones[0].id });
    // The restore case: the cure plan is gone but the session still names its milestone.
    const { openDatabase } = await import("@/lib/db");
    const db = openDatabase();
    await db.curePlans.clear();
    db.close();
    render(<SessionEditor mode="edit" sessionId={stored.id} />);
    const select = await screen.findByLabelText(M.plannedLabel);
    expect(select).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: M.saveChanges }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect((await layer().burnSessions.get(stored.id))!.session.milestoneId).toBeNull();
  });

  it("a session that is gone shows a not found page", async () => {
    render(<SessionEditor mode="edit" sessionId="nope" />);
    expect(await screen.findByRole("heading", { name: M.notFoundTitle })).toBeInTheDocument();
  });
});

describe("wording", () => {
  it("never gives a verdict", () => {
    const words = /\b(safe|passed?|failed?|cured|ready|good|bad|best|recommended|approved)\b/i;
    const texts: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") texts.push(value);
      else if (typeof value === "function") texts.push(String((value as (...a: unknown[]) => unknown)(3, 2, 1, 1)));
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(MESSAGES.burn);
    expect(texts.filter((t) => words.test(t))).toEqual([]);
  });
});
