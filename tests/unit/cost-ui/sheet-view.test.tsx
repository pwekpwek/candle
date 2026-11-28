import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CostSheetView } from "@/components/cost/sheet-view";
import { MESSAGES } from "@/lib/messages";
import { WB1_EXPECTED, WB1_FIGURES, WB1_FIGURES_VAT } from "../../fixtures/cost-worked-batch";
import { clearAll, layer, polyfillBrowser, seedBatch, seedFormula, seedWb1Sheet } from "./harness";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/costs",
}));

const M = MESSAGES.cost;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.search = "";
  await clearAll();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openSheet(figures = WB1_FIGURES, patch: Parameters<typeof seedWb1Sheet>[1] = {}) {
  const seeded = await seedFormula();
  const sheet = await seedWb1Sheet(seeded.version.id, patch, figures);
  render(<CostSheetView sheetId={sheet.id} />);
  await screen.findByTestId("cost-results");
  return { seeded, sheet };
}

const lineText = (i: number) => screen.getAllByTestId("cost-material-line")[i].textContent ?? "";

describe("cost sheet page: lines and price sources", () => {
  it("names each line's quantity and where its price came from, with WB-1's amounts", async () => {
    await openSheet();
    const lines = screen.getAllByTestId("cost-material-line");
    expect(lines).toHaveLength(5);
    expect(lineText(0)).toContain("1,630.50 g measured");
    expect(lineText(0)).toContain("Lot SOY-DEMO-01: ₱4,350.00 for 20 kg");
    expect(lineText(1)).toContain("130.44 g measured");
    expect(lineText(1)).toContain("Material price ₱1,850.00 per kg");
    expect(lineText(2)).toContain("Lot FO-B-DEMO: ₱1,275.00 for 500 g");
    expect(lineText(3)).toContain("1 per candle × 12");
    expect(lineText(3)).toContain("Lot WICK-DEMO-7: ₱450.00 for 100 pieces");
    expect(lineText(4)).toContain("1 per candle × 12");
    expect(lineText(4)).toContain("Material price ₱38.50 each");
    WB1_EXPECTED.materialLines.forEach((amount, i) => expect(lineText(i)).toContain(amount));
    const items = within(screen.getByTestId("cost-item-lines"));
    for (const amount of WB1_EXPECTED.itemLines) expect(items.getByText(amount)).toBeInTheDocument();
    expect(items.getAllByText(/1 per sellable candle × 10/)).toHaveLength(2);
    expect(items.getByText(/1 per batch/)).toBeInTheDocument();
  });

  it("says Planned (not measured), Typed on this sheet and No price, and warns the sheet is incomplete", async () => {
    const figures = {
      ...WB1_FIGURES,
      materials: WB1_FIGURES.materials.map((line, i) => {
        if (i === 0) return { ...line, quantity: { unit: "mg" as const, mg: 1_630_500, from: "planned" as const } };
        if (i === 1) return { ...line, price: { source: "sheet" as const, unitCentavos: 190_000 } };
        if (i === 4) return { ...line, price: { source: "none" as const } };
        return line;
      }),
    };
    await openSheet(figures);
    expect(lineText(0)).toContain("Planned (not measured): 1,630.50 g");
    expect(lineText(1)).toContain("Typed on this sheet: ₱1,900.00 per kg");
    expect(lineText(4)).toContain(M.sourceNone);
    expect(screen.getByText(M.incompleteTitle)).toBeInTheDocument();
    expect(screen.getByText(M.incompleteBody(1))).toBeInTheDocument();
  });

  it("shows the totals, the cost per sellable candle and its four parts, and the rounding note", async () => {
    await openSheet();
    expect(screen.getByTestId("cost-per-sellable")).toHaveTextContent(WB1_EXPECTED.perSellable);
    expect(screen.getByTestId("cost-batch-total")).toHaveTextContent(WB1_EXPECTED.batchTotal);
    expect(screen.getByTestId("cost-production")).toHaveTextContent(WB1_EXPECTED.production);
    expect(screen.getByTestId("cost-labour")).toHaveTextContent(WB1_EXPECTED.labour);
    expect(screen.getByTestId("cost-overhead")).toHaveTextContent(WB1_EXPECTED.overhead);
    expect(screen.getByTestId("cost-per-candle-made")).toHaveTextContent(WB1_EXPECTED.perCandleMade);
    expect(screen.getByTestId("cost-non-sellable")).toHaveTextContent(WB1_EXPECTED.nonSellableCost);
    expect(screen.getByTestId("cost-testing")).toHaveTextContent(WB1_EXPECTED.testing);
    expect(screen.getByTestId("cost-packaging")).toHaveTextContent(WB1_EXPECTED.packaging);
    expect(screen.getByTestId("cost-part-production")).toHaveTextContent(WB1_EXPECTED.breakdown.production);
    expect(screen.getByTestId("cost-part-nonsellable")).toHaveTextContent(WB1_EXPECTED.breakdown.nonSellableShare);
    expect(screen.queryByText(M.incompleteTitle)).not.toBeInTheDocument();
    expect(screen.getByText("Each figure is rounded to the centavo on its own; totals use the unrounded amounts.")).toBeInTheDocument();
  });
});

describe("cost sheet page: scenarios", () => {
  it("with the VAT switch off shows price, profit, margin and batch profit and no VAT rows", async () => {
    await openSheet();
    const s = within(screen.getByTestId("cost-scenarios"));
    const { wholesale, retail } = WB1_EXPECTED.vatOff;
    for (const text of [wholesale.price, wholesale.profit, wholesale.margin, wholesale.batchProfit]) {
      expect(s.getByText(text)).toBeInTheDocument();
    }
    for (const text of [retail.price, retail.profit, retail.margin, retail.batchProfit]) {
      expect(s.getByText(text)).toBeInTheDocument();
    }
    expect(s.queryByText(M.rowExVat)).not.toBeInTheDocument();
    expect(s.queryByText(M.rowVat)).not.toBeInTheDocument();
    expect(s.getByText(M.scenarioSetByMargin("40%"))).toBeInTheDocument();
    expect(s.getByText(M.scenarioSetByPrice)).toBeInTheDocument();
  });

  it("with the VAT switch on adds the price without VAT and the VAT, with margins on the ex-VAT price", async () => {
    await openSheet(WB1_FIGURES_VAT, { pricesIncludeVat: true });
    const s = within(screen.getByTestId("cost-scenarios"));
    const { wholesale, retail } = WB1_EXPECTED.vatOn;
    expect(s.getByText(M.rowExVat)).toBeInTheDocument();
    expect(s.getByText(M.rowVat)).toBeInTheDocument();
    for (const text of [wholesale.price, wholesale.vat, retail.exVat, retail.vat, retail.profit, retail.margin, retail.batchProfit]) {
      expect(s.getByText(text)).toBeInTheDocument();
    }
    expect(s.getAllByText(wholesale.profit).length).toBeGreaterThan(0);
    expect(s.getByText(M.vatOnNote)).toBeInTheDocument();
  });

  it("says Not set for a scenario with no setting", async () => {
    await openSheet({ ...WB1_FIGURES, wholesale: null });
    const s = within(screen.getByTestId("cost-scenarios"));
    expect(s.getAllByText(M.scenarioNotSet)).toHaveLength(2);
    expect(s.getByText(WB1_EXPECTED.vatOff.retail.price)).toBeInTheDocument();
  });

  it("says why when there are no sellable candles or the margin cannot be reached", async () => {
    await openSheet({ ...WB1_FIGURES, sellable: 0 });
    expect(screen.getByTestId("cost-per-sellable-none")).toBeInTheDocument();
    expect(within(screen.getByTestId("cost-scenarios")).getAllByText(M.reasonNoSellable)).toHaveLength(2);
    cleanup();
    await clearAll();
    await openSheet({ ...WB1_FIGURES, wholesale: { mode: "margin", marginBp: 10_000 } });
    expect(within(screen.getByTestId("cost-scenarios")).getByText(M.reasonMarginUnreachable)).toBeInTheDocument();
  });

  it("shows a loss with a minus sign and no good or bad colour", async () => {
    await openSheet({ ...WB1_FIGURES, retail: { mode: "price", priceCentavos: 10_000 } });
    const s = within(screen.getByTestId("cost-scenarios"));
    const profit = s.getByText("-₱116.11");
    expect(profit).toBeInTheDocument();
    expect(s.getByText("-116.11%")).toBeInTheDocument();
    expect(profit.className).not.toMatch(/destructive|success|warning/);
  });
});

describe("cost sheet page: basis, copy and delete", () => {
  it("links back to the formula and version, and to the batch for a batch sheet", async () => {
    const seeded = await seedFormula();
    const batch = await seedBatch(seeded.version.id, { candlesMade: 12, sellable: 10 });
    const { sheet } = await layer().costSheets.create({
      sheetId: crypto.randomUUID(),
      basis: { kind: "batch", batchId: batch.id },
      title: "From the pour",
    });
    render(<CostSheetView sheetId={sheet.id} />);
    expect(await screen.findByTestId("cost-basis")).toHaveTextContent("From batch CL-2611-A");
    expect(screen.getByRole("link", { name: M.basisBatchLink("CL-2611-A") })).toHaveAttribute("href", `/batches/${batch.id}`);
    expect(screen.getByRole("link", { name: M.basisVersionLink(1, "Demo Soy Blend") })).toHaveAttribute(
      "href",
      `/formulas/${seeded.formula.id}/versions/${seeded.version.id}`,
    );
    expect(screen.getByRole("link", { name: M.formulaLink("Demo Soy Blend") })).toHaveAttribute("href", `/formulas/${seeded.formula.id}`);
  });

  it("says where a copy came from, or that the original was deleted", async () => {
    const seeded = await seedFormula();
    const original = await seedWb1Sheet(seeded.version.id, { title: "First costing" });
    const copy = await seedWb1Sheet(seeded.version.id, { title: "Second costing", copiedFromId: original.id });
    render(<CostSheetView sheetId={copy.id} />);
    const from = await screen.findByTestId("cost-copied-from");
    expect(from).toHaveTextContent("Copied from First costing");
    expect(within(from).getByRole("link", { name: "First costing" })).toHaveAttribute("href", `/costs/${original.id}`);
    cleanup();

    await layer().costSheets.delete(original.id);
    render(<CostSheetView sheetId={copy.id} />);
    expect(await screen.findByText(M.copiedFromDeleted)).toBeInTheDocument();
  });

  it("Copy and update makes a new sheet with a fresh id, leaves the original and opens the copy with a notice", async () => {
    const { sheet } = await openSheet();
    fireEvent.click(screen.getByRole("button", { name: M.copyUpdate }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
    const target = nav.push.mock.calls[0][0] as string;
    const match = /^\/costs\/([0-9a-f-]{36})\?copied=1$/.exec(target);
    expect(match).not.toBeNull();
    const copyId = match![1];
    expect(copyId).not.toBe(sheet.id);
    const all = await layer().costSheets.list();
    expect(all.map((i) => i.sheet.id).sort()).toEqual([sheet.id, copyId].sort());
    const copy = all.find((i) => i.sheet.id === copyId)!.sheet;
    expect(copy.copiedFromId).toBe(sheet.id);
    expect((await layer().costSheets.get(sheet.id))?.sheet.updatedAt).toBe(sheet.updatedAt);
  });

  it("shows the copied notice once from ?copied=1 and cleans the URL", async () => {
    nav.search = "copied=1";
    await openSheet();
    expect(await screen.findByText(M.copiedNotice)).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/costs\/[0-9a-f-]{36}$/), { scroll: false }));
  });

  it("offers Try again when a copy fails, without leaving the sheet", async () => {
    await openSheet();
    vi.spyOn(layer().costSheets, "copy").mockRejectedValueOnce(new Error("disk"));
    fireEvent.click(screen.getByRole("button", { name: M.copyUpdate }));
    expect(await screen.findByText(M.copyFailed)).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("deletes only the sheet after confirmation, and keeps it when the maker keeps it", async () => {
    const { seeded, sheet } = await openSheet();
    fireEvent.click(screen.getByRole("button", { name: M.deleteButton }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(M.deleteBody("Price list sheet"))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: M.deleteKeep }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await layer().costSheets.get(sheet.id)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: M.deleteButton }));
    const again = await screen.findByRole("dialog");
    fireEvent.click(within(again).getByRole("button", { name: M.deleteConfirm }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/costs"));
    expect(await layer().costSheets.get(sheet.id)).toBeUndefined();
    expect(await layer().formulas.get(seeded.formula.id)).toBeDefined();
    expect(await layer().versions.get(seeded.version.id)).toBeDefined();
  });

  it("says the sheet was not found for a missing id", async () => {
    render(<CostSheetView sheetId={crypto.randomUUID()} />);
    expect(await screen.findByRole("heading", { name: M.notFoundTitle })).toBeInTheDocument();
  });
});
