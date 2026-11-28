import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CompareView } from "@/components/candlefix/compare";
import { MESSAGES } from "@/lib/messages";
import { clearDatabase, makeExperiment, makeSession, polyfillBrowser, seedWorld } from "./harness";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn(), bfcacheId: "t" }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));

const M = MESSAGES.candleFixCompare;

beforeEach(async () => {
  polyfillBrowser();
  await clearDatabase();
});
afterEach(cleanup);

describe("before-and-after view", () => {
  it("shows the original and the follow-up as columns, with version numbers and the hypothesis", async () => {
    const w = await seedWorld();
    await makeSession(w.original, "2026-11-15", "Original run");
    const s = await makeSession(w.followUp, "2026-11-25", "Follow run");
    await makeExperiment(w, { burnSessionIds: [s.id], change: "Less fragrance oil" });
    render(<CompareView investigationId={w.investigation.id} />);
    const table = await screen.findByTestId("before-after-table");
    const heads = within(table).getAllByTestId("before-after-column");
    expect(heads).toHaveLength(2);
    expect(heads[0].textContent).toContain(M.before);
    expect(heads[0].textContent).toContain("FIX-A");
    expect(heads[1].textContent).toContain(M.after);
    expect(heads[1].textContent).toContain("FIX-B");

    const row = (label: string) => within(table).getByRole("rowheader", { name: label }).closest("tr")!;
    expect(row(M.rowFormula).textContent).toContain(M.versionText(1));
    expect(row(M.rowFormula).textContent).toContain(M.versionText(2));
    expect(row(M.rowProducedOn).textContent).toContain("Nov 10, 2026");
    expect(row(M.rowProducedOn).textContent).toContain("Nov 20, 2026");
    expect(row(M.rowHypothesis).textContent).toContain("The wick is small for the tin.");
    expect(row(M.rowHypothesis).textContent).toContain(MESSAGES.candleFix.hypothesisStatus.open);
    expect(row(M.rowChange).textContent).toContain("Less fragrance oil");
    expect(row(M.rowIssues).textContent).toContain("Frosting, Tunneling");
    expect(row(M.rowIssues).textContent).toContain(M.noneRecorded);
    expect(row(M.rowBurnTests).textContent).toBe(`${M.rowBurnTests}11`);
    expect(row(M.rowTotalTime).textContent).toContain("7 h");
    expect(row(M.rowTotalLoss).textContent).toContain("11.50 g");
    expect(row(M.rowMeltPool).textContent).toContain("62 mm");
    expect(row(M.rowSoot).textContent).toContain(MESSAGES.burnCompare.sootLight);
    // No flame height was written down on either batch.
    expect(row(M.rowFlame).textContent).toContain(M.notRecorded);
  });

  it("says Not recorded for a follow-up without burn tests", async () => {
    const w = await seedWorld();
    await makeExperiment(w);
    render(<CompareView investigationId={w.investigation.id} />);
    const table = await screen.findByTestId("before-after-table");
    const row = (label: string) => within(table).getByRole("rowheader", { name: label }).closest("tr")!;
    expect(row(M.rowTotalTime).textContent).toContain(M.notRecorded);
    expect(row(M.rowAverageRate).textContent).toContain(M.notRecorded);
    expect(row(M.rowChange).textContent).toContain(M.noChange);
  });

  it("renders a stacked card per batch for phones next to the table, switched by responsive classes", async () => {
    const w = await seedWorld();
    await makeExperiment(w, { change: "Less fragrance oil" });
    render(<CompareView investigationId={w.investigation.id} />);
    const root = await screen.findByTestId("before-after");
    const cards = within(root).getAllByTestId("before-after-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].closest(".sm\\:hidden")).not.toBeNull();
    expect(root.querySelector("table")!.closest(".hidden.sm\\:block")).not.toBeNull();
    expect(cards[1].textContent).toContain(M.after);
    expect(cards[1].textContent).toContain("Less fragrance oil");
    expect(cards[1].textContent).toContain(M.versionText(2));
  });

  it("ranks no column: the page has no verdict or direction words", async () => {
    const w = await seedWorld();
    await makeExperiment(w);
    render(<CompareView investigationId={w.investigation.id} />);
    const root = await screen.findByTestId("before-after");
    expect(root.textContent).not.toMatch(/\b(better|worse|improved|best|good|bad|pass|fail)\b/i);
    expect(root.querySelector("svg")).toBeNull();
  });

  it("shows a short state linking back when there are no experiments", async () => {
    const w = await seedWorld();
    render(<CompareView investigationId={w.investigation.id} />);
    expect(await screen.findByText(M.noExperimentsTitle)).toBeTruthy();
    const links = screen.getAllByRole("link", { name: M.backToInvestigation });
    expect(links[0].getAttribute("href")).toBe(`/investigations/${w.investigation.id}`);
    expect(screen.queryByTestId("before-after-table")).toBeNull();
  });

  it("shows a not-found state for a missing investigation", async () => {
    render(<CompareView investigationId={crypto.randomUUID()} />);
    expect(await screen.findByText(M.notFoundTitle)).toBeTruthy();
  });
});
