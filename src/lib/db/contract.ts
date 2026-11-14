/**
 * Data layer — contract (T02).
 *
 * Source of truth: docs/specs/4 Data Model.md. This folder is the only code
 * that touches IndexedDB (TRD-04). It is re-exported from `@/lib/db`.
 *
 * `@/lib/db` must export:
 *   - `openDatabase(name?: string): CandleDatabase`   a Dexie instance with the
 *       stores and indexes in the Data Model. Default name is DB_NAME. Tests
 *       pass a unique name per test.
 *   - `createDataLayer(db: CandleDatabase): DataLayer`
 *   - `getDataLayer(): DataLayer`   lazy singleton on the default database,
 *       for the app. Must not open the database at import time (it is imported
 *       by pages that are prerendered on the server).
 *   - `probeStorage(): Promise<boolean>`   false when IndexedDB is missing or
 *       refuses to open (private mode, blocked storage).
 *   - `DataError`
 *
 * Rules every write follows:
 *   - DATA-13: each committed write to materials, formulas, formulaVersions or
 *     measurements adds 1 to meta `changesSinceBackup`, inside the same
 *     transaction as the write.
 *   - Timestamps come from the injected clock (`createDataLayer(db, { now })`),
 *     default `() => new Date().toISOString()`. IDs come from the injected
 *     `newId`, default `() => crypto.randomUUID()`.
 *   - Strings are trimmed. An optional string that is blank is stored as
 *     absent (the key is omitted), never as "".
 *   - Records are validated with the Zod schemas in `@/lib/schemas` before
 *     they are written. A failure throws DataError("invalid").
 */
import type Dexie from "dexie";
import type { EntityTable } from "dexie";
import type { EditorFields, ValidatedFormulaInput } from "@/lib/gramguard/contract";
import type {
  Formula,
  FormulaVersion,
  Material,
  MaterialType,
  Measurement,
  MeasurementEntry,
  VersionOrigin,
  VersionScale,
  VesselDetails,
  WaxDetails,
  WickDetails,
} from "@/lib/types";

export type DataErrorCode =
  /** The record asked for does not exist. */
  | "not-found"
  /** The input breaks a schema or a write rule. */
  | "invalid"
  /** IndexedDB is unavailable, blocked or out of space. */
  | "storage"
  /** The calculation engine refused the input (V-14, V-15). */
  | "calculation";

/**
 * Shape of the error every data-layer function throws. `@/lib/db` exports
 * `class DataError extends Error implements DataErrorLike` with the
 * constructor `(code: DataErrorCode, message: string)`. `message` is for
 * logs; screens choose their own wording from `code`.
 */
export interface DataErrorLike extends Error {
  readonly code: DataErrorCode;
}

/** One row of the key-value store `meta`. */
export type MetaRow = { key: string; value: unknown };

/**
 * The Dexie database. Stores and indexes (schema version 1):
 *   materials        id, type, archivedAt
 *   formulas         id, updatedAt, archivedAt
 *   formulaVersions  id, formulaId, &[formulaId+number]
 *   measurements     id, versionId, formulaId
 *   drafts           key
 *   meta             key
 */
export type CandleDatabase = Dexie & {
  materials: EntityTable<Material, "id">;
  formulas: EntityTable<Formula, "id">;
  formulaVersions: EntityTable<FormulaVersion, "id">;
  measurements: EntityTable<Measurement, "id">;
  drafts: EntityTable<Draft, "key">;
  meta: EntityTable<MetaRow, "key">;
};

export type DataLayerOptions = {
  now?: () => string;
  newId?: () => string;
};

// ───────────────────────────── Materials ─────────────────────────────

/** What the maker can set. Only `name` is required (PRD-04, PRD-05). */
export type MaterialInput = {
  type: MaterialType;
  name: string;
  supplier?: string;
  notes?: string;
  wax?: WaxDetails;
  wick?: WickDetails;
  vessel?: VesselDetails;
};

export type MaterialsRepo = {
  /** Sorted by name, case-insensitive. Archived ones only when asked for. */
  list(filter?: { type?: MaterialType; includeArchived?: boolean }): Promise<Material[]>;
  get(id: string): Promise<Material | undefined>;
  create(input: MaterialInput): Promise<Material>;
  /** Replaces the editable fields. `type` cannot change: throws "invalid". */
  update(id: string, input: MaterialInput): Promise<Material>;
  setArchived(id: string, archived: boolean): Promise<Material>;
  /**
   * For "Used in 3 formulas": material id → number of distinct formulas with
   * at least one version that refers to it (wax, oil, wick or vessel).
   * Materials used nowhere are absent from the map.
   */
  usageCounts(): Promise<Map<string, number>>;
};

// ───────────────────────────── Formulas ─────────────────────────────

export type FormulaListItem = {
  formula: Formula;
  /** The version numbered `latestVersionNumber`. */
  latestVersion: FormulaVersion;
};

export type FormulasRepo = {
  /** Every formula with its latest version, newest `updatedAt` first. */
  list(): Promise<FormulaListItem[]>;
  get(id: string): Promise<Formula | undefined>;
  /** PRD-17. Does not create a version. Name is validated as V-02. */
  updateDetails(id: string, details: { name: string; notes?: string }): Promise<Formula>;
  setArchived(id: string, archived: boolean): Promise<Formula>;
  /** For the delete confirmation (D-8). */
  deletionImpact(id: string): Promise<{ versions: number; measurements: number }>;
  /** DATA-12: formula, versions, measurements and its draft, in one transaction. */
  deletePermanently(id: string): Promise<void>;
};

// ───────────────────────────── Versions ─────────────────────────────

export type SaveVersionRequest = {
  /**
   * Chosen by the caller before the first attempt and reused on retry. If a
   * version with this id already exists, `save` returns it and writes nothing
   * (idempotent, PRD-19).
   */
  versionId: string;
  target:
    /**
     * Creates the formula (named `input.name`, no formula notes) and version 1.
     * `formulaId` is chosen by the caller, like `versionId`.
     */
    | { kind: "new"; formulaId: string }
    /**
     * Adds the next version. The formula's own name and notes are not touched
     * (`input.name` is ignored). Throws "not-found" if the formula is missing.
     */
    | { kind: "existing"; formulaId: string };
  // In both cases `input.notes` is stored on the version (`inputs.notes`) and
  // `input.changeNote` as the version's `changeNote` (absent when blank).
  origin: VersionOrigin;
  /** Required for "revision" and "scaled", null for "initial". */
  parentVersionId: string | null;
  /** Required for "scaled", null otherwise. */
  scale: VersionScale | null;
  input: ValidatedFormulaInput;
  /** Draft to delete in the same transaction: "new" or the formula id. Null to keep drafts. */
  draftKey: string | null;
};

export type SaveVersionResult = {
  formula: Formula;
  version: FormulaVersion;
  /** False when `versionId` already existed and nothing was written. */
  created: boolean;
};

export type VersionsRepo = {
  /** Highest number first. */
  listByFormula(formulaId: string): Promise<FormulaVersion[]>;
  get(id: string): Promise<FormulaVersion | undefined>;
  /**
   * DATA-07 to DATA-10. One read-write transaction over formulas,
   * formulaVersions, materials, drafts and meta:
   *   1. If `versionId` exists, return it (created: false).
   *   2. Read the formula (or create it) and take number = latestVersionNumber + 1.
   *   3. Give every wax and oil row a fresh componentId. Snapshot each material
   *      from the library as it is now; if the material no longer exists, reuse
   *      the parent version's snapshot for that material id; if neither exists
   *      throw DataError("invalid"). Same for wick and vessel.
   *   4. Run `computePlan` from `@/lib/gramguard` and store its figures as
   *      `targets`. If the plan fails throw DataError("calculation").
   *   5. Write the version, update the formula's latestVersionNumber and
   *      updatedAt, delete the draft, bump the change counter.
   * Two saves started together get consecutive numbers. If anything fails
   * nothing is written and the draft remains.
   * After the first successful save, call `meta.requestPersistence()` outside
   * the transaction and ignore its outcome (DATA-14).
   */
  save(request: SaveVersionRequest): Promise<SaveVersionResult>;
};

// ───────────────────────────── Measurements ─────────────────────────────

export type MeasurementsRepo = {
  /** The record the v0.1 interface shows: the earliest-created for that version (D-7). */
  getForVersion(versionId: string): Promise<Measurement | undefined>;
  listByFormula(formulaId: string): Promise<Measurement[]>;
  /**
   * Creates the version's record, or replaces `entries` on the existing one.
   * Entries whose componentId is not in the version throw "invalid". Never
   * touches the version (DATA-04, CALC-22).
   */
  saveEntries(versionId: string, entries: MeasurementEntry[]): Promise<Measurement>;
};

// ───────────────────────────── Drafts ─────────────────────────────

/**
 * Store `drafts`. Unsaved editor work, raw text exactly as typed (PRD-13).
 * `fields` is the editor's own shape rather than the flat string map sketched
 * in the Data Model, whose field names are indicative. Drafts are device-local
 * and never exported.
 */
export type Draft = {
  /** "new", or the id of the formula being revised. */
  key: string;
  baseVersionId: string | null;
  fields: EditorFields;
  updatedAt: string;
};

export type DraftsRepo = {
  get(key: string): Promise<Draft | undefined>;
  put(key: string, baseVersionId: string | null, fields: EditorFields): Promise<Draft>;
  delete(key: string): Promise<void>;
};

// ───────────────────────────── Meta ─────────────────────────────

export type PersistenceOutcome = "granted" | "denied" | "unsupported";

/** Store `meta`, read as one object. Device-local, never exported. */
export type MetaState = {
  schemaVersion: number;
  lastBackupAt: string | null;
  /** What the last export contained, for "12 formulas, 31 versions". */
  lastBackupCounts: { formulas: number; formulaVersions: number } | null;
  changesSinceBackup: number;
  lastRestoreAt: string | null;
  exampleOffered: boolean;
  persistence: PersistenceOutcome | null;
};

export type MetaRepo = {
  get(): Promise<MetaState>;
  setExampleOffered(): Promise<void>;
  /** DATA-14. Asks the browser once, records and returns the outcome. */
  requestPersistence(): Promise<PersistenceOutcome>;
};

// ───────────────────────────── Example (D-12) ─────────────────────────────

export type ExampleRepo = {
  /**
   * For "Start from an example". Makes sure the example materials exist in the
   * library (one wax "Soy wax (example)", oils "Lavender (example)",
   * "Vanilla (example)", "Cedarwood (example)"), reusing unarchived materials
   * with those exact names, and returns editor fields for worked example WE-5:
   * name "Lavender Vanilla Cedar (example)", 6 vessels × 180 g, 8% of wax
   * weight, precision 0.1 g, oils 3 : 2 : 1. Marks the example as offered.
   */
  prepare(newRowId: () => string): Promise<EditorFields>;
};

// ───────────────────────────── The layer ─────────────────────────────

export type DataLayer = {
  materials: MaterialsRepo;
  formulas: FormulasRepo;
  versions: VersionsRepo;
  measurements: MeasurementsRepo;
  drafts: DraftsRepo;
  meta: MetaRepo;
  example: ExampleRepo;
};
