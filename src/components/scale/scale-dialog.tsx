"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { SegmentedControl } from "@/components/common/segmented-control";
import { ResultsPanel } from "@/components/results";
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
import { getDataLayer } from "@/lib/db";
import {
  computePlan,
  evaluateScale,
  formatGrams,
  formatMinimalGrams,
  planInputFromVersion,
  sizingTotalMg,
} from "@/lib/gramguard";
import type {
  Issue,
  Plan,
  ScaleFields,
  ValidatedFormulaInput,
} from "@/lib/gramguard";
import { MESSAGES, messageForIssue } from "@/lib/messages";
import type { Formula, FormulaVersion } from "@/lib/types";

const S = MESSAGES.scale;

export type ScaleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formula: Formula;
  /** The version being scaled. It is never changed (PRD-23). */
  source: FormulaVersion;
  /** The number the new version will get: the formula's latest number plus one. */
  nextNumber: number;
  /** Called after the new version is saved and the dialog has been closed. */
  onSaved: (version: FormulaVersion) => void;
};

/**
 * Scale a version to a new batch size (F5, PRD-22, PRD-23). The body is only
 * mounted while the dialog is open, so every opening starts fresh from the
 * source version. The dialog does no arithmetic of its own: the engine
 * evaluates the fields and plans the result.
 */
export function ScaleDialog({
  open,
  onOpenChange,
  formula,
  source,
  nextNumber,
  onSaved,
}: ScaleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{S.title(source.number)}</DialogTitle>
          <DialogDescription className="sr-only">{S.description}</DialogDescription>
        </DialogHeader>
        {open ? (
          <ScaleBody
            formula={formula}
            source={source}
            nextNumber={nextNumber}
            onCancel={() => onOpenChange(false)}
            onSaved={(version) => {
              onOpenChange(false);
              onSaved(version);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type Method = "amount" | "multiplier";

const FIELD_ORDER = ["scale.count", "scale.fill", "scale.amount", "scale.multiplier"];

type Preview = { plan: Plan | null; errors: Issue[]; warnings: Issue[] };

/** The source's own planned figures: the shape from the engine, every number from the saved version (DATA-03). */
function savedPlan(source: FormulaVersion): Plan | null {
  const result = computePlan(planInputFromVersion(source));
  if (!result.ok) return null;
  const saved = new Map(source.targets.components.map((c) => [c.componentId, c.targetMg]));
  const plan = result.plan;
  return {
    ...plan,
    totalMg: source.targets.totalMg,
    waxTotalMg: source.targets.waxTotalMg,
    fragranceTotalMg: source.targets.fragranceTotalMg,
    waxes: plan.waxes.map((c) => ({ ...c, targetMg: saved.get(c.componentId) ?? c.targetMg })),
    oils: plan.oils.map((c) => ({ ...c, targetMg: saved.get(c.componentId) ?? c.targetMg })),
  };
}

function ScaleBody({
  formula,
  source,
  nextNumber,
  onCancel,
  onSaved,
}: {
  formula: Formula;
  source: FormulaVersion;
  nextNumber: number;
  onCancel: () => void;
  onSaved: (version: FormulaVersion) => void;
}) {
  const sizing = source.inputs.sizing;
  const precisionMg = source.inputs.precisionMg;

  const [method, setMethod] = useState<Method>("amount");
  const [count, setCount] = useState(sizing.mode === "vessels" ? String(sizing.count) : "");
  const [fill, setFill] = useState(
    sizing.mode === "vessels" ? formatMinimalGrams(sizing.fillMg) : "",
  );
  const [amount, setAmount] = useState(
    sizing.mode === "vessels" ? "" : formatMinimalGrams(sizing.amountMg),
  );
  const [multiplier, setMultiplier] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  /** One id per opening, reused on retry (PRD-19). Made on the first Save, not during render. */
  const versionIdRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const fields: ScaleFields =
    sizing.mode === "vessels"
      ? { method: "vesselCount", count, fill }
      : method === "amount"
        ? { method: "amount", amount }
        : { method: "multiplier", multiplier };

  const evaluation = evaluateScale(sizing, precisionMg, fields);

  const names = useMemo(() => {
    const record: Record<string, string> = {};
    for (const c of [...source.inputs.waxes, ...source.inputs.oils]) {
      record[c.componentId] = c.snapshot.name;
    }
    return record;
  }, [source]);

  const compareTo = useMemo(() => savedPlan(source), [source]);

  const newSizing = evaluation.sizing;
  const preview: Preview = (() => {
    if (!newSizing) return { plan: null, errors: [], warnings: [] };
    const result = computePlan({ ...planInputFromVersion(source), sizing: newSizing });
    if (!result.ok) {
      if (result.reason === "no-wax") {
        return {
          plan: null,
          errors: [{ rule: "V-14", field: "result", severity: "error" }],
          warnings: [],
        };
      }
      return {
        plan: null,
        errors: result.componentIds.map(
          (id): Issue => ({
            rule: "V-15",
            field: "result",
            severity: "error",
            materialName: names[id] ?? "",
          }),
        ),
        warnings: [],
      };
    }
    const plan = result.plan;
    const warnings: Issue[] = plan.roundingWarning
      ? [
          {
            rule: "CALC-13",
            field: "result",
            severity: "warning",
            precisionMg: plan.precisionMg,
            requestedBp: plan.fragranceBp,
            basis: plan.basis,
            effectiveX100:
              plan.basis === "wax" ? plan.effectiveOfWaxX100 : plan.effectiveOfTotalX100,
          },
        ]
      : [];
    return { plan, errors: [], warnings };
  })();

  const issueByField = new Map<string, Issue>();
  for (const issue of evaluation.issues) {
    if (!issueByField.has(issue.field)) issueByField.set(issue.field, issue);
  }
  const messageFor = (field: string): string | undefined => {
    const issue = issueByField.get(field);
    return issue && (touched[field] || attempted) ? messageForIssue(issue) : undefined;
  };
  const touch = (field: string) => setTouched((t) => (t[field] ? t : { ...t, [field]: true }));

  let newLine: string | null = null;
  if (newSizing) {
    if (newSizing.mode === "wax") {
      newLine = S.newWax(formatGrams(newSizing.amountMg, precisionMg));
    } else {
      const total = sizingTotalMg(newSizing);
      if (total !== null) newLine = S.newTotal(formatGrams(total, precisionMg));
    }
  }

  function focusField(field: string) {
    const el = formRef.current?.querySelector<HTMLElement>(`[data-scale-field="${field}"]`);
    if (!el) return;
    el.focus();
    el.scrollIntoView?.({ block: "nearest" });
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (submitting.current) return; // guard double submit (FLOW-07)
    setAttempted(true);
    if (!evaluation.sizing || !evaluation.scale) {
      const first = FIELD_ORDER.find((f) => issueByField.has(f));
      if (first) focusField(first);
      return;
    }
    if (preview.plan === null) {
      focusField("result"); // V-14 or V-15: the panel says why
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      versionIdRef.current ??= crypto.randomUUID();
      const input: ValidatedFormulaInput = {
        name: formula.name,
        sizing: evaluation.sizing,
        fragranceBp: source.inputs.fragranceBp,
        basis: source.inputs.basis,
        precisionMg,
        waxes: source.inputs.waxes.map((c) => ({
          rowId: c.componentId,
          materialId: c.materialId,
          partsX100: c.partsX100,
        })),
        oils: source.inputs.oils.map((c) => ({
          rowId: c.componentId,
          materialId: c.materialId,
          partsX100: c.partsX100,
        })),
        wickId: source.inputs.wick?.materialId ?? null,
        vesselId: source.inputs.vessel?.materialId ?? null,
        notes: source.inputs.notes ?? "",
        changeNote: "",
      };
      const result = await getDataLayer().versions.save({
        versionId: versionIdRef.current,
        target: { kind: "existing", formulaId: formula.id },
        origin: "scaled",
        parentVersionId: source.id,
        scale: evaluation.scale,
        input,
        draftKey: null,
      });
      onSaved(result.version); // the body unmounts; the lock stays on
    } catch {
      setFailed(true);
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={save} noValidate className="grid gap-4">
      {failed ? (
        <Notice
          variant="error"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void save()}>
              {S.retry}
            </Button>
          }
        >
          {S.saveFailed}
        </Notice>
      ) : null}

      {sizing.mode === "vessels" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={S.vesselsLabel} error={messageFor("scale.count")}>
            {(c) => (
              <Input
                {...c}
                data-scale-field="scale.count"
                inputMode="numeric"
                autoComplete="off"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onBlur={() => touch("scale.count")}
              />
            )}
          </Field>
          <Field label={S.fillFieldLabel} unit="g" error={messageFor("scale.fill")}>
            {(c) => (
              <Input
                {...c}
                data-scale-field="scale.fill"
                inputMode="decimal"
                autoComplete="off"
                value={fill}
                onChange={(e) => setFill(e.target.value)}
                onBlur={() => touch("scale.fill")}
              />
            )}
          </Field>
        </div>
      ) : (
        <>
          <SegmentedControl<Method>
            label={S.methodGroupLabel}
            options={[
              { value: "amount", label: S.newAmountOption },
              { value: "multiplier", label: S.multiplierOption },
            ]}
            value={method}
            onChange={setMethod}
          />
          {method === "amount" ? (
            <Field label={S.amountFieldLabel} unit="g" error={messageFor("scale.amount")}>
              {(c) => (
                <Input
                  {...c}
                  data-scale-field="scale.amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => touch("scale.amount")}
                />
              )}
            </Field>
          ) : (
            <Field
              label={S.multiplierFieldLabel}
              unit={"×"}
              error={messageFor("scale.multiplier")}
            >
              {(c) => (
                <Input
                  {...c}
                  data-scale-field="scale.multiplier"
                  inputMode="decimal"
                  autoComplete="off"
                  value={multiplier}
                  onChange={(e) => setMultiplier(e.target.value)}
                  onBlur={() => touch("scale.multiplier")}
                />
              )}
            </Field>
          )}
        </>
      )}

      {newLine ? (
        <p data-testid="scale-new-line" className="text-sm font-semibold text-foreground">
          {newLine}
        </p>
      ) : null}

      <div data-scale-field="result" tabIndex={-1} className="rounded-xl outline-none">
        <ResultsPanel
          plan={preview.plan}
          names={names}
          errors={preview.errors}
          warnings={preview.warnings}
          compareTo={compareTo}
        />
      </div>

      <p className="text-sm text-text-secondary">
        {S.keepsBasis} {S.savesAs(nextNumber)}
      </p>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {S.cancel}
        </Button>
        <Button
          type="submit"
          busy={busy}
          // Keep a field focused so its blur message cannot move this button before the click lands.
          onMouseDown={(e) => e.preventDefault()}
        >
          {busy ? S.saving : S.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
