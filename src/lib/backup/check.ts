import { z } from "zod";
import {
  FormulaSchema,
  FormulaVersionSchema,
  MaterialSchema,
  MeasurementSchema,
  TimestampSchema,
} from "@/lib/schemas";
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, DATA_STORES } from "@/lib/types";
import type { BackupData, BackupEnvelope, DataStoreName } from "@/lib/types";
import { canonicalJson, sha256Hex } from "./canonical";
import { MAX_BACKUP_BYTES } from "./contract";
import type { CheckBackupText, CheckFailure, CheckResult } from "./contract";

/**
 * The envelope's own shape. `data` is only checked to hold four arrays here;
 * each record is validated against its own schema afterwards. The checksum is
 * kept loose on purpose: a wrong algorithm or value is a "checksum" failure
 * (Step 1, fifth check), not a schema failure.
 */
const EnvelopeShapeSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.int().min(1),
  schemaVersion: z.int().min(1),
  appVersion: z.string().min(1),
  exportedAt: TimestampSchema,
  counts: z.strictObject({
    materials: z.int().min(0),
    formulas: z.int().min(0),
    formulaVersions: z.int().min(0),
    measurements: z.int().min(0),
  }),
  checksum: z.strictObject({ algorithm: z.string(), value: z.string() }),
  data: z.strictObject({
    materials: z.array(z.unknown()),
    formulas: z.array(z.unknown()),
    formulaVersions: z.array(z.unknown()),
    measurements: z.array(z.unknown()),
  }),
});

const RECORD_SCHEMAS = {
  materials: MaterialSchema,
  formulas: FormulaSchema,
  formulaVersions: FormulaVersionSchema,
  measurements: MeasurementSchema,
} as const;

const RECORD_NOUNS: Record<DataStoreName, string> = {
  materials: "material",
  formulas: "formula",
  formulaVersions: "formula version",
  measurements: "measurement",
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

  const shape = EnvelopeShapeSchema.safeParse(parsed);
  if (!shape.success) note("backup file", describeIssue(shape.error.issues[0]!, parsed));

  // When the envelope is bad, records are still counted if `data` holds arrays.
  const rawData = isPlainObject(parsed.data) ? parsed.data : {};
  const valid: { [K in DataStoreName]: unknown[] } = {
    materials: [],
    formulas: [],
    formulaVersions: [],
    measurements: [],
  };
  for (const store of DATA_STORES) {
    const records: unknown = shape.success ? shape.data.data[store] : rawData[store];
    if (!Array.isArray(records)) continue;
    records.forEach((record: unknown, index) => {
      const result = RECORD_SCHEMAS[store].safeParse(record);
      if (result.success) valid[store].push(result.data);
      else note(labelFor(RECORD_NOUNS[store], record, index), describeIssue(result.error.issues[0]!, record));
    });
  }
  if (!shape.success || count > 0) {
    return fail({ code: "invalid", count, firstLabel, firstProblem });
  }

  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: shape.data.formatVersion,
    schemaVersion: shape.data.schemaVersion,
    appVersion: shape.data.appVersion,
    exportedAt: shape.data.exportedAt,
    counts: shape.data.counts,
    checksum: shape.data.checksum as BackupEnvelope["checksum"],
    data: valid as unknown as BackupData,
  };

  // 4. incomplete
  for (const store of DATA_STORES) {
    if (envelope.counts[store] !== envelope.data[store].length) return fail({ code: "incomplete" });
  }

  // 5. checksum
  if (shape.data.checksum.algorithm !== "SHA-256") return fail({ code: "checksum" });
  const actual = await sha256Hex(canonicalJson(envelope.data));
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
  if (versions > 0 || measurements > 0) return fail({ code: "orphans", versions, measurements });

  return { ok: true, envelope };
};
