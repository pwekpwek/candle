import { describe, expect, it } from "vitest";
import * as messagesModule from "@/lib/messages";
import {
  MESSAGES,
  basisExplanation,
  basisWords,
  effectiveWeightsLine,
  messageForCheckFailure,
  messageForIssue,
  restoreSummary,
  roundingWarningText,
  zeroComponentText,
} from "@/lib/messages";
import type { Issue } from "@/lib/gramguard";
import type { CheckFailure } from "@/lib/backup/contract";
import type { BackupCounts } from "@/lib/types";

// Expected strings below are copied from docs/specs/2 Calculation Rules.md
// section 8 (V-01 to V-17), section 4 (CALC-13, CALC-14) and docs/specs/1 PRD.md
// (PRD-09). They are hard-coded on purpose, not taken from the implementation.

describe("messageForIssue: section 8 table, word for word", () => {
  it("V-01", () => {
    const issue: Issue = { rule: "V-01", field: "amount", severity: "error" };
    expect(messageForIssue(issue)).toBe(
      "Use numbers only, with a period for decimals (for example 462.5). No commas.",
    );
  });

  it("V-02", () => {
    expect(
      messageForIssue({ rule: "V-02", field: "name", severity: "error" }),
    ).toBe("Give this formula a name.");
  });

  it("V-03", () => {
    expect(
      messageForIssue({ rule: "V-03", field: "amount", severity: "error" }),
    ).toBe("Enter a weight above 0 g.");
  });

  it("V-04 with a finer precision available", () => {
    const issue: Issue = {
      rule: "V-04",
      field: "amount",
      severity: "error",
      precisionMg: 100,
      lower: "500.5",
      upper: "500.6",
      finerPrecisionMg: 10,
    };
    expect(messageForIssue(issue)).toBe(
      "This formula rounds to 0.1 g. Enter 500.5 or 500.6, or switch precision to 0.01 g.",
    );
  });

  it("V-04 with no finer precision drops the switch clause", () => {
    const issue: Issue = {
      rule: "V-04",
      field: "amount",
      severity: "error",
      precisionMg: 100,
      lower: "500.5",
      upper: "500.6",
      finerPrecisionMg: null,
    };
    expect(messageForIssue(issue)).toBe(
      "This formula rounds to 0.1 g. Enter 500.5 or 500.6.",
    );
  });

  it("V-05", () => {
    expect(
      messageForIssue({ rule: "V-05", field: "vesselCount", severity: "error" }),
    ).toBe("Enter a whole number of vessels.");
  });

  it("V-06 as V-03 uses the V-03 text", () => {
    expect(
      messageForIssue({
        rule: "V-06",
        field: "fillWeight",
        severity: "error",
        as: "V-03",
      }),
    ).toBe("Enter a weight above 0 g.");
  });

  it("V-06 as V-04 with a finer precision uses the V-04 text", () => {
    expect(
      messageForIssue({
        rule: "V-06",
        field: "fillWeight",
        severity: "error",
        as: "V-04",
        precisionMg: 100,
        lower: "500.5",
        upper: "500.6",
        finerPrecisionMg: 10,
      }),
    ).toBe(
      "This formula rounds to 0.1 g. Enter 500.5 or 500.6, or switch precision to 0.01 g.",
    );
  });

  it("V-06 as V-04 with no finer precision uses the V-04 text", () => {
    expect(
      messageForIssue({
        rule: "V-06",
        field: "fillWeight",
        severity: "error",
        as: "V-04",
        precisionMg: 10,
        lower: "500.505",
        upper: "500.515",
        finerPrecisionMg: null,
      }),
    ).toBe("This formula rounds to 0.01 g. Enter 500.505 or 500.515.");
  });

  it("V-07", () => {
    expect(
      messageForIssue({ rule: "V-07", field: "fragrancePct", severity: "error" }),
    ).toBe("Enter a fragrance percentage between 0 and 50.");
  });

  it("V-08", () => {
    expect(
      messageForIssue({ rule: "V-08", field: "fragrancePct", severity: "warning" }),
    ).toBe(
      "This is above common usage levels. Check your wax supplier's maximum fragrance load.",
    );
  });

  it("V-09", () => {
    expect(
      messageForIssue({
        rule: "V-09",
        field: "fragrancePct",
        severity: "warning",
        maxBp: 1000,
        waxName: "Soy 464",
      }),
    ).toBe("Above the 10% maximum recorded for Soy 464.");
  });

  it("V-10", () => {
    expect(
      messageForIssue({ rule: "V-10", field: "waxes", severity: "error" }),
    ).toBe("Choose a wax.");
  });

  it("V-11", () => {
    expect(
      messageForIssue({ rule: "V-11", field: "oils", severity: "error" }),
    ).toBe(
      "Add a fragrance oil, or set fragrance to 0% for an unscented candle.",
    );
  });

  it("V-12", () => {
    expect(
      messageForIssue({ rule: "V-12", field: "oils.r2.parts", severity: "error" }),
    ).toBe("Enter parts above 0.");
  });

  it("V-13", () => {
    expect(
      messageForIssue({
        rule: "V-13",
        field: "oils.r2.material",
        severity: "error",
        materialName: "Lavender",
      }),
    ).toBe("Lavender is already in this blend.");
  });

  it("V-14", () => {
    expect(
      messageForIssue({ rule: "V-14", field: "result", severity: "error" }),
    ).toBe(
      "This leaves no wax. Lower the fragrance percentage or raise the batch size.",
    );
  });

  it("V-15 is the CALC-14 sentence", () => {
    expect(
      messageForIssue({
        rule: "V-15",
        field: "result",
        severity: "error",
        materialName: "Lavender",
      }),
    ).toBe(
      "Lavender rounds to 0 g at this precision. Use a finer precision or a larger batch.",
    );
  });

  it("CALC-14 spec sentence equals the V-15 output", () => {
    // CALC-14: "Lavender rounds to 0 g at this precision. Use a finer precision or a larger batch."
    expect(zeroComponentText("Lavender")).toBe(
      "Lavender rounds to 0 g at this precision. Use a finer precision or a larger batch.",
    );
  });

  it("V-16", () => {
    expect(
      messageForIssue({ rule: "V-16", field: "measured.r1", severity: "error" }),
    ).toBe("Enter the measured weight in grams.");
  });

  it("V-17", () => {
    expect(
      messageForIssue({ rule: "V-17", field: "scale.multiplier", severity: "error" }),
    ).toBe("Enter a multiplier between 0.01 and 1000.");
  });
});

describe("messageForIssue: CALC-13 rounding warning", () => {
  it("at 1 g, offers 0.1 g or 0.01 g (spec example, word for word)", () => {
    const issue: Issue = {
      rule: "CALC-13",
      field: "result",
      severity: "warning",
      precisionMg: 1000,
      requestedBp: 600,
      basis: "wax",
      effectiveX100: 638,
    };
    expect(messageForIssue(issue)).toBe(
      "At 1 g precision this small batch can't hit 6%. Planned weights give 6.38% of wax weight. Use 0.1 g or 0.01 g precision, or a larger batch.",
    );
  });

  it("at 0.1 g, offers 0.01 g only", () => {
    expect(
      messageForIssue({
        rule: "CALC-13",
        field: "result",
        severity: "warning",
        precisionMg: 100,
        requestedBp: 600,
        basis: "wax",
        effectiveX100: 638,
      }),
    ).toBe(
      "At 0.1 g precision this small batch can't hit 6%. Planned weights give 6.38% of wax weight. Use 0.01 g precision, or a larger batch.",
    );
  });

  it("at 0.01 g, no finer precision: 'Use a larger batch.'", () => {
    expect(
      messageForIssue({
        rule: "CALC-13",
        field: "result",
        severity: "warning",
        precisionMg: 10,
        requestedBp: 600,
        basis: "wax",
        effectiveX100: 638,
      }),
    ).toBe(
      "At 0.01 g precision this small batch can't hit 6%. Planned weights give 6.38% of wax weight. Use a larger batch.",
    );
  });

  it("uses the total-mixture basis words when the basis is total", () => {
    expect(
      roundingWarningText(1000, 800, "total", 870),
    ).toContain("Planned weights give 8.70% of total mixture.");
  });
});

describe("CALC-17 note", () => {
  it("states that oils are ignored because fragrance is 0%", () => {
    const text = messageForIssue({
      rule: "CALC-17",
      field: "oils",
      severity: "note",
    });
    expect(text).toContain("0%");
    expect(text).toContain("ignored");
  });
});

describe("basis wording (PRD-09, CALC-12)", () => {
  it("basisWords", () => {
    expect(basisWords("wax")).toBe("of wax weight");
    expect(basisWords("total")).toBe("of total mixture");
  });

  it("PRD-09 live sentence, wax basis (spec example, word for word)", () => {
    expect(basisExplanation(800, "wax")).toBe(
      "8% of wax weight: 8 g of fragrance for every 100 g of wax. That is 7.41% of the total mixture.",
    );
  });

  it("live sentence, total basis: equivalent 8.70% of wax weight (CALC-04 table)", () => {
    expect(basisExplanation(800, "total")).toBe(
      "8% of total mixture: 8 g of fragrance in every 100 g of finished mixture. That is 8.70% of the wax weight.",
    );
  });

  it("CALC-12 effective line (spec example)", () => {
    expect(effectiveWeightsLine(799, "wax")).toBe(
      "Planned weights give 7.99% of wax weight.",
    );
  });
});

describe("restore check-failure messages (Data Model step 1)", () => {
  const cases: [CheckFailure, string][] = [
    [{ code: "not-backup" }, "This isn't a CandleLab backup file."],
    [
      { code: "newer" },
      "This backup was made by a newer version of CandleLab. Update the app, then try again.",
    ],
    [
      {
        code: "invalid",
        count: 3,
        firstLabel: "formula version …",
        firstProblem: "missing targets",
      },
      "This backup is damaged: 3 records are invalid (first: formula version …, missing targets).",
    ],
    [{ code: "incomplete" }, "This backup is incomplete."],
    [{ code: "checksum" }, "This backup is damaged or was edited."],
    [{ code: "duplicates" }, "This backup is damaged: duplicate records."],
    [
      { code: "orphans", versions: 2, measurements: 0 },
      "This backup is incomplete: 2 versions refer to a missing formula.",
    ],
  ];

  it.each(cases)("%# %j", (failure, expected) => {
    expect(messageForCheckFailure(failure)).toBe(expected);
  });

  it("invalid with one record uses the singular", () => {
    expect(
      messageForCheckFailure({
        code: "invalid",
        count: 1,
        firstLabel: "backup file",
        firstProblem: "negative weight",
      }),
    ).toBe(
      "This backup is damaged: 1 record is invalid (first: backup file, negative weight).",
    );
  });

  it("orphans with one version and one measurement", () => {
    expect(
      messageForCheckFailure({ code: "orphans", versions: 1, measurements: 1 }),
    ).toBe(
      "This backup is incomplete: 1 version refers to a missing formula and 1 measurement refers to a missing version.",
    );
  });
});

describe("restore result summary (Data Model step 5)", () => {
  it("spec example, word for word", () => {
    const counts = (
      formulas: number,
      formulaVersions: number,
      materials: number,
      measurements: number,
    ): BackupCounts => ({ formulas, formulaVersions, materials, measurements });
    expect(
      restoreSummary({
        fileName: "candlelab-backup-20261114-140512.json",
        added: counts(9, 22, 14, 6),
        skippedIdentical: 12,
        kept: counts(0, 0, 1, 0),
      }),
    ).toBe(
      "Restored from candlelab-backup-20261114-140512.json: added 9 formulas, 22 versions, 14 materials, 6 measurements. Skipped 12 identical items. Kept this device's copy of 1 material.",
    );
  });

  it("singular forms throughout", () => {
    const one: BackupCounts = {
      formulas: 1,
      formulaVersions: 1,
      materials: 1,
      measurements: 1,
    };
    expect(
      restoreSummary({
        fileName: "b.json",
        added: one,
        skippedIdentical: 1,
        kept: { formulas: 1, formulaVersions: 0, materials: 0, measurements: 0 },
      }),
    ).toBe(
      "Restored from b.json: added 1 formula, 1 version, 1 material, 1 measurement. Skipped 1 identical item. Kept this device's copy of 1 formula.",
    );
  });

  it("plural kept versions", () => {
    expect(
      restoreSummary({
        fileName: "b.json",
        added: { formulas: 0, formulaVersions: 2, materials: 0, measurements: 0 },
        skippedIdentical: 0,
        kept: { formulas: 0, formulaVersions: 2, materials: 0, measurements: 0 },
      }),
    ).toBe(
      "Restored from b.json: added 2 versions. Kept this device's copy of 2 versions.",
    );
  });
});

describe("screen and flow strings that are parametrised", () => {
  it("F1 and F4 confirmations", () => {
    expect(MESSAGES.editor.savedAsVersion(1)).toBe("Saved as version 1");
    expect(MESSAGES.editor.revising(2, 3)).toBe(
      "Revising version 2. Saving creates version 3.",
    );
  });

  it("F8 archive explanation (spec example)", () => {
    expect(MESSAGES.materials.archiveUsedIn(3)).toBe(
      "Used in 3 formulas. They keep their saved details.",
    );
  });

  it("empty-state copy from blueprint section 5", () => {
    expect(MESSAGES.list.empty.title).toBe("Your formulas will live here.");
    expect(MESSAGES.list.empty.description).toBe(
      "Work out wax and fragrance weights, then save them to reuse and revise.",
    );
    expect(MESSAGES.list.noMatch("xyz")).toBe('No formulas match "xyz".');
    expect(MESSAGES.materials.empty.description).toBe(
      "Add the waxes, oils, wicks and vessels you use.",
    );
    expect(MESSAGES.results.incomplete).toBe(
      "Results appear when the batch size, fragrance percentage and wax are filled in.",
    );
    expect(MESSAGES.results.enterAllMeasured).toBe(
      "Enter all measured weights to see the actual blend.",
    );
    expect(MESSAGES.storage.blockedTitle).toBe(
      "This browser can't store data right now.",
    );
    expect(MESSAGES.storage.blockedExplanation).toBe(
      "The calculator still works without saving.",
    );
    expect(MESSAGES.backup.neverBackedUp.title).toBe("No backup yet.");
  });
});

// ─────────────── Safety and compliance scan ───────────────

/** Every function exported from messages.ts, with sample arguments. */
const SAMPLE_ISSUES: Issue[] = [
  { rule: "V-01", field: "a", severity: "error" },
  { rule: "V-02", field: "a", severity: "error" },
  { rule: "V-03", field: "a", severity: "error" },
  {
    rule: "V-04",
    field: "a",
    severity: "error",
    precisionMg: 100,
    lower: "1.5",
    upper: "1.6",
    finerPrecisionMg: 10,
  },
  { rule: "V-05", field: "a", severity: "error" },
  { rule: "V-06", field: "a", severity: "error", as: "V-03" },
  {
    rule: "V-06",
    field: "a",
    severity: "error",
    as: "V-04",
    precisionMg: 1000,
    lower: "1",
    upper: "2",
    finerPrecisionMg: null,
  },
  { rule: "V-07", field: "a", severity: "error" },
  { rule: "V-08", field: "a", severity: "warning" },
  { rule: "V-09", field: "a", severity: "warning", maxBp: 1000, waxName: "Soy 464" },
  { rule: "V-10", field: "a", severity: "error" },
  { rule: "V-11", field: "a", severity: "error" },
  { rule: "V-12", field: "a", severity: "error" },
  { rule: "V-13", field: "a", severity: "error", materialName: "Lavender" },
  { rule: "V-14", field: "a", severity: "error" },
  { rule: "V-15", field: "a", severity: "error", materialName: "Lavender" },
  { rule: "V-16", field: "a", severity: "error" },
  { rule: "V-17", field: "a", severity: "error" },
  {
    rule: "CALC-13",
    field: "a",
    severity: "warning",
    precisionMg: 1000,
    requestedBp: 600,
    basis: "total",
    effectiveX100: 638,
  },
  { rule: "CALC-17", field: "a", severity: "note" },
];

const SAMPLE_CHECKS: CheckFailure[] = [
  { code: "not-backup" },
  { code: "newer" },
  { code: "invalid", count: 2, firstLabel: "backup file", firstProblem: "bad" },
  { code: "incomplete" },
  { code: "checksum" },
  { code: "duplicates" },
  { code: "orphans", versions: 1, measurements: 1 },
];

/** Exported helpers that take arguments: name → sampler. */
const HELPER_SAMPLES: Record<string, () => string> = {
  messageForIssue: () => SAMPLE_ISSUES.map(messageForIssue).join("\n"),
  messageForCheckFailure: () => SAMPLE_CHECKS.map(messageForCheckFailure).join("\n"),
  restoreSummary: () =>
    restoreSummary({
      fileName: "a.json",
      added: { formulas: 1, formulaVersions: 2, materials: 3, measurements: 4 },
      skippedIdentical: 5,
      kept: { formulas: 0, formulaVersions: 1, materials: 1, measurements: 0 },
    }),
  basisWords: () => basisWords("wax") + basisWords("total"),
  basisExplanation: () => basisExplanation(800, "wax") + basisExplanation(800, "total"),
  effectiveWeightsLine: () => effectiveWeightsLine(799, "total"),
  equivalentLine: () => messageEquivalent(),
  roundingRuleText: () => messageRounding(),
  supplierMaxText: () => messagesModule.supplierMaxText(1000, "Soy 464"),
  duplicateMaterialText: () => messagesModule.duplicateMaterialText("Lavender"),
  zeroComponentText: () => zeroComponentText("Lavender"),
  roundingWarningText: () => roundingWarningText(100, 600, "wax", 638),
};

function messageEquivalent(): string {
  return messagesModule.equivalentLine(741, "wax");
}

function messageRounding(): string {
  return messagesModule.roundingRuleText(100, "1.5", "1.6", null);
}

/** Every string reachable from MESSAGES, calling its functions with samples. */
const MESSAGE_SAMPLES: Record<string, unknown[]> = {
  "list.noMatch": ["xyz"],
  "list.lastBackupNudge": ["3 days ago"],
  "editor.draftRestored": ["Nov 14, 13:40"],
  "editor.savedAsVersion": [1],
  "editor.revising": [2, 3],
  "materials.typeEmpty": ["oils"],
  "materials.typeAdd": ["oil"],
  "materials.pickerAddRow": ["wax"],
  "materials.usedIn": [3],
  "materials.archiveUsedIn": [3],
  "formula.offTarget": ["under", "0.6 g", "-2.25%"],
  "formula.scaledFrom": ["1.67", 2],
  "formula.nowCalled": ["Soy 465"],
  "formula.headerVersion": [2],
  "formula.originRevisedHeader": [1],
  "formula.originScaledHeader": ["1.67", 2],
  "formula.sizingVessels": [6, "180.0 g"],
  "formula.sizingTotal": ["1080.0 g"],
  "formula.sizingWax": ["1000.0 g"],
  "formula.notLatestNotice": [1, 2],
  "formula.deleteBody": ["Lavender Vanilla", 3, 1],
  "formula.measuredFieldLabel": ["Lavender"],
  "formula.versionNumber": [2],
  "formula.originRevisionRow": ["cedar added"],
  "scale.title": [2],
  "scale.newTotal": ["1800.0 g"],
  "scale.savesAs": [3],
  "scale.newWax": ["1000.0 g"],
  "backup.lastBackup": ["3 days ago", 4],
  "backup.exportedLine": ["Nov 14, 14:05", 12, 31],
  "backup.previewAdd": [{ formulas: 9, formulaVersions: 22, materials: 14, measurements: 0 }],
  "backup.previewAlreadyHere": [{ formulas: 3, formulaVersions: 9, materials: 0, measurements: 0 }],
  "backup.previewConflicts": [{ formulas: 0, formulaVersions: 0, materials: 1, measurements: 0 }],
};

/**
 * Exception list. Each entry is an exact string from MESSAGES that contains a
 * forbidden word, with the reason it is allowed. Spec text only; no candle
 * or fragrance level is described as safe.
 */
const ALLOWED_FORBIDDEN: Record<string, string> = {
  "backup.intro":
    "Spec 3 Backup and restore wireframe: 'Keep a backup file somewhere safe.' It describes storing a file, not a candle.",
  "backup.replaceWarning":
    "Spec 3 F7 step 5 and Data Model DATA-23: 'safety backup' is the spec's term for a copy of current data, not a safety claim.",
};

const FORBIDDEN = /safe|safety|compliant|compliance|approved|certified/i;

function collectStrings(
  value: unknown,
  path: string,
  out: { path: string; text: string }[],
): void {
  if (typeof value === "string") {
    out.push({ path, text: value });
    return;
  }
  if (typeof value === "function") {
    const args = MESSAGE_SAMPLES[path];
    if (!args) throw new Error(`No sample arguments for ${path}`);
    const result = (value as (...a: unknown[]) => unknown)(...args);
    if (typeof result !== "string") throw new Error(`${path} did not return a string`);
    out.push({ path, text: result });
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, path ? `${path}.${key}` : key, out);
    }
  }
}

describe("wording scan: no candle, fragrance level or wick is called safe or compliant", () => {
  it("every exported helper has a sample and is covered", () => {
    const exported = Object.entries(messagesModule)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k);
    for (const name of exported) {
      expect(
        Object.keys(HELPER_SAMPLES),
        `add a sample for ${name}`,
      ).toContain(name);
    }
  });

  it("every function in MESSAGES has sample arguments", () => {
    const strings: { path: string; text: string }[] = [];
    collectStrings(MESSAGES, "", strings);
    expect(strings.length).toBeGreaterThan(50);
  });

  it("no string contains a forbidden word, except the listed exceptions", () => {
    const strings: { path: string; text: string }[] = [];
    collectStrings(MESSAGES, "", strings);
    for (const [name, sample] of Object.entries(HELPER_SAMPLES)) {
      strings.push({ path: `helper.${name}`, text: sample() });
    }
    const hits = strings.filter((s) => FORBIDDEN.test(s.text));
    const unexpected = hits.filter((s) => !(s.path in ALLOWED_FORBIDDEN));
    expect(unexpected.map((s) => `${s.path}: ${s.text}`)).toEqual([]);
    // Each exception must still be present, so the list cannot go stale.
    for (const allowed of Object.keys(ALLOWED_FORBIDDEN)) {
      expect(hits.map((h) => h.path)).toContain(allowed);
    }
  });

  it("no string contains an emoji", () => {
    const strings: { path: string; text: string }[] = [];
    collectStrings(MESSAGES, "", strings);
    const emoji = /\p{Extended_Pictographic}/u;
    expect(strings.filter((s) => emoji.test(s.text))).toEqual([]);
  });
});
