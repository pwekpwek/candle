import { openDatabase } from "./db";
import type {
  CandleDatabase,
  DataLayer,
  DataLayerOptions,
  MeasurementsRepo,
  VersionsRepo,
} from "./contract";
import { createDraftsRepo } from "./drafts";
import { createExampleRepo } from "./example";
import { createFormulasRepo } from "./formulas";
import { createMaterialsRepo } from "./materials";
import { createMetaRepo } from "./meta";

export { openDatabase } from "./db";
export { DataError } from "./errors";
export { bumpChangeCounter } from "./meta";
export { probeStorage } from "./probe";
export type * from "./contract";

function notImplemented(): Promise<never> {
  return Promise.reject(new Error("not implemented until T11"));
}

// TODO(T11): replace this placeholder with `createVersionsRepo(db, now, newId, meta)` from ./versions.
function createVersionsPlaceholder(): VersionsRepo {
  return { listByFormula: notImplemented, get: notImplemented, save: notImplemented };
}

// TODO(T11): replace this placeholder with `createMeasurementsRepo(db, now, newId)` from ./measurements.
function createMeasurementsPlaceholder(): MeasurementsRepo {
  return {
    getForVersion: notImplemented,
    listByFormula: notImplemented,
    saveEntries: notImplemented,
  };
}

export function createDataLayer(db: CandleDatabase, options: DataLayerOptions = {}): DataLayer {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => crypto.randomUUID());
  return {
    materials: createMaterialsRepo(db, now, newId),
    formulas: createFormulasRepo(db, now),
    versions: createVersionsPlaceholder(), // TODO(T11)
    measurements: createMeasurementsPlaceholder(), // TODO(T11)
    drafts: createDraftsRepo(db, now),
    meta: createMetaRepo(db),
    example: createExampleRepo(db, now, newId),
  };
}

let singleton: DataLayer | undefined;

/** Lazy singleton on the default database. Nothing opens until first use. */
export function getDataLayer(): DataLayer {
  singleton ??= createDataLayer(openDatabase());
  return singleton;
}
