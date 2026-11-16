import { useId } from "react";
import {
  convertBasis,
  formatPercent2,
} from "@/lib/gramguard";
import type { MeasuredComparison } from "@/lib/gramguard";
import { MESSAGES, basisWords, equivalentLine } from "@/lib/messages";
import type { FormulaVersion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { requestedText } from "./text";

const R = MESSAGES.results;
const F = MESSAGES.formula;

const CARD = "min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground";

/** Planned blend and Actual blend, side by side from 640px, stacked below. */
export function BlendCards({
  version,
  comparison,
  names,
  className,
}: {
  version: FormulaVersion;
  comparison: MeasuredComparison;
  names: Record<string, string>;
  className?: string;
}) {
  const plannedId = useId();
  const actualId = useId();
  const { basis, fragranceBp } = version.inputs;
  const actual = comparison.actualBlend;

  // The formula's own basis first, then the other one.
  const ofWax = actual?.ofWaxX100 ?? null;
  const ofTotal = actual?.ofTotalX100 ?? null;
  const own = basis === "wax" ? ofWax : ofTotal;
  const other = basis === "wax" ? ofTotal : ofWax;

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      <section aria-labelledby={plannedId} className={CARD}>
        <h2 id={plannedId} className="mb-2 text-base font-semibold">
          {R.plannedBlendHeading}
        </h2>
        <p className="tabular text-sm">{requestedText(version)}</p>
        <p className="tabular text-sm text-text-secondary">
          {equivalentLine(convertBasis(fragranceBp, basis), basis)}
        </p>
      </section>

      <section aria-labelledby={actualId} className={CARD}>
        <h2 id={actualId} className="mb-2 text-base font-semibold">
          {R.actualBlendHeading}
        </h2>
        {actual === null ? (
          <p className="text-sm text-text-secondary">{R.enterAllMeasured}</p>
        ) : (
          <>
            {own !== null ? (
              <p className="tabular text-sm">
                {`${formatPercent2(own)}% ${basisWords(basis)}`}
              </p>
            ) : null}
            {other !== null ? (
              <p className="tabular text-sm text-text-secondary">
                {equivalentLine(other, basis)}
              </p>
            ) : null}
            {actual.oilShares.length > 0 ? (
              <>
                <h3 className="mt-3 text-sm font-semibold">{F.actualSharesHeading}</h3>
                <ul className="mt-1 text-sm">
                  {actual.oilShares.map((share) => (
                    <li key={share.componentId} className="flex justify-between gap-3">
                      <span className="min-w-0 wrap-anywhere">
                        {names[share.componentId] ?? share.componentId}
                      </span>
                      <span className="tabular whitespace-nowrap text-right">
                        {`${formatPercent2(share.shareX100)}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
