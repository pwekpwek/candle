import { parseMeasured } from "@/lib/gramguard";
import { MESSAGES, messageForIssue } from "@/lib/messages";
import { MAX_BATCH_LABEL_LENGTH } from "@/lib/types";
import type { BatchInput } from "@/lib/db";
import type { MeasurementEntry } from "@/lib/types";
import { formatProducedOn, isRealDate } from "./text";

const B = MESSAGES.batches;

export type FormValues = {
  producedOn: string;
  label: string;
  notes: string;
  /** Per componentId, as typed. */
  texts: Record<string, string>;
};

export type FormErrors = {
  producedOn?: string;
  label?: string;
  measured: Record<string, string>;
};

/**
 * Required, a real date, not after the device's local today, and not after the
 * batch's earliest burn test (`latestProducedOn`), when it has one.
 */
export function checkDate(
  value: string,
  today: string,
  latestProducedOn: string | null = null,
): string | null {
  if (value.trim() === "") return B.dateRequired;
  if (!isRealDate(value)) return B.dateInvalid;
  if (value > today) return B.dateFuture;
  if (latestProducedOn && value > latestProducedOn) {
    return B.errProducedAfterBurnTest(formatProducedOn(latestProducedOn));
  }
  return null;
}

export function checkLabel(value: string): string | null {
  return value.trim().length > MAX_BATCH_LABEL_LENGTH ? B.labelTooLong : null;
}

export function checkMeasured(componentId: string, text: string): string | null {
  const parsed = parseMeasured(text, `measured.${componentId}`);
  return parsed.ok ? null : messageForIssue(parsed.issue);
}

/** Parses the typed weights. Empty means not weighed. Bad text is left out here and flagged by `checkMeasured`. */
export function collectEntries(
  componentIds: readonly string[],
  texts: Record<string, string>,
): MeasurementEntry[] {
  const entries: MeasurementEntry[] = [];
  for (const componentId of componentIds) {
    const parsed = parseMeasured(texts[componentId] ?? "", `measured.${componentId}`);
    if (parsed.ok && parsed.actualMg !== null) {
      entries.push({ componentId, actualMg: parsed.actualMg });
    }
  }
  return entries;
}

export function validateForm(
  values: FormValues,
  componentIds: readonly string[],
  today: string,
  latestProducedOn: string | null = null,
): { errors: FormErrors; input: BatchInput | null } {
  const errors: FormErrors = { measured: {} };
  const dateError = checkDate(values.producedOn, today, latestProducedOn);
  if (dateError) errors.producedOn = dateError;
  const labelError = checkLabel(values.label);
  if (labelError) errors.label = labelError;
  for (const id of componentIds) {
    const problem = checkMeasured(id, values.texts[id] ?? "");
    if (problem) errors.measured[id] = problem;
  }
  const invalid =
    errors.producedOn !== undefined ||
    errors.label !== undefined ||
    Object.keys(errors.measured).length > 0;
  if (invalid) return { errors, input: null };
  const label = values.label.trim();
  const notes = values.notes.trim();
  return {
    errors,
    input: {
      producedOn: values.producedOn,
      ...(label !== "" ? { label } : {}),
      ...(notes !== "" ? { notes } : {}),
      entries: collectEntries(componentIds, values.texts),
    },
  };
}
