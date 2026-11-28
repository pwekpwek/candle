"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { batchTitle, versionHref } from "@/components/batches/text";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { calculateCost } from "@/lib/cost";
import { getDataLayer } from "@/lib/db";
import type { CostSheetDetail } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { CostLines, CostSummary } from "./cost-results";
import { DeleteSheetDialog } from "./delete-dialog";
import { basisText, sheetHref, sheetTitle } from "./text";

const M = MESSAGES.cost;

type Loaded = { status: "ok"; detail: CostSheetDetail } | { status: "missing" } | { status: "error" };

const LINK = "inline-flex min-h-11 items-center text-sm wrap-anywhere text-primary underline-offset-4 hover:underline";

/** The cost sheet page (`/costs/[sheetId]`). */
export function CostSheetView({ sheetId }: { sheetId: string }) {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const detail = await getDataLayer().costSheets.get(sheetId);
      return detail ? { status: "ok", detail } : { status: "missing" };
    } catch {
      return { status: "error" };
    }
  }, [sheetId, reload]);
  // Set once the sheet is deleted, so the page does not flash "not found" before it leaves.
  const [deleted, setDeleted] = useState(false);

  if (loaded === undefined || deleted) {
    return (
      <>
        <PageHeader title={M.pageLoadingTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {deleted ? "" : M.pageLoading}
        </p>
      </>
    );
  }
  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={M.pageLoadingTitle} />
        <Notice
          variant="error"
          action={
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              {M.tryAgain}
            </Button>
          }
        >
          {M.pageLoadFailed}
        </Notice>
      </>
    );
  }
  if (loaded.status === "missing") {
    return (
      <>
        <PageHeader title={M.notFoundTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{M.notFoundBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/costs">{M.backToSheets}</Link>
          </Button>
        </div>
      </>
    );
  }
  return <ViewBody detail={loaded.detail} onDeleted={() => setDeleted(true)} />;
}

function ViewBody({ detail, onDeleted }: { detail: CostSheetDetail; onDeleted: () => void }) {
  const { sheet, formula, version, batch, copiedFrom } = detail;
  const router = useRouter();
  const searchParams = useSearchParams();
  const here = sheetHref(sheet.id);
  const [confirming, setConfirming] = useState(false);
  // One id per visit: a retried copy cannot make a second sheet.
  const [copyId] = useState(() => crypto.randomUUID());
  const copying = useRef(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // "?copied=1" shows the notice once, then leaves the URL clean.
  const [copiedNotice] = useState(() => searchParams.get("copied") === "1");
  const hasParam = searchParams.get("copied") !== null;
  useEffect(() => {
    if (hasParam) router.replace(here);
  }, [hasParam, router, here]);

  const figures = sheet;
  const result = calculateCost(figures);
  const title = sheetTitle(sheet);

  async function copyAndUpdate() {
    if (copying.current) return;
    copying.current = true;
    setCopyBusy(true);
    setCopyFailed(false);
    try {
      await getDataLayer().costSheets.copy({ sheetId: copyId, fromId: sheet.id });
      router.push(`${sheetHref(copyId)}?copied=1`);
    } catch {
      setCopyFailed(true);
      copying.current = false;
      setCopyBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={title}
        description={M.candlesLine(sheet.candlesMade, sheet.sellable)}
        action={
          <>
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link href={`${here}/edit`}>{M.edit}</Link>
            </Button>
            <Button variant="outline" busy={copyBusy} onClick={copyAndUpdate}>
              {M.copyUpdate}
            </Button>
            <Button variant="outline" onClick={() => setConfirming(true)}>
              {M.deleteButton}
            </Button>
          </>
        }
      />
      <div className="grid gap-6">
        {copiedNotice ? <Notice variant="success">{M.copiedNotice}</Notice> : null}
        {copyFailed ? <Notice variant="error">{M.copyFailed}</Notice> : null}
        <div className="min-w-0">
          <p data-testid="cost-basis" className="text-sm wrap-anywhere text-text-secondary">
            {basisText({ sheet, formula, version, batch })}
          </p>
          <div className="flex flex-wrap items-center gap-x-4">
            {batch ? (
              <Link href={`/batches/${batch.id}`} className={LINK}>
                {M.basisBatchLink(batchTitle(batch))}
              </Link>
            ) : null}
            <Link href={versionHref(formula.id, version.id)} className={LINK}>
              {M.basisVersionLink(version.number, formula.name)}
            </Link>
            <Link href={`/formulas/${formula.id}`} className={LINK}>
              {M.formulaLink(formula.name)}
            </Link>
          </div>
          {copiedFrom ? (
            <p data-testid="cost-copied-from" className="text-sm text-text-secondary">
              {M.copiedFrom}{" "}
              <Link href={sheetHref(copiedFrom.id)} className="text-primary underline-offset-4 hover:underline">
                {sheetTitle(copiedFrom)}
              </Link>
            </p>
          ) : sheet.copiedFromId ? (
            <p data-testid="cost-copied-from" className="text-sm text-text-secondary">
              {M.copiedFromDeleted}
            </p>
          ) : null}
          {sheet.notes ? <p className="mt-2 text-sm wrap-anywhere whitespace-pre-line text-foreground">{sheet.notes}</p> : null}
        </div>
        <CostLines figures={figures} result={result} />
        <CostSummary figures={figures} result={result} />
        <p className="text-sm text-text-secondary">{M.copyUpdateHint}</p>
      </div>
      <DeleteSheetDialog
        sheetId={sheet.id}
        title={title}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => {
          setConfirming(false);
          onDeleted();
          router.replace("/costs");
        }}
      />
    </>
  );
}
