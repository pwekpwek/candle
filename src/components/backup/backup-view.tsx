"use client";

import { useCallback, useEffect, useState } from "react";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";
import { ExportSection } from "./export-section";
import { RestoreSection } from "./restore-section";
import { loadStatus, type BackupStatus } from "./status";

const B = MESSAGES.backup;
const S = MESSAGES.storage;

/** The backup and restore page body (F6, F7). */
export function BackupView() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [storageDown, setStorageDown] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await loadStatus());
      setStorageDown(false);
    } catch (error) {
      console.error(error);
      setStorageDown(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadStatus().then(
      (next) => {
        if (!cancelled) setStatus(next);
      },
      (error) => {
        console.error(error);
        if (!cancelled) setStorageDown(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader title={B.title} description={B.intro} />
      <div className="grid max-w-2xl gap-6">
        {storageDown ? (
          <Notice variant="error" title={S.blockedTitle}>
            {S.blockedWhatToTry}
          </Notice>
        ) : null}
        <ExportSection status={status} locked={restoring} onExported={refresh} />
        <RestoreSection onRestored={refresh} onBusyChange={setRestoring} />
      </div>
    </>
  );
}
