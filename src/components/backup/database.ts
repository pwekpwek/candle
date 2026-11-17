import { openDatabase } from "@/lib/db";
import type { CandleDatabase } from "@/lib/db";

let instance: CandleDatabase | undefined;

/**
 * The default database, opened on first use (never at import time). The backup
 * functions take a `CandleDatabase`; the data layer keeps its own handle to
 * the same IndexedDB database, so both see the same data.
 */
export function backupDatabase(): CandleDatabase {
  instance ??= openDatabase();
  return instance;
}
