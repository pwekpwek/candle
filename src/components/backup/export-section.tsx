"use client";

import { useRef, useState } from "react";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { MAX_BACKUP_BYTES, exportBackup } from "@/lib/backup";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { formatRelativeTime } from "@/lib/time";
import { backupDatabase } from "./database";
import { downloadText } from "./download";
import { FocusRegion } from "./focus-region";
import { formatExportedAt, formatFileSize } from "./format";
import type { BackupStatus } from "./status";

const B = MESSAGES.backup;
const BC = MESSAGES.burnCompare;

type Done = {
  exportedAt: string;
  formulas: number;
  versions: number;
  sizeBytes: number;
  /** Photos on this device, or null when they could not be counted. */
  photos: { count: number; bytes: number } | null;
  key: number;
};

/** F6, PRD-24, PRD-27: the last-backup line, "Export backup", and its outcome. */
export function ExportSection({
  status,
  locked,
  onExported,
}: {
  status: BackupStatus | null;
  /** A restore is running: leave the export alone. */
  locked: boolean;
  onExported: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const running = useRef(false);
  const counter = useRef(0);

  async function run() {
    if (running.current) return; // double-click guard (FLOW-07)
    running.current = true;
    setBusy(true);
    setDone(null);
    setFailed(null);
    try {
      const out = await exportBackup(backupDatabase());
      downloadText(out.fileName, out.json);
      const photos = await getDataLayer()
        .burnPhotos.usage()
        .catch(() => null);
      counter.current += 1;
      setDone({
        exportedAt: out.envelope.exportedAt,
        formulas: out.envelope.counts.formulas,
        versions: out.envelope.counts.formulaVersions,
        sizeBytes: out.sizeBytes,
        photos,
        key: counter.current,
      });
      await onExported().catch(() => {});
    } catch (error) {
      console.error(error);
      counter.current += 1;
      setFailed(counter.current);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const last = status?.meta.lastBackupAt ?? null;
  return (
    <section aria-labelledby="backup-heading" className="grid gap-3">
      <h2 id="backup-heading" className="text-base font-semibold text-foreground">
        {B.backUpHeading}
      </h2>
      {status === null ? (
        <p className="text-sm text-text-secondary">{B.loadingStatus}</p>
      ) : last ? (
        <p className="text-sm text-text-secondary tabular-nums">
          {B.lastBackup(
            formatRelativeTime(last, status.now),
            status.meta.changesSinceBackup,
          )}
        </p>
      ) : (
        <p className="text-sm text-text-secondary">{B.neverBackedUp.title}</p>
      )}
      {status?.hasDraft ? <p className="text-sm text-text-secondary">{B.draftNotIncluded}</p> : null}
      <div>
        <Button type="button" busy={busy} disabled={locked} onClick={run}>
          {B.exportBackup}
        </Button>
      </div>
      {done ? (
        <FocusRegion key={done.key}>
          <Notice variant="success">
            <span className="tabular-nums">
              {B.exportedLine(formatExportedAt(done.exportedAt), done.formulas, done.versions)}
            </span>
          </Notice>
          <p className="mt-2 text-sm text-text-secondary tabular-nums">
            {BC.backupFileSize(formatFileSize(done.sizeBytes))}
          </p>
          {done.photos ? (
            <p className="text-sm text-text-secondary tabular-nums">
              {BC.backupDevicePhotos(done.photos.count, formatFileSize(done.photos.bytes))}
            </p>
          ) : null}
          {done.sizeBytes > MAX_BACKUP_BYTES ? (
            <Notice variant="warning" className="mt-2">
              {BC.backupTooLarge(formatFileSize(done.sizeBytes), formatFileSize(MAX_BACKUP_BYTES))}
            </Notice>
          ) : null}
        </FocusRegion>
      ) : null}
      {failed !== null ? (
        <FocusRegion key={failed}>
          <Notice variant="error">{B.exportFailed}</Notice>
        </FocusRegion>
      ) : null}
    </section>
  );
}
