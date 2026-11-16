import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FormulaList } from "@/components/formulas/list";
import { exportBackup } from "@/lib/backup";
import { getDataLayer, openDatabase } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import {
  makeLibrary,
  newFormulaRequest,
  revisionRequest,
  seedFormula,
  we5Input,
} from "../db/harness";

const L = MESSAGES.list;

beforeEach(async () => {
  // The component uses the singleton on the default database: start each test empty.
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.measurements.clear(),
    db.meta.clear(),
  ]);
  db.close();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const layer = () => getDataLayer();

async function renderList() {
  render(<FormulaList />);
  await waitFor(() => expect(screen.queryByText(L.loading)).not.toBeInTheDocument());
}

async function saveWe5(name: string, overrides: Parameters<typeof we5Input>[1] = {}) {
  const lib = await makeLibrary(layer());
  const request = newFormulaRequest(we5Input(lib, { name, ...overrides }));
  await layer().versions.save(request);
  if (request.target.kind !== "new") throw new Error("expected a new formula");
  return { lib, formulaId: request.target.formulaId };
}

function rowFor(name: string) {
  return screen.getByRole("link", { name }).closest("[data-testid='formula-row']") as HTMLElement;
}

function names() {
  return screen
    .queryAllByTestId("formula-row")
    .map((row) => within(row).getAllByRole("link")[0].textContent);
}

describe("first run", () => {
  it("shows the empty state with both actions and no backup line", async () => {
    await renderList();
    expect(screen.getByRole("heading", { level: 1, name: "Saved formulas" })).toBeInTheDocument();
    expect(screen.getByText(L.empty.title)).toBeInTheDocument();
    expect(screen.getByText(L.empty.description)).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: L.newFormula });
    expect(links.length).toBe(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/formulas/new");
    expect(screen.getByRole("link", { name: L.startFromExample })).toHaveAttribute(
      "href",
      "/formulas/new?example=1",
    );
    expect(screen.queryByLabelText(L.searchLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(L.neverBackedUp)).not.toBeInTheDocument();
  });
});

describe("rows", () => {
  it("shows a saved WE-5 formula with version, fragrance, total and a link", async () => {
    const { formulaId } = await saveWe5("Lavender Vanilla Cedar");
    await renderList();
    const row = await waitFor(() => rowFor("Lavender Vanilla Cedar"));
    expect(within(row).getByText("v1")).toBeInTheDocument();
    expect(within(row).getByText("8% of wax weight")).toBeInTheDocument();
    expect(within(row).getAllByText(/1080\.0 g/).length).toBeGreaterThan(0);
    expect(within(row).getByRole("link")).toHaveAttribute("href", `/formulas/${formulaId}`);
    expect(within(row).getByText("just now").closest("time")).toHaveAttribute("title");
    expect(screen.queryByText(L.empty.title)).not.toBeInTheDocument();
  });

  it("shows 0% for an unscented formula", async () => {
    await saveWe5("Unscented Pillar", { fragranceBp: 0, oils: [] });
    await renderList();
    const row = await waitFor(() => rowFor("Unscented Pillar"));
    expect(within(row).getByText("0%")).toBeInTheDocument();
  });

  it("names the total-mixture basis", async () => {
    await saveWe5("Citrus Test", { basis: "total", fragranceBp: 900 });
    await renderList();
    const row = await waitFor(() => rowFor("Citrus Test"));
    expect(within(row).getByText("9% of total mixture")).toBeInTheDocument();
  });

  it("shows the latest version number and its total after a second version", async () => {
    const { lib, formulaId } = await saveWe5("Grown");
    const first = (await layer().formulas.list())[0].latestVersion;
    await layer().versions.save(
      revisionRequest(
        formulaId,
        first.id,
        we5Input(lib, {
          name: "Grown",
          sizing: { mode: "vessels", count: 8, fillMg: 180000 },
        }),
      ),
    );
    await renderList();
    const row = await waitFor(() => rowFor("Grown"));
    expect(within(row).getByText("v2")).toBeInTheDocument();
    expect(within(row).getAllByText(/1440\.0 g/).length).toBeGreaterThan(0);
    expect(within(row).queryByText(/1080\.0 g/)).not.toBeInTheDocument();
  });

  it("lists the newest updated formula first", async () => {
    const db = openDatabase();
    await seedFormula(db, 1, {}, { name: "Oldest", updatedAt: "2026-11-01T06:00:00.000Z" });
    await seedFormula(db, 1, {}, { name: "Newest", updatedAt: "2026-11-12T06:00:00.000Z" });
    await seedFormula(db, 1, {}, { name: "Middle", updatedAt: "2026-11-05T06:00:00.000Z" });
    db.close();
    await renderList();
    await waitFor(() => expect(names()).toEqual(["Newest", "Middle", "Oldest"]));
  });
});

describe("search", () => {
  async function seedThree() {
    const db = openDatabase();
    await seedFormula(db, 1, {}, { name: "Lavender Vanilla" });
    await seedFormula(db, 1, {}, { name: "Citrus Test" });
    await seedFormula(db, 1, {}, { name: "Unscented Pillar" });
    db.close();
    await renderList();
    await screen.findByText("Citrus Test");
  }

  it("filters by name, ignoring case and surrounding spaces", async () => {
    await seedThree();
    fireEvent.change(screen.getByLabelText(L.searchLabel), { target: { value: "  LAV " } });
    expect(names()).toEqual(["Lavender Vanilla"]);
  });

  it("shows the no-match state and Clear search restores the list and focus", async () => {
    await seedThree();
    const field = screen.getByLabelText(L.searchLabel) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "xyz" } });
    expect(screen.getByText(L.noMatch("xyz"))).toBeInTheDocument();
    expect(names()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: L.clearSearch }));
    expect(field.value).toBe("");
    expect(field).toHaveFocus();
    expect(names().length).toBe(3);
  });
});

describe("Active and Archived", () => {
  it("filters between the two views", async () => {
    const db = openDatabase();
    await seedFormula(db, 1, {}, { name: "Live one" });
    await seedFormula(db, 1, {}, { name: "Shelved one", archivedAt: "2026-11-10T06:00:00.000Z" });
    db.close();
    await renderList();
    await screen.findByText("Live one");
    expect(screen.queryByText("Shelved one")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: L.showArchived }));
    expect(names()).toEqual(["Shelved one"]);
    fireEvent.click(screen.getByRole("radio", { name: L.showActive }));
    expect(names()).toEqual(["Live one"]);
  });

  it("explains an empty Archived view and offers the way back", async () => {
    const db = openDatabase();
    await seedFormula(db, 1, {}, { name: "Live one" });
    db.close();
    await renderList();
    await screen.findByText("Live one");
    fireEvent.click(screen.getByRole("radio", { name: L.showArchived }));
    expect(screen.getByText(L.noArchived.title)).toBeInTheDocument();
    expect(screen.getByText(L.noArchived.description)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: L.archivedNone }));
    expect(names()).toEqual(["Live one"]);
  });

  it("says so when every formula is archived and offers the Archived view", async () => {
    const db = openDatabase();
    await seedFormula(db, 1, {}, { name: "Shelved", archivedAt: "2026-11-10T06:00:00.000Z" });
    db.close();
    await renderList();
    expect(await screen.findByText(L.allArchived.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: L.allArchived.action }));
    expect(names()).toEqual(["Shelved"]);
  });
});

describe("last backup line", () => {
  it("says there is no backup yet and links to /backup", async () => {
    const db = openDatabase();
    await seedFormula(db, 1);
    db.close();
    await renderList();
    const link = await screen.findByRole("link", { name: L.neverBackedUp });
    expect(link).toHaveAttribute("href", "/backup");
  });

  it("shows the relative time of the last backup", async () => {
    const db = openDatabase();
    await seedFormula(db, 1);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await exportBackup(db, { now: () => threeDaysAgo });
    db.close();
    await renderList();
    const link = await screen.findByRole("link", { name: L.lastBackupNudge("3d ago") });
    expect(link).toHaveAttribute("href", "/backup");
    expect(screen.queryByText(L.neverBackedUp)).not.toBeInTheDocument();
  });
});

describe("load failure", () => {
  it("shows the notice and recovers with Try again", async () => {
    const db = openDatabase();
    await seedFormula(db, 1, {}, { name: "Back again" });
    db.close();
    const spy = vi.spyOn(layer().formulas, "list").mockRejectedValueOnce(new Error("boom"));
    await renderList();
    expect(await screen.findByRole("alert")).toHaveTextContent(L.loadFailedTitle);
    expect(screen.queryByText(L.empty.title)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: L.retry }));
    expect(await screen.findByText("Back again")).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});

describe("500 formulas", () => {
  it("renders them all and filters in memory", async () => {
    const db = openDatabase();
    for (let start = 0; start < 500; start += 50) {
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          seedFormula(db, 1, {}, { name: `Formula ${String(start + i).padStart(3, "0")}` }),
        ),
      );
    }
    db.close();
    const listSpy = vi.spyOn(layer().formulas, "list");
    await renderList();
    await waitFor(() => expect(screen.getAllByTestId("formula-row")).toHaveLength(500));
    expect(listSpy).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(L.searchLabel), { target: { value: "formula 49" } });
    expect(screen.getAllByTestId("formula-row")).toHaveLength(10);
    expect(listSpy).toHaveBeenCalledTimes(1);
  }, 60_000);
});
