import { checklistView } from "@/lib/candlefix";
import type { ChecklistTickInput, HypothesisInput, InvestigationInput } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { isLocalDate } from "@/lib/schedule";
import {
  FIX_ISSUES,
  MAX_CHECK_NOTE_LENGTH,
  MAX_FIX_TEXT_LENGTH,
  MAX_HYPOTHESES,
  MAX_HYPOTHESIS_TEXT_LENGTH,
  MAX_INVESTIGATION_TITLE_LENGTH,
  MAX_OTHER_ISSUE_LENGTH,
} from "@/lib/types";
import type { ChecklistTick, FixIssue, HypothesisStatus, Investigation } from "@/lib/types";

const M = MESSAGES.candleFix;

/** One thing to check as typed: ticked or not, with an optional note. */
export type CheckValue = { checked: boolean; note: string };

/** One hypothesis as typed. `id` is set for a hypothesis already stored. */
export type HypothesisRow = {
  /** React key, and the key of its errors. Stable while editing. */
  key: string;
  id?: string;
  text: string;
  status: HypothesisStatus;
  notes: string;
};

export type FormValues = {
  observedOn: string;
  title: string;
  issues: FixIssue[];
  otherIssue: string;
  notes: string;
  /** Ticks and notes by built-in item id. */
  checks: Record<string, CheckValue>;
  /** The ticks the investigation held when it was opened (empty for a new one). Kept for the "no longer listed" group. */
  storedTicks: ChecklistTick[];
  hypotheses: HypothesisRow[];
};

/** Errors by field key: observedOn, title, issues, otherIssue, notes, `check.<itemId>`, `hyp.<key>.text`, `hyp.<key>.notes`, form. */
export type FormErrors = Record<string, string>;

export type Context = {
  /** Local today, YYYY-MM-DD. */
  today: string;
  /** The batch's production date. */
  producedOn: string;
  /** "Nov 18, 2026" for a YYYY-MM-DD. */
  formatDate: (date: string) => string;
  /** The stored observed date when editing: kept even if it no longer follows the date rule. */
  storedObservedOn?: string;
};

export const newFormValues = (today: string): FormValues => ({
  observedOn: today,
  title: "",
  issues: [],
  otherIssue: "",
  notes: "",
  checks: {},
  storedTicks: [],
  hypotheses: [],
});

export function emptyHypothesis(key: string): HypothesisRow {
  return { key, text: "", status: "open", notes: "" };
}

/** The editor's values for a stored investigation. Hypotheses keep their ids. */
export function valuesFromInvestigation(
  investigation: Investigation,
  newKey: () => string,
): FormValues {
  return {
    observedOn: investigation.observedOn,
    title: investigation.title ?? "",
    issues: [...investigation.issues],
    otherIssue: investigation.otherIssue ?? "",
    notes: investigation.notes ?? "",
    checks: Object.fromEntries(
      investigation.checks.map((tick) => [
        tick.itemId,
        { checked: tick.checked, note: tick.note ?? "" },
      ]),
    ),
    storedTicks: investigation.checks.map((tick) => ({ ...tick })),
    hypotheses: investigation.hypotheses.map((h) => ({
      key: newKey(),
      id: h.id,
      text: h.text,
      status: h.status,
      notes: h.notes ?? "",
    })),
  };
}

/** The stored ticks no group of the chosen issues shows: sent back unchanged so they are kept. */
export function noLongerListed(values: FormValues): ChecklistTick[] {
  return checklistView(values.issues, values.storedTicks).noLongerListed;
}

export const checkErrorKey = (itemId: string) => `check.${itemId}`;
export const hypothesisErrorKey = (key: string, field: "text" | "notes") => `hyp.${key}.${field}`;

/** Every error in the form right now. */
export function formErrors(values: FormValues, context: Context): FormErrors {
  const errors: FormErrors = {};

  const date = values.observedOn;
  if (date === "") errors.observedOn = M.errDateRequired;
  else if (!isLocalDate(date)) errors.observedOn = M.errDateInvalid;
  else if (date > context.today) errors.observedOn = M.errDateFuture;
  else if (date < context.producedOn && date !== context.storedObservedOn) {
    errors.observedOn = M.errDateBeforeProduced(context.formatDate(context.producedOn));
  }

  if (values.title.trim().length > MAX_INVESTIGATION_TITLE_LENGTH) {
    errors.title = M.errTitleTooLong(MAX_INVESTIGATION_TITLE_LENGTH);
  }

  if (values.issues.length === 0) errors.issues = M.errIssuesRequired;

  if (values.issues.includes("other")) {
    const other = values.otherIssue.trim();
    if (other === "") errors.otherIssue = M.errOtherRequired;
    else if (other.length > MAX_OTHER_ISSUE_LENGTH) {
      errors.otherIssue = M.errOtherTooLong(MAX_OTHER_ISSUE_LENGTH);
    }
  }

  if (values.notes.trim().length > MAX_FIX_TEXT_LENGTH) {
    errors.notes = M.errNotesTooLong(MAX_FIX_TEXT_LENGTH);
  }

  for (const [itemId, value] of Object.entries(values.checks)) {
    if (value.note.trim().length > MAX_CHECK_NOTE_LENGTH) {
      errors[checkErrorKey(itemId)] = M.errCheckNoteTooLong(MAX_CHECK_NOTE_LENGTH);
    }
  }

  for (const row of values.hypotheses) {
    const text = row.text.trim();
    if (text === "") errors[hypothesisErrorKey(row.key, "text")] = M.errHypothesisRequired;
    else if (text.length > MAX_HYPOTHESIS_TEXT_LENGTH) {
      errors[hypothesisErrorKey(row.key, "text")] = M.errHypothesisTooLong(MAX_HYPOTHESIS_TEXT_LENGTH);
    }
    if (row.notes.trim().length > MAX_FIX_TEXT_LENGTH) {
      errors[hypothesisErrorKey(row.key, "notes")] = M.errHypothesisNotesTooLong(MAX_FIX_TEXT_LENGTH);
    }
  }
  if (values.hypotheses.length > MAX_HYPOTHESES) {
    errors.form = M.hypothesisLimit(MAX_HYPOTHESES);
  }
  return errors;
}

/** The request the data layer takes. Call it only for values without errors. */
export function buildInput(values: FormValues): InvestigationInput {
  const issues = FIX_ISSUES.filter((issue) => values.issues.includes(issue));
  const view = checklistView(issues, values.storedTicks);

  const checks: ChecklistTickInput[] = [];
  for (const group of view.groups) {
    for (const row of group.rows) {
      const value = values.checks[row.item.id];
      if (!value) continue;
      const note = value.note.trim();
      if (!value.checked && note === "") continue;
      checks.push({
        itemId: row.item.id,
        issue: group.issue,
        label: row.label,
        checked: value.checked,
        ...(note !== "" ? { note } : {}),
      });
    }
  }
  // Ticks the lists no longer show go back exactly as they were stored.
  for (const tick of view.noLongerListed) {
    checks.push({
      itemId: tick.itemId,
      issue: tick.issue,
      label: tick.label,
      checked: tick.checked,
      ...(tick.note !== undefined ? { note: tick.note } : {}),
    });
  }

  const hypotheses: HypothesisInput[] = values.hypotheses.map((row) => {
    const notes = row.notes.trim();
    return {
      ...(row.id !== undefined ? { id: row.id } : {}),
      text: row.text.trim(),
      status: row.status,
      ...(notes !== "" ? { notes } : {}),
    };
  });

  const title = values.title.trim();
  const notes = values.notes.trim();
  return {
    observedOn: values.observedOn,
    ...(title !== "" ? { title } : {}),
    issues,
    ...(issues.includes("other") ? { otherIssue: values.otherIssue.trim() } : {}),
    ...(notes !== "" ? { notes } : {}),
    checks,
    hypotheses,
  };
}

/** Validates, and builds the request when there are no errors. */
export function validateForm(
  values: FormValues,
  context: Context,
): { errors: FormErrors; input: InvestigationInput | null } {
  const errors = formErrors(values, context);
  return { errors, input: Object.keys(errors).length === 0 ? buildInput(values) : null };
}

/** The title shown for an investigation: its title, else its issue labels. */
export function investigationTitle(
  investigation: Pick<Investigation, "title" | "issues" | "otherIssue">,
): string {
  const title = investigation.title?.trim();
  if (title) return title;
  const labels = investigation.issues.map((issue) =>
    issue === "other" && investigation.otherIssue
      ? `${M.issueLabels.other}: ${investigation.otherIssue}`
      : M.issueLabels[issue],
  );
  return labels.join(", ");
}
