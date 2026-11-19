import type { BurnCandleInput, BurnRecordInput, BurnSessionInput } from "@/lib/db";
import { parseFixed } from "@/lib/gramguard";
import { LIMITS } from "@/lib/gramguard/contract";
import { MESSAGES } from "@/lib/messages";
import { isLocalDate } from "@/lib/schedule";
import {
  MAX_BURN_CANDLES,
  MAX_BURN_MINUTES,
  MAX_BURN_MM,
  MAX_BURN_TEXT_LENGTH,
  MAX_BURNS_PER_CANDLE,
  MAX_CANDLE_LABEL_LENGTH,
  MAX_SESSION_LABEL_LENGTH,
  MAX_WICK_NAME_LENGTH,
} from "@/lib/types";
import type { BurnSession, SootLevel } from "@/lib/types";

const M = MESSAGES.burn;

/** The wick select's value for "type a wick name instead". */
export const WICK_OWN = "own";

export const SOOT_LEVELS: readonly SootLevel[] = ["none", "light", "moderate", "heavy"];

/** One burn as typed. `id` is set for a burn already stored. */
export type BurnRow = {
  /** React key, and the key of its errors. Stable while editing. */
  key: string;
  id?: string;
  duration: string;
  /** Grams as typed. */
  before: string;
  after: string;
  diameter: string;
  depth: string;
  flame: string;
  /** "" means not recorded. */
  soot: "" | SootLevel;
  notes: string;
};

export type CandleRow = {
  key: string;
  id?: string;
  label: string;
  /** "" nothing chosen, WICK_OWN to type a name, else a wick material id. */
  wick: string;
  wickText: string;
  coldThrow: string;
  hotThrow: string;
  notes: string;
  burns: BurnRow[];
};

export type FormValues = {
  testedOn: string;
  label: string;
  /** "" means not linked. */
  milestoneId: string;
  candles: CandleRow[];
  conclusion: string;
  notes: string;
};

/**
 * Errors by field path: "testedOn", "label", "conclusion", "notes", "form",
 * `${candleKey}.label | wick | coldThrow | hotThrow | notes` and
 * `${burnKey}.duration | before | after | diameter | depth | flame | notes`.
 */
export type FormErrors = Record<string, string>;

export type Context = {
  /** The device's local today. */
  today: string;
  /** The batch's production date. */
  producedOn: string;
  /** Formats a YYYY-MM-DD for the "before production" message. */
  formatDate: (date: string) => string;
};

export const burnKeyOf = (burnKey: string, field: string) => `${burnKey}.${field}`;
export const candleKeyOf = (candleKey: string, field: string) => `${candleKey}.${field}`;

// ───────────────────────────── Field checks ─────────────────────────────

export function checkDate(value: string, ctx: Context): string | null {
  if (value.trim() === "") return M.errDateRequired;
  if (!isLocalDate(value)) return M.errDateInvalid;
  if (value > ctx.today) return M.errDateFuture;
  if (value < ctx.producedOn) return M.errDateBeforeProduced(ctx.formatDate(ctx.producedOn));
  return null;
}

export function checkSessionLabel(value: string): string | null {
  return value.trim().length > MAX_SESSION_LABEL_LENGTH
    ? M.errLabelTooLong(MAX_SESSION_LABEL_LENGTH)
    : null;
}

export function checkCandleLabel(value: string): string | null {
  const text = value.trim();
  if (text === "") return M.errCandleLabelRequired;
  return text.length > MAX_CANDLE_LABEL_LENGTH ? M.errCandleLabelTooLong(MAX_CANDLE_LABEL_LENGTH) : null;
}

export function checkWick(choice: string, text: string): string | null {
  if (choice === "") return M.errWickRequired;
  if (choice !== WICK_OWN) return null;
  const name = text.trim();
  if (name === "") return M.errWickRequired;
  return name.length > MAX_WICK_NAME_LENGTH ? M.errWickTooLong(MAX_WICK_NAME_LENGTH) : null;
}

export function checkText(value: string): string | null {
  return value.trim().length > MAX_BURN_TEXT_LENGTH ? M.errTextTooLong(MAX_BURN_TEXT_LENGTH) : null;
}

export function checkDuration(value: string): string | null {
  const text = value.trim();
  if (text === "") return M.errDurationRequired;
  if (!/^\d+$/.test(text)) return M.errDurationWhole;
  const n = Number(text);
  return n < 1 || n > MAX_BURN_MINUTES ? M.errDurationRange(MAX_BURN_MINUTES) : null;
}

export function checkMm(value: string): string | null {
  const text = value.trim();
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return M.errMmWhole;
  return Number(text) > MAX_BURN_MM ? M.errMmRange(MAX_BURN_MM) : null;
}

type Weight = { ok: true; mg: number | null } | { ok: false; error: string };

/** Grams typed with up to 2 decimals to whole milligrams. Empty is "not recorded". */
export function parseWeight(value: string): Weight {
  if (value.trim() === "") return { ok: true, mg: null };
  const parsed = parseFixed(value, 3);
  if (!parsed.ok) {
    return {
      ok: false,
      error:
        parsed.reason === "tooManyDecimals"
          ? M.errWeightDecimals
          : parsed.reason === "tooLarge"
            ? M.errWeightTooLarge
            : M.errWeightFormat,
    };
  }
  if (parsed.decimals > 2) return { ok: false, error: M.errWeightDecimals };
  if (parsed.value > LIMITS.maxWeightMg) return { ok: false, error: M.errWeightTooLarge };
  return { ok: true, mg: parsed.value };
}

export function checkBefore(value: string): string | null {
  const parsed = parseWeight(value);
  if (!parsed.ok) return parsed.error;
  return parsed.mg === 0 ? M.errWeightBeforeZero : null;
}

export function checkAfter(after: string, before: string): string | null {
  const parsed = parseWeight(after);
  if (!parsed.ok) return parsed.error;
  const b = parseWeight(before);
  if (parsed.mg !== null && b.ok && b.mg !== null && parsed.mg > b.mg) return M.errWeightAfterAbove;
  return null;
}

// ───────────────────────────── Whole form ─────────────────────────────

function burnErrors(burn: BurnRow, out: FormErrors) {
  const put = (field: string, error: string | null) => {
    if (error) out[burnKeyOf(burn.key, field)] = error;
  };
  put("duration", checkDuration(burn.duration));
  put("before", checkBefore(burn.before));
  put("after", checkAfter(burn.after, burn.before));
  put("diameter", checkMm(burn.diameter));
  put("depth", checkMm(burn.depth));
  put("flame", checkMm(burn.flame));
  put("notes", checkText(burn.notes));
}

function candleErrors(candle: CandleRow, out: FormErrors) {
  const put = (field: string, error: string | null) => {
    if (error) out[candleKeyOf(candle.key, field)] = error;
  };
  put("label", checkCandleLabel(candle.label));
  put("wick", checkWick(candle.wick, candle.wickText));
  put("coldThrow", checkText(candle.coldThrow));
  put("hotThrow", checkText(candle.hotThrow));
  put("notes", checkText(candle.notes));
  for (const burn of candle.burns) burnErrors(burn, out);
}

/** Every problem in the form, by field path. Empty means the form can be saved. */
export function formErrors(values: FormValues, ctx: Context): FormErrors {
  const out: FormErrors = {};
  const date = checkDate(values.testedOn, ctx);
  if (date) out.testedOn = date;
  const label = checkSessionLabel(values.label);
  if (label) out.label = label;
  const conclusion = checkText(values.conclusion);
  if (conclusion) out.conclusion = conclusion;
  const notes = checkText(values.notes);
  if (notes) out.notes = notes;
  for (const candle of values.candles) candleErrors(candle, out);
  return out;
}

function optional(text: string): { value: string | undefined } {
  const value = text.trim();
  return { value: value === "" ? undefined : value };
}

function whole(text: string): number | undefined {
  return text.trim() === "" ? undefined : Number(text.trim());
}

function burnInput(burn: BurnRow): BurnRecordInput {
  const before = parseWeight(burn.before);
  const after = parseWeight(burn.after);
  const notes = optional(burn.notes).value;
  const diameter = whole(burn.diameter);
  const depth = whole(burn.depth);
  const flame = whole(burn.flame);
  return {
    ...(burn.id ? { id: burn.id } : {}),
    durationMin: Number(burn.duration.trim()),
    ...(before.ok && before.mg !== null ? { weightBeforeMg: before.mg } : {}),
    ...(after.ok && after.mg !== null ? { weightAfterMg: after.mg } : {}),
    ...(diameter !== undefined ? { meltPoolDiameterMm: diameter } : {}),
    ...(depth !== undefined ? { meltPoolDepthMm: depth } : {}),
    ...(flame !== undefined ? { flameHeightMm: flame } : {}),
    ...(burn.soot !== "" ? { soot: burn.soot } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

function candleInput(candle: CandleRow): BurnCandleInput {
  const coldThrow = optional(candle.coldThrow).value;
  const hotThrow = optional(candle.hotThrow).value;
  const notes = optional(candle.notes).value;
  return {
    ...(candle.id ? { id: candle.id } : {}),
    label: candle.label.trim(),
    wick: candle.wick === WICK_OWN ? { text: candle.wickText.trim() } : { materialId: candle.wick },
    burns: candle.burns.map(burnInput),
    ...(coldThrow !== undefined ? { coldThrow } : {}),
    ...(hotThrow !== undefined ? { hotThrow } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** The input for the data layer, or null with the errors when the form has problems. */
export function validateForm(
  values: FormValues,
  ctx: Context,
): { errors: FormErrors; input: BurnSessionInput | null } {
  const errors = formErrors(values, ctx);
  if (values.candles.length < 1 || values.candles.length > MAX_BURN_CANDLES) {
    errors.form = M.errCheckFields;
  }
  if (values.candles.some((c) => c.burns.length > MAX_BURNS_PER_CANDLE)) {
    errors.form = M.errCheckFields;
  }
  if (Object.keys(errors).length > 0) return { errors, input: null };
  const label = optional(values.label).value;
  const conclusion = optional(values.conclusion).value;
  const notes = optional(values.notes).value;
  return {
    errors,
    input: {
      testedOn: values.testedOn,
      ...(label !== undefined ? { label } : {}),
      milestoneId: values.milestoneId === "" ? null : values.milestoneId,
      candles: values.candles.map(candleInput),
      ...(conclusion !== undefined ? { conclusion } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  };
}

// ───────────────────────────── Starting values ─────────────────────────────

export function emptyBurn(key: string): BurnRow {
  return {
    key,
    duration: "",
    before: "",
    after: "",
    diameter: "",
    depth: "",
    flame: "",
    soot: "",
    notes: "",
  };
}

/**
 * A new candle named "Candle n". With no wick in the library the wick starts
 * as typed text; otherwise nothing is chosen yet.
 */
export function emptyCandle(key: string, n: number, hasLibraryWicks: boolean): CandleRow {
  return {
    key,
    label: M.defaultCandleLabel(n),
    wick: hasLibraryWicks ? "" : WICK_OWN,
    wickText: "",
    coldThrow: "",
    hotThrow: "",
    notes: "",
    burns: [],
  };
}

export function newFormValues(
  today: string,
  newKey: () => string,
  hasLibraryWicks: boolean,
): FormValues {
  return {
    testedOn: today,
    label: "",
    milestoneId: "",
    candles: [emptyCandle(newKey(), 1, hasLibraryWicks)],
    conclusion: "",
    notes: "",
  };
}

/** Whole milligrams as grams text with the fewest decimals: 123450 gives "123.45". */
export function gramsText(mg: number): string {
  const whole = Math.floor(mg / 1000);
  const rest = mg % 1000;
  if (rest === 0) return String(whole);
  return `${whole}.${String(rest).padStart(3, "0").replace(/0+$/, "")}`;
}

/**
 * The form for a stored session. `knownMaterialIds` are the materials found in
 * the library: a wick whose material is gone is shown as typed text. A link
 * that no longer resolves (`linkResolves` false) shows as not linked.
 */
export function valuesFromSession(
  session: BurnSession,
  options: { newKey: () => string; knownMaterialIds: ReadonlySet<string>; linkResolves: boolean },
): FormValues {
  const { newKey, knownMaterialIds, linkResolves } = options;
  return {
    testedOn: session.testedOn,
    label: session.label ?? "",
    milestoneId: linkResolves && session.milestoneId ? session.milestoneId : "",
    candles: session.candles.map<CandleRow>((candle) => {
      const materialId = candle.wick.materialId;
      const known = materialId !== null && knownMaterialIds.has(materialId);
      return {
        key: newKey(),
        id: candle.id,
        label: candle.label,
        wick: known ? materialId : WICK_OWN,
        wickText: known ? "" : candle.wick.name,
        coldThrow: candle.coldThrow ?? "",
        hotThrow: candle.hotThrow ?? "",
        notes: candle.notes ?? "",
        burns: candle.burns.map<BurnRow>((burn) => ({
          key: newKey(),
          id: burn.id,
          duration: String(burn.durationMin),
          before: burn.weightBeforeMg === undefined ? "" : gramsText(burn.weightBeforeMg),
          after: burn.weightAfterMg === undefined ? "" : gramsText(burn.weightAfterMg),
          diameter: burn.meltPoolDiameterMm === undefined ? "" : String(burn.meltPoolDiameterMm),
          depth: burn.meltPoolDepthMm === undefined ? "" : String(burn.meltPoolDepthMm),
          flame: burn.flameHeightMm === undefined ? "" : String(burn.flameHeightMm),
          soot: burn.soot ?? "",
          notes: burn.notes ?? "",
        })),
      };
    }),
    conclusion: session.conclusion ?? "",
    notes: session.notes ?? "",
  };
}
