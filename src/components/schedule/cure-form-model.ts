import type { CureMilestoneInput } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { MAX_MILESTONES, MAX_MILESTONE_LABEL_LENGTH, MAX_OFFSET_DAYS } from "@/lib/types";
import type { CurePlan } from "@/lib/types";

const S = MESSAGES.schedule;

export type RowKind = "burnTest" | "check";

/** One burn test or other milestone as typed. `id` is set for a milestone already in the plan. */
export type Row = {
  /** React key, stable while editing. */
  key: string;
  id?: string;
  kind: RowKind;
  label: string;
  /** Days after production, as typed. */
  offset: string;
};

export type FormValues = {
  /** Cure time in days, as typed. Empty means no cure end. */
  cureTime: string;
  /** Kept from the stored plan so saving does not change them. */
  cureEndId?: string;
  cureEndLabel?: string;
  rows: Row[];
};

export type RowErrors = { label?: string; offset?: string };

export type FormErrors = {
  cureTime?: string;
  rows: Record<string, RowErrors>;
  /** About the plan as a whole: empty, or too many dates. */
  form?: string;
};

export const EMPTY_ERRORS: FormErrors = { rows: {} };

/** Whole days 0 to 365. `required` is false for the optional cure time. */
export function checkDays(text: string, required: boolean): string | null {
  const value = text.trim();
  if (value === "") return required ? S.errDaysRequired : null;
  if (!/^-?\d+$/.test(value)) return S.errDaysWhole;
  const n = Number(value);
  return n < 0 || n > MAX_OFFSET_DAYS ? S.errDaysRange : null;
}

export function checkRowLabel(kind: RowKind, text: string): string | null {
  const value = text.trim();
  if (value.length > MAX_MILESTONE_LABEL_LENGTH) return S.errLabelTooLong;
  if (kind === "check" && value === "") return S.errLabelRequired;
  return null;
}

/** Dates in the plan: the rows, plus the cure end when a cure time is typed. */
export function milestoneCount(values: Pick<FormValues, "cureTime" | "rows">): number {
  return values.rows.length + (values.cureTime.trim() !== "" ? 1 : 0);
}

export function checkPlanSize(values: Pick<FormValues, "cureTime" | "rows">): string | null {
  const count = milestoneCount(values);
  if (count === 0) return S.errPlanEmpty;
  if (count > MAX_MILESTONES) return S.errTooMany(MAX_MILESTONES);
  return null;
}

/** The form for a stored plan: cure end into the cure time field, the rest as rows by offset. */
export function valuesFromPlan(plan: CurePlan, newKey: () => string): FormValues {
  const cureEnd = plan.milestones.find((m) => m.kind === "cureEnd");
  const rows = plan.milestones
    .filter((m) => m.kind !== "cureEnd")
    .sort((a, b) => a.offsetDays - b.offsetDays || a.kind.localeCompare(b.kind))
    .map<Row>((m) => ({
      key: newKey(),
      id: m.id,
      kind: m.kind === "burnTest" ? "burnTest" : "check",
      label: m.label ?? "",
      offset: String(m.offsetDays),
    }));
  return {
    cureTime: cureEnd ? String(cureEnd.offsetDays) : "",
    ...(cureEnd ? { cureEndId: cureEnd.id } : {}),
    ...(cureEnd?.label ? { cureEndLabel: cureEnd.label } : {}),
    rows,
  };
}

export function validateForm(values: FormValues): {
  errors: FormErrors;
  milestones: CureMilestoneInput[] | null;
} {
  const errors: FormErrors = { rows: {} };
  const cureError = checkDays(values.cureTime, false);
  if (cureError) errors.cureTime = cureError;
  for (const row of values.rows) {
    const rowErrors: RowErrors = {};
    const offset = checkDays(row.offset, true);
    if (offset) rowErrors.offset = offset;
    const label = checkRowLabel(row.kind, row.label);
    if (label) rowErrors.label = label;
    if (rowErrors.offset || rowErrors.label) errors.rows[row.key] = rowErrors;
  }
  const size = checkPlanSize(values);
  if (size) errors.form = size;
  if (errors.cureTime || errors.form || Object.keys(errors.rows).length > 0) {
    return { errors, milestones: null };
  }
  const milestones: CureMilestoneInput[] = [];
  if (values.cureTime.trim() !== "") {
    milestones.push({
      ...(values.cureEndId ? { id: values.cureEndId } : {}),
      kind: "cureEnd",
      ...(values.cureEndLabel ? { label: values.cureEndLabel } : {}),
      offsetDays: Number(values.cureTime.trim()),
    });
  }
  for (const row of values.rows) {
    const label = row.label.trim();
    milestones.push({
      ...(row.id ? { id: row.id } : {}),
      kind: row.kind,
      ...(label !== "" ? { label } : {}),
      offsetDays: Number(row.offset.trim()),
    });
  }
  return { errors, milestones };
}
