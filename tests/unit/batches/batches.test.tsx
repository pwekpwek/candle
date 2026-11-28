import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BatchDetail, BatchList, CreateBatch, batchTitle, localToday } from "@/components/batches";
import { FormulaDetail } from "@/components/formulas/detail";
import { NAV_ITEMS, isNavItemActive } from "@/components/shell/nav-items";
import { getDataLayer, openDatabase } from "@/lib/db";
import type { DataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { FormulaVersion } from "@/lib/types";
import { makeLibrary, newFormulaRequest, we5Input } from "../db/harness";

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
const F = MESSAGES.formula;

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(async () => {
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.search = "";
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.measurements.clear(),
    db.batches.clear(),
    db.curePlans.clear(),
    db.productionPlans.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const layer = (): DataLayer => getDataLayer();

async function seed() {
  const lib = await makeLibrary(layer());
  const saved = await layer().versions.save(newFormulaRequest(we5Input(lib)));
  return { formulaId: saved.formula.id, version: saved.version as FormulaVersion };
}

const dateField = () => screen.getByLabelText(B.producedOnFieldLabel) as HTMLInputElement;
const labelField = () => screen.getByLabelText(B.labelFieldLabel) as HTMLInputElement;
const weight = (name: string) =>
  screen.getByLabelText(F.measuredFieldLabel(name)) as HTMLInputElement;

async function renderCreate(versionId: string) {
  render(<CreateBatch versionId={versionId} />);
  await screen.findByLabelText(B.producedOnFieldLabel);
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localToday(d);
}

describe("navigation", () => {
  it("has Batches second, then Schedule, then Materials", () => {
    const labels = NAV_ITEMS.map((i) => i.label);
    expect(labels.indexOf(MESSAGES.app.navBatches)).toBe(1);
    expect(labels[0]).toBe(MESSAGES.app.navFormulas);
    expect(labels[2]).toBe(MESSAGES.app.navSchedule);
    expect(labels[3]).toBe(MESSAGES.app.navMaterials);
    expect(NAV_ITEMS).toHaveLength(5);
  });

  it("marks Batches current for /batches/*, and not Formulas", () => {
    const formulas = NAV_ITEMS.find((i) => i.href === "/")!;
    const batches = NAV_ITEMS.find((i) => i.href === "/batches")!;
    for (const path of ["/batches", "/batches/new", "/batches/abc"]) {
      expect(isNavItemActive(batches, path)).toBe(true);
      expect(isNavItemActive(formulas, path)).toBe(false);
    }
    expect(isNavItemActive(formulas, "/formulas/x")).toBe(true);
    expect(isNavItemActive(batches, "/formulas/x")).toBe(false);
  });
});

describe("create batch form", () => {
  it("shows the source and defaults the date to the local today", async () => {
    const s = await seed();
    await renderCreate(s.version.id);
    expect(dateField().value).toBe(localToday());
    expect(screen.getByRole("link", { name: F.headerVersion(1) })).toHaveAttribute(
      "href",
      `/formulas/${s.formulaId}/versions/${s.version.id}`,
    );
  });

  it("refuses a missing date and saves nothing", async () => {
    const s = await seed();
    await renderCreate(s.version.id);
    fireEvent.change(dateField(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    expect(await screen.findByText(B.dateRequired)).toBeInTheDocument();
    expect(dateField()).toHaveAttribute("aria-invalid", "true");
    expect(dateField()).toHaveFocus();
    expect(await layer().batches.list()).toHaveLength(0);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("refuses a date in the future", async () => {
    const s = await seed();
    await renderCreate(s.version.id);
    fireEvent.change(dateField(), { target: { value: tomorrow() } });
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    expect(await screen.findByText(B.dateFuture)).toBeInTheDocument();
    expect(await layer().batches.list()).toHaveLength(0);
  });

  it("refuses a bad measured weight and a label over 40 characters", async () => {
    const s = await seed();
    await renderCreate(s.version.id);
    fireEvent.change(weight("Soy wax"), { target: { value: "abc" } });
    fireEvent.change(labelField(), { target: { value: "x".repeat(41) } });
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    expect(await screen.findByText(B.labelTooLong)).toBeInTheDocument();
    expect(weight("Soy wax")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText(/Use numbers only/).length).toBeGreaterThan(0);
    expect(await layer().batches.list()).toHaveLength(0);
  });

  it("creates the batch and goes to its page", async () => {
    const s = await seed();
    await renderCreate(s.version.id);
    fireEvent.change(labelField(), { target: { value: "  Test A  " } });
    fireEvent.change(weight("Soy wax"), { target: { value: "1003.2" } });
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const [batch] = await layer().batches.list();
    expect(batch.batch.label).toBe("Test A");
    expect(batch.batch.versionId).toBe(s.version.id);
    expect(batch.batch.entries).toHaveLength(1);
    expect(nav.replace).toHaveBeenCalledWith(`/batches/${batch.batch.id}?created=1`);
  });

  it("shows a not-found state for an unknown version", async () => {
    render(<CreateBatch versionId="nope" />);
    expect(await screen.findByText(B.sourceNotFoundTitle)).toBeInTheDocument();
  });
});

describe("batch page", () => {
  async function seedBatch() {
    const s = await seed();
    const { batch } = await layer().batches.create({
      batchId: crypto.randomUUID(),
      versionId: s.version.id,
      producedOn: "2026-11-10",
      entries: [],
    });
    return { ...s, batch };
  }

  it("shows the source link, version and a default title", async () => {
    const s = await seedBatch();
    render(<BatchDetail batchId={s.batch.id} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: batchTitle(s.batch) }),
    ).toBeInTheDocument();
    expect(batchTitle(s.batch)).toMatch(/^Batch [0-9A-F]{8}$/);
    expect(screen.getByRole("link", { name: B.versionText(1) })).toHaveAttribute(
      "href",
      `/formulas/${s.formulaId}/versions/${s.version.id}`,
    );
  });

  it("shows the created notice once and cleans the URL", async () => {
    const s = await seedBatch();
    nav.search = "created=1";
    render(<BatchDetail batchId={s.batch.id} />);
    expect(await screen.findByText(B.createdNotice)).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/batches/${s.batch.id}`, { scroll: false }));
  });

  it("saves edits and shows feedback", async () => {
    const s = await seedBatch();
    render(<BatchDetail batchId={s.batch.id} />);
    await screen.findByLabelText(B.labelFieldLabel);
    fireEvent.change(labelField(), { target: { value: "Run 7" } });
    fireEvent.change(weight("Soy wax"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: B.saveChanges }));
    expect(await screen.findByText(B.changesSaved)).toBeInTheDocument();
    const saved = await layer().batches.get(s.batch.id);
    expect(saved?.batch.label).toBe("Run 7");
    expect(saved?.batch.entries).toHaveLength(1);
    expect(saved?.batch.versionId).toBe(s.version.id);
  });

  it("refuses a production date after the earliest burn test", async () => {
    const s = await seedBatch();
    await layer().burnSessions.create({
      sessionId: crypto.randomUUID(),
      batchId: s.batch.id,
      testedOn: "2026-11-12",
      milestoneId: null,
      candles: [{ label: "A", wick: { text: "CD-10" }, burns: [{ durationMin: 60 }] }],
    });
    render(<BatchDetail batchId={s.batch.id} />);
    await screen.findByLabelText(B.labelFieldLabel);
    const message = B.errProducedAfterBurnTest("Nov 12, 2026");
    // The Burn tests section lists the session once the page has loaded it.
    await screen.findByText("Nov 12, 2026");
    fireEvent.change(dateField(), { target: { value: "2026-11-13" } });
    fireEvent.blur(dateField());
    expect(await screen.findByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: B.saveChanges }));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(B.changesSaved)).toBeNull();
    expect((await layer().batches.get(s.batch.id))?.batch.producedOn).toBe("2026-11-10");
    // The same day is fine.
    fireEvent.change(dateField(), { target: { value: "2026-11-12" } });
    fireEvent.click(screen.getByRole("button", { name: B.saveChanges }));
    expect(await screen.findByText(B.changesSaved)).toBeInTheDocument();
    expect((await layer().batches.get(s.batch.id))?.batch.producedOn).toBe("2026-11-12");
  });

  it("deletes after confirmation", async () => {
    const s = await seedBatch();
    render(<BatchDetail batchId={s.batch.id} />);
    fireEvent.click(await screen.findByRole("button", { name: B.deleteBatch }));
    const dialog = await screen.findByRole("dialog");
    // The button is enabled once the dialog has read what else goes with the batch.
    const confirm = within(dialog).getByRole("button", { name: B.deleteConfirm });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/batches"));
    expect(await layer().batches.get(s.batch.id)).toBeUndefined();
  });

  it("shows a not-found state", async () => {
    render(<BatchDetail batchId="missing" />);
    expect(await screen.findByText(B.notFoundTitle)).toBeInTheDocument();
  });
});

describe("batch list", () => {
  it("shows the empty state with a link to saved formulas", async () => {
    render(<BatchList />);
    expect(await screen.findByText(B.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: B.emptyAction })).toHaveAttribute("href", "/");
  });

  it("lists a batch with its formula, version and weighed status", async () => {
    const s = await seed();
    await layer().batches.create({
      batchId: crypto.randomUUID(),
      versionId: s.version.id,
      producedOn: "2026-11-10",
      label: "Run 1",
      entries: [{ componentId: s.version.inputs.waxes[0].componentId, actualMg: 1_000_000 }],
    });
    render(<BatchList />);
    const row = await screen.findByTestId("batch-row");
    expect(row).toHaveTextContent("Run 1");
    expect(row).toHaveTextContent(B.versionText(1));
    expect(row).toHaveTextContent(B.weighedStatus(1, 4));
    expect(row).toHaveTextContent("Nov 10, 2026");
  });
});

describe("deleting a formula that has batches", () => {
  it("explains the refusal and offers no delete button", async () => {
    const s = await seed();
    await layer().batches.create({
      batchId: crypto.randomUUID(),
      versionId: s.version.id,
      producedOn: "2026-11-10",
      entries: [],
    });
    render(<FormulaDetail formulaId={s.formulaId} />);
    await screen.findByLabelText(F.measuredFieldLabel("Soy wax"));
    const trigger = screen.getByRole("button", { name: F.moreActions });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: F.deletePermanently }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(B.formulaDeleteRefused(1))).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: F.deleteConfirm })).toBeNull();
    expect(await layer().formulas.get(s.formulaId)).toBeDefined();
  });

  it("formula page links to Create batch and lists its batches", async () => {
    const s = await seed();
    const { batch } = await layer().batches.create({
      batchId: crypto.randomUUID(),
      versionId: s.version.id,
      producedOn: "2026-11-10",
      label: "Run 1",
      entries: [],
    });
    render(<FormulaDetail formulaId={s.formulaId} />);
    await screen.findByLabelText(F.measuredFieldLabel("Soy wax"));
    expect(screen.getByRole("link", { name: B.formulaCreateBatch })).toHaveAttribute(
      "href",
      `/batches/new?version=${s.version.id}`,
    );
    expect(await screen.findByRole("link", { name: /Run 1/ })).toHaveAttribute(
      "href",
      `/batches/${batch.id}`,
    );
  });
});
