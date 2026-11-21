/**
 * Backup and restore — contract (T02).
 *
 * Source of truth: docs/specs/4 Data Model.md, "Backup file" and "Restore
 * rules" (DATA-15 to DATA-28). Re-exported from `@/lib/backup`.
 *
 * Split by purity:
 *   export.ts   reads the database           exportBackup, canonicalJson, sha256Hex, backupFileName
 *   check.ts    pure                         checkBackupText
 *   plan.ts     pure                         planRestore
 *   apply.ts    writes the database          readDeviceData, applyRestore
 * Nothing is written to the database until `applyRestore`.
 */
import type { CandleDatabase } from "@/lib/db/contract";
import type {
  Batch,
  BackupCounts,
  BurnPhotoBackup,
  BurnSession,
  CurePlan,
  BackupData,
  BackupEnvelope,
  DataStoreName,
  Formula,
  FormulaVersion,
  Material,
  Measurement,
  ProductionPlan,
} from "@/lib/types";

// ───────────────────────────── Export ─────────────────────────────

/**
 * DATA-16. JSON with object keys sorted (code-unit order) at every depth, no
 * whitespace, arrays in their given order, `undefined` properties omitted.
 */
export type CanonicalJson = (value: unknown) => string;

/** Lower-case hex SHA-256 of the UTF-8 bytes, via Web Crypto (crypto.subtle). */
export type Sha256Hex = (text: string) => Promise<string>;

/** `candlelab-backup-YYYYMMDD-HHmmss.json`, from the UTC parts of `exportedAt`. */
export type BackupFileName = (exportedAt: string) => string;

export type ExportedBackup = {
  envelope: BackupEnvelope;
  /** The file's text: the envelope as JSON, 2-space indented. */
  json: string;
  fileName: string;
  /** BurnMatrix: the file's size in UTF-8 bytes, for the backup page. Above MAX_BACKUP_BYTES this app cannot restore it. */
  sizeBytes: number;
};

/**
 * DATA-15 to DATA-18. Reads every data store (DATA_STORES) in one read transaction, each
 * array sorted by `id`. Then, in a second transaction, sets meta
 * `lastBackupAt`, `lastBackupCounts` and resets `changesSinceBackup` to 0
 * (DATA-13). Archived items are included. Drafts and meta are not.
 */
export type ExportBackup = (
  db: CandleDatabase,
  options?: { now?: () => string },
) => Promise<ExportedBackup>;

// ───────────────────────────── Checks ─────────────────────────────

/** 256 MiB since v0.2 BurnMatrix (photos); 25 MiB before. */
export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;

/**
 * Why a file was refused. Checks run in this order and stop at the first
 * failure (docs/specs/4 Data Model.md, Step 1):
 *   not-backup   over MAX_BACKUP_BYTES, not JSON, not an object, or `format` is wrong
 *   newer        `formatVersion` is higher than this app understands
 *   invalid      one or more records (or the envelope) break the schema;
 *                BurnMatrix: also a photo whose base64, size, JPEG marker
 *                or SHA-256 does not match its record
 *   incomplete   `counts` do not match the arrays
 *   checksum     checksum does not match the data section
 *   duplicates   an id appears twice within one array
 *   orphans      a version's formula, a measurement's version, or a batch's
 *                version, is neither in the file nor on this device (a batch
 *                whose version is in the file under another formula also
 *                counts). CurePilot (format 3): a cure plan's batch, a
 *                production entry's version (same formula rule as batches),
 *                or a production entry's batch when set (a batch in the file
 *                must be of the entry's version). BurnMatrix (format 4): a
 *                burn session's batch, or a photo's session.
 */
export type CheckFailure =
  | { code: "not-backup" }
  | { code: "newer" }
  | {
      code: "invalid";
      /** Number of invalid records (the envelope itself counts as one). */
      count: number;
      /** e.g. `formula version 3f2a…` or `backup file`. */
      firstLabel: string;
      /** e.g. `missing targets`, `negative weight`. Plain words, no stack. */
      firstProblem: string;
    }
  | { code: "incomplete" }
  | { code: "checksum" }
  | { code: "duplicates" }
  | {
      code: "orphans";
      versions: number;
      measurements: number;
      batches: number;
      curePlans: number;
      productionPlans: number;
      burnSessions: number;
      burnPhotos: number;
    };

export type CheckResult =
  | { ok: true; envelope: BackupEnvelope }
  | { ok: false; failure: CheckFailure };

/** The ids already on this device, for the orphan check. */
export type DeviceIds = {
  formulaIds: ReadonlySet<string>;
  versionIds: ReadonlySet<string>;
  /** CurePilot: for cure plans and production entries that name a batch. */
  batchIds: ReadonlySet<string>;
  /** BurnMatrix: for photos that name a session. */
  burnSessionIds: ReadonlySet<string>;
};

/**
 * Every Step 1 check. Pure apart from hashing. `sizeBytes` is the file's size
 * on disk. A version below 1 is "not-backup"; above BACKUP_FORMAT_VERSION is
 * "newer".
 *
 * Format 1 (v0.1, no batches), format 2 (BatchTrace, no cure plans or
 * production entries) and format 3 (CurePilot, no burn sessions or photos)
 * are migrated in memory: the file is checked against its
 * own format's shape, its checksum is verified over the data section exactly
 * as written, and only then are the stores it lacks added as empty arrays
 * with a count of 0. The returned envelope keeps the file's
 * `formatVersion` and `checksum`; everything after the checks uses the
 * migrated `data` and `counts`.
 */
export type CheckBackupText = (
  text: string,
  sizeBytes: number,
  device: DeviceIds,
) => Promise<CheckResult>;

// ───────────────────────────── Plan ─────────────────────────────

export type RestoreMode = "merge" | "replace";
export type ConflictPolicy = "keepDevice" | "useBackup";

export type StoreTally = {
  /** Id not on this device. */
  new: number;
  /** Same id, same content. */
  identical: number;
  /** Same id, different content. */
  conflict: number;
};

export type Renumbering = {
  versionId: string;
  formulaId: string;
  formulaName: string;
  from: number;
  to: number;
};

/**
 * What a restore will do. Built without touching the database.
 *
 * Classification (Step 2), by id against this device:
 *   - materials, measurements: identical when canonicalJson is equal.
 *   - versions: identical when canonicalJson is equal after leaving out
 *     `number` and `originalNumber`. Both are display labels that a restore
 *     may change (DATA-22), so restoring the same file again after a
 *     renumbering still finds every version identical (DATA-19). Clarified in
 *     wave 6.
 *   - burnPhotos (BurnMatrix): identical when canonicalJson is equal
 *     without `dataBase64`; `sha256` stands for the bytes.
 *   - formulas: compared on name, notes and archivedAt only.
 *     `latestVersionNumber`, `createdAt` and `updatedAt` are bookkeeping and do
 *     not make a conflict.
 *
 * Merge mode (DATA-19 to DATA-22):
 *   - New records are written. Identical records are skipped.
 *   - Conflicts on materials, formulas and measurements follow `policy`.
 *     "useBackup" writes the backup's record (for a formula: its name, notes,
 *     archivedAt and updatedAt; `latestVersionNumber` is recomputed).
 *   - A conflicting version is never written (DATA-21). It is counted in
 *     `versionConflictsKept`.
 *   - A new version whose number is already taken under its formula — on the
 *     device or by an earlier incoming version — gets the next free number
 *     above every number in use, in `createdAt` order (ties by id), and keeps
 *     its old number in `originalNumber` (DATA-22).
 *   - Every formula that gains a version has `latestVersionNumber` raised to
 *     its highest number. These adjustments are in `puts.formulas` but are not
 *     counted as added or replaced.
 *
 * Replace mode (DATA-23): `clear` is true and `puts` is the backup's data
 * exactly as it is in the file.
 */
export type RestorePlan = {
  mode: RestoreMode;
  policy: ConflictPolicy;
  fileName: string;
  exportedAt: string;
  /** The backup's own counts, for the preview line. */
  fileCounts: BackupCounts;
  /** Per-store classification, for the preview. */
  tally: Record<DataStoreName, StoreTally>;
  /** Records to write with put(), per store. */
  puts: BackupData;
  /** True in replace mode: empty every data store first. */
  clear: boolean;
  /** Records that will be new on the device, per store. */
  added: BackupCounts;
  /** Conflicts overwritten with the backup's copy, per store. */
  replaced: BackupCounts;
  /** Conflicts where this device's copy stays, per store (versions included). */
  kept: BackupCounts;
  /** Identical records skipped, all stores together. */
  skippedIdentical: number;
  versionConflictsKept: number;
  renumbered: Renumbering[];
  /** Material ids that versions in the backup refer to but that will not be in the library. Informational. */
  missingMaterialIds: string[];
  /** What each store must hold after commit (DATA-26). */
  expectedCounts: BackupCounts;
  /**
   * Integration QA (M-1, M-2), informational: burn tests that will be dated
   * before their batch's production date, and planned burn tests that more
   * than one burn test will link to, once the plan is applied. The restore
   * still goes ahead; the preview tells the maker what to check.
   */
  burnChecks: { datesBeforeBatch: number; sharedPlannedTests: number };
  /**
   * What the plan was built from, for the stale check in `applyRestore`
   * (DATA-24): the checked envelope (by reference) and a copy of the device
   * data taken when the plan was made. Added in wave 7.
   */
  basis: { envelope: BackupEnvelope; device: DeviceData };
};

/** Everything in the data stores (DATA_STORES), read in one transaction. */
export type DeviceData = {
  materials: Material[];
  formulas: Formula[];
  formulaVersions: FormulaVersion[];
  measurements: Measurement[];
  batches: Batch[];
  curePlans: CurePlan[];
  productionPlans: ProductionPlan[];
  burnSessions: BurnSession[];
  /** Photos in their backup form (base64), so every restore step compares one shape. */
  burnPhotos: BurnPhotoBackup[];
};

export type PlanRestore = (
  envelope: BackupEnvelope,
  device: DeviceData,
  options: { mode: RestoreMode; policy: ConflictPolicy; fileName: string },
) => RestorePlan;

// ───────────────────────────── Apply ─────────────────────────────

export type ReadDeviceData = (db: CandleDatabase) => Promise<DeviceData>;

export type RestoreResult =
  | {
      ok: true;
      plan: RestorePlan;
      /** Counts read back after commit. Equal to plan.expectedCounts. */
      counts: BackupCounts;
    }
  | {
      ok: false;
      /**
       * busy       another restore is running (DATA-28)
       * stale      the device changed since the plan was made; plan again
       * storage    the transaction failed and was rolled back (DATA-24)
       * mismatch   committed, but the counts differ from the plan (DATA-26)
       * no-safety  replace mode without a safety backup (DATA-23)
       */
      reason: "busy" | "stale" | "storage" | "mismatch" | "no-safety";
      detail: string;
    };

export type ApplyRestoreOptions = {
  /**
   * Required when plan.mode is "replace": the safety backup the caller has
   * already exported and handed to the maker (DATA-23).
   */
  safetyBackup?: ExportedBackup;
  now?: () => string;
  /**
   * Test seam for interrupted imports (TEST-24). Called inside the
   * transaction after each store is written; throwing aborts the restore.
   */
  afterStoreWritten?: (store: DataStoreName) => void;
};

// How "stale" is decided (settled in wave 7):
//   merge    planRestore(plan.basis.envelope, <device read inside the
//            transaction>, same mode, policy and fileName) must give the same
//            puts, clear, renumbered and expectedCounts as `plan`, compared
//            with canonicalJson. Otherwise the device changed in a way that
//            matters and the maker must plan again.
//   replace  the device data read inside the transaction must equal
//            safetyBackup.envelope.data (every store sorted by id, compared
//            with canonicalJson). Otherwise the safety backup no longer holds
//            everything that is about to be erased.
// Step 4 below: lastRestoreAt is always set; changesSinceBackup goes up by 1
// only when the restore wrote or cleared something.

/**
 * DATA-23 to DATA-28. One read-write transaction over the data stores
 * and meta:
 *   1. Refuse if another restore is running, or replace mode lacks a safety backup.
 *   2. Inside the transaction, re-read the device and check it still matches
 *      what the plan was built against (same ids and content for every record
 *      the plan touches or skips); if not, abort with "stale".
 *   3. If plan.clear, clear the data stores. Write plan.puts.
 *   4. Set meta lastRestoreAt and add 1 to changesSinceBackup.
 *   5. After commit, re-read the counts and compare with
 *      plan.expectedCounts. A difference is "mismatch", never success.
 * Any error aborts the transaction and leaves the device exactly as it was.
 */
export type ApplyRestore = (
  db: CandleDatabase,
  plan: RestorePlan,
  options?: ApplyRestoreOptions,
) => Promise<RestoreResult>;

/** Every export `@/lib/backup` must provide. */
export type BackupModule = {
  canonicalJson: CanonicalJson;
  sha256Hex: Sha256Hex;
  backupFileName: BackupFileName;
  exportBackup: ExportBackup;
  checkBackupText: CheckBackupText;
  planRestore: PlanRestore;
  readDeviceData: ReadDeviceData;
  applyRestore: ApplyRestore;
};
