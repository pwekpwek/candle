"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CircleAlertIcon } from "lucide-react";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { BlendCards } from "@/components/formulas/detail/blend-cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BatchInput } from "@/lib/db";
import {
  compareInputFromVersion,
  compareMeasured,
  formatGrams,
  formatMeasured,
  formatSignedGrams,
  formatSignedPercent2,
} from "@/lib/gramguard";
import type { ComparisonRow, ComponentComparison } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import type { FormulaVersion, MeasurementEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  checkDate,
  checkLabel,
  checkMeasured,
  collectEntries,
  validateForm,
  type FormErrors,
} from "./form-model";
import { localToday } from "./text";

const B = MESSAGES.batches;
const F = MESSAGES.formula;
const R = MESSAGES.results;

type Precision = FormulaVersion["inputs"]["precisionMg"];

export type BatchFormInitial = {
  producedOn?: string;
  label?: string;
  notes?: string;
  entries?: readonly MeasurementEntry[];
};

export type BatchFormProps = {
  version: FormulaVersion;
  initial?: BatchFormInitial;
  submitLabel: string;
  busyLabel: string;
  /** Shown as an error notice when `onSubmit` rejects. */
  failureText: string;
  /** Shown as a success notice after `onSubmit` resolves. Leave out when the page navigates away. */
  successText?: string;
  /** The batch's earliest burn test date. The production date cannot be later. */
  latestProducedOn?: string | null;
  /** Show the actual-blend card above the table. */
  showBlend?: boolean;
  /** Saves the validated input. Reject to show `failureText`. */
  onSubmit: (input: BatchInput) => Promise<void>;
};

const TH = "px-3 py-2 text-xs font-medium uppercase text-muted-foreground";
const ROW =
  "border-t border-border max-sm:mb-3 max-sm:block max-sm:rounded-lg max-sm:border max-sm:bg-card max-sm:p-3";
const NAME_CELL =
  "px-3 py-2 text-left align-top font-normal wrap-anywhere max-sm:block max-sm:px-0 max-sm:pt-0 max-sm:pb-2 max-sm:font-semibold";
const VALUE_CELL =
  "tabular px-3 py-2 text-right align-top max-sm:flex max-sm:items-start max-sm:justify-between max-sm:gap-3 max-sm:px-0 max-sm:py-1 before:text-left before:font-normal before:text-text-secondary before:content-[attr(data-label)] sm:before:hidden";

/** The difference column text (CALC-19, CALC-21). Informational, never pass or fail. */
function differenceText(
  row: ComparisonRow & Partial<Pick<ComponentComparison, "flagged" | "direction">>,
  precisionMg: Precision,
): string | null {
  if (row.diffMg === null) return null;
  const percent = row.diffX100 === null ? null : `${formatSignedPercent2(row.diffX100)}%`;
  if (row.flagged && row.direction && percent !== null) {
    const amount = formatSignedGrams(row.diffMg, precisionMg).replace(/^[-+]/, "");
    return F.offTarget(row.direction, amount, percent);
  }
  const grams = formatSignedGrams(row.diffMg, precisionMg);
  return percent === null ? grams : `${grams} ${percent}`;
}

/**
 * The batch form, shared by Create batch and the batch page: production date,
 * label, measured weights, notes. Planned weights come from the source
 * version's stored targets and are never recalculated. Nothing is saved until
 * the maker presses the submit button.
 */
export function BatchForm({
  version,
  initial,
  submitLabel,
  busyLabel,
  failureText,
  successText,
  showBlend = false,
  latestProducedOn = null,
  onSubmit,
}: BatchFormProps) {
  const { precisionMg } = version.inputs;
  const tableId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const components = useMemo(
    () => [...version.inputs.waxes, ...version.inputs.oils],
    [version],
  );
  const componentIds = useMemo(() => components.map((c) => c.componentId), [components]);
  const names = useMemo(
    () => Object.fromEntries(components.map((c) => [c.componentId, c.snapshot.name])),
    [components],
  );

  // The device's local today, read once when the form mounts (after the data
  // has loaded, so never during the prerender).
  const [today] = useState(() => localToday());
  const [producedOn, setProducedOn] = useState(initial?.producedOn ?? today);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initial?.entries ?? []).map((e) => [e.componentId, formatMeasured(e.actualMg, precisionMg)]),
    ),
  );
  const [errors, setErrors] = useState<FormErrors>({ measured: {} });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"success" | "failed" | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const submitting = useRef(false);

  // Submit found problems: move focus to the first invalid field once it is marked.
  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  const entries = useMemo(() => collectEntries(componentIds, texts), [componentIds, texts]);
  const comparison = useMemo(
    () => compareMeasured(compareInputFromVersion(version), entries),
    [version, entries],
  );
  const byId = new Map(comparison.components.map((c) => [c.componentId, c]));

  function touched() {
    setOutcome(null);
  }

  function setDateError(message: string | null) {
    setErrors((prev) => ({ ...prev, producedOn: message ?? undefined }));
  }
  function setLabelError(message: string | null) {
    setErrors((prev) => ({ ...prev, label: message ?? undefined }));
  }
  function setMeasuredError(id: string, message: string | null) {
    setErrors((prev) => {
      const measured = { ...prev.measured };
      if (message) measured[id] = message;
      else delete measured[id];
      return { ...prev, measured };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return; // guard double submit (FLOW-07)
    const { errors: found, input } = validateForm(
      { producedOn, label, notes, texts },
      componentIds,
      today,
      latestProducedOn,
    );
    setErrors(found);
    if (input === null) {
      setOutcome(null);
      setFocusTick((n) => n + 1);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setOutcome(null);
    try {
      await onSubmit(input);
      setOutcome("success");
    } catch {
      setOutcome("failed");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const unit = F.gramUnit;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={B.producedOnFieldLabel} error={errors.producedOn}>
          {(c) => (
            <Input
              {...c}
              type="date"
              value={producedOn}
              onChange={(e) => {
                touched();
                setProducedOn(e.target.value);
                if (errors.producedOn && checkDate(e.target.value, today, latestProducedOn) === null) {
                  setDateError(null);
                }
              }}
              onBlur={() => setDateError(checkDate(producedOn, today, latestProducedOn))}
            />
          )}
        </Field>
        <Field label={B.labelFieldLabel} hint={B.labelHint} error={errors.label}>
          {(c) => (
            <Input
              {...c}
              value={label}
              autoComplete="off"
              onChange={(e) => {
                touched();
                setLabel(e.target.value);
                if (errors.label && checkLabel(e.target.value) === null) setLabelError(null);
              }}
              onBlur={() => setLabelError(checkLabel(label))}
            />
          )}
        </Field>
      </div>

      {showBlend ? (
        <BlendCards version={version} comparison={comparison} names={names} />
      ) : null}

      <section aria-labelledby={`${tableId}-heading`}>
        <h2 id={`${tableId}-heading`} className="mb-1 text-lg font-semibold">
          {B.measuredHeading}
        </h2>
        <p className="mb-3 text-sm text-text-secondary">{B.measuredHint}</p>
        <table className="w-full border-collapse text-sm max-sm:block">
          <caption className="sr-only">{B.measuredHeading}</caption>
          <thead className="bg-muted max-sm:sr-only">
            <tr>
              <th scope="col" className={cn(TH, "text-left")}>
                {F.componentColumn}
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                {F.plannedLabel}
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                {F.measuredLabel}
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                {F.differenceLabel}
              </th>
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {components.map((component) => {
              const id = component.componentId;
              const row = byId.get(id);
              const error = errors.measured[id];
              const inputId = `${tableId}-${id}`;
              const errorId = `${inputId}-error`;
              const diff = row ? differenceText(row, precisionMg) : null;
              return (
                <tr key={id} className={ROW}>
                  <th scope="row" className={NAME_CELL}>
                    {component.snapshot.name}
                  </th>
                  <td data-label={F.plannedLabel} className={VALUE_CELL}>
                    <span>{formatGrams(row?.targetMg ?? 0, precisionMg)}</span>
                  </td>
                  <td data-label={F.measuredLabel} className={VALUE_CELL}>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center justify-end gap-2">
                        <Label htmlFor={inputId} className="sr-only">
                          {F.measuredFieldLabel(component.snapshot.name)}
                        </Label>
                        <Input
                          id={inputId}
                          inputMode="decimal"
                          autoComplete="off"
                          value={texts[id] ?? ""}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(e) => {
                            touched();
                            setTexts((prev) => ({ ...prev, [id]: e.target.value }));
                            if (error && checkMeasured(id, e.target.value) === null) {
                              setMeasuredError(id, null);
                            }
                          }}
                          onBlur={() => setMeasuredError(id, checkMeasured(id, texts[id] ?? ""))}
                          className="w-28 text-right tabular"
                        />
                        <span aria-hidden="true" className="text-text-secondary">
                          {unit}
                        </span>
                      </div>
                      {error ? (
                        <p
                          id={errorId}
                          className="flex max-w-56 items-start gap-1.5 text-left text-sm font-normal text-destructive"
                        >
                          <CircleAlertIcon
                            aria-hidden="true"
                            strokeWidth={1.75}
                            className="mt-0.5 size-4 shrink-0"
                          />
                          <span>{error}</span>
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td data-label={F.differenceLabel} className={VALUE_CELL}>
                    <Figure text={diff} />
                  </td>
                </tr>
              );
            })}
            {version.inputs.oils.length > 0 ? (
              <SummaryRow
                label={R.fragranceRow}
                planned={formatGrams(version.targets.fragranceTotalMg, precisionMg)}
                row={comparison.fragrance}
                precisionMg={precisionMg}
              />
            ) : null}
            <SummaryRow
              label={R.totalRow}
              planned={formatGrams(version.targets.totalMg, precisionMg)}
              row={comparison.total}
              precisionMg={precisionMg}
            />
          </tbody>
        </table>
      </section>

      <Field label={B.notesFieldLabel}>
        {(c) => (
          <Textarea
            {...c}
            rows={4}
            value={notes}
            onChange={(e) => {
              touched();
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
          // above would move the button and swallow the click (as in the editor).
          onMouseDown={(event) => event.preventDefault()}
        >
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Figure({ text }: { text: string | null }) {
  if (text === null) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">{"—"}</span>
        <span className="sr-only">{F.notMeasured}</span>
      </span>
    );
  }
  return <span>{text}</span>;
}

function SummaryRow({
  label,
  planned,
  row,
  precisionMg,
}: {
  label: string;
  planned: string;
  row: ComparisonRow | null;
  precisionMg: Precision;
}) {
  const measured =
    row && row.actualMg !== null
      ? `${formatMeasured(row.actualMg, precisionMg)} ${F.gramUnit}`
      : null;
  return (
    <tr className={cn(ROW, "font-medium")}>
      <th scope="row" className={NAME_CELL}>
        {label}
      </th>
      <td data-label={F.plannedLabel} className={VALUE_CELL}>
        <span>{planned}</span>
      </td>
      <td data-label={F.measuredLabel} className={VALUE_CELL}>
        <Figure text={measured} />
      </td>
      <td data-label={F.differenceLabel} className={VALUE_CELL}>
        <Figure text={row ? differenceText(row, precisionMg) : null} />
      </td>
    </tr>
  );
}
