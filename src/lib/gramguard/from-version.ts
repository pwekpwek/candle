/**
 * GramGuard saved-version adapters (T09): editor fields, plan input and
 * comparison input read from a stored `FormulaVersion`. Nothing is recalculated.
 */
import type { Component } from "@/lib/types";
import {
  formatHundredths,
  formatMinimalGrams,
  formatRequestedPercent,
} from "./format";
import type {
  BlendRowFields,
  CompareInputFromVersion,
  FieldsFromVersion,
  PlanComponentInput,
  PlanInputFromVersion,
} from "./contract";

/** Editor fields that reproduce a saved version (PRD-15). `name` and `changeNote` are "". */
export const fieldsFromVersion: FieldsFromVersion = (version, newRowId) => {
  const { inputs } = version;
  const { sizing } = inputs;
  const rows = (components: Component[]): BlendRowFields[] =>
    components.map((c) => ({
      rowId: newRowId(),
      materialId: c.materialId,
      parts: formatHundredths(c.partsX100),
    }));

  return {
    name: "",
    sizingMode: sizing.mode,
    amount: sizing.mode === "vessels" ? "" : formatMinimalGrams(sizing.amountMg),
    vesselCount: sizing.mode === "vessels" ? String(sizing.count) : "",
    fillWeight: sizing.mode === "vessels" ? formatMinimalGrams(sizing.fillMg) : "",
    fragrancePct: formatRequestedPercent(inputs.fragranceBp),
    basis: inputs.basis,
    precisionMg: inputs.precisionMg,
    waxes: rows(inputs.waxes),
    oils: rows(inputs.oils),
    wickId: inputs.wick?.materialId ?? null,
    vesselId: inputs.vessel?.materialId ?? null,
    notes: inputs.notes ?? "",
    changeNote: "",
  };
};

/** The plan input for a saved version's own inputs, keyed by its componentIds. */
export const planInputFromVersion: PlanInputFromVersion = (version) => {
  const { inputs } = version;
  const toInput = (components: Component[]): PlanComponentInput[] =>
    components.map((c) => ({ componentId: c.componentId, partsX100: c.partsX100 }));
  return {
    sizing: inputs.sizing,
    fragranceBp: inputs.fragranceBp,
    basis: inputs.basis,
    precisionMg: inputs.precisionMg,
    waxes: toInput(inputs.waxes),
    oils: toInput(inputs.oils),
  };
};

/** Comparison input from the stored targets, split into waxes and oils in version order. */
export const compareInputFromVersion: CompareInputFromVersion = (version) => {
  const { inputs, targets } = version;
  const waxIds = new Set(inputs.waxes.map((c) => c.componentId));
  const oilIds = new Set(inputs.oils.map((c) => c.componentId));
  return {
    precisionMg: inputs.precisionMg,
    totalMg: targets.totalMg,
    waxTotalMg: targets.waxTotalMg,
    fragranceTotalMg: targets.fragranceTotalMg,
    waxes: targets.components.filter((c) => waxIds.has(c.componentId)),
    oils: targets.components.filter((c) => oilIds.has(c.componentId)),
  };
};
