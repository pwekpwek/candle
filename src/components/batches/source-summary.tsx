import Link from "next/link";
import { formatGrams } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import type { Formula, FormulaVersion } from "@/lib/types";
import { sizingText } from "@/components/formulas/detail/text";
import { ArchivedBadge } from "./archived-badge";
import { versionHref } from "./text";

const B = MESSAGES.batches;
const F = MESSAGES.formula;

/** The formula version a batch is made from: name, version, planned total, sizing. */
export function SourceSummary({
  formula,
  version,
}: {
  formula: Formula;
  version: FormulaVersion;
}) {
  const { precisionMg } = version.inputs;
  const details = [
    B.sourcePlannedTotal(formatGrams(version.targets.totalMg, precisionMg)),
    sizingText(version.inputs.sizing, precisionMg),
  ].join(B.separator);
  return (
    <section
      aria-label={B.sourceHeading}
      className="mb-6 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold">{B.sourceHeading}</h2>
      <p className="mt-1 text-sm">
        <Link
          href={`/formulas/${formula.id}`}
          className="font-semibold underline-offset-4 hover:underline"
        >
          {formula.name}
        </Link>
        {B.separator}
        <Link
          href={versionHref(formula.id, version.id)}
          className="underline-offset-4 hover:underline"
        >
          {F.headerVersion(version.number)}
        </Link>
        {formula.archivedAt !== null ? <ArchivedBadge /> : null}
      </p>
      <p className="mt-1 text-sm text-text-secondary tabular">{details}</p>
    </section>
  );
}
