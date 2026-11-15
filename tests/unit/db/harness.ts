import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { createDataLayer, openDatabase } from "@/lib/db";
import type { CandleDatabase, DataLayer, SaveVersionRequest } from "@/lib/db";
import type { ValidatedFormulaInput } from "@/lib/gramguard/contract";
import type { Formula, FormulaVersion, Measurement } from "@/lib/types";

/** Not a test file: shared setup for the data-layer tests. */

let counter = 0;
const opened: CandleDatabase[] = [];

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await db.delete();
  }
});

/** A counter-based clock: every call returns a later valid ISO timestamp. */
export function makeClock(start = Date.UTC(2026, 10, 15, 8, 0, 0)) {
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
}

export function uniqueName(): string {
  counter += 1;
  return `candlelab-test-${counter}-${crypto.randomUUID()}`;
}

export function openTestDb(name = uniqueName()): CandleDatabase {
  const db = openDatabase(name);
  opened.push(db);
  return db;
}

export function setup() {
  const db = openTestDb();
  const layer: DataLayer = createDataLayer(db, { now: makeClock() });
  return { db, layer };
}

export async function counterOf(layer: DataLayer): Promise<number> {
  return (await layer.meta.get()).changesSinceBackup;
}

export const id = () => crypto.randomUUID();

const T0 = "2026-11-10T06:00:00.000Z";

export function makeFormula(overrides: Partial<Formula> = {}): Formula {
  return {
    id: id(),
    name: "Test formula",
    latestVersionNumber: 1,
    createdAt: T0,
    updatedAt: T0,
    archivedAt: null,
    ...overrides,
  };
}

type VersionLinks = { waxId?: string; oilId?: string; wickId?: string; vesselId?: string };

/** A schema-valid scented version row (500 g, 8%). */
export function makeVersion(
  formulaId: string,
  number: number,
  links: VersionLinks = {},
): FormulaVersion {
  const waxId = links.waxId ?? id();
  const oilId = links.oilId ?? id();
  return {
    id: id(),
    formulaId,
    number,
    origin: "initial",
    parentVersionId: null,
    scale: null,
    createdAt: T0,
    inputs: {
      sizing: { mode: "total", amountMg: 500000 },
      fragranceBp: 800,
      basis: "wax",
      precisionMg: 100,
      waxes: [
        {
          componentId: `wax-${number}`,
          materialId: waxId,
          snapshot: { type: "wax", name: "Wax" },
          partsX100: 100,
        },
      ],
      oils: [
        {
          componentId: `oil-${number}`,
          materialId: oilId,
          snapshot: { type: "fragranceOil", name: "Oil" },
          partsX100: 100,
        },
      ],
      wick: links.wickId
        ? { materialId: links.wickId, snapshot: { type: "wick", name: "Wick" } }
        : null,
      vessel: links.vesselId
        ? { materialId: links.vesselId, snapshot: { type: "vessel", name: "Vessel" } }
        : null,
    },
    targets: {
      totalMg: 500000,
      waxTotalMg: 463000,
      fragranceTotalMg: 37000,
      components: [
        { componentId: `wax-${number}`, targetMg: 463000 },
        { componentId: `oil-${number}`, targetMg: 37000 },
      ],
    },
    calcVersion: 1,
  };
}

export function makeMeasurement(formulaId: string, versionId: string): Measurement {
  return {
    id: id(),
    formulaId,
    versionId,
    entries: [],
    createdAt: T0,
    updatedAt: T0,
  };
}

/** Writes a formula and its versions straight into the tables (T11 owns the real save). */
export async function seedFormula(
  db: CandleDatabase,
  versions: number,
  links: VersionLinks = {},
  formulaOverrides: Partial<Formula> = {},
) {
  const formula = makeFormula({ latestVersionNumber: versions, ...formulaOverrides });
  const rows = Array.from({ length: versions }, (_, i) => makeVersion(formula.id, i + 1, links));
  await db.formulas.add(formula);
  await db.formulaVersions.bulkAdd(rows);
  return { formula, versions: rows };
}

// ───────────── Helpers for the version and measurement tests (T11) ─────────────

export type Library = {
  waxId: string;
  oilIds: [string, string, string];
  wickId: string;
  vesselId: string;
};

/** Creates one wax, three oils, a wick and a vessel in the library. */
export async function makeLibrary(layer: DataLayer): Promise<Library> {
  const wax = await layer.materials.create({
    type: "wax",
    name: "Soy wax",
    supplier: "Acme",
    wax: { maxFragranceBp: 1000, maxFragranceBasis: "wax" },
  });
  const oils = [];
  for (const name of ["Lavender", "Vanilla", "Cedarwood"]) {
    oils.push(await layer.materials.create({ type: "fragranceOil", name }));
  }
  const wick = await layer.materials.create({ type: "wick", name: "Wick A", wick: { size: "CD-8" } });
  const vessel = await layer.materials.create({
    type: "vessel",
    name: "Tin 180",
    vessel: { capacityMl: 200, defaultFillMg: 180000 },
  });
  return {
    waxId: wax.id,
    oilIds: [oils[0].id, oils[1].id, oils[2].id],
    wickId: wick.id,
    vesselId: vessel.id,
  };
}

/** WE-5 by hand: 6 vessels x 180 g, 8% of wax, 0.1 g, oils 3:2:1. Wax 1000.0 g, oils 40.0 / 26.7 / 13.3 g. */
export function we5Input(
  lib: Library,
  overrides: Partial<ValidatedFormulaInput> = {},
): ValidatedFormulaInput {
  return {
    name: "  Lavender Vanilla Cedar  ",
    sizing: { mode: "vessels", count: 6, fillMg: 180000 },
    fragranceBp: 800,
    basis: "wax",
    precisionMg: 100,
    waxes: [{ rowId: "row-wax", materialId: lib.waxId, partsX100: 100 }],
    oils: [
      { rowId: "row-o1", materialId: lib.oilIds[0], partsX100: 300 },
      { rowId: "row-o2", materialId: lib.oilIds[1], partsX100: 200 },
      { rowId: "row-o3", materialId: lib.oilIds[2], partsX100: 100 },
    ],
    wickId: lib.wickId,
    vesselId: lib.vesselId,
    notes: "",
    changeNote: "",
    ...overrides,
  };
}

export function newFormulaRequest(
  input: ValidatedFormulaInput,
  overrides: Partial<SaveVersionRequest> = {},
): SaveVersionRequest {
  return {
    versionId: id(),
    target: { kind: "new", formulaId: id() },
    origin: "initial",
    parentVersionId: null,
    scale: null,
    input,
    draftKey: null,
    ...overrides,
  };
}

export function revisionRequest(
  formulaId: string,
  parentVersionId: string,
  input: ValidatedFormulaInput,
  overrides: Partial<SaveVersionRequest> = {},
): SaveVersionRequest {
  return {
    versionId: id(),
    target: { kind: "existing", formulaId },
    origin: "revision",
    parentVersionId,
    scale: null,
    input,
    draftKey: null,
    ...overrides,
  };
}
