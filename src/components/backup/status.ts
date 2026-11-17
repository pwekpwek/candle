import { getDataLayer } from "@/lib/db";
import type { MetaState } from "@/lib/db";

export type BackupStatus = {
  meta: MetaState;
  /** An unsaved editor draft exists (it is never part of a backup). */
  hasDraft: boolean;
  /** When the status was read, for relative times. */
  now: number;
};

/** Reads the last-backup facts and looks for unsaved drafts (one round of parallel reads). */
export async function loadStatus(): Promise<BackupStatus> {
  const layer = getDataLayer();
  const [meta, items] = await Promise.all([layer.meta.get(), layer.formulas.list()]);
  const keys = ["new", ...items.map((item) => item.formula.id)];
  const drafts = await Promise.all(keys.map((key) => layer.drafts.get(key)));
  return { meta, hasDraft: drafts.some((d) => d !== undefined), now: Date.now() };
}
