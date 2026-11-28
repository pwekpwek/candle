import { describe, expect, it } from "vitest";
import { add, calculateCost, formatMargin, formatPeso, fraction, type Fraction, type ScenarioResult } from "@/lib/cost";
import { WB1_EXPECTED, WB1_FIGURES, WB1_FIGURES_VAT } from "../../fixtures/cost-worked-batch";

type MoneyKey = "price" | "exVatPrice" | "vat" | "profitPerCandle" | "batchProfit";

function okScenario(s: ScenarioResult | null): Extract<ScenarioResult, { ok: true }> {
  if (!s || !s.ok) throw new Error("scenario not ok");
  return s;
}
const peso = (s: ScenarioResult | null, key: MoneyKey): string => formatPeso(okScenario(s)[key]);
const margin = (s: ScenarioResult | null): string => formatMargin(okScenario(s).margin);

describe("WB-1 exact amounts", () => {
  const r = calculateCost(WB1_FIGURES);

  it("matches the exact fractions in the note", () => {
    expect(r.materialLines.map((l) => l.cost)).toEqual([
      fraction(35_463_375, 1000),
      fraction(241_314, 10),
      fraction(831_555, 100),
      fraction(5400),
      fraction(46_200),
    ]);
    expect(r.materials).toEqual(fraction(119_510_325, 1000));
    expect(r.labour).toEqual(fraction(33_250));
    expect(r.overhead).toEqual(fraction(19_095_040_625, 1_000_000));
    expect(r.itemsPerBatch).toEqual(fraction(4500));
    expect(r.packaging).toEqual(fraction(24_750));
    expect(r.production).toEqual(fraction(176_355_365_625, 1_000_000));
    expect(r.perCandleMade).toEqual(fraction(1_469_628_046_875, 100_000_000));
    expect(r.nonSellableCount).toBe(2);
    expect(r.nonSellableCost).toEqual(fraction(293_925_609_375, 10_000_000));
    expect(r.testing).toEqual(fraction(15_000));
    expect(r.batchTotal).toEqual(fraction(216_105_365_625, 1_000_000));
    expect(r.perSellable).toEqual(fraction(216_105_365_625, 10_000_000));
    expect(r.complete).toBe(true);
    expect(r.missingPrices).toBe(0);
  });

  it("has the unit prices and pieces", () => {
    const [soy, oilA, oilB, wick, vessel] = r.materialLines;
    expect(soy.unitPrice).toEqual(fraction(21_750));
    expect(soy.unit).toBe("kg");
    expect(soy.source).toBe("lot");
    expect(oilA.unitPrice).toEqual(fraction(185_000));
    expect(oilA.source).toBe("material");
    expect(oilB.unitPrice).toEqual(fraction(255_000));
    expect(wick.unitPrice).toEqual(fraction(450));
    expect(wick.unit).toBe("piece");
    expect(wick.pieces).toBe(12);
    expect(soy.pieces).toBeNull();
    expect(vessel.unitPrice).toEqual(fraction(3850));
  });

  it("breakdown adds up exactly to the cost per sellable candle", () => {
    const b = r.perSellableBreakdown!;
    expect(b.production).toEqual(fraction(176_355_365_625, 10_000_000));
    expect(b.nonSellableShare).toEqual(fraction(293_925_609_375, 100_000_000));
    expect(b.testing).toEqual(fraction(1500));
    expect(b.packaging).toEqual(fraction(2475));
    expect(add(add(b.production, b.testing), b.packaging)).toEqual(r.perSellable);
  });
});

describe("WB-1 shown strings", () => {
  const r = calculateCost(WB1_FIGURES);
  const e = WB1_EXPECTED;

  it("shows every cost row", () => {
    expect(r.materialLines.map((l) => formatPeso(l.cost))).toEqual(e.materialLines);
    expect(formatPeso(r.materials)).toBe(e.materials);
    expect(r.itemLines.map((l) => formatPeso(l.cost))).toEqual(e.itemLines);
    expect(formatPeso(r.labour)).toBe(e.labour);
    expect(formatPeso(r.overhead)).toBe(e.overhead);
    expect(formatPeso(r.production)).toBe(e.production);
    expect(formatPeso(r.perCandleMade)).toBe(e.perCandleMade);
    expect(formatPeso(r.nonSellableCost)).toBe(e.nonSellableCost);
    expect(formatPeso(r.testing)).toBe(e.testing);
    expect(formatPeso(r.packaging)).toBe(e.packaging);
    expect(formatPeso(r.batchTotal)).toBe(e.batchTotal);
    expect(formatPeso(r.perSellable as Fraction)).toBe(e.perSellable);
    const b = r.perSellableBreakdown!;
    expect(formatPeso(b.production)).toBe(e.breakdown.production);
    expect(formatPeso(b.nonSellableShare)).toBe(e.breakdown.nonSellableShare);
    expect(formatPeso(b.testing)).toBe(e.breakdown.testing);
    expect(formatPeso(b.packaging)).toBe(e.breakdown.packaging);
  });

  it("the shown lines reconcile as the note says", () => {
    const c = (s: string): number => Number(s.replace(/[^\d]/g, ""));
    const sum = (xs: readonly string[]): number => xs.reduce((a, s) => a + c(s), 0);
    expect(sum(e.materialLines)).toBe(c(e.materials));
    expect(c(e.materials) + c(e.itemLines[2]) + c(e.labour) + c(e.overhead)).toBe(c(e.production));
    expect(c(e.production) + c(e.testing) + c(e.packaging)).toBe(c(e.batchTotal));
    expect(c(e.breakdown.production) + c(e.breakdown.testing) + c(e.breakdown.packaging)).toBe(c(e.perSellable));
    expect(c(e.itemLines[0]) + c(e.itemLines[1])).toBe(c(e.packaging));
  });

  it("shows both scenarios with the VAT switch off", () => {
    for (const k of ["wholesale", "retail"] as const) {
      const s = r[k];
      const x = e.vatOff[k];
      expect(peso(s, "price")).toBe(x.price);
      expect(peso(s, "exVatPrice")).toBe(x.exVat);
      expect(peso(s, "vat")).toBe(x.vat);
      expect(peso(s, "profitPerCandle")).toBe(x.profit);
      expect(margin(s)).toBe(x.margin);
      expect(peso(s, "batchProfit")).toBe(x.batchProfit);
    }
  });

  it("shows both scenarios with the VAT switch on", () => {
    const v = calculateCost(WB1_FIGURES_VAT);
    expect(v.perSellable).toEqual(r.perSellable);
    for (const k of ["wholesale", "retail"] as const) {
      const s = v[k];
      const x = e.vatOn[k];
      expect(peso(s, "price")).toBe(x.price);
      expect(peso(s, "exVatPrice")).toBe(x.exVat);
      expect(peso(s, "vat")).toBe(x.vat);
      expect(peso(s, "profitPerCandle")).toBe(x.profit);
      expect(margin(s)).toBe(x.margin);
      expect(peso(s, "batchProfit")).toBe(x.batchProfit);
    }
  });

  it("has the exact scenario fractions from the note", () => {
    const w = okScenario(r.wholesale);
    expect(w.price).toEqual(fraction(360_175_609_375, 10_000_000));
    expect(w.margin).toEqual(fraction(2, 5));
    expect(okScenario(calculateCost(WB1_FIGURES_VAT).wholesale).price).toEqual(fraction(4_033_966_825, 100_000));
  });
});
