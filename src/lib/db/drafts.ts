import type { CandleDatabase, Draft, DraftsRepo } from "./contract";
import { guard } from "./errors";

/**
 * Drafts keep the editor's raw text exactly as typed (PRD-13): `fields` is not
 * validated or trimmed. Draft writes do not count towards the change counter.
 */
export function createDraftsRepo(db: CandleDatabase, now: () => string): DraftsRepo {
  return {
    get: (key) => guard(() => db.drafts.get(key)),

    put: (key, baseVersionId, fields) =>
      guard(async () => {
        const draft: Draft = { key, baseVersionId, fields, updatedAt: now() };
        await db.drafts.put(draft);
        return draft;
      }),

    delete: (key) =>
      guard(async () => {
        await db.drafts.delete(key);
      }),
  };
}
