import type { ReactNode } from "react";
import Link from "next/link";
import { formatProducedOn, versionHref } from "@/components/batches/text";
import { batchName, sootText } from "@/components/burn/compare/text";
import type { BeforeAfterColumn, BeforeAfterModel } from "@/lib/candlefix";
import { formatDuration, formatMm, formatRate } from "@/lib/burnmatrix";
import { formatGrams } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import { statusLabel } from "@/components/candlefix/experiments/text";

const M = MESSAGES.candleFixCompare;
const F = MESSAGES.candleFix;

export type CompareRow = { key: string; label: string; cells: ReactNode[] };

const link = "text-primary underline-offset-4 wrap-anywhere hover:underline";

function notRecorded(): ReactNode {
  return <span className="text-text-secondary">{M.notRecorded}</span>;
}

function plain(text: string): ReactNode {
  return <span className="tabular-nums">{text}</span>;
}

/** The label of a column's batch: its label, else "Batch 3F2A91C0". */
export function columnBatchName(column: BeforeAfterColumn): string {
  return batchName({ id: column.batchId, label: column.batchLabel ?? undefined });
}

function issuesCell(column: BeforeAfterColumn): ReactNode {
  if (column.observed.length === 0) return <span className="text-text-secondary">{M.noneRecorded}</span>;
  return (
    <ul className="grid gap-1">
      {column.observed.map((o) => {
        const names = o.issues.map((issue) =>
          issue === "other" && o.otherIssue ? o.otherIssue : F.issueLabels[issue],
        );
        return <li key={o.investigationId}>{M.issueLine(names.join(", "), formatProducedOn(o.observedOn))}</li>;
      })}
    </ul>
  );
}

function hypothesisCell(column: BeforeAfterColumn): ReactNode {
  if (column.role === "original") return <span className="text-text-secondary">{M.notApplicable}</span>;
  if (!column.hypothesis) return <span className="text-text-secondary">{M.hypothesisGone}</span>;
  return (
    <span className="wrap-anywhere">
      <span className="font-semibold">{F.hypothesisLabel}: </span>
      {M.hypothesisLine(column.hypothesis.text, statusLabel(column.hypothesis.status))}
    </span>
  );
}

function changeCell(column: BeforeAfterColumn): ReactNode {
  if (column.role === "original") return <span className="text-text-secondary">{M.notApplicable}</span>;
  if (!column.change) return <span className="text-text-secondary">{M.noChange}</span>;
  return <span className="whitespace-pre-wrap wrap-anywhere">{column.change}</span>;
}

/** The rows of the before-and-after view, shared by the table and the phone cards. */
export function buildRows(model: BeforeAfterModel): CompareRow[] {
  const cols = model.columns;
  const row = (key: string, label: string, cell: (c: BeforeAfterColumn) => ReactNode): CompareRow => ({
    key,
    label,
    cells: cols.map(cell),
  });
  return [
    row("batch", M.rowBatch, (c) => (
      <Link href={`/batches/${c.batchId}`} className={link}>
        {columnBatchName(c)}
      </Link>
    )),
    row("formula", M.rowFormula, (c) => (
      <span className="wrap-anywhere">
        {c.formulaName}
        {M.separator}
        <Link href={versionHref(c.formulaId, c.versionId)} className={link}>
          {M.versionText(c.versionNumber)}
        </Link>
      </span>
    )),
    row("producedOn", M.rowProducedOn, (c) => <time dateTime={c.producedOn}>{formatProducedOn(c.producedOn)}</time>),
    row("hypothesis", M.rowHypothesis, hypothesisCell),
    row("change", M.rowChange, changeCell),
    row("issues", M.rowIssues, issuesCell),
    row("burnTests", M.rowBurnTests, (c) => plain(String(c.burn.sessionCount))),
    row("candles", M.rowCandles, (c) => plain(String(c.burn.candleCount))),
    row("burns", M.rowBurns, (c) => plain(String(c.burn.burnCount))),
    row("totalTime", M.rowTotalTime, (c) =>
      c.burn.burnCount === 0 ? notRecorded() : plain(formatDuration(c.burn.totalMinutes)),
    ),
    row("totalLoss", M.rowTotalLoss, (c) =>
      c.burn.totalLossMg === null ? notRecorded() : plain(formatGrams(c.burn.totalLossMg, 10)),
    ),
    row("averageRate", M.rowAverageRate, (c) =>
      c.burn.averageMgPerHour === null ? notRecorded() : plain(formatRate(c.burn.averageMgPerHour)),
    ),
    row("meltPool", M.rowMeltPool, (c) =>
      c.burn.largestMeltPoolDiameterMm === null ? notRecorded() : plain(formatMm(c.burn.largestMeltPoolDiameterMm)),
    ),
    row("flame", M.rowFlame, (c) =>
      c.burn.maxFlameHeightMm === null ? notRecorded() : plain(formatMm(c.burn.maxFlameHeightMm)),
    ),
    row("soot", M.rowSoot, (c) =>
      c.burn.sootLevels.length === 0 ? notRecorded() : <span>{sootText(c.burn.sootLevels)}</span>,
    ),
  ];
}
