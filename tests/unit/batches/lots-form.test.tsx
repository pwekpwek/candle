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
import { BatchDetail, CreateBatch } from "@/components/batches";
import { MESSAGES } from "@/lib/messages";
import {
  clearStores,
  layer,
  makeBatch,
  polyfills,
  seedTrace,
} from "./trace-harness";

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

const pick = (label: string, lotId: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: lotId } });
const picker = (label: string) =>
  screen.getByLabelText(label) as HTMLSelectElement;

describe("lot pickers on Create batch", () => {
  it("lists a material's lots with code, supplier and received date", async () => {
    const t = await seedTrace();
    render(<CreateBatch versionId={t.version.id} />);
    const wax = await screen.findByLabelText(B.lotFieldLabel("Soy wax"));
    const texts = within(wax)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(texts).toEqual([
      B.lotNone,
      "LOT-TEST-001 · Example Wax Co · received Oct 1, 2026",
      "LOT-TEST-002 · Example Oils Ltd",
    ]);
    expect(picker(B.lotFieldLabel("Soy wax")).value).toBe("");
  });

  it("shows a hint with a link to the lots page when a material has no lots", async () => {
    const t = await seedTrace();
    render(<CreateBatch versionId={t.version.id} />);
    await screen.findByLabelText(B.lotFieldLabel("Soy wax"));
    expect(screen.queryByLabelText(B.lotFieldLabel("Vanilla"))).toBeNull();
    expect(
      screen.getByText(new RegExp(B.lotNoLotsHint("Vanilla"))),
    ).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: B.lotAddLink });
    expect(links.map((l) => l.getAttribute("href"))).toContain(
      `/materials/lots?material=${t.lib.oilIds[1]}`,
    );
  });

  it("saves lots on a wax row, an oil row and the wick with a snapshot", async () => {
    const t = await seedTrace();
    render(<CreateBatch versionId={t.version.id} />);
    await screen.findByLabelText(B.lotFieldLabel("Soy wax"));
    pick(B.lotFieldLabel("Soy wax"), t.waxLot1.id);
    pick(B.lotFieldLabel("Lavender"), t.oilLot.id);
    pick(B.lotFieldLabelWick("Wick A"), t.wickLot.id);
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const [item] = await layer().batches.list();
    expect(item.batch.lots).toEqual([
      {
        part: "row",
        componentId: t.version.inputs.waxes[0].componentId,
        lotId: t.waxLot1.id,
        lotCode: "LOT-TEST-001",
        supplierId: t.supplier.id,
        supplierName: "Example Wax Co",
      },
      {
        part: "row",
        componentId: t.version.inputs.oils[0].componentId,
        lotId: t.oilLot.id,
        lotCode: "OIL-TEST-001",
        supplierId: t.other.id,
        supplierName: "Example Oils Ltd",
      },
      {
        part: "wick",
        lotId: t.wickLot.id,
        lotCode: "WICK-TEST-001",
        supplierId: null,
      },
    ]);
  });

  it("saves a batch with no lots when none is chosen", async () => {
    const t = await seedTrace();
    render(<CreateBatch versionId={t.version.id} />);
    await screen.findByLabelText(B.lotFieldLabel("Soy wax"));
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const [item] = await layer().batches.list();
    expect(item.batch.lots ?? []).toEqual([]);
  });

  it("shows the save-failed feedback when the data layer refuses a lot", async () => {
    const t = await seedTrace();
    render(<CreateBatch versionId={t.version.id} />);
    await screen.findByLabelText(B.lotFieldLabel("Soy wax"));
    pick(B.lotFieldLabel("Soy wax"), t.waxLot1.id);
    // The lot is archived after the form loaded: a new link to it is refused.
    await layer().materialLots.setArchived(t.waxLot1.id, true);
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    expect(await screen.findByText(B.createFailed)).toBeInTheDocument();
    expect(await layer().batches.list()).toHaveLength(0);
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("lot pickers on the batch page", () => {
  it("starts from the stored lots, changes one and clears another", async () => {
    const t = await seedTrace();
    const batch = await makeBatch(t, {
      lots: [
        {
          part: "row",
          componentId: t.version.inputs.waxes[0].componentId,
          lotId: t.waxLot1.id,
        },
        { part: "wick", lotId: t.wickLot.id },
      ],
    });
    render(<BatchDetail batchId={batch.id} />);
    await screen.findByLabelText(B.lotFieldLabel("Soy wax"));
    await waitFor(() =>
      expect(picker(B.lotFieldLabel("Soy wax")).value).toBe(t.waxLot1.id),
    );
    expect(picker(B.lotFieldLabelWick("Wick A")).value).toBe(t.wickLot.id);

    pick(B.lotFieldLabel("Soy wax"), t.waxLot2.id);
    pick(B.lotFieldLabelWick("Wick A"), "");
    fireEvent.click(screen.getByRole("button", { name: B.saveChanges }));
    expect(await screen.findByText(B.changesSaved)).toBeInTheDocument();

    const stored = (await layer().batches.get(batch.id))!.batch;
    expect(stored.lots).toEqual([
      {
        part: "row",
        componentId: t.version.inputs.waxes[0].componentId,
        lotId: t.waxLot2.id,
        lotCode: "LOT-TEST-002",
        supplierId: t.other.id,
        supplierName: "Example Oils Ltd",
      },
    ]);
  });

  it("still shows the archived lot that is linked, and keeps it on save", async () => {
    const t = await seedTrace();
    const archivedOther = await layer().materialLots.create({
      materialId: t.lib.waxId,
      supplierId: null,
      code: "LOT-TEST-OLD",
    });
    await layer().materialLots.setArchived(archivedOther.id, true);
    const batch = await makeBatch(t, {
      lots: [
        {
          part: "row",
          componentId: t.version.inputs.waxes[0].componentId,
          lotId: t.waxLot1.id,
        },
      ],
    });
    await layer().materialLots.setArchived(t.waxLot1.id, true);

    render(<BatchDetail batchId={batch.id} />);
    const wax = await screen.findByLabelText(B.lotFieldLabel("Soy wax"));
    await waitFor(() =>
      expect(picker(B.lotFieldLabel("Soy wax")).value).toBe(t.waxLot1.id),
    );
    const texts = within(wax)
      .getAllByRole("option")
      .map((o) => o.textContent ?? "");
    expect(
      texts.some(
        (x) => x.startsWith("LOT-TEST-001") && x.endsWith("(archived)"),
      ),
    ).toBe(true);
    expect(texts.some((x) => x.includes("LOT-TEST-OLD"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: B.saveChanges }));
    expect(await screen.findByText(B.changesSaved)).toBeInTheDocument();
    const stored = (await layer().batches.get(batch.id))!.batch;
    expect(stored.lots?.[0].lotId).toBe(t.waxLot1.id);
  });
});

describe("recorded lots on the batch page", () => {
  const section = async () => {
    const heading = await screen.findByRole("heading", {
      name: B.lotsRecordedHeading,
    });
    return within(heading.closest("section") as HTMLElement);
  };

  it("lists each component with its recorded lot, supplier or no lot", async () => {
    const t = await seedTrace();
    const batch = await makeBatch(t, {
      lots: [
        {
          part: "row",
          componentId: t.version.inputs.waxes[0].componentId,
          lotId: t.waxLot1.id,
        },
        { part: "wick", lotId: t.wickLot.id },
      ],
    });
    render(<BatchDetail batchId={batch.id} />);
    const s = await section();
    const rows = s.getAllByTestId("lot-detail-row");
    expect(rows.map((r) => r.querySelector("p")?.textContent)).toEqual([
      "Wax · Soy wax",
      "Fragrance oil · Lavender",
      "Fragrance oil · Vanilla",
      "Fragrance oil · Cedarwood",
      "Wick · Wick A",
      "Vessel · Tin 180",
    ]);
    expect(s.getByRole("link", { name: "LOT-TEST-001" })).toHaveAttribute(
      "href",
      `/materials/lots?material=${t.lib.waxId}`,
    );
    expect(
      s.getByText(B.lotSupplierLabel("Example Wax Co")),
    ).toBeInTheDocument();
    expect(s.getByRole("link", { name: "WICK-TEST-001" })).toBeInTheDocument();
    expect(s.getByText(B.lotNoSupplier)).toBeInTheDocument();
    expect(s.getAllByText(B.lotNone)).toHaveLength(4);
    expect(s.queryByText(B.lotArchivedBadge)).toBeNull();
  });

  it("shows the recorded code with a hint after the lot code is edited", async () => {
    const t = await seedTrace();
    const batch = await makeBatch(t, {
      lots: [
        {
          part: "row",
          componentId: t.version.inputs.waxes[0].componentId,
          lotId: t.waxLot1.id,
        },
      ],
    });
    await layer().materialLots.update(t.waxLot1.id, {
      materialId: t.lib.waxId,
      supplierId: t.supplier.id,
      code: "LOT-TEST-001B",
      receivedOn: "2026-10-01",
    });
    render(<BatchDetail batchId={batch.id} />);
    const s = await section();
    expect(s.getByRole("link", { name: "LOT-TEST-001" })).toBeInTheDocument();
    expect(
      await s.findByText(B.lotNowCode("LOT-TEST-001B")),
    ).toBeInTheDocument();
    expect(s.queryByText(B.lotNowSupplier("Example Wax Co"))).toBeNull();
  });

  it("shows the supplier hint when the supplier was renamed, and an Archived badge", async () => {
    const t = await seedTrace();
    const batch = await makeBatch(t, {
      lots: [
        {
          part: "row",
          componentId: t.version.inputs.waxes[0].componentId,
          lotId: t.waxLot1.id,
        },
      ],
    });
    await layer().suppliers.update(t.supplier.id, {
      name: "Example Wax Co Renamed",
    });
    await layer().materialLots.setArchived(t.waxLot1.id, true);
    render(<BatchDetail batchId={batch.id} />);
    const s = await section();
    expect(
      s.getByText(B.lotSupplierLabel("Example Wax Co")),
    ).toBeInTheDocument();
    expect(
      await s.findByText(B.lotNowSupplier("Example Wax Co Renamed")),
    ).toBeInTheDocument();
    expect(s.getByText(B.lotArchivedBadge)).toBeInTheDocument();
  });
});
