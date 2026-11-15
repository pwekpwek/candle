import { useId } from "react";
import type { ReactNode } from "react";
import {
  formatGrams,
  formatPercent2,
  formatRequestedPercent,
} from "@/lib/gramguard";
import type { Issue, Plan, PlannedComponent } from "@/lib/gramguard";
import {
  MESSAGES,
  basisWords,
  effectiveWeightsLine,
  equivalentLine,
  messageForIssue,
} from "@/lib/messages";
import { Notice } from "@/components/common/notice";
import { cn } from "@/lib/utils";

export interface ResultsPanelProps {
  /** Null while input is incomplete or invalid: then NO figures show (PRD-12). */
  plan: Plan | null;
  /** componentId to display name, as a record or a function. */
  names: Record<string, string> | ((componentId: string) => string);
  /** Result-level errors (V-14, V-15): shown in place of figures. */
  errors?: Issue[];
  /** V-08, V-09, CALC-13 and the CALC-17 note: notices above the figures. */
  warnings?: Issue[];
  /** Scale preview: the source plan. Rows show "before to after". */
  compareTo?: Plan | null;
  /** Default "Planned weights". */
  heading?: string;
  className?: string;
}

const CELL = "py-1.5 align-baseline";
const NUM = "tabular whitespace-nowrap text-right";

export function ResultsPanel({
  plan,
  names,
  errors = [],
  warnings = [],
  compareTo = null,
  heading = MESSAGES.results.plannedHeading,
  className,
}: ResultsPanelProps) {
  const headingId = useId();
  const nameOf = (id: string) =>
    typeof names === "function" ? names(id) : (names[id] ?? id);

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      <h2 id={headingId} className="mb-3 text-base font-semibold">
        {heading}
      </h2>

      {errors.length > 0 ? (
        <div className="flex flex-col gap-2">
          {errors.map((issue, i) => (
            <Notice key={`${issue.rule}-${issue.field}-${i}`} variant="error">
              {messageForIssue(issue)}
            </Notice>
          ))}
        </div>
      ) : plan === null ? (
        <p className="text-sm text-muted-foreground">
          {MESSAGES.results.incomplete}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {warnings.map((issue, i) => (
            <Notice
              key={`${issue.rule}-${issue.field}-${i}`}
              variant={issue.severity === "warning" ? "warning" : "info"}
            >
              {messageForIssue(issue)}
            </Notice>
          ))}
          <PlanTable
            plan={plan}
            compareTo={alignedCompare(plan, compareTo)}
            nameOf={nameOf}
          />
          <BlendLines plan={plan} />
        </div>
      )}
    </section>
  );
}

/** The source plan only counts when it has the same components in the same shape. */
function alignedCompare(plan: Plan, source: Plan | null): Plan | null {
  if (!source) return null;
  if (
    source.waxes.length !== plan.waxes.length ||
    source.oils.length !== plan.oils.length
  ) {
    return null;
  }
  return source;
}

function PlanTable({
  plan,
  compareTo,
  nameOf,
}: {
  plan: Plan;
  compareTo: Plan | null;
  nameOf: (id: string) => string;
}) {
  const r = MESSAGES.results;
  const grams = (mg: number) => formatGrams(mg, plan.precisionMg);
  const weight = (now: number, before: number | undefined): ReactNode => {
    if (compareTo === null || before === undefined) return grams(now);
    return (
      <>
        {formatGrams(before, compareTo.precisionMg)}{" "}
        <span aria-hidden="true">{"→"}</span>
        <span className="sr-only">{` ${r.scaleTo} `}</span> {grams(now)}
      </>
    );
  };
  const manyWaxes = plan.waxes.length > 1;
  const manyOils = plan.oils.length > 1;

  const componentRow = (
    c: PlannedComponent,
    before: PlannedComponent | undefined,
    showShare: boolean,
    indent: boolean,
  ) => {
    const name = nameOf(c.componentId);
    return (
      <tr key={c.componentId} className="border-t border-border">
        <th
          scope="row"
          title={name}
          className={cn(
            CELL,
            "w-full min-w-0 wrap-anywhere pr-3 text-left font-normal",
            indent && "pl-3",
          )}
        >
          {name}
        </th>
        <td className={cn(CELL, "pr-3", NUM, "text-muted-foreground")}>
          {showShare ? `${formatPercent2(c.shareX100)}%` : null}
        </td>
        <td className={cn(CELL, NUM)}>{weight(c.targetMg, before?.targetMg)}</td>
      </tr>
    );
  };

  const totalRow = (
    label: string,
    now: number,
    before: number | undefined,
    strong = false,
  ) => (
    <tr className="border-t border-border">
      <th
        scope="row"
        className={cn(
          CELL,
          "w-full min-w-0 wrap-anywhere pr-3 text-left",
          strong ? "font-semibold" : "font-medium",
        )}
      >
        {label}
      </th>
      <td className={CELL} />
      <td className={cn(CELL, NUM, strong ? "font-semibold" : "font-medium")}>
        {weight(now, before)}
      </td>
    </tr>
  );

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{r.tableCaption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{r.columnComponent}</th>
          <th scope="col">{r.columnShare}</th>
          <th scope="col">{r.columnWeight}</th>
        </tr>
      </thead>
      <tbody>
        {plan.waxes.map((c, i) =>
          componentRow(c, compareTo?.waxes[i], manyWaxes, false),
        )}
        {manyWaxes
          ? totalRow(r.waxTotalRow, plan.waxTotalMg, compareTo?.waxTotalMg)
          : null}
        {totalRow(
          r.fragranceRow,
          plan.fragranceTotalMg,
          compareTo?.fragranceTotalMg,
        )}
        {plan.oils.map((c, i) =>
          componentRow(c, compareTo?.oils[i], manyOils, true),
        )}
        {totalRow(r.totalRow, plan.totalMg, compareTo?.totalMg, true)}
      </tbody>
    </table>
  );
}

/** Requested percentage with basis, its equivalent, and the effective line. */
function BlendLines({ plan }: { plan: Plan }) {
  const effective =
    plan.basis === "wax" ? plan.effectiveOfWaxX100 : plan.effectiveOfTotalX100;
  return (
    <div className="flex flex-col gap-0.5 border-t border-border pt-3 text-sm">
      <p className="font-medium">
        {`${formatRequestedPercent(plan.fragranceBp)}% ${basisWords(plan.basis)}`}
      </p>
      <p className="text-muted-foreground">
        {equivalentLine(plan.equivalentX100, plan.basis)}
      </p>
      {plan.effectiveDiffers ? (
        <p className="text-muted-foreground">
          {effectiveWeightsLine(effective, plan.basis)}
        </p>
      ) : null}
    </div>
  );
}
