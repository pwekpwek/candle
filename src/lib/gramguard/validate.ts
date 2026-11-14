/**
 * GramGuard editor validation (T09). V-01 to V-15, CALC-13, CALC-17.
 *
 * Text goes through `parseFixed` and exact BigInt checks. `computePlan` runs
 * only after the fields validate. No floating point anywhere.
 */
import type { Basis, PrecisionMg, Sizing } from "@/lib/types";
import { parseFixed, precisionDecimals, toBig, toSafeInt } from "./fixed";
import { formatWeight } from "./format";
import { computePlan } from "./plan";
import {
  DEFAULT_BASIS,
  LIMITS,
  PRECISIONS,
  type BlendRowFields,
  type EmptyEditorFields,
  type EvaluateFormula,
  type Issue,
  type Plan,
  type PlanComponentInput,
  type ValidatedRow,
} from "./contract";

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const THOUSAND = BigInt(1000);
const TEN_THOUSAND = BigInt(10_000);

// ───────────────────────── Shared field checks ─────────────────────────
// Also used by scale.ts.

export type FieldResult<T> = { ok: true; value: T } | { ok: false; issue: Issue };

function fail(issue: Issue): { ok: false; issue: Issue } {
  return { ok: false, issue };
}

function pow10(n: number): bigint {
  let r = ONE;
  for (let i = 0; i < n; i++) r *= TEN;
  return r;
}

/** The coarsest finer precision that holds `decimals` places, else null. */
function finerPrecision(precisionMg: PrecisionMg, decimals: number): PrecisionMg | null {
  for (const p of PRECISIONS) {
    if (p < precisionMg && precisionDecimals(p) >= decimals) return p;
  }
  return null;
}

/**
 * V-03/V-04 (rule "V-03") or V-06 (rule "V-06") for a weight in grams. V-01
 * beats the range rules. Exact: "500.55" at 0.1 g is V-04, never rounded.
 */
export function checkWeight(
  text: string,
  field: string,
  precisionMg: PrecisionMg,
  rule: "V-03" | "V-06",
): FieldResult<number> {
  const zeroIssue = (): Issue =>
    rule === "V-03"
      ? { rule: "V-03", field, severity: "error" }
      : { rule: "V-06", field, severity: "error", as: "V-03" };

  const parsed = parseFixed(text, 3);
  if (!parsed.ok && parsed.reason === "empty") return fail(zeroIssue());
  if (!parsed.ok && parsed.reason === "format") return fail({ rule: "V-01", field, severity: "error" });

  // Format is valid: read the exact value as digits ÷ 10^scale grams, whatever the decimals.
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text.trim());
  const intPart = match?.[1] ?? "";
  const fracSig = (match?.[2] ?? "").replace(/0+$/, "");
  const digits = BigInt(intPart + fracSig === "" ? "0" : intPart + fracSig);
  const den = pow10(fracSig.length);
  const numMg = digits * THOUSAND; // value in mg = numMg ÷ den

  if (numMg === ZERO || numMg > BigInt(LIMITS.maxWeightMg) * den) return fail(zeroIssue());

  const step = BigInt(precisionMg) * den;
  if (numMg % step !== ZERO) {
    const lowerMg = (numMg / step) * BigInt(precisionMg);
    const lower = formatWeight(toSafeInt(lowerMg), precisionMg);
    const upper = formatWeight(toSafeInt(lowerMg + BigInt(precisionMg)), precisionMg);
    const finerPrecisionMg = finerPrecision(precisionMg, fracSig.length);
    return fail(
      rule === "V-03"
        ? { rule: "V-04", field, severity: "error", precisionMg, lower, upper, finerPrecisionMg }
        : {
            rule: "V-06",
            field,
            severity: "error",
            as: "V-04",
            precisionMg,
            lower,
            upper,
            finerPrecisionMg,
          },
    );
  }
  return { ok: true, value: toSafeInt(numMg / den) };
}

/** V-05: a whole number from 1 to 9999. */
export function checkVesselCount(text: string, field: string): FieldResult<number> {
  const bad: Issue = { rule: "V-05", field, severity: "error" };
  const r = parseFixed(text, 0);
  if (!r.ok) {
    return r.reason === "format" ? fail({ rule: "V-01", field, severity: "error" }) : fail(bad);
  }
  if (r.value < 1 || r.value > LIMITS.maxVessels) return fail(bad);
  return { ok: true, value: r.value };
}

/** A weight × count above the limit: V-06 as V-03 on the fill field. */
export function vesselsTooHeavy(count: number, fillMg: number): boolean {
  return toBig(count, "count") * toBig(fillMg, "fillMg") > BigInt(LIMITS.maxWeightMg);
}

// ─────────────────────────── Editor evaluation ───────────────────────────

function checkFragrance(text: string): FieldResult<number> {
  const field = "fragrancePct";
  const bad: Issue = { rule: "V-07", field, severity: "error" };
  const r = parseFixed(text, 2);
  if (!r.ok) {
    return r.reason === "format" ? fail({ rule: "V-01", field, severity: "error" }) : fail(bad);
  }
  if (r.value > LIMITS.maxFragranceBp) return fail(bad);
  return { ok: true, value: r.value };
}

function checkParts(text: string, field: string): FieldResult<number> {
  const bad: Issue = { rule: "V-12", field, severity: "error" };
  const r = parseFixed(text, 2);
  if (!r.ok) {
    return r.reason === "format" ? fail({ rule: "V-01", field, severity: "error" }) : fail(bad);
  }
  if (r.value < 1 || r.value > LIMITS.maxPartsX100) return fail(bad);
  return { ok: true, value: r.value };
}

type BlendKind = "waxes" | "oils";

type BlendCheck = {
  issues: Issue[];
  /** Rows with a material and valid parts. Complete only when `issues` is empty. */
  rows: ValidatedRow[];
};

/** V-10/V-11 per row, V-13 on repeats, V-12/V-01 on parts for blends of two or more rows. */
function checkBlend(
  kind: BlendKind,
  rows: BlendRowFields[],
  lookupName: (materialId: string) => string,
): BlendCheck {
  const issues: Issue[] = [];
  const out: ValidatedRow[] = [];
  const noMaterialRule = kind === "waxes" ? "V-10" : "V-11";
  const seen = new Set<string>();
  const multi = rows.length >= 2;

  if (rows.length === 0) {
    issues.push({ rule: noMaterialRule, field: kind, severity: "error" });
    return { issues, rows: out };
  }

  for (const row of rows) {
    const materialField = `${kind}.${row.rowId}.material`;
    let rowOk = true;
    if (row.materialId === null) {
      issues.push({ rule: noMaterialRule, field: materialField, severity: "error" });
      rowOk = false;
    } else if (seen.has(row.materialId)) {
      issues.push({
        rule: "V-13",
        field: materialField,
        severity: "error",
        materialName: lookupName(row.materialId),
      });
      rowOk = false;
    } else {
      seen.add(row.materialId);
    }

    let partsX100 = 100;
    if (multi) {
      const parts = checkParts(row.parts, `${kind}.${row.rowId}.parts`);
      if (parts.ok) partsX100 = parts.value;
      else {
        issues.push(parts.issue);
        rowOk = false;
      }
    }
    if (rowOk && row.materialId !== null) {
      out.push({ rowId: row.rowId, materialId: row.materialId, partsX100 });
    }
  }
  return { issues, rows: out };
}

/**
 * Whether `bp` (on `userBasis`) exceeds `maxBp` on `targetBasis`, exactly:
 * the same fragrance weight as a fraction of the other basis is n ÷ d.
 */
function exceeds(bp: number, userBasis: Basis, maxBp: number, targetBasis: Basis): boolean {
  const b = BigInt(bp);
  let d = TEN_THOUSAND;
  if (userBasis !== targetBasis) d = targetBasis === "wax" ? TEN_THOUSAND - b : TEN_THOUSAND + b;
  return b * TEN_THOUSAND > BigInt(maxBp) * d;
}

function planComponents(rows: ValidatedRow[]): PlanComponentInput[] {
  return rows.map((r) => ({ componentId: r.rowId, partsX100: r.partsX100 }));
}

/** V-02 to V-15 over the editor fields, then `computePlan`. See `EvaluateFormula`. */
export const evaluateFormula: EvaluateFormula = (fields, lookup) => {
  if (fields.waxes.length > LIMITS.maxWaxes) throw new RangeError("Too many wax rows.");
  if (fields.oils.length > LIMITS.maxOils) throw new RangeError("Too many oil rows.");

  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  const nameOf = (materialId: string) => lookup(materialId)?.name ?? "";
  const { precisionMg, basis } = fields;

  // Name (V-02).
  const name = fields.name.trim();
  if (name === "" || Array.from(name).length > LIMITS.maxNameLength) {
    issues.push({ rule: "V-02", field: "name", severity: "error" });
  }

  // Batch size (V-03 to V-06).
  let sizing: Sizing | null = null;
  const sizingIssues: Issue[] = [];
  if (fields.sizingMode === "vessels") {
    const count = checkVesselCount(fields.vesselCount, "vesselCount");
    const fill = checkWeight(fields.fillWeight, "fillWeight", precisionMg, "V-06");
    if (!count.ok) sizingIssues.push(count.issue);
    if (!fill.ok) sizingIssues.push(fill.issue);
    if (count.ok && fill.ok) {
      if (vesselsTooHeavy(count.value, fill.value)) {
        sizingIssues.push({ rule: "V-06", field: "fillWeight", severity: "error", as: "V-03" });
      } else {
        sizing = { mode: "vessels", count: count.value, fillMg: fill.value };
      }
    }
  } else {
    const amount = checkWeight(fields.amount, "amount", precisionMg, "V-03");
    if (amount.ok) sizing = { mode: fields.sizingMode, amountMg: amount.value };
    else sizingIssues.push(amount.issue);
  }
  issues.push(...sizingIssues);

  // Fragrance (V-01, V-07).
  const fragrance = checkFragrance(fields.fragrancePct);
  if (!fragrance.ok) issues.push(fragrance.issue);
  const fragranceBp = fragrance.ok ? fragrance.value : null;

  // Waxes (V-10, V-12, V-13).
  const waxCheck = checkBlend("waxes", fields.waxes, nameOf);
  issues.push(...waxCheck.issues);

  // Oils (V-11, V-12, V-13). Skipped when fragrance is invalid or 0 (CALC-17).
  let oilCheck: BlendCheck = { issues: [], rows: [] };
  if (fragranceBp !== null && fragranceBp > 0) {
    oilCheck = checkBlend("oils", fields.oils, nameOf);
    issues.push(...oilCheck.issues);
  }

  // Warnings V-08 and V-09 (need a valid fragrance percentage).
  if (fragranceBp !== null) {
    if (exceeds(fragranceBp, basis, LIMITS.warnFragranceWaxBp, "wax")) {
      warnings.push({ rule: "V-08", field: "fragrancePct", severity: "warning" });
    }
    for (const row of fields.waxes) {
      const info = row.materialId === null ? undefined : lookup(row.materialId);
      if (info?.maxFragranceBp === undefined) continue;
      if (exceeds(fragranceBp, basis, info.maxFragranceBp, info.maxFragranceBasis ?? DEFAULT_BASIS)) {
        warnings.push({
          rule: "V-09",
          field: "fragrancePct",
          severity: "warning",
          maxBp: info.maxFragranceBp,
          waxName: info.name,
        });
      }
    }
  }

  // Plan, only when batch size, fragrance, waxes and oils are all valid.
  let plan: Plan | null = null;
  const blendsValid = waxCheck.issues.length === 0 && oilCheck.issues.length === 0;
  if (sizing !== null && fragranceBp !== null && blendsValid) {
    const result = computePlan({
      sizing,
      fragranceBp,
      basis,
      precisionMg,
      waxes: planComponents(waxCheck.rows),
      oils: planComponents(oilCheck.rows),
    });
    if (result.ok) {
      plan = result.plan;
    } else if (result.reason === "no-wax") {
      issues.push({ rule: "V-14", field: "result", severity: "error" });
    } else {
      const materialByRow = new Map<string, string>();
      for (const r of waxCheck.rows) materialByRow.set(r.rowId, r.materialId);
      for (const r of oilCheck.rows) materialByRow.set(r.rowId, r.materialId);
      for (const id of result.componentIds) {
        issues.push({
          rule: "V-15",
          field: "result",
          severity: "error",
          materialName: nameOf(materialByRow.get(id) ?? ""),
        });
      }
    }
  }

  if (plan !== null && plan.roundingWarning) {
    warnings.push({
      rule: "CALC-13",
      field: "result",
      severity: "warning",
      precisionMg,
      requestedBp: plan.fragranceBp,
      basis,
      effectiveX100: basis === "wax" ? plan.effectiveOfWaxX100 : plan.effectiveOfTotalX100,
    });
  }

  // CALC-17 note: unscented, and the maker chose at least one oil.
  if (fragranceBp === 0 && fields.oils.some((r) => r.materialId !== null)) {
    warnings.push({ rule: "CALC-17", field: "oils", severity: "note" });
  }

  let input: ReturnType<EvaluateFormula>["input"] = null;
  if (issues.length === 0 && sizing !== null && fragranceBp !== null) {
    input = {
      name,
      sizing,
      fragranceBp,
      basis,
      precisionMg,
      waxes: waxCheck.rows,
      oils: fragranceBp > 0 ? oilCheck.rows : [],
      wickId: fields.wickId,
      vesselId: fields.vesselId,
      notes: fields.notes.trim(),
      changeNote: fields.changeNote.trim(),
    };
  }

  return { issues, warnings, plan, input };
};

/** A blank editor: mode "total", basis "wax", 0.1 g, one empty wax row, one empty oil row. */
export const emptyEditorFields: EmptyEditorFields = (newRowId) => ({
  name: "",
  sizingMode: "total",
  amount: "",
  vesselCount: "",
  fillWeight: "",
  fragrancePct: "",
  basis: "wax",
  precisionMg: 100,
  waxes: [{ rowId: newRowId(), materialId: null, parts: "" }],
  oils: [{ rowId: newRowId(), materialId: null, parts: "" }],
  wickId: null,
  vesselId: null,
  notes: "",
  changeNote: "",
});
