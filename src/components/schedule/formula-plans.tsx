"use client";

import { useId } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { formatProducedOn } from "@/components/batches/text";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { FormulaVersion, ProductionPlan } from "@/lib/types";

const S = MESSAGES.schedule;
const B = MESSAGES.batches;

type Loaded = { ok: true; plans: ProductionPlan[] } | { ok: false };

/** Open planned production entries of one formula, on the formula page. Hidden when there are none. */
export function FormulaPlans({
  formulaId,
  versions,
  className,
}: {
  formulaId: string;
  versions: readonly FormulaVersion[];
  className?: string;
}) {
  const headingId = useId();
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const plans = await getDataLayer().productionPlans.listByFormula(formulaId);
      return { ok: true, plans: plans.filter((p) => p.batchId === null) };
    } catch {
      return { ok: false };
    }
  }, [formulaId]);
  if (loaded === undefined) return null;
  if (loaded.ok && loaded.plans.length === 0) return null;
  const numberOf = new Map(versions.map((v) => [v.id, v.number]));

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="mb-2 text-lg font-semibold">
        {S.formulaPlansHeading}
      </h2>
      {!loaded.ok ? (
        <p className="text-sm text-text-secondary">{S.formulaPlansLoadFailed}</p>
      ) : (
        <ul className="border-b border-border">
          {loaded.plans.map((plan) => {
            const number = numberOf.get(plan.versionId);
            return (
              <li key={plan.id} className="border-t border-border">
                <Link
                  href={`/schedule/plan/${plan.id}`}
                  className="flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 py-2 text-sm hover:bg-muted"
                >
                  <span className="min-w-0 font-semibold wrap-anywhere">
                    {S.productionDate(formatProducedOn(plan.plannedOn))}
                  </span>
                  <span className="text-text-secondary wrap-anywhere">
                    {[
                      number !== undefined ? S.formulaPlanRow(number) : null,
                      plan.label?.trim() || null,
                    ]
                      .filter((part): part is string => part !== null)
                      .join(B.separator)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
