/**
 * User-facing messages (T05). Every string the app shows that comes from the
 * specs, in one place. Wording is copied from:
 *   docs/specs/2 Calculation Rules.md  (V-01 to V-17, CALC-12 to CALC-14)
 *   docs/specs/1 PRD.md                (PRD-09 basis sentence)
 *   docs/specs/3 App Flow and Wireframes.md (flows and screen states)
 *   docs/specs/4 Data Model.md         (restore checks and summary)
 *   docs/design/blueprint.md           (section 5, empty states)
 *
 * Strings marked "WRITTEN HERE" have no source in the specs. Review them.
 * PRD-32: nothing here says or implies that a candle, fragrance level or
 * wick is safe or compliant.
 */
import {
  convertBasis,
  formatPercent2,
  formatRequestedPercent,
  precisionLabel,
} from "@/lib/gramguard";
import type { Issue } from "@/lib/gramguard";
import type { CheckFailure, IntegrityProblem, IntegrityReason, RestoreMode } from "@/lib/backup/contract";
import type {
  Basis,
  BackupCounts,
  DataStoreName,
  MaterialType,
  PrecisionMg,
} from "@/lib/types";

// ─────────────────────────── Helpers ───────────────────────────

function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}

/** "1 formula" / "2 formulas". WRITTEN HERE for the plural rule (s-suffix). */
function countOf(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Joins with ", " (the Data Model's own list style). No "and". */
function joinList(items: readonly string[]): string {
  return items.join(", ");
}

/** Joins with " or " (CALC-13 precision choices). */
function joinOr(items: readonly string[]): string {
  return items.join(" or ");
}

/** The basis phrase used after a percentage (CALC-03, PRD-09, FLOW-01). */
export function basisWords(basis: Basis): string {
  switch (basis) {
    case "wax":
      return "of wax weight";
    case "total":
      return "of total mixture";
    default:
      return assertNever(basis);
  }
}

/** The other basis, for "= 7.41% of total mixture" style equivalents. */
function otherBasis(basis: Basis): Basis {
  switch (basis) {
    case "wax":
      return "total";
    case "total":
      return "wax";
    default:
      return assertNever(basis);
  }
}

/**
 * PRD-09, live sentence beneath the basis control.
 * Wax example from the PRD: "8% of wax weight: 8 g of fragrance for every
 * 100 g of wax. That is 7.41% of the total mixture."
 * The total-mixture sentence is WRITTEN HERE, following CALC-02's
 * "8 g of fragrance in every 100 g of finished mixture".
 * `requestedBp` is the typed percentage in hundredths (800 = 8%).
 */
export function basisExplanation(requestedBp: number, basis: Basis): string {
  const requested = formatRequestedPercent(requestedBp);
  const equivalent = formatPercent2(convertBasis(requestedBp, basis));
  switch (basis) {
    case "wax":
      return `${requested}% of wax weight: ${requested} g of fragrance for every 100 g of wax. That is ${equivalent}% of the total mixture.`;
    case "total":
      return `${requested}% of total mixture: ${requested} g of fragrance in every 100 g of finished mixture. That is ${equivalent}% of the wax weight.`;
    default:
      return assertNever(basis);
  }
}

/**
 * CALC-12. "Planned weights give 7.99% of wax weight."
 * `effectiveX100` is hundredths of a percent on `basis`.
 */
export function effectiveWeightsLine(effectiveX100: number, basis: Basis): string {
  return `Planned weights give ${formatPercent2(effectiveX100)}% ${basisWords(basis)}.`;
}

/** Equivalent line under the planned blend: "= 7.41% of total mixture". */
export function equivalentLine(x100: number, basis: Basis): string {
  return `= ${formatPercent2(x100)}% ${basisWords(otherBasis(basis))}`;
}

// ─────────────────────── Validation texts ───────────────────────

/** V-04 and V-06 as V-04. Finer clause dropped when there is no finer precision. */
export function roundingRuleText(
  precisionMg: PrecisionMg,
  lower: string,
  upper: string,
  finerPrecisionMg: PrecisionMg | null,
): string {
  // A weight must be above 0 g (V-03), so a lower neighbour of 0 is not offered (T25).
  const choices = /^0(\.0+)?$/.test(lower) ? upper : `${lower} or ${upper}`;
  const base = `This formula rounds to ${precisionLabel(precisionMg)}. Enter ${choices}`;
  if (finerPrecisionMg === null) return `${base}.`;
  return `${base}, or switch precision to ${precisionLabel(finerPrecisionMg)}.`;
}

/** V-09. maxBp in hundredths of a percent. */
export function supplierMaxText(maxBp: number, waxName: string): string {
  return `Above the ${formatRequestedPercent(maxBp)}% maximum recorded for ${waxName}.`;
}

/** V-13. */
export function duplicateMaterialText(materialName: string): string {
  return `${materialName} is already in this blend.`;
}

/** V-15 and CALC-14 share one sentence. */
export function zeroComponentText(materialName: string): string {
  return `${materialName} rounds to 0 g at this precision. Use a finer precision or a larger batch.`;
}

/** Finer precisions that exist below `precisionMg`, coarsest first. */
function finerPrecisionsThan(precisionMg: PrecisionMg): PrecisionMg[] {
  switch (precisionMg) {
    case 1000:
      return [100, 10];
    case 100:
      return [10];
    case 10:
      return [];
    default:
      return assertNever(precisionMg);
  }
}

/**
 * CALC-13 rounding warning. Requested percentage has no basis in the spec's
 * own sentence, so it is written exactly as the spec's example. (See report.)
 * `effectiveX100` is hundredths on `basis`.
 */
export function roundingWarningText(
  precisionMg: PrecisionMg,
  requestedBp: number,
  basis: Basis,
  effectiveX100: number,
): string {
  const finer = finerPrecisionsThan(precisionMg).map(precisionLabel);
  const advice =
    finer.length === 0
      ? "Use a larger batch."
      : `Use ${joinOr(finer)} precision, or a larger batch.`;
  return `At ${precisionLabel(precisionMg)} precision this small batch can't hit ${formatRequestedPercent(requestedBp)}%. ${effectiveWeightsLine(effectiveX100, basis)} ${advice}`;
}

/** CALC-17 note. WRITTEN HERE: the spec gives no wording, only "a note". */
export const UNSCENTED_OILS_NOTE =
  "This formula is unscented (0% fragrance), so the oils listed are ignored.";

// ─────────────────────── Issue → message (V-01 to V-17) ───────────────────────

/**
 * Exact text for every validation finding. The switch is exhaustive, so a
 * new rule fails to compile until it has wording here.
 */
export function messageForIssue(issue: Issue): string {
  switch (issue.rule) {
    case "V-01":
      return "Use numbers only, with a period for decimals (for example 462.5). No commas.";
    case "V-02":
      return "Give this formula a name.";
    case "V-03":
      return "Enter a weight above 0 g.";
    case "V-04":
      return roundingRuleText(
        issue.precisionMg,
        issue.lower,
        issue.upper,
        issue.finerPrecisionMg,
      );
    case "V-05":
      return "Enter a whole number of vessels.";
    case "V-06":
      if (issue.as === "V-03") return "Enter a weight above 0 g.";
      return roundingRuleText(
        issue.precisionMg,
        issue.lower,
        issue.upper,
        issue.finerPrecisionMg,
      );
    case "V-07":
      return "Enter a fragrance percentage between 0 and 50.";
    case "V-08":
      return "This is above common usage levels. Check your wax supplier's maximum fragrance load.";
    case "V-09":
      return supplierMaxText(issue.maxBp, issue.waxName);
    case "V-10":
      return "Choose a wax.";
    case "V-11":
      return "Add a fragrance oil, or set fragrance to 0% for an unscented candle.";
    case "V-12":
      return "Enter parts above 0.";
    case "V-13":
      return duplicateMaterialText(issue.materialName);
    case "V-14":
      return "This leaves no wax. Lower the fragrance percentage or raise the batch size.";
    case "V-15":
      return zeroComponentText(issue.materialName);
    case "V-16":
      return "Enter the measured weight in grams.";
    case "V-17":
      return "Enter a multiplier between 0.01 and 1000.";
    case "CALC-13":
      return roundingWarningText(
        issue.precisionMg,
        issue.requestedBp,
        issue.basis,
        issue.effectiveX100,
      );
    case "CALC-17":
      return UNSCENTED_OILS_NOTE;
    default:
      return assertNever(issue);
  }
}

// ─────────────────────── Restore (Data Model) ───────────────────────

/** Data Model, "Step 1 — Checks". One message per CheckFailure code. */
export function messageForCheckFailure(failure: CheckFailure): string {
  switch (failure.code) {
    case "not-backup":
      return "This isn't a CandleLab backup file.";
    case "newer":
      return "This backup was made by a newer version of CandleLab. Update the app, then try again.";
    case "invalid": {
      // Singular forms are WRITTEN HERE; the spec gives only the plural.
      const records =
        failure.count === 1
          ? "1 record is invalid"
          : `${failure.count} records are invalid`;
      return `This backup is damaged: ${records} (first: ${failure.firstLabel}, ${failure.firstProblem}).`;
    }
    case "incomplete":
      return "This backup is incomplete.";
    case "checksum":
      return "This backup is damaged or was edited.";
    case "duplicates":
      return "This backup is damaged: duplicate records.";
    case "orphans": {
      // Singular and "refers" agreement, and the measurement clause, are WRITTEN HERE.
      const parts: string[] = [];
      if (failure.versions > 0) {
        parts.push(
          `${countOf(failure.versions, "version")} ${failure.versions === 1 ? "refers" : "refer"} to a missing formula`,
        );
      }
      if (failure.measurements > 0) {
        parts.push(
          `${countOf(failure.measurements, "measurement")} ${failure.measurements === 1 ? "refers" : "refer"} to a missing version`,
        );
      }
      // Batch clause WRITTEN HERE (v0.2).
      if (failure.batches > 0) {
        parts.push(
          `${countOf(failure.batches, "batch", "batches")} ${failure.batches === 1 ? "refers" : "refer"} to a missing version`,
        );
      }
      // Cure plan and planned production clauses WRITTEN HERE (v0.2 CurePilot).
      if (failure.curePlans > 0) {
        parts.push(
          `${countOf(failure.curePlans, "cure plan")} ${failure.curePlans === 1 ? "refers" : "refer"} to a missing batch`,
        );
      }
      if (failure.productionPlans > 0) {
        parts.push(
          `${countOf(failure.productionPlans, "planned production entry", "planned production entries")} ${failure.productionPlans === 1 ? "refers" : "refer"} to a missing version or batch`,
        );
      }
      // Burn test and photo clauses WRITTEN HERE (v0.2 BurnMatrix).
      if (failure.burnSessions > 0) {
        parts.push(
          `${countOf(failure.burnSessions, "burn test")} ${failure.burnSessions === 1 ? "refers" : "refer"} to a missing batch`,
        );
      }
      if (failure.burnPhotos > 0) {
        parts.push(
          `${countOf(failure.burnPhotos, "photo")} ${failure.burnPhotos === 1 ? "refers" : "refer"} to a missing burn test`,
        );
      }
      // Lot clauses WRITTEN HERE (v0.3 lots).
      if (failure.materialLots > 0) {
        parts.push(
          `${countOf(failure.materialLots, "lot")} ${failure.materialLots === 1 ? "refers" : "refer"} to a missing material or supplier`,
        );
      }
      if (failure.batchLots > 0) {
        parts.push(
          `${countOf(failure.batchLots, "batch", "batches")} ${failure.batchLots === 1 ? "refers" : "refer"} to a missing lot`,
        );
      }
      // CandleFix clauses WRITTEN HERE (v0.3 CandleFix).
      if (failure.investigations > 0) {
        parts.push(
          `${countOf(failure.investigations, "investigation")} ${failure.investigations === 1 ? "refers" : "refer"} to a missing batch`,
        );
      }
      if (failure.investigationPhotos > 0) {
        parts.push(
          `${countOf(failure.investigationPhotos, "investigation photo")} ${failure.investigationPhotos === 1 ? "refers" : "refer"} to a missing investigation`,
        );
      }
      if (failure.correctiveExperiments > 0) {
        parts.push(
          `${countOf(failure.correctiveExperiments, "corrective experiment")} ${failure.correctiveExperiments === 1 ? "refers" : "refer"} to a missing investigation, batch or burn test`,
        );
      }
      // Cost sheet clause WRITTEN HERE (v0.3 TrueCandle Cost).
      if (failure.costSheets > 0) {
        parts.push(
          `${countOf(failure.costSheets, "cost sheet")} ${failure.costSheets === 1 ? "refers" : "refer"} to a missing formula version or batch`,
        );
      }
      return `This backup is incomplete: ${parts.join(" and ")}.`;
    }
    default:
      return assertNever(failure);
  }
}

/** Store names in the order the Data Model's summary uses. */
const SUMMARY_ORDER: readonly {
  key: keyof BackupCounts;
  singular: string;
  plural: string;
}[] = [
  { key: "formulas", singular: "formula", plural: "formulas" },
  { key: "formulaVersions", singular: "version", plural: "versions" },
  { key: "materials", singular: "material", plural: "materials" },
  { key: "measurements", singular: "measurement", plural: "measurements" },
  { key: "batches", singular: "batch", plural: "batches" },
  // WRITTEN HERE (v0.2 CurePilot).
  { key: "curePlans", singular: "cure plan", plural: "cure plans" },
  { key: "productionPlans", singular: "planned production entry", plural: "planned production entries" },
  // WRITTEN HERE (v0.2 BurnMatrix).
  { key: "burnSessions", singular: "burn test", plural: "burn tests" },
  { key: "burnPhotos", singular: "photo", plural: "photos" },
  // WRITTEN HERE (v0.3 lots).
  { key: "suppliers", singular: "supplier", plural: "suppliers" },
  { key: "materialLots", singular: "lot", plural: "lots" },
  // WRITTEN HERE (v0.3 CandleFix).
  { key: "investigations", singular: "investigation", plural: "investigations" },
  { key: "investigationPhotos", singular: "investigation photo", plural: "investigation photos" },
  { key: "correctiveExperiments", singular: "corrective experiment", plural: "corrective experiments" },
  // WRITTEN HERE (v0.3 TrueCandle Cost).
  { key: "costItems", singular: "packaging item", plural: "packaging items" },
  { key: "costSheets", singular: "cost sheet", plural: "cost sheets" },
];

function countsList(counts: BackupCounts): string[] {
  return SUMMARY_ORDER.filter((s) => counts[s.key] > 0).map((s) =>
    countOf(counts[s.key], s.singular, s.plural),
  );
}

// WRITTEN HERE (restore integrity): what is wrong with a link a restore would break.
const INTEGRITY_REASONS: Record<IntegrityReason, string> = {
  "formula-missing": "its formula is missing",
  "version-missing": "its formula version is missing",
  "version-of-other-formula": "its formula version belongs to another formula",
  "batch-missing": "its batch is missing",
  "batch-of-other-version": "its batch was made from another version",
  "session-missing": "its burn test is missing",
  "material-missing": "its material is missing",
  "supplier-missing": "its supplier is missing",
  "lot-missing": "a lot it uses is missing",
  "component-missing": "a lot it uses is recorded for a component its version doesn't have",
  "lot-of-other-material": "a lot it uses is of a different material than that component",
  // WRITTEN HERE (v0.3 CandleFix).
  "investigation-missing": "its investigation is missing",
  "hypothesis-missing": "the hypothesis it follows is not in its investigation",
  "follow-up-missing": "its follow-up batch is missing",
  "follow-up-is-original": "its follow-up batch is the batch it investigates",
  "listed-session-missing": "a burn test it lists is missing",
  "session-of-other-batch": "a burn test it lists is of another batch than its follow-up batch",
  // WRITTEN HERE (v0.3 TrueCandle Cost).
  "line-of-other-material": "a cost line names a different material than that component of its version",
};

/** WRITTEN HERE (restore integrity). e.g. "batch 3f2a9c1d…: its formula version is missing". */
export function integrityProblemText(problem: IntegrityProblem): string {
  const noun = SUMMARY_ORDER.find((s) => s.key === (problem.store as DataStoreName))?.singular ?? "record";
  return `${noun} ${problem.id.slice(0, 8)}…: ${INTEGRITY_REASONS[problem.reason]}`;
}

export type RestoreSummaryInput = {
  fileName: string;
  /** Records newly added, per store. */
  added: BackupCounts;
  /** Identical records skipped, all stores together. */
  skippedIdentical: number;
  /** Conflicts where this device's copy was kept, per store. */
  kept: BackupCounts;
};

/**
 * Data Model, "Step 5 — Result". Example from the spec:
 * "Restored from candlelab-backup-20261114-140512.json: added 9 formulas,
 * 22 versions, 14 materials, 6 measurements. Skipped 12 identical items.
 * Kept this device's copy of 1 material."
 * Zero parts are left out. The no-additions wording is WRITTEN HERE.
 */
export function restoreSummary(input: RestoreSummaryInput): string {
  const sentences: string[] = [];
  const added = countsList(input.added);
  sentences.push(
    added.length === 0
      ? `Restored from ${input.fileName}: nothing new was added.`
      : `Restored from ${input.fileName}: added ${joinList(added)}.`,
  );
  if (input.skippedIdentical > 0) {
    sentences.push(
      `Skipped ${countOf(input.skippedIdentical, "identical item", "identical items")}.`,
    );
  }
  const kept = countsList(input.kept);
  if (kept.length > 0) {
    sentences.push(`Kept this device's copy of ${joinList(kept)}.`);
  }
  return sentences.join(" ");
}

// ─────────────────────── Screen and flow strings ───────────────────────

export const MESSAGES = {
  app: {
    name: "CandleLab",
    navFormulas: "Formulas",
    navMaterials: "Materials",
    /** v0.2. WRITTEN HERE. */
    navBatches: "Batches",
    /** v0.2 CurePilot. WRITTEN HERE (v0.2 CurePilot). The count is the items overdue or due today. */
    navSchedule: "Schedule",
    navScheduleCount: (count: number) => `Schedule, ${count} due or overdue`,
    navBackup: "Backup and restore",
    /** Phone bottom bar (spec 3 phone wireframe: "Formulas  Materials  Backup"). The link keeps the full name for screen readers. */
    navBackupShort: "Backup",
    /** Shown above every page when storage is blocked and the maker carried on. WRITTEN HERE. */
    notSavingTitle: "Not saving.",
    notSavingBody:
      "This browser is not letting the site store data, so nothing you enter will be kept.",
  },

  /** Saved formulas (F2, blueprint section 5). */
  list: {
    title: "Saved formulas",
    newFormula: "New formula",
    startFromExample: "Start from an example",
    searchLabel: "Search formulas",
    showActive: "Active",
    showArchived: "Archived",
    empty: {
      title: "Your formulas will live here.",
      description:
        "Work out wax and fragrance weights, then save them to reuse and revise.",
    },
    noMatch: (query: string) => `No formulas match "${query}".`,
    clearSearch: "Clear search",
    noArchived: {
      title: "No archived formulas.",
      description:
        "Archived formulas are kept here until you restore or delete them.",
    },
    archivedNone: "Show active formulas",
    lastBackupNudge: (when: string) => `Last backup: ${when} · Back up now`,
    /** Never backed up: same link as the nudge. */
    neverBackedUp: "No backup yet · Back up now",
    loading: "Loading your formulas…",
    loadFailedTitle: "Could not load your formulas.",
    loadFailed: "Your data is still on this device. Try again.",
    retry: "Try again",
    showLabel: "Show",
    /** Active view while every formula is archived. */
    allArchived: {
      title: "All your formulas are archived.",
      action: "Show archived formulas",
    },
    columnName: "Name",
    columnVersion: "Version",
    columnFragrance: "Fragrance",
    columnTotal: "Total",
    columnUpdated: "Updated",
    /** Phone card label before the total weight. */
    totalLabel: "Total",
  },

  /** Formula editor, new and revise (F1, F4). */
  editor: {
    title: "New formula",
    nameLabel: "Name",
    batchSizeLabel: "Batch size",
    modeTotal: "Total mixture",
    modeVessels: "Vessels",
    modeWax: "Wax",
    vesselsLabel: "Vessels",
    fillLabel: "Fill",
    fragranceLabel: "Fragrance",
    precisionLabel: "Precision",
    waxLabel: "Wax",
    addAnotherWax: "+ Add another wax",
    oilsLabel: "Fragrance oils",
    partsLabel: "Parts",
    addOil: "+ Add oil",
    remove: "Remove",
    wickLabel: "Wick",
    vesselLabel: "Vessel",
    optional: "optional",
    notesLabel: "Notes",
    saveFormula: "Save formula",
    saving: "Saving",
    cancel: "Cancel",
    retry: "Retry",
    /** Draft banner. `when` is already formatted, e.g. "Nov 14, 13:40". */
    draftRestored: (when: string) =>
      `Restored your unsaved draft from ${when}.`,
    discard: "Discard",
    resultsIncomplete:
      "Results appear when the batch size, fragrance percentage and wax are filled in.",
    /** Save failed. WRITTEN HERE: the spec says "Error next to the button with Retry". */
    saveFailed: "The formula was not saved. Your draft is kept.",
    /** F1 step 6 confirmation. */
    savedAsVersion: (version: number) => `Saved as version ${version}`,
    enterMeasured: "Enter measured weights",
    backToSaved: "Back to saved formulas",
    /** F4 revise banner. */
    revising: (from: number, next: number) =>
      `Revising version ${from}. Saving creates version ${next}.`,
    whatChanged: "What changed?",
    /** F1 step 2: picker first row when the library is empty. */
    addWaxRow: "Add a wax",
    addOilRow: "Add an oil",
    /** T18: editor page text, written here (the specs name the elements, not the words). */
    newDescription: "Work out wax and fragrance weights.",
    reviseTitle: "Revise formula",
    reviseDescription: "Save changes as a new version.",
    loading: "Loading…",
    loadFailedTitle: "Could not open the editor.",
    loadFailed: "This browser could not read your saved formulas. Try again.",
    notFoundTitle: "Formula not found",
    notFoundBody:
      "This formula is not saved in this browser. It may have been deleted, or saved on another device.",
    amountLabel: { total: "Total mixture weight (g)", wax: "Wax weight (g)" },
    vesselCountLabel: "Number of vessels",
    fillWeightLabel: "Fill weight per vessel (g)",
    /** Follows "= 1080.0 g". */
    derivedTotalSuffix: "total mixture",
    fragrancePctLabel: "Fragrance percentage (%)",
    basisLabel: "Basis",
    oilLabel: "Oil",
  },

  /** Planned weights panel (blueprint and F1). */
  results: {
    plannedHeading: "Planned weights",
    plannedBlendHeading: "Planned blend",
    actualBlendHeading: "Actual blend",
    waxRow: "Wax",
    fragranceRow: "Fragrance",
    totalRow: "Total mixture",
    incomplete:
      "Results appear when the batch size, fragrance percentage and wax are filled in.",
    enterAllMeasured: "Enter all measured weights to see the actual blend.",
    /** Screen-reader caption for the planned weights table. WRITTEN HERE. */
    tableCaption: "Planned weights by component",
    columnComponent: "Component",
    columnShare: "Share of blend",
    columnWeight: "Weight",
    /** Wax total row, shown only for a blend of two or more waxes. */
    waxTotalRow: "Wax total",
    /** Screen-reader text for the arrow in a scale preview: "1000.0 g to 1666.7 g". */
    scaleTo: "to",
    /** Joins the figures of the phone summary bar: "Wax 1000.0 g · Fragrance 80.0 g". */
    summarySeparator: " · ",
  },

  /** Formula page and version view (F2, F3, F5). */
  formula: {
    revise: "Revise",
    scale: "Scale",
    measuredLabel: "Measured",
    plannedLabel: "Planned",
    differenceLabel: "Difference",
    versionsHeading: "Versions",
    noMeasurements: "Enter all measured weights to see the actual blend.",
    pillSaving: "Saving…",
    pillSaved: "Saved",
    pillError: "Error",
    pillRetry: "Retry",
    /** CALC-21 wording. `amount` is formatted, e.g. "0.6 g". */
    offTarget: (
      direction: "under" | "over",
      amount: string,
      percentText: string,
    ) => `${amount} ${direction} plan (${percentText})`,
    /** Version 3 of a scaled version: "Scaled x1.67 from v2". */
    scaledFrom: (factor: string, fromVersion: number) =>
      `Scaled x${factor} from v${fromVersion}`,
    /** DATA-11: "now called …" hint. */
    nowCalled: (name: string) => `now called ${name}`,

    // ── Formula page and version view (T20). WRITTEN HERE: the specs give
    // the wireframe wording only, so the rest is new text to review.
    loadingTitle: "Formula",
    loading: "Loading formula…",
    loadFailedTitle: "This formula could not be loaded.",
    loadFailed: "Your data is still on this device. Try again.",
    tryAgain: "Try again",
    notFoundTitle: "Formula not found",
    notFoundVersionTitle: "Version not found",
    notFoundBody:
      "It may have been deleted, or the link may be wrong. Your other formulas are not affected.",
    archivedBadge: "Archived",
    detailSeparator: " · ",
    headerVersion: (version: number) => `Version ${version}`,
    originFirstHeader: "first version",
    originRevisedHeader: (fromVersion: number) => `revised from v${fromVersion}`,
    originRevisedPlain: "revised",
    originScaledHeader: (factor: string, fromVersion: number) =>
      `scaled x${factor} from v${fromVersion}`,
    originScaledPlain: "scaled",
    sizingVessels: (count: number, fill: string) =>
      `${count} ${count === 1 ? "vessel" : "vessels"} × ${fill}`,
    sizingTotal: (amount: string) => `${amount} total mixture`,
    sizingWax: (amount: string) => `${amount} of wax`,
    notLatestNotice: (version: number, latest: number) =>
      `You are viewing version ${version}. The latest is version ${latest}.`,
    openLatest: "Open the latest version",
    moreActions: "More actions",
    editDetails: "Edit name and notes",
    archive: "Archive",
    unarchive: "Unarchive",
    archivedDone: "Archived. It no longer shows in your active formulas.",
    unarchivedDone: "Moved back to your active formulas.",
    archiveFailed: "The archive setting was not changed. Try again.",
    deletePermanently: "Delete permanently",
    gramUnit: "g",

    // Edit name and notes (PRD-17)
    editTitle: "Edit name and notes",
    editDescription: "This does not create a new version.",
    nameLabel: "Name",
    notesLabel: "Notes",
    nameTooLong: "Use 80 characters or fewer.",
    saveDetails: "Save",
    savingDetails: "Saving",
    cancel: "Cancel",
    detailsSaved: "Name and notes saved.",
    detailsSaveFailed: "The name and notes were not saved. Try again.",

    // Delete permanently (PRD-18, D-8, FLOW-09)
    deleteTitle: "Delete this formula permanently?",
    deleteBody: (name: string, versions: number, measurements: number) =>
      `This removes ${name}, its ${countOf(versions, "version")} and ${
        measurements === 0
          ? "no measured-weights records"
          : `${countOf(measurements, "measured-weights record")}`
      }. This cannot be undone.`,
    deleteChecking: "Checking what this removes…",
    deleteImpactFailed:
      "Could not check what this removes. Close this and try again.",
    deleteConfirm: "Delete permanently",
    deleteKeep: "Keep formula",
    deleteFailed: "The formula was not deleted. Try again.",

    // Measured weights
    measuredHeading: "Measured weights",
    measuredHint:
      "Weigh what you actually used. Planned weights stay as saved with this version.",
    componentColumn: "Component",
    measuredFieldLabel: (name: string) => `Measured weight for ${name}`,
    notMeasured: "Not measured",
    saveFailedHint: "Your typed weights are still in the fields.",
    actualSharesHeading: "Share of each oil",

    // Details
    detailsHeading: "Details",
    versionNotesLabel: "Version notes",
    changeNoteLabel: "What changed",
    formulaNotesLabel: "Formula notes",
    noneSet: "None",

    // Versions list (PRD-16)
    versionNumber: (version: number) => `v${version}`,
    originFirstRow: "First version",
    originRevisionRow: (note: string | null) =>
      note ? `Revision: ${note}` : "Revision",
    viewing: "Viewing",
  },

  /**
   * Batches (v0.2, BatchTrace). WRITTEN HERE (v0.2): the specs give no
   * wording. Batches are described as records of a production run, nothing more.
   */
  batches: {
    // List
    title: "Batches",
    listDescription: "Records of production runs, each made from one saved formula version.",
    loading: "Loading batches…",
    loadFailedTitle: "Batches could not be loaded.",
    loadFailed: "Your data is still on this device. Try again.",
    tryAgain: "Try again",
    emptyTitle: "No batches yet",
    emptyDescription:
      "A batch is a record of one production run, made from a saved formula version. Open a saved formula and choose Create batch.",
    emptyAction: "Go to saved formulas",
    /** Used when the batch has no label: "Batch 3F2A91C0". */
    defaultTitle: (idStart: string) => `Batch ${idStart}`,
    versionText: (version: number) => `version ${version}`,
    formulaArchivedBadge: "Formula archived",
    notWeighed: "Not weighed yet",
    weighedStatus: (weighed: number, total: number) => `${weighed} of ${total} weighed`,
    producedOnLabel: "Produced",

    // Create and detail
    createButton: "Create batch",
    createTitle: "Create batch",
    createDescription: "Record a production run made from one saved version.",
    creating: "Creating batch",
    saveChanges: "Save changes",
    savingChanges: "Saving changes",
    sourceHeading: "Made from",
    sourcePlannedTotal: (total: string) => `Planned total ${total}`,
    madeFrom: "From",
    separator: " · ",
    createdNotice: "Batch saved",
    changesSaved: "Changes saved",
    createFailed: "The batch was not saved. Your entries are still in the form. Try again.",
    saveFailed: "The changes were not saved. Your entries are still in the form. Try again.",
    loadingTitle: "Batch",
    detailLoading: "Loading batch…",
    notFoundTitle: "Batch not found",
    notFoundBody:
      "It may have been deleted, or the link may be wrong. Your other batches are not affected.",
    backToBatches: "Back to batches",
    sourceNotFoundTitle: "Version not found",
    sourceNotFoundBody:
      "A batch is made from a saved formula version. This version may have been deleted, or the link may be wrong.",
    backToFormulas: "Back to saved formulas",
    notLatestNotice: (version: number, latest: number) =>
      `Made from version ${version}. The formula's latest version is ${latest}.`,

    // Form fields
    producedOnFieldLabel: "Production date",
    labelFieldLabel: "Label (optional)",
    labelHint: "Your own code for this batch, up to 40 characters.",
    notesFieldLabel: "Notes (optional)",
    dateRequired: "Enter the production date.",
    dateInvalid: "Enter a valid date.",
    dateFuture: "The production date cannot be in the future.",
    // WRITTEN HERE (v0.2 integration QA)
    errProducedAfterBurnTest: (date: string) =>
      `A burn test on this batch is dated ${date}. The production date can't be later than that.`,
    labelTooLong: "Use 40 characters or fewer.",
    measuredHeading: "Measured weights",
    measuredHint:
      "Weigh what you actually used. Leave a row empty if you did not weigh it. Planned weights come from the saved version.",

    // Delete a batch
    deleteBatch: "Delete batch",
    deleteTitle: "Delete this batch?",
    deleteBody: (title: string) =>
      `This removes the record ${title}, including its measured weights and notes. The formula and its versions are not changed. This cannot be undone.`,
    deleteConfirm: "Delete batch",
    deleteKeep: "Keep batch",
    deleteFailed: "The batch was not deleted. Try again.",
    // WRITTEN HERE (v0.2 CurePilot): what else goes with a batch.
    deleteChecking: "Checking what goes with this batch…",
    deleteCureNote: (milestones: number) =>
      `Its cure plan, with ${countOf(milestones, "milestone")}, is deleted too.`,
    deletePlanNote: "The planned production entry it came from becomes open again.",
    // WRITTEN HERE (v0.3 CandleFix): a batch kept by investigations or by being a follow-up batch.
    investigationsDeleteBlocked: (n: number) =>
      `This batch has ${countOf(n, "investigation")}. A batch cannot be deleted until its investigations are deleted. Open each investigation and delete it first.`,
    followUpDeleteBlocked: (n: number) =>
      `This batch is the follow-up batch of ${countOf(n, "corrective experiment")}. A batch cannot be deleted while an experiment names it. Open the experiment and delete it first.`,
    // WRITTEN HERE (v0.3 TrueCandle Cost): a batch kept by its cost sheets.
    costSheetsDeleteBlocked: (n: number) =>
      `This batch has ${countOf(n, "cost sheet")}. A batch cannot be deleted while a cost sheet is costed from it. Open each cost sheet and delete it first.`,

    // WRITTEN HERE (v0.2 CurePilot): Create batch from a planned production entry.
    planNoticeTitle: "From planned production.",
    planNotice: (what: string, date: string) =>
      `This batch is made from the entry ${what}, planned for ${date}. Saving links them.`,
    planAlreadyTitle: "This entry already has a batch.",
    planAlreadyBody: "A planned production entry can make one batch.",
    planOpenBatch: "Open the batch",
    planOpenEntry: "Open the entry",
    planOtherVersionTitle: "This entry is for another version.",
    planOtherVersionBody:
      "The entry names a different version of the formula than the one in this link, so a batch cannot be made from it here.",
    planGoneTitle: "Planned production not found",
    planGoneBody: "It may have been deleted, or the link may be wrong.",
    planCreateInvalid:
      "The batch was not saved. The planned production entry already has a batch, or is for another version.",
    planCreateGone: "The batch was not saved. The planned production entry no longer exists.",
    planCheckFailed: "The planned production entry could not be checked. Try again.",

    // On the formula page
    formulaCreateBatch: "Create batch",
    formulaBatchesHeading: "Batches",
    formulaNoBatches: "No batches made from this formula yet.",
    formulaBatchesLoadFailed: "Batches could not be loaded.",

    // Deleting a formula that has batches
    formulaDeleteRefusedTitle: "This formula cannot be deleted",
    formulaDeleteRefused: (count: number) =>
      `This formula has ${countOf(count, "batch", "batches")}, so it can't be deleted. Batches keep a link to the version they were made from. Delete those batches first, or archive the formula.`,
    // WRITTEN HERE (v0.3 TrueCandle Cost): a formula kept by cost sheets of its versions.
    formulaDeleteRefusedCostSheets: (count: number) =>
      `This formula has ${countOf(count, "cost sheet")}, so it can't be deleted. Cost sheets keep a link to the version they were costed from. Delete those cost sheets first, or archive the formula.`,
    formulaDeleteClose: "Close",
    // WRITTEN HERE (v0.2 CurePilot)
    formulaDeletePlans: (count: number) =>
      `Its ${countOf(count, "planned production entry", "planned production entries")} will be deleted too.`,

    // WRITTEN HERE (v0.3 lots): lots on the batch form and the batch page.
    lotsHeading: "Lots",
    lotsRecordedHeading: "Recorded lots",
    lotsHint:
      "Optional. Record the lot used for each component, so you can trace this batch later. Lots come from the lots list on the Materials page.",
    lotsLoading: "Loading lots…",
    lotsLoadFailed:
      "Lots could not be loaded. Any lots already recorded on this batch are kept when you save.",
    lotFieldLabel: (name: string) => `Lot for ${name}`,
    lotFieldLabelWick: (name: string) => `Lot for wick ${name}`,
    lotFieldLabelVessel: (name: string) => `Lot for vessel ${name}`,
    lotNone: "No lot recorded",
    lotReceivedOn: (date: string) => `received ${date}`,
    lotArchivedOption: (text: string) => `${text} (archived)`,
    lotMissingOption: (code: string) => `${code} (not found)`,
    lotNoLotsHint: (name: string) => `No lots recorded for ${name} yet.`,
    lotAddLink: "Add a lot",
    partWax: "Wax",
    partOil: "Fragrance oil",
    partWick: "Wick",
    partVessel: "Vessel",
    lotSupplierLabel: (name: string) => `Supplier: ${name}`,
    lotNoSupplier: "No supplier recorded",
    lotNowCode: (code: string) => `Lot now recorded as ${code}`,
    lotNowSupplier: (name: string | null) =>
      name === null ? "Supplier now recorded as none" : `Supplier now recorded as ${name}`,
    lotArchivedBadge: "Archived",
    lotNotFound: "This lot is no longer on this device.",
    rowLots: (codes: string) => `Lots: ${codes}`,

    // WRITTEN HERE (v0.3 TrueCandle Cost): candle counts on the batch.
    candlesMadeLabel: "Candles made (optional)",
    sellableLabel: "Sellable (optional)",
    candlesHint: "Whole candles. Cost sheets use these to work out the cost per sellable candle.",
    candlesMadeInvalid: "Enter a whole number from 1 to 100,000.",
    sellableInvalid: "Enter a whole number from 0 up to the candles made.",
    sellableAbove: "Sellable cannot be more than candles made.",
    sellableNeedsMade: "Enter the candles made, or clear sellable.",
    /** `sellable` is null when only the candles made were recorded. */
    countsLine: (made: number, sellable: number | null): string =>
      sellable === null ? `${made} made` : `${made} made, ${sellable} sellable`,
  },

  // WRITTEN HERE (v0.3 lots): search, filters and export on the Batches list.
  batchTrace: {
    // WRITTEN HERE (v0.3 CandleFix): header link to the all-investigations list.
    investigationsLink: "Investigations",
    searchLabel: "Search batches",
    searchPlaceholder: "Batch label, formula, lot code or supplier",
    filtersToggle: (active: number) => (active > 0 ? `Filters (${active})` : "Filters"),
    formulaLabel: "Formula",
    allFormulas: "All formulas",
    fromLabel: "Produced from",
    toLabel: "Produced to",
    dateRangeError: "The from date is after the to date.",
    lotLabel: "Lot",
    allLots: "All lots",
    lotOption: (code: string, material: string) => `${code} · ${material}`,
    supplierLabel: "Supplier",
    allSuppliers: "All suppliers",
    unknownOption: "Not on this device",
    curePlanLabel: "Cure plan",
    burnTestsLabel: "Burn tests",
    any: "Any",
    withIt: "With",
    withoutIt: "Without",
    count: (shown: number, total: number) =>
      `${shown} of ${total} ${total === 1 ? "batch" : "batches"}`,
    clearFilters: "Clear filters",
    exportCsv: "Export CSV",
    exportFailed: "The CSV could not be downloaded. Try again.",
    noMatchTitle: "No batches match",
    noMatchDescription: "Change the search or the filters to see more batches.",
  },

  /**
   * CurePilot (v0.2): cure plans, planned production and the Schedule page.
   * Scheduling information only: dates the maker chose, never a statement that
   * a candle is cured, ready or finished. Every string is WRITTEN HERE
   * (v0.2 CurePilot) for owner review.
   */
  schedule: {
    // WRITTEN HERE (v0.2 CurePilot): the Curing section on the batch page
    curingHeading: "Curing",
    curingEmpty:
      "Set a cure time and dates for burn tests. They show on the Schedule page as reminders for the dates you choose.",
    addCurePlan: "Add cure plan",
    editCurePlan: "Edit cure plan",
    removeCurePlan: "Remove cure plan",
    curingLoadFailed: "The cure plan could not be loaded.",
    curingDatesLabel: "Cure plan dates",
    cureTime: (days: number) => `Cure time: ${countOf(days, "day")}`,
    noCureTime: "No cure time set.",
    plannedCureEnd: (date: string) => `Planned cure end: ${date}`,
    kindName: {
      cureEnd: "Planned cure end",
      burnTest: "Planned burn test",
      check: "Milestone",
    },
    dueOn: (date: string) => `Due ${date}`,
    stateOverdue: "Overdue",
    stateDue: "Due today",
    stateUpcoming: "Upcoming",
    stateDone: (date: string) => `Done on ${date}`,
    markDone: "Mark done",
    markNotDone: "Mark not done",
    markDoneFor: (what: string) => `Mark done: ${what}`,
    markNotDoneFor: (what: string) => `Mark not done: ${what}`,
    markFailed: "The change was not saved. Try again.",
    cureSavedNotice: "Cure plan saved",
    removeTitle: "Remove this cure plan?",
    removeBody: (milestones: number) =>
      `This removes the cure plan and its ${countOf(milestones, "milestone")} from this batch. The batch is not changed. This cannot be undone.`,
    removeConfirm: "Remove cure plan",
    removeKeep: "Keep cure plan",
    removeFailed: "The cure plan was not removed. Try again.",

    // WRITTEN HERE (v0.2 CurePilot): the cure-plan editor
    editorAddTitle: "Add cure plan",
    editorEditTitle: "Edit cure plan",
    editorLoading: "Loading cure plan…",
    editorDescription: (title: string, producedOn: string) =>
      `For ${title}, produced ${producedOn}. Dates are counted in days from the production date.`,
    backToBatch: "Back to batch",
    cureTimeLabel: "Cure time (days)",
    cureTimeHint: "Whole days, 0 to 365. Leave empty to set no cure time.",
    milestonesHeading: "Burn tests and other dates",
    addBurnTest: "Add burn test",
    addOther: "Add other milestone",
    rowGroup: (n: number) => `Milestone ${n}`,
    kindLabel: "Type",
    kindOptionBurnTest: "Burn test",
    kindOptionCheck: "Other",
    labelOptional: "Label (optional)",
    labelRequired: "Label",
    offsetLabel: "Days after production",
    removeRow: "Remove",
    removeRowFor: (n: number) => `Remove milestone ${n}`,
    limitReached: (max: number) =>
      `A plan can have up to ${max} dates, including the cure time.`,
    cureSave: "Save cure plan",
    cureSaving: "Saving cure plan",
    cancel: "Cancel",
    errDaysWhole: "Enter a whole number of days.",
    errDaysRange: "Use 0 to 365 days.",
    errDaysRequired: "Enter the number of days.",
    errLabelRequired: "Enter a label for this milestone.",
    errLabelTooLong: "Use 60 characters or fewer.",
    errPlanEmpty: "Add a cure time, a burn test or another milestone.",
    errTooMany: (max: number) =>
      `A plan can have at most ${max} dates, including the cure time.`,
    cureSaveFailed:
      "The cure plan was not saved. Your entries are still in the form. Try again.",
    cureSaveInvalid: "The cure plan was not saved. Check the days and labels.",
    cureBatchGone: "This batch was deleted, so the cure plan could not be saved.",

    // WRITTEN HERE (v0.2 CurePilot): planned production
    planProduction: "Plan production",
    planCreateTitle: "Plan production",
    planCreateDescription:
      "Pick a date to make one saved version. This is a reminder, not a batch.",
    planViewTitle: "Planned production",
    planLoading: "Loading planned production…",
    planSourceHeading: "Planned for",
    plannedOnLabel: "Planned date",
    plannedOnRequired: "Enter the planned date.",
    plannedOnInvalid: "Enter a valid date.",
    planLabelLabel: "Label (optional)",
    planLabelHint: "Your own name for this run, up to 40 characters.",
    planLabelTooLong: "Use 40 characters or fewer.",
    planNotesLabel: "Notes (optional)",
    planSave: "Save planned production",
    planSaving: "Saving planned production",
    planSaveChanges: "Save changes",
    planSavingChanges: "Saving changes",
    planCreateFailed:
      "The planned production was not saved. Your entries are still in the form. Try again.",
    planSaveFailed: "The changes were not saved. Your entries are still in the form. Try again.",
    planSavedNotice: "Planned production saved",
    planChangesSaved: "Changes saved",
    planOpenLine: "No batch made from this entry yet.",
    planCreateBatch: "Create batch",
    planBatchMade: "Batch made from this entry:",
    planProducedOn: (date: string) => `produced ${date}`,
    planDelete: "Delete entry",
    planDeleteTitle: "Delete this planned production?",
    planDeleteBody: (hasBatch: boolean) =>
      hasBatch
        ? "This removes the entry only. The batch made from it is not changed. This cannot be undone."
        : "This removes the entry. Nothing else is changed. This cannot be undone.",
    planDeleteConfirm: "Delete entry",
    planDeleteKeep: "Keep entry",
    planDeleteFailed: "The entry was not deleted. Try again.",
    planNotFoundTitle: "Planned production not found",
    planNotFoundBody:
      "It may have been deleted, or the link may be wrong. Your formulas and batches are not affected.",
    planSourceNotFoundBody:
      "A planned production is for one saved formula version. This version may have been deleted, or the link may be wrong.",
    backToSchedule: "Back to schedule",
    formulaPlansHeading: "Planned production",
    formulaPlansLoadFailed: "Planned production could not be loaded.",
    formulaPlanRow: (version: number) => `version ${version}`,

    // WRITTEN HERE (v0.2 CurePilot): the Schedule page
    title: "Schedule",
    description: "Dates you set for cure times, burn tests and planned production.",
    loading: "Loading schedule…",
    loadFailedTitle: "The schedule could not be loaded.",
    loadFailed: "Your data is still on this device. Try again.",
    tryAgain: "Try again",
    emptyTitle: "Nothing scheduled yet",
    emptyDescription:
      "Add a cure plan from a batch, or plan production from a formula. The dates you set show up here.",
    emptyBatches: "Go to batches",
    emptyFormulas: "Go to saved formulas",
    groupOverdue: "Overdue",
    groupDue: "Due today",
    groupUpcoming: "Upcoming",
    groupDone: "Done",
    doneLimited: (shown: number) => `Showing the ${shown} most recent.`,
    productionTitle: "Planned production",
    productionDate: (date: string) => `Planned ${date}`,
    versionOf: (name: string, version: number) => `${name}, version ${version}`,
    rowFailed: "The change was not saved. Try again.",
  },

  /** Scale dialog (F5). */
  scale: {
    title: (version: number) => `Scale version ${version}`,
    vesselsLabel: "Vessels",
    fillLabel: "Fill",
    newTotal: (amount: string) => `New total mixture: ${amount}`,
    keepsBasis:
      "Percentage, basis and ratios stay the same.",
    savesAs: (next: number) => `This saves as version ${next}.`,
    save: "Save as new version",
    cancel: "Cancel",
    multiplierLabel: "Multiplier",
    amountLabel: "Amount",
    // Added in T21. WRITTEN HERE: the spec gives the wireframe wording only.
    description: "Change the batch size. The recipe stays the same.",
    methodGroupLabel: "How to scale",
    newAmountOption: "New amount",
    multiplierOption: "Multiplier",
    fillFieldLabel: "Fill (g)",
    amountFieldLabel: "Amount (g)",
    multiplierFieldLabel: "Multiplier (×)",
    newWax: (amount: string) => `New wax weight: ${amount}`,
    saving: "Saving",
    saveFailed: "The new version was not saved. Nothing was changed.",
    retry: "Retry",
  },

  /** Material library and picker (F8, blueprint section 5). */
  materials: {
    title: "Materials",
    addMaterial: "Add material",
    empty: {
      title: "No materials yet.",
      description: "Add the waxes, oils, wicks and vessels you use.",
      action: "Add material",
    },
    /** Type filter with none of that type. `typeName` is e.g. "wax". */
    typeEmpty: (typeName: string) => `No ${typeName} yet.`,
    typeAdd: (typeName: string) => `Add ${typeName}`,
    filterAll: "All",
    filterWax: "Wax",
    filterOils: "Oils",
    filterWicks: "Wicks",
    filterVessels: "Vessels",
    /** Picker first row. WRITTEN HERE for wick and vessel. */
    pickerAddRow: (type: MaterialType): string => {
      switch (type) {
        case "wax":
          return "Add a wax";
        case "fragranceOil":
          return "Add an oil";
        case "wick":
          return "Add a wick";
        case "vessel":
          return "Add a vessel";
        default:
          return assertNever(type);
      }
    },
    usedIn: (count: number) => `Used in ${countOf(count, "formula", "formulas")}`,
    /** F8 archive explanation. */
    archiveUsedIn: (count: number) =>
      `Used in ${countOf(count, "formula", "formulas")}. They keep their saved details.`,
    archive: "Archive",
    save: "Save",
    editWax: "Edit wax",
    editOil: "Edit oil",
    nameLabel: "Name",
    supplierLabel: "Supplier (optional)",
    supplierMaxLabel: "Supplier max fragrance (optional)",
    notesLabel: "Notes",
    /** Everything below was added by T16 and is WRITTEN HERE. */
    description: "The waxes, oils, wicks and vessels you use.",
    filterLabel: "Filter by type",
    typeName: {
      wax: "wax",
      fragranceOil: "oil",
      wick: "wick",
      vessel: "vessel",
    } satisfies Record<MaterialType, string>,
    typeTag: {
      wax: "Wax",
      fragranceOil: "Oil",
      wick: "Wick",
      vessel: "Vessel",
    } satisfies Record<MaterialType, string>,
    editTitle: {
      wax: "Edit wax",
      fragranceOil: "Edit oil",
      wick: "Edit wick",
      vessel: "Edit vessel",
    } satisfies Record<MaterialType, string>,
    addTitle: {
      wax: "Add wax",
      fragranceOil: "Add oil",
      wick: "Add wick",
      vessel: "Add vessel",
    } satisfies Record<MaterialType, string>,
    addTitleGeneric: "Add material",
    typeChoiceLabel: "Type",
    columnName: "Name",
    columnType: "Type",
    columnSupplier: "Supplier",
    columnUsedIn: "Used in",
    noSupplier: "—",
    archivedTag: "Archived",
    showArchived: "Show archived",
    unarchive: "Unarchive",
    archivedNotice: "Archived. It no longer appears when you pick materials.",
    archivedDone: "Archived.",
    unarchivedDone: "Unarchived.",
    savedDone: "Saved.",
    addedDone: "Added.",
    cancel: "Cancel",
    saving: "Saving…",
    nameRequired: "Give this material a name.",
    nameTooLong: "Use 80 characters or fewer.",
    wickSizeLabel: "Size or series (optional)",
    capacityLabel: "Capacity in mL (optional)",
    capacityInvalid: "Enter a whole number of mL above 0.",
    defaultFillLabel: "Default fill weight in grams (optional)",
    fillInvalid: "Enter a weight above 0 g.",
    maxFragranceInvalid: "Enter a fragrance percentage between 0 and 50.",
    basisLabel: "Basis",
    basisWax: "of wax weight",
    basisTotal: "of total mixture",
    fixFirst: "Fix the highlighted fields, then save again.",
    loading: "Loading materials…",
    loadFailedTitle: "Could not load your materials.",
    loadFailed: "Your data is still on this device. Try again.",
    retry: "Try again",
    saveFailedTitle: "Not saved.",
    saveFailed: "Something went wrong and nothing was changed. Try again.",
    archiveFailed: "Could not change the archived state. Try again.",
    pickerNone: "None",
    pickerChoose: "Choose…",
    pickerNameLabel: "Name",
    pickerCreate: "Add and select",
    pickerCancel: "Cancel",
    pickerLoading: "Loading…",
    pickerMissing: "Unavailable material",
    decimalsPercent: "Use 2 decimal places at most.",
    decimalsGrams: "Use 3 decimal places at most.",
    allArchived: "All your materials are archived.",

    // WRITTEN HERE (v0.3 TrueCandle Cost): default price on a material.
    priceLabelKg: "Default price per kg in pesos (optional)",
    priceLabelEach: "Default price each in pesos (optional)",
    priceHint: "For example 1850.50. Leave it blank for no price.",
    priceNote: "Changing the price never changes saved cost sheets.",
    priceInvalid: "Enter an amount in pesos, for example 1850.50, using numbers and a period.",
    priceDecimals: "Use 2 decimal places at most.",
    priceRange: "Enter a price from ₱0.00 to ₱10,000,000.00.",
    columnPrice: "Default price",
    priceNone: "No price",
  },

  // WRITTEN HERE (v0.3 lots): supplier library screen, for owner review.
  suppliers: {
    title: "Suppliers",
    description: "The places your materials come from. Kept on this device only.",
    addSupplier: "Add supplier",
    addTitle: "Add supplier",
    editTitle: "Edit supplier",
    empty: {
      title: "No suppliers yet.",
      description: "Add a supplier to record where a lot of material came from.",
      action: "Add supplier",
    },
    backToMaterials: "Materials",
    lotsLink: "Lots",
    showArchived: "Show archived",
    allArchived: "All your suppliers are archived.",
    archivedTag: "Archived",
    lotCount: (count: number) => `${countOf(count, "lot")}`,
    batchCount: (count: number) => `Named on ${countOf(count, "batch", "batches")}`,
    nameLabel: "Name",
    notesLabel: "Contact notes (optional)",
    nameRequired: "Enter a supplier name.",
    nameTooLong: "Use 80 characters or fewer.",
    nameDuplicate: "A supplier with this name already exists. Archived suppliers count too.",
    notesTooLong: "Use 2000 characters or fewer.",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    archive: "Archive",
    unarchive: "Unarchive",
    delete: "Delete",
    editLabel: (name: string) => `Edit supplier ${name}`,
    archiveLabel: (name: string) => `Archive supplier ${name}`,
    unarchiveLabel: (name: string) => `Unarchive supplier ${name}`,
    deleteLabel: (name: string) => `Delete supplier ${name}`,
    usedHint: "Used by lots or batches, so it can only be archived.",
    deleteTitle: "Delete this supplier?",
    deleteBody: (name: string) =>
      `${name} will be removed from this device. No lot or batch uses it. This cannot be undone.`,
    deleteConfirm: "Delete supplier",
    deleteInUse: "A lot or batch now uses this supplier, so it was not deleted. Archive it instead.",
    deleteFailed: "Could not delete the supplier. Nothing was changed. Try again.",
    addedDone: "Added.",
    savedDone: "Saved.",
    archivedDone: "Archived.",
    unarchivedDone: "Unarchived.",
    deletedDone: "Deleted.",
    fixFirst: "Fix the highlighted fields, then save again.",
    loading: "Loading suppliers…",
    loadFailedTitle: "Could not load your suppliers.",
    loadFailed: "Your data is still on this device. Try again.",
    retry: "Try again",
    saveFailedTitle: "Not saved.",
    saveFailed: "Something went wrong and nothing was changed. Try again.",
    saveInvalid: "The supplier was not saved. Check the name, then try again.",
    saveGone: "This supplier could not be found, so nothing was saved.",
    saveStorageFull:
      "This device is out of space for this site, so the supplier was not saved. Your entries are still in the form. Making a backup and deleting old records frees space.",
    archiveFailed: "Could not change the archived state. Try again.",
  },

  // WRITTEN HERE (v0.3 lots): material lot screen, for owner review.
  lots: {
    title: "Lots",
    description: "The lot codes of the materials you hold. Kept on this device only.",
    addLot: "Add lot",
    addTitle: "Add lot",
    editTitle: "Edit lot",
    empty: {
      title: "No lots yet.",
      description: "Add a lot to record the code and supplier of a material you hold.",
      action: "Add lot",
    },
    materialEmpty: (materialName: string) => `No lots for ${materialName} yet.`,
    materialsLink: "Materials",
    suppliersLink: "Suppliers",
    filterMaterialLabel: "Filter by material",
    filterAllMaterials: "All materials",
    showArchived: "Show archived",
    allArchived: "All your lots are archived.",
    archivedTag: "Archived",
    lotCount: (count: number) => countOf(count, "lot"),
    usedIn: (count: number) => `Used in ${countOf(count, "batch", "batches")}`,
    noSupplier: "No supplier",
    received: (date: string) => `Received ${date}`,
    receivedUnknown: "Received date not recorded",
    materialLabel: "Material",
    materialChoose: "Choose a material…",
    materialFixedHint: "The material cannot be changed after the lot is added.",
    noMaterials: "Add a material before adding a lot.",
    supplierLabel: "Supplier",
    supplierArchivedOption: (name: string) => `${name} (archived)`,
    codeLabel: "Lot code",
    receivedLabel: "Received date (optional)",
    notesLabel: "Notes (optional)",
    materialRequired: "Choose a material.",
    codeRequired: "Enter a lot code.",
    codeTooLong: "Use 60 characters or fewer.",
    codeDuplicate: "This material and supplier already have a lot with this code.",
    receivedInvalid: "Enter a real date.",
    receivedFuture: "The received date cannot be in the future.",
    notesTooLong: "Use 2000 characters or fewer.",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    archive: "Archive",
    unarchive: "Unarchive",
    delete: "Delete",
    editLabel: (code: string) => `Edit lot ${code}`,
    archiveLabel: (code: string) => `Archive lot ${code}`,
    unarchiveLabel: (code: string) => `Unarchive lot ${code}`,
    deleteLabel: (code: string) => `Delete lot ${code}`,
    usedHint: "Used by batches, so it can only be archived.",
    deleteTitle: "Delete this lot?",
    deleteBody: (code: string) =>
      `Lot ${code} will be removed from this device. No batch uses it. This cannot be undone.`,
    deleteConfirm: "Delete lot",
    deleteInUse: "A batch now uses this lot, so it was not deleted. Archive it instead.",
    deleteFailed: "Could not delete the lot. Nothing was changed. Try again.",
    addedDone: "Added.",
    savedDone: "Saved.",
    archivedDone: "Archived.",
    unarchivedDone: "Unarchived.",
    deletedDone: "Deleted.",
    fixFirst: "Fix the highlighted fields, then save again.",
    loading: "Loading lots…",
    loadFailedTitle: "Could not load your lots.",
    loadFailed: "Your data is still on this device. Try again.",
    retry: "Try again",
    saveFailedTitle: "Not saved.",
    saveFailed: "Something went wrong and nothing was changed. Try again.",
    saveInvalid: "The lot was not saved. Check the material, supplier and code, then try again.",
    saveGone: "The lot, material or supplier could not be found, so nothing was saved.",
    saveStorageFull:
      "This device is out of space for this site, so the lot was not saved. Your entries are still in the form. Making a backup and deleting old records frees space.",
    archiveFailed: "Could not change the archived state. Try again.",

    // WRITTEN HERE (v0.3 TrueCandle Cost): what was paid for a lot and what was received.
    amountPaidLabel: "Amount paid in pesos (optional)",
    quantityReceivedLabel: "Quantity received (optional)",
    quantityPiecesLabel: "Quantity received in pieces (optional)",
    quantityUnitLabel: "Unit",
    unitKg: "kg",
    unitG: "g",
    purchaseHint: "Fill in both to see the price per kg or each. Saved cost sheets keep their own copy.",
    paidInvalid: "Enter an amount in pesos, for example 4350.50, using numbers and a period.",
    paidDecimals: "Use 2 decimal places at most.",
    paidRange: "Enter an amount from ₱0.00 to ₱10,000,000.00.",
    paidMissing: "Enter the amount paid, or clear the quantity received.",
    quantityMissing: "Enter the quantity received, or clear the amount paid.",
    quantityInvalid: "Enter a weight above 0 using numbers and a period.",
    quantityKgDecimals: "Use 6 decimal places at most for kg.",
    quantityGDecimals: "Use 3 decimal places at most for g.",
    quantityRange: "Enter a weight above 0 and up to 1,000 kg.",
    quantityPiecesInvalid: "Enter a whole number of pieces from 1 to 1,000,000.",
    /** `text` is the price as shown, e.g. "₱217.50 per kg". */
    priceLine: (text: string) => `Price: ${text}`,
  },

  // WRITTEN HERE (v0.3 TrueCandle Cost): the Packaging and items screen.
  costItems: {
    title: "Packaging and items",
    description: "Labels, boxes and other things you add to a cost sheet. Kept on this device only.",
    materialsLink: "Materials",
    addItem: "Add item",
    addTitle: "Add item",
    editTitle: "Edit item",
    empty: {
      title: "No items yet.",
      description: "Add the labels, boxes and other things you buy for your candles.",
      action: "Add item",
    },
    showArchived: "Show archived",
    allArchived: "All your items are archived.",
    archivedTag: "Archived",
    nameLabel: "Name",
    priceLabel: "Price each in pesos",
    notesLabel: "Notes (optional)",
    nameRequired: "Enter a name.",
    nameTooLong: "Use 60 characters or fewer.",
    nameDuplicate: "You already have an item with this name. Names are not case sensitive.",
    priceRequired: "Enter the price of one.",
    priceInvalid: "Enter an amount in pesos, for example 6.75, using numbers and a period.",
    priceDecimals: "Use 2 decimal places at most.",
    priceRange: "Enter an amount from ₱0.00 to ₱10,000,000.00.",
    notesTooLong: "Use 2,000 characters or fewer.",
    priceNote: "Changing the price never changes saved cost sheets.",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    archive: "Archive",
    unarchive: "Unarchive",
    delete: "Delete",
    editLabel: (name: string) => `Edit item ${name}`,
    archiveLabel: (name: string) => `Archive item ${name}`,
    unarchiveLabel: (name: string) => `Unarchive item ${name}`,
    deleteLabel: (name: string) => `Delete item ${name}`,
    deleteTitle: "Delete this item?",
    /** `sheets` is how many cost sheets have a line picked from the item. */
    deleteBody: (name: string, sheets: number): string =>
      sheets === 0
        ? `${name} will be removed from your list. This cannot be undone.`
        : `${name} will be removed from your list. ${countOf(sheets, "cost sheet")} will keep ${sheets === 1 ? "its" : "their"} own copy. This cannot be undone.`,
    deleteConfirm: "Delete item",
    deleteFailed: "Could not delete the item. Nothing was changed. Try again.",
    addedDone: "Added.",
    savedDone: "Saved.",
    archivedDone: "Archived.",
    unarchivedDone: "Unarchived.",
    deletedDone: "Deleted.",
    fixFirst: "Fix the highlighted fields, then save again.",
    loading: "Loading items…",
    loadFailedTitle: "Could not load your items.",
    loadFailed: "Your data is still on this device. Try again.",
    retry: "Try again",
    saveFailedTitle: "Not saved.",
    saveFailed: "Something went wrong and nothing was changed. Try again.",
    saveGone: "The item could not be found, so nothing was saved.",
    archiveFailed: "Could not change the archived state. Try again.",
  },

  /** Backup and restore (F6, F7). */
  backup: {
    title: "Backup and restore",
    intro:
      "Your formulas are stored in this browser only. Clearing browser data removes them. Keep a backup file somewhere safe.",
    backUpHeading: "Back up",
    restoreHeading: "Restore",
    exportBackup: "Export backup",
    neverBackedUp: {
      title: "No backup yet.",
      action: "Export backup",
    },
    /** Last-backup line. `when` is already formatted, e.g. "3 days ago". */
    lastBackup: (when: string, changesSince: number) =>
      `Last backup: ${when} · ${countOf(changesSince, "change", "changes")} since`,
    /** Draft note on the export. WRITTEN HERE. */
    draftNotIncluded: "An unsaved draft is not included in this backup.",
    /** F6 summary line. `when` is already formatted. */
    exportedLine: (when: string, formulas: number, versions: number) =>
      `Exported ${when} · ${countOf(formulas, "formula", "formulas")} · ${countOf(versions, "version", "versions")}`,
    chooseFile: "Choose backup file",
    chooseAnother: "Choose another file",
    restore: "Restore",
    restoreFromBackup: "Restore from backup",
    /** Preview lines. */
    previewAdd: (counts: BackupCounts) => {
      const list = countsList(counts);
      return list.length === 0
        ? "Nothing new to add."
        : `Will add ${joinList(list)}`;
    },
    previewAlreadyHere: (counts: BackupCounts) => {
      const list = countsList(counts);
      return list.length === 0 ? "" : `Already here: ${joinList(list)}`;
    },
    previewConflicts: (counts: BackupCounts) => {
      const list = countsList(counts);
      return list.length === 0 ? "" : `Conflicts: ${joinList(list)}`;
    },
    addToWhatsHere: "Add to what's here",
    replaceEverything: "Replace everything on this device",
    keepDeviceCopy: "Keep this device's copy",
    useBackupCopy: "Use the backup's copy",
    /** Replace confirmation. WRITTEN HERE, except "safety backup" (F7 step 5, DATA-23). */
    // WRITTEN HERE (v0.2 integration QA): names everything Replace removes.
    // Suppliers and lots added: WRITTEN HERE (v0.3 lots).
    // Investigations, their photos and corrective experiments added: WRITTEN HERE (v0.3 CandleFix).
    // Packaging items and cost sheets added: WRITTEN HERE (v0.3 TrueCandle Cost).
    replaceWarning:
      "This removes every formula, version, material, measurement, batch, cure plan, planned production entry, burn test, burn test photo, supplier, lot, investigation, investigation photo, corrective experiment, packaging item and cost sheet on this device and writes the backup in their place. A safety backup of current data downloads first.",
    typeReplace: "Type REPLACE to confirm.",
    dontCloseTab: "Don't close this tab.",
    openSaved: "Open saved formulas",

    // ── Added in T22. All wording WRITTEN HERE; the specs give none. ──
    cancel: "Cancel",
    loadingStatus: "Reading what is saved on this device…",
    exportFailed:
      "Nothing was exported. Try again. If it keeps failing, check that this browser can store data.",
    exporting: "Exporting…",
    cantRestoreTitle: "This file can't be restored",
    nothingChanged: "Nothing on this device was changed.",
    checking: "Checking the file…",
    modeLegend: "What to do with this backup",
    policyLegend: "When an item exists in both places but differs",
    previewReplace: (counts: BackupCounts) => {
      const list = countsList(counts);
      return list.length === 0
        ? "Will leave this device empty."
        : `Will replace everything on this device with ${joinList(list)}`;
    },
    previewVersionConflicts: (n: number) =>
      `${countOf(n, "version")} in the file differ${n === 1 ? "s" : ""} from the copy on this device. Versions are never overwritten, so this device's ${n === 1 ? "copy stays" : "copies stay"}.`,
    previewRenumbered: (n: number) =>
      `${countOf(n, "version")} will get a new number because ${n === 1 ? "its number is" : "their numbers are"} already used on this device.`,
    previewMissingMaterials: (n: number) =>
      `${countOf(n, "material")} used by these versions ${n === 1 ? "is" : "are"} not in the library. Saved versions keep their own copy of the material details, so nothing is lost.`,
    // WRITTEN HERE (v0.2 integration QA)
    previewBurnDatesBeforeBatch: (n: number) =>
      `${countOf(n, "burn test")} will be dated before ${n === 1 ? "its batch's" : "their batches'"} production date. Check ${n === 1 ? "that date" : "those dates"} after restoring.`,
    // WRITTEN HERE (v0.2 integration QA)
    previewSharedPlannedTests: (n: number) =>
      `${countOf(n, "planned burn test")} will be linked to more than one burn test. Open those burn tests to choose which one stays linked.`,
    replaceTitle: "Replace everything on this device?",
    replaceAffects: (counts: BackupCounts) => {
      const list = countsList(counts);
      return list.length === 0
        ? "Nothing is saved on this device right now."
        : `This device currently holds ${joinList(list)}. All of it will be removed.`;
    },
    replaceBeforeNote:
      "Keep the file that downloads first until you have checked the result.",
    replaceConfirm: "Replace everything",
    replaceNeedsWord: "Type REPLACE in capital letters to continue.",
    restoring: "Restoring…",
    resultTitle: "Restore finished.",
    replacedSentence: (counts: BackupCounts) => {
      const list = countsList(counts);
      return list.length === 0 ? "" : `Used the backup's copy of ${joinList(list)}.`;
    },
    renumberedSentence: (formulaName: string, from: number, to: number) =>
      `Version ${from} of ${formulaName} is now version ${to}.`,
    renumberedMany: (n: number) =>
      `${countOf(n, "version")} got a new number because the old number was already used on this device.`,
    replaceSummary: (fileName: string, counts: BackupCounts) => {
      const list = countsList(counts);
      return list.length === 0
        ? `Replaced everything with the contents of ${fileName}: the file held no records, so this device is now empty.`
        : `Replaced everything with the contents of ${fileName}: ${joinList(list)}.`;
    },
    safetyExportFailed:
      "The backup made before replacing could not be downloaded, so nothing was replaced. Try again.",
    failTitle: "The restore did not finish.",
    failBusy:
      "A restore is already running in this tab. Wait for it to finish, then try again.",
    failStale:
      "Your saved data changed after the preview. Nothing was changed. Check the file again to see what will happen now.",
    failStorage:
      "This browser could not save the restore, so nothing was changed. Try again, or free up some browser storage first.",
    failMismatch:
      "The restore finished, but the records on this device do not add up to what the file holds. Do not rely on this device's data yet. The backup file still holds your data. Restore it again to fix this.",
    failMismatchReplace:
      "The restore finished, but the records on this device do not add up to what the file holds. Do not rely on this device's data yet. The backup file and the file that downloaded first still hold your data. Restore again to fix this.",
    failNoSafety:
      "Something went wrong inside the app, and nothing was changed. Please try again, and report it if it keeps happening.",
    recheck: "Check the file again",

    // ── WRITTEN HERE (restore integrity): a restore that would leave records
    // linked to something missing or wrong. ──
    integrityTitle: "This file can't be restored this way.",
    integrityPreview: (mode: RestoreMode, problems: readonly IntegrityProblem[]) => {
      const n = problems.length;
      const first = integrityProblemText(problems[0]!);
      return mode === "replace"
        ? `"Replace everything" keeps only what is in this file, and ${countOf(n, "record")} in it would be left linked to something missing or wrong (first: ${first}). Choose "Add to what's here", or use a full backup.`
        : `Adding this file would leave ${countOf(n, "record")} linked to something missing or wrong (first: ${first}). Nothing can be restored from it this way.`;
    },
    failIntegrity: (problems: readonly IntegrityProblem[]) => {
      const n = problems.length;
      const first = problems[0] ? ` (first: ${integrityProblemText(problems[0])})` : "";
      return `The restore stopped before changing anything: ${countOf(n, "record")} would have been left linked to something missing or wrong${first}. Nothing on this device was changed. Check the file again to see what will happen now.`;
    },
  },

  /**
   * Burn test CSV column headers and soot level names. WRITTEN HERE (v0.2 BurnMatrix)
   * for owner review.
   */
  burnCsv: {
    testDate: "Test date",
    session: "Session",
    batch: "Batch",
    formula: "Formula",
    version: "Version",
    candle: "Candle",
    wick: "Wick",
    burn: "Burn",
    durationMin: "Duration (min)",
    weightBeforeG: "Weight before (g)",
    weightAfterG: "Weight after (g)",
    weightLossG: "Weight loss (g)",
    rateGPerHour: "Rate (g/h)",
    meltPoolDiameterMm: "Melt pool diameter (mm)",
    meltPoolDepthMm: "Melt pool depth (mm)",
    flameHeightMm: "Flame height (mm)",
    soot: "Soot",
    burnNotes: "Burn notes",
    coldThrow: "Cold throw",
    hotThrow: "Hot throw",
    candleNotes: "Candle notes",
    // WRITTEN HERE (v0.2 integration QA)
    conclusion: "Maker's conclusion",
    sootNone: "None seen",
    sootLight: "Light",
    sootModerate: "Moderate",
    sootHeavy: "Heavy",
  },

  // WRITTEN HERE (v0.3 lots): batch CSV headers.
  batchCsv: {
    batch: "Batch",
    batchId: "Batch ID",
    productionDate: "Production date",
    formula: "Formula",
    version: "Version",
    component: "Component",
    material: "Material",
    plannedG: "Planned (g)",
    measuredG: "Measured (g)",
    lotCode: "Lot code",
    supplier: "Supplier",
    lotReceived: "Lot received",
    curePlan: "Cure plan",
    burnTests: "Burn tests",
    componentWax: "Wax",
    componentOil: "Fragrance oil",
    componentWick: "Wick",
    componentVessel: "Vessel",
    yes: "Yes",
    no: "No",
  },

  /** Photos of a burn session (v0.2 BurnMatrix). WRITTEN HERE (v0.2 BurnMatrix): for owner review. */
  burnPhotos: {
    heading: "Photos",
    count: (n: number, max: number) => `${n} of ${max}`,
    empty: "No photos yet. Add photos of the burn, such as the melt pool, the flame or the soot.",
    addButton: "Add photos",
    limitReached: (max: number) =>
      `This test has ${max} photos, which is the most it can hold. Delete a photo to add another.`,
    limitStopped: (added: number, max: number) =>
      `Added ${countOf(added, "photo")}. The test now has ${max} photos, the most it can hold, so the rest were not added.`,
    progress: (n: number, total: number) => `Adding photo ${n} of ${total}…`,
    addedSummary: (n: number) => `Added ${countOf(n, "photo")}.`,
    photoAlt: (n: number, total: number) => `Photo ${n} of ${total}`,
    openPhoto: (n: number, total: number) => `Open photo ${n} of ${total}`,
    loadError: "The photos could not be loaded from this device.",
    viewTitle: (n: number, total: number) => `Photo ${n} of ${total}`,
    close: "Close",
    delete: "Delete photo",
    deleteTitle: "Delete this photo?",
    deleteBody: "The photo is removed from this device. This cannot be undone.",
    deleteConfirm: "Delete photo",
    deleteCancel: "Keep photo",
    deleteError: "The photo could not be deleted. Nothing was changed. Please try again.",
    deleteGone: "That photo was already deleted.",
    privacyNote:
      "Photos are shrunk to fit and saved as JPEG on this device. Location and camera details in the photo are not kept.",
    storageUsage: (used: string, quota: string) =>
      `This site uses ${used} of about ${quota} available on this device.`,
    errorNotImage: (name: string) => `${name} is not an image, so it was not added.`,
    errorTooLarge: (name: string) =>
      `${name} is larger than 40 MB, so it was not added. Choose a smaller photo.`,
    errorTooBig: (name: string) =>
      `${name} is still too big after shrinking, so it was not added. Try a different photo.`,
    errorUnsupported:
      "This browser cannot turn photos into JPEG files, so the photo was not added. Try another browser.",
    errorStorageFull:
      "This device is out of space for this site, so the photo was not added. Nothing else was lost. Deleting photos or old burn tests after making a backup frees space.",
    errorLimit: (max: number) =>
      `This test already has ${max} photos, the most it can hold, so the photo was not added.`,
    errorStorage:
      "The photo could not be saved on this device, so it was not added. Nothing else was changed. Please try again.",
    errorNotFound: "This burn test could not be found, so the photo was not added.",
  },

  /**
   * Burn test list, comparison, printable report and backup size (v0.2 BurnMatrix).
   * WRITTEN HERE (v0.2 BurnMatrix): for owner review. Observations only: no verdicts.
   */
  burnCompare: {
    // Shared
    separator: " · ",
    notRecorded: "Not recorded",
    tryAgain: "Try again",
    batchesLink: "Burn tests",
    candleCount: (n: number) => countOf(n, "candle"),
    photoCount: (n: number) => countOf(n, "photo"),
    versionText: (version: number) => `version ${version}`,
    sessionFallbackTitle: (date: string) => `Burn test on ${date}`,
    batchFallbackTitle: (idStart: string) => `Batch ${idStart}`,
    formulaArchivedBadge: "Formula archived",
    makerConclusion: "Conclusion, in the maker's own words",
    noConclusion: "No conclusion written.",
    // List (/burn-tests)
    listTitle: "Burn tests",
    listDescription: "Every burn test you have recorded, newest first. Choose up to 4 to compare side by side.",
    listLoading: "Loading burn tests…",
    listLoadFailedTitle: "Burn tests could not be loaded.",
    listLoadFailed: "Your data is still on this device. Try again.",
    listEmptyTitle: "No burn tests yet",
    listEmptyDescription:
      "A burn test is a dated record of candles burned from one batch. Open a batch and choose Record burn test.",
    listEmptyAction: "Go to batches",
    listGroupLabel: "Burn tests to compare",
    selectLabel: (title: string) => `Select ${title} to compare`,
    selectedCount: (n: number, max: number) => `${n} of ${max} selected`,
    selectionFull: (max: number) => `You can compare up to ${max} burn tests. Clear one to choose another.`,
    compareButton: "Compare",
    clearSelection: "Clear selection",
    // Comparison (/burn-tests/compare)
    compareTitle: "Compare burn tests",
    compareDescription: "Figures and observations as recorded, side by side. Nothing is ranked or marked.",
    compareLoading: "Loading the comparison…",
    compareLoadFailedTitle: "The comparison could not be loaded.",
    compareLoadFailed: "Your data is still on this device. Try again.",
    compareNoneTitle: "No burn tests chosen",
    compareNoneBody: "Choose one to four burn tests from the list to compare them.",
    compareNotFoundTitle: "Burn tests not found",
    compareNotFoundBody: "None of the chosen burn tests could be found. They may have been deleted.",
    compareSomeMissing: (ids: string[]) =>
      `${countOf(ids.length, "burn test")} could not be found and ${ids.length === 1 ? "is" : "are"} left out: ${ids.join(", ")}.`,
    compareTruncated: (max: number) => `Only the first ${max} burn tests are shown.`,
    tableCaption: "Burn test comparison. This table scrolls sideways when it is wider than the screen.",
    sessionColumn: "Burn test",
    candleColumn: "Candle",
    rowWick: "Wick",
    rowBurnCount: "Burns",
    rowTotalTime: "Total burn time",
    rowTotalLoss: "Total weight loss",
    rowAverageRate: "Average rate",
    rowLastMeltPoolDiameter: "Melt pool diameter, last recorded",
    rowMaxMeltPoolDepth: "Melt pool depth, largest recorded",
    rowMaxFlameHeight: "Flame height, largest recorded",
    rowSoot: "Soot seen",
    rowColdThrow: "Cold throw",
    rowHotThrow: "Hot throw",
    sootNone: "None",
    sootLight: "Light",
    sootModerate: "Moderate",
    sootHeavy: "Heavy",
    actionReport: "Report",
    actionDownloadCsv: "Download CSV",
    actionChangeSelection: "Change selection",
    csvFailed: "The CSV could not be downloaded. Please try again.",
    // Report
    reportSessionTitle: "Burn test report",
    reportCompareTitle: "Burn test comparison report",
    reportLoading: "Loading the report…",
    reportLoadFailedTitle: "The report could not be loaded.",
    reportLoadFailed: "Your data is still on this device. Try again.",
    reportNotFoundTitle: "Burn test not found",
    reportNotFoundBody: "This burn test could not be found. It may have been deleted.",
    reportGenerated: (date: string) => `Generated ${date}`,
    reportObservationsNote:
      "These are the maker's own observations. CandleLab Studio does not certify or rate candles.",
    reportPrint: "Print or save as PDF",
    reportBack: "Back",
    reportSessionHeading: (n: number, total: number) => `Burn test ${n} of ${total}`,
    reportDetails: "Details",
    reportTestDate: "Test date",
    reportBatch: "Batch",
    reportFormula: "Formula",
    reportCandlesHeading: "Candles",
    reportCandleHeading: (n: number, label: string) => `Candle ${n}: ${label}`,
    reportBurnsCaption: (label: string) => `Burns of ${label}`,
    reportNoBurns: "No burns recorded for this candle.",
    reportColNumber: "Burn",
    reportColDuration: "Duration",
    reportColBefore: "Weight before",
    reportColAfter: "Weight after",
    reportColLoss: "Loss",
    reportColRate: "Rate",
    reportColMeltPool: "Melt pool (diameter / depth)",
    reportColFlame: "Flame",
    reportColSoot: "Soot",
    reportColNotes: "Notes",
    reportTotals: "Totals for this candle",
    reportThrowNotes: "Throw notes",
    reportCandleNotes: "Candle notes",
    reportNotes: "Notes",
    reportPhotos: "Photos",
    reportComparisonHeading: "Comparison",
    // Backup page: file size
    backupFileSize: (size: string) => `Backup file: ${size}`,
    backupDevicePhotos: (count: number, size: string) =>
      count === 0 ? "Photos on this device: none." : `Photos on this device: ${countOf(count, "photo")}, ${size}.`,
    backupTooLarge: (size: string, max: string) =>
      `This file is ${size}, which is larger than the ${max} this app can restore. It was downloaded, but this app cannot restore a file that large.`,
  },

  /**
   * Burn test screens: the batch page section, the session editor and the
   * session page (v0.2 BurnMatrix). WRITTEN HERE (v0.2 BurnMatrix): for owner
   * review. Observations only: no verdicts, no ranking.
   */
  burn: {
    // Batch page section
    sectionHeading: "Burn tests",
    sectionEmpty:
      "No burn tests yet. Record one to keep what you saw when you burned candles from this batch.",
    sectionLoading: "Loading burn tests…",
    sectionLoadFailed: "The burn tests could not be loaded. Your data is still on this device.",
    tryAgain: "Try again",
    recordButton: "Record burn test",
    compareAll: "Compare burn tests",
    compareLatest: (n: number) => `Compare latest ${n}`,
    rowCandles: (n: number) => countOf(n, "candle"),
    rowPhotos: (n: number) => countOf(n, "photo"),
    rowPlanned: (name: string) => `Planned test: ${name}`,
    /** Used when a session has no label: "Burn test, Nov 18, 2026". */
    defaultTitle: (date: string) => `Burn test, ${date}`,

    // Editor, shared
    newTitle: "Record burn test",
    editTitle: "Edit burn test",
    newDescription: (batch: string, producedOn: string) =>
      `For ${batch}, produced ${producedOn}.`,
    editDescription: (batch: string) => `On ${batch}.`,
    editorLoading: "Loading…",
    editorLoadFailed: "The burn test could not be loaded. Your data is still on this device.",
    notFoundTitle: "Burn test not found",
    notFoundBody:
      "It may have been deleted, or the link may be wrong. Your other burn tests are not affected.",
    backToBatch: "Back to the batch",
    backToBatches: "Back to batches",
    batchMissingTitle: "Batch not found",
    batchMissingBody:
      "A burn test belongs to one batch. This batch may have been deleted, or the link may be wrong.",
    cancel: "Cancel",

    // Editor: test details
    dateLabel: "Test date",
    labelLabel: "Label (optional)",
    labelHint: "Your own name for this test, up to 60 characters.",
    errDateRequired: "Enter the test date.",
    errDateInvalid: "Enter a real date.",
    errDateFuture: "The test date cannot be in the future.",
    errDateBeforeProduced: (date: string) =>
      `The test date cannot be before the batch was produced (${date}).`,
    errLabelTooLong: (max: number) => `Use at most ${max} characters.`,
    plannedLabel: "Planned burn test (optional)",
    plannedNone: "Not linked to a planned test",
    plannedHint: "Linking marks that planned test as done on the test date.",
    plannedNoOptions: "This batch has no planned burn tests.",
    plannedOption: (name: string, due: string) => `${name}, due ${due}`,
    plannedOptionTaken: (name: string, due: string) =>
      `${name}, due ${due} (linked to another burn test)`,

    // Editor: candles
    candlesHeading: "Candles",
    candlesHint: "Up to 8 candles can burn side by side in one test.",
    candleHeading: (n: number) => `Candle ${n}`,
    defaultCandleLabel: (n: number) => `Candle ${n}`,
    addCandle: "Add candle",
    candleLimit: (max: number) => `A test can hold ${max} candles, which is the most.`,
    removeCandle: "Remove candle",
    removeCandleFor: (n: number) => `Remove candle ${n}`,
    candleGroup: (n: number) => `Candle ${n}`,
    candleLabelLabel: "Candle label",
    errCandleLabelRequired: "Give this candle a label, for example Candle 1.",
    errCandleLabelTooLong: (max: number) => `Use at most ${max} characters.`,
    wickLabel: "Wick",
    wickChoose: "Choose a wick",
    wickOwn: "Type a wick name instead",
    wickArchived: (name: string) => `${name} (archived)`,
    wickTextLabel: "Wick name",
    wickTextHint: "For example the wick type and size.",
    errWickRequired: "Choose a wick from the library, or type its name.",
    errWickTooLong: (max: number) => `Use at most ${max} characters.`,
    coldThrowLabel: "Cold throw (optional)",
    hotThrowLabel: "Hot throw (optional)",
    candleNotesLabel: "Candle notes (optional)",
    throwHint: "In your own words.",
    errTextTooLong: (max: number) => `Use at most ${max} characters.`,

    // Editor: burns
    burnsHeading: "Burns",
    burnsHint: "Record each burn of this candle, in the order they happened. Up to 40.",
    burnsNone: "No burns recorded for this candle.",
    burnHeading: (n: number) => `Burn ${n}`,
    burnGroup: (candle: number, burn: number) => `Candle ${candle}, burn ${burn}`,
    addBurn: "Add burn",
    burnLimit: (max: number) => `This candle has ${max} burns, which is the most it can hold.`,
    removeBurn: "Remove burn",
    removeBurnFor: (candle: number, burn: number) => `Remove burn ${burn} of candle ${candle}`,
    durationLabel: "Duration (minutes)",
    errDurationRequired: "Enter how many minutes it burned.",
    errDurationWhole: "Enter whole minutes, for example 120.",
    errDurationRange: (max: number) => `Enter 1 to ${max} minutes.`,
    weightBeforeLabel: "Weight before (g)",
    weightAfterLabel: "Weight after (g)",
    errWeightFormat:
      "Use numbers only, with a period for decimals (for example 123.45). No commas.",
    errWeightDecimals: "Use at most 2 decimals.",
    errWeightBeforeZero: "Enter a weight above 0 g.",
    errWeightTooLarge: "That weight is too large.",
    errWeightAfterAbove: "The weight after cannot be above the weight before.",
    meltDiameterLabel: "Melt pool diameter (mm)",
    meltDepthLabel: "Melt pool depth (mm)",
    flameLabel: "Flame height (mm)",
    errMmWhole: "Enter whole millimetres, for example 55.",
    errMmRange: (max: number) => `Enter 0 to ${max} mm.`,
    sootLabel: "Soot seen",
    sootNotRecorded: "Not recorded",
    soot: {
      none: "None seen",
      light: "Light",
      moderate: "Moderate",
      heavy: "Heavy",
    },
    burnNotesLabel: "Burn notes (optional)",
    optionalHint: "Leave blank when not recorded.",

    // Editor: conclusion, notes, photos, save
    closingHeading: "Your conclusion and notes",
    conclusionLabel: "Your conclusion (optional)",
    conclusionHint: "In your own words. The app does not rate or judge a burn.",
    notesLabel: "Notes (optional)",
    photosAfterSave: "Photos can be added after you save this burn test.",
    save: "Save burn test",
    saving: "Saving burn test",
    saveChanges: "Save changes",
    savingChanges: "Saving changes",
    errCheckFields: "Some entries need fixing. They are marked below.",
    saveFailed: "The burn test was not saved. Your entries are still in the form. Try again.",
    saveInvalid:
      "The burn test was not saved because the planned test or a wick it refers to has changed. Check them, then save again.",
    saveBatchGone: "The batch for this burn test could not be found, so nothing was saved.",
    saveStorageFull:
      "This device is out of space for this site, so the burn test was not saved. Your entries are still in the form. Deleting photos or old burn tests after making a backup frees space.",
    saveGone: "This burn test was deleted, so the changes were not saved.",
    retry: "Try again",
    savedNotice: "Burn test saved",

    // Session page
    pageLoading: "Loading burn test…",
    pageLoadingTitle: "Burn test",
    onBatch: "Batch",
    separator: " · ",
    versionText: (n: number) => `version ${n}`,
    plannedHeading: "Planned test",
    plannedLine: (name: string, due: string) => `${name}, due ${due}`,
    plannedDoneOn: (date: string) => `Marked done on ${date}.`,
    plannedNotDone: "Not marked done.",
    notLinked: "Not linked to a planned test.",
    candlesSectionHeading: "Candles",
    wickLine: (name: string) => `Wick: ${name}`,
    columnBurn: "Burn",
    columnTime: "Time",
    columnBefore: "Before",
    columnAfter: "After",
    columnLoss: "Loss",
    columnRate: "Rate",
    columnMelt: "Melt pool",
    columnFlame: "Flame",
    columnSoot: "Soot",
    columnNotes: "Notes",
    notRecorded: "Not recorded",
    meltCell: (diameter: string | null, depth: string | null) =>
      [diameter ? `${diameter} wide` : null, depth ? `${depth} deep` : null]
        .filter(Boolean)
        .join(", "),
    totalsHeading: "Totals for this candle",
    totalBurns: (n: number) => `Burns: ${n}`,
    totalTime: (text: string) => `Time burned: ${text}`,
    totalLoss: (text: string) => `Weight lost: ${text}`,
    averageRate: (text: string) => `Average rate: ${text}`,
    totalsNote: "Weight lost and rate use only the burns with both weights recorded.",
    lastMelt: (text: string) => `Last melt pool diameter: ${text}`,
    maxDepth: (text: string) => `Deepest melt pool: ${text}`,
    maxFlame: (text: string) => `Tallest flame: ${text}`,
    sootSeen: (text: string) => `Soot seen: ${text}`,
    coldThrowHeading: "Cold throw",
    hotThrowHeading: "Hot throw",
    candleNotesHeading: "Candle notes",
    conclusionHeading: "Your conclusion",
    notesHeading: "Notes",
    edit: "Edit",
    report: "Report",
    downloadCsv: "Download CSV",
    csvFailed: "The CSV could not be downloaded. Please try again.",
    delete: "Delete",
    pageActionsGroup: "Burn test actions",

    // Delete burn test
    deleteTitle: "Delete this burn test?",
    deleteBody: (title: string) =>
      `${title} and everything recorded in it will be removed from this device. This cannot be undone.`,
    deletePhotos: (n: number) =>
      `Its ${countOf(n, "photo")} will be deleted too.`,
    deletePlannedNote: "A planned test linked to it stays marked as it is.",
    deleteChecking: "Checking what goes with it…",
    deleteKeep: "Keep burn test",
    deleteConfirm: "Delete burn test",
    deleteFailed: "The burn test was not deleted. Nothing was changed. Please try again.",

    // Delete batch with burn tests
    batchDeleteBlocked: (n: number) =>
      `This batch has ${countOf(n, "burn test")}. A batch cannot be deleted until its burn tests are deleted. Open each burn test and delete it first.`,
    batchDeleteInUse:
      "The batch was not deleted because it still has burn tests. Delete them first, then try again.",
    // WRITTEN HERE (v0.3 CandleFix): a burn test listed by a corrective experiment.
    deleteBlockedByExperiments: (n: number) =>
      `This burn test is listed by ${countOf(n, "corrective experiment")}, so it cannot be deleted. Remove it from the experiment first, then delete it here.`,
    deleteInUseExperiment:
      "The burn test was not deleted because a corrective experiment lists it. Remove it from the experiment first, then try again.",
  },

  // WRITTEN HERE (v0.3 CandleFix): built-in things to check, for owner review.
  // Prompts to look at or recall. They never state a cause, a fix or a verdict.
  candleFixChecks: {
    frosting: {
      "pour-temperature": "Pour temperature as recorded on the batch",
      "container-temperature": "Was the container warm or cold when poured?",
      "room-conditions": "Room temperature and draughts while the wax set",
      "fragrance-amount": "Fragrance amount as recorded on the batch",
      "cooling-method": "How the candle cooled after pouring",
      "cure-time": "Days between pouring and the first look at the surface",
    },
    tunneling: {
      "first-burn-length": "Length of the first burn",
      "wick-size": "Wick size against the container width",
      "melt-pool-edge": "Did the melt pool reach the container wall during the burn?",
      "burn-length-each-time": "Length of each later burn",
      "wick-trimming": "Wick length before lighting",
      "room-conditions": "Room temperature and draughts while burning",
    },
    sinkhole: {
      "pour-temperature": "Pour temperature as recorded on the batch",
      "pour-count": "Number of pours used for this candle",
      "cooling-method": "How the candle cooled after pouring",
      "container-temperature": "Was the container warm or cold when poured?",
      "wax-amount": "Wax amount as recorded on the batch",
      "room-conditions": "Room temperature while the wax set",
    },
    soot: {
      "wick-size": "Wick size against the container width",
      "wick-trimming": "Wick length before lighting",
      "flame-height": "Flame height as recorded during the burn",
      "burn-length": "Length of the burn when the soot was seen",
      "fragrance-amount": "Fragrance amount as recorded on the batch",
      "room-conditions": "Draughts or moving air near the flame",
    },
    weakColdThrow: {
      "fragrance-amount": "Fragrance amount as recorded on the batch",
      "fragrance-add-temperature": "Temperature when the fragrance was added",
      "stir-time": "How long the fragrance was stirred in",
      "cure-time": "Days between pouring and the sniff test",
      "sniff-conditions": "Where and how the candle was smelled",
      "lid-or-storage": "Whether the candle was covered while it rested",
    },
    weakHotThrow: {
      "fragrance-amount": "Fragrance amount as recorded on the batch",
      "fragrance-add-temperature": "Temperature when the fragrance was added",
      "melt-pool-size": "Melt pool size during the burn",
      "burn-length": "Length of the burn when the scent was noted",
      "wick-size": "Wick size against the container width",
      "room-size": "Size and airflow of the room where it burned",
      "cure-time": "Days between pouring and the first burn",
    },
    wetSpots: {
      "container-temperature": "Was the container warm or cold when poured?",
      "container-surface": "Container material and how it was cleaned",
      "pour-temperature": "Pour temperature as recorded on the batch",
      "room-conditions": "Room temperature while the wax set",
      "cooling-method": "How the candle cooled after pouring",
    },
    cracking: {
      "pour-temperature": "Pour temperature as recorded on the batch",
      "cooling-method": "How the candle cooled after pouring",
      "room-conditions": "Room temperature while the wax set",
      "wax-blend": "Wax types and amounts as recorded on the formula",
      "container-temperature": "Was the container warm or cold when poured?",
    },
    mushrooming: {
      "wick-size": "Wick size against the container width",
      "wick-trimming": "Wick length before lighting",
      "burn-length": "Length of the burn when the wick tip was seen",
      "flame-height": "Flame height as recorded during the burn",
      "fragrance-amount": "Fragrance amount as recorded on the batch",
    },
    other: {
      "recorded-amounts": "Wax, fragrance and wick as recorded on the batch",
      temperatures: "Temperatures written down for this batch",
      container: "Container material, size and shape",
      "cure-time": "Days between pouring and the day it was observed",
      "burn-length": "Length of any burns before it was noticed",
      "room-conditions": "Room temperature and draughts",
    },
  },

  /**
   * v0.3 CandleFix: investigations of a batch. WRITTEN HERE (v0.3 CandleFix),
   * for owner review. Observations, things to check and the maker's own
   * hypotheses only: nothing names a cause, a fix or a verdict.
   */
  candleFix: {
    /** The fixed list of issues a maker can record (FIX_ISSUES). */
    issueLabels: {
      frosting: "Frosting",
      tunneling: "Tunneling",
      sinkhole: "Sinkhole",
      soot: "Soot",
      weakColdThrow: "Weak cold throw",
      weakHotThrow: "Weak hot throw",
      wetSpots: "Wet spots",
      cracking: "Cracking",
      mushrooming: "Mushrooming",
      other: "Other",
    },
    /** A hypothesis's status, set by the maker. Neutral words only. */
    hypothesisStatus: {
      open: "Not tested yet",
      testing: "Being tested",
      fits: "Follow-up observations fit it",
      doesNotFit: "Follow-up observations don't fit it",
      setAside: "Set aside",
    },
    /** The label every hypothesis carries. */
    hypothesisLabel: "Hypothesis",

    // ── WRITTEN HERE (v0.3 CandleFix, 4a): investigation section, editor and page ──
    // Batch page section
    sectionHeading: "Investigations",
    sectionLoading: "Loading investigations…",
    sectionLoadFailed: "The investigations could not be loaded. Your data is still on this device.",
    sectionEmpty:
      "No investigations yet. Record an issue you saw on this batch, such as frosting or tunneling, to keep your observations, things to check and ideas in one place.",
    tryAgain: "Try again",
    recordButton: "Record an issue",
    archivedBadge: "Archived",
    rowObserved: (date: string) => `Observed ${date}`,
    rowPhotos: (n: number) => countOf(n, "photo"),
    rowExperiments: (n: number) => countOf(n, "corrective experiment"),
    followUpHeading: "Follow-up batch for",
    followUpLink: (investigation: string, batch: string) => `${investigation}, on ${batch}`,

    // Editor, shared
    newTitle: "Record an issue",
    editTitle: "Edit investigation",
    newDescription: (batch: string, producedOn: string) =>
      `On ${batch}, produced ${producedOn}.`,
    editDescription: (batch: string) => `On ${batch}.`,
    editorLoading: "Loading…",
    editorLoadFailed: "The investigation could not be loaded. Your data is still on this device.",
    notFoundTitle: "Investigation not found",
    notFoundBody:
      "It may have been deleted, or the link may be wrong. Your batches and burn tests are not affected.",
    batchMissingTitle: "Batch not found",
    batchMissingBody:
      "An investigation belongs to one batch. This batch may have been deleted, or the link may be wrong.",
    backToBatches: "Back to batches",
    cancel: "Cancel",

    // Editor: what you saw
    dateLabel: "Date observed",
    errDateRequired: "Enter the date you observed it.",
    errDateInvalid: "Enter a real date.",
    errDateFuture: "The date observed cannot be in the future.",
    errDateBeforeProduced: (date: string) =>
      `The date observed cannot be before the batch was produced (${date}).`,
    titleLabel: "Title (optional)",
    titleHint: "Your own name for this investigation, up to 60 characters.",
    errTitleTooLong: (max: number) => `Use at most ${max} characters.`,
    issuesLegend: "What did you see?",
    issuesHint: "Choose every issue you saw. At least one.",
    errIssuesRequired: "Choose at least one issue.",
    otherLabel: "Describe the other issue",
    errOtherRequired: "Describe the other issue you saw.",
    errOtherTooLong: (max: number) => `Use at most ${max} characters.`,
    notesLabel: "Observation notes (optional)",
    notesHint: "What you saw, in your own words.",
    errNotesTooLong: (max: number) => `Use at most ${max} characters.`,

    // Editor: things to check
    checksHeading: "Things to check",
    checksIntro:
      "Questions to look at, listed for the issues you chose. Tick the ones you looked at and add a note if you like. They are prompts, not answers.",
    checksNone: "Choose an issue above to see its things to check.",
    checkGroup: (issue: string) => `Things to check for ${issue}`,
    checkNoteLabel: (item: string) => `Note on: ${item}`,
    errCheckNoteTooLong: (max: number) => `Use at most ${max} characters.`,
    noLongerListedHeading: "From issues no longer listed",
    noLongerListedHint:
      "These were saved earlier and stay in the record, unchanged. Choose their issue again to edit them.",

    // Editor: hypotheses
    hypothesesHeading: "Hypotheses (your ideas to test)",
    hypothesesHint:
      "Your own ideas, in your own words. They are kept apart from what you observed and are not checked by the app.",
    hypothesesNone: "No hypotheses yet.",
    addHypothesis: "Add hypothesis",
    hypothesisLimit: (max: number) =>
      `This investigation has ${max} hypotheses, which is the most it can hold.`,
    hypothesisHeading: (n: number) => `Hypothesis ${n}`,
    hypothesisTextLabel: "Your hypothesis",
    hypothesisTextHint: "For example: the container was cold when I poured.",
    hypothesisStatusLabel: "Status",
    hypothesisNotesLabel: "Notes (optional)",
    removeHypothesis: "Remove hypothesis",
    removeHypothesisFor: (n: number) => `Remove hypothesis ${n}`,
    errHypothesisRequired: "Write your hypothesis, or remove it.",
    errHypothesisTooLong: (max: number) => `Use at most ${max} characters.`,
    errHypothesisNotesTooLong: (max: number) => `Use at most ${max} characters.`,
    errHypothesisInUse: (n: number, text: string) =>
      `Hypothesis ${n} (${text}) has a corrective experiment, so it cannot be removed. Delete that experiment first, or keep the hypothesis.`,

    // Editor: save
    save: "Save investigation",
    saving: "Saving investigation",
    saveChanges: "Save changes",
    savingChanges: "Saving changes",
    errCheckFields: "Some entries need attention. They are marked below.",
    saveFailed: "The investigation was not saved. Your entries are still in the form. Try again.",
    saveInvalid:
      "The investigation was not saved because something in it is not accepted, for example the date. Check your entries, then save again.",
    saveBatchGone: "The batch for this investigation could not be found, so nothing was saved.",
    saveGone: "This investigation was deleted, so the changes were not saved.",
    saveStorageFull:
      "This device is out of space for this site, so the investigation was not saved. Your entries are still in the form. Deleting photos or old burn tests after making a backup frees space.",
    photosAfterSave: "Photos can be added after you save this investigation.",
    retry: "Try again",
    savedNotice: "Saved",

    // Investigation page
    pageLoading: "Loading investigation…",
    pageLoadingTitle: "Investigation",
    onBatch: "Batch",
    separator: " · ",
    versionText: (n: number) => `version ${n}`,
    edit: "Edit",
    archive: "Archive",
    unarchive: "Unarchive",
    archiveFailed:
      "The investigation could not be archived or unarchived. Nothing was changed. Try again.",
    delete: "Delete",
    observedHeading: "What you observed",
    observedIssues: "Issues",
    observedOther: (text: string) => `Other: ${text}`,
    observedNotes: "Notes",
    observedNoNotes: "No notes.",
    checksViewNone: "Nothing ticked or noted yet.",
    checkTicked: "Ticked",
    checkNotTicked: "Not ticked",
    checkNote: "Note",
    hypothesesViewNone: "No hypotheses yet. Edit this investigation to add your own ideas.",
    hypothesisFollowUp: "Follow up this hypothesis",
    hypothesisFollowUpFor: (n: number) => `Follow up hypothesis ${n}`,

    // Delete investigation
    deleteTitle: "Delete this investigation?",
    deleteBody: (title: string) =>
      `${title} will be removed from this device. This cannot be undone.`,
    deleteImpact: (photos: number, experiments: number) => {
      const parts: string[] = [];
      if (photos > 0) parts.push(countOf(photos, "photo"));
      if (experiments > 0) parts.push(countOf(experiments, "corrective experiment"));
      return `This deletes the investigation${parts.length > 0 ? `, its ${parts.join(" and ")}` : ""}. The batches and burn tests stay.`;
    },
    deleteChecking: "Checking what goes with it…",
    deleteConfirm: "Delete investigation",
    deleteKeep: "Keep investigation",
    deleteFailed: "The investigation was not deleted. Nothing was changed. Try again.",
  },

  /**
   * Photos on an investigation (v0.3 CandleFix). Same pipeline as burn test
   * photos, so the keys match `burnPhotos`. WRITTEN HERE (v0.3 CandleFix, 4a).
   */
  candleFixPhotos: {
    heading: "Photos",
    count: (n: number, max: number) => `${n} of ${max}`,
    empty: "No photos yet. Add photos of what you saw, such as the surface, the sides or the flame.",
    addButton: "Add photos",
    limitReached: (max: number) =>
      `This investigation has ${max} photos, which is the most it can hold. Delete a photo to add another.`,
    limitStopped: (added: number, max: number) =>
      `Added ${countOf(added, "photo")}. The investigation now has ${max} photos, the most it can hold, so the rest were not added.`,
    progress: (n: number, total: number) => `Adding photo ${n} of ${total}…`,
    addedSummary: (n: number) => `Added ${countOf(n, "photo")}.`,
    photoAlt: (n: number, total: number) => `Photo ${n} of ${total}`,
    openPhoto: (n: number, total: number) => `Open photo ${n} of ${total}`,
    loadError: "The photos could not be loaded from this device.",
    viewTitle: (n: number, total: number) => `Photo ${n} of ${total}`,
    close: "Close",
    delete: "Delete photo",
    deleteTitle: "Delete this photo?",
    deleteBody: "The photo is removed from this device. This cannot be undone.",
    deleteConfirm: "Delete photo",
    deleteCancel: "Keep photo",
    deleteError: "The photo could not be deleted. Nothing was changed. Please try again.",
    deleteGone: "That photo was already deleted.",
    privacyNote:
      "Photos are shrunk to fit and saved as JPEG on this device. Location and camera details in the photo are not kept.",
    storageUsage: (used: string, quota: string) =>
      `This site uses ${used} of about ${quota} available on this device.`,
    errorNotImage: (name: string) => `${name} is not an image, so it was not added.`,
    errorTooLarge: (name: string) =>
      `${name} is larger than 40 MB, so it was not added. Choose a smaller photo.`,
    errorTooBig: (name: string) =>
      `${name} is still too big after shrinking, so it was not added. Try a different photo.`,
    errorUnsupported:
      "This browser cannot turn photos into JPEG files, so the photo was not added. Try another browser.",
    errorStorageFull:
      "This device is out of space for this site, so the photo was not added. Nothing else was lost. Deleting photos after making a backup frees space.",
    errorLimit: (max: number) =>
      `This investigation already has ${max} photos, the most it can hold, so the photo was not added.`,
    errorStorage:
      "The photo could not be saved on this device, so it was not added. Nothing else was changed. Please try again.",
    errorNotFound: "This investigation could not be found, so the photo was not added.",
  },

  /**
   * v0.3 CandleFix: corrective experiments, the timeline and the experiment
   * editor. WRITTEN HERE (v0.3 CandleFix), for owner review. Observations
   * only: nothing names a cause, a fix or a verdict.
   */
  candleFixExperiments: {
    heading: "Corrective experiments",
    description:
      "A corrective experiment links one of your hypotheses to a follow-up batch and the burn tests you ran on it.",
    loading: "Loading corrective experiments…",
    loadFailed: "The corrective experiments could not be loaded. Your data is still on this device.",
    tryAgain: "Try again",
    emptyTitle: "No corrective experiments yet",
    emptyBody:
      "A hypothesis can be followed by a follow-up batch, usually made from a new formula version. Make that batch first, then choose Follow up this hypothesis on the hypothesis.",
    compareLink: "Compare before and after",
    editLink: "Edit experiment",
    editLabel: (batchTitle: string) => `Edit experiment with ${batchTitle}`,
    cardLabel: (batchTitle: string) => `Corrective experiment: ${batchTitle}`,
    hypothesisFollowed: "Hypothesis followed",
    hypothesisGone: "No longer in this investigation",
    followUpBatch: "Follow-up batch",
    formulaLabel: "Formula",
    versionText: (version: number) => `version ${version}`,
    changeLabel: "What changed",
    notesLabel: "Notes",
    burnTestsLabel: "Burn tests",
    noBurnTests: "No burn tests listed",
    noChange: "Not written down",
    separator: " · ",

    // Timeline
    timelineHeading: "Timeline",
    timelineEmpty: "Nothing is dated yet.",
    timelineLabel: "Dated events for this investigation",
    eventBatchMade: "Batch made",
    eventIssueObserved: "Issue observed",
    eventHypothesisAdded: "Hypothesis added",
    eventFollowUpMade: "Follow-up batch made",
    eventBurnTest: "Burn test",

    // Editor
    newTitle: "New corrective experiment",
    editTitle: "Edit corrective experiment",
    editorLoading: "Loading…",
    editorLoadFailed: "The experiment could not be loaded. Your data is still on this device.",
    newDescription: (investigation: string) => `Follows a hypothesis of ${investigation}.`,
    editDescription: (investigation: string) => `Part of ${investigation}.`,
    investigationMissingTitle: "Investigation not found",
    investigationMissingBody: "That investigation is no longer on this device.",
    experimentMissingTitle: "Corrective experiment not found",
    experimentMissingBody: "That corrective experiment is no longer on this device.",
    noHypothesesTitle: "No hypotheses yet",
    noHypothesesBody:
      "Add a hypothesis on the investigation page first. A corrective experiment follows one hypothesis.",
    backToInvestigation: "Back to the investigation",
    backToBatches: "Go to batches",
    hypothesisField: "Hypothesis to follow",
    hypothesisPlaceholder: "Choose a hypothesis",
    errHypothesis: "Choose the hypothesis this follow-up batch follows.",
    batchField: "Follow-up batch",
    batchPlaceholder: "Choose a batch",
    batchHint:
      "The batch of this investigation is not listed. Batches made from the same formula come first, so a batch from a newer version is easy to find.",
    batchGroupSameFormula: "Same formula as this investigation",
    batchGroupOtherFormula: "Other formulas",
    batchOption: (batch: string, formula: string, version: number, date: string) =>
      `${batch}, ${formula}, version ${version}, made ${date}`,
    batchesNone: "There is no other batch to follow up with yet. Make a batch first.",
    errBatch: "Choose the follow-up batch.",
    fixedNote: "The hypothesis and the follow-up batch cannot be changed once the experiment is saved.",
    burnTestsLegend: "Burn tests of the follow-up batch",
    burnTestsChooseBatch: "Choose a follow-up batch to see its burn tests.",
    burnTestsNone: "This batch has no burn tests yet. You can add them later.",
    burnTestsHint: (max: number) => `Optional. Choose up to ${max}.`,
    burnTestsLimit: (max: number) => `You can list up to ${max} burn tests.`,
    changeField: "What changed",
    changeHint: "For example: less fragrance oil, a different wick.",
    notesField: "Notes",
    errChangeLong: (max: number) => `Write ${max} characters or fewer.`,
    errNotesLong: (max: number) => `Write ${max} characters or fewer.`,
    errCheckFields: "Check the fields marked above.",
    save: "Save experiment",
    cancel: "Cancel",
    retry: "Try again",
    saveGone: "That batch or burn test is no longer on this device.",
    saveInvalid: "Some of this could not be saved. Check the follow-up batch and the burn tests.",
    saveStorageFull: "This device has no room left to save this. Free some space and try again.",
    saveFailed: "The experiment could not be saved. Your changes are still here. Try again.",
    deleteButton: "Delete experiment",
    deleteTitle: "Delete this corrective experiment?",
    deleteBody: "Deletes this corrective experiment only. The follow-up batch and its burn tests stay.",
    deleteKeep: "Keep it",
    deleteConfirm: "Delete experiment",
    deleteFailed: "The experiment could not be deleted. Try again.",
  },

  /**
   * v0.3 CandleFix: the before-and-after view and the all-investigations
   * list. WRITTEN HERE (v0.3 CandleFix), for owner review. Columns are never
   * ranked; "Before" and "After" only say which batch came first.
   */
  candleFixCompare: {
    title: "Before and after",
    description: (investigation: string, batch: string) => `${investigation}, recorded on ${batch}.`,
    loading: "Loading…",
    loadFailedTitle: "The comparison could not be loaded.",
    loadFailed: "Your data is still on this device. Try again.",
    tryAgain: "Try again",
    notFoundTitle: "Investigation not found",
    notFoundBody: "That investigation is no longer on this device.",
    noExperimentsTitle: "No corrective experiments yet",
    noExperimentsBody: "Add a corrective experiment to see its follow-up batch next to the original.",
    backToInvestigation: "Back to the investigation",
    tableCaption:
      "Before and after, one column per batch. This table scrolls sideways when it is wider than the screen.",
    cardsLabel: "Before and after, one card per batch",
    rowLabel: "Row",
    before: "Before",
    after: "After",
    separator: " · ",
    versionText: (version: number) => `version ${version}`,
    notRecorded: "Not recorded",
    noneRecorded: "None recorded",
    noChange: "Not written down",
    hypothesisGone: "No longer in this investigation",
    rowBatch: "Batch",
    rowFormula: "Formula and version",
    rowProducedOn: "Produced",
    rowHypothesis: "Hypothesis followed",
    rowChange: "What changed",
    rowIssues: "Issues observed",
    rowBurnTests: "Burn tests",
    rowCandles: "Candles",
    rowBurns: "Burns",
    rowTotalTime: "Total burn time",
    rowTotalLoss: "Total weight loss",
    rowAverageRate: "Average weight loss per hour",
    // Reworded after the Codex CandleFix review (2026-11-29): the figure is each candle's
    // last recorded diameter, then the largest of those. WRITTEN HERE (v0.3 CandleFix follow-up).
    rowMeltPool: "Last melt pool diameter (largest candle)",
    meltPoolNote:
      "Last melt pool diameter: the last diameter recorded for each candle, then the largest of those candles.",
    rowFlame: "Largest flame height",
    rowSoot: "Soot seen",
    notApplicable: "Not applicable",
    issueLine: (issues: string, date: string) => `${issues}, observed ${date}`,
    hypothesisLine: (text: string, status: string) => `${text} (${status})`,
    columnLabel: (position: number, total: number) => `Batch ${position} of ${total}`,

    // The all-investigations list
    listTitle: "Investigations",
    listDescription: "Issues you recorded on batches, newest observation first.",
    listLoading: "Loading investigations…",
    listLoadFailedTitle: "Investigations could not be loaded.",
    listLoadFailed: "Your data is still on this device. Try again.",
    listEmptyTitle: "No investigations yet",
    listEmptyBody:
      "An investigation starts from a batch. Open a batch and choose Record an issue.",
    listEmptyAction: "Go to batches",
    listGroupLabel: "Investigations",
    showArchived: "Show archived",
    archivedBadge: "Archived",
    listNoActive: "No investigations to show. Turn on Show archived to see archived ones.",
    observedOn: (date: string) => `Observed ${date}`,
    photoCount: (n: number) => countOf(n, "photo"),
    experimentCount: (n: number) => countOf(n, "corrective experiment"),
    untitled: "Investigation",
  },

  /** TrueCandle Cost screens: cost sheets. */
  cost: {
    // ── WRITTEN HERE (v0.3 TrueCandle Cost) ──
    // Sections on the batch and formula pages
    sectionHeading: "Costs",
    formulaSectionHeading: "Cost sheets",
    sectionLoading: "Loading cost sheets…",
    sectionLoadFailed: "The cost sheets could not be loaded. Your data is still on this device.",
    sectionEmptyBatch:
      "No cost sheets for this batch yet. A cost sheet adds up materials, packaging, labour and overhead into a cost per sellable candle.",
    sectionEmptyFormula:
      "No cost sheets for this formula yet. A cost sheet adds up materials, packaging, labour and overhead into a cost per sellable candle.",
    newSheet: "New cost sheet",
    newSheetFromVersion: (n: number) => `New cost sheet from version ${n}`,
    allSheets: "All cost sheets",
    tryAgain: "Try again",

    // List page
    listTitle: "Cost sheets",
    listDescription: "The cost of a batch of candles, from a saved formula version or a recorded batch.",
    listLoading: "Loading cost sheets…",
    listLoadFailedTitle: "The cost sheets could not be loaded.",
    listLoadFailedBody: "Your data is still on this device.",
    listEmptyTitle: "No cost sheets yet",
    listEmptyBody: "Start one from a formula version or a recorded batch.",
    listEmptyFiltered: "No cost sheets match this filter.",
    openFormulas: "Open formulas",
    openBatches: "Open batches",
    filterFormula: (name: string) => `Showing cost sheets for ${name}`,
    filterBatch: (batch: string) => `Showing cost sheets for batch ${batch}`,
    filterClear: "Show all cost sheets",
    untitled: "Cost sheet",
    basisBatch: (batch: string) => `From batch ${batch}`,
    basisVersion: (n: number, formula: string) => `From version ${n} of ${formula}`,
    rowCandles: (made: number, sellable: number) =>
      `${made.toLocaleString("en-US")} made, ${sellable.toLocaleString("en-US")} sellable`,
    rowPerSellable: (amount: string) => `${amount} per sellable candle`,
    noSellable: "No sellable candles",
    incompleteBadge: "Incomplete",
    separator: " · ",

    // New sheet
    newTitle: "New cost sheet",
    newDescriptionVersion: (n: number, formula: string) => `From version ${n} of ${formula}.`,
    newDescriptionBatch: (batch: string) => `From batch ${batch}.`,
    newLoading: "Loading…",
    newLoadFailed: "The formula version or batch could not be loaded. Your data is still on this device.",
    newMissingTitle: "Nothing to cost here",
    newMissingBody: "The formula version or batch may have been deleted, or the link may be wrong.",
    newNoBasisBody: "Start a cost sheet from a formula version or a batch.",
    titleLabel: "Title (optional)",
    titleHint: "A name to tell sheets apart, such as a price list or a size.",
    candlesLabel: "Candles made",
    candlesHint: "How many candles this cost covers, as a whole number.",
    candlesHintVessels: (n: number) => `This version was sized for ${n} vessels.`,
    sellableLabel: "Sellable",
    sellableHint: "Candles you can sell. The cost of the non-sellable ones is carried by the sellable ones.",
    createButton: "Create cost sheet",
    cancel: "Cancel",
    createFailed: "The cost sheet could not be saved. Your data is still on this device. Try again.",
    createInvalid: "The cost sheet could not be created from these values. Check the fields and try again.",

    // Field errors
    errTitleLong: (max: number) => `Use ${max} characters or fewer.`,
    errNotesLong: (max: number) => `Use ${max.toLocaleString("en-US")} characters or fewer.`,
    errCandlesRequired: "Enter how many candles were made.",
    errCandlesWhole: "Use a whole number, such as 12.",
    errCandlesRange: (max: number) => `Use a number from 1 to ${max.toLocaleString("en-US")}.`,
    errSellableRequired: "Enter how many candles are sellable, or 0.",
    errSellableWhole: "Use a whole number, such as 10.",
    errSellableOver: "Sellable cannot be more than candles made.",
    errPiecesPerCandle: (max: number) => `Use a whole number from 0 to ${max}.`,
    errPriceRequired: "Enter a price, or choose No price.",
    errMoney: "Enter an amount in pesos, such as 1850 or 38.50, with at most 2 decimals.",
    errMoneyRange: (max: string) => `Use an amount up to ${max}.`,
    errPriceMin: "Enter at least ₱0.01.",
    errItemName: (max: number) => `Enter a name of 1 to ${max} characters.`,
    errItemQuantity: (max: number) => `Use a whole number from 1 to ${max.toLocaleString("en-US")}.`,
    errHours: "Enter hours with at most 2 decimals, such as 3.5, or 0.",
    errHoursRange: "Use up to 1,000 hours.",
    errPercent: "Enter a percentage with at most 2 decimals, such as 12.5.",
    errPercentRange: (max: string) => `Use a percentage up to ${max}.`,
    errMarginRange: "Enter a target margin below 100%, such as 40.",

    // Sheet page
    pageLoading: "Loading the cost sheet…",
    pageLoadingTitle: "Cost sheet",
    pageLoadFailed: "The cost sheet could not be loaded. Your data is still on this device.",
    notFoundTitle: "Cost sheet not found",
    notFoundBody: "It may have been deleted, or the link may be wrong. Your formulas and batches are not affected.",
    backToSheets: "Back to cost sheets",
    backToSheet: "Back to the cost sheet",
    basisBatchLink: (batch: string) => `Batch ${batch}`,
    basisVersionLink: (n: number, formula: string) => `Version ${n} of ${formula}`,
    formulaLink: (name: string) => `Formula ${name}`,
    copiedFrom: "Copied from",
    copiedFromDeleted: "Copied from a sheet that was deleted",
    copiedNotice: "A new cost sheet was made from current data. The original is unchanged.",
    edit: "Edit",
    copyUpdate: "Copy and update",
    copyUpdateHint: "Copy and update makes a new sheet with current prices and weights. This one stays as it is.",
    copyFailed: "The sheet could not be copied. Your data is still on this device. Try again.",
    deleteButton: "Delete",
    candlesLine: (made: number, sellable: number) =>
      `${made.toLocaleString("en-US")} candles made, ${sellable.toLocaleString("en-US")} sellable`,

    // Lines and totals
    materialsHeading: "Materials",
    itemsHeading: "Packaging and other items",
    itemsEmpty: "No packaging or other items.",
    totalsHeading: "Totals",
    quantityMeasured: (grams: string) => `${grams} measured`,
    quantityPlanned: (grams: string) => `Planned (not measured): ${grams}`,
    quantityPerCandle: (perCandle: number, pieces: number) =>
      `${perCandle} per candle × ${pieces.toLocaleString("en-US")}`,
    sourceLot: (code: string, paid: string, received: string) => `Lot ${code}: ${paid} for ${received}`,
    sourceMaterial: (price: string) => `Material price ${price}`,
    sourceSheet: (price: string) => `Typed on this sheet: ${price}`,
    sourceNone: "No price",
    receivedPieces: (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "piece" : "pieces"}`,
    itemQuantitySellable: (quantity: number, sellable: number) =>
      `${quantity} per sellable candle × ${sellable.toLocaleString("en-US")}`,
    itemQuantityBatch: (quantity: number) => `${quantity} per batch`,
    itemUnit: (price: string) => `${price} each`,
    labourLabel: "Labour",
    labourDetail: (hours: string, rate: string) => `${hours} h × ${rate} per hour`,
    overheadLabel: "Overhead",
    overheadFixedDetail: "Fixed amount for the batch",
    overheadPercentDetail: (percent: string) => `${percent} of materials and labour`,
    materialsLabel: "Materials",
    itemsPerBatchLabel: "Items for the whole batch",
    productionLabel: "Production",
    productionDetail: "Materials, whole-batch items, labour and overhead",
    perCandleMadeLabel: "Cost per candle made",
    nonSellableLabel: "Non-sellable candles",
    nonSellableDetail: (count: number) => countOf(count, "candle"),
    testingLabel: "Testing allowance",
    packagingLabel: "Packaging for the sellable candles",
    batchTotalLabel: "Batch total",
    perSellableHeading: "Cost per sellable candle",
    perSellableNone: "No sellable candles, so there is no cost per sellable candle.",
    partsHeading: "Made up of",
    partProduction: "Production",
    partNonSellable: "Non-sellable share",
    partTesting: "Testing",
    partPackaging: "Packaging",
    incompleteTitle: "Incomplete.",
    incompleteBody: (n: number) =>
      `${n} material ${n === 1 ? "line has" : "lines have"} no price and ${n === 1 ? "counts" : "count"} as ₱0.00, so this cost is lower than the real cost.`,
    roundingNote: "Each figure is rounded to the centavo on its own; totals use the unrounded amounts.",

    // Scenarios
    scenariosHeading: "Pricing scenarios",
    wholesale: "Wholesale",
    retail: "Retail",
    scenarioNotSet: "Not set",
    rowPrice: "Price",
    rowPriceVat: "Price (includes VAT)",
    rowExVat: "Price without VAT",
    rowVat: "VAT in the price",
    rowProfit: "Profit per candle",
    rowMargin: "Gross margin",
    rowBatchProfit: "Profit for the batch",
    scenarioSetByPrice: "Set by price",
    scenarioSetByMargin: (margin: string) => `Set by target margin ${margin}`,
    reasonNoSellable: "No sellable candles",
    reasonMarginUnreachable: "A margin of 100% or more cannot be reached",
    reasonZeroPrice: "The price must be at least ₱0.01",
    notAvailable: "–",
    vatOnNote: "Prices include 12% VAT. Margins are worked out on the price without VAT.",
    vatOffNote: "Costs are recorded as paid. VAT is not added.",

    // Delete
    deleteTitle: "Delete this cost sheet?",
    deleteBody: (title: string) =>
      `${title} will be removed from this device. Your formulas, batches, materials and other cost sheets are not changed.`,
    deleteKeep: "Keep it",
    deleteConfirm: "Delete cost sheet",
    deleteFailed: "The cost sheet could not be deleted. Your data is still on this device. Try again.",

    // Editor
    editTitle: "Edit cost sheet",
    editorLoading: "Loading the cost sheet…",
    editorLoadFailed: "The cost sheet could not be loaded. Your data is still on this device.",
    save: "Save",
    saved: "Saved",
    saveFailed: "The cost sheet could not be saved. Your data is still on this device. Try again.",
    saveInvalid: "These values could not be saved. Check the fields and try again.",
    fixFields: "Some fields need attention. Fix them and save again.",
    resultsHeading: "Results",
    resultsStale: "Some fields need attention, so these figures are from the last valid values.",
    countsHeading: "Candles",
    linesHeading: "Materials and prices",
    linesHint: "Weights come from the formula version or batch and cannot change here.",
    linePriceLegend: (name: string) => `Price for ${name}`,
    priceKeep: "Keep the price from when the sheet was made",
    priceTyped: "Type a price for this sheet",
    priceNone: "No price",
    priceTypedLabelKg: (name: string) => `${name}: price per kg (pesos)`,
    priceTypedLabelPiece: (name: string) => `${name}: price each (pesos)`,
    piecesLabel: (name: string) => `${name}: pieces per candle`,
    itemsEditHeading: "Packaging and other items",
    itemsHint: "Add items from your packaging list or type a one-off. The price is copied onto this sheet.",
    itemPickerLabel: "Add from the packaging list",
    itemPickerPlaceholder: "Choose an item",
    itemAddFromList: "Add from list",
    itemAddOneOff: "Add a one-off item",
    itemsAtMax: (max: number) => `A sheet holds at most ${max} items.`,
    itemName: "Item name",
    itemPrice: "Price each (pesos)",
    itemPer: "Charged",
    itemPerSellableOption: "Each sellable candle",
    itemPerBatchOption: "Whole batch",
    itemQuantity: "Quantity",
    itemRemove: (name: string) => `Remove ${name || "item"}`,
    labourHeading: "Labour",
    labourHoursLabel: "Labour hours",
    labourRateLabel: "Labour rate per hour (pesos)",
    overheadHeading: "Overhead",
    overheadModeLabel: "Overhead mode",
    overheadFixed: "Fixed amount for the batch",
    overheadPercent: "Percentage of materials and labour",
    overheadFixedLabel: "Overhead for the batch (pesos)",
    overheadPercentLabel: "Overhead percentage",
    testingLabelField: "Testing allowance for the batch (pesos)",
    vatSwitch: "Prices include 12% VAT",
    vatNote: "Off: the app assumes you are not VAT-registered and records costs as paid.",
    scenarioModeLabel: (name: string) => `${name} set by`,
    scenarioModeNone: "Not set",
    scenarioModePrice: "By price",
    scenarioModeMargin: "By target margin",
    scenarioPriceLabel: (name: string) => `${name} price per candle (pesos)`,
    scenarioMarginLabel: (name: string) => `${name} target gross margin (%)`,
    notesFieldLabel: "Notes (optional)",
  },

  /** Storage blocked (blueprint section 5, F7 storage row). */
  storage: {
    blockedTitle: "This browser can't store data right now.",
    /** The explanation from the spec: calculator still works. */
    blockedExplanation: "The calculator still works without saving.",
    /** What to try. WRITTEN HERE: the spec says "with what to try" but gives no text. */
    blockedWhatToTry:
      "Try a normal browser window, allow this site to store data, or free up some browser storage.",
    /** Full-page explanation at start. WRITTEN HERE: the spec names the screen but gives no text. */
    blockedCauses:
      "Your browser is not letting this site keep data. A private or incognito window, a full device, or a browser setting that blocks site data can cause this. Try a regular window, free up some space, or allow site data for this page, then reload.",
    blockedNotKept: "Nothing you enter will be kept when you close or reload the page.",
    carryOn: "Carry on without saving",
  },
} as const;
