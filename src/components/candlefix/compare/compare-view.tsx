"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { batchTitle } from "@/components/batches/text";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { investigationHref } from "@/components/candlefix/experiments/text";
import { Button } from "@/components/ui/button";
import { buildBeforeAfter } from "@/lib/candlefix";
import { getDataLayer } from "@/lib/db";
import type { InvestigationComparisonData } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { buildRows, columnBatchName } from "./rows";
import type { CompareRow } from "./rows";
import type { BeforeAfterColumn } from "@/lib/candlefix";

const M = MESSAGES.candleFixCompare;

type Loaded = { ok: true; data: InvestigationComparisonData | undefined } | { ok: false };

/** `/investigations/<id>/compare`: the original batch beside each follow-up batch. Never ranks a column. */
export function CompareView({ investigationId }: { investigationId: string }) {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, data: await getDataLayer().investigations.comparison(investigationId) };
    } catch (error) {
      console.error(error);
      return { ok: false };
    }
  }, [investigationId, reload]);

  const model = useMemo(() => (loaded?.ok && loaded.data ? buildBeforeAfter(loaded.data) : null), [loaded]);
  const back = (
    <Button asChild variant="outline" className="pointer-coarse:min-h-11">
      <Link href={investigationHref(investigationId)}>{M.backToInvestigation}</Link>
    </Button>
  );

  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={M.title} />
        <p role="status" className="text-sm text-text-secondary">
          {M.loading}
        </p>
      </>
    );
  }
  if (!loaded.ok) {
    return (
      <>
        <PageHeader title={M.title} />
        <Notice
          variant="error"
          title={M.loadFailedTitle}
          action={
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              {M.tryAgain}
            </Button>
          }
        >
          {M.loadFailed}
        </Notice>
      </>
    );
  }
  if (!loaded.data || model === null) {
    return (
      <>
        <PageHeader title={M.notFoundTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{M.notFoundBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/investigations">{M.listTitle}</Link>
          </Button>
        </div>
      </>
    );
  }

  const { investigation, original } = loaded.data;
  const name = investigation.title?.trim() || batchTitle(original.item.batch);
  const header = (
    <PageHeader
      title={M.title}
      description={M.description(name, batchTitle(original.item.batch))}
      action={back}
    />
  );

  if (loaded.data.experiments.length === 0) {
    return (
      <>
        {header}
        <Notice variant="info" title={M.noExperimentsTitle} action={back}>
          {M.noExperimentsBody}
        </Notice>
      </>
    );
  }

  const rows = buildRows(model);
  return (
    <>
      {header}
      <div data-testid="before-after" className="min-w-0">
        <div className="hidden sm:block">
          <Table columns={model.columns} rows={rows} />
        </div>
        <div className="sm:hidden">
          <Cards columns={model.columns} rows={rows} />
        </div>
      </div>
    </>
  );
}

function columnTag(column: BeforeAfterColumn): string {
  return column.role === "original" ? M.before : M.after;
}

const CELL = "border-b border-border px-3 py-2 align-top text-sm break-words";
const HEAD = "border-b border-border bg-muted px-3 py-2 text-left align-top text-sm font-semibold";

function Table({ columns, rows }: { columns: BeforeAfterColumn[]; rows: CompareRow[] }) {
  return (
    <div
      role="region"
      aria-label={M.tableCaption}
      tabIndex={0}
      className="relative max-w-full overflow-x-auto rounded-lg border border-border bg-card"
    >
      <table data-testid="before-after-table" className="w-max min-w-full border-collapse text-left">
        <caption className="px-3 py-2 text-left text-sm text-text-secondary">{M.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} sticky left-0 z-10 min-w-32`}>
              {M.rowLabel}
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                data-testid="before-after-column"
                className={`${HEAD} min-w-48 border-l border-border`}
              >
                <span className="block">{columnTag(column)}</span>
                <span className="block font-normal wrap-anywhere text-text-secondary">{columnBatchName(column)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className={`${HEAD} sticky left-0 z-10 min-w-32`}>
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td key={columns[i].key} className={`${CELL} border-l border-border`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ columns, rows }: { columns: BeforeAfterColumn[]; rows: CompareRow[] }) {
  return (
    <ul aria-label={M.cardsLabel} data-testid="before-after-cards" className="flex flex-col gap-3">
      {columns.map((column, index) => (
        <li
          key={column.key}
          data-testid="before-after-card"
          aria-label={`${columnTag(column)}: ${columnBatchName(column)}`}
          className="min-w-0 rounded-lg border border-border bg-card p-4"
        >
          <h2 className="text-base font-semibold wrap-anywhere">
            {columnTag(column)}
            <span className="font-normal text-text-secondary">
              {M.separator}
              {M.columnLabel(index + 1, columns.length)}
            </span>
          </h2>
          <dl className="mt-3 grid gap-3">
            {rows.map((row) => (
              <div key={row.key} className="grid min-w-0 gap-0.5 text-sm">
                <dt className="font-semibold text-text-secondary">{row.label}</dt>
                <dd className="min-w-0">{row.cells[index]}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
