"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DownloadIcon, FileTextIcon, ListChecksIcon } from "lucide-react";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { downloadBurnCsv } from "@/components/burn/export/csv";
import { buildComparison } from "@/lib/burnmatrix";
import { MESSAGES } from "@/lib/messages";
import { CompareTable } from "./compare-table";
import { compareHref, parseSessionIds, sootText } from "./text";
import { useBurnSessions } from "./use-sessions";

const M = MESSAGES.burnCompare;

/** `/burn-tests/compare?sessions=a,b`: one to four burn tests side by side. */
export function CompareView({ sessionsParam }: { sessionsParam: string | null }) {
  const { ids, truncated } = useMemo(() => parseSessionIds(sessionsParam), [sessionsParam]);
  const { state, reload } = useBurnSessions(ids, false);
  const [csvError, setCsvError] = useState(false);

  const model = useMemo(
    () => (state.status === "ready" ? buildComparison(state.sessions, sootText) : null),
    [state],
  );

  const changeLink = (
    <Button asChild variant="outline">
      <Link href="/burn-tests">
        <ListChecksIcon aria-hidden="true" />
        {M.actionChangeSelection}
      </Link>
    </Button>
  );

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={M.compareTitle} description={M.compareDescription} />
        <Notice variant="info" title={M.compareNoneTitle} action={changeLink}>
          {M.compareNoneBody}
        </Notice>
      </>
    );
  }

  if (state.status === "loading") {
    return (
      <>
        <PageHeader title={M.compareTitle} description={M.compareDescription} />
        <p role="status" className="text-sm text-text-secondary">
          {M.compareLoading}
        </p>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <PageHeader title={M.compareTitle} />
        <Notice
          variant="error"
          title={M.compareLoadFailedTitle}
          action={
            <Button variant="outline" onClick={reload}>
              {M.tryAgain}
            </Button>
          }
        >
          {M.compareLoadFailed}
        </Notice>
      </>
    );
  }

  if (state.sessions.length === 0 || model === null) {
    return (
      <>
        <PageHeader title={M.compareTitle} description={M.compareDescription} />
        <Notice variant="warning" title={M.compareNotFoundTitle} action={changeLink}>
          {M.compareNotFoundBody}
        </Notice>
      </>
    );
  }

  const found = state.sessions;
  const foundIds = found.map((s) => s.session.id);

  function onCsv() {
    setCsvError(false);
    try {
      downloadBurnCsv(found);
    } catch (error) {
      console.error(error);
      setCsvError(true);
    }
  }

  return (
    <>
      <PageHeader
        title={M.compareTitle}
        description={M.compareDescription}
        action={
          <>
            <Button asChild variant="outline">
              <Link href={compareHref(foundIds, true)}>
                <FileTextIcon aria-hidden="true" />
                {M.actionReport}
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={onCsv}>
              <DownloadIcon aria-hidden="true" />
              {M.actionDownloadCsv}
            </Button>
            {changeLink}
          </>
        }
      />
      <div className="grid min-w-0 gap-4">
        {truncated ? <Notice variant="info">{M.compareTruncated(ids.length)}</Notice> : null}
        {state.missing.length > 0 ? (
          <Notice variant="warning">{M.compareSomeMissing(state.missing)}</Notice>
        ) : null}
        {csvError ? <Notice variant="error">{M.csvFailed}</Notice> : null}
        <CompareTable model={model} />
      </div>
    </>
  );
}
