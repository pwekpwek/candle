import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { createDataLayer, openDatabase } from "@/lib/db";
import type { CandleDatabase, DataLayer } from "@/lib/db";
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
