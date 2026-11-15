import type { ReactNode } from "react";
import { formatGrams } from "@/lib/gramguard";
import type { Plan } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";

export interface PlanSummaryLineProps {
  /** Null while input is incomplete: the placeholder shows instead. */
  plan: Plan | null;
  /** Shown when `plan` is null. Default: nothing. */
  placeholder?: ReactNode;
  className?: string;
}

/** Phone summary bar text: "Wax 1000.0 g · Fragrance 80.0 g". */
export function PlanSummaryLine({
  plan,
  placeholder = null,
  className,
}: PlanSummaryLineProps) {
  if (!plan) {
    return placeholder ? <p className={className}>{placeholder}</p> : null;
  }
  const { waxRow, fragranceRow, summarySeparator } = MESSAGES.results;
  return (
    <p className={className}>
      <span className="tabular whitespace-nowrap">
        {`${waxRow} ${formatGrams(plan.waxTotalMg, plan.precisionMg)}`}
      </span>
      {summarySeparator}
      <span className="tabular whitespace-nowrap">
        {`${fragranceRow} ${formatGrams(plan.fragranceTotalMg, plan.precisionMg)}`}
      </span>
    </p>
  );
}
