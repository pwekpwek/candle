"use client";

import { useRef, useState, type ReactNode } from "react";
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
import { DataError } from "@/lib/db";
import type { DataErrorCode } from "@/lib/db";

/** Same look as Input, for native selects. */
export const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground aria-invalid:border-destructive";

/** What the maker is told after a change: a success line, or an error. */
export type Status = { variant: "success" | "error"; name: string; text: string } | null;

export function codeOf(error: unknown): DataErrorCode | null {
  return error instanceof DataError ? error.code : null;
}

export function StatusLine({ status }: { status: Status }) {
  return (
    <div aria-live="polite">
      {status ? (
        <Notice variant={status.variant} className="mb-4">
          <span className="font-semibold">{status.name}</span> {status.text}
        </Notice>
      ) : null}
    </div>
  );
}

export function ShowArchivedToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground pointer-coarse:min-h-11">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}

export function ArchivedTag({ children }: { children: ReactNode }) {
  return (
    <span className="ml-2 inline-block rounded-sm border border-border px-1.5 text-xs font-semibold text-text-secondary">
      {children}
    </span>
  );
}

type RowActionsProps = {
  labels: {
    edit: string;
    archive: string;
    unarchive: string;
    delete: string;
    editLabel: string;
    archiveLabel: string;
    unarchiveLabel: string;
    deleteLabel: string;
    usedHint: string;
  };
  archived: boolean;
  /** Delete is offered only for an unused record. */
  canDelete: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: (opener: HTMLElement) => void;
};

/** Edit, Archive or Unarchive, and Delete (unused records only). 44px targets on touch via the Button. */
export function RowActions({
  labels,
  archived,
  canDelete,
  busy,
  onEdit,
  onToggleArchive,
  onDelete,
}: RowActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" aria-label={labels.editLabel} onClick={onEdit}>
        {labels.edit}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        aria-label={archived ? labels.unarchiveLabel : labels.archiveLabel}
        onClick={onToggleArchive}
      >
        {archived ? labels.unarchive : labels.archive}
      </Button>
      {canDelete ? (
        <Button
          type="button"
          variant="ghost"
          aria-label={labels.deleteLabel}
          onClick={(e) => onDelete(e.currentTarget)}
        >
          {labels.delete}
        </Button>
      ) : (
        <span className="text-sm text-text-secondary">{labels.usedHint}</span>
      )}
    </div>
  );
}

type ConfirmDeleteProps = {
  open: boolean;
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  onCancel: () => void;
  /** Resolves when the delete is done; throws to show `failure`. */
  onConfirm: () => Promise<void>;
  /** The message for a thrown error. */
  failureFor: (error: unknown) => string;
};

/** The confirmation before a permanent delete. Focus returns to the opener on close. */
export function ConfirmDelete({
  open,
  title,
  body,
  confirm,
  cancel,
  onCancel,
  onConfirm,
  failureFor,
}: ConfirmDeleteProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await onConfirm();
    } catch (error) {
      setFailure(failureFor(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setFailure(null);
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {failure ? <Notice variant="error">{failure}</Notice> : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancel}
          </Button>
          <Button type="button" variant="destructive" busy={busy} onClick={() => void run()}>
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
