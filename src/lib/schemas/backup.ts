import { z } from "zod";
import { BACKUP_FORMAT } from "@/lib/types";
import { BatchSchema } from "./batch";
import { FormulaSchema } from "./formula";
import { MaterialSchema } from "./material";
import { MeasurementSchema } from "./measurement";
import { TimestampSchema } from "./primitives";
import { BurnPhotoBackupSchema, BurnSessionSchema } from "./burn";
import { CurePlanSchema, ProductionPlanSchema } from "./schedule";
import { FormulaVersionSchema } from "./version";

/** BackupCounts: one whole number per exported store. */
export const BackupCountsSchema = z.strictObject({
  materials: z.int().min(0),
  formulas: z.int().min(0),
  formulaVersions: z.int().min(0),
  measurements: z.int().min(0),
  batches: z.int().min(0),
  curePlans: z.int().min(0),
  productionPlans: z.int().min(0),
  burnSessions: z.int().min(0),
  burnPhotos: z.int().min(0),
});

/** The exported stores (DATA-15), current format (4). Drafts and meta are not exported (DATA-17). */
export const BackupDataSchema = z.strictObject({
  materials: z.array(MaterialSchema),
  formulas: z.array(FormulaSchema),
  formulaVersions: z.array(FormulaVersionSchema),
  measurements: z.array(MeasurementSchema),
  batches: z.array(BatchSchema),
  curePlans: z.array(CurePlanSchema),
  productionPlans: z.array(ProductionPlanSchema),
  burnSessions: z.array(BurnSessionSchema),
  burnPhotos: z.array(BurnPhotoBackupSchema),
});

/** SHA-256 of the data section, lowercase hex (DATA-16). */
export const BackupChecksumSchema = z.strictObject({
  algorithm: z.literal("SHA-256"),
  value: z.string().regex(/^[0-9a-f]{64}$/, { error: "Checksum must be 64 lowercase hex characters." }),
});

/**
 * The backup file. formatVersion and schemaVersion are checked as known
 * values by the restore step, not here, so this schema accepts any whole
 * number from 1 up.
 */
export const BackupEnvelopeSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.int().min(1),
  schemaVersion: z.int().min(1),
  appVersion: z.string().min(1),
  exportedAt: TimestampSchema,
  counts: BackupCountsSchema,
  checksum: BackupChecksumSchema,
  data: BackupDataSchema,
});
