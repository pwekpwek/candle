import { META_KEYS, bumpChangeCounter } from "@/lib/db/meta";
import { guard, toDataError } from "@/lib/db/errors";
import type { CandleDatabase } from "@/lib/db/contract";
import { DATA_STORES } from "@/lib/types";
import type { BackupCounts, DataStoreName } from "@/lib/types";
import { canonicalJson } from "./canonical";
import type {
  ApplyRestore,
  DeviceData,
  DeviceIds,
  ReadDeviceData,
  RestorePlan,
} from "./contract";
import { planRestore } from "./plan";

function byId<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Reads the four stores, each sorted by id. Only Dexie operations are awaited,
 * so it is safe to call inside any transaction that includes these stores.
 */
async function readStores(db: CandleDatabase): Promise<DeviceData> {
  const materials = await db.materials.toArray();
  const formulas = await db.formulas.toArray();
  const formulaVersions = await db.formulaVersions.toArray();
  const measurements = await db.measurements.toArray();
  const batches = await db.batches.toArray();
  return {
    materials: byId(materials),
    formulas: byId(formulas),
    formulaVersions: byId(formulaVersions),
    measurements: byId(measurements),
    batches: byId(batches),
  };
}

/** One read-only transaction over the five data stores. Failures are DataError("storage"). */
export const readDeviceData: ReadDeviceData = (db) =>
  guard(() =>
    db.transaction(
      "r",
      [db.materials, db.formulas, db.formulaVersions, db.measurements, db.batches],
      () => readStores(db),
    ),
  );

/** The ids already on the device, for `checkBackupText`. */
export function deviceIdsOf(device: DeviceData): DeviceIds {
  return {
    formulaIds: new Set(device.formulas.map((formula) => formula.id)),
    versionIds: new Set(device.formulaVersions.map((version) => version.id)),
  };
}

/** Thrown inside the transaction to abort it when the device changed since the plan. */
class StaleRestore extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "StaleRestore";
  }
}

function findStale(error: unknown): StaleRestore | undefined {
  if (error instanceof StaleRestore) return error;
  const inner = (error as { inner?: unknown } | null)?.inner;
  return inner instanceof StaleRestore ? inner : undefined;
}

/** Names the first thing that differs, as plain text for logs. Synchronous. */
function staleCheck(plan: RestorePlan, fresh: DeviceData, safetyData: DeviceData | undefined): void {
  if (plan.mode === "replace") {
    if (!safetyData) throw new StaleRestore("No safety backup to compare with.");
    for (const store of DATA_STORES) {
      if (canonicalJson(fresh[store]) !== canonicalJson(safetyData[store])) {
        throw new StaleRestore(`The device changed after the safety backup was made (${store}).`);
      }
    }
    return;
  }
  const again = planRestore(plan.basis.envelope, fresh, {
    mode: plan.mode,
    policy: plan.policy,
    fileName: plan.fileName,
  });
  const pick = (p: RestorePlan) =>
    canonicalJson({
      puts: p.puts,
      clear: p.clear,
      renumbered: p.renumbered,
      expectedCounts: p.expectedCounts,
    });
  if (pick(again) !== pick(plan)) {
    throw new StaleRestore("The device changed since the restore was planned.");
  }
}

/** Database names with a restore running right now (DATA-28). */
const running = new Set<string>();

export const applyRestore: ApplyRestore = async (db, plan, options = {}) => {
  // 1. Refusals. Neither touches the database.
  if (running.has(db.name)) {
    return { ok: false, reason: "busy", detail: "Another restore is running on this database." };
  }
  if (plan.mode === "replace" && !options.safetyBackup) {
    return { ok: false, reason: "no-safety", detail: "Replace needs a safety backup first." };
  }

  running.add(db.name);
  try {
    // 2. One read-write transaction. Only Dexie operations are awaited inside it.
    try {
      await db.transaction(
        "rw",
        [db.materials, db.formulas, db.formulaVersions, db.measurements, db.batches, db.meta],
        async () => {
          const fresh = await readStores(db);
          staleCheck(plan, fresh, options.safetyBackup?.envelope.data);

          if (plan.clear) {
            await db.materials.clear();
            await db.formulas.clear();
            await db.formulaVersions.clear();
            await db.measurements.clear();
            await db.batches.clear();
          }
          for (const store of DATA_STORES) {
            await writeStore(db, store, plan);
            options.afterStoreWritten?.(store);
          }

          const now = options.now?.() ?? new Date().toISOString();
          await db.meta.put({ key: META_KEYS.lastRestoreAt, value: now });
          const wrote = plan.clear || DATA_STORES.some((store) => plan.puts[store].length > 0);
          if (wrote) await bumpChangeCounter(db);
        },
      );
    } catch (error) {
      const stale = findStale(error);
      if (stale) return { ok: false, reason: "stale", detail: stale.message };
      return { ok: false, reason: "storage", detail: toDataError(error).message };
    }

    // 3. After commit: the counts must be what the plan said.
    let counts: BackupCounts;
    try {
      counts = await readCounts(db);
    } catch (error) {
      return {
        ok: false,
        reason: "mismatch",
        detail: `Committed, but the counts could not be read back. ${toDataError(error).message}`,
      };
    }
    const differing = DATA_STORES.filter((store) => counts[store] !== plan.expectedCounts[store]);
    if (differing.length > 0) {
      const parts = differing.map(
        (store) => `${store}: expected ${plan.expectedCounts[store]}, found ${counts[store]}`,
      );
      return { ok: false, reason: "mismatch", detail: `After commit, ${parts.join("; ")}.` };
    }
    return { ok: true, plan, counts };
  } finally {
    running.delete(db.name);
  }
};

async function writeStore(db: CandleDatabase, store: DataStoreName, plan: RestorePlan): Promise<void> {
  switch (store) {
    case "materials":
      await db.materials.bulkPut(plan.puts.materials);
      return;
    case "formulas":
      await db.formulas.bulkPut(plan.puts.formulas);
      return;
    case "formulaVersions":
      await db.formulaVersions.bulkPut(plan.puts.formulaVersions);
      return;
    case "measurements":
      await db.measurements.bulkPut(plan.puts.measurements);
      return;
    case "batches":
      await db.batches.bulkPut(plan.puts.batches);
      return;
  }
}

async function readCounts(db: CandleDatabase): Promise<BackupCounts> {
  const [materials, formulas, formulaVersions, measurements, batches] = await Promise.all([
    db.materials.count(),
    db.formulas.count(),
    db.formulaVersions.count(),
    db.measurements.count(),
    db.batches.count(),
  ]);
  return { materials, formulas, formulaVersions, measurements, batches };
}
