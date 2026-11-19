import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CompareView, parseSessionIds } from "@/components/burn/compare";
import { MESSAGES } from "@/lib/messages";
import { candle, clearDatabase, makeSession, polyfillBrowser, seedBatch } from "./compare-harness";

const csv = vi.hoisted(() => ({ download: vi.fn() }));

vi.mock("@/components/burn/export/csv", () => ({ downloadBurnCsv: csv.download }));

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
  usePathname: () => "/burn-tests/compare",
}));

const M = MESSAGES.burnCompare;

beforeEach(async () => {
  polyfillBrowser();
  csv.download.mockReset();
  await clearDatabase();
});
afterEach(cleanup);

describe("parseSessionIds", () => {
  it("trims, drops blanks and repeats, and keeps the first 4", () => {
    expect(parseSessionIds(" a, b,,a ,c")).toEqual({ ids: ["a", "b", "c"], truncated: false });
    expect(parseSessionIds("a,b,c,d,e,f")).toEqual({ ids: ["a", "b", "c", "d"], truncated: true });
    expect(parseSessionIds(null)).toEqual({ ids: [], truncated: false });
  });
});

describe("comparison page", () => {
  it("shows one session's candles side by side, with the maker's own conclusion", async () => {
    const batch = await seedBatch("Lavender run");
    const s = await makeSession(batch, {
      label: "Wick trial",
      candles: [candle("A"), candle("B", { wick: { text: "HTP-93" } })],
      conclusion: "CD-10 gave a full pool by hour 3.",
    });
    render(<CompareView sessionsParam={s.id} />);
    const table = await screen.findByTestId("compare-table");
    expect(within(table).getByRole("columnheader", { name: "A" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "B" })).toBeTruthy();
    // Group header names the session, batch, formula and version.
    const group = within(table).getAllByRole("columnheader").find((h) => h.getAttribute("scope") === "colgroup")!;
    expect(group.getAttribute("colspan")).toBe("2");
    expect(group.textContent).toContain("Wick trial");
    expect(group.textContent).toContain("Lavender run");
    expect(group.textContent).toContain(M.versionText(1));
    // Metric rows by label, with formatted values.
    const row = (label: string) => within(table).getByRole("rowheader", { name: label }).closest("tr")!;
    expect(row(M.rowWick).textContent).toContain("CD-10");
    expect(row(M.rowWick).textContent).toContain("HTP-93");
    expect(row(M.rowTotalLoss).textContent).toContain("11.50 g");
    expect(row(M.rowTotalTime).textContent).toContain("7 h");
    expect(row(M.rowSoot).textContent).toContain(M.sootLight);
    // The conclusion is labelled as the maker's own words.
    const concl = row(M.makerConclusion);
    expect(concl.textContent).toContain("CD-10 gave a full pool by hour 3.");
    // The scroll region is named and focusable; the table has a visible caption.
    expect(screen.getByRole("region", { name: M.tableCaption })).toBeTruthy();
    expect(table.querySelector("caption")?.textContent).toBe(M.tableCaption);
  });

  it("compares sessions across batches in the order given, with actions", async () => {
    const b1 = await seedBatch("First batch");
    const b2 = await seedBatch("Second batch");
    const s1 = await makeSession(b1, { label: "One", conclusion: "One own words" });
    const s2 = await makeSession(b2, { label: "Two", conclusion: undefined });
    render(<CompareView sessionsParam={`${s2.id},${s1.id}`} />);
    const table = await screen.findByTestId("compare-table");
    const groups = within(table).getAllByRole("columnheader").filter((h) => h.getAttribute("scope") === "colgroup");
    expect(groups.map((g) => g.textContent)).toEqual([
      expect.stringContaining("Two"),
      expect.stringContaining("One"),
    ]);
    expect(within(table).getByText(M.noConclusion, { selector: "span" })).toBeTruthy();
    expect(screen.getByRole("link", { name: M.actionReport }).getAttribute("href")).toBe(
      `/burn-tests/compare/report?sessions=${s2.id},${s1.id}`,
    );
    expect(screen.getByRole("link", { name: M.actionChangeSelection }).getAttribute("href")).toBe("/burn-tests");
    fireEvent.click(screen.getByRole("button", { name: M.actionDownloadCsv }));
    expect(csv.download).toHaveBeenCalledTimes(1);
    expect(csv.download.mock.calls[0][0].map((i: { session: { id: string } }) => i.session.id)).toEqual([
      s2.id,
      s1.id,
    ]);
  });

  it("says which ids were not found, and uses only the first 4", async () => {
    const batch = await seedBatch();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await makeSession(batch, { label: `T${i}` })).id);
    render(<CompareView sessionsParam={`${ids[0]},nope-id,${ids[1]},${ids[2]},${ids[3]},${ids[4]}`} />);
    expect(await screen.findByText(M.compareTruncated(4))).toBeTruthy();
    expect(screen.getByText(M.compareSomeMissing(["nope-id"]))).toBeTruthy();
    const table = screen.getByTestId("compare-table");
    const groups = within(table).getAllByRole("columnheader").filter((h) => h.getAttribute("scope") === "colgroup");
    expect(groups).toHaveLength(3);
  });

  it("shows a not-found state when no id matches, and an empty state without ids", async () => {
    const { unmount } = render(<CompareView sessionsParam="missing" />);
    expect(await screen.findByText(M.compareNotFoundTitle)).toBeTruthy();
    unmount();
    render(<CompareView sessionsParam={null} />);
    expect(await screen.findByText(M.compareNoneTitle)).toBeTruthy();
  });

  it("shows an error with Try again when the data cannot be read", async () => {
    const batch = await seedBatch();
    const s = await makeSession(batch);
    const { getDataLayer } = await import("@/lib/db");
    const spy = vi.spyOn(getDataLayer().burnSessions, "get").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<CompareView sessionsParam={s.id} />);
    expect(await screen.findByText(M.compareLoadFailedTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: M.tryAgain }));
    expect(await screen.findByTestId("compare-table")).toBeTruthy();
    spy.mockRestore();
  });
});
