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

const M = MESSAGES.burn;

/** Confirmation for deleting a burn test. Counts the photos that go with it. */
export function DeleteSessionDialog({
  sessionId,
  title,
  open,
  onOpenChange,
  onDeleted,
}: {
  sessionId: string;
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
        {/* Mounted only while open, so the photo count is read fresh each time. */}
        <DeleteBody
          sessionId={sessionId}
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
  sessionId,
  title,
  onCancel,
  onDeleted,
}: {
  sessionId: string;
  title: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [impact, setImpact] = useState<Impact>({ state: "loading" });
  // Set when the delete is refused because a corrective experiment lists the burn test.
  const [refused, setRefused] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    let live = true;
    getDataLayer()
      .burnSessions.deletionImpact(sessionId)
      .then((counts) => {
        if (live) setImpact({ state: "ready", photos: counts.photos, experiments: counts.experiments });
      })
      .catch(() => {
        if (live) setImpact({ state: "failed" });
      });
    return () => {
      live = false;
    };
  }, [sessionId]);

  async function confirm() {
    if (submitting.current || impact.state === "loading") return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await getDataLayer().burnSessions.delete(sessionId);
      onDeleted();
    } catch (error) {
      if (error instanceof DataError && error.code === "not-found") {
        // Deleted elsewhere in the meantime: the goal is met.
        onDeleted();
        return;
      }
      if (error instanceof DataError && error.code === "in-use") {
        setRefused(true);
        try {
          const counts = await getDataLayer().burnSessions.deletionImpact(sessionId);
          setImpact({ state: "ready", photos: counts.photos, experiments: counts.experiments });
        } catch {
          // The general refusal below stands.
        }
      } else setFailed(true);
      submitting.current = false;
      setBusy(false);
    }
  }

  // A corrective experiment that lists this burn test keeps it: no delete is offered.
  const experiments = impact.state === "ready" ? impact.experiments : 0;
  const blocked = experiments > 0 || refused;

  return (
    <div className="grid gap-4">
      {failed ? <Notice variant="error">{M.deleteFailed}</Notice> : null}
      {refused && experiments === 0 ? <Notice variant="error">{M.deleteInUseExperiment}</Notice> : null}
      {blocked ? null : <p className="text-sm text-foreground">{M.deleteBody(title)}</p>}
      {impact.state === "loading" ? (
        <p role="status" className="text-sm text-text-secondary">
          {M.deleteChecking}
        </p>
      ) : null}
      {experiments > 0 ? (
        <p data-testid="delete-blocked-experiments" className="text-sm text-foreground">
          {M.deleteBlockedByExperiments(experiments)}
        </p>
      ) : null}
      {!blocked && impact.state === "ready" && impact.photos > 0 ? (
        <p className="text-sm text-foreground">{M.deletePhotos(impact.photos)}</p>
      ) : null}
      {blocked ? null : <p className="text-sm text-text-secondary">{M.deletePlannedNote}</p>}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {M.deleteKeep}
        </Button>
        {blocked ? null : (
          <Button
            type="button"
            variant="destructive"
            busy={busy}
            disabled={impact.state === "loading"}
            onClick={confirm}
          >
            {M.deleteConfirm}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
