import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  LotsView,
  emptyLotValues,
  lotPriceText,
  lotValuesFrom,
  toLotInput,
  validateLot,
  type LotContext,
} from "@/components/lots";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { clearDatabase, waitLoaded } from "./helpers";

const L = MESSAGES.lots;

beforeEach(clearDatabase);
afterEach(() => cleanup());

const layer = () => getDataLayer();
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

async function renderView() {
  render(<LotsView initialMaterialId={null} />);
  await waitLoaded(L.loading);
}

async function openAdd() {
  fireEvent.click(screen.getAllByRole("button", { name: L.addLot })[0]);
  return screen.findByRole("dialog");
}

const pressSave = () => fireEvent.click(screen.getByRole("button", { name: L.save }));

describe("lot purchase form model", () => {
  const ctx: LotContext = {
    lots: [],
    editingId: null,
    today: "2026-11-20",
    materialTypes: { wax: "wax", wick: "wick" },
  };
  const values = (extra = {}) => ({ ...emptyLotValues("wax"), code: "LOT-TEST-1", ...extra });

  it("sends no purchase when both fields are blank", () => {
    expect(toLotInput(values(), ctx).purchase).toBeUndefined();
  });

  it("converts kg and g to milligrams exactly", () => {
    expect(toLotInput(values({ paid: "4350", quantity: "20", unit: "kg" }), ctx).purchase).toEqual({
      paidCentavos: 435000,
      quantity: 20_000_000,
    });
    expect(toLotInput(values({ paid: "1275.00", quantity: "500", unit: "g" }), ctx).purchase).toEqual({
      paidCentavos: 127500,
      quantity: 500_000,
    });
    expect(
      toLotInput(values({ paid: "1", quantity: "0.000001", unit: "kg" }), ctx).purchase?.quantity,
    ).toBe(1);
  });

  it("takes whole pieces for wicks and vessels", () => {
    const wick = values({ materialId: "wick", paid: "450", quantity: "100" });
    expect(toLotInput(wick, ctx).purchase).toEqual({ paidCentavos: 45000, quantity: 100 });
    expect(validateLot({ ...wick, quantity: "1.5" }, ctx).quantity).toBe(L.quantityPiecesInvalid);
    expect(validateLot({ ...wick, quantity: "0" }, ctx).quantity).toBe(L.quantityPiecesInvalid);
    expect(validateLot({ ...wick, quantity: "1000001" }, ctx).quantity).toBe(L.quantityPiecesInvalid);
  });

  it("needs both or neither", () => {
    expect(validateLot(values({ paid: "10" }), ctx)).toEqual({ quantity: L.quantityMissing });
    expect(validateLot(values({ quantity: "5" }), ctx)).toEqual({ paid: L.paidMissing });
    expect(validateLot(values({ paid: "10", quantity: "5" }), ctx)).toEqual({});
  });

  it("checks money and weight text", () => {
    expect(validateLot(values({ paid: "abc", quantity: "5" }), ctx).paid).toBe(L.paidInvalid);
    expect(validateLot(values({ paid: "1.234", quantity: "5" }), ctx).paid).toBe(L.paidDecimals);
    expect(validateLot(values({ paid: "10000000.01", quantity: "5" }), ctx).paid).toBe(L.paidRange);
    expect(validateLot(values({ paid: "1", quantity: "x" }), ctx).quantity).toBe(L.quantityInvalid);
    expect(validateLot(values({ paid: "1", quantity: "1.0000001", unit: "kg" }), ctx).quantity).toBe(
      L.quantityKgDecimals,
    );
    expect(validateLot(values({ paid: "1", quantity: "1.0001", unit: "g" }), ctx).quantity).toBe(
      L.quantityGDecimals,
    );
    expect(validateLot(values({ paid: "1", quantity: "0" }), ctx).quantity).toBe(L.quantityRange);
    expect(validateLot(values({ paid: "1", quantity: "1000.000001" }), ctx).quantity).toBe(
      L.quantityRange,
    );
    expect(validateLot(values({ paid: "1", quantity: "1000" }), ctx).quantity).toBeUndefined();
  });

  it("reads a stored purchase back as whole kg, else grams", () => {
    const base = { materialId: "wax", supplierId: null, code: "A" };
    expect(
      lotValuesFrom({ ...base, purchase: { paidCentavos: 435000, quantity: 20_000_000 } }, "wax"),
    ).toMatchObject({ paid: "4350.00", quantity: "20", unit: "kg" });
    expect(
      lotValuesFrom({ ...base, purchase: { paidCentavos: 127500, quantity: 500_000 } }, "wax"),
    ).toMatchObject({ quantity: "500", unit: "g" });
    expect(
      lotValuesFrom({ ...base, purchase: { paidCentavos: 45000, quantity: 100 } }, "wick"),
    ).toMatchObject({ quantity: "100" });
  });

  it("shows the price per kg or each from integers", () => {
    expect(lotPriceText({ paidCentavos: 435000, quantity: 20_000_000 }, "wax")).toBe("₱217.50 per kg");
    expect(lotPriceText({ paidCentavos: 127500, quantity: 500_000 }, "fragranceOil")).toBe(
      "₱2,550.00 per kg",
    );
    expect(lotPriceText({ paidCentavos: 45000, quantity: 100 }, "wick")).toBe("₱4.50 each");
    expect(lotPriceText(undefined, "wax")).toBeNull();
    expect(lotPriceText({ paidCentavos: 1, quantity: 1 }, undefined)).toBeNull();
  });
});

describe("lot purchase on the lots page", () => {
  it("saves a wax lot paid in pesos for kg and lists its price per kg", async () => {
    const wax = await layer().materials.create({ type: "wax", name: "Demo Wax" });
    await renderView();
    await openAdd();
    fireEvent.change(field(L.materialLabel), { target: { value: wax.id } });
    fireEvent.change(field(L.codeLabel), { target: { value: "SOY-DEMO-01" } });
    fireEvent.change(field(L.amountPaidLabel), { target: { value: "4350" } });
    fireEvent.change(field(L.quantityReceivedLabel), { target: { value: "20" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [saved] = await layer().materialLots.list();
    expect(saved.purchase).toEqual({ paidCentavos: 435000, quantity: 20_000_000 });
    const row = (await screen.findByRole("heading", { name: "SOY-DEMO-01" })).closest(
      "li",
    ) as HTMLElement;
    expect(within(row).getByTestId("lot-price")).toHaveTextContent(L.priceLine("₱217.50 per kg"));
  });

  it("offers grams, and pieces for a wick", async () => {
    const oil = await layer().materials.create({ type: "fragranceOil", name: "Demo Oil" });
    const wick = await layer().materials.create({ type: "wick", name: "Demo Wick" });
    await renderView();
    await openAdd();
    fireEvent.change(field(L.materialLabel), { target: { value: oil.id } });
    fireEvent.change(field(L.codeLabel), { target: { value: "FO-DEMO" } });
    fireEvent.change(field(L.amountPaidLabel), { target: { value: "1275" } });
    fireEvent.change(field(L.quantityReceivedLabel), { target: { value: "500" } });
    fireEvent.change(field(L.quantityUnitLabel), { target: { value: "g" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await openAdd();
    fireEvent.change(field(L.materialLabel), { target: { value: wick.id } });
    expect(screen.queryByLabelText(L.quantityUnitLabel)).toBeNull();
    fireEvent.change(field(L.codeLabel), { target: { value: "WICK-DEMO" } });
    fireEvent.change(field(L.amountPaidLabel), { target: { value: "450" } });
    fireEvent.change(field(L.quantityPiecesLabel), { target: { value: "100" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const lots = await layer().materialLots.list();
    expect(lots.find((l) => l.code === "FO-DEMO")?.purchase).toEqual({
      paidCentavos: 127500,
      quantity: 500_000,
    });
    expect(lots.find((l) => l.code === "WICK-DEMO")?.purchase).toEqual({
      paidCentavos: 45000,
      quantity: 100,
    });
    await waitFor(() => {
      const prices = screen.getAllByTestId("lot-price").map((n) => n.textContent);
      expect(prices).toContain(L.priceLine("₱2,550.00 per kg"));
      expect(prices).toContain(L.priceLine("₱4.50 each"));
    });
  });

  it("saves a lot with no purchase and shows no price", async () => {
    const wax = await layer().materials.create({ type: "wax", name: "Demo Wax" });
    await renderView();
    await openAdd();
    fireEvent.change(field(L.materialLabel), { target: { value: wax.id } });
    fireEvent.change(field(L.codeLabel), { target: { value: "NO-PRICE" } });
    pressSave();
    await screen.findByRole("heading", { name: "NO-PRICE" });
    expect(screen.queryByTestId("lot-price")).toBeNull();
    const [saved] = await layer().materialLots.list();
    expect(saved.purchase).toBeUndefined();
  });

  it("puts a field error on the missing one of the pair and saves nothing", async () => {
    const wax = await layer().materials.create({ type: "wax", name: "Demo Wax" });
    await renderView();
    await openAdd();
    fireEvent.change(field(L.materialLabel), { target: { value: wax.id } });
    fireEvent.change(field(L.codeLabel), { target: { value: "HALF" } });
    fireEvent.change(field(L.amountPaidLabel), { target: { value: "100" } });
    pressSave();
    const quantity = field(L.quantityReceivedLabel);
    await waitFor(() => expect(quantity).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText(L.quantityMissing)).toBeInTheDocument();
    expect(quantity).toHaveFocus();
    expect(await layer().materialLots.list()).toEqual([]);
  });

  it("edits a purchase and clears it again", async () => {
    const wax = await layer().materials.create({ type: "wax", name: "Demo Wax" });
    await layer().materialLots.create({
      materialId: wax.id,
      supplierId: null,
      code: "EDIT-ME",
      purchase: { paidCentavos: 435000, quantity: 20_000_000 },
    });
    await renderView();
    fireEvent.click(await screen.findByRole("button", { name: L.editLabel("EDIT-ME") }));
    await screen.findByRole("dialog");
    expect(field(L.amountPaidLabel).value).toBe("4350.00");
    expect(field(L.quantityReceivedLabel).value).toBe("20");
    fireEvent.change(field(L.amountPaidLabel), { target: { value: "" } });
    fireEvent.change(field(L.quantityReceivedLabel), { target: { value: "" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [saved] = await layer().materialLots.list();
    expect(saved.purchase).toBeUndefined();
  });
});
