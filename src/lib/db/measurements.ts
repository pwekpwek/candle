import { MeasurementSchema } from "@/lib/schemas";
import type { Measurement } from "@/lib/types";
import type { CandleDatabase, MeasurementsRepo } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

function earliestFirst(a: Measurement, b: Measurement): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function createMeasurementsRepo(
  db: CandleDatabase,
  now: () => string,
  newId: () => string,
): MeasurementsRepo {
  return {
    getForVersion: (versionId) =>
      guard(async () => {
        const rows = await db.measurements.where("versionId").equals(versionId).toArray();
        return rows.sort(earliestFirst)[0];
      }),

    listByFormula: (formulaId) =>
      guard(async () => {
        const rows = await db.measurements.where("formulaId").equals(formulaId).toArray();
        return rows.sort(earliestFirst);
      }),

    saveEntries: (versionId, entries) =>
      guard(() =>
        db.transaction("rw", [db.measurements, db.formulaVersions, db.meta], async () => {
          const version = await db.formulaVersions.get(versionId);
          if (!version) throw notFound("Version", versionId);

          const known = new Set(
            [...version.inputs.waxes, ...version.inputs.oils].map((row) => row.componentId),
          );
          const seen = new Set<string>();
          for (const entry of entries) {
            if (!known.has(entry.componentId)) {
              throw new DataError("invalid", `Component ${entry.componentId} is not in this version.`);
            }
            if (seen.has(entry.componentId)) {
              throw new DataError("invalid", `Component ${entry.componentId} is measured twice.`);
            }
            seen.add(entry.componentId);
          }

          const timestamp = now();
          const rows = await db.measurements.where("versionId").equals(versionId).toArray();
          const existing = rows.sort(earliestFirst)[0];
          const cleanEntries = entries.map((entry) => ({
            componentId: entry.componentId,
            actualMg: entry.actualMg,
          }));
          const record = parseRecord(
            MeasurementSchema,
            existing
              ? { ...existing, entries: cleanEntries, updatedAt: timestamp }
              : {
                  id: newId(),
                  formulaId: version.formulaId,
                  versionId,
                  entries: cleanEntries,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                },
            "measurement",
          );
          await db.measurements.put(record);
          await bumpChangeCounter(db);
          return record;
        }),
      ),
  };
}
