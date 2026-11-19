import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BatchDetail } from "@/components/batches";
import { BurnTestsSection, SessionView } from "@/components/burn/session";
import { MESSAGES } from "@/lib/messages";
import { todayLocal } from "@/lib/schedule";
import { clearAll, daysFromToday, layer, polyfillBrowser, seedBatch, seedSession } from "./session-harness";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "" }));
const csv = vi.hoisted(() => ({ download: vi.fn() }));

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
vi.mock("@/components/burn/export/csv", () => ({ downloadBurnCsv: csv.download }));

const M = MESSAGES.burn;
const B = MESSAGES.batches;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.search = "";
  csv.download.mockReset();
  await clearAll();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("session page", () => {
  it("shows the session, burns with figures, totals, throw notes and the maker's conclusion", async () => {
    const s = await seedBatch(daysFromToday(-5), "Run 1");
    const session = await seedSession(s.batch.id, daysFromToday(-1), {
      label: "Round 1",
      conclusion: "Even melt pool all the way.",
      notes: "Room was cool.",
    });
    render(<SessionView sessionId={session.id} />);
    expect(await screen.findByRole("heading", { name: "Round 1", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run 1" })).toHaveAttribute("href", `/batches/${s.batch.id}`);

    const candle = screen.getByTestId("candle-section");
    expect(within(candle).getByText(M.wickLine("CD-10"))).toBeInTheDocument();
    const rows = within(candle).getAllByTestId("burn-row");
    expect(rows).toHaveLength(2);
    // 200.00 g before, 197.00 g after over 120 min: 3.00 g lost, 1.50 g/h.
    expect(within(rows[0]).getByText("2 h")).toBeInTheDocument();
    expect(within(rows[0]).getByText("200.00 g")).toBeInTheDocument();
    expect(within(rows[0]).getByText("3.00 g")).toBeInTheDocument();
    expect(within(rows[0]).getByText("1.50 g/h")).toBeInTheDocument();
    expect(within(rows[0]).getByText("55 mm wide")).toBeInTheDocument();
    expect(within(rows[0]).getByText(M.soot.light)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Flame flickered")).toBeInTheDocument();
    expect(within(candle).getByText(M.totalBurns(2))).toBeInTheDocument();
    expect(within(candle).getByText(M.totalTime("3 h 30 min"))).toBeInTheDocument();
    expect(within(candle).getByText(M.totalLoss("3.00 g"))).toBeInTheDocument();
    expect(within(candle).getByText(M.sootSeen("light"))).toBeInTheDocument();
    expect(within(candle).getByText("Soft vanilla")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: M.conclusionHeading })).toBeInTheDocument();
    expect(screen.getByText("Even melt pool all the way.")).toBeInTheDocument();
    expect(screen.getByText("Room was cool.")).toBeInTheDocument();
    // Photos live in their own section.
    expect(await screen.findByRole("heading", { name: MESSAGES.burnPhotos.heading })).toBeInTheDocument();
  });

  it("burns table scrolls in its own region, not the page", async () => {
    const s = await seedBatch(daysFromToday(-5));
    const session = await seedSession(s.batch.id, todayLocal());
    render(<SessionView sessionId={session.id} />);
    const region = await screen.findByRole("region", { name: /Candle 1/ });
    expect(region.className).toContain("overflow-x-auto");
  });

  it("links Edit and Report, and downloads the CSV", async () => {
    const s = await seedBatch(daysFromToday(-5));
    const session = await seedSession(s.batch.id, todayLocal());
    render(<SessionView sessionId={session.id} />);
    expect(await screen.findByRole("link", { name: M.edit })).toHaveAttribute(
      "href",
      `/burn-tests/${session.id}/edit`,
    );
    expect(screen.getByRole("link", { name: M.report })).toHaveAttribute(
      "href",
      `/burn-tests/${session.id}/report`,
    );
    fireEvent.click(screen.getByRole("button", { name: M.downloadCsv }));
    expect(csv.download).toHaveBeenCalledTimes(1);
    const [items] = csv.download.mock.calls[0];
    expect(items).toHaveLength(1);
    expect(items[0].session.id).toBe(session.id);
  });

  it("tells the maker when the CSV could not be made", async () => {
    const s = await seedBatch(daysFromToday(-5));
    const session = await seedSession(s.batch.id, todayLocal());
    csv.download.mockImplementation(() => {
      throw new Error("nope");
    });
    render(<SessionView sessionId={session.id} />);
    fireEvent.click(await screen.findByRole("button", { name: M.downloadCsv }));
    expect(await screen.findByText(M.csvFailed)).toBeInTheDocument();
  });

  it("shows the saved notice once and clears the address", async () => {
    const s = await seedBatch(daysFromToday(-5));
    const session = await seedSession(s.batch.id, todayLocal());
    nav.search = "saved=1";
    render(<SessionView sessionId={session.id} />);
    expect(await screen.findByText(M.savedNotice)).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/burn-tests/${session.id}`));
  });

  it("shows the planned test and whether it is marked done", async () => {
    const s = await seedBatch(daysFromToday(-10));
    const plan = await layer().curePlans.save(s.batch.id, [
      { kind: "burnTest", label: "Week one", offsetDays: 5 },
    ]);
    const session = await seedSession(s.batch.id, todayLocal(), { milestoneId: plan.milestones[0].id });
    render(<SessionView sessionId={session.id} />);
    expect(await screen.findByRole("heading", { name: M.plannedHeading })).toBeInTheDocument();
    expect(screen.getByText(/^Week one, due /)).toBeInTheDocument();
    expect(screen.getByText(/^Marked done on /)).toBeInTheDocument();
  });

  it("deleting asks first, counts the photos, then goes to the batch page", async () => {
    const s = await seedBatch(daysFromToday(-5));
    const session = await seedSession(s.batch.id, todayLocal());
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    await layer().burnPhotos.add({
      photoId: crypto.randomUUID(),
      sessionId: session.id,
      bytes: jpeg,
      width: 10,
      height: 10,
    });
    render(<SessionView sessionId={session.id} />);
    fireEvent.click(await screen.findByRole("button", { name: M.delete }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(M.deletePhotos(1))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: M.deleteKeep }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await layer().burnSessions.get(session.id)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: M.delete }));
    const again = await screen.findByRole("dialog");
    await within(again).findByText(M.deletePhotos(1));
    fireEvent.click(within(again).getByRole("button", { name: M.deleteConfirm }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/batches/${s.batch.id}`));
    expect(await layer().burnSessions.get(session.id)).toBeUndefined();
    expect(await layer().burnPhotos.listBySession(session.id)).toHaveLength(0);
  });

  it("a missing session shows a not found page", async () => {
    render(<SessionView sessionId="nope" />);
    expect(await screen.findByRole("heading", { name: M.notFoundTitle })).toBeInTheDocument();
  });
});

describe("batch page: Burn tests section", () => {
  it("empty: explains and offers Record burn test and Compare burn tests", async () => {
    const s = await seedBatch(daysFromToday(-5));
    render(<BurnTestsSection batchId={s.batch.id} />);
    expect(await screen.findByText(M.sectionEmpty)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: M.recordButton })).toHaveAttribute(
      "href",
      `/burn-tests/new?batch=${s.batch.id}`,
    );
    expect(screen.getByRole("link", { name: M.compareAll })).toHaveAttribute("href", "/burn-tests");
    expect(screen.queryByRole("link", { name: /Compare latest/ })).not.toBeInTheDocument();
  });

  it("lists sessions newest first with candles and photos, each linking to its page", async () => {
    const s = await seedBatch(daysFromToday(-10), "Run 1");
    const older = await seedSession(s.batch.id, daysFromToday(-3), { label: "Older" });
    const newer = await seedSession(s.batch.id, daysFromToday(-1));
    render(<BurnTestsSection batchId={s.batch.id} />);
    const rows = await screen.findAllByTestId("burn-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", `/burn-tests/${newer.id}`);
    expect(rows[1]).toHaveAttribute("href", `/burn-tests/${older.id}`);
    expect(within(rows[1]).getByText("Older")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/1 candle/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/0 photos/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: M.compareLatest(2) })).toHaveAttribute(
      "href",
      `/burn-tests/compare?sessions=${newer.id},${older.id}`,
    );
  });

  it("compares at most the latest 4", async () => {
    const s = await seedBatch(daysFromToday(-10));
    const ids: string[] = [];
    for (let i = 5; i >= 1; i--) ids.push((await seedSession(s.batch.id, daysFromToday(-i))).id);
    render(<BurnTestsSection batchId={s.batch.id} />);
    const link = await screen.findByRole("link", { name: M.compareLatest(4) });
    expect(link).toHaveAttribute("href", `/burn-tests/compare?sessions=${ids.slice().reverse().slice(0, 4).join(",")}`);
  });

  it("names the planned test a session is linked to", async () => {
    const s = await seedBatch(daysFromToday(-10));
    const plan = await layer().curePlans.save(s.batch.id, [
      { kind: "burnTest", label: "Week one", offsetDays: 5 },
    ]);
    await seedSession(s.batch.id, todayLocal(), { milestoneId: plan.milestones[0].id });
    render(<BurnTestsSection batchId={s.batch.id} />);
    expect(await screen.findByText(new RegExp(M.rowPlanned("Week one")))).toBeInTheDocument();
  });

  it("appears on the batch page below Curing", async () => {
    const s = await seedBatch(daysFromToday(-5), "Run 1");
    render(<BatchDetail batchId={s.batch.id} />);
    const burn = await screen.findByRole("heading", { name: M.sectionHeading });
    const curing = screen.getByRole("heading", { name: MESSAGES.schedule.curingHeading });
    expect(curing.compareDocumentPosition(burn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("batch delete with burn tests", () => {
  it("explains the refusal and offers no Delete", async () => {
    const s = await seedBatch(daysFromToday(-5), "Run 1");
    await seedSession(s.batch.id, todayLocal());
    await seedSession(s.batch.id, daysFromToday(-1));
    render(<BatchDetail batchId={s.batch.id} />);
    fireEvent.click(await screen.findByRole("button", { name: B.deleteBatch }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(M.batchDeleteBlocked(2))).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: B.deleteConfirm })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: B.deleteKeep }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await layer().batches.get(s.batch.id)).toBeDefined();
  });

  it("without burn tests the batch is still deleted as before", async () => {
    const s = await seedBatch(daysFromToday(-5), "Run 1");
    render(<BatchDetail batchId={s.batch.id} />);
    fireEvent.click(await screen.findByRole("button", { name: B.deleteBatch }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: B.deleteConfirm })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole("button", { name: B.deleteConfirm }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/batches"));
  });

  it("handles an in-use refusal from delete: says so and takes Delete away", async () => {
    const s = await seedBatch(daysFromToday(-5), "Run 1");
    render(<BatchDetail batchId={s.batch.id} />);
    fireEvent.click(await screen.findByRole("button", { name: B.deleteBatch }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: B.deleteConfirm })).toBeEnabled());
    // A burn test is recorded elsewhere after the dialog opened.
    await seedSession(s.batch.id, todayLocal());
    fireEvent.click(within(dialog).getByRole("button", { name: B.deleteConfirm }));
    expect(await within(dialog).findByText(M.batchDeleteInUse)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: B.deleteConfirm })).not.toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalledWith("/batches");
    expect(await layer().batches.get(s.batch.id)).toBeDefined();
  });
});
