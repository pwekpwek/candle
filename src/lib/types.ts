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
  /**
   * v0.3: the material lot used for each component, at most one per component,
   * in the version's order (waxes, oils, wick, vessel). Absent when none is
   * recorded, so every v0.2 batch stays valid. See docs/v0.3-lots.md.
   */
  lots?: BatchLot[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/** Which component of the batch's version a lot is recorded for (v0.3). */
export type BatchLotPart = "row" | "wick" | "vessel";

/**
 * One lot recorded on a batch (v0.3). `lotId` links the lot; the code and the
 * supplier are snapshots taken when the link was made, so the batch keeps what
 * was recorded even after the lot or supplier is edited.
 */
export type BatchLot = {
  part: BatchLotPart;
  /** A wax or oil row of the version. Present exactly when `part` is "row". */
  componentId?: string;
  lotId: string;
  /** The lot's code when it was linked. */
  lotCode: string;
  /** The lot's supplier when it was linked, or null. */
  supplierId: string | null;
  /** That supplier's name when it was linked. Absent without a supplier. */
  supplierName?: string;
};

/**
 * Store `suppliers` (v0.3). The maker's own list of suppliers, kept on the
 * device. Archived suppliers are hidden from pickers for new choices.
 */
export type Supplier = {
  id: string;
  /** 1–MAX_SUPPLIER_NAME_LENGTH characters after trimming; unique, case-insensitive. */
  name: string;
  /** Contact notes, up to MAX_TRACE_NOTES_LENGTH characters. */
  notes?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

/**
 * Store `materialLots` (v0.3). One lot of one library material, optionally
 * from one supplier. No quantities: lots are for tracing, not stock. Once a
 * batch links it, a lot can only be archived, never deleted.
 */
export type MaterialLot = {
  id: string;
  /** Fixed at creation. */
  materialId: string;
  supplierId: string | null;
  /** The lot code, 1–MAX_LOT_CODE_LENGTH characters after trimming. */
  code: string;
  /** Date received (YYYY-MM-DD), local calendar. Optional. */
  receivedOn?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type CureMilestoneKind = "cureEnd" | "burnTest" | "check";

/**
 * One scheduled point in a batch's cure plan (v0.2, CurePilot). Its due date
 * is never stored: it is the batch's `producedOn` plus `offsetDays`, so moving
 * the production date moves every open milestone. `doneOn` stays as marked.
 */
export type CureMilestone = {
  /** UUID, stable inside its plan. */
  id: string;
  /** `cureEnd` is the end of the cure time (at most one per plan). */
  kind: CureMilestoneKind;
  /** 1–60 characters after trimming. Optional; the screens require it for `check`. */
  label?: string;
  /** Whole days after the production date, 0–365. */
  offsetDays: number;
  /** Local calendar date (YYYY-MM-DD) the maker marked it done, or null. */
  doneOn: string | null;
};

/**
 * Store `curePlans` (v0.2, CurePilot). A batch's curing schedule. `id` IS the
 * batch's id, so a batch has at most one plan. Scheduling information only.
 */
export type CurePlan = {
  /** The batch this plan belongs to (= Batch.id). */
  id: string;
  /** 1–20 milestones, unique ids, at most one `cureEnd`. */
  milestones: CureMilestone[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Store `productionPlans` (v0.2, CurePilot). A planned production run of one
 * saved version. Not a batch: "Create batch" from it makes the batch and sets
 * `batchId` in the same transaction. `formulaId` and `versionId` never change.
 */
export type ProductionPlan = {
  id: string;
  formulaId: string;
  versionId: string;
  /** Planned date (YYYY-MM-DD), local calendar. Any date. */
  plannedOn: string;
  /** 1–40 characters after trimming. Optional. */
  label?: string;
  notes?: string;
  /** The batch made from this entry, or null while it is open. */
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SootLevel = "none" | "light" | "moderate" | "heavy";

/**
 * One burn of one candle in a burn session (v0.2, BurnMatrix). Observations
 * only: every field except the duration is optional, and nothing here is a
 * verdict. Burns are numbered by their position in `BurnCandle.burns`.
 */
export type BurnRecord = {
  /** UUID, stable inside its candle. */
  id: string;
  /** Whole minutes, 1–1440. */
  durationMin: number;
  /** Candle weight before this burn, whole milligrams (1 up). */
  weightBeforeMg?: number;
  /** Candle weight after this burn, whole milligrams; not above `weightBeforeMg`. */
  weightAfterMg?: number;
  /** Melt pool diameter at the end of the burn, whole millimetres, 0–500. */
  meltPoolDiameterMm?: number;
  /** Melt pool depth at the end of the burn, whole millimetres, 0–500. */
  meltPoolDepthMm?: number;
  /** Flame height seen during the burn, whole millimetres, 0–500. */
  flameHeightMm?: number;
  /** Soot the maker saw. An observation, not a rating. */
  soot?: SootLevel;
  /** Up to MAX_BURN_TEXT_LENGTH characters after trimming. */
  notes?: string;
};

/**
 * The wick of one candle, as tested. `materialId` names a wick in the material
 * library, or is null for a wick typed as free text. `name` is a snapshot of
 * the material's name when it was chosen (or the typed text), so reports keep
 * the name used at the time even after the material is renamed.
 */
export type BurnWick = {
  materialId: string | null;
  /** 1–80 characters after trimming. */
  name: string;
};

/** One candle burned in a session, side by side with the others. */
export type BurnCandle = {
  /** UUID, stable inside its session. */
  id: string;
  /** "Candle 1", "A", "CD-10"…: 1–40 characters after trimming. */
  label: string;
  wick: BurnWick;
  /** 0–MAX_BURNS_PER_CANDLE burns, in the order they happened. */
  burns: BurnRecord[];
  /** Cold throw notes (unlit), the maker's own words. */
  coldThrow?: string;
  /** Hot throw notes (lit), the maker's own words. */
  hotThrow?: string;
  notes?: string;
};

/**
 * Store `burnSessions` (v0.2, BurnMatrix). One dated burn test on one batch.
 * `batchId` is fixed at creation. `milestoneId` optionally names a `burnTest`
 * milestone in the batch's cure plan; it is a soft link (see
 * docs/v0.2-burnmatrix.md): saving a linked session marks that milestone done
 * on `testedOn`. The app gives no pass or fail; `conclusion` is the maker's own text.
 */
export type BurnSession = {
  id: string;
  batchId: string;
  /** Test date (YYYY-MM-DD), local calendar. */
  testedOn: string;
  /** 1–60 characters after trimming. Optional. */
  label?: string;
  /** A burnTest milestone of the batch's cure plan, or null. */
  milestoneId: string | null;
  /** 1–MAX_BURN_CANDLES candles. */
  candles: BurnCandle[];
  /** The maker's own conclusion. Never written by the app. */
  conclusion?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/** Photo fields shared by the stored record and its backup form. */
type BurnPhotoFields = {
  id: string;
  sessionId: string;
  /** Always JPEG: the app re-encodes every photo when it is added. */
  mimeType: "image/jpeg";
  /** Pixels, 1–MAX_PHOTO_DIMENSION. */
  width: number;
  height: number;
  /** Size of the JPEG bytes, 1–MAX_PHOTO_BYTES. */
  byteLength: number;
  /** SHA-256 of the JPEG bytes, lowercase hex. */
  sha256: string;
  /** 1–80 characters after trimming. Optional. */
  caption?: string;
  createdAt: string;
};

/**
 * Store `burnPhotos` (v0.2, BurnMatrix). One photo of a burn session, kept on
 * the device. Write-once: a photo is added or deleted, never changed.
 */
export type BurnPhoto = BurnPhotoFields & {
  /** The JPEG file. */
  bytes: Uint8Array;
};

/** A photo as a backup file holds it: the bytes as standard base64 (with padding). */
export type BurnPhotoBackup = BurnPhotoFields & {
  dataBase64: string;
};

/**
 * The exported stores, in dependency order. `batches` was added in v0.2
 * (format 2); `curePlans` and `productionPlans` in v0.2 CurePilot (format 3);
 * `burnSessions` and `burnPhotos` in v0.2 BurnMatrix (format 4).
 */
export const DATA_STORES = [
  "materials",
  "formulas",
  "formulaVersions",
  "measurements",
  "batches",
  "curePlans",
  "productionPlans",
  "burnSessions",
  "burnPhotos",
  "suppliers",
  "materialLots",
] as const;
export type DataStoreName = (typeof DATA_STORES)[number];

export type BackupData = {
  materials: Material[];
  formulas: Formula[];
  formulaVersions: FormulaVersion[];
  measurements: Measurement[];
  batches: Batch[];
  curePlans: CurePlan[];
  productionPlans: ProductionPlan[];
  burnSessions: BurnSession[];
  /** Photos in their backup form (base64 bytes); the device stores `BurnPhoto`. */
  burnPhotos: BurnPhotoBackup[];
  /** v0.3 (format 5). */
  suppliers: Supplier[];
  materialLots: MaterialLot[];
};

export type BackupCounts = Record<DataStoreName, number>;

export const BACKUP_FORMAT = "candlelab-backup" as const;
/**
 * 5 since v0.3 (adds `suppliers`, `materialLots`, and lot links on batches);
 * 4 (BurnMatrix) added `burnSessions` and `burnPhotos`; 3 added `curePlans`
 * and `productionPlans`; 2 added `batches`. Format 1 to 4 files are migrated
 * on restore.
 */
export const BACKUP_FORMAT_VERSION = 5 as const;
/**
 * IndexedDB schema. 5 since v0.3 (suppliers and lots); 4 (BurnMatrix) added
 * burn sessions and photos; 3 (CurePilot) added cure plans and production
 * entries; 2 added the `batches` store.
 */
export const SCHEMA_VERSION = 5 as const;
export const CALC_VERSION = 1 as const;
export const APP_VERSION = "0.3.0" as const;
/** v0.3: longest supplier name after trimming. */
export const MAX_SUPPLIER_NAME_LENGTH = 80 as const;
/** v0.3: longest lot code after trimming. */
export const MAX_LOT_CODE_LENGTH = 60 as const;
/** v0.3: longest supplier or lot notes after trimming. */
export const MAX_TRACE_NOTES_LENGTH = 2000 as const;
/** Longest batch label after trimming. */
export const MAX_BATCH_LABEL_LENGTH = 40 as const;
/** Longest production entry label after trimming (same as a batch label). */
export const MAX_PRODUCTION_LABEL_LENGTH = 40 as const;
/** Longest milestone label after trimming. */
export const MAX_MILESTONE_LABEL_LENGTH = 60 as const;
/** Most milestones in one cure plan. */
export const MAX_MILESTONES = 20 as const;
/** Largest milestone offset, in days after the production date. */
export const MAX_OFFSET_DAYS = 365 as const;
/** BurnMatrix: most candles burned side by side in one session. */
export const MAX_BURN_CANDLES = 8 as const;
/** BurnMatrix: most burns recorded for one candle. */
export const MAX_BURNS_PER_CANDLE = 40 as const;
/** BurnMatrix: longest single burn, in minutes (24 hours). */
export const MAX_BURN_MINUTES = 1440 as const;
/** BurnMatrix: largest melt pool or flame measurement, in millimetres. */
export const MAX_BURN_MM = 500 as const;
/** BurnMatrix: longest session label after trimming. */
export const MAX_SESSION_LABEL_LENGTH = 60 as const;
/** BurnMatrix: longest candle label after trimming. */
export const MAX_CANDLE_LABEL_LENGTH = 40 as const;
/** BurnMatrix: longest wick name after trimming. */
export const MAX_WICK_NAME_LENGTH = 80 as const;
/** BurnMatrix: longest photo caption after trimming. */
export const MAX_PHOTO_CAPTION_LENGTH = 80 as const;
/** BurnMatrix: longest notes, throw notes or conclusion after trimming. */
export const MAX_BURN_TEXT_LENGTH = 2000 as const;
/** BurnMatrix: most photos in one session. */
export const MAX_SESSION_PHOTOS = 12 as const;
/** BurnMatrix: longest side of a stored photo, in pixels. */
export const MAX_PHOTO_DIMENSION = 1600 as const;
/** BurnMatrix: largest stored photo, in bytes (1 MiB). */
export const MAX_PHOTO_BYTES = 1_048_576 as const;
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
