import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ReportView } from "@/components/burn/report";
import { MESSAGES } from "@/lib/messages";
import { addPhoto, candle, clearDatabase, makeSession, polyfillBrowser, seedBatch } from "./compare-harness";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    bfcacheId: "t",
  }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/burn-tests",
}));

const M = MESSAGES.burnCompare;

beforeEach(async () => {
  polyfillBrowser();
  await clearDatabase();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("report for one burn test", () => {
  it("shows details, burns, totals, throw notes, the maker's conclusion, notes, photos and the disclaimer", async () => {
    const batch = await seedBatch("Lavender run");
    const s = await makeSession(batch, {
      label: "Wick trial",
      candles: [candle("A", { hotThrow: "Strong at 30 min" }), candle("B", { burns: [] })],
      conclusion: "CD-10 gave a full pool by hour 3.",
      notes: "Room was 21 degrees.",
    });
    await addPhoto(s.id, "Flame at hour 2");
    render(<ReportView sessionId={s.id} />);
    await screen.findByTestId("report");
    expect(screen.getByText(M.reportObservationsNote)).toBeTruthy();
    expect(screen.getByText(/^Generated /)).toBeTruthy();
    const section = screen.getByTestId("report-session");
    expect(within(section).getByRole("heading", { level: 2, name: "Wick trial" })).toBeTruthy();
    expect(section.textContent).toContain("Lavender run");
    // Burns table for candle A: two rows, loss and rate computed.
    const table = within(section).getByRole("table", { name: M.reportBurnsCaption("A") });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain("4 h");
    expect(rows[1].textContent).toContain("250.00 g");
    expect(rows[1].textContent).toContain("238.50 g");
    expect(rows[1].textContent).toContain("11.50 g");
    expect(rows[1].textContent).toContain("2.88 g/h");
    expect(section.textContent).toContain(M.reportNoBurns);
    expect(section.textContent).toContain("Strong at 30 min");
    expect(section.textContent).toContain(M.reportTotals);
    expect(within(section).getByRole("heading", { name: M.makerConclusion })).toBeTruthy();
    expect(section.textContent).toContain("CD-10 gave a full pool by hour 3.");
    expect(section.textContent).toContain("Room was 21 degrees.");
    expect(await within(section).findByAltText("Flame at hour 2")).toBeTruthy();
  });

  it("has Print and Back controls that are hidden in print, and Print calls window.print", async () => {
    const batch = await seedBatch();
    const s = await makeSession(batch);
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<ReportView sessionId={s.id} />);
    const actions = await screen.findByTestId("report-actions");
    expect(actions.className).toContain("print:hidden");
    fireEvent.click(within(actions).getByRole("button", { name: M.reportPrint }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(within(actions).getByRole("link", { name: M.reportBack }).getAttribute("href")).toBe(
      `/burn-tests/${s.id}`,
    );
    vi.unstubAllGlobals();
  });

  it("shows not-found for an unknown session", async () => {
    render(<ReportView sessionId="nope" />);
    expect(await screen.findByText(M.reportNotFoundTitle)).toBeTruthy();
  });

  it("shows an error with Try again when the data cannot be read", async () => {
    const { getDataLayer } = await import("@/lib/db");
    vi.spyOn(getDataLayer().burnSessions, "get").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ReportView sessionId="x" />);
    expect(await screen.findByText(M.reportLoadFailedTitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: M.tryAgain })).toBeTruthy();
  });
});

describe("report for a comparison", () => {
  it("adds the comparison table and one section per session", async () => {
    const b1 = await seedBatch("First");
    const b2 = await seedBatch("Second");
    const s1 = await makeSession(b1, { label: "One" });
    const s2 = await makeSession(b2, { label: "Two", conclusion: "Two's own words" });
    render(<ReportView sessionsParam={`${s1.id},${s2.id},missing`} />);
    await screen.findByTestId("report");
    expect(screen.getByTestId("compare-table")).toBeTruthy();
    const sections = screen.getAllByTestId("report-session");
    expect(sections).toHaveLength(2);
    expect(sections[0].textContent).toContain(M.reportSessionHeading(1, 2));
    expect(sections[1].textContent).toContain("Two's own words");
    expect(screen.getByText(M.compareSomeMissing(["missing"]))).toBeTruthy();
    expect(screen.getByRole("link", { name: M.reportBack }).getAttribute("href")).toBe(
      `/burn-tests/compare?sessions=${s1.id},${s2.id},missing`,
    );
  });
});
