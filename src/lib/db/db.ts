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

/**
 * Builds the Dexie instance (schema version 3). Dexie opens lazily on the
 * first query, so calling this never touches IndexedDB by itself.
 *
 * Version 2 (BatchTrace) added `batches`; version 3 (CurePilot) adds
 * `curePlans` and `productionPlans`. Each version only adds stores. Every
 * earlier store keeps its key and indexes, so an upgrade moves no records
 * (DATA-29): an older database opens with all its data and empty new stores.
 */
export function openDatabase(name: string = DB_NAME): CandleDatabase {
  const db = new Dexie(name) as CandleDatabase;
  db.version(1).stores(SCHEMA_V1);
  db.version(2).stores(SCHEMA_V2_ADDED);
  db.version(3).stores(SCHEMA_V3_ADDED);
  return db;
}
