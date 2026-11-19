import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BurnList } from "@/components/burn/list";
import { MESSAGES } from "@/lib/messages";
import { addPhoto, candle, clearDatabase, makeSession, polyfillBrowser, seedBatch } from "./compare-harness";

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: nav.push,
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
  nav.push.mockClear();
  await clearDatabase();
});
afterEach(cleanup);

describe("burn test list", () => {
  it("shows an empty state with a link to batches", async () => {
    render(<BurnList />);
    expect(await screen.findByText(M.listEmptyTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: M.listEmptyAction }).getAttribute("href")).toBe("/batches");
  });

  it("lists sessions newest first with batch, formula, version, candles, photos and a link", async () => {
    const batch = await seedBatch("Lavender run");
    const older = await makeSession(batch, { testedOn: "2026-11-12", label: "Older test" });
    const newer = await makeSession(batch, {
      testedOn: "2026-11-18",
      label: "Newer test",
      candles: [candle("A"), candle("B")],
    });
    await addPhoto(newer.id);
    render(<BurnList />);
    const rows = await screen.findAllByTestId("burn-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole("link", { name: "Newer test" }).getAttribute("href")).toBe(
      `/burn-tests/${newer.id}`,
    );
    expect(within(rows[1]).getByRole("link", { name: "Older test" }).getAttribute("href")).toBe(
      `/burn-tests/${older.id}`,
    );
    expect(rows[0].textContent).toContain("Lavender run");
    expect(rows[0].textContent).toContain(M.versionText(1));
    expect(rows[0].textContent).toContain(M.candleCount(2));
    expect(rows[0].textContent).toContain(M.photoCount(1));
    expect(rows[1].textContent).toContain(M.photoCount(0));
  });

  it("picks up to 4 with a live count, then disables the rest and compares in the chosen order", async () => {
    const batch = await seedBatch();
    const sessions = [];
    for (let i = 0; i < 5; i++) {
      sessions.push(await makeSession(batch, { testedOn: `2026-11-1${i}`, label: `Test ${i}` }));
    }
    render(<BurnList />);
    await screen.findAllByTestId("burn-row");
    const compare = screen.getByRole("button", { name: M.compareButton }) as HTMLButtonElement;
    expect(compare.disabled).toBe(true);
    expect(screen.getByText(M.selectedCount(0, 4))).toBeTruthy();
    const order = ["Test 1", "Test 4", "Test 0", "Test 3"];
    for (const name of order) fireEvent.click(screen.getByLabelText(M.selectLabel(name)));
    expect(screen.getByText(M.selectedCount(4, 4))).toBeTruthy();
    expect((screen.getByLabelText(M.selectLabel("Test 2")) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(M.selectionFull(4))).toBeTruthy();
    expect(compare.disabled).toBe(false);
    fireEvent.click(compare);
    const byLabel = new Map(sessions.map((s) => [s.label, s.id]));
    expect(nav.push).toHaveBeenCalledWith(
      `/burn-tests/compare?sessions=${order.map((n) => byLabel.get(n)).join(",")}`,
    );
    fireEvent.click(screen.getByLabelText(M.selectLabel("Test 1")));
    expect(screen.getByText(M.selectedCount(3, 4))).toBeTruthy();
    expect((screen.getByLabelText(M.selectLabel("Test 2")) as HTMLInputElement).disabled).toBe(false);
  });

  it("one session can be compared on its own, and Clear empties the selection", async () => {
    const batch = await seedBatch();
    const s = await makeSession(batch, { label: "Solo" });
    render(<BurnList />);
    fireEvent.click(await screen.findByLabelText(M.selectLabel("Solo")));
    fireEvent.click(screen.getByRole("button", { name: M.compareButton }));
    expect(nav.push).toHaveBeenCalledWith(`/burn-tests/compare?sessions=${s.id}`);
    fireEvent.click(screen.getByRole("button", { name: M.clearSelection }));
    await waitFor(() => expect(screen.getByText(M.selectedCount(0, 4))).toBeTruthy());
  });

  it("falls back to the date when a session has no label", async () => {
    const batch = await seedBatch();
    await makeSession(batch, { testedOn: "2026-11-18" });
    render(<BurnList />);
    expect(await screen.findByRole("link", { name: M.sessionFallbackTitle("Nov 18, 2026") })).toBeTruthy();
  });
});
