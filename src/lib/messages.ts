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
import type { CheckFailure } from "@/lib/backup/contract";
import type {
  Basis,
  BackupCounts,
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
  const base = `This formula rounds to ${precisionLabel(precisionMg)}. Enter ${lower} or ${upper}`;
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
];

function countsList(counts: BackupCounts): string[] {
  return SUMMARY_ORDER.filter((s) => counts[s.key] > 0).map((s) =>
    countOf(counts[s.key], s.singular, s.plural),
  );
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
    navBackup: "Backup and restore",
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
    pillSaving: "Saving",
    pillSaved: "Saved",
    pillError: "Error",
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
    replaceWarning:
      "This removes every formula, version, material and measurement on this device and writes the backup in their place. A safety backup of current data downloads first.",
    typeReplace: "Type REPLACE to confirm.",
    dontCloseTab: "Don't close this tab.",
    openSaved: "Open saved formulas",
  },

  /** Storage blocked (blueprint section 5, F7 storage row). */
  storage: {
    blockedTitle: "This browser can't store data right now.",
    /** The explanation from the spec: calculator still works. */
    blockedExplanation: "The calculator still works without saving.",
    /** What to try. WRITTEN HERE: the spec says "with what to try" but gives no text. */
    blockedWhatToTry:
      "Try a normal browser window, allow this site to store data, or free up some browser storage.",
  },
} as const;
