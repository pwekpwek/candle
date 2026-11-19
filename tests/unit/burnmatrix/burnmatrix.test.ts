import { describe, expect, it } from "vitest";
import {
  buildBurnCsv,
  buildComparison,
  burnFigures,
  candleTotals,
  csvFileName,
  formatDuration,
  formatMm,
  formatRate,
} from "@/lib/burnmatrix";
import type { BurnSessionListItem } from "@/lib/db/contract";
import { MESSAGES } from "@/lib/messages";
import type { BurnCandle, BurnRecord, SootLevel } from "@/lib/types";

const T = "2026-11-01T00:00:00.000Z";
const id = () => crypto.randomUUID();

function burn(over: Partial<BurnRecord> = {}): BurnRecord {
  return { id: id(), durationMin: 60, ...over };
}

function candle(over: Partial<BurnCandle> = {}): BurnCandle {
  return {
    id: id(),
    label: "A",
    wick: { materialId: null, name: "CD-10" },
    burns: [],
    ...over,
  };
}

function item(
  candles: BurnCandle[],
  opts: {
    label?: string;
    testedOn?: string;
    conclusion?: string;
    batchLabel?: string;
    batchId?: string;
    formula?: string;
    version?: number;
  } = {},
): BurnSessionListItem {
  const batchId = opts.batchId ?? id();
  return {
    session: {
      id: id(),
      batchId,
      testedOn: opts.testedOn ?? "2026-11-10",
      label: opts.label,
      milestoneId: null,
      candles,
      conclusion: opts.conclusion,
      createdAt: T,
      updatedAt: T,
    },
    batch: { id: batchId, label: opts.batchLabel } as unknown as BurnSessionListItem["batch"],
    formula: { id: id(), name: opts.formula ?? "Soy 464" } as unknown as BurnSessionListItem["formula"],
    version: { id: id(), number: opts.version ?? 1 } as unknown as BurnSessionListItem["version"],
    photoCount: 0,
  };
}

const sootText = (levels: readonly SootLevel[]) => levels.join("+");

describe("burnFigures", () => {
  it("computes loss and rate", () => {
    expect(burnFigures(burn({ durationMin: 120, weightBeforeMg: 200000, weightAfterMg: 193500 }))).toEqual({
      weightLossMg: 6500,
      mgPerHour: 3250,
    });
  });

  it("rounds the rate half up", () => {
    // 1000 * 60 / 7 = 8571.43
    expect(burnFigures(burn({ durationMin: 7, weightBeforeMg: 5000, weightAfterMg: 4000 })).mgPerHour).toBe(8571);
    // 1 * 60 / 120 = 0.5 -> 1
    expect(burnFigures(burn({ durationMin: 120, weightBeforeMg: 11, weightAfterMg: 10 })).mgPerHour).toBe(1);
    // 1 * 60 / 125 = 0.48 -> 0
    expect(burnFigures(burn({ durationMin: 125, weightBeforeMg: 11, weightAfterMg: 10 })).mgPerHour).toBe(0);
  });

  it("gives nothing when a weight is missing", () => {
    expect(burnFigures(burn({ weightBeforeMg: 100 }))).toEqual({ weightLossMg: null, mgPerHour: null });
    expect(burnFigures(burn({ weightAfterMg: 100 }))).toEqual({ weightLossMg: null, mgPerHour: null });
    expect(burnFigures(burn())).toEqual({ weightLossMg: null, mgPerHour: null });
  });

  it("handles zero loss", () => {
    expect(burnFigures(burn({ weightBeforeMg: 500, weightAfterMg: 500 }))).toEqual({
      weightLossMg: 0,
      mgPerHour: 0,
    });
  });
});

describe("candleTotals", () => {
  it("is empty for a candle with no burns", () => {
    expect(candleTotals(candle())).toEqual({
      burnCount: 0,
      totalMinutes: 0,
      weighedBurnCount: 0,
      weighedMinutes: 0,
      totalLossMg: null,
      averageMgPerHour: null,
      lastMeltPoolDiameterMm: null,
      maxMeltPoolDepthMm: null,
      maxFlameHeightMm: null,
      sootLevels: [],
    });
  });

  it("uses only weighed burns for loss and rate", () => {
    const t = candleTotals(
      candle({
        burns: [
          burn({ durationMin: 60, weightBeforeMg: 10000, weightAfterMg: 9000 }),
          burn({ durationMin: 90 }),
          burn({ durationMin: 60, weightBeforeMg: 9000, weightAfterMg: 7500 }),
        ],
      }),
    );
    expect(t.burnCount).toBe(3);
    expect(t.totalMinutes).toBe(210);
    expect(t.weighedBurnCount).toBe(2);
    expect(t.weighedMinutes).toBe(120);
    expect(t.totalLossMg).toBe(2500);
    expect(t.averageMgPerHour).toBe(1250);
  });

  it("is weighed with zero loss", () => {
    const t = candleTotals(candle({ burns: [burn({ weightBeforeMg: 5, weightAfterMg: 5 })] }));
    expect(t.totalLossMg).toBe(0);
    expect(t.averageMgPerHour).toBe(0);
  });

  it("takes the last recorded diameter, and the largest depth and flame", () => {
    const t = candleTotals(
      candle({
        burns: [
          burn({ meltPoolDiameterMm: 40, meltPoolDepthMm: 10, flameHeightMm: 30 }),
          burn({ meltPoolDiameterMm: 62, meltPoolDepthMm: 14, flameHeightMm: 20 }),
          burn({ meltPoolDepthMm: 8 }),
        ],
      }),
    );
    expect(t.lastMeltPoolDiameterMm).toBe(62);
    expect(t.maxMeltPoolDepthMm).toBe(14);
    expect(t.maxFlameHeightMm).toBe(30);
  });

  it("orders soot levels none, light, moderate, heavy without repeats", () => {
    const t = candleTotals(
      candle({
        burns: [burn({ soot: "heavy" }), burn({ soot: "none" }), burn({ soot: "heavy" }), burn({ soot: "light" })],
      }),
    );
    expect(t.sootLevels).toEqual(["none", "light", "heavy"]);
  });
});

describe("formatters", () => {
  it("formats durations", () => {
    expect(formatDuration(270)).toBe("4 h 30 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(0)).toBe("0 min");
  });

  it("formats rates and millimetres", () => {
    expect(formatRate(3250)).toBe("3.25 g/h");
    expect(formatRate(0)).toBe("0.00 g/h");
    expect(formatRate(8571)).toBe("8.57 g/h");
    expect(formatMm(62)).toBe("62 mm");
  });
});

describe("buildComparison", () => {
  it("lays out one session's candles side by side", () => {
    const s = item(
      [
        candle({
          label: "A",
          wick: { materialId: null, name: "CD-10" },
          burns: [burn({ durationMin: 270, weightBeforeMg: 10000, weightAfterMg: 8650, soot: "light", meltPoolDiameterMm: 62 })],
          coldThrow: "Soft vanilla",
        }),
        candle({ label: "B", wick: { materialId: null, name: "ECO-6" } }),
      ],
      { label: "First test", conclusion: "Wick A held a wider pool." },
    );
    const m = buildComparison([s], sootText);
    expect(m.groups).toHaveLength(1);
    expect(m.groups[0].sessionLabel).toBe("First test");
    expect(m.groups[0].conclusion).toBe("Wick A held a wider pool.");
    expect(m.columns.map((c) => c.candleLabel)).toEqual(["A", "B"]);
    expect(m.rows.map((r) => r.metric)).toEqual([
      "wick",
      "burnCount",
      "totalTime",
      "totalLoss",
      "averageRate",
      "lastMeltPoolDiameter",
      "maxMeltPoolDepth",
      "maxFlameHeight",
      "soot",
      "coldThrow",
      "hotThrow",
    ]);
    const by = (metric: string) => m.rows.find((r) => r.metric === metric)!.cells;
    expect(by("wick")).toEqual(["CD-10", "ECO-6"]);
    expect(by("burnCount")).toEqual(["1", "0"]);
    expect(by("totalTime")).toEqual(["4 h 30 min", ""]);
    expect(by("totalLoss")).toEqual(["1.35 g", ""]);
    expect(by("averageRate")).toEqual(["0.30 g/h", ""]);
    expect(by("lastMeltPoolDiameter")).toEqual(["62 mm", ""]);
    expect(by("maxMeltPoolDepth")).toEqual(["", ""]);
    expect(by("soot")).toEqual(["light", ""]);
    expect(by("coldThrow")).toEqual(["Soft vanilla", ""]);
    expect(by("hotThrow")).toEqual(["", ""]);
  });

  it("keeps session, group and column order across four sessions and batches", () => {
    const sessions = [
      item([candle({ label: "A1" }), candle({ label: "A2" })], { testedOn: "2026-11-12" }),
      item([candle({ label: "B1" })], { testedOn: "2026-11-11" }),
      item([candle({ label: "C1" }), candle({ label: "C2" }), candle({ label: "C3" })], { testedOn: "2026-11-10" }),
      item([candle({ label: "D1" })], { testedOn: "2026-11-09", batchLabel: "Autumn" }),
    ];
    const m = buildComparison(sessions, sootText);
    expect(m.groups.map((g) => g.sessionId)).toEqual(sessions.map((s) => s.session.id));
    expect(m.groups.map((g) => g.batchId)).toEqual(sessions.map((s) => s.batch.id));
    expect(m.columns.map((c) => c.candleLabel)).toEqual(["A1", "A2", "B1", "C1", "C2", "C3", "D1"]);
    expect(new Set(m.columns.map((c) => c.key)).size).toBe(7);
    expect(m.groups[3].batchLabel).toBe("Autumn");
    expect(m.groups[0].batchLabel).toBeNull();
    expect(m.groups[0].sessionLabel).toBeNull();
    for (const r of m.rows) expect(r.cells).toHaveLength(7);
  });
});

describe("buildBurnCsv", () => {
  const M = MESSAGES.burnCsv;
  const BOM = "﻿";

  it("starts with a BOM, ends rows with CRLF and takes headers from MESSAGES", () => {
    const csv = buildBurnCsv([]);
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("");
    expect(lines[0].split(",")).toEqual([
      M.testDate,
      M.session,
      M.batch,
      M.formula,
      M.version,
      M.candle,
      M.wick,
      M.burn,
      "Duration (min)",
      M.weightBeforeG,
      M.weightAfterG,
      M.weightLossG,
      M.rateGPerHour,
      M.meltPoolDiameterMm,
      M.meltPoolDepthMm,
      M.flameHeightMm,
      M.soot,
      M.burnNotes,
      M.coldThrow,
      M.hotThrow,
      M.candleNotes,
      M.conclusion,
    ]);
    expect(csv.includes("\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("writes one row per burn and one per candle without burns", () => {
    const s = item(
      [
        candle({
          label: "A",
          burns: [
            burn({ durationMin: 60, weightBeforeMg: 10500, weightAfterMg: 9250, soot: "moderate", meltPoolDiameterMm: 55, meltPoolDepthMm: 12, flameHeightMm: 30 }),
            burn({ durationMin: 30 }),
          ],
        }),
        candle({ label: "B" }),
      ],
      { label: "Test 1", formula: "Soy 464", version: 3, batchLabel: "Autumn", conclusion: "Done" },
    );
    const rows = buildBurnCsv([s]).slice(1).split("\r\n");
    expect(rows).toHaveLength(5);
    expect(rows[1].split(",")).toEqual([
      "2026-11-10", "Test 1", "Autumn", "Soy 464", "3", "A", "CD-10", "1", "60",
      "10.50", "9.25", "1.25", "1.25", "55", "12", "30", "Moderate", "", "", "", "", "Done",
    ]);
    expect(rows[2].split(",")).toEqual([
      "2026-11-10", "Test 1", "Autumn", "Soy 464", "3", "A", "CD-10", "2", "30",
      "", "", "", "", "", "", "", "", "", "", "", "", "Done",
    ]);
    expect(rows[3].split(",")).toEqual([
      "2026-11-10", "Test 1", "Autumn", "Soy 464", "3", "B", "CD-10", "",
      "", "", "", "", "", "", "", "", "", "", "", "", "", "Done",
    ]);
    expect(rows[4]).toBe("");
  });

  it("falls back to the batch id for the batch column and leaves the session empty", () => {
    const s = item([candle()], { batchId: "3f2a91c0-aaaa-4bbb-8ccc-123456789abc" });
    const cells = buildBurnCsv([s]).slice(1).split("\r\n")[1].split(",");
    expect(cells[1]).toBe("");
    expect(cells[2]).toBe("Batch 3F2A91C0");
  });

  it("quotes commas, quotes and line breaks", () => {
    const s = item([candle({ label: "A, one", hotThrow: 'Said "strong"', notes: "line1\nline2" })]);
    const csv = buildBurnCsv([s]);
    expect(csv).toContain('"A, one"');
    expect(csv).toContain('"Said ""strong"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it("prefixes formula-looking text with an apostrophe", () => {
    const s = item(
      [
        candle({
          label: "=SUM(A1)",
          wick: { materialId: null, name: "+wick" },
          coldThrow: "-1 note",
          hotThrow: "@home",
          notes: "\tTabbed",
          burns: [burn({ notes: "=1+1" })],
        }),
      ],
      { label: "\rcr", conclusion: "=cmd,x" },
    );
    const csv = buildBurnCsv([s]);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain("'+wick");
    expect(csv).toContain("'-1 note");
    expect(csv).toContain("'@home");
    expect(csv).toContain("'\tTabbed");
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('"\'\rcr"');
    expect(csv).toContain('"\'=cmd,x"');
  });

  it("keeps the order of the sessions it is given", () => {
    const a = item([candle({ label: "first" })], { testedOn: "2026-11-01" });
    const b = item([candle({ label: "second" })], { testedOn: "2026-11-20" });
    const csv = buildBurnCsv([a, b]);
    expect(csv.indexOf("first")).toBeLessThan(csv.indexOf("second"));
  });
});

describe("csvFileName", () => {
  it("builds the file name from a local date", () => {
    expect(csvFileName("2026-11-19")).toBe("candlelab-burn-tests-20261119.csv");
  });
});
