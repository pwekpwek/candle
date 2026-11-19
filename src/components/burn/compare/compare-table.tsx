"use client";

import { Fragment } from "react";
import { formatProducedOn } from "@/components/batches/text";
import type { ComparisonModel } from "@/lib/burnmatrix";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { batchName, metricLabel, sessionTitle } from "./text";

const M = MESSAGES.burnCompare;

const CELL =
  "border-b border-border px-3 py-2 align-top text-sm break-words whitespace-pre-wrap print:border-black print:px-1.5 print:py-1 print:text-[8pt]";
const HEAD =
  "border-b border-border bg-muted px-3 py-2 text-left align-top text-sm font-semibold print:border-black print:bg-transparent print:px-1.5 print:py-1 print:text-[8pt]";

/**
 * The comparison table: a column per candle, grouped by session. Plain text,
 * no ranking, no colour on values. On screen it sits in its own horizontally
 * scrolling region (the page itself never scrolls sideways); in print it
 * shrinks to the page width and wraps text.
 */
export function CompareTable({
  model,
  variant = "screen",
}: {
  model: ComparisonModel;
  variant?: "screen" | "print";
}) {
  const print = variant === "print";
  const rowHead = cn(HEAD, "min-w-32 print:min-w-0", !print && "sticky left-0 z-10");
  const columnIndex = new Map(model.columns.map((c, i) => [c.key, i]));
  return (
    <div
      role="region"
      aria-label={M.tableCaption}
      tabIndex={0}
      data-testid="compare-scroll"
      className="relative max-w-full overflow-x-auto rounded-lg border border-border bg-card print:overflow-visible print:rounded-none print:border-0"
    >
      <table
        data-testid="compare-table"
        className="w-max min-w-full border-collapse text-left print:w-full print:min-w-0 print:table-fixed"
      >
        <caption className="px-3 py-2 text-left text-sm text-text-secondary print:px-1.5 print:text-[8pt] print:text-black">
          {M.tableCaption}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={rowHead}>
              {M.sessionColumn}
            </th>
            {model.groups.map((group) => (
              <th
                key={group.sessionId}
                scope="colgroup"
                colSpan={group.columns.length}
                className={cn(HEAD, "border-l border-border print:border-black")}
              >
                <span className="block break-words">
                  {sessionTitle({ label: group.sessionLabel ?? undefined, testedOn: group.testedOn })}
                </span>
                {group.sessionLabel ? (
                  <span className="block font-normal text-text-secondary print:text-black">
                    <time dateTime={group.testedOn}>{formatProducedOn(group.testedOn)}</time>
                  </span>
                ) : null}
                <span className="block font-normal break-words text-text-secondary print:text-black">
                  {batchName({ id: group.batchId, label: group.batchLabel ?? undefined })}
                </span>
                <span className="block font-normal break-words text-text-secondary print:text-black">
                  {group.formulaName}
                  {M.separator}
                  {M.versionText(group.versionNumber)}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            <th scope="col" className={rowHead}>
              {M.candleColumn}
            </th>
            {model.groups.map((group) =>
              group.columns.map((column, i) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    HEAD,
                    "min-w-36 print:min-w-0",
                    i === 0 && "border-l border-border print:border-black",
                  )}
                >
                  {column.candleLabel}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.metric} className="break-inside-avoid">
              <th scope="row" className={rowHead}>
                {metricLabel(row.metric)}
              </th>
              {model.groups.map((group) => (
                <Fragment key={group.sessionId}>
                  {group.columns.map((column, i) => {
                    const text = row.cells[columnIndex.get(column.key) ?? -1] ?? "";
                    return (
                      <td
                        key={column.key}
                        className={cn(CELL, i === 0 && "border-l border-border print:border-black")}
                      >
                        {text === "" ? (
                          <>
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">{M.notRecorded}</span>
                          </>
                        ) : (
                          text
                        )}
                      </td>
                    );
                  })}
                </Fragment>
              ))}
            </tr>
          ))}
          <tr className="break-inside-avoid">
            <th scope="row" className={rowHead}>
              {M.makerConclusion}
            </th>
            {model.groups.map((group) => (
              <td
                key={group.sessionId}
                colSpan={group.columns.length}
                className={cn(CELL, "border-l border-border print:border-black")}
              >
                {group.conclusion ?? (
                  <span className="text-text-secondary print:text-black">{M.noConclusion}</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
