import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ExperimentsSection } from "@/components/candlefix/experiments";
import { openDatabase } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { clearDatabase, makeExperiment, makeSession, polyfillBrowser, seedWorld } from "./harness";

const X = MESSAGES.candleFixExperiments;

beforeEach(async () => {
  polyfillBrowser();
  await clearDatabase();
});
afterEach(cleanup);

describe("ExperimentsSection", () => {
  it("shows an empty state and no compare link when there are no experiments", async () => {
    const w = await seedWorld();
    render(<ExperimentsSection investigationId={w.investigation.id} />);
    expect(await screen.findByText(X.emptyTitle)).toBeTruthy();
    expect(screen.getByRole("heading", { name: X.heading })).toBeTruthy();
    expect(screen.queryByRole("link", { name: X.compareLink })).toBeNull();
    expect(screen.queryAllByTestId("experiment-card")).toHaveLength(0);
  });

  it("lists a card per experiment with the hypothesis, batch, version, change, notes and burn tests", async () => {
    const w = await seedWorld();
    const s = await makeSession(w.followUp, "2026-11-25", "Wick trial");
    const e = await makeExperiment(w, { burnSessionIds: [s.id], change: "Less fragrance oil", notes: "Poured cooler" });
    render(<ExperimentsSection investigationId={w.investigation.id} />);
    const card = await screen.findByTestId("experiment-card");
    expect(card.textContent).toContain(`${MESSAGES.candleFix.hypothesisLabel}: The wick is small for the tin.`);
    expect(card.textContent).toContain(MESSAGES.candleFix.hypothesisStatus.open);
    expect(within(card).getByRole("link", { name: "FIX-B" }).getAttribute("href")).toBe(`/batches/${w.followUp.id}`);
    expect(within(card).getByRole("link", { name: X.versionText(2) }).getAttribute("href")).toBe(
      `/formulas/${w.second.formula.id}/versions/${w.second.version.id}`,
    );
    expect(card.textContent).toContain("Less fragrance oil");
    expect(card.textContent).toContain("Poured cooler");
    expect(within(card).getByRole("link", { name: "Wick trial" }).getAttribute("href")).toBe(`/burn-tests/${s.id}`);
    expect(within(card).getByRole("link", { name: X.editLabel("FIX-B") }).getAttribute("href")).toBe(
      `/investigations/${w.investigation.id}/experiments/${e.id}`,
    );
    expect(screen.getByRole("link", { name: X.compareLink }).getAttribute("href")).toBe(
      `/investigations/${w.investigation.id}/compare`,
    );
  });

  it("says when the hypothesis is no longer in the investigation", async () => {
    const w = await seedWorld();
    await makeExperiment(w);
    // Damaged data, as a restore could bring in: the hypothesis is gone.
    const db = openDatabase();
    await db.investigations.update(w.investigation.id, { hypotheses: [] });
    db.close();
    render(<ExperimentsSection investigationId={w.investigation.id} />);
    const card = await screen.findByTestId("experiment-card");
    expect(card.textContent).toContain(X.hypothesisGone);
  });

  it("shows the timeline as an ordered list of dated events, oldest first", async () => {
    const w = await seedWorld();
    const s = await makeSession(w.followUp, "2026-11-25");
    await makeExperiment(w, { burnSessionIds: [s.id] });
    render(<ExperimentsSection investigationId={w.investigation.id} />);
    const timeline = await screen.findByTestId("timeline");
    expect(timeline.tagName).toBe("OL");
    const events = within(timeline).getAllByTestId("timeline-event");
    const dates = events.map((li) => li.querySelector("time")!.getAttribute("datetime"));
    expect(dates).toEqual([...dates].sort());
    const texts = events.map((li) => li.textContent ?? "");
    for (const label of [X.eventBatchMade, X.eventIssueObserved, X.eventHypothesisAdded, X.eventFollowUpMade, X.eventBurnTest]) {
      expect(texts.some((t) => t.includes(label)), label).toBe(true);
    }
    expect(dates[0]).toBe("2026-11-10");
  });
});
