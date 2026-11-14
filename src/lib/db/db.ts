import Dexie from "dexie";
import { DB_NAME } from "@/lib/types";
import type { CandleDatabase } from "./contract";

/**
 * Builds the Dexie instance (schema version 1). Dexie opens lazily on the
 * first query, so calling this never touches IndexedDB by itself.
 */
export function openDatabase(name: string = DB_NAME): CandleDatabase {
  const db = new Dexie(name) as CandleDatabase;
  db.version(1).stores({
    materials: "id, type, archivedAt",
    formulas: "id, updatedAt, archivedAt",
    formulaVersions: "id, formulaId, &[formulaId+number]",
    measurements: "id, versionId, formulaId",
    drafts: "key",
    meta: "key",
  });
  return db;
}
