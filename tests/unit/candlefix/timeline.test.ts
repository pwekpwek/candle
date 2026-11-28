import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/lib/candlefix";
import type { InvestigationComparisonData } from "@/lib/db/contract";
import {
  batchFixture,
  burn,
  candle,
  comparisonBatch,
  deepFreeze,
  experiment,
  hypothesis,
  investigation,
  session,
} from "./fixtures";

const utcDate = (iso: string) => iso.slice(0, 10);

function base() {
  const orig = batchFixture({ label: "Orig", producedOn: "2026-11-01" });
  const h = hypothesis({ text: "An idea", createdAt: "2026-11-06T22:30:00.000Z" });
  const inv = investigation(orig.batch.id, { observedOn: "2026-11-05", title: "Frosty top", hypotheses: [h] });
  const fu = batchFixture({ producedOn: "2026-11-12" }, 2);
  const origSession = session(orig.batch.id, [candle([burn()])], { testedOn: "2026-11-10", label: "First burn" });
  const fuSession = session(fu.batch.id, [candle([burn()])], { testedOn: "2026-11-20" });
  const exp = experiment(inv.id, h.id, fu.batch.id);
  const data: InvestigationComparisonData = {
    investigation: inv,
    original: comparisonBatch(orig, [origSession], [inv]),
    experiments: [{ experiment: exp, followUp: comparisonBatch(fu, [fuSession], []) }],
  };
  return { data, orig, h, inv, fu, origSession, fuSession };
}

describe("buildTimeline", () => {
  it("lists every kind of event, sorted by date", () => {
    const { data, orig, h, inv, fu, origSession, fuSession } = base();
    const events = buildTimeline(data, utcDate);
    expect(events.map((e) => [e.date, e.kind, e.refId, e.text, e.batchId])).toEqual([
      ["2026-11-01", "batchMade", orig.batch.id, "Orig", orig.batch.id],
      ["2026-11-05", "issueObserved", inv.id, "Frosty top", orig.batch.id],
      ["2026-11-06", "hypothesisAdded", h.id, "An idea", orig.batch.id],
      ["2026-11-10", "burnTest", origSession.id, "First burn", orig.batch.id],
      ["2026-11-12", "followUpMade", fu.batch.id, null, fu.batch.id],
      ["2026-11-20", "burnTest", fuSession.id, null, fu.batch.id],
    ]);
    expect(events.map((e) => e.key)).toEqual([
      `batchMade:${orig.batch.id}`,
      `issueObserved:${inv.id}`,
      `hypothesisAdded:${h.id}`,
      `burnTest:${origSession.id}`,
      `followUpMade:${fu.batch.id}`,
      `burnTest:${fuSession.id}`,
    ]);
  });

  it("uses the localDate callback for hypotheses only", () => {
    const { data, h } = base();
    const seen: string[] = [];
    const events = buildTimeline(data, (iso) => {
      seen.push(iso);
      return "2026-12-31";
    });
    expect(seen).toEqual([h.createdAt]);
    expect(events.find((e) => e.kind === "hypothesisAdded")!.date).toBe("2026-12-31");
    expect(events.at(-1)!.kind).toBe("hypothesisAdded");
  });

  it("orders same-day events by kind, then by key", () => {
    const orig = batchFixture({ producedOn: "2026-11-05" });
    const h = hypothesis({ createdAt: "2026-11-05T10:00:00.000Z" });
    const invA = investigation(orig.batch.id, { id: "aaaaaaaa-0000-4000-8000-000000000000", observedOn: "2026-11-05", hypotheses: [h] });
    const invB = investigation(orig.batch.id, { id: "bbbbbbbb-0000-4000-8000-000000000000", observedOn: "2026-11-05" });
    const fu = batchFixture({ producedOn: "2026-11-05" });
    const s1 = session(orig.batch.id, [candle()], { id: "22222222-0000-4000-8000-000000000000", testedOn: "2026-11-05" });
    const s2 = session(orig.batch.id, [candle()], { id: "11111111-0000-4000-8000-000000000000", testedOn: "2026-11-05" });
    const data: InvestigationComparisonData = {
      investigation: invA,
      // Investigations and sessions given in reverse order on purpose.
      original: comparisonBatch(orig, [s1, s2], [invB, invA]),
      experiments: [{ experiment: experiment(invA.id, h.id, fu.batch.id), followUp: comparisonBatch(fu) }],
    };
    const events = buildTimeline(data, utcDate);
    expect(events.map((e) => e.kind)).toEqual([
      "batchMade",
      "issueObserved",
      "issueObserved",
      "hypothesisAdded",
      "followUpMade",
      "burnTest",
      "burnTest",
    ]);
    expect(events[1]!.refId).toBe(invA.id);
    expect(events[2]!.refId).toBe(invB.id);
    expect(events[5]!.refId).toBe(s2.id);
    expect(events[6]!.refId).toBe(s1.id);
  });

  it("dedupes a follow-up batch shared by two experiments", () => {
    const { data, inv, h, fu } = base();
    const second = experiment(inv.id, h.id, fu.batch.id);
    const shared = data.experiments[0]!.followUp;
    const events = buildTimeline(
      { ...data, experiments: [...data.experiments, { experiment: second, followUp: shared }] },
      utcDate,
    );
    expect(events.filter((e) => e.kind === "followUpMade")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "burnTest")).toHaveLength(2);
    expect(new Set(events.map((e) => e.key)).size).toBe(events.length);
  });

  it("dedupes an investigation that appears on both the original and a follow-up batch", () => {
    const { data, inv } = base();
    const shared = data.experiments[0]!;
    const events = buildTimeline(
      {
        ...data,
        experiments: [{ ...shared, followUp: { ...shared.followUp, investigations: [inv] } }],
      },
      utcDate,
    );
    expect(events.filter((e) => e.kind === "issueObserved")).toHaveLength(1);
  });

  it("includes investigations recorded on follow-up batches, with their own batch id", () => {
    const { data, fu } = base();
    const other = investigation(fu.batch.id, { observedOn: "2026-11-15", title: "On the follow-up" });
    const shared = data.experiments[0]!;
    const events = buildTimeline(
      { ...data, experiments: [{ ...shared, followUp: { ...shared.followUp, investigations: [other] } }] },
      utcDate,
    );
    const e = events.find((x) => x.refId === other.id)!;
    expect(e.kind).toBe("issueObserved");
    expect(e.batchId).toBe(fu.batch.id);
    expect(e.text).toBe("On the follow-up");
  });

  it("gives null text when there is no label or title, and a bare original gives one event", () => {
    const orig = batchFixture();
    const inv = investigation(orig.batch.id);
    const events = buildTimeline(
      { investigation: inv, original: comparisonBatch(orig, [], []), experiments: [] },
      utcDate,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("batchMade");
    expect(events[0]!.text).toBeNull();
  });

  it("does not mutate its input", () => {
    const { data } = base();
    expect(() => buildTimeline(deepFreeze(structuredClone(data)), utcDate)).not.toThrow();
  });
});
