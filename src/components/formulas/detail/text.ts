import { formatFactor, formatGrams, formatRequestedPercent } from "@/lib/gramguard";
import { MESSAGES, basisWords } from "@/lib/messages";
import type { FormulaVersion, Sizing, PrecisionMg } from "@/lib/types";

const F = MESSAGES.formula;

/** "6 vessels × 180.0 g", "1080.0 g total mixture", "1000.0 g of wax". */
export function sizingText(sizing: Sizing, precisionMg: PrecisionMg): string {
  switch (sizing.mode) {
    case "vessels":
      return F.sizingVessels(sizing.count, formatGrams(sizing.fillMg, precisionMg));
    case "total":
      return F.sizingTotal(formatGrams(sizing.amountMg, precisionMg));
    case "wax":
      return F.sizingWax(formatGrams(sizing.amountMg, precisionMg));
  }
}

/** The number of the version this one came from, when it is in the list. */
export function parentNumber(
  version: FormulaVersion,
  all: readonly FormulaVersion[],
): number | null {
  if (version.parentVersionId === null) return null;
  return all.find((v) => v.id === version.parentVersionId)?.number ?? null;
}

/** Lower-case origin for the header line: "first version", "revised from v1". */
export function originHeader(
  version: FormulaVersion,
  all: readonly FormulaVersion[],
): string {
  const parent = parentNumber(version, all);
  switch (version.origin) {
    case "initial":
      return F.originFirstHeader;
    case "revision":
      return parent === null ? F.originRevisedPlain : F.originRevisedHeader(parent);
    case "scaled":
      return parent === null || version.scale === null
        ? F.originScaledPlain
        : F.originScaledHeader(formatFactor(version.scale.factorX10000), parent);
  }
}

/** Origin for a row of the versions list: "First version", "Revision: cedar added". */
export function originRow(
  version: FormulaVersion,
  all: readonly FormulaVersion[],
): string {
  const parent = parentNumber(version, all);
  switch (version.origin) {
    case "initial":
      return F.originFirstRow;
    case "revision":
      return F.originRevisionRow(version.changeNote ?? null);
    case "scaled":
      return parent === null || version.scale === null
        ? F.originScaledPlain.replace(/^./, (c) => c.toUpperCase())
        : F.scaledFrom(formatFactor(version.scale.factorX10000), parent);
  }
}

/** "8% of wax weight": the requested percentage with its basis in words. */
export function requestedText(version: FormulaVersion): string {
  return `${formatRequestedPercent(version.inputs.fragranceBp)}% ${basisWords(version.inputs.basis)}`;
}
