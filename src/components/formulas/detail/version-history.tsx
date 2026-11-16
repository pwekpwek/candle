import { useId } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { formatAbsoluteDate } from "@/lib/time";
import { formatGrams } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import type { Formula, FormulaVersion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { originRow, requestedText } from "./text";

const F = MESSAGES.formula;

/** Where a version lives: the latest on the formula page, the rest on the version view. */
export function versionHref(formula: Formula, version: FormulaVersion): string {
  return version.number === formula.latestVersionNumber
    ? `/formulas/${formula.id}`
    : `/formulas/${formula.id}/versions/${version.id}`;
}

/** Every version, highest number first (PRD-16). The one on screen has aria-current. */
export function VersionHistory({
  formula,
  versions,
  currentId,
  now,
  className,
}: {
  formula: Formula;
  /** Highest number first. */
  versions: readonly FormulaVersion[];
  currentId: string;
  now: Date;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="mb-2 text-lg font-semibold">
        {F.versionsHeading}
      </h2>
      <ul className="border-b border-border">
        {versions.map((version) => {
          const current = version.id === currentId;
          return (
            <li key={version.id} className="border-t border-border">
              <Link
                href={versionHref(formula, version)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "grid min-h-11 items-baseline gap-x-3 gap-y-0.5 px-1 py-2 text-sm hover:bg-muted",
                  "grid-cols-[auto_minmax(0,1fr)_auto]",
                  "sm:grid-cols-[2.5rem_minmax(0,1fr)_5rem_6.5rem_11rem_1rem]",
                  current && "font-semibold",
                )}
              >
                <span className="tabular">{F.versionNumber(version.number)}</span>
                <span className="min-w-0 wrap-anywhere">
                  {originRow(version, versions)}
                  {current ? (
                    <span className="ml-2 rounded-sm border border-border px-1.5 py-0.5 text-xs font-normal text-text-secondary">
                      {F.viewing}
                    </span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap text-text-secondary sm:text-foreground">
                  {formatAbsoluteDate(version.createdAt, now)}
                </span>
                <span className="col-span-2 col-start-2 flex flex-wrap gap-x-3 text-text-secondary sm:contents">
                  <span className="tabular whitespace-nowrap sm:text-right sm:text-foreground">
                    {formatGrams(version.targets.totalMg, version.inputs.precisionMg)}
                  </span>
                  <span className="whitespace-nowrap">{requestedText(version)}</span>
                </span>
                <ChevronRightIcon
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="size-4 self-center text-muted-foreground max-sm:hidden"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
