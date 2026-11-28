"use client";

import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataError, getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.candleFix;

/** Confirmation for deleting an investigation. Counts the photos and corrective experiments that go with it. */
export function DeleteInvestigationDialog({
  investigationId,
  title,
  open,
  onOpenChange,
  onDeleted,
}: {
  investigationId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{M.deleteTitle}</DialogTitle>
          <DialogDescription className="sr-only">{M.deleteTitle}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the counts are read fresh each time. */}
        <DeleteBody
          investigationId={investigationId}
          title={title}
          onCancel={() => onOpenChange(false)}
          onDeleted={onDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}

type Impact =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; photos: number; experiments: number };

function DeleteBody({
  investigationId,
  title,
  onCancel,
  onDeleted,
}: {
  investigationId: string;
  title: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [impact, setImpact] = useState<Impact>({ state: "loading" });
  const submitting = useRef(false);

  useEffect(() => {
    let live = true;
    getDataLayer()
      .investigations.deletionImpact(investigationId)
      .then((counts) => {
        if (live) setImpact({ state: "ready", ...counts });
      })
      .catch(() => {
        if (live) setImpact({ state: "failed" });
      });
    return () => {
      live = false;
    };
  }, [investigationId]);

  async function confirm() {
    // Without the counts the maker has not seen what goes with it, so the delete waits.
    if (submitting.current || impact.state !== "ready") return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await getDataLayer().investigations.delete(investigationId);
      onDeleted();
    } catch (error) {
      if (error instanceof DataError && error.code === "not-found") {
        // Deleted elsewhere in the meantime: the goal is met.
        onDeleted();
        return;
      }
      setFailed(true);
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {failed ? <Notice variant="error">{M.deleteFailed}</Notice> : null}
      {impact.state === "failed" ? <Notice variant="error">{M.deleteFailed}</Notice> : null}
      <p className="text-sm text-foreground">{M.deleteBody(title)}</p>
      {impact.state === "loading" ? (
        <p role="status" className="text-sm text-text-secondary">
          {M.deleteChecking}
        </p>
      ) : null}
      {impact.state === "ready" ? (
        <p data-testid="delete-impact" className="text-sm text-foreground">
          {M.deleteImpact(impact.photos, impact.experiments)}
        </p>
      ) : null}
      <DialogFooter>
        {/* First in the tab order, so the keep button takes the opening focus. */}
        <Button type="button" variant="secondary" onClick={onCancel}>
          {M.deleteKeep}
        </Button>
        <Button
          type="button"
          variant="destructive"
          busy={busy}
          disabled={impact.state !== "ready"}
          onClick={confirm}
        >
          {M.deleteConfirm}
        </Button>
      </DialogFooter>
    </div>
  );
}
