/**
 * CandleLab Studio v0.1 — record types (T02 contract).
 *
 * Source of truth: docs/specs/4 Data Model.md. Changing a shape here is a
 * schema change (DATA-29). Only the orchestrator edits this file.
 *
 * Quantities are integers (DATA-05):
 *   - weights            whole milligrams            (`…Mg`)
 *   - percentages        whole hundredths of 1%      (`…Bp`, 8% = 800)
 *   - parts              whole hundredths of a part  (`…X100`, 3 parts = 300)
 * Timestamps are ISO 8601 strings in UTC (DATA-06). IDs are UUIDs made on the
 * device with crypto.randomUUID() (DATA-01).
 */

export type Basis = "wax" | "total";

/** Rounding step: 1 g, 0.1 g or 0.01 g. */
export type PrecisionMg = 1000 | 100 | 10;

export type MaterialType = "wax" | "fragranceOil" | "wick" | "vessel";

export type WaxDetails = { maxFragranceBp?: number; maxFragranceBasis?: Basis };
export type WickDetails = { size?: string };
export type VesselDetails = { capacityMl?: number; defaultFillMg?: number };

/** Store `materials`. Mutable. Archived, never deleted, once a version uses it. */
export type Material = {
  id: string;
  type: MaterialType;
  /** 1–80 characters after trimming. */
  name: string;
  supplier?: string;
  notes?: string;
  wax?: WaxDetails;
  wick?: WickDetails;
  vessel?: VesselDetails;
  createdAt: string;
  updatedAt: string;
  /** Archived materials are hidden from pickers. */
  archivedAt: string | null;
};

/** Store `formulas`. The stable container. Name and notes are mutable. */
export type Formula = {
  id: string;
  name: string;
  notes?: string;
  /** Highest version number under this formula. Used to allocate the next. */
  latestVersionNumber: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

/** Copy of a material's details at the moment a version was saved (DATA-03). */
export type MaterialSnapshot = {
  type: MaterialType;
  name: string;
  supplier?: string;
  wax?: WaxDetails;
  wick?: WickDetails;
  vessel?: VesselDetails;
};

export type Component = {
  /** Stable within its version. Fresh for every saved version (DATA-09). */
  componentId: string;
  materialId: string;
  snapshot: MaterialSnapshot;
  partsX100: number;
};

export type Sizing =
  | { mode: "total"; amountMg: number }
  | { mode: "wax"; amountMg: number }
  | { mode: "vessels"; count: number; fillMg: number };

export type SizingMode = Sizing["mode"];

export type LinkedMaterial = { materialId: string; snapshot: MaterialSnapshot };

export type VersionInputs = {
  sizing: Sizing;
  /** Hundredths of a percent. */
  fragranceBp: number;
  basis: Basis;
  precisionMg: PrecisionMg;
  /** 1–5 */
  waxes: Component[];
  /** 0–10. Empty when the formula is unscented (CALC-17). */
  oils: Component[];
  wick: LinkedMaterial | null;
  vessel: LinkedMaterial | null;
  notes?: string;
};

/** Planned weights exactly as shown when the version was saved. */
export type VersionTargets = {
  totalMg: number;
  waxTotalMg: number;
  fragranceTotalMg: number;
  components: { componentId: string; targetMg: number }[];
};

export type VersionOrigin = "initial" | "revision" | "scaled";
export type ScaleMethod = "vesselCount" | "amount" | "multiplier";

export type VersionScale = {
  method: ScaleMethod;
  /** new amount ÷ old amount × 10000, rounded half up. For display only. */
  factorX10000: number;
};

/** Store `formulaVersions`. Write-once (DATA-02, DATA-08). */
export type FormulaVersion = {
  id: string;
  formulaId: string;
  /** 1, 2, 3… unique within a formula. A display label, not identity. */
  number: number;
  /** Set only when the version was renumbered by a restore (DATA-22). */
  originalNumber?: number;
  origin: VersionOrigin;
  /** The version this one was revised or scaled from. */
  parentVersionId: string | null;
  scale: VersionScale | null;
  changeNote?: string;
  createdAt: string;
  inputs: VersionInputs;
  targets: VersionTargets;
  /** Version of the calculation rules used. 1 in v0.1 (DATA-30). */
  calcVersion: number;
};

export type MeasurementEntry = { componentId: string; actualMg: number };

/** Store `measurements`. Separate from the version it points at (DATA-04). */
export type Measurement = {
  id: string;
  formulaId: string;
  versionId: string;
  /** Date the maker weighed (YYYY-MM-DD), optional. */
  measuredOn?: string;
  /** Only the components that have a measured weight. */
  entries: MeasurementEntry[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/** The four exported stores, in dependency order. */
export const DATA_STORES = [
  "materials",
  "formulas",
  "formulaVersions",
  "measurements",
] as const;
export type DataStoreName = (typeof DATA_STORES)[number];

export type BackupData = {
  materials: Material[];
  formulas: Formula[];
  formulaVersions: FormulaVersion[];
  measurements: Measurement[];
};

export type BackupCounts = Record<DataStoreName, number>;

export const BACKUP_FORMAT = "candlelab-backup" as const;
export const BACKUP_FORMAT_VERSION = 1 as const;
export const SCHEMA_VERSION = 1 as const;
export const CALC_VERSION = 1 as const;
export const APP_VERSION = "0.1.0" as const;
export const DB_NAME = "candlelab" as const;

/** The backup file (docs/specs/4 Data Model.md, "Backup file"). */
export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  counts: BackupCounts;
  /** SHA-256 hex of the `data` section serialised with sorted keys (DATA-16). */
  checksum: { algorithm: "SHA-256"; value: string };
  data: BackupData;
};
