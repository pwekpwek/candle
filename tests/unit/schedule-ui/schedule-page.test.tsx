import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { formatProducedOn } from "@/components/batches";
import { ScheduleView } from "@/components/schedule";
import { BottomNav, SideNav } from "@/components/shell/nav";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { MESSAGES } from "@/lib/messages";
import {
  clearDatabase,
  daysFromToday,
  layer,
  makeBatch,
  polyfillBrowser,
  seedBatch,
  seedFormula,
} from "./harness";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "", path: "/" }));

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
  usePathname: () => nav.path,
}));

const S = MESSAGES.schedule;
const A = MESSAGES.app;
const fmt = formatProducedOn;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.path = "/";
  await clearDatabase();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const section = (title: string) => screen.getByRole("region", { name: title });

/**
 * One batch made 10 days ago with milestones that are overdue (7 d), due today
 * (10 d), upcoming (14 d) and done (3 d), plus planned production: one open and
 * overdue, one open and upcoming, one done.
 */
async function seedEverything() {
  const s = await seedBatch(daysFromToday(-10), "Run 1");
  const plan = await layer().curePlans.save(s.batch.id, [
    { kind: "burnTest", label: "Overdue test", offsetDays: 7 },
    { kind: "burnTest", label: "Today test", offsetDays: 10 },
    { kind: "cureEnd", offsetDays: 14 },
    { kind: "check", label: "Early check", offsetDays: 3 },
  ]);
  const early = plan.milestones.find((m) => m.label === "Early check")!;
  await layer().curePlans.setMilestoneDone(s.batch.id, early.id, daysFromToday(-5));

  const late = await layer().productionPlans.create({
    planId: crypto.randomUUID(),
    versionId: s.version.id,
    plannedOn: daysFromToday(-2),
    label: "Late run",
  });
  const soon = await layer().productionPlans.create({
    planId: crypto.randomUUID(),
    versionId: s.version.id,
    plannedOn: daysFromToday(6),
  });
  const done = await layer().productionPlans.create({
    planId: crypto.randomUUID(),
    versionId: s.version.id,
    plannedOn: daysFromToday(-9),
  });
  await makeBatch(s.version.id, daysFromToday(-8), "From entry", done.plan.id);
  return { ...s, plan, late: late.plan, soon: soon.plan, done: done.plan };
}

describe("Schedule page", () => {
  it("shows an empty state that says where cure plans and planned production come from", async () => {
    render(<ScheduleView />);
    expect(await screen.findByText(S.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(S.emptyDescription)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: S.emptyBatches })).toHaveAttribute("href", "/batches");
    expect(screen.getByRole("link", { name: S.emptyFormulas })).toHaveAttribute("href", "/");
  });

  it("groups into Overdue, Due today, Upcoming and Done", async () => {
    const s = await seedEverything();
    render(<ScheduleView />);
    await screen.findByRole("region", { name: S.groupOverdue });

    const overdue = within(section(S.groupOverdue)).getAllByTestId("schedule-row");
    // Oldest due date first: the 7-day test (3 days ago), then the late planned run (2 days ago).
    expect(overdue[0]).toHaveTextContent("Overdue test");
    expect(overdue[1]).toHaveTextContent(S.productionTitle);
    expect(overdue[1]).toHaveTextContent("Late run");
    expect(overdue[1]).toHaveTextContent(S.productionDate(fmt(daysFromToday(-2))));
    for (const row of overdue) expect(row).toHaveTextContent(S.stateOverdue);

    const due = within(section(S.groupDue)).getAllByTestId("schedule-row");
    expect(due).toHaveLength(1);
    expect(due[0]).toHaveTextContent("Today test");
    expect(due[0]).toHaveTextContent(S.dueOn(fmt(daysFromToday(0))));
    expect(due[0]).toHaveTextContent(S.stateDue);

    const upcoming = within(section(S.groupUpcoming)).getAllByTestId("schedule-row");
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0]).toHaveTextContent(S.kindName.cureEnd);
    expect(upcoming[1]).toHaveTextContent(S.productionTitle);

    const done = within(section(S.groupDone)).getAllByTestId("schedule-row");
    expect(done).toHaveLength(2);
    // Most recent first: the batch made from the entry (8 days ago), then the check marked 5 days ago... by doneOn.
    expect(done.map((r) => r.textContent).join("|")).toContain(S.stateDone(fmt(daysFromToday(-5))));
    expect(done.map((r) => r.textContent).join("|")).toContain(S.stateDone(fmt(daysFromToday(-8))));
    expect(done[0]).toHaveTextContent(S.stateDone(fmt(daysFromToday(-5))));

    // Links: milestones to the batch, entries to the entry page.
    expect(within(overdue[0]).getByRole("link", { name: "Run 1" })).toHaveAttribute(
      "href",
      `/batches/${s.batch.id}`,
    );
    expect(within(overdue[1]).getByRole("link", { name: S.productionTitle })).toHaveAttribute(
      "href",
      `/schedule/plan/${s.late.id}`,
    );
    // Source formula and version are shown.
    expect(overdue[0]).toHaveTextContent(S.versionOf("Lavender Vanilla Cedar", 1));
    // Planned production has no mark-done button; milestones do.
    expect(within(overdue[1]).queryByRole("button")).not.toBeInTheDocument();
    expect(within(overdue[0]).getByRole("button", { name: S.markDoneFor("Overdue test") })).toBeInTheDocument();
  });

  it("marks done and not done from the page, moving the row between sections", async () => {
    await seedEverything();
    render(<ScheduleView />);
    await screen.findByRole("region", { name: S.groupOverdue });

    fireEvent.click(screen.getByRole("button", { name: S.markDoneFor("Overdue test") }));
    await waitFor(() =>
      expect(within(section(S.groupDone)).getByText("Overdue test")).toBeInTheDocument(),
    );
    expect(within(section(S.groupOverdue)).queryByText("Overdue test")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: S.markNotDoneFor("Overdue test") }));
    await waitFor(() =>
      expect(within(section(S.groupOverdue)).getByText("Overdue test")).toBeInTheDocument(),
    );
  });

  it("lists at most 20 done items", async () => {
    const a = await seedBatch(daysFromToday(-30), "Big");
    const planA = await layer().curePlans.save(
      a.batch.id,
      Array.from({ length: 20 }, (_, i) => ({ kind: "check" as const, label: `c${i}`, offsetDays: i })),
    );
    for (const m of planA.milestones) {
      await layer().curePlans.setMilestoneDone(a.batch.id, m.id, daysFromToday(-10));
    }
    const b = await makeBatch(a.version.id, daysFromToday(-30), "Small");
    const planB = await layer().curePlans.save(b.id, [
      { kind: "check", label: "x1", offsetDays: 1 },
      { kind: "check", label: "x2", offsetDays: 2 },
    ]);
    for (const m of planB.milestones) {
      await layer().curePlans.setMilestoneDone(b.id, m.id, daysFromToday(-1));
    }
    render(<ScheduleView />);
    const done = await screen.findByRole("region", { name: S.groupDone });
    expect(within(done).getAllByTestId("schedule-row")).toHaveLength(20);
    expect(within(done).getByText(S.doneLimited(20))).toBeInTheDocument();
    // The most recent ones are kept.
    expect(within(done).getByText("x1")).toBeInTheDocument();
    expect(within(done).getByText("x2")).toBeInTheDocument();
  });

  it("shows an error with Try again when the read fails", async () => {
    vi.spyOn(layer().schedule, "read").mockRejectedValueOnce(new Error("boom"));
    render(<ScheduleView />);
    expect(await screen.findByText(S.loadFailedTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: S.tryAgain }));
    expect(await screen.findByText(S.emptyTitle)).toBeInTheDocument();
  });

  it("never claims anything about the candle", async () => {
    await seedEverything();
    render(<ScheduleView />);
    await screen.findByRole("region", { name: S.groupOverdue });
    expect(document.body.textContent).not.toMatch(/safe|ready|finished|compliant|cured\b/i);
  });
});

describe("Schedule in the navigation", () => {
  it("is the third destination, after Batches", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/batches", "/schedule", "/materials", "/backup"]);
  });

  it("with nothing due: plain name, no badge", async () => {
    await seedBatch(daysFromToday(-1));
    render(
      <>
        <SideNav />
        <BottomNav />
      </>,
    );
    const links = await screen.findAllByRole("link", { name: A.navSchedule });
    expect(links).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("nav-attention-badge")).not.toBeInTheDocument();
    expect(links[0]).toHaveAttribute("href", "/schedule");
  });

  it("shows the count of overdue and due items, in the visible badge and the link name", async () => {
    const s = await seedBatch(daysFromToday(-10));
    await layer().curePlans.save(s.batch.id, [
      { kind: "burnTest", offsetDays: 7 }, // overdue
      { kind: "burnTest", offsetDays: 10 }, // due today
      { kind: "cureEnd", offsetDays: 14 }, // upcoming: not counted
    ]);
    render(
      <>
        <SideNav />
        <BottomNav />
      </>,
    );
    const links = await screen.findAllByRole("link", { name: A.navScheduleCount(2) });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(within(link).getByTestId("nav-attention-badge")).toHaveTextContent("2");
    }
    // The other items keep their plain names.
    expect(screen.getAllByRole("link", { name: "Batches" })).toHaveLength(2);
  });

  it("updates live when an item is marked done, and hides the badge at 0", async () => {
    const s = await seedBatch(daysFromToday(-10));
    const plan = await layer().curePlans.save(s.batch.id, [{ kind: "burnTest", offsetDays: 7 }]);
    render(<SideNav />);
    await screen.findByRole("link", { name: A.navScheduleCount(1) });
    await layer().curePlans.setMilestoneDone(s.batch.id, plan.milestones[0].id, daysFromToday(0));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: A.navSchedule })).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("nav-attention-badge")).not.toBeInTheDocument();
  });

  it("counts an overdue planned production entry", async () => {
    const s = await seedFormula();
    await layer().productionPlans.create({
      planId: crypto.randomUUID(),
      versionId: s.version.id,
      plannedOn: daysFromToday(-1),
    });
    render(<SideNav />);
    expect(await screen.findByRole("link", { name: A.navScheduleCount(1) })).toBeInTheDocument();
  });

  it("marks Schedule current on /schedule and the planned production pages", async () => {
    nav.path = "/schedule/plan/abc";
    render(<SideNav />);
    const link = await screen.findByRole("link", { name: A.navSchedule });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("the bottom bar has five equal columns", async () => {
    render(<BottomNav />);
    const list = (await screen.findAllByRole("link")).map((l) => l.closest("ul")!)[0];
    expect(list.className).toContain("grid-cols-5");
    expect(within(list).getAllByRole("link")).toHaveLength(5);
  });
});
