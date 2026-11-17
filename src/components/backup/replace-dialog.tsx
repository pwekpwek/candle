"use client";

import { useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MESSAGES } from "@/lib/messages";
import type { BackupCounts } from "@/lib/types";

const B = MESSAGES.backup;
const WORD = "REPLACE";

/** DATA-23, FLOW-09: names what is affected and asks for the word REPLACE. */
export function ReplaceDialog({
  open,
  onOpenChange,
  deviceCounts,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceCounts: BackupCounts;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{B.replaceTitle}</DialogTitle>
          <DialogDescription>{B.replaceWarning}</DialogDescription>
        </DialogHeader>
        {open ? (
          <ConfirmForm
            deviceCounts={deviceCounts}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmForm({
  deviceCounts,
  onCancel,
  onConfirm,
}: {
  deviceCounts: BackupCounts;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    // Exact comparison after trimming (FLOW-08: the button explains, it is not disabled).
    if (typed.trim() !== WORD) {
      setError(B.replaceNeedsWord);
      inputRef.current?.focus();
      return;
    }
    onConfirm();
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <p className="text-sm text-foreground">{B.replaceAffects(deviceCounts)}</p>
      <p className="text-sm text-text-secondary">{B.replaceBeforeNote}</p>
      <Field label={B.typeReplace} error={error}>
        {(c) => (
          <Input
            {...c}
            ref={inputRef}
            value={typed}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => {
              setTyped(e.target.value);
              if (error) setError(null);
            }}
          />
        )}
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {B.cancel}
        </Button>
        <Button type="submit" variant="destructive">
          {B.replaceConfirm}
        </Button>
      </DialogFooter>
    </form>
  );
}
