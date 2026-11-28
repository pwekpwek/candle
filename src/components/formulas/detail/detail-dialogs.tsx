"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/common/field";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataError, getDataLayer } from "@/lib/db";
import { LIMITS } from "@/lib/gramguard";
import { MESSAGES, messageForIssue } from "@/lib/messages";
import type { Formula } from "@/lib/types";

const F = MESSAGES.formula;
const B = MESSAGES.batches;
type DialogProps = {
  formula: Formula;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Edit name and notes (PRD-17). Creates no version. */
export function EditDetailsDialog({
  formula,
  open,
  onOpenChange,
  onSaved,
}: DialogProps & { onSaved: (updated: Formula) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{F.editTitle}</DialogTitle>
          <DialogDescription>{F.editDescription}</DialogDescription>
        </DialogHeader>
        {open ? (
          <EditForm
            formula={formula}
            onCancel={() => onOpenChange(false)}
            onSaved={(updated) => {
              onOpenChange(false);
              onSaved(updated);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  formula,
  onCancel,
  onSaved,
}: {
  formula: Formula;
  onCancel: () => void;
  onSaved: (updated: Formula) => void;
}) {
  const [name, setName] = useState(formula.name);
  const [notes, setNotes] = useState(formula.notes ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  /** V-02: 1 to 80 characters after trimming. */
  function check(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed === "") return messageForIssue({ rule: "V-02", field: "name", severity: "error" });
    if ([...trimmed].length > LIMITS.maxNameLength) return F.nameTooLong;
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return; // guard double submit (FLOW-07)
    const problem = check(name);
    setNameError(problem);
    if (problem) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const updated = await getDataLayer().formulas.updateDetails(formula.id, {
        name: name.trim(),
        notes,
      });
      onSaved(updated);
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {failed ? (
        <Notice variant="error">{F.detailsSaveFailed}</Notice>
      ) : null}
      <Field label={F.nameLabel} error={nameError}>
        {(c) => (
          <Input
            {...c}
            value={name}
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              if (nameError && check(e.target.value) === null) setNameError(null);
            }}
            onBlur={() => setNameError(check(name))}
          />
        )}
      </Field>
      <Field label={F.notesLabel}>
        {(c) => (
          <Textarea
            {...c}
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {F.cancel}
        </Button>
        <Button
          type="submit"
          busy={busy}
          // Keep the name field focused so its blur message cannot move this button before the click lands.
          onMouseDown={(e) => e.preventDefault()}
        >
          {busy ? F.savingDetails : F.saveDetails}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Permanent delete (PRD-18, D-8, FLOW-09): names the formula and counts what goes. */
export function DeleteFormulaDialog({
  formula,
  open,
  onOpenChange,
  onDeleted,
}: DialogProps & { onDeleted: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{F.deleteTitle}</DialogTitle>
          <DialogDescription className="sr-only">{F.deleteTitle}</DialogDescription>
        </DialogHeader>
        {open ? (
          <DeleteBody
            formula={formula}
            onCancel={() => onOpenChange(false)}
            onDeleted={onDeleted}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type Impact =
  | { state: "loading" }
  | { state: "failed" }
  | {
      state: "ready";
      versions: number;
      measurements: number;
      batches: number;
      productionPlans: number;
      /** TrueCandle Cost: sheets based on its versions also keep the formula. */
      costSheets: number;
    };

function DeleteBody({
  formula,
  onCancel,
  onDeleted,
}: {
  formula: Formula;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = useState<Impact>({ state: "loading" });
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    let live = true;
    getDataLayer()
      .formulas.deletionImpact(formula.id)
      .then((counts) => {
        if (live) setImpact({ state: "ready", ...counts });
      })
      .catch(() => {
        if (live) setImpact({ state: "failed" });
      });
    return () => {
      live = false;
    };
  }, [formula.id]);

  async function confirm() {
    if (submitting.current || impact.state !== "ready") return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await getDataLayer().formulas.deletePermanently(formula.id);
      onDeleted();
    } catch (error) {
      submitting.current = false;
      setBusy(false);
      if (error instanceof DataError && error.code === "in-use") {
        // Batches or cost sheets exist (made after this dialog opened, or another tab): show the refusal.
        // When the counts cannot say which, the batch wording stands as before.
        const atLeastOne = <T extends { batches: number; costSheets: number }>(c: T): T =>
          c.batches > 0 || c.costSheets > 0 ? c : { ...c, batches: 1 };
        getDataLayer()
          .formulas.deletionImpact(formula.id)
          .then((counts) => setImpact({ state: "ready", ...atLeastOne(counts) }))
          .catch(() => setImpact((prev) => (prev.state === "ready" ? atLeastOne(prev) : prev)));
        return;
      }
      setFailed(true);
    }
  }

  const refused = impact.state === "ready" && (impact.batches > 0 || impact.costSheets > 0);

  return (
    <div className="grid gap-4">
      {failed ? <Notice variant="error">{F.deleteFailed}</Notice> : null}
      {impact.state === "loading" ? (
        <p role="status" className="text-sm text-text-secondary">
          {F.deleteChecking}
        </p>
      ) : impact.state === "failed" ? (
        <Notice variant="error">{F.deleteImpactFailed}</Notice>
      ) : refused ? (
        <Notice variant="info" title={B.formulaDeleteRefusedTitle}>
          {impact.batches > 0 ? <span className="block">{B.formulaDeleteRefused(impact.batches)}</span> : null}
          {impact.costSheets > 0 ? (
            <span className="block" data-testid="formula-delete-blocked-cost-sheets">
              {B.formulaDeleteRefusedCostSheets(impact.costSheets)}
            </span>
          ) : null}
        </Notice>
      ) : (
        <>
          <p className="text-sm text-foreground">
            {F.deleteBody(formula.name, impact.versions, impact.measurements)}
          </p>
          {impact.productionPlans > 0 ? (
            <p className="text-sm text-foreground">{B.formulaDeletePlans(impact.productionPlans)}</p>
          ) : null}
        </>
      )}
      <DialogFooter>
        {/* First in the tab order, so the keep button takes the opening focus. */}
        <Button type="button" variant="secondary" onClick={onCancel}>
          {refused ? B.formulaDeleteClose : F.deleteKeep}
        </Button>
        {refused ? null : (
          <Button
            type="button"
            variant="destructive"
            busy={busy}
            disabled={impact.state !== "ready"}
            onClick={confirm}
          >
            {F.deleteConfirm}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
