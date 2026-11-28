import type { BackupEnvelope, Formula, FormulaVersion, Material, Measurement } from "@/lib/types";

/** Valid sample records for the schema tests. Not a test file. */

export const IDS = {
  wax: "0b6f3c1e-2a4d-4f5e-8a9b-1c2d3e4f5a6b",
  oil: "1c7f4d2f-3b5e-4a6f-9b0c-2d3e4f5a6b7c",
  wick: "2d8a5e3a-4c6f-4b7a-8c1d-3e4f5a6b7c8d",
  vessel: "3e9b6f4b-5d7a-4c8b-9d2e-4f5a6b7c8d9e",
  formula: "4fac7a5c-6e8b-4d9c-8e3f-5a6b7c8d9e0f",
  version: "5abd8b6d-7f9c-4ead-9f4a-6b7c8d9e0f1a",
  measurement: "6bce9c7e-8a0d-4fbe-8a5b-7c8d9e0f1a2b",
} as const;

const T0 = "2026-11-14T06:05:12.000Z";
const T1 = "2026-11-15T08:00:00.000Z";

export const waxMaterial: Material = {
  id: IDS.wax,
  type: "wax",
  name: "Soy 464",
  supplier: "Supplier A",
  notes: "Container wax",
  wax: { maxFragranceBp: 1000, maxFragranceBasis: "wax" },
  createdAt: T0,
  updatedAt: T1,
  archivedAt: null,
};

export const oilMaterial: Material = {
  id: IDS.oil,
  type: "fragranceOil",
  name: "Lavender",
  createdAt: T0,
  updatedAt: T0,
  archivedAt: null,
};

export const wickMaterial: Material = {
  id: IDS.wick,
  type: "wick",
  name: "CD 12",
  wick: { size: "12" },
  createdAt: T0,
  updatedAt: T0,
  archivedAt: T1,
};

export const vesselMaterial: Material = {
  id: IDS.vessel,
  type: "vessel",
  name: "Tin 200 ml",
  vessel: { capacityMl: 200, defaultFillMg: 180000 },
  createdAt: T0,
  updatedAt: T0,
  archivedAt: null,
};

export const formula: Formula = {
  id: IDS.formula,
  name: "Lavender Soy",
  notes: "Test formula",
  latestVersionNumber: 1,
  createdAt: T0,
  updatedAt: T1,
  archivedAt: null,
};

export const version: FormulaVersion = {
  id: IDS.version,
  formulaId: IDS.formula,
  number: 1,
  origin: "initial",
  parentVersionId: null,
  scale: null,
  changeNote: undefined,
  createdAt: T0,
  inputs: {
    sizing: { mode: "total", amountMg: 500000 },
    fragranceBp: 800,
    basis: "wax",
    precisionMg: 100,
    waxes: [
      {
        componentId: "row-wax",
        materialId: IDS.wax,
        snapshot: { type: "wax", name: "Soy 464", supplier: "Supplier A", wax: { maxFragranceBp: 1000 } },
        partsX100: 100,
      },
    ],
    oils: [
      {
        componentId: "row-oil",
        materialId: IDS.oil,
        snapshot: { type: "fragranceOil", name: "Lavender" },
        partsX100: 100,
      },
    ],
    wick: { materialId: IDS.wick, snapshot: { type: "wick", name: "CD 12", wick: { size: "12" } } },
    vessel: {
      materialId: IDS.vessel,
      snapshot: { type: "vessel", name: "Tin 200 ml", vessel: { capacityMl: 200 } },
    },
    notes: "Mix at 60 C",
  },
  targets: {
    totalMg: 500000,
    waxTotalMg: 463000,
    fragranceTotalMg: 37000,
    components: [
      { componentId: "row-wax", targetMg: 463000 },
      { componentId: "row-oil", targetMg: 37000 },
    ],
  },
  calcVersion: 1,
};

export const measurement: Measurement = {
  id: IDS.measurement,
  formulaId: IDS.formula,
  versionId: IDS.version,
  measuredOn: "2026-11-14",
  entries: [{ componentId: "row-wax", actualMg: 463100 }],
  notes: "Scale 2",
  createdAt: T0,
  updatedAt: T1,
};

export const backupData = {
  materials: [waxMaterial, oilMaterial, wickMaterial, vesselMaterial],
  formulas: [formula],
  formulaVersions: [version],
  measurements: [measurement],
  batches: [],
  curePlans: [],
  productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [],
  investigations: [], investigationPhotos: [], correctiveExperiments: [], costItems: [], costSheets: [],
};

export const backupEnvelope: BackupEnvelope = {
  format: "candlelab-backup",
  formatVersion: 3,
  schemaVersion: 3,
  appVersion: "0.2.0",
  exportedAt: T1,
  counts: { materials: 4, formulas: 1, formulaVersions: 1, measurements: 1, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0, costItems: 0, costSheets: 0 },
  checksum: { algorithm: "SHA-256", value: "a".repeat(64) },
  data: backupData,
};

/** Clone a value so a test can change one field without touching the sample. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Copy of an object without one key, typed as a partial. */
export function omit<T extends object>(value: T, key: keyof T): Partial<T> {
  const copy: Partial<T> = { ...value };
  delete copy[key];
  return copy;
}
