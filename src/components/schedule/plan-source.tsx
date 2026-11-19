import Link from "next/link";
import { ArchivedBadge } from "@/components/batches/archived-badge";
import { versionHref } from "@/components/batches/text";
import { MESSAGES } from "@/lib/messages";
import type { Formula, FormulaVersion } from "@/lib/types";

const S = MESSAGES.schedule;
const B = MESSAGES.batches;
const F = MESSAGES.formula;

/** The formula version a planned production is for. */
export function PlanSource({
  formula,
  version,
}: {
  formula: Formula;
  version: FormulaVersion;
}) {
  return (
    <section
      aria-label={S.planSourceHeading}
      className="mb-6 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold">{S.planSourceHeading}</h2>
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
    </section>
  );
}
