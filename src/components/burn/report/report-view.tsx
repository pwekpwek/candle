"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { CompareTable } from "@/components/burn/compare/compare-table";
import { compareHref, formatToday, parseSessionIds, sootText } from "@/components/burn/compare/text";
import { useBurnSessions } from "@/components/burn/compare/use-sessions";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { buildComparison } from "@/lib/burnmatrix";
import { MESSAGES } from "@/lib/messages";
import type { BurnPhoto } from "@/lib/types";
import { SessionReport } from "./report-session";

const M = MESSAGES.burnCompare;

// Paper margins for the printed report. The app shell is hidden in print by
// `print:hidden` classes on the side nav, phone bar and skip link.
const NO_PHOTOS: BurnPhoto[] = [];

const PRINT_CSS = "@media print { @page { margin: 14mm; } }";

/**
 * Printable report. `sessionsParam` is the raw `?sessions=` text for the
 * comparison report; `sessionId` is set for a single session's report.
 */
export function ReportView({
  sessionId,
  sessionsParam,
}: {
  sessionId?: string;
  sessionsParam?: string | null;
}) {
  const compare = sessionId === undefined;
  const { ids, truncated } = useMemo(
    () => (sessionId !== undefined ? { ids: [sessionId], truncated: false } : parseSessionIds(sessionsParam ?? null)),
    [sessionId, sessionsParam],
  );
  const { state, reload } = useBurnSessions(ids, true);
  const title = compare ? M.reportCompareTitle : M.reportSessionTitle;
  const backHref = compare ? compareHref(ids) : `/burn-tests/${sessionId}`;

  const model = useMemo(
    () => (compare && state.status === "ready" && state.sessions.length > 0 ? buildComparison(state.sessions, sootText) : null),
    [compare, state],
  );

  const back = (
    <Button asChild variant="outline">
      <Link href={compare && ids.length === 0 ? "/burn-tests" : backHref}>
        <ArrowLeftIcon aria-hidden="true" />
        {M.reportBack}
      </Link>
    </Button>
  );

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={title} />
        <Notice variant="info" title={M.compareNoneTitle} action={back}>
          {M.compareNoneBody}
        </Notice>
      </>
    );
  }

  if (state.status === "loading") {
    return (
      <>
        <PageHeader title={title} />
        <p role="status" className="text-sm text-text-secondary">
          {M.reportLoading}
        </p>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <PageHeader title={title} />
        <Notice
          variant="error"
          title={M.reportLoadFailedTitle}
          action={
            <Button variant="outline" onClick={reload}>
              {M.tryAgain}
            </Button>
          }
        >
          {M.reportLoadFailed}
        </Notice>
      </>
    );
  }

  if (state.sessions.length === 0) {
    return (
      <>
        <PageHeader title={title} />
        <Notice variant="warning" title={compare ? M.compareNotFoundTitle : M.reportNotFoundTitle} action={back}>
          {compare ? M.compareNotFoundBody : M.reportNotFoundBody}
        </Notice>
      </>
    );
  }

  const total = state.sessions.length;
  return (
    <article data-testid="report" className="grid min-w-0 gap-5 print:gap-4 print:text-black print:[&_*]:text-black!">
      <style>{PRINT_CSS}</style>
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight wrap-anywhere print:text-[16pt]">{title}</h1>
        <p className="text-sm text-text-secondary print:text-[9pt]">{M.reportGenerated(formatToday())}</p>
        <p className="text-sm print:text-[9pt]">{M.reportObservationsNote}</p>
      </header>
      <div className="flex flex-wrap items-center gap-2 print:hidden" data-testid="report-actions">
        <Button type="button" onClick={() => window.print()}>
          <PrinterIcon aria-hidden="true" />
          {M.reportPrint}
        </Button>
        {back}
      </div>
      {truncated ? (
        <Notice variant="info" className="print:hidden">
          {M.compareTruncated(ids.length)}
        </Notice>
      ) : null}
      {state.missing.length > 0 ? (
        <Notice variant="warning" className="print:hidden">
          {M.compareSomeMissing(state.missing)}
        </Notice>
      ) : null}
      {model ? (
        <section aria-label={M.reportComparisonHeading} className="grid min-w-0 gap-2">
          <h2 className="text-lg font-semibold break-after-avoid print:text-[13pt]">{M.reportComparisonHeading}</h2>
          <CompareTable model={model} variant="print" />
        </section>
      ) : null}
      {state.sessions.map((detail, i) => (
        <div
          key={detail.session.id}
          className={i > 0 || model ? "border-t-2 border-border pt-5 print:break-before-page print:border-0 print:pt-0" : ""}
        >
          <SessionReport
            detail={detail}
            photos={state.photos[detail.session.id] ?? NO_PHOTOS}
            heading={total > 1 ? M.reportSessionHeading(i + 1, total) : undefined}
          />
        </div>
      ))}
    </article>
  );
}
