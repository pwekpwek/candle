/**
 * Worked batch WB-1 (docs/v0.3-cost.md "Worked batch (test vector WB-1)") as
 * data. All names, codes and prices are fictional. Used by the calculator
 * unit tests and the e2e tests.
 */
import type { CostSheetFigures } from "@/lib/cost/contract";

const P = "₱";

/** WB-1 with the "Prices include 12% VAT" switch off. */
export const WB1_FIGURES: CostSheetFigures = {
  candlesMade: 12,
  sellable: 10,
  materials: [
    {
      key: "row:00000000-0000-4000-8000-0000000000a1",
      materialId: "00000000-0000-4000-8000-0000000000b1",
      materialType: "wax",
      name: "Soy wax",
      quantity: { unit: "mg", mg: 1_630_500, from: "measured" },
      price: {
        source: "lot",
        lotId: "00000000-0000-4000-8000-0000000000c1",
        lotCode: "SOY-DEMO-01",
        paidCentavos: 435_000,
        quantity: 20_000_000,
      },
    },
    {
      key: "row:00000000-0000-4000-8000-0000000000a2",
      materialId: "00000000-0000-4000-8000-0000000000b2",
      materialType: "fragranceOil",
      name: "Fragrance oil A",
      quantity: { unit: "mg", mg: 130_440, from: "measured" },
      price: { source: "material", unitCentavos: 185_000 },
    },
    {
      key: "row:00000000-0000-4000-8000-0000000000a3",
      materialId: "00000000-0000-4000-8000-0000000000b3",
      materialType: "fragranceOil",
      name: "Fragrance oil B",
      quantity: { unit: "mg", mg: 32_610, from: "measured" },
      price: {
        source: "lot",
        lotId: "00000000-0000-4000-8000-0000000000c2",
        lotCode: "FO-B-DEMO",
        paidCentavos: 127_500,
        quantity: 500_000,
      },
    },
    {
      key: "wick",
      materialId: "00000000-0000-4000-8000-0000000000b4",
      materialType: "wick",
      name: "Wick",
      quantity: { unit: "piece", perCandle: 1 },
      price: {
        source: "lot",
        lotId: "00000000-0000-4000-8000-0000000000c3",
        lotCode: "WICK-DEMO-7",
        paidCentavos: 45_000,
        quantity: 100,
      },
    },
    {
      key: "vessel",
      materialId: "00000000-0000-4000-8000-0000000000b5",
      materialType: "vessel",
      name: "Vessel",
      quantity: { unit: "piece", perCandle: 1 },
      price: { source: "material", unitCentavos: 3_850 },
    },
  ],
  items: [
    {
      id: "00000000-0000-4000-8000-0000000000d1",
      itemId: null,
      name: "Label",
      unitCentavos: 675,
      per: "sellable",
      quantity: 1,
    },
    {
      id: "00000000-0000-4000-8000-0000000000d2",
      itemId: null,
      name: "Gift box",
      unitCentavos: 1_800,
      per: "sellable",
      quantity: 1,
    },
    {
      id: "00000000-0000-4000-8000-0000000000d3",
      itemId: null,
      name: "Shipping carton",
      unitCentavos: 4_500,
      per: "batch",
      quantity: 1,
    },
  ],
  labourHoursX100: 350,
  labourRateCentavos: 9_500,
  overhead: { mode: "percent", bp: 1_250 },
  testingCentavos: 15_000,
  pricesIncludeVat: false,
  wholesale: { mode: "margin", marginBp: 4_000 },
  retail: { mode: "price", priceCentavos: 45_000 },
};

/** WB-1 with "Prices include 12% VAT" on. */
export const WB1_FIGURES_VAT: CostSheetFigures = { ...WB1_FIGURES, pricesIncludeVat: true };

/** The inputs in the form the screens take them (what the maker types). */
export const WB1_INPUTS = {
  lot: { soy: { paid: "4350.00", received: "20", unit: "kg", code: "SOY-DEMO-01" } },
  lotOilB: { paid: "1275.00", received: "500", unit: "g", code: "FO-B-DEMO" },
  lotWick: { paid: "450.00", received: "100", unit: "pieces", code: "WICK-DEMO-7" },
  defaultPrices: { fragranceOilA: "1850.00", vessel: "38.50" },
  items: {
    label: { price: "6.75", per: "sellable", quantity: "1" },
    giftBox: { price: "18.00", per: "sellable", quantity: "1" },
    shippingCarton: { price: "45.00", per: "batch", quantity: "1" },
  },
  labourHours: "3.5",
  labourRate: "95.00",
  overheadPercent: "12.5",
  testing: "150.00",
  candlesMade: 12,
  sellable: 10,
  wholesaleMargin: "40",
  retailPrice: "450.00",
  batchLabel: "CL-2611-A",
} as const;

type ScenarioExpected = {
  price: string;
  exVat: string;
  vat: string;
  profit: string;
  margin: string;
  batchProfit: string;
};

/** The strings the WB-1 tables show. */
export const WB1_EXPECTED = {
  materialLines: [`${P}354.63`, `${P}241.31`, `${P}83.16`, `${P}54.00`, `${P}462.00`],
  materials: `${P}1,195.10`,
  itemLines: [`${P}67.50`, `${P}180.00`, `${P}45.00`],
  labour: `${P}332.50`,
  overhead: `${P}190.95`,
  production: `${P}1,763.55`,
  perCandleMade: `${P}146.96`,
  nonSellableCost: `${P}293.93`,
  testing: `${P}150.00`,
  packaging: `${P}247.50`,
  batchTotal: `${P}2,161.05`,
  perSellable: `${P}216.11`,
  breakdown: {
    production: `${P}176.36`,
    nonSellableShare: `${P}29.39`,
    testing: `${P}15.00`,
    packaging: `${P}24.75`,
  },
  vatOff: {
    wholesale: {
      price: `${P}360.18`,
      exVat: `${P}360.18`,
      vat: `${P}0.00`,
      profit: `${P}144.07`,
      margin: "40.00%",
      batchProfit: `${P}1,440.70`,
    } satisfies ScenarioExpected,
    retail: {
      price: `${P}450.00`,
      exVat: `${P}450.00`,
      vat: `${P}0.00`,
      profit: `${P}233.89`,
      margin: "51.98%",
      batchProfit: `${P}2,338.95`,
    } satisfies ScenarioExpected,
  },
  vatOn: {
    wholesale: {
      price: `${P}403.40`,
      exVat: `${P}360.18`,
      vat: `${P}43.22`,
      profit: `${P}144.07`,
      margin: "40.00%",
      batchProfit: `${P}1,440.70`,
    } satisfies ScenarioExpected,
    retail: {
      price: `${P}450.00`,
      exVat: `${P}401.79`,
      vat: `${P}48.21`,
      profit: `${P}185.68`,
      margin: "46.21%",
      batchProfit: `${P}1,856.80`,
    } satisfies ScenarioExpected,
  },
} as const;
