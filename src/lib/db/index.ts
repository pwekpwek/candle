import { createBatchesRepo } from "./batches";
import { createBatchTraceRepo } from "./batch-trace";
import { createMaterialLotsRepo } from "./material-lots";
import { createSuppliersRepo } from "./suppliers";
import { createBurnPhotosRepo } from "./burn-photos";
import { createBurnSessionsRepo } from "./burn-sessions";
import { createCurePlansRepo } from "./cure-plans";
import { createCorrectiveExperimentsRepo } from "./corrective-experiments";
import { createInvestigationPhotosRepo } from "./investigation-photos";
import { createInvestigationsRepo } from "./investigations";
import { createProductionPlansRepo } from "./production-plans";
import { createScheduleRepo } from "./schedule";
import { openDatabase } from "./db";
import type { CandleDatabase, DataLayer, DataLayerOptions } from "./contract";
import { createDraftsRepo } from "./drafts";
import { createExampleRepo } from "./example";
import { createFormulasRepo } from "./formulas";
import { createMaterialsRepo } from "./materials";
import { createMeasurementsRepo } from "./measurements";
import { createMetaRepo } from "./meta";
import { createVersionsRepo } from "./versions";
import { createCostItemsRepo } from "./cost-items";
import { createCostSheetsRepo } from "./cost-sheets";

export { openDatabase, SCHEMA_V1, SCHEMA_V2_ADDED, SCHEMA_V3_ADDED, SCHEMA_V4_ADDED, SCHEMA_V5_ADDED, SCHEMA_V6_ADDED, SCHEMA_V7_ADDED } from "./db";
export { sha256OfBytes } from "./burn-photos";
export { DataError } from "./errors";
export { bumpChangeCounter } from "./meta";
export { probeStorage } from "./probe";
export type * from "./contract";

export function createDataLayer(db: CandleDatabase, options: DataLayerOptions = {}): DataLayer {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => crypto.randomUUID());
  const meta = createMetaRepo(db);
  return {
    materials: createMaterialsRepo(db, now, newId),
    formulas: createFormulasRepo(db, now),
    versions: createVersionsRepo(db, now, newId, meta),
    measurements: createMeasurementsRepo(db, now, newId),
    batches: createBatchesRepo(db, now),
    curePlans: createCurePlansRepo(db, now, newId),
    productionPlans: createProductionPlansRepo(db, now),
    schedule: createScheduleRepo(db),
    burnSessions: createBurnSessionsRepo(db, now, newId),
    burnPhotos: createBurnPhotosRepo(db, now),
    suppliers: createSuppliersRepo(db, now, newId),
    materialLots: createMaterialLotsRepo(db, now, newId),
    batchTrace: createBatchTraceRepo(db),
    investigations: createInvestigationsRepo(db, now, newId),
    investigationPhotos: createInvestigationPhotosRepo(db, now),
    correctiveExperiments: createCorrectiveExperimentsRepo(db, now),
    costItems: createCostItemsRepo(db, now, newId),
    costSheets: createCostSheetsRepo(db, now, newId),
    drafts: createDraftsRepo(db, now),
    meta,
    example: createExampleRepo(db, now, newId),
  };
}

let singleton: DataLayer | undefined;

/** Lazy singleton on the default database. Nothing opens until first use. */
export function getDataLayer(): DataLayer {
  singleton ??= createDataLayer(openDatabase());
  return singleton;
}
