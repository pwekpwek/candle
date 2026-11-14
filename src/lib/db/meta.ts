import { SCHEMA_VERSION } from "@/lib/types";
import type { CandleDatabase, MetaRepo, MetaState, PersistenceOutcome } from "./contract";
import { guard } from "./errors";

export const META_KEYS = {
  schemaVersion: "schemaVersion",
  lastBackupAt: "lastBackupAt",
  lastBackupCounts: "lastBackupCounts",
  changesSinceBackup: "changesSinceBackup",
  lastRestoreAt: "lastRestoreAt",
  exampleOffered: "exampleOffered",
  persistence: "persistence",
} as const;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asCounts(value: unknown): MetaState["lastBackupCounts"] {
  if (typeof value !== "object" || value === null) return null;
  const { formulas, formulaVersions } = value as Record<string, unknown>;
  if (typeof formulas !== "number" || typeof formulaVersions !== "number") return null;
  return { formulas, formulaVersions };
}

function asOutcome(value: unknown): PersistenceOutcome | null {
  return value === "granted" || value === "denied" || value === "unsupported" ? value : null;
}

/** Reads the meta rows as one object, with defaults for rows that are missing. */
export async function readMeta(db: CandleDatabase): Promise<MetaState> {
  const rows = await db.meta.toArray();
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const counter = byKey.get(META_KEYS.changesSinceBackup);
  const version = byKey.get(META_KEYS.schemaVersion);
  return {
    schemaVersion: typeof version === "number" ? version : SCHEMA_VERSION,
    lastBackupAt: asString(byKey.get(META_KEYS.lastBackupAt)),
    lastBackupCounts: asCounts(byKey.get(META_KEYS.lastBackupCounts)),
    changesSinceBackup: typeof counter === "number" ? counter : 0,
    lastRestoreAt: asString(byKey.get(META_KEYS.lastRestoreAt)),
    exampleOffered: byKey.get(META_KEYS.exampleOffered) === true,
    persistence: asOutcome(byKey.get(META_KEYS.persistence)),
  };
}

/**
 * DATA-13. Adds `by` (default 1) to `changesSinceBackup`. Must be called
 * inside the Dexie transaction of the write it counts, and that transaction
 * must include the `meta` table. One call per repository write call.
 */
export async function bumpChangeCounter(db: CandleDatabase, by = 1): Promise<void> {
  const row = await db.meta.get(META_KEYS.changesSinceBackup);
  const current = typeof row?.value === "number" ? row.value : 0;
  await db.meta.put({ key: META_KEYS.changesSinceBackup, value: current + by });
}

async function askBrowser(): Promise<PersistenceOutcome> {
  try {
    const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
    if (!storage || typeof storage.persist !== "function") return "unsupported";
    return (await storage.persist()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

export function createMetaRepo(db: CandleDatabase): MetaRepo {
  return {
    get: () => guard(() => readMeta(db)),

    setExampleOffered: () =>
      guard(async () => {
        await db.meta.put({ key: META_KEYS.exampleOffered, value: true });
      }),

    requestPersistence: () =>
      guard(async () => {
        const recorded = asOutcome((await db.meta.get(META_KEYS.persistence))?.value);
        if (recorded) return recorded;
        const outcome = await askBrowser();
        await db.meta.put({ key: META_KEYS.persistence, value: outcome });
        return outcome;
      }),
  };
}
