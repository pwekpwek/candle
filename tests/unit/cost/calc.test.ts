import { describe, expect, it } from "vitest";
import {
  add,
  calculateCost,
  calculateScenario,
  formatMargin,
  formatPeso,
  fraction,
  type CostSheetFigures,
  type ScenarioResult,
} from "@/lib/cost";
import type { CostMaterialLine, CostPrice, CostQuantity } from "@/lib/types";
import { WB1_FIGURES } from "../../fixtures/cost-worked-batch";

const P = "₱";

function sheet(over: Partial<CostSheetFigures> = {}): CostSheetFigures {
  return { ...WB1_FIGURES, ...over };
}

function line(quantity: CostQuantity, price: CostPrice, type: CostMaterialLine["materialType"] = "wax"): CostMaterialLine {
  return { key: "k", materialId: "00000000-0000-4000-8000-000000000001", materialType: type, name: "X", quantity, price };
}

function bare(materials: CostMaterialLine[], over: Partial<CostSheetFigures> = {}): CostSheetFigures {
  return {
    candlesMade: 4,
    sellable: 4,
    materials,
    items: [],
    labourHoursX100: 0,
    labourRateCentavos: 0,
    overhead: { mode: "fixed", centavos: 0 },
    testingCentavos: 0,
    pricesIncludeVat: false,
    wholesale: null,
    retail: null,
    ...over,
  };
}

function ok(s: ScenarioResult | null): Extract<ScenarioResult, { ok: true }> {
  if (!s || !s.ok) throw new Error("scenario not ok");
  return s;
}

describe("material lines", () => {
  it("lot by weight", () => {
    const r = calculateCost(
      bare([
        line(
          { unit: "mg", mg: 1_000_000, from: "planned" },
          { source: "lot", lotId: "l", lotCode: "L1", paidCentavos: 300, quantity: 2_000_000 },
        ),
      ]),
    );
    expect(r.materialLines[0].cost).toEqual(fraction(150));
    expect(r.materialLines[0].unitPrice).toEqual(fraction(150));
    expect(r.materialLines[0].unit).toBe("kg");
    expect(r.materialLines[0].pieces).toBeNull();
  });

  it("lot by piece", () => {
    const r = calculateCost(
      bare(
        [
          line(
            { unit: "piece", perCandle: 2 },
            { source: "lot", lotId: "l", lotCode: "L1", paidCentavos: 1000, quantity: 30 },
            "wick",
          ),
        ],
        { candlesMade: 3, sellable: 3 },
      ),
    );
    expect(r.materialLines[0].pieces).toBe(6);
    expect(r.materialLines[0].cost).toEqual(fraction(6 * 1000, 30));
    expect(r.materialLines[0].unitPrice).toEqual(fraction(100, 3));
    expect(r.materialLines[0].unit).toBe("piece");
  });

  it("material price per kg and per piece", () => {
    const kg = calculateCost(bare([line({ unit: "mg", mg: 250_000, from: "measured" }, { source: "material", unitCentavos: 4000 })]));
    expect(kg.materialLines[0].cost).toEqual(fraction(1000));
    expect(kg.materialLines[0].source).toBe("material");
    const pc = calculateCost(bare([line({ unit: "piece", perCandle: 1 }, { source: "material", unitCentavos: 3850 }, "vessel")]));
    expect(pc.materialLines[0].cost).toEqual(fraction(15_400));
    expect(pc.materialLines[0].unitPrice).toEqual(fraction(3850));
  });

  it("sheet-typed price", () => {
    const r = calculateCost(bare([line({ unit: "mg", mg: 500_000, from: "planned" }, { source: "sheet", unitCentavos: 2000 })]));
    expect(r.materialLines[0].cost).toEqual(fraction(1000));
    expect(r.materialLines[0].source).toBe("sheet");
  });

  it("no price counts as zero and marks the sheet incomplete", () => {
    const r = calculateCost(
      bare([
        line({ unit: "mg", mg: 500_000, from: "planned" }, { source: "none" }),
        line({ unit: "piece", perCandle: 1 }, { source: "none" }, "vessel"),
        line({ unit: "piece", perCandle: 1 }, { source: "material", unitCentavos: 100 }, "wick"),
      ]),
    );
    expect(r.missingPrices).toBe(2);
    expect(r.complete).toBe(false);
    expect(r.materialLines[0].cost).toEqual(fraction(0));
    expect(r.materialLines[0].unitPrice).toBeNull();
    expect(r.materials).toEqual(fraction(400));
  });

  it("all prices missing gives zero totals, incomplete", () => {
    const r = calculateCost(bare([line({ unit: "mg", mg: 1, from: "planned" }, { source: "none" })]));
    expect(formatPeso(r.materials)).toBe(`${P}0.00`);
    expect(formatPeso(r.batchTotal)).toBe(`${P}0.00`);
    expect(r.complete).toBe(false);
    expect(r.missingPrices).toBe(1);
  });

  it("0 pieces per candle costs nothing", () => {
    const r = calculateCost(bare([line({ unit: "piece", perCandle: 0 }, { source: "material", unitCentavos: 3850 }, "vessel")]));
    expect(r.materialLines[0].cost).toEqual(fraction(0));
    expect(r.materialLines[0].pieces).toBe(0);
    expect(r.complete).toBe(true);
  });
});

describe("items, labour, overhead", () => {
  const item = (per: "sellable" | "batch", unitCentavos: number, quantity: number) => ({
    id: "i",
    itemId: null,
    name: "n",
    unitCentavos,
    per,
    quantity,
  });

  it("items per sellable and per batch", () => {
    const r = calculateCost(bare([], { candlesMade: 6, sellable: 5, items: [item("sellable", 100, 2), item("batch", 700, 3)] }));
    expect(r.itemLines.map((l) => l.cost)).toEqual([fraction(1000), fraction(2100)]);
    expect(r.packaging).toEqual(fraction(1000));
    expect(r.itemsPerBatch).toEqual(fraction(2100));
    expect(r.production).toEqual(fraction(2100));
    expect(r.batchTotal).toEqual(fraction(3100));
  });

  it("labour, including 0 hours", () => {
    const r = calculateCost(bare([], { labourHoursX100: 25, labourRateCentavos: 10_001 }));
    expect(r.labour).toEqual(fraction(250_025, 100));
    expect(calculateCost(bare([], { labourHoursX100: 0, labourRateCentavos: 9500 })).labour).toEqual(fraction(0));
  });

  it("overhead in both modes", () => {
    const mats = [line({ unit: "piece", perCandle: 1 }, { source: "material", unitCentavos: 1000 }, "vessel")];
    const pct = calculateCost(bare(mats, { labourHoursX100: 100, labourRateCentavos: 1000, overhead: { mode: "percent", bp: 1000 } }));
    // materials 4000 + labour 1000 = 5000; 10% = 500
    expect(pct.overhead).toEqual(fraction(500));
    const fixed = calculateCost(bare(mats, { overhead: { mode: "fixed", centavos: 777 } }));
    expect(fixed.overhead).toEqual(fraction(777));
    expect(calculateCost(bare(mats, { overhead: { mode: "fixed", centavos: 0 } })).overhead).toEqual(fraction(0));
    expect(calculateCost(bare(mats, { overhead: { mode: "percent", bp: 0 } })).overhead).toEqual(fraction(0));
  });
});

describe("spreading failed candles", () => {
  it("sellable candles carry the cost of the failed ones", () => {
    const mats = [line({ unit: "piece", perCandle: 1 }, { source: "material", unitCentavos: 1000 }, "vessel")];
    const all = calculateCost(bare(mats, { candlesMade: 10, sellable: 10, testingCentavos: 500 }));
    const some = calculateCost(bare(mats, { candlesMade: 10, sellable: 8, testingCentavos: 500 }));
    expect(all.perSellable).toEqual(fraction(1050));
    expect(some.production).toEqual(all.production);
    expect(some.nonSellableCount).toBe(2);
    expect(some.nonSellableCost).toEqual(fraction(2000));
    expect(some.perSellable).toEqual(fraction(10_500, 8));
    const b = some.perSellableBreakdown!;
    expect(b.nonSellableShare).toEqual(fraction(250));
    expect(b.production).toEqual(fraction(1250));
    expect(add(add(b.production, b.testing), b.packaging)).toEqual(some.perSellable);
    expect(calculateCost(bare(mats, { candlesMade: 10, sellable: 10 })).perSellableBreakdown!.nonSellableShare).toEqual(fraction(0));
  });

  it("breakdown sums exactly with awkward numbers", () => {
    const r = calculateCost(
      sheet({ candlesMade: 7, sellable: 3, testingCentavos: 1234, labourHoursX100: 133, items: WB1_FIGURES.items }),
    );
    const b = r.perSellableBreakdown!;
    expect(add(add(b.production, b.testing), b.packaging)).toEqual(r.perSellable);
  });

  it("0 sellable gives no per-sellable cost and no scenarios", () => {
    const r = calculateCost(sheet({ sellable: 0, wholesale: { mode: "margin", marginBp: 4000 }, retail: { mode: "price", priceCentavos: 100 } }));
    expect(r.perSellable).toBeNull();
    expect(r.perSellableBreakdown).toBeNull();
    expect(r.wholesale).toMatchObject({ ok: false, reason: "no-sellable" });
    expect(r.retail).toMatchObject({ ok: false, reason: "no-sellable" });
    expect(r.nonSellableCount).toBe(12);
    expect(r.packaging).toEqual(fraction(0));
  });

  it("scenarios are null when not set", () => {
    const r = calculateCost(sheet({ wholesale: null, retail: null }));
    expect(r.wholesale).toBeNull();
    expect(r.retail).toBeNull();
  });
});

describe("scenarios", () => {
  const cost = fraction(10_000); // 100.00 per sellable candle

  it("by target margin, VAT off", () => {
    const s = ok(calculateScenario({ mode: "margin", marginBp: 2000 }, cost, 5, false));
    expect(s.exVatPrice).toEqual(fraction(12_500));
    expect(s.price).toEqual(fraction(12_500));
    expect(s.vat).toEqual(fraction(0));
    expect(s.profitPerCandle).toEqual(fraction(2500));
    expect(s.margin).toEqual(fraction(1, 5));
    expect(s.batchProfit).toEqual(fraction(12_500));
  });

  it("by target margin, VAT on", () => {
    const s = ok(calculateScenario({ mode: "margin", marginBp: 2000 }, cost, 5, true));
    expect(s.exVatPrice).toEqual(fraction(12_500));
    expect(s.price).toEqual(fraction(14_000));
    expect(s.vat).toEqual(fraction(1500));
    expect(s.margin).toEqual(fraction(1, 5));
  });

  it("by price, VAT off and on", () => {
    const off = ok(calculateScenario({ mode: "price", priceCentavos: 15_000 }, cost, 2, false));
    expect(off.profitPerCandle).toEqual(fraction(5000));
    expect(off.margin).toEqual(fraction(1, 3));
    expect(off.batchProfit).toEqual(fraction(10_000));
    const on = ok(calculateScenario({ mode: "price", priceCentavos: 11_200 }, cost, 2, true));
    expect(on.exVatPrice).toEqual(fraction(10_000));
    expect(on.vat).toEqual(fraction(1200));
    expect(on.profitPerCandle).toEqual(fraction(0));
  });

  it("0% target gives price = cost and zero profit", () => {
    const s = ok(calculateScenario({ mode: "margin", marginBp: 0 }, cost, 5, false));
    expect(s.price).toEqual(cost);
    expect(formatPeso(s.profitPerCandle)).toBe(`${P}0.00`);
    expect(formatMargin(s.margin)).toBe("0.00%");
  });

  it("99.99% target works", () => {
    const s = ok(calculateScenario({ mode: "margin", marginBp: 9999 }, cost, 5, false));
    expect(s.price).toEqual(fraction(10_000 * 10_000));
    expect(formatMargin(s.margin)).toBe("99.99%");
  });

  it("100% or more is unreachable", () => {
    expect(calculateScenario({ mode: "margin", marginBp: 10_000 }, cost, 5, false)).toMatchObject({ ok: false, reason: "margin-unreachable" });
    expect(calculateScenario({ mode: "margin", marginBp: 12_000 }, cost, 5, false)).toMatchObject({ ok: false, reason: "margin-unreachable" });
  });

  it("price below 1 centavo is refused", () => {
    expect(calculateScenario({ mode: "price", priceCentavos: 0 }, cost, 5, false)).toMatchObject({ ok: false, reason: "zero-price" });
    expect(ok(calculateScenario({ mode: "price", priceCentavos: 1 }, cost, 5, false)).price).toEqual(fraction(1));
  });

  it("no sellable candles", () => {
    expect(calculateScenario({ mode: "price", priceCentavos: 100 }, null, 0, false)).toMatchObject({ ok: false, reason: "no-sellable" });
    expect(calculateScenario({ mode: "price", priceCentavos: 100 }, cost, 0, false)).toMatchObject({ ok: false, reason: "no-sellable" });
  });

  it("a price below cost gives negative profit and margin", () => {
    const s = ok(calculateScenario({ mode: "price", priceCentavos: 8770 }, cost, 4, false));
    expect(formatPeso(s.profitPerCandle)).toBe(`-${P}12.30`);
    expect(formatMargin(s.margin)).toBe("-14.03%");
    expect(formatPeso(s.batchProfit)).toBe(`-${P}49.20`);
    expect(formatMargin(s.margin).startsWith("-")).toBe(true);
  });

  it("zero cost with a margin target does not divide by zero", () => {
    const s = ok(calculateScenario({ mode: "margin", marginBp: 4000 }, fraction(0), 3, false));
    expect(s.price).toEqual(fraction(0));
    expect(s.margin).toEqual(fraction(2, 5));
  });
});
