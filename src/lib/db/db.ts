import Dexie from "dexie";
import { DB_NAME } from "@/lib/types";
import type { CandleDatabase } from "./contract";

/** Schema version 1 (v0.1). Kept so Dexie can upgrade a v0.1 database in place. */
export const SCHEMA_V1 = {
  materials: "id, type, archivedAt",
  formulas: "id, updatedAt, archivedAt",
  formulaVersions: "id, formulaId, &[formulaId+number]",
  measurements: "id, versionId, formulaId",
  drafts: "key",
  meta: "key",
} as const;

/** Stores added by schema version 2 (v0.2 BatchTrace). */
export const SCHEMA_V2_ADDED = {
  batches: "id, formulaId, versionId, producedOn",
} as const;

/** Stores added by schema version 3 (v0.2 CurePilot). */
export const SCHEMA_V3_ADDED = {
  /** Key is the batch id: one plan per batch. */
  curePlans: "id",
  productionPlans: "id, formulaId, versionId, plannedOn, batchId",
} as const;

/** Stores added by schema version 4 (v0.2 BurnMatrix). */
export const SCHEMA_V4_ADDED = {
  /** Unlinked sessions have milestoneId null and are left out of that index. */
  burnSessions: "id, batchId, milestoneId, testedOn",
  burnPhotos: "id, sessionId",
} as const;

/** Stores added by schema version 5 (v0.3 lots and suppliers). Batches gain an optional `lots` field, which needs no index. */
export const SCHEMA_V5_ADDED = {
  suppliers: "id, name",
  /** Lots without a supplier have supplierId null and are left out of that index. */
  materialLots: "id, materialId, supplierId",
} as const;

/** Stores added by schema version 6 (v0.3 CandleFix). Experiments index their listed burn tests (multi-entry). */
export const SCHEMA_V6_ADDED = {
  investigations: "id, batchId, observedOn",
  investigationPhotos: "id, investigationId",
  correctiveExperiments: "id, investigationId, followUpBatchId, *burnSessionIds",
} as const;

/**
 * Stores added by schema version 7 (v0.3 TrueCandle Cost). Materials, lots and
 * batches gain optional price and candle-count fields, which need no index.
 * Version sheets have batchId null and are left out of that index.
 */
export const SCHEMA_V7_ADDED = {
  costItems: "id, name",
  costSheets: "id, formulaId, versionId, batchId",
} as const;

/**
 * Builds the Dexie instance (schema version 7). Dexie opens lazily on the
 * first query, so calling this never touches IndexedDB by itself.
 *
 * Version 2 (BatchTrace) added `batches`; version 3 (CurePilot) adds
 * `curePlans` and `productionPlans`; version 4 (BurnMatrix) adds
 * `burnSessions` and `burnPhotos`; version 5 (v0.3) adds `suppliers` and
 * `materialLots`; version 6 (v0.3 CandleFix) adds `investigations`,
 * `investigationPhotos` and `correctiveExperiments`; version 7 (v0.3 TrueCandle
 * Cost) adds `costItems` and `costSheets`. Each version only adds stores. Every
 * earlier store keeps its key and indexes, so an upgrade moves no records
 * (DATA-29): an older database opens with all its data and empty new stores.
 */
export function openDatabase(name: string = DB_NAME): CandleDatabase {
  const db = new Dexie(name) as CandleDatabase;
  db.version(1).stores(SCHEMA_V1);
  db.version(2).stores(SCHEMA_V2_ADDED);
  db.version(3).stores(SCHEMA_V3_ADDED);
  db.version(4).stores(SCHEMA_V4_ADDED);
  db.version(5).stores(SCHEMA_V5_ADDED);
  db.version(6).stores(SCHEMA_V6_ADDED);
  db.version(7).stores(SCHEMA_V7_ADDED);
  return db;
}
