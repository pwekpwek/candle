import "fake-indexeddb/auto";
import { openDatabase } from "@/lib/db";
import type { BurnSessionInput } from "@/lib/db";
import { layer, polyfillBrowser, seedBatch } from "../schedule-ui/harness";

/** Not a test file: shared setup for the BurnMatrix session screen tests. */

export { layer, polyfillBrowser, seedBatch };
export { daysFromToday } from "../schedule-ui/harness";

export async function clearAll() {
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.measurements.clear(),
    db.batches.clear(),
    db.curePlans.clear(),
    db.productionPlans.clear(),
    db.burnSessions.clear(),
    db.burnPhotos.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
}

/** A session with one candle (typed wick) and two burns, on the given batch. */
export async function seedSession(
  batchId: string,
  testedOn: string,
  overrides: Partial<BurnSessionInput> = {},
) {
  const sessionId = crypto.randomUUID();
  const { session } = await layer().burnSessions.create({
    sessionId,
    batchId,
    testedOn,
    milestoneId: null,
    candles: [
      {
        label: "Candle 1",
        wick: { text: "CD-10" },
        burns: [
          {
            durationMin: 120,
            weightBeforeMg: 200000,
            weightAfterMg: 197000,
            meltPoolDiameterMm: 55,
            soot: "light",
          },
          { durationMin: 90, notes: "Flame flickered" },
        ],
        coldThrow: "Soft vanilla",
      },
    ],
    ...overrides,
  });
  return session;
}
