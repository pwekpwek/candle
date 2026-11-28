import { z } from "zod";
import {
  BatchSchema,
  BatchSchemaV2,
  BatchSchemaV5,
  CostItemSchema,
  CostSheetSchema,
  BurnPhotoBackupSchema,
  BurnSessionSchema,
  CorrectiveExperimentSchema,
  CurePlanSchema,
  FormulaSchema,
  FormulaVersionSchema,
  InvestigationPhotoBackupSchema,
  InvestigationSchema,
  MaterialLotSchema,
  MaterialLotSchemaV5,
  MaterialSchema,
  MaterialSchemaV1,
  MeasurementSchema,
  ProductionPlanSchema,
  SupplierSchema,
  TimestampSchema,
} from "@/lib/schemas";
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, DATA_STORES } from "@/lib/types";
import type {
  BackupData,
  BackupEnvelope,
  BurnPhotoBackup,
  DataStoreName,
  InvestigationPhotoBackup,
} from "@/lib/types";
import { canonicalJson, sha256Hex } from "./canonical";
import { MAX_BACKUP_BYTES } from "./contract";
import type { CheckBackupText, CheckFailure, CheckResult } from "./contract";
import { checkPhotoData } from "./photos";

/**
 * The envelope's own shape. `data` is only checked to hold its format's arrays here;
 * each record is validated against its own schema afterwards. The checksum is
 * kept loose on purpose: a wrong algorithm or value is a "checksum" failure
 * (Step 1, fifth check), not a schema failure.
 */
const V1_COUNTS = {
  materials: z.int().min(0),
  formulas: z.int().min(0),
  formulaVersions: z.int().min(0),
  measurements: z.int().min(0),
};
const V1_DATA = {
  materials: z.array(z.unknown()),
  formulas: z.array(z.unknown()),
  formulaVersions: z.array(z.unknown()),
  measurements: z.array(z.unknown()),
};
const ENVELOPE_FIELDS = {
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.int().min(1),
  schemaVersion: z.int().min(1),
  appVersion: z.string().min(1),
  exportedAt: TimestampSchema,
  checksum: z.strictObject({ algorithm: z.string(), value: z.string() }),
};

/** Format 1 (v0.1): four stores, no batches. */
const EnvelopeShapeV1Schema = z.strictObject({
  ...ENVELOPE_FIELDS,
  counts: z.strictObject(V1_COUNTS),
  data: z.strictObject(V1_DATA),
});

/** Format 2 (v0.2 BatchTrace): adds `batches`. */
const EnvelopeShapeV2Schema = z.strictObject({
  ...ENVELOPE_FIELDS,
  counts: z.strictObject({ ...V1_COUNTS, batches: z.int().min(0) }),
  data: z.strictObject({ ...V1_DATA, batches: z.array(z.unknown()) }),
});

/** Format 3 (v0.2 CurePilot): adds `curePlans` and `productionPlans`. */
const EnvelopeShapeV3Schema = z.strictObject({
  ...ENVELOPE_FIELDS,
  counts: z.strictObject({
    ...V1_COUNTS,
    batches: z.int().min(0),
    curePlans: z.int().min(0),
    productionPlans: z.int().min(0),
  }),
  data: z.strictObject({
    ...V1_DATA,
    batches: z.array(z.unknown()),
    curePlans: z.array(z.unknown()),
    productionPlans: z.array(z.unknown()),
  }),
});

const V3_COUNTS = {
  ...V1_COUNTS,
  batches: z.int().min(0),
  curePlans: z.int().min(0),
  productionPlans: z.int().min(0),
};
const V3_DATA = {
  ...V1_DATA,
  batches: z.array(z.unknown()),
  curePlans: z.array(z.unknown()),
  productionPlans: z.array(z.unknown()),
};

const V4_COUNTS = { ...V3_COUNTS, burnSessions: z.int().min(0), burnPhotos: z.int().min(0) };
const V4_DATA = { ...V3_DATA, burnSessions: z.array(z.unknown()), burnPhotos: z.array(z.unknown()) };

/** Format 4 (v0.2 BurnMatrix): adds `burnSessions` and `burnPhotos`. */
const EnvelopeShapeV4Schema = z.strictObject({
  ...ENVELOPE_FIELDS,
  counts: z.strictObject(V4_COUNTS),
  data: z.strictObject(V4_DATA),
});

const V5_COUNTS = { ...V4_COUNTS, suppliers: z.int().min(0), materialLots: z.int().min(0) };
const V5_DATA = { ...V4_DATA, suppliers: z.array(z.unknown()), materialLots: z.array(z.unknown()) };

/** Format 5 (v0.3): adds `suppliers` and `materialLots`; batches may carry `lots`. */
const EnvelopeShapeV5Schema = z.strictObject({
  ...ENVELOPE_FIELDS,
  counts: z.strictObject(V5_COUNTS),
  data: z.strictObject(V5_DATA),
});

const V6_COUNTS = {
  ...V5_COUNTS,
  investigations: z.int().min(0),
  investigationPhotos: z.int().min(0),
  correctiveExperiments: z.int().min(0),
};
const V6_DATA = {
  ...V5_DATA,
  investigations: z.array(z.unknown()),
  investigationPhotos: z.array(z.unknown()),
  correctiveExperiments: z.array(z.unknown()),
};

/** Format 6 (v0.3 CandleFix): adds `investigations`, `investigationPhotos` and `correctiveExperiments`. */
const EnvelopeShapeV6Schema = z.strictObject({
  ...ENVELOPE_FIELDS,
  counts: z.strictObject(V6_COUNTS),
  data: z.strictObject(V6_DATA),
});

/**
 * Format 7 (v0.3 TrueCandle Cost): adds `costItems` and `costSheets`; materials
 * may carry a price, lots a purchase, batches candle counts.
 */
const EnvelopeShapeV7Schema = z.strictObject({
  ...ENVELOPE_FIELDS,
  counts: z.strictObject({ ...V6_COUNTS, costItems: z.int().min(0), costSheets: z.int().min(0) }),
  data: z.strictObject({ ...V6_DATA, costItems: z.array(z.unknown()), costSheets: z.array(z.unknown()) }),
});

/** The envelope shape of each format this app reads. */
const SHAPE_FOR_FORMAT = {
  1: EnvelopeShapeV1Schema,
  2: EnvelopeShapeV2Schema,
  3: EnvelopeShapeV3Schema,
  4: EnvelopeShapeV4Schema,
  5: EnvelopeShapeV5Schema,
  6: EnvelopeShapeV6Schema,
  7: EnvelopeShapeV7Schema,
} as const;

/** The stores each format holds. */
const STORES_IN_FORMAT: Record<number, readonly DataStoreName[]> = {
  1: ["materials", "formulas", "formulaVersions", "measurements"],
  2: ["materials", "formulas", "formulaVersions", "measurements", "batches"],
  3: ["materials", "formulas", "formulaVersions", "measurements", "batches", "curePlans", "productionPlans"],
  4: [
    "materials",
    "formulas",
    "formulaVersions",
    "measurements",
    "batches",
    "curePlans",
    "productionPlans",
    "burnSessions",
    "burnPhotos",
  ],
  5: [
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
  ],
  6: [
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
    "investigations",
    "investigationPhotos",
    "correctiveExperiments",
  ],
  7: DATA_STORES,
};

/**
 * The record schema of a store in a given format: batches before format 5 have
 * no `lots`; before format 7, no candle counts, no material prices and no lot
 * purchases (docs/v0.3-cost.md).
 */
function recordSchemaFor(store: DataStoreName, formatVersion: number): z.ZodType {
  if (store === "batches" && formatVersion < 5) return BatchSchemaV2;
  if (store === "batches" && formatVersion < 7) return BatchSchemaV5;
  if (store === "materials" && formatVersion < 7) return MaterialSchemaV1;
  if (store === "materialLots" && formatVersion < 7) return MaterialLotSchemaV5;
  return RECORD_SCHEMAS[store];
}

const RECORD_SCHEMAS = {
  materials: MaterialSchema,
  formulas: FormulaSchema,
  formulaVersions: FormulaVersionSchema,
  measurements: MeasurementSchema,
  batches: BatchSchema,
  curePlans: CurePlanSchema,
  productionPlans: ProductionPlanSchema,
  burnSessions: BurnSessionSchema,
  burnPhotos: BurnPhotoBackupSchema,
  suppliers: SupplierSchema,
  materialLots: MaterialLotSchema,
  investigations: InvestigationSchema,
  investigationPhotos: InvestigationPhotoBackupSchema,
  correctiveExperiments: CorrectiveExperimentSchema,
  costItems: CostItemSchema,
  costSheets: CostSheetSchema,
} as const;

const RECORD_NOUNS: Record<DataStoreName, string> = {
  materials: "material",
  formulas: "formula",
  formulaVersions: "formula version",
  measurements: "measurement",
  batches: "batch",
  curePlans: "cure plan",
  productionPlans: "planned production entry",
  burnSessions: "burn test",
  burnPhotos: "photo",
  suppliers: "supplier",
  materialLots: "lot",
  investigations: "investigation",
  investigationPhotos: "investigation photo",
  correctiveExperiments: "corrective experiment",
  costItems: "packaging item",
  costSheets: "cost sheet",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(failure: CheckFailure): CheckResult {
  return { ok: false, failure };
}

/** The value at `path`, and whether the last step was absent from its parent. */
function resolve(root: unknown, path: readonly PropertyKey[]): { value: unknown; missing: boolean } {
  let current: unknown = root;
  for (let i = 0; i < path.length; i++) {
    const key = path[i] as string | number;
    if (typeof current !== "object" || current === null) return { value: undefined, missing: false };
    if (!(key in current)) return { value: undefined, missing: i === path.length - 1 };
    current = (current as Record<string | number, unknown>)[key];
  }
  return { value: current, missing: false };
}

function describeIssue(issue: z.core.$ZodIssue, root: unknown): string {
  const named = issue.path.filter((segment): segment is string => typeof segment === "string");
  const field = named.length > 0 ? named[named.length - 1]! : "record";
  const { value, missing } = resolve(root, issue.path);
  switch (issue.code) {
    case "unrecognized_keys":
      return `unexpected field ${issue.keys[0] ?? field}`;
    case "invalid_type":
      return missing ? `missing ${field}` : `${field} has the wrong type`;
    case "invalid_value":
      return `unknown ${field}`;
    case "too_small":
    case "too_big":
      if (field.endsWith("Mg") && typeof value === "number" && value < 0) return "negative weight";
      return `${field} is out of range`;
    default:
      return `${field} is not valid`;
  }
}

function labelFor(noun: string, record: unknown, index: number): string {
  const id = isPlainObject(record) ? record.id : undefined;
  return typeof id === "string" && id.length > 0
    ? `${noun} ${id.slice(0, 8)}…`
    : `${noun} #${index + 1}`;
}

function hasDuplicateIds(records: readonly { id: string }[]): boolean {
  return new Set(records.map((record) => record.id)).size !== records.length;
}

/** Step 1 of the restore rules. Pure apart from hashing. Never throws for bad input. */
export const checkBackupText: CheckBackupText = async (text, sizeBytes, device) => {
  // 1. not-backup
  if (sizeBytes > MAX_BACKUP_BYTES) return fail({ code: "not-backup" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail({ code: "not-backup" });
  }
  if (!isPlainObject(parsed)) return fail({ code: "not-backup" });
  if (parsed.format !== BACKUP_FORMAT) return fail({ code: "not-backup" });
  const formatVersion = parsed.formatVersion;
  if (typeof formatVersion !== "number" || !Number.isInteger(formatVersion) || formatVersion < 1) {
    return fail({ code: "not-backup" });
  }

  // 2. newer
  if (formatVersion > BACKUP_FORMAT_VERSION) return fail({ code: "newer" });

  // 3. invalid
  let count = 0;
  let firstLabel = "";
  let firstProblem = "";
  const note = (label: string, problem: string): void => {
    if (count === 0) {
      firstLabel = label;
      firstProblem = problem;
    }
    count += 1;
  };

  const stores = STORES_IN_FORMAT[formatVersion]!;
  const shapeSchema = SHAPE_FOR_FORMAT[formatVersion as keyof typeof SHAPE_FOR_FORMAT];
  const shape = shapeSchema.safeParse(parsed);
  if (!shape.success) note("backup file", describeIssue(shape.error.issues[0]!, parsed));

  // When the envelope is bad, records are still counted if `data` holds arrays.
  const rawData = isPlainObject(parsed.data) ? parsed.data : {};
  const valid: { [K in DataStoreName]: unknown[] } = {
    materials: [],
    formulas: [],
    formulaVersions: [],
    measurements: [],
    batches: [],
    curePlans: [],
    productionPlans: [],
    burnSessions: [],
    burnPhotos: [],
    suppliers: [],
    materialLots: [],
    investigations: [],
    investigationPhotos: [],
    correctiveExperiments: [],
    costItems: [],
    costSheets: [],
  };
  for (const store of stores) {
    const records: unknown = shape.success
      ? (shape.data.data as Record<string, unknown>)[store]
      : rawData[store];
    if (!Array.isArray(records)) continue;
    const schema = recordSchemaFor(store, formatVersion);
    records.forEach((record: unknown, index) => {
      const result = schema.safeParse(record);
      if (result.success) valid[store].push(result.data);
      else note(labelFor(RECORD_NOUNS[store], record, index), describeIssue(result.error.issues[0]!, record));
    });
  }
  // BurnMatrix: a photo whose bytes do not match its record is invalid too.
  // Checked after the schema pass, one photo at a time, so a damaged photo is
  // named and never stored.
  const soundPhotos: unknown[] = [];
  for (const [index, photo] of (valid.burnPhotos as BurnPhotoBackup[]).entries()) {
    const problem = await checkPhotoData(photo);
    if (problem === null) soundPhotos.push(photo);
    else note(labelFor(RECORD_NOUNS.burnPhotos, photo, index), problem);
  }
  valid.burnPhotos = soundPhotos;
  // CandleFix: investigation photos are checked the same way.
  const soundInvestigationPhotos: unknown[] = [];
  for (const [index, photo] of (valid.investigationPhotos as InvestigationPhotoBackup[]).entries()) {
    const problem = await checkPhotoData(photo);
    if (problem === null) soundInvestigationPhotos.push(photo);
    else note(labelFor(RECORD_NOUNS.investigationPhotos, photo, index), problem);
  }
  valid.investigationPhotos = soundInvestigationPhotos;
  if (!shape.success || count > 0) {
    return fail({ code: "invalid", count, firstLabel, firstProblem });
  }

  // Stores an older format lacks are counted as 0 here (the in-memory migration).
  const fileCounts = shape.data.counts as Partial<BackupEnvelope["counts"]>;
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: shape.data.formatVersion,
    schemaVersion: shape.data.schemaVersion,
    appVersion: shape.data.appVersion,
    exportedAt: shape.data.exportedAt,
    counts: {
      materials: fileCounts.materials ?? 0,
      formulas: fileCounts.formulas ?? 0,
      formulaVersions: fileCounts.formulaVersions ?? 0,
      measurements: fileCounts.measurements ?? 0,
      batches: fileCounts.batches ?? 0,
      curePlans: fileCounts.curePlans ?? 0,
      productionPlans: fileCounts.productionPlans ?? 0,
      burnSessions: fileCounts.burnSessions ?? 0,
      burnPhotos: fileCounts.burnPhotos ?? 0,
      suppliers: fileCounts.suppliers ?? 0,
      materialLots: fileCounts.materialLots ?? 0,
      investigations: fileCounts.investigations ?? 0,
      investigationPhotos: fileCounts.investigationPhotos ?? 0,
      correctiveExperiments: fileCounts.correctiveExperiments ?? 0,
      costItems: fileCounts.costItems ?? 0,
      costSheets: fileCounts.costSheets ?? 0,
    },
    checksum: shape.data.checksum as BackupEnvelope["checksum"],
    data: valid as unknown as BackupData,
  };

  // 4. incomplete
  for (const store of DATA_STORES) {
    if (envelope.counts[store] !== envelope.data[store].length) return fail({ code: "incomplete" });
  }

  // 5. checksum, over the data section exactly as the file's format holds it.
  if (shape.data.checksum.algorithm !== "SHA-256") return fail({ code: "checksum" });
  const asWritten: Record<string, unknown> = {};
  for (const store of stores) asWritten[store] = envelope.data[store];
  const actual = await sha256Hex(canonicalJson(asWritten));
  if (actual !== shape.data.checksum.value) return fail({ code: "checksum" });

  // 6. duplicates
  for (const store of DATA_STORES) {
    if (hasDuplicateIds(envelope.data[store])) return fail({ code: "duplicates" });
  }

  // 7. orphans
  const formulaIds = new Set(envelope.data.formulas.map((formula) => formula.id));
  const versionIds = new Set(envelope.data.formulaVersions.map((version) => version.id));
  const versions = envelope.data.formulaVersions.filter(
    (version) => !formulaIds.has(version.formulaId) && !device.formulaIds.has(version.formulaId),
  ).length;
  const measurements = envelope.data.measurements.filter(
    (measurement) =>
      !versionIds.has(measurement.versionId) && !device.versionIds.has(measurement.versionId),
  ).length;
  // A batch must point at a version in the file or on this device; when the
  // version is in the file it must belong to the batch's formula.
  const fileVersionFormula = new Map(
    envelope.data.formulaVersions.map((version) => [version.id, version.formulaId]),
  );
  const batches = envelope.data.batches.filter((batch) => {
    const formulaOfVersion = fileVersionFormula.get(batch.versionId);
    if (formulaOfVersion !== undefined) return formulaOfVersion !== batch.formulaId;
    return !device.versionIds.has(batch.versionId);
  }).length;
  // CurePilot (format 3). A cure plan's id is its batch's id.
  const fileBatchVersion = new Map(envelope.data.batches.map((batch) => [batch.id, batch.versionId]));
  const batchKnown = (id: string) => fileBatchVersion.has(id) || device.batchIds.has(id);
  const curePlans = envelope.data.curePlans.filter((plan) => !batchKnown(plan.id)).length;
  const productionPlans = envelope.data.productionPlans.filter((entry) => {
    const formulaOfVersion = fileVersionFormula.get(entry.versionId);
    if (formulaOfVersion !== undefined) {
      if (formulaOfVersion !== entry.formulaId) return true;
    } else if (!device.versionIds.has(entry.versionId)) {
      return true;
    }
    if (entry.batchId === null) return false;
    const versionOfBatch = fileBatchVersion.get(entry.batchId);
    if (versionOfBatch !== undefined) return versionOfBatch !== entry.versionId;
    return !device.batchIds.has(entry.batchId);
  }).length;
  // BurnMatrix (format 4). The milestone link and the wick material are soft
  // links and are not checked here (docs/v0.2-burnmatrix.md).
  const burnSessions = envelope.data.burnSessions.filter((session) => !batchKnown(session.batchId)).length;
  const fileSessionIds = new Set(envelope.data.burnSessions.map((session) => session.id));
  const burnPhotos = envelope.data.burnPhotos.filter(
    (photo) => !fileSessionIds.has(photo.sessionId) && !device.burnSessionIds.has(photo.sessionId),
  ).length;
  // v0.3 (format 5). A lot needs its material and, when set, its supplier; a
  // batch's lot links need their lots. A batch snapshot's supplierId is soft
  // (its name is snapshotted) and is not checked (docs/v0.3-lots.md).
  const fileMaterialIds = new Set(envelope.data.materials.map((material) => material.id));
  const fileSupplierIds = new Set(envelope.data.suppliers.map((supplier) => supplier.id));
  const fileLotIds = new Set(envelope.data.materialLots.map((lot) => lot.id));
  const materialLots = envelope.data.materialLots.filter(
    (lot) =>
      (!fileMaterialIds.has(lot.materialId) && !device.materialIds.has(lot.materialId)) ||
      (lot.supplierId !== null && !fileSupplierIds.has(lot.supplierId) && !device.supplierIds.has(lot.supplierId)),
  ).length;
  const batchLots = envelope.data.batches.filter((batch) =>
    (batch.lots ?? []).some((link) => !fileLotIds.has(link.lotId) && !device.lotIds.has(link.lotId)),
  ).length;
  // v0.3 CandleFix (format 6). Existence only here; ownership (hypothesis of
  // the investigation, burn test of the follow-up batch) is judged by the
  // plan's integrity check, which knows the mode.
  const fileBatchIds = new Set(envelope.data.batches.map((batch) => batch.id));
  const fileInvestigationIds = new Set(envelope.data.investigations.map((investigation) => investigation.id));
  const investigationKnown = (id: string) => fileInvestigationIds.has(id) || device.investigationIds.has(id);
  const sessionKnown = (id: string) => fileSessionIds.has(id) || device.burnSessionIds.has(id);
  const investigations = envelope.data.investigations.filter(
    (investigation) => !fileBatchIds.has(investigation.batchId) && !device.batchIds.has(investigation.batchId),
  ).length;
  const investigationPhotos = envelope.data.investigationPhotos.filter(
    (photo) => !investigationKnown(photo.investigationId),
  ).length;
  const correctiveExperiments = envelope.data.correctiveExperiments.filter(
    (experiment) =>
      !investigationKnown(experiment.investigationId) ||
      !batchKnown(experiment.followUpBatchId) ||
      experiment.burnSessionIds.some((id) => !sessionKnown(id)),
  ).length;
  // v0.3 TrueCandle Cost (format 7). Existence only here; ownership (the
  // batch's version, the lines' components) is judged by the integrity check.
  const versionKnown = (id: string) => versionIds.has(id) || device.versionIds.has(id);
  const costSheets = envelope.data.costSheets.filter(
    (sheet) => !versionKnown(sheet.versionId) || (sheet.batchId !== null && !batchKnown(sheet.batchId)),
  ).length;
  if (
    costSheets > 0 ||
    investigations > 0 ||
    investigationPhotos > 0 ||
    correctiveExperiments > 0 ||
    versions > 0 ||
    measurements > 0 ||
    batches > 0 ||
    curePlans > 0 ||
    productionPlans > 0 ||
    burnSessions > 0 ||
    burnPhotos > 0 ||
    materialLots > 0 ||
    batchLots > 0
  ) {
    return fail({
      code: "orphans",
      versions,
      measurements,
      batches,
      curePlans,
      productionPlans,
      burnSessions,
      burnPhotos,
      materialLots,
      batchLots,
      investigations,
      investigationPhotos,
      correctiveExperiments,
      costSheets,
    });
  }

  return { ok: true, envelope };
};
