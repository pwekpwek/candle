import { META_KEYS } from "@/lib/db/meta";
import { guard } from "@/lib/db/errors";
import {
  APP_VERSION,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  SCHEMA_VERSION,
  type BackupData,
  type BackupEnvelope,
} from "@/lib/types";
import { canonicalJson, sha256Hex } from "./canonical";
import { photoToBackup } from "./photos";
import type { BackupFileName, ExportBackup } from "./contract";

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

/** `candlelab-backup-YYYYMMDD-HHmmss.json` from the UTC parts of `exportedAt`. */
export const backupFileName: BackupFileName = (exportedAt) => {
  const time = typeof exportedAt === "string" ? Date.parse(exportedAt) : Number.NaN;
  if (Number.isNaN(time)) {
    throw new RangeError(`backupFileName: not a valid timestamp: ${String(exportedAt)}`);
  }
  const match = ISO.exec(exportedAt);
  let parts: string[];
  if (match) {
    parts = match.slice(1, 7);
  } else {
    const d = new Date(time);
    const two = (n: number) => String(n).padStart(2, "0");
    parts = [
      String(d.getUTCFullYear()).padStart(4, "0"),
      two(d.getUTCMonth() + 1),
      two(d.getUTCDate()),
      two(d.getUTCHours()),
      two(d.getUTCMinutes()),
      two(d.getUTCSeconds()),
    ];
  }
  const [y, mo, d, h, mi, s] = parts;
  return `candlelab-backup-${y}${mo}${d}-${h}${mi}${s}.json`;
};

/** UTF-8 byte length of a string, without encoding it (backups with photos are large). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

function byId<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const exportBackup: ExportBackup = async (db, options) => {
  const now = options?.now ?? (() => new Date().toISOString());

  // DATA-15: one read-only transaction, nothing awaited inside except Dexie.
  const data: BackupData = await guard(() =>
    db.transaction(
      "r",
      [
        db.materials,
        db.formulas,
        db.formulaVersions,
        db.measurements,
        db.batches,
        db.curePlans,
        db.productionPlans,
        db.burnSessions,
        db.burnPhotos,
        db.suppliers,
        db.materialLots,
      ],
      async () => {
        const [
          materials,
          formulas,
          formulaVersions,
          measurements,
          batches,
          curePlans,
          productionPlans,
          burnSessions,
          burnPhotos,
          suppliers,
          materialLots,
        ] = await Promise.all([
            db.materials.toArray(),
            db.formulas.toArray(),
            db.formulaVersions.toArray(),
            db.measurements.toArray(),
            db.batches.toArray(),
            db.curePlans.toArray(),
            db.productionPlans.toArray(),
            db.burnSessions.toArray(),
            db.burnPhotos.toArray(),
            db.suppliers.toArray(),
            db.materialLots.toArray(),
          ]);
        return {
          materials: byId(materials),
          formulas: byId(formulas),
          formulaVersions: byId(formulaVersions),
          measurements: byId(measurements),
          batches: byId(batches),
          curePlans: byId(curePlans),
          productionPlans: byId(productionPlans),
          burnSessions: byId(burnSessions),
          // BurnMatrix: photos go into the file as base64 (synchronous).
          burnPhotos: byId(burnPhotos).map(photoToBackup),
          suppliers: byId(suppliers),
          materialLots: byId(materialLots),
        };
      },
    ),
  );

  const exportedAt = now();
  const counts = {
    materials: data.materials.length,
    formulas: data.formulas.length,
    formulaVersions: data.formulaVersions.length,
    measurements: data.measurements.length,
    batches: data.batches.length,
    curePlans: data.curePlans.length,
    productionPlans: data.productionPlans.length,
    burnSessions: data.burnSessions.length,
    burnPhotos: data.burnPhotos.length,
    suppliers: data.suppliers.length,
    materialLots: data.materialLots.length,
  };
  // Hashing happens outside any Dexie transaction.
  const checksum = { algorithm: "SHA-256" as const, value: await sha256Hex(canonicalJson(data)) };

  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt,
    counts,
    checksum,
    data,
  };
  const json = JSON.stringify(envelope, null, 2);
  const fileName = backupFileName(exportedAt);
  const sizeBytes = utf8Length(json);

  // Accepted gap: a write committed between the read above and this reset is not in the file, yet its counter bump is wiped.
  await guard(() =>
    db.transaction("rw", db.meta, async () => {
      await db.meta.bulkPut([
        { key: META_KEYS.lastBackupAt, value: exportedAt },
        {
          key: META_KEYS.lastBackupCounts,
          value: { formulas: counts.formulas, formulaVersions: counts.formulaVersions },
        },
        { key: META_KEYS.changesSinceBackup, value: 0 },
      ]);
    }),
  );

  return { envelope, json, fileName, sizeBytes };
};
