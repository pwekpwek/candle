import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { BatchList, localToday } from "@/components/batches";
import { MESSAGES } from "@/lib/messages";
import {
  clearStores,
  layer,
  makeBatch,
  polyfills,
  seedTrace,
} from "./trace-harness";
import type { Trace } from "./trace-harness";

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
  usePathname: () => "/batches",
}));

const B = MESSAGES.batches;
const T = MESSAGES.batchTrace;

beforeEach(async () => {
  polyfills();
  nav.replace.mockReset();
  nav.search = "";
  await clearStores();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rowTitles = () =>
  screen
    .queryAllByTestId("batch-row")
    .map((r) => r.querySelector("a")?.textContent);

/** Run A and Run B: the same formula and version, different lots and suppliers. Run C: no lots, another date. */
async function seedBatches() {
  const t = await seedTrace();
  const wax = t.version.inputs.waxes[0].componentId;
  const a = await makeBatch(t, {
    label: "Run A",
    producedOn: "2026-11-10",
    lots: [{ part: "row", componentId: wax, lotId: t.waxLot1.id }],
  });
  const b = await makeBatch(t, {
    label: "Run B",
    producedOn: "2026-11-05",
    lots: [{ part: "row", componentId: wax, lotId: t.waxLot2.id }],
  });
  const c = await makeBatch(t, { label: "Run C", producedOn: "2026-09-01" });
  return { t, a, b, c };
}

async function renderList(search = "") {
  nav.search = search;
  render(<BatchList />);
  await screen.findByLabelText(T.searchLabel);
}

describe("batch list", () => {
  it("keeps the no-batches-yet state and hides the search when there are none", async () => {
    render(<BatchList />);
    expect(await screen.findByText(B.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByLabelText(T.searchLabel)).toBeNull();
    expect(screen.queryByText(T.noMatchTitle)).toBeNull();
  });

  it("lists every batch with its lot codes, the count and the burn tests link", async () => {
    await seedBatches();
    await renderList();
    expect(rowTitles()).toEqual(["Run A", "Run B", "Run C"]);
    expect(screen.getByText(T.count(3, 3))).toBeInTheDocument();
    const rows = screen.getAllByTestId("batch-row");
    expect(rows[0]).toHaveTextContent(B.rowLots("LOT-TEST-001"));
    expect(rows[1]).toHaveTextContent(B.rowLots("LOT-TEST-002"));
    expect(rows[2]).not.toHaveTextContent("Lots:");
    expect(
      screen.getByRole("link", { name: MESSAGES.burnCompare.batchesLink }),
    ).toHaveAttribute("href", "/burn-tests");
    expect(screen.queryByRole("button", { name: T.clearFilters })).toBeNull();
  });

  it("finds two batches of the same formula separately by search, lot and supplier", async () => {
    const { t, a, b } = await seedBatches();
    expect((await layer().batches.get(a.id))!.formula.id).toBe(
      (await layer().batches.get(b.id))!.formula.id,
    );

    await renderList("q=LOT-TEST-001");
    expect(rowTitles()).toEqual(["Run A"]);
    expect(screen.getByText(T.count(1, 3))).toBeInTheDocument();
    cleanup();

    await renderList("q=LOT-TEST-002");
    expect(rowTitles()).toEqual(["Run B"]);
    cleanup();

    await renderList("q=Example+Wax+Co");
    expect(rowTitles()).toEqual(["Run A"]);
    cleanup();

    await renderList(`lot=${t.waxLot1.id}`);
    expect(rowTitles()).toEqual(["Run A"]);
    cleanup();

    await renderList(`lot=${t.waxLot2.id}`);
    expect(rowTitles()).toEqual(["Run B"]);
    cleanup();

    await renderList(`supplier=${t.supplier.id}`);
    expect(rowTitles()).toEqual(["Run A"]);
    cleanup();

    await renderList(`supplier=${t.other.id}`);
    expect(rowTitles()).toEqual(["Run B"]);
  });

  it("search also matches the formula name and the batch label", async () => {
    await seedBatches();
    await renderList("q=lavender+vanilla");
    expect(rowTitles()).toEqual(["Run A", "Run B", "Run C"]);
    cleanup();
    await renderList("q=run+cedar");
    expect(rowTitles()).toEqual(["Run A", "Run B", "Run C"]);
    cleanup();
    await renderList("q=cedar+zzz");
    expect(rowTitles()).toEqual([]);
  });

  it("filters by formula and by production date", async () => {
    const { t } = await seedBatches();
    await renderList(`formula=${t.formulaId}`);
    expect(rowTitles()).toHaveLength(3);
    cleanup();
    await renderList("from=2026-11-01");
    expect(rowTitles()).toEqual(["Run A", "Run B"]);
    cleanup();
    await renderList("from=2026-11-01&to=2026-11-07");
    expect(rowTitles()).toEqual(["Run B"]);
    cleanup();
    await renderList("to=2026-10-01");
    expect(rowTitles()).toEqual(["Run C"]);
  });

  it("filters by cure plan and burn tests", async () => {
    await seedBatches();
    await renderList("cure=yes");
    expect(screen.getByText(T.noMatchTitle)).toBeInTheDocument();
    cleanup();
    await renderList("cure=no&burn=no");
    expect(rowTitles()).toEqual(["Run A", "Run B", "Run C"]);
  });

  it("shows a field error when from is after to", async () => {
    await seedBatches();
    await renderList("from=2026-11-10&to=2026-11-01");
    expect(screen.getByText(T.dateRangeError)).toBeInTheDocument();
    expect(screen.getByLabelText(T.fromLabel)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByLabelText(T.fromLabel).getAttribute("aria-describedby"),
    ).toBeTruthy();
    expect(screen.getByText(T.noMatchTitle)).toBeInTheDocument();
  });

  it("offers formulas and lots that batches use, and every supplier", async () => {
    const { t } = await seedBatches();
    await renderList();
    const lotTexts = within(screen.getByLabelText(T.lotLabel))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(lotTexts).toEqual([
      T.allLots,
      T.lotOption("LOT-TEST-001", "Soy wax"),
      T.lotOption("LOT-TEST-002", "Soy wax"),
    ]);
    const supplierTexts = within(screen.getByLabelText(T.supplierLabel))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(supplierTexts).toEqual([
      T.allSuppliers,
      "Example Oils Ltd",
      "Example Wax Co",
    ]);
    const formulaOptions = within(
      screen.getByLabelText(T.formulaLabel),
    ).getAllByRole("option");
    expect(formulaOptions.map((o) => (o as HTMLOptionElement).value)).toEqual([
      "",
      t.formulaId,
    ]);
  });

  it("separates no-match from no-batches and Clear filters resets the URL", async () => {
    await seedBatches();
    await renderList("q=nothing-like-this&lot=abc");
    expect(await screen.findByText(T.noMatchTitle)).toBeInTheDocument();
    expect(screen.queryByText(B.emptyTitle)).toBeNull();
    expect(screen.getByText(T.count(0, 3))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: T.clearFilters }));
    expect(nav.replace).toHaveBeenCalledWith("/batches", { scroll: false });
    expect(
      (screen.getByLabelText(T.searchLabel) as HTMLInputElement).value,
    ).toBe("");
  });

  it("writes the URL for each filter with router.replace", async () => {
    const { t } = await seedBatches();
    await renderList();
    fireEvent.change(screen.getByLabelText(T.lotLabel), {
      target: { value: t.waxLot1.id },
    });
    expect(nav.replace).toHaveBeenLastCalledWith(
      `/batches?lot=${t.waxLot1.id}`,
      { scroll: false },
    );
    fireEvent.change(screen.getByLabelText(T.supplierLabel), {
      target: { value: t.other.id },
    });
    expect(nav.replace).toHaveBeenLastCalledWith(
      `/batches?supplier=${t.other.id}`,
      {
        scroll: false,
      },
    );
    fireEvent.change(screen.getByLabelText(T.formulaLabel), {
      target: { value: t.formulaId },
    });
    expect(nav.replace).toHaveBeenLastCalledWith(
      `/batches?formula=${t.formulaId}`,
      {
        scroll: false,
      },
    );
    fireEvent.change(screen.getByLabelText(T.fromLabel), {
      target: { value: "2026-11-01" },
    });
    expect(nav.replace).toHaveBeenLastCalledWith("/batches?from=2026-11-01", {
      scroll: false,
    });
    fireEvent.change(screen.getByLabelText(T.toLabel), {
      target: { value: "2026-11-07" },
    });
    expect(nav.replace).toHaveBeenLastCalledWith("/batches?to=2026-11-07", {
      scroll: false,
    });
    fireEvent.change(screen.getByLabelText(T.curePlanLabel), {
      target: { value: "yes" },
    });
    expect(nav.replace).toHaveBeenLastCalledWith("/batches?cure=yes", {
      scroll: false,
    });
    fireEvent.change(screen.getByLabelText(T.burnTestsLabel), {
      target: { value: "no" },
    });
    expect(nav.replace).toHaveBeenLastCalledWith("/batches?burn=no", {
      scroll: false,
    });
  });

  it("keeps the other parts of the URL when one filter changes", async () => {
    const { t } = await seedBatches();
    await renderList(`q=run&lot=${t.waxLot1.id}`);
    fireEvent.change(screen.getByLabelText(T.curePlanLabel), {
      target: { value: "no" },
    });
    expect(nav.replace).toHaveBeenLastCalledWith(
      `/batches?q=run&lot=${t.waxLot1.id}&cure=no`,
      {
        scroll: false,
      },
    );
    expect(screen.getByText(T.filtersToggle(1))).toBeInTheDocument();
  });

  it("debounces the search, keeps focus and the typed text, and writes the trimmed query", async () => {
    await seedBatches();
    await renderList();
    const box = screen.getByLabelText(T.searchLabel) as HTMLInputElement;
    box.focus();
    fireEvent.change(box, { target: { value: "lot" } });
    fireEvent.change(box, { target: { value: "lot-test " } });
    expect(nav.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
    expect(nav.replace).toHaveBeenCalledWith("/batches?q=lot-test", {
      scroll: false,
    });
    expect(box).toHaveFocus();
    expect(box.value).toBe("lot-test ");
  });

  it("shows the search text from the URL after Back or reload", async () => {
    await seedBatches();
    await renderList("q=LOT-TEST-002");
    expect(
      (screen.getByLabelText(T.searchLabel) as HTMLInputElement).value,
    ).toBe("LOT-TEST-002");
  });
});

describe("Export CSV", () => {
  let blobs: Blob[];
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    blobs = [];
    clicked = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
  });

  const read = (blob: Blob) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });

  it("downloads the filtered list as CSV with the dated file name", async () => {
    const { t } = (await seedBatches()) as { t: Trace };
    await renderList(`lot=${t.waxLot1.id}`);
    fireEvent.click(screen.getByRole("button", { name: T.exportCsv }));
    expect(blobs).toHaveLength(1);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe(
      `candlelab-batches-${localToday().replaceAll("-", "")}.csv`,
    );
    const text = await read(blobs[0]);
    expect(text).toContain("LOT-TEST-001");
    expect(text).toContain("Run A");
    expect(text).not.toContain("LOT-TEST-002");
    expect(text).not.toContain("Run B");
  });

  it("is disabled when nothing matches", async () => {
    await seedBatches();
    await renderList("q=nothing-like-this");
    expect(screen.getByRole("button", { name: T.exportCsv })).toBeDisabled();
  });

  it("shows an error when the download cannot start", async () => {
    await seedBatches();
    await renderList();
    URL.createObjectURL = vi.fn(() => {
      throw new Error("blocked");
    });
    fireEvent.click(screen.getByRole("button", { name: T.exportCsv }));
    expect(await screen.findByText(T.exportFailed)).toBeInTheDocument();
  });
});
