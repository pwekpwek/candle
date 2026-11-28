import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CostSheetEditor } from "@/components/cost/sheet-editor";
import { MESSAGES } from "@/lib/messages";
import { WB1_EXPECTED } from "../../fixtures/cost-worked-batch";
import { clearAll, layer, polyfillBrowser, seedFormula, seedWb1Sheet } from "./harness";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));

const M = MESSAGES.cost;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.push.mockClear();
  await clearAll();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openEditor() {
  const seeded = await seedFormula();
  const sheet = await seedWb1Sheet(seeded.version.id);
  render(<CostSheetEditor sheetId={sheet.id} />);
  await screen.findByTestId("cost-per-sellable");
  return { sheet, seeded };
}

const save = () => fireEvent.click(screen.getByRole("button", { name: M.save }));
const results = () => within(screen.getByTestId("cost-live-results"));

describe("cost sheet editor: live results", () => {
  it("shows WB-1 from the unsaved values: 216.11 per sellable candle, the batch total and the four parts", async () => {
    await openEditor();
    const r = results();
    expect(r.getByTestId("cost-per-sellable")).toHaveTextContent(WB1_EXPECTED.perSellable);
    expect(r.getByTestId("cost-batch-total")).toHaveTextContent(WB1_EXPECTED.batchTotal);
    expect(r.getByTestId("cost-materials")).toHaveTextContent(WB1_EXPECTED.materials);
    expect(r.getByTestId("cost-part-production")).toHaveTextContent(WB1_EXPECTED.breakdown.production);
    expect(r.getByTestId("cost-part-nonsellable")).toHaveTextContent(WB1_EXPECTED.breakdown.nonSellableShare);
    expect(r.getByTestId("cost-part-testing")).toHaveTextContent(WB1_EXPECTED.breakdown.testing);
    expect(r.getByTestId("cost-part-packaging")).toHaveTextContent(WB1_EXPECTED.breakdown.packaging);
    expect(r.getByText(M.roundingNote)).toBeInTheDocument();
  });

  it("updates as fields change: the VAT switch moves the scenarios to their WB-1 VAT-on figures", async () => {
    await openEditor();
    const scenarios = within(screen.getByTestId("cost-scenarios"));
    expect(scenarios.getByText(WB1_EXPECTED.vatOff.wholesale.price)).toBeInTheDocument();
    expect(scenarios.getByText(WB1_EXPECTED.vatOff.retail.margin)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: M.vatSwitch }));
    const on = within(screen.getByTestId("cost-scenarios"));
    expect(on.getByText(WB1_EXPECTED.vatOn.wholesale.price)).toBeInTheDocument();
    expect(on.getByText(WB1_EXPECTED.vatOn.retail.exVat)).toBeInTheDocument();
    expect(on.getByText(WB1_EXPECTED.vatOn.retail.vat)).toBeInTheDocument();
    expect(on.getByText(WB1_EXPECTED.vatOn.retail.margin)).toBeInTheDocument();
    expect(on.getByText(WB1_EXPECTED.vatOn.retail.profit)).toBeInTheDocument();
    expect(screen.getByText(M.vatNote)).toBeInTheDocument();
  });

  it("with no sellable candles shows no cost per candle and says why on each scenario", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText(M.sellableLabel), { target: { value: "0" } });
    const r = results();
    expect(r.getByTestId("cost-per-sellable-none")).toHaveTextContent(M.perSellableNone);
    expect(r.queryByTestId("cost-per-sellable")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("cost-scenarios")).getAllByText(M.reasonNoSellable)).toHaveLength(2);
  });

  it("keeps the last complete figures, and says so, while a field is not a valid amount", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText(M.labourHoursLabel), { target: { value: "abc" } });
    const r = results();
    expect(r.getByText(M.resultsStale)).toBeInTheDocument();
    expect(r.getByTestId("cost-per-sellable")).toHaveTextContent(WB1_EXPECTED.perSellable);
    fireEvent.change(screen.getByLabelText(M.labourHoursLabel), { target: { value: "0" } });
    expect(r.queryByText(M.resultsStale)).not.toBeInTheDocument();
    expect(r.getByTestId("cost-labour")).toHaveTextContent("₱0.00");
  });

  it("warns that the sheet is incomplete when a line has no price", async () => {
    await openEditor();
    const oilA = screen.getAllByTestId("cost-edit-line")[1];
    fireEvent.click(within(oilA).getByRole("radio", { name: M.priceNone }));
    expect(results().getByText(M.incompleteTitle)).toBeInTheDocument();
    expect(results().getByText(M.incompleteBody(1))).toBeInTheDocument();
    // Fragrance oil A's ₱241.31 drops out of the materials.
    expect(results().getByTestId("cost-materials")).toHaveTextContent("₱953.79");
  });
});

describe("cost sheet editor: field errors", () => {
  it("marks each problem, focuses the first one and sends nothing", async () => {
    const { sheet } = await openEditor();
    const update = vi.spyOn(layer().costSheets, "update");
    fireEvent.change(screen.getByLabelText(M.candlesLabel), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(M.sellableLabel), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText(M.labourRateLabel), { target: { value: "95.123" } });
    save();

    const candles = screen.getByLabelText(M.candlesLabel);
    await waitFor(() => expect(candles).toHaveFocus());
    expect(candles).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(M.errCandlesRequired)).toBeInTheDocument();
    expect(screen.getByText(M.errSellableWhole)).toBeInTheDocument();
    expect(screen.getByText(M.errMoney)).toBeInTheDocument();
    expect(screen.getByText(M.fixFields)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    expect((await layer().costSheets.get(sheet.id))?.sheet.candlesMade).toBe(12);
  });

  it("refuses sellable above candles made and a margin of 100 or more", async () => {
    await openEditor();
    const update = vi.spyOn(layer().costSheets, "update");
    fireEvent.change(screen.getByLabelText(M.sellableLabel), { target: { value: "13" } });
    fireEvent.change(screen.getByLabelText(M.scenarioMarginLabel(M.wholesale)), { target: { value: "100" } });
    save();
    expect(await screen.findByText(M.errSellableOver)).toBeInTheDocument();
    expect(screen.getByText(M.errMarginRange)).toBeInTheDocument();
    expect(screen.getByLabelText(M.sellableLabel)).toHaveFocus();
    expect(update).not.toHaveBeenCalled();
  });

  it("checks typed prices, item fields, pieces per candle and a retail price below 1 centavo", async () => {
    await openEditor();
    const lines = screen.getAllByTestId("cost-edit-line");
    fireEvent.click(within(lines[0]).getByRole("radio", { name: M.priceTyped }));
    save();
    expect(await screen.findByText(M.errPriceRequired)).toBeInTheDocument();
    fireEvent.change(within(lines[4]).getByLabelText(M.piecesLabel("Tin 180")), { target: { value: "51" } });
    fireEvent.click(screen.getByRole("button", { name: M.itemAddOneOff }));
    fireEvent.change(screen.getByLabelText(M.scenarioPriceLabel(M.retail)), { target: { value: "0" } });
    save();
    expect(await screen.findByText(M.errPiecesPerCandle(50))).toBeInTheDocument();
    expect(screen.getByText(M.errItemName(60))).toBeInTheDocument();
    expect(screen.getByText(M.errPriceMin)).toBeInTheDocument();
  });
});

describe("cost sheet editor: what is sent to update", () => {
  it("sends every stored key with unchanged, typed and no prices, pieces per candle, items and scenarios, then says Saved", async () => {
    const { sheet } = await openEditor();
    const update = vi.spyOn(layer().costSheets, "update");
    const lines = screen.getAllByTestId("cost-edit-line");

    // The original snapshot price stays shown until it is changed.
    expect(within(lines[0]).getByTestId("cost-original-price")).toHaveTextContent("Lot SOY-DEMO-01: ₱4,350.00 for 20 kg");
    expect(within(lines[1]).getByTestId("cost-original-price")).toHaveTextContent("Material price ₱1,850.00 per kg");

    fireEvent.change(screen.getByLabelText(M.titleLabel), { target: { value: "  Holiday run  " } });
    fireEvent.click(within(lines[0]).getByRole("radio", { name: M.priceTyped }));
    fireEvent.change(within(lines[0]).getByLabelText(M.priceTypedLabelKg("Soy wax")), { target: { value: "1,900.00" } });
    fireEvent.click(within(lines[1]).getByRole("radio", { name: M.priceNone }));
    fireEvent.change(within(lines[4]).getByLabelText(M.piecesLabel("Tin 180")), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("radio", { name: M.overheadFixed }));
    fireEvent.change(screen.getByLabelText(M.overheadFixedLabel), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("switch", { name: M.vatSwitch }));
    save();

    expect(await screen.findByText(M.saved)).toBeInTheDocument();
    expect(update).toHaveBeenCalledTimes(1);
    const [id, input] = update.mock.calls[0];
    expect(id).toBe(sheet.id);
    expect(input.title).toBe("Holiday run");
    expect(input.candlesMade).toBe(12);
    expect(input.sellable).toBe(10);
    expect(input.materials.map((m) => m.key)).toEqual(sheet.materials.map((m) => m.key));
    expect(input.materials[0]).toEqual({ key: sheet.materials[0].key, price: { source: "sheet", unitCentavos: 190_000 } });
    expect(input.materials[1]).toEqual({ key: sheet.materials[1].key, price: { source: "none" } });
    // Unchanged: the stored price object goes back as it was.
    expect(input.materials[2]).toEqual({ key: sheet.materials[2].key, price: sheet.materials[2].price });
    expect(input.materials[3]).toEqual({ key: "wick", perCandle: 1, price: sheet.materials[3].price });
    expect(input.materials[4]).toEqual({ key: "vessel", perCandle: 2, price: sheet.materials[4].price });
    expect(input.items.map((i) => i.id)).toEqual(sheet.items.map((i) => i.id));
    expect(input.items[0]).toMatchObject({ itemId: null, name: "Label", unitCentavos: 675, per: "sellable", quantity: 1 });
    expect(input.labourHoursX100).toBe(350);
    expect(input.labourRateCentavos).toBe(9_500);
    expect(input.overhead).toEqual({ mode: "fixed", centavos: 20_000 });
    expect(input.testingCentavos).toBe(15_000);
    expect(input.pricesIncludeVat).toBe(true);
    expect(input.wholesale).toEqual({ mode: "margin", marginBp: 4_000 });
    expect(input.retail).toEqual({ mode: "price", priceCentavos: 45_000 });

    const stored = (await layer().costSheets.get(sheet.id))?.sheet;
    expect(stored?.title).toBe("Holiday run");
    expect(stored?.materials[0].price).toEqual({ source: "sheet", unitCentavos: 190_000 });
    expect(stored?.materials[1].price).toEqual({ source: "none" });
    expect(stored?.pricesIncludeVat).toBe(true);
  });

  it("adds an item from the packaging list (copying its name and price) and a one-off, and removes one", async () => {
    const item = await layer().costItems.create({ name: "Demo ribbon", unitCentavos: 1_250 });
    const { sheet } = await openEditor();
    const update = vi.spyOn(layer().costSheets, "update");

    fireEvent.change(screen.getByLabelText(M.itemPickerLabel), { target: { value: item.id } });
    fireEvent.click(screen.getByRole("button", { name: M.itemAddFromList }));
    const rows = screen.getAllByTestId("cost-edit-item");
    expect(rows).toHaveLength(4);
    expect(within(rows[3]).getByLabelText(M.itemName)).toHaveValue("Demo ribbon");
    expect(within(rows[3]).getByLabelText(M.itemPrice)).toHaveValue("12.50");

    fireEvent.click(screen.getByRole("button", { name: M.itemAddOneOff }));
    const added = screen.getAllByTestId("cost-edit-item")[4];
    fireEvent.change(within(added).getByLabelText(M.itemName), { target: { value: "Tissue paper" } });
    fireEvent.change(within(added).getByLabelText(M.itemPrice), { target: { value: "3" } });
    fireEvent.change(within(added).getByLabelText(M.itemPer), { target: { value: "batch" } });
    fireEvent.change(within(added).getByLabelText(M.itemQuantity), { target: { value: "2" } });

    fireEvent.click(within(screen.getAllByTestId("cost-edit-item")[0]).getByRole("button", { name: M.itemRemove("Label") }));
    save();

    expect(await screen.findByText(M.saved)).toBeInTheDocument();
    const input = update.mock.calls[0][1];
    expect(input.items).toHaveLength(4);
    expect(input.items[0].name).toBe("Gift box");
    expect(input.items[2]).toEqual({ itemId: item.id, name: "Demo ribbon", unitCentavos: 1_250, per: "sellable", quantity: 1 });
    expect(input.items[3]).toEqual({ itemId: null, name: "Tissue paper", unitCentavos: 300, per: "batch", quantity: 2 });
    expect(input.items[2]).not.toHaveProperty("id");
    expect((await layer().costSheets.get(sheet.id))?.sheet.items).toHaveLength(4);
  });

  it("disables adding at 30 items", async () => {
    await openEditor();
    for (let i = 0; i < 27; i++) fireEvent.click(screen.getByRole("button", { name: M.itemAddOneOff }));
    expect(screen.getAllByTestId("cost-edit-item")).toHaveLength(30);
    expect(screen.getByRole("button", { name: M.itemAddOneOff })).toBeDisabled();
    expect(screen.getByText(M.itemsAtMax(30))).toBeInTheDocument();
  });

  it("shows a form error when the data layer calls the values invalid, and a not-found state when the sheet is gone", async () => {
    const { sheet } = await openEditor();
    const { DataError } = await import("@/lib/db");
    vi.spyOn(layer().costSheets, "update").mockRejectedValueOnce(new DataError("invalid", "no"));
    save();
    expect(await screen.findByText(M.saveInvalid)).toBeInTheDocument();
    expect(screen.queryByText(M.saved)).not.toBeInTheDocument();

    vi.spyOn(layer().costSheets, "update").mockRejectedValueOnce(new DataError("not-found", "gone"));
    save();
    expect(await screen.findByRole("heading", { name: M.notFoundTitle })).toBeInTheDocument();
    expect(sheet.id).toBeTruthy();
  });

  it("ignores a second press while a save is running", async () => {
    await openEditor();
    let release: () => void = () => {};
    const real = layer().costSheets.update.bind(layer().costSheets);
    const update = vi.spyOn(layer().costSheets, "update").mockImplementation(
      (id, input) => new Promise((resolve, reject) => { release = () => real(id, input).then(resolve, reject); }),
    );
    save();
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    release();
    expect(await screen.findByText(M.saved)).toBeInTheDocument();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("cost sheet editor: missing sheet", () => {
  it("says the sheet was not found", async () => {
    render(<CostSheetEditor sheetId={crypto.randomUUID()} />);
    expect(await screen.findByRole("heading", { name: M.notFoundTitle })).toBeInTheDocument();
  });
});
