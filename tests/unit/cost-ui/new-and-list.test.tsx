import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BatchCostSection, FormulaCostSection } from "@/components/cost";
import { CostList } from "@/components/cost/cost-list";
import { NewCostSheet } from "@/components/cost/new-sheet";
import { MESSAGES } from "@/lib/messages";
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

describe("new cost sheet", () => {
  it("starts a version sheet: suggests the vessel count, follows Candles made for Sellable, then opens the editor", async () => {
    const seeded = await seedFormula();
    render(<NewCostSheet versionId={seeded.version.id} batchId="" />);
    const candles = await screen.findByLabelText(M.candlesLabel);
    expect(screen.getByText(M.newDescriptionVersion(1, "Demo Soy Blend"))).toBeInTheDocument();
    expect(screen.getByText(M.candlesHintVessels(6))).toBeInTheDocument();
    expect(candles).toHaveValue("6");
    fireEvent.change(candles, { target: { value: "12" } });
    expect(screen.getByLabelText(M.sellableLabel)).toHaveValue("12");
    fireEvent.change(screen.getByLabelText(M.titleLabel), { target: { value: "  Retail run  " } });
    fireEvent.click(screen.getByRole("button", { name: M.createButton }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
    const [sheet] = (await layer().costSheets.list()).map((i) => i.sheet);
    expect(nav.push).toHaveBeenCalledWith(`/costs/${sheet.id}/edit`);
    expect(sheet).toMatchObject({ title: "Retail run", basis: "version", candlesMade: 12, sellable: 12, batchId: null });
  });

  it("refuses empty or fractional counts and sellable above candles made, focusing the first problem", async () => {
    const seeded = await seedFormula();
    render(<NewCostSheet versionId={seeded.version.id} batchId="" />);
    const candles = await screen.findByLabelText(M.candlesLabel);
    const create = vi.spyOn(layer().costSheets, "create");
    fireEvent.change(candles, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: M.createButton }));
    expect(await screen.findByText(M.errCandlesRequired)).toBeInTheDocument();
    await waitFor(() => expect(candles).toHaveFocus());

    fireEvent.change(candles, { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: M.createButton }));
    expect(await screen.findByText(M.errCandlesWhole)).toBeInTheDocument();

    fireEvent.change(candles, { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(M.sellableLabel), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: M.createButton }));
    expect(await screen.findByText(M.errSellableOver)).toBeInTheDocument();
    expect(screen.getByLabelText(M.sellableLabel)).toHaveFocus();
    expect(create).not.toHaveBeenCalled();
  });

  it("prefills a batch sheet from the batch's counts and sends the same sheet id on a retry", async () => {
    const seeded = await seedFormula();
    const batch = await seedBatch(seeded.version.id, { candlesMade: 12, sellable: 10 });
    render(<NewCostSheet versionId="" batchId={batch.id} />);
    expect(await screen.findByLabelText(M.candlesLabel)).toHaveValue("12");
    expect(screen.getByLabelText(M.sellableLabel)).toHaveValue("10");
    expect(screen.getByText(M.newDescriptionBatch("CL-2611-A"))).toBeInTheDocument();

    const real = layer().costSheets.create.bind(layer().costSheets);
    const create = vi
      .spyOn(layer().costSheets, "create")
      .mockRejectedValueOnce(new Error("disk"))
      .mockImplementation(real);
    fireEvent.click(screen.getByRole("button", { name: M.createButton }));
    expect(await screen.findByText(M.createFailed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: M.createButton }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].sheetId).toBe(create.mock.calls[1][0].sheetId);
    expect(await layer().costSheets.list()).toHaveLength(1);
  });

  it("asks for the counts when the batch has none", async () => {
    const seeded = await seedFormula();
    const batch = await seedBatch(seeded.version.id);
    render(<NewCostSheet versionId="" batchId={batch.id} />);
    expect(await screen.findByLabelText(M.candlesLabel)).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: M.createButton }));
    expect(await screen.findByText(M.errCandlesRequired)).toBeInTheDocument();
  });

  it("says there is nothing to cost for a missing version", async () => {
    render(<NewCostSheet versionId={crypto.randomUUID()} batchId="" />);
    expect(await screen.findByRole("heading", { name: M.newMissingTitle })).toBeInTheDocument();
  });
});

describe("cost sheet list", () => {
  async function seedTwo() {
    const seeded = await seedFormula();
    const batch = await seedBatch(seeded.version.id, { candlesMade: 12, sellable: 10 });
    const versionSheet = await seedWb1Sheet(seeded.version.id, { title: "Version costing" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const { sheet: batchSheet } = await layer().costSheets.create({
      sheetId: crypto.randomUUID(),
      basis: { kind: "batch", batchId: batch.id },
      title: "Batch costing",
    });
    return { seeded, batch, versionSheet, batchSheet };
  }

  it("lists every sheet newest first with its basis, counts, cost per sellable candle and an Incomplete badge", async () => {
    await seedTwo();
    render(<CostList />);
    const rows = await screen.findAllByTestId("cost-sheet-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Batch costing");
    expect(rows[0]).toHaveTextContent("From batch CL-2611-A");
    expect(rows[0]).toHaveTextContent("12 made, 10 sellable");
    // No prices were set for the batch sheet's lines, so it is incomplete.
    expect(within(rows[0]).getByTestId("cost-incomplete-badge")).toHaveTextContent(M.incompleteBadge);
    expect(rows[1]).toHaveTextContent("Version costing");
    expect(rows[1]).toHaveTextContent("From version 1 of Demo Soy Blend");
    expect(rows[1]).toHaveTextContent("₱216.11 per sellable candle");
    expect(within(rows[1]).queryByTestId("cost-incomplete-badge")).not.toBeInTheDocument();
  });

  it("says No sellable candles for a sheet with none", async () => {
    const seeded = await seedFormula();
    await seedWb1Sheet(seeded.version.id, { sellable: 0 });
    render(<CostList />);
    expect(await screen.findByText(M.noSellable)).toBeInTheDocument();
  });

  it("filters by batch and by formula, with a way back to all", async () => {
    const { batch, seeded } = await seedTwo();
    nav.search = `batch=${batch.id}`;
    const { unmount } = render(<CostList />);
    expect(await screen.findAllByTestId("cost-sheet-row")).toHaveLength(1);
    expect(screen.getByTestId("cost-filter")).toHaveTextContent(M.filterBatch("CL-2611-A"));
    fireEvent.click(screen.getByRole("button", { name: M.filterClear }));
    expect(nav.replace).toHaveBeenCalledWith("/costs");
    unmount();

    nav.search = `formula=${seeded.formula.id}`;
    render(<CostList />);
    expect(await screen.findAllByTestId("cost-sheet-row")).toHaveLength(2);
    expect(screen.getByTestId("cost-filter")).toHaveTextContent(M.filterFormula("Demo Soy Blend"));
  });

  it("shows an empty state, and a plain message with a way back when a filter matches nothing", async () => {
    render(<CostList />);
    expect(await screen.findByText(M.listEmptyTitle)).toBeInTheDocument();
    cleanup();
    nav.search = `batch=${crypto.randomUUID()}`;
    render(<CostList />);
    expect(await screen.findByText(M.listEmptyFiltered)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: M.filterClear })).toBeInTheDocument();
  });
});

describe("sections on the batch and formula pages", () => {
  it("the batch section lists the batch's sheets and links to New cost sheet and All cost sheets", async () => {
    const seeded = await seedFormula();
    const batch = await seedBatch(seeded.version.id, { candlesMade: 12, sellable: 10 });
    render(<BatchCostSection batchId={batch.id} />);
    expect(await screen.findByText(M.sectionEmptyBatch)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: M.sectionHeading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: M.newSheet })).toHaveAttribute("href", `/costs/new?batch=${batch.id}`);
    expect(screen.getByRole("link", { name: M.allSheets })).toHaveAttribute("href", `/costs?batch=${batch.id}`);
    cleanup();

    await layer().costSheets.create({
      sheetId: crypto.randomUUID(),
      basis: { kind: "batch", batchId: batch.id },
      title: "Batch costing",
    });
    render(<BatchCostSection batchId={batch.id} />);
    const row = await screen.findByTestId("cost-sheet-row");
    expect(row).toHaveTextContent("Batch costing");
  });

  it("the formula section offers a new sheet from the version on screen and links to the formula's sheets", async () => {
    const seeded = await seedFormula();
    await seedWb1Sheet(seeded.version.id);
    render(<FormulaCostSection formulaId={seeded.formula.id} versionId={seeded.version.id} />);
    expect(await screen.findByTestId("cost-sheet-row")).toHaveTextContent("₱216.11 per sellable candle");
    expect(screen.getByRole("heading", { name: M.formulaSectionHeading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: M.newSheetFromVersion(1) })).toHaveAttribute(
      "href",
      `/costs/new?version=${seeded.version.id}`,
    );
    expect(screen.getByRole("link", { name: M.allSheets })).toHaveAttribute("href", `/costs?formula=${seeded.formula.id}`);
  });
});
