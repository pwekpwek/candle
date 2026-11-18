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

/**
 * Builds the Dexie instance (schema version 2). Dexie opens lazily on the
 * first query, so calling this never touches IndexedDB by itself.
 *
 * Version 2 (v0.2, BatchTrace) only adds the `batches` store. Every v0.1
 * store keeps its key and indexes, so the upgrade from version 1 moves no
 * records (DATA-29); a v0.1 database opens with all its data and an empty
 * `batches` store.
 */
export function openDatabase(name: string = DB_NAME): CandleDatabase {
  const db = new Dexie(name) as CandleDatabase;
  db.version(1).stores(SCHEMA_V1);
  db.version(2).stores({
    batches: "id, formulaId, versionId, producedOn",
  });
  return db;
}
