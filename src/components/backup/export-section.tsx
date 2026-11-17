"use client";

import { useRef, useState } from "react";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { exportBackup } from "@/lib/backup";
import { MESSAGES } from "@/lib/messages";
import { formatRelativeTime } from "@/lib/time";
import { backupDatabase } from "./database";
import { downloadText } from "./download";
import { FocusRegion } from "./focus-region";
import { formatExportedAt } from "./format";
import type { BackupStatus } from "./status";

const B = MESSAGES.backup;

type Done = { exportedAt: string; formulas: number; versions: number; key: number };

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
      counter.current += 1;
      setDone({
        exportedAt: out.envelope.exportedAt,
        formulas: out.envelope.counts.formulas,
        versions: out.envelope.counts.formulaVersions,
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
