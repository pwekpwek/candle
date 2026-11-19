"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionPlanInput } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { isLocalDate } from "@/lib/schedule";
import { MAX_PRODUCTION_LABEL_LENGTH } from "@/lib/types";

const S = MESSAGES.schedule;

export type PlanFormInitial = { plannedOn?: string; label?: string; notes?: string };

type Errors = { plannedOn?: string; label?: string };

/** Required and a real date. Any date is allowed, past or future. */
export function checkPlannedOn(value: string): string | null {
  if (value.trim() === "") return S.plannedOnRequired;
  if (!isLocalDate(value)) return S.plannedOnInvalid;
  return null;
}

export function checkPlanLabel(value: string): string | null {
  return value.trim().length > MAX_PRODUCTION_LABEL_LENGTH ? S.planLabelTooLong : null;
}

/**
 * The planned production form, shared by create and the entry page: planned
 * date, label, notes. Nothing is saved until the maker presses the button.
 */
export function ProductionPlanForm({
  initial,
  submitLabel,
  busyLabel,
  failureText,
  successText,
  onSubmit,
}: {
  initial?: PlanFormInitial;
  submitLabel: string;
  busyLabel: string;
  failureText: string;
  /** Shown after `onSubmit` resolves. Leave out when the page navigates away. */
  successText?: string;
  onSubmit: (input: ProductionPlanInput) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [plannedOn, setPlannedOn] = useState(initial?.plannedOn ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"success" | "failed" | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    if (focusTick === 0) return;
    const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    target?.focus();
    target?.scrollIntoView?.({ block: "center" });
  }, [focusTick]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const found: Errors = {};
    const dateError = checkPlannedOn(plannedOn);
    if (dateError) found.plannedOn = dateError;
    const labelError = checkPlanLabel(label);
    if (labelError) found.label = labelError;
    setErrors(found);
    if (found.plannedOn || found.label) {
      setOutcome(null);
      setFocusTick((n) => n + 1);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setOutcome(null);
    const trimmedLabel = label.trim();
    const trimmedNotes = notes.trim();
    try {
      await onSubmit({
        plannedOn,
        ...(trimmedLabel !== "" ? { label: trimmedLabel } : {}),
        ...(trimmedNotes !== "" ? { notes: trimmedNotes } : {}),
      });
      setOutcome("success");
    } catch {
      setOutcome("failed");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={S.plannedOnLabel} error={errors.plannedOn}>
          {(c) => (
            <Input
              {...c}
              type="date"
              value={plannedOn}
              onChange={(e) => {
                setOutcome(null);
                setPlannedOn(e.target.value);
                if (errors.plannedOn && checkPlannedOn(e.target.value) === null) {
                  setErrors((prev) => ({ ...prev, plannedOn: undefined }));
                }
              }}
              onBlur={() =>
                setErrors((prev) => ({ ...prev, plannedOn: checkPlannedOn(plannedOn) ?? undefined }))
              }
            />
          )}
        </Field>
        <Field label={S.planLabelLabel} hint={S.planLabelHint} error={errors.label}>
          {(c) => (
            <Input
              {...c}
              value={label}
              autoComplete="off"
              onChange={(e) => {
                setOutcome(null);
                setLabel(e.target.value);
                if (errors.label && checkPlanLabel(e.target.value) === null) {
                  setErrors((prev) => ({ ...prev, label: undefined }));
                }
              }}
              onBlur={() =>
                setErrors((prev) => ({ ...prev, label: checkPlanLabel(label) ?? undefined }))
              }
            />
          )}
        </Field>
      </div>

      <Field label={S.planNotesLabel}>
        {(c) => (
          <Textarea
            {...c}
            rows={4}
            value={notes}
            onChange={(e) => {
              setOutcome(null);
              setNotes(e.target.value);
            }}
          />
        )}
      </Field>

      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {outcome === "failed" ? <Notice variant="error">{failureText}</Notice> : null}
        {outcome === "success" && successText ? (
          <Notice variant="success">{successText}</Notice>
        ) : null}
      </div>

      <div>
        <Button
          type="submit"
          busy={busy}
          className="pointer-coarse:min-h-11"
          // Keep focus in the field while pressing: a blur error appearing
          // above would move the button and swallow the click.
          onMouseDown={(event) => event.preventDefault()}
        >
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
