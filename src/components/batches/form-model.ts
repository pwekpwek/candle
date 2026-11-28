import { parseMeasured } from "@/lib/gramguard";
import { MESSAGES, messageForIssue } from "@/lib/messages";
import { parseWholeNumber } from "@/lib/cost";
import { MAX_BATCH_LABEL_LENGTH, MAX_CANDLES } from "@/lib/types";
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
  /** v0.3 TrueCandle Cost: candles made and sellable as typed. Blank means not recorded. */
  candlesMade?: string;
  sellable?: string;
};

/** The counts stored on the batch, so a cleared field can send null to clear them. */
export type StoredCounts = { candlesMade?: number; sellable?: number };

export type FormErrors = {
  producedOn?: string;
  label?: string;
  candlesMade?: string;
  sellable?: string;
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

/** Blank is fine. Otherwise a whole number from 1 to 100,000. */
export function checkCandlesMade(text: string): string | null {
  const parsed = parseWholeNumber(text, 1, MAX_CANDLES);
  return parsed.ok || parsed.reason === "empty" ? null : B.candlesMadeInvalid;
}

/** Blank is fine. Otherwise a whole number, needing candles made and not above it. */
export function checkSellable(madeText: string, sellableText: string): string | null {
  const sellable = parseWholeNumber(sellableText, 0, MAX_CANDLES);
  if (sellable.ok === false) return sellable.reason === "empty" ? null : B.sellableInvalid;
  const made = parseWholeNumber(madeText, 1, MAX_CANDLES);
  if (made.ok === false) return made.reason === "empty" ? B.sellableNeedsMade : null;
  return sellable.value > made.value ? B.sellableAbove : null;
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
  storedCounts: StoredCounts = {},
): { errors: FormErrors; input: BatchInput | null } {
  const errors: FormErrors = { measured: {} };
  const dateError = checkDate(values.producedOn, today, latestProducedOn, storedProducedOn);
  if (dateError) errors.producedOn = dateError;
  const labelError = checkLabel(values.label);
  if (labelError) errors.label = labelError;
  const madeText = values.candlesMade ?? "";
  const sellableText = values.sellable ?? "";
  const madeError = checkCandlesMade(madeText);
  if (madeError) errors.candlesMade = madeError;
  const sellableError = checkSellable(madeText, sellableText);
  if (sellableError) errors.sellable = sellableError;
  for (const id of componentIds) {
    const problem = checkMeasured(id, values.texts[id] ?? "");
    if (problem) errors.measured[id] = problem;
  }
  const invalid =
    errors.producedOn !== undefined ||
    errors.label !== undefined ||
    errors.candlesMade !== undefined ||
    errors.sellable !== undefined ||
    Object.keys(errors.measured).length > 0;
  if (invalid) return { errors, input: null };
  const label = values.label.trim();
  const notes = values.notes.trim();
  const made = parseWholeNumber(madeText, 1, MAX_CANDLES);
  const sellable = parseWholeNumber(sellableText, 0, MAX_CANDLES);
  // A number is sent as one, a field cleared over a stored value sends null, and a blank that
  // never held a value is left out (absent keeps what is stored).
  const counts: Pick<BatchInput, "candlesMade" | "sellable"> = {};
  if (made.ok) counts.candlesMade = made.value;
  else if (storedCounts.candlesMade !== undefined) counts.candlesMade = null;
  if (sellable.ok) counts.sellable = sellable.value;
  else if (storedCounts.sellable !== undefined) counts.sellable = null;
  return {
    errors,
    input: {
      producedOn: values.producedOn,
      ...(label !== "" ? { label } : {}),
      ...(notes !== "" ? { notes } : {}),
      entries: collectEntries(componentIds, values.texts),
      ...(values.lots ? { lots: lotInputs(values.lots, componentIds) } : {}),
      ...counts,
    },
  };
}
