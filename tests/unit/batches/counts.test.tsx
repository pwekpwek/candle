import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BatchDetail, CreateBatch } from "@/components/batches";
import { checkCandlesMade, checkSellable, validateForm } from "@/components/batches/form-model";
import { MESSAGES } from "@/lib/messages";
import { clearStores, layer, makeBatch, polyfills, seedTrace } from "./trace-harness";

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
  usePathname: () => "/",
}));

const B = MESSAGES.batches;

beforeEach(async () => {
  polyfills();
  nav.replace.mockClear();
  nav.search = "";
  await clearStores();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("candle counts form model", () => {
  it("accepts blank and whole numbers in range for candles made", () => {
    expect(checkCandlesMade("")).toBeNull();
    expect(checkCandlesMade("12")).toBeNull();
    expect(checkCandlesMade("100000")).toBeNull();
    for (const bad of ["0", "100001", "1.5", "-3", "abc", "1,000"]) {
      expect(checkCandlesMade(bad)).toBe(B.candlesMadeInvalid);
    }
  });

  it("checks sellable against candles made", () => {
    expect(checkSellable("", "")).toBeNull();
    expect(checkSellable("12", "")).toBeNull();
    expect(checkSellable("12", "0")).toBeNull();
    expect(checkSellable("12", "12")).toBeNull();
    expect(checkSellable("12", "13")).toBe(B.sellableAbove);
    expect(checkSellable("", "5")).toBe(B.sellableNeedsMade);
    expect(checkSellable("12", "1.5")).toBe(B.sellableInvalid);
    expect(checkSellable("12", "-1")).toBe(B.sellableInvalid);
    // A bad candles-made value is reported on its own field, not twice.
    expect(checkSellable("abc", "5")).toBeNull();
  });

  const base = { producedOn: "2026-11-10", label: "", notes: "", texts: {} };

  it("sends numbers, leaves blanks out on create, and nulls cleared stored values", () => {
    const send = (
      candlesMade: string,
      sellable: string,
      stored: { candlesMade?: number; sellable?: number } = {},
    ) => validateForm({ ...base, candlesMade, sellable }, [], "2026-11-20", null, null, stored).input;

    const full = send("12", "10");
    expect(full).toMatchObject({ candlesMade: 12, sellable: 10 });

    const blank = send("", "");
    expect(blank).not.toBeNull();
    expect("candlesMade" in (blank ?? {})).toBe(false);
    expect("sellable" in (blank ?? {})).toBe(false);

    expect(send("", "", { candlesMade: 12, sellable: 10 })).toMatchObject({
      candlesMade: null,
      sellable: null,
    });
    expect(send("12", "", { candlesMade: 12, sellable: 10 })).toMatchObject({
      candlesMade: 12,
      sellable: null,
    });
  });

  it("refuses bad counts with field errors and no input", () => {
    const result = validateForm(
      { ...base, candlesMade: "5", sellable: "6" },
      [],
      "2026-11-20",
    );
    expect(result.input).toBeNull();
    expect(result.errors.sellable).toBe(B.sellableAbove);
    expect(
      validateForm({ ...base, candlesMade: "", sellable: "2" }, [], "2026-11-20").errors.sellable,
    ).toBe(B.sellableNeedsMade);
  });
});

describe("candle counts on Create batch", () => {
  it("saves the counts as numbers", async () => {
    const t = await seedTrace();
    render(<CreateBatch versionId={t.version.id} />);
    await screen.findByLabelText(B.candlesMadeLabel);
    fireEvent.change(field(B.candlesMadeLabel), { target: { value: "12" } });
    fireEvent.change(field(B.sellableLabel), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const [item] = await layer().batches.list();
    expect(item.batch).toMatchObject({ candlesMade: 12, sellable: 10 });
  });

  it("saves a batch with no counts when the fields are blank", async () => {
    const t = await seedTrace();
    render(<CreateBatch versionId={t.version.id} />);
    await screen.findByLabelText(B.candlesMadeLabel);
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const [item] = await layer().batches.list();
    expect(item.batch.candlesMade).toBeUndefined();
    expect(item.batch.sellable).toBeUndefined();
  });

  it("shows sellable above candles made as a field error and creates nothing", async () => {
    const t = await seedTrace();
    render(<CreateBatch versionId={t.version.id} />);
    await screen.findByLabelText(B.candlesMadeLabel);
    fireEvent.change(field(B.candlesMadeLabel), { target: { value: "5" } });
    fireEvent.change(field(B.sellableLabel), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    const sellable = field(B.sellableLabel);
    await waitFor(() => expect(sellable).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText(B.sellableAbove)).toBeInTheDocument();
    expect(sellable).toHaveFocus();
    expect(sellable.getAttribute("aria-describedby")).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(await layer().batches.list()).toEqual([]);
  });

  it("flags sellable without candles made and a count that is not whole", async () => {
    const t = await seedTrace();
    render(<CreateBatch versionId={t.version.id} />);
    await screen.findByLabelText(B.candlesMadeLabel);
    fireEvent.change(field(B.sellableLabel), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    await waitFor(() => expect(screen.getByText(B.sellableNeedsMade)).toBeInTheDocument());
    expect(field(B.sellableLabel)).toHaveFocus();
    fireEvent.change(field(B.candlesMadeLabel), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    await waitFor(() => expect(screen.getByText(B.candlesMadeInvalid)).toBeInTheDocument());
    expect(field(B.candlesMadeLabel)).toHaveFocus();
  });
});

describe("candle counts on the batch page", () => {
  it("shows the counts when recorded and keeps them in the form", async () => {
    const t = await seedTrace();
    const batch = await makeBatch(t, { candlesMade: 12, sellable: 10 });
    render(<BatchDetail batchId={batch.id} />);
    expect(await screen.findByTestId("batch-counts")).toHaveTextContent("12 made, 10 sellable");
    expect(field(B.candlesMadeLabel).value).toBe("12");
    expect(field(B.sellableLabel).value).toBe("10");
  });

  it("shows nothing when no counts are recorded", async () => {
    const t = await seedTrace();
    const batch = await makeBatch(t);
    render(<BatchDetail batchId={batch.id} />);
    await screen.findByLabelText(B.candlesMadeLabel);
    expect(screen.queryByTestId("batch-counts")).toBeNull();
  });

  it("clears stored counts when the fields are emptied and saved", async () => {
    const t = await seedTrace();
    const batch = await makeBatch(t, { candlesMade: 12, sellable: 10 });
    render(<BatchDetail batchId={batch.id} />);
    await screen.findByTestId("batch-counts");
    fireEvent.change(field(B.candlesMadeLabel), { target: { value: "" } });
    fireEvent.change(field(B.sellableLabel), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: B.saveChanges }));
    await waitFor(() => expect(screen.getByText(B.changesSaved)).toBeInTheDocument());
    const saved = await layer().batches.get(batch.id);
    expect(saved?.batch.candlesMade).toBeUndefined();
    expect(saved?.batch.sellable).toBeUndefined();
  });

  it("keeps stored counts when a different field is changed", async () => {
    const t = await seedTrace();
    const batch = await makeBatch(t, { candlesMade: 12, sellable: 10 });
    render(<BatchDetail batchId={batch.id} />);
    await screen.findByTestId("batch-counts");
    fireEvent.change(field(B.sellableLabel), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: B.saveChanges }));
    await waitFor(() => expect(screen.getByText(B.changesSaved)).toBeInTheDocument());
    const saved = await layer().batches.get(batch.id);
    expect(saved?.batch).toMatchObject({ candlesMade: 12, sellable: 11 });
    expect(await screen.findByTestId("batch-counts")).toHaveTextContent("12 made, 11 sellable");
  });
});
