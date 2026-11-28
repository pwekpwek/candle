"use client";

import { useRef, useState } from "react";
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

const M = MESSAGES.cost;

/** Confirmation for deleting one cost sheet. Nothing else changes. */
export function DeleteSheetDialog({
  sheetId,
  title,
  open,
  onOpenChange,
  onDeleted,
}: {
  sheetId: string;
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
        <DeleteBody sheetId={sheetId} title={title} onCancel={() => onOpenChange(false)} onDeleted={onDeleted} />
      </DialogContent>
    </Dialog>
  );
}

function DeleteBody({
  sheetId,
  title,
  onCancel,
  onDeleted,
}: {
  sheetId: string;
  title: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);

  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await getDataLayer().costSheets.delete(sheetId);
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
      <p className="text-sm text-foreground">{M.deleteBody(title)}</p>
      <DialogFooter>
        {/* First in the tab order, so the keep button takes the opening focus. */}
        <Button type="button" variant="secondary" onClick={onCancel}>
          {M.deleteKeep}
        </Button>
        <Button type="button" variant="destructive" busy={busy} onClick={confirm}>
          {M.deleteConfirm}
        </Button>
      </DialogFooter>
    </div>
  );
}
