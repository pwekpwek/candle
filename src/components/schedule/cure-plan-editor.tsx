"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { batchTitle, formatProducedOn } from "@/components/batches/text";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataError, getDataLayer } from "@/lib/db";
import type { BatchListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { milestoneDueOn } from "@/lib/schedule";
import { MAX_MILESTONES } from "@/lib/types";
import type { CurePlan } from "@/lib/types";
import {
  EMPTY_ERRORS,
  checkDays,
  checkRowLabel,
  milestoneCount,
  validateForm,
  valuesFromPlan,
  type FormErrors,
  type FormValues,
  type Row,
  type RowErrors,
  type RowKind,
} from "./cure-form-model";

const S = MESSAGES.schedule;
const B = MESSAGES.batches;

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground aria-invalid:border-destructive";

type Loaded =
  | { status: "ok"; item: BatchListItem; plan: CurePlan | undefined }
  | { status: "missing" }
  | { status: "error" };

/** The cure-plan editor page (`/batches/[batchId]/cure-plan`): create and edit. */
export function CurePlanEditor({ batchId }: { batchId: string }) {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const item = await layer.batches.get(batchId);
      if (!item) return { status: "missing" };
      return { status: "ok", item, plan: await layer.curePlans.get(batchId) };
    } catch {
      return { status: "error" };
    }
  }, [batchId, reload]);

  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={S.editorAddTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {S.editorLoading}
        </p>
      </>
    );
  }
  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={S.editorAddTitle} />
        <Notice
          variant="error"
          title={B.loadFailedTitle}
          action={
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              {B.tryAgain}
            </Button>
          }
        >
          {B.loadFailed}
        </Notice>
      </>
    );
  }
  if (loaded.status === "missing") {
    return (
      <>
        <PageHeader title={B.notFoundTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{B.notFoundBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/batches">{B.backToBatches}</Link>
          </Button>
        </div>
      </>
    );
  }
  return <CureForm key={batchId} item={loaded.item} initialPlan={loaded.plan} />;
}

/** A React key for a new row. Not an id: milestone ids are made by the data layer. */
const newKey = () => crypto.randomUUID();

function CureForm({ item, initialPlan }: { item: BatchListItem; initialPlan: CurePlan | undefined }) {
  const { batch } = item;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<FormValues>(() =>
    initialPlan ? valuesFromPlan(initialPlan, newKey) : { cureTime: "", rows: [] },
  );
  const [errors, setErrors] = useState<FormErrors>(EMPTY_ERRORS);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const submitting = useRef(false);

  // Submit found problems: focus and scroll to the first invalid field once it is marked.
  useEffect(() => {
    if (focusTick === 0) return;
    const form = formRef.current;
    if (!form) return;
    const target =
      form.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      form.querySelector<HTMLElement>("[data-first-field]");
    target?.focus();
    target?.scrollIntoView?.({ block: "center" });
  }, [focusTick]);

  const count = milestoneCount(values);
  const atLimit = count >= MAX_MILESTONES;

  function change(next: FormValues) {
    setValues(next);
    setFailure(null);
    setErrors((prev) => (prev.form ? { ...prev, form: undefined } : prev));
  }

  function setRowError(key: string, patch: Partial<RowErrors>) {
    setErrors((prev) => {
      const merged = { ...prev.rows[key], ...patch };
      const rows = { ...prev.rows };
      if (merged.label || merged.offset) rows[key] = merged;
      else delete rows[key];
      return { ...prev, rows };
    });
  }

  function updateRow(key: string, patch: Partial<Row>) {
    change({
      ...values,
      rows: values.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    });
  }

  function addRow(kind: RowKind) {
    if (atLimit) return;
    change({ ...values, rows: [...values.rows, { key: newKey(), kind, label: "", offset: "" }] });
  }

  function removeRow(key: string) {
    change({ ...values, rows: values.rows.filter((r) => r.key !== key) });
    setErrors((prev) => {
      const rows = { ...prev.rows };
      delete rows[key];
      return { ...prev, rows };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const { errors: found, milestones } = validateForm(values);
    setErrors(found);
    if (milestones === null) {
      setFailure(null);
      setFocusTick((n) => n + 1);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await getDataLayer().curePlans.save(batch.id, milestones);
      router.replace(`/batches/${batch.id}?cureSaved=1`);
      // Stay busy while the page changes: nothing more to press.
    } catch (error) {
      submitting.current = false;
      setBusy(false);
      if (error instanceof DataError && error.code === "not-found") {
        setGone(true);
        setFailure(S.cureBatchGone);
      } else if (error instanceof DataError && error.code === "invalid") {
        setFailure(S.cureSaveInvalid);
      } else {
        setFailure(S.cureSaveFailed);
      }
    }
  }

  const cureTimeDate =
    values.cureTime.trim() !== "" && checkDays(values.cureTime, false) === null
      ? S.plannedCureEnd(formatProducedOn(milestoneDueOn(batch.producedOn, Number(values.cureTime.trim()))))
      : null;

  return (
    <>
      <PageHeader
        title={initialPlan ? S.editorEditTitle : S.editorAddTitle}
        description={S.editorDescription(batchTitle(batch), formatProducedOn(batch.producedOn))}
      />
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
        <div className="max-w-xs">
          <Field label={S.cureTimeLabel} hint={S.cureTimeHint} error={errors.cureTime}>
            {(c) => (
              <Input
                {...c}
                data-first-field=""
                inputMode="numeric"
                autoComplete="off"
                value={values.cureTime}
                onChange={(e) => {
                  change({ ...values, cureTime: e.target.value });
                  if (errors.cureTime && checkDays(e.target.value, false) === null) {
                    setErrors((prev) => ({ ...prev, cureTime: undefined }));
                  }
                }}
                onBlur={() =>
                  setErrors((prev) => ({
                    ...prev,
                    cureTime: checkDays(values.cureTime, false) ?? undefined,
                  }))
                }
              />
            )}
          </Field>
          {cureTimeDate ? <p className="mt-1 text-sm text-text-secondary">{cureTimeDate}</p> : null}
        </div>

        <section aria-labelledby="cure-rows-heading">
          <h2 id="cure-rows-heading" className="mb-3 text-lg font-semibold">
            {S.milestonesHeading}
          </h2>
          {values.rows.length > 0 ? (
            <ul className="mb-4 flex flex-col gap-3">
              {values.rows.map((row, index) => (
                <RowEditor
                  key={row.key}
                  row={row}
                  index={index + 1}
                  producedOn={batch.producedOn}
                  errors={errors.rows[row.key]}
                  onChange={(patch) => updateRow(row.key, patch)}
                  onRemove={() => removeRow(row.key)}
                  onError={(patch) => setRowError(row.key, patch)}
                />
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={atLimit}
              className="pointer-coarse:min-h-11"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addRow("burnTest")}
            >
              {S.addBurnTest}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={atLimit}
              className="pointer-coarse:min-h-11"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addRow("check")}
            >
              {S.addOther}
            </Button>
          </div>
          {atLimit ? (
            <p className="mt-2 text-sm text-text-secondary">{S.limitReached(MAX_MILESTONES)}</p>
          ) : null}
        </section>

        <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
          {errors.form ? <Notice variant="error">{errors.form}</Notice> : null}
          {failure ? (
            <Notice
              variant="error"
              action={
                gone ? (
                  <Button asChild variant="link" size="sm">
                    <Link href="/batches">{B.backToBatches}</Link>
                  </Button>
                ) : undefined
              }
            >
              {failure}
            </Notice>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            busy={busy}
            className="pointer-coarse:min-h-11"
            // Keep focus in the field while pressing: a blur error appearing
            // above would move the button and swallow the click.
            onMouseDown={(event) => event.preventDefault()}
          >
            {busy ? S.cureSaving : S.cureSave}
          </Button>
          <Button asChild variant="ghost" className="pointer-coarse:min-h-11">
            <Link href={`/batches/${batch.id}`}>{S.cancel}</Link>
          </Button>
        </div>
      </form>
    </>
  );
}

function RowEditor({
  row,
  index,
  producedOn,
  errors,
  onChange,
  onRemove,
  onError,
}: {
  row: Row;
  index: number;
  producedOn: string;
  errors: RowErrors | undefined;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
  onError: (patch: Partial<RowErrors>) => void;
}) {
  const dueText =
    row.offset.trim() !== "" && checkDays(row.offset, true) === null
      ? S.dueOn(formatProducedOn(milestoneDueOn(producedOn, Number(row.offset.trim()))))
      : null;
  return (
    <li>
      <fieldset
        data-testid="cure-row"
        className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[9rem_minmax(0,1fr)_10rem] sm:p-4"
      >
        <legend className="sr-only">{S.rowGroup(index)}</legend>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${row.key}-kind`}>{S.kindLabel}</Label>
          <select
            id={`${row.key}-kind`}
            value={row.kind}
            className={SELECT_CLASS}
            onChange={(e) => {
              const kind = e.target.value === "burnTest" ? "burnTest" : "check";
              onChange({ kind });
              onError({ label: checkRowLabel(kind, row.label) ?? undefined });
            }}
          >
            <option value="burnTest">{S.kindOptionBurnTest}</option>
            <option value="check">{S.kindOptionCheck}</option>
          </select>
        </div>
        <Field
          label={row.kind === "check" ? S.labelRequired : S.labelOptional}
          error={errors?.label}
        >
          {(c) => (
            <Input
              {...c}
              autoComplete="off"
              value={row.label}
              onChange={(e) => {
                onChange({ label: e.target.value });
                if (errors?.label && checkRowLabel(row.kind, e.target.value) === null) {
                  onError({ label: undefined });
                }
              }}
              onBlur={() => onError({ label: checkRowLabel(row.kind, row.label) ?? undefined })}
            />
          )}
        </Field>
        <Field label={S.offsetLabel} error={errors?.offset}>
          {(c) => (
            <Input
              {...c}
              inputMode="numeric"
              autoComplete="off"
              value={row.offset}
              onChange={(e) => {
                onChange({ offset: e.target.value });
                if (errors?.offset && checkDays(e.target.value, true) === null) {
                  onError({ offset: undefined });
                }
              }}
              onBlur={() => onError({ offset: checkDays(row.offset, true) ?? undefined })}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:col-span-3">
          <p className="text-sm text-text-secondary">{dueText}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:min-h-11"
            aria-label={S.removeRowFor(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onRemove}
          >
            {S.removeRow}
          </Button>
        </div>
      </fieldset>
    </li>
  );
}
