import { parseMeasured } from "@/lib/gramguard";
import { MESSAGES, messageForIssue } from "@/lib/messages";
import { MAX_BATCH_LABEL_LENGTH } from "@/lib/types";
import type { BatchInput, BatchLotInput } from "@/lib/db";
import type { BatchLot, MeasurementEntry } from "@/lib/types";
import { formatProducedOn, isRealDate } from "./text";

const B = MESSAGES.batches;

/** The lot chosen per component, as a lot id. "" means no lot recorded. */
export type LotChoices = {
  /** Per componentId of a wax or oil row. */
  rows: Record<string, string>;
  wick: string;
  vessel: string;
};

export const EMPTY_LOT_CHOICES: LotChoices = { rows: {}, wick: "", vessel: "" };

/** The form's starting choices from the lots stored on the batch. */
export function initialLotChoices(lots: readonly BatchLot[] | undefined): LotChoices {
  const choices: LotChoices = { rows: {}, wick: "", vessel: "" };
  for (const link of lots ?? []) {
    if (link.part === "row" && link.componentId) choices.rows[link.componentId] = link.lotId;
    else if (link.part === "wick") choices.wick = link.lotId;
    else if (link.part === "vessel") choices.vessel = link.lotId;
  }
  return choices;
}

/**
 * The lots to send: one link per chosen component, rows in the version's order
 * (`componentIds`), then the wick, then the vessel. Empty choices are left out;
 * an empty array clears every link.
 */
export function lotInputs(choices: LotChoices, componentIds: readonly string[]): BatchLotInput[] {
  const out: BatchLotInput[] = [];
  for (const componentId of componentIds) {
    const lotId = choices.rows[componentId];
    if (lotId) out.push({ part: "row", componentId, lotId });
  }
  if (choices.wick) out.push({ part: "wick", lotId: choices.wick });
  if (choices.vessel) out.push({ part: "vessel", lotId: choices.vessel });
  return out;
}

export type FormValues = {
  producedOn: string;
  label: string;
  notes: string;
  /** Per componentId, as typed. */
  texts: Record<string, string>;
  /** The lot per component. Leave out to send no `lots` (the stored links stay). */
  lots?: LotChoices;
};

export type FormErrors = {
  producedOn?: string;
  label?: string;
  measured: Record<string, string>;
};

/**
 * Required, a real date, not after the device's local today, and not after the
 * batch's earliest burn test (`latestProducedOn`), when it has one. A date equal
 * to the stored one (`storedProducedOn`) is accepted as it is: a restore can
 * bring in a batch dated after its burn test.
 */
export function checkDate(
  value: string,
  today: string,
  latestProducedOn: string | null = null,
  storedProducedOn: string | null = null,
): string | null {
  if (value.trim() === "") return B.dateRequired;
  if (!isRealDate(value)) return B.dateInvalid;
  if (value > today) return B.dateFuture;
  if (latestProducedOn && value > latestProducedOn && value !== storedProducedOn) {
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
  storedProducedOn: string | null = null,
): { errors: FormErrors; input: BatchInput | null } {
  const errors: FormErrors = { measured: {} };
  const dateError = checkDate(values.producedOn, today, latestProducedOn, storedProducedOn);
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
      ...(values.lots ? { lots: lotInputs(values.lots, componentIds) } : {}),
    },
  };
}
