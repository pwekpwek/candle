/**
 * Compile-time checks: each schema's inferred type must match its record type
 * in `@/lib/types` in both directions, with the same top-level keys. A change
 * to either side that makes them diverge fails `npx tsc --noEmit` here.
 */
import type { z } from "zod";
import type {
  BackupCounts,
  BackupData,
  BackupEnvelope,
  Batch,
  BatchLot,
  ChecklistTick,
  Component,
  CorrectiveExperiment,
  CureMilestone,
  CurePlan,
  Formula,
  FormulaVersion,
  Hypothesis,
  Investigation,
  InvestigationPhoto,
  InvestigationPhotoBackup,
  Material,
  MaterialLot,
  MaterialSnapshot,
  Measurement,
  ProductionPlan,
  Sizing,
  Supplier,
  VersionInputs,
  VersionTargets,
} from "@/lib/types";
import type { BatchSchema } from "./batch";
import type {
  ChecklistTickSchema,
  CorrectiveExperimentSchema,
  HypothesisSchema,
  InvestigationPhotoBackupSchema,
  InvestigationPhotoSchema,
  InvestigationSchema,
} from "./candlefix";
import type { BackupCountsSchema, BackupDataSchema, BackupEnvelopeSchema } from "./backup";
import type { FormulaSchema } from "./formula";
import type { MaterialSchema, MaterialSnapshotSchema } from "./material";
import type { MeasurementSchema } from "./measurement";
import type { BatchLotSchema, MaterialLotSchema, SupplierSchema } from "./lots";
import type { CureMilestoneSchema, CurePlanSchema, ProductionPlanSchema } from "./schedule";
import type {
  ComponentSchema,
  FormulaVersionSchema,
  SizingSchema,
  VersionInputsSchema,
  VersionTargetsSchema,
} from "./version";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type SameKeys<A, B> = Same<keyof A, keyof B>;
type Assert<T extends true> = T;

type Out<S extends z.ZodType> = z.output<S>;

export type TypeChecks = [
  Assert<Same<Out<typeof MaterialSchema>, Material>>,
  Assert<SameKeys<Out<typeof MaterialSchema>, Material>>,
  Assert<Same<Out<typeof MaterialSnapshotSchema>, MaterialSnapshot>>,
  Assert<SameKeys<Out<typeof MaterialSnapshotSchema>, MaterialSnapshot>>,
  Assert<Same<Out<typeof FormulaSchema>, Formula>>,
  Assert<SameKeys<Out<typeof FormulaSchema>, Formula>>,
  Assert<Same<Out<typeof SizingSchema>, Sizing>>,
  Assert<Same<Out<typeof ComponentSchema>, Component>>,
  Assert<SameKeys<Out<typeof ComponentSchema>, Component>>,
  Assert<Same<Out<typeof VersionInputsSchema>, VersionInputs>>,
  Assert<SameKeys<Out<typeof VersionInputsSchema>, VersionInputs>>,
  Assert<Same<Out<typeof VersionTargetsSchema>, VersionTargets>>,
  Assert<SameKeys<Out<typeof VersionTargetsSchema>, VersionTargets>>,
  Assert<Same<Out<typeof FormulaVersionSchema>, FormulaVersion>>,
  Assert<SameKeys<Out<typeof FormulaVersionSchema>, FormulaVersion>>,
  Assert<Same<Out<typeof MeasurementSchema>, Measurement>>,
  Assert<SameKeys<Out<typeof MeasurementSchema>, Measurement>>,
  Assert<Same<Out<typeof BatchSchema>, Batch>>,
  Assert<SameKeys<Out<typeof BatchSchema>, Batch>>,
  Assert<Same<Out<typeof CureMilestoneSchema>, CureMilestone>>,
  Assert<SameKeys<Out<typeof CureMilestoneSchema>, CureMilestone>>,
  Assert<Same<Out<typeof CurePlanSchema>, CurePlan>>,
  Assert<SameKeys<Out<typeof CurePlanSchema>, CurePlan>>,
  Assert<Same<Out<typeof ProductionPlanSchema>, ProductionPlan>>,
  Assert<SameKeys<Out<typeof ProductionPlanSchema>, ProductionPlan>>,
  Assert<Same<Out<typeof SupplierSchema>, Supplier>>,
  Assert<SameKeys<Out<typeof SupplierSchema>, Supplier>>,
  Assert<Same<Out<typeof MaterialLotSchema>, MaterialLot>>,
  Assert<SameKeys<Out<typeof MaterialLotSchema>, MaterialLot>>,
  Assert<Same<Out<typeof BatchLotSchema>, BatchLot>>,
  Assert<SameKeys<Out<typeof BatchLotSchema>, BatchLot>>,
  Assert<Same<Out<typeof ChecklistTickSchema>, ChecklistTick>>,
  Assert<SameKeys<Out<typeof ChecklistTickSchema>, ChecklistTick>>,
  Assert<Same<Out<typeof HypothesisSchema>, Hypothesis>>,
  Assert<SameKeys<Out<typeof HypothesisSchema>, Hypothesis>>,
  Assert<Same<Out<typeof InvestigationSchema>, Investigation>>,
  Assert<SameKeys<Out<typeof InvestigationSchema>, Investigation>>,
  Assert<Same<Out<typeof InvestigationPhotoSchema>, InvestigationPhoto>>,
  Assert<SameKeys<Out<typeof InvestigationPhotoSchema>, InvestigationPhoto>>,
  Assert<Same<Out<typeof InvestigationPhotoBackupSchema>, InvestigationPhotoBackup>>,
  Assert<SameKeys<Out<typeof InvestigationPhotoBackupSchema>, InvestigationPhotoBackup>>,
  Assert<Same<Out<typeof CorrectiveExperimentSchema>, CorrectiveExperiment>>,
  Assert<SameKeys<Out<typeof CorrectiveExperimentSchema>, CorrectiveExperiment>>,
  Assert<Same<Out<typeof BackupCountsSchema>, BackupCounts>>,
  Assert<Same<Out<typeof BackupDataSchema>, BackupData>>,
  Assert<SameKeys<Out<typeof BackupDataSchema>, BackupData>>,
  Assert<Same<Out<typeof BackupEnvelopeSchema>, BackupEnvelope>>,
  Assert<SameKeys<Out<typeof BackupEnvelopeSchema>, BackupEnvelope>>,
];
