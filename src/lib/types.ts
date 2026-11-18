/**
 * CandleLab Studio — record types (T02 contract; batches added in v0.2).
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

/**
 * Store `batches` (v0.2, BatchTrace). One production run made from one saved
 * formula version. `formulaId` and `versionId` are set when the batch is
 * created and never change, so the batch always refers to the exact version
 * it was made from. Planned weights are read from that version's stored
 * `targets` (versions are write-once). The other fields are editable.
 */
export type Batch = {
  id: string;
  formulaId: string;
  versionId: string;
  /** The maker's own code for the batch, 1–40 characters. Optional. */
  label?: string;
  /** Production date (YYYY-MM-DD), in the maker's local calendar. */
  producedOn: string;
  /** Measured weights for the version's components. Only entered ones. */
  entries: MeasurementEntry[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/** The exported stores, in dependency order. `batches` was added in v0.2. */
export const DATA_STORES = [
  "materials",
  "formulas",
  "formulaVersions",
  "measurements",
  "batches",
] as const;
export type DataStoreName = (typeof DATA_STORES)[number];

export type BackupData = {
  materials: Material[];
  formulas: Formula[];
  formulaVersions: FormulaVersion[];
  measurements: Measurement[];
  batches: Batch[];
};

export type BackupCounts = Record<DataStoreName, number>;

export const BACKUP_FORMAT = "candlelab-backup" as const;
/** 2 since v0.2 (adds `batches`). Format 1 files are migrated on restore. */
export const BACKUP_FORMAT_VERSION = 2 as const;
/** IndexedDB schema. 2 since v0.2 (adds the `batches` store). */
export const SCHEMA_VERSION = 2 as const;
export const CALC_VERSION = 1 as const;
export const APP_VERSION = "0.2.0" as const;
/** Longest batch label after trimming. */
export const MAX_BATCH_LABEL_LENGTH = 40 as const;
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
