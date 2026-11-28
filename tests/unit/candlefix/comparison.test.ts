import { describe, expect, it } from "vitest";
import { batchBurnSummary, buildBeforeAfter } from "@/lib/candlefix";
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
  sessionItem,
} from "./fixtures";

function summaryOf(sessions: ReturnType<typeof session>[]) {
  const fx = batchFixture();
  return batchBurnSummary(sessions.map((s) => sessionItem(fx, s)));
}

describe("batchBurnSummary", () => {
  it("gives zero counts and nulls for no burn tests", () => {
    expect(batchBurnSummary([])).toEqual({
      sessionCount: 0,
      candleCount: 0,
      burnCount: 0,
      totalMinutes: 0,
      weighedMinutes: 0,
      totalLossMg: null,
      averageMgPerHour: null,
      largestMeltPoolDiameterMm: null,
      maxFlameHeightMm: null,
      sootLevels: [],
    });
  });

  it("counts unweighed burns but gives no loss or rate", () => {
    const s = session(batchFixture().batch.id, [
      candle([burn({ durationMin: 30 }), burn({ durationMin: 45, weightBeforeMg: 5000 })]),
    ]);
    const r = summaryOf([s]);
    expect(r.sessionCount).toBe(1);
    expect(r.candleCount).toBe(1);
    expect(r.burnCount).toBe(2);
    expect(r.totalMinutes).toBe(75);
    expect(r.weighedMinutes).toBe(0);
    expect(r.totalLossMg).toBeNull();
    expect(r.averageMgPerHour).toBeNull();
  });

  it("rounds the hourly rate half up: 1001 mg over 8 min", () => {
    // 1001 * 60 / 8 = 7507.5 exactly, so half up gives 7508 (truncating would give 7507)
    const s = session("b", [candle([burn({ durationMin: 8, weightBeforeMg: 20000, weightAfterMg: 18999 })])]);
    expect(summaryOf([s]).averageMgPerHour).toBe(7508);
  });

  it("rounds a smaller remainder down and a larger one up", () => {
    const one = (minutes: number) =>
      summaryOf([session("b", [candle([burn({ durationMin: minutes, weightBeforeMg: 100, weightAfterMg: 99 })])])])
        .averageMgPerHour;
    expect(one(11)).toBe(5); // 60 / 11 = 5.45
    expect(one(7)).toBe(9); // 60 / 7 = 8.57
  });

  it("uses only weighed minutes for the rate when burns are mixed", () => {
    const s = session("b", [
      candle([
        burn({ durationMin: 8, weightBeforeMg: 10000, weightAfterMg: 8999 }), // 1001 mg
        burn({ durationMin: 500 }), // unweighed: counts in totalMinutes only
      ]),
    ]);
    const r = summaryOf([s]);
    expect(r.totalMinutes).toBe(508);
    expect(r.weighedMinutes).toBe(8);
    expect(r.totalLossMg).toBe(1001);
    expect(r.averageMgPerHour).toBe(7508);
  });

  it("adds candles and sessions together before dividing", () => {
    const s1 = session("b", [
      candle([burn({ durationMin: 60, weightBeforeMg: 5000, weightAfterMg: 4000 })]),
      candle([burn({ durationMin: 30, weightBeforeMg: 5000, weightAfterMg: 4800 })]),
    ]);
    const s2 = session("b", [candle([burn({ durationMin: 90, weightBeforeMg: 3000, weightAfterMg: 2700 })])]);
    const r = summaryOf([s1, s2]);
    expect(r.sessionCount).toBe(2);
    expect(r.candleCount).toBe(3);
    expect(r.burnCount).toBe(3);
    expect(r.totalMinutes).toBe(180);
    expect(r.weighedMinutes).toBe(180);
    expect(r.totalLossMg).toBe(1500);
    expect(r.averageMgPerHour).toBe(500); // 1500 * 60 / 180
  });

  it("takes the largest of the candles' last melt pool diameters and the largest flame height", () => {
    const s = session("b", [
      candle([burn({ meltPoolDiameterMm: 40 }), burn({ meltPoolDiameterMm: 55, flameHeightMm: 20 })]),
      candle([burn({ meltPoolDiameterMm: 70 }), burn({ meltPoolDiameterMm: 30, flameHeightMm: 35 })]),
      candle([burn({})]),
    ]);
    const r = summaryOf([s]);
    expect(r.largestMeltPoolDiameterMm).toBe(55); // candle 1 last 55, candle 2 last 30
    expect(r.maxFlameHeightMm).toBe(35);
  });

  it("lists distinct soot levels in the order none, light, moderate, heavy", () => {
    const s1 = session("b", [candle([burn({ soot: "heavy" }), burn({ soot: "none" })])]);
    const s2 = session("b", [candle([burn({ soot: "moderate" }), burn({ soot: "heavy" })])]);
    expect(summaryOf([s1, s2]).sootLevels).toEqual(["none", "moderate", "heavy"]);
    expect(summaryOf([session("b", [candle([burn({ soot: "light" })])])]).sootLevels).toEqual(["light"]);
  });

  it("does not mutate its input", () => {
    const fx = batchFixture();
    const items = [sessionItem(fx, session(fx.batch.id, [candle([burn({ weightBeforeMg: 10, weightAfterMg: 5 })])]))];
    deepFreeze(items);
    expect(() => batchBurnSummary(items)).not.toThrow();
  });
});

function scenario(experimentCount: number) {
  const orig = batchFixture({ label: "Orig" }, 1);
  const h1 = hypothesis({ text: "First idea", status: "testing" });
  const inv = investigation(orig.batch.id, {
    observedOn: "2026-11-05",
    issues: ["frosting", "other"],
    otherIssue: "Odd marks",
    hypotheses: [h1],
  });
  const origSession = session(orig.batch.id, [
    candle([burn({ durationMin: 60, weightBeforeMg: 5000, weightAfterMg: 4000, soot: "light" })]),
  ]);
  const experiments: InvestigationComparisonData["experiments"] = [];
  for (let i = 0; i < experimentCount; i += 1) {
    const fu = batchFixture({ producedOn: `2026-11-1${i}` }, 2 + i);
    const exp = experiment(inv.id, h1.id, fu.batch.id, { change: `Change ${i}`, notes: `Note ${i}` });
    experiments.push({ experiment: exp, followUp: comparisonBatch(fu) });
  }
  const data: InvestigationComparisonData = {
    investigation: inv,
    original: comparisonBatch(orig, [origSession], [inv]),
    experiments,
  };
  return { data, orig, inv, h1, origSession };
}

describe("buildBeforeAfter", () => {
  it("with no experiments gives only the original column", () => {
    const { data, orig, inv } = scenario(0);
    const model = buildBeforeAfter(data);
    expect(model.investigationId).toBe(inv.id);
    expect(model.columns).toHaveLength(1);
    const col = model.columns[0]!;
    expect(col.key).toBe("original");
    expect(col.role).toBe("original");
    expect(col.batchId).toBe(orig.batch.id);
    expect(col.batchLabel).toBe("Orig");
    expect(col.formulaName).toBe(orig.formula.name);
    expect(col.versionId).toBe(orig.version.id);
    expect(col.versionNumber).toBe(1);
    expect(col.producedOn).toBe("2026-11-01");
    expect(col.hypothesis).toBeNull();
    expect(col.change).toBeNull();
    expect(col.notes).toBeNull();
    expect(col.burn.averageMgPerHour).toBe(1000 * 60 / 60);
    expect(col.burn.sootLevels).toEqual(["light"]);
    expect(col.observed).toEqual([
      {
        investigationId: inv.id,
        observedOn: "2026-11-05",
        issues: ["frosting", "other"],
        otherIssue: "Odd marks",
      },
    ]);
  });

  it("puts the original first, then one column per experiment in data order", () => {
    const { data, h1 } = scenario(2);
    const model = buildBeforeAfter(data);
    expect(model.columns.map((c) => c.key)).toEqual([
      "original",
      data.experiments[0]!.experiment.id,
      data.experiments[1]!.experiment.id,
    ]);
    const f = model.columns[1]!;
    expect(f.role).toBe("followUp");
    expect(f.batchLabel).toBeNull();
    expect(f.versionNumber).toBe(2);
    expect(f.hypothesis).toEqual({ id: h1.id, text: "First idea", status: "testing" });
    expect(f.change).toBe("Change 0");
    expect(f.notes).toBe("Note 0");
    expect(model.columns[2]!.change).toBe("Change 1");
    expect(f.burn.sessionCount).toBe(0);
    expect(f.burn.averageMgPerHour).toBeNull();
  });

  it("gives a null hypothesis when the experiment's hypothesis is gone", () => {
    const { data } = scenario(1);
    const gone: InvestigationComparisonData = {
      ...data,
      investigation: { ...data.investigation, hypotheses: [] },
    };
    expect(buildBeforeAfter(gone).columns[1]!.hypothesis).toBeNull();
  });

  it("gives experiments that share one follow-up batch a column each, with the same batch", () => {
    const { data, inv, h1 } = scenario(1);
    const shared = data.experiments[0]!.followUp;
    const second = experiment(inv.id, h1.id, shared.item.batch.id, { change: "Second" });
    const model = buildBeforeAfter({
      ...data,
      experiments: [...data.experiments, { experiment: second, followUp: shared }],
    });
    expect(model.columns).toHaveLength(3);
    expect(new Set(model.columns.map((c) => c.key)).size).toBe(3);
    expect(model.columns[1]!.batchId).toBe(model.columns[2]!.batchId);
    expect(model.columns[2]!.change).toBe("Second");
  });

  it("lists observations oldest first: date, then created time, then id", () => {
    const { data, orig } = scenario(0);
    const a = investigation(orig.batch.id, { id: "bbbbbbbb-0000-4000-8000-000000000000", observedOn: "2026-11-07" });
    const b = investigation(orig.batch.id, {
      id: "cccccccc-0000-4000-8000-000000000000",
      observedOn: "2026-11-03",
      createdAt: "2026-11-20T09:00:00.000Z",
    });
    const c = investigation(orig.batch.id, {
      id: "aaaaaaaa-0000-4000-8000-000000000000",
      observedOn: "2026-11-03",
      createdAt: "2026-11-20T09:00:00.000Z",
    });
    const d = investigation(orig.batch.id, {
      id: "dddddddd-0000-4000-8000-000000000000",
      observedOn: "2026-11-03",
      createdAt: "2026-11-20T07:00:00.000Z",
    });
    const input: InvestigationComparisonData = {
      ...data,
      original: { ...data.original, investigations: [a, b, c, d] },
    };
    const ids = buildBeforeAfter(input).columns[0]!.observed.map((o) => o.investigationId);
    expect(ids).toEqual([d.id, c.id, b.id, a.id]);
  });

  it("leaves otherIssue null when the investigation has none", () => {
    const { data, orig } = scenario(0);
    const plain = investigation(orig.batch.id, { issues: ["soot"] });
    const out = buildBeforeAfter({ ...data, original: { ...data.original, investigations: [plain] } });
    expect(out.columns[0]!.observed[0]!.otherIssue).toBeNull();
  });

  it("burnSessionIds follow the order the data gives", () => {
    const { data, orig } = scenario(0);
    const s1 = session(orig.batch.id, [candle()], { testedOn: "2026-11-20" });
    const s2 = session(orig.batch.id, [candle()], { testedOn: "2026-11-02" });
    const out = buildBeforeAfter({ ...data, original: comparisonBatch(orig, [s1, s2], []) });
    expect(out.columns[0]!.burnSessionIds).toEqual([s1.id, s2.id]);
  });

  it("does not mutate its input", () => {
    const { data } = scenario(2);
    const before = structuredClone(data);
    buildBeforeAfter(data);
    expect(data).toEqual(before);
    expect(() => buildBeforeAfter(deepFreeze(structuredClone(data)))).not.toThrow();
  });
});
