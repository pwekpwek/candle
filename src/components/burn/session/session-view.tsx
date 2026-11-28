"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArchivedBadge } from "@/components/batches/archived-badge";
import { batchTitle, formatProducedOn, versionHref } from "@/components/batches/text";
import { PhotoSection } from "@/components/burn/photos";
import { downloadBurnCsv } from "@/components/burn/export/csv";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { milestoneName } from "@/components/schedule/names";
import { Button } from "@/components/ui/button";
import {
  burnFigures,
  candleTotals,
  formatDuration,
  formatMm,
  formatRate,
} from "@/lib/burnmatrix";
import { getDataLayer } from "@/lib/db";
import type { BurnSessionDetail } from "@/lib/db";
import { formatGrams } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import { milestoneDueOn } from "@/lib/schedule";
import type { BurnCandle, BurnRecord } from "@/lib/types";
import { DeleteSessionDialog } from "./delete-dialog";
import { sessionTitle } from "./text";

const M = MESSAGES.burn;

type Loaded = { status: "ok"; detail: BurnSessionDetail } | { status: "missing" } | { status: "error" };

/** The session page (`/burn-tests/[sessionId]`). */
export function SessionView({ sessionId }: { sessionId: string }) {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const detail = await getDataLayer().burnSessions.get(sessionId);
      return detail ? { status: "ok", detail } : { status: "missing" };
    } catch {
      return { status: "error" };
    }
  }, [sessionId, reload]);
  // Set once the session is deleted, so the page does not flash "not found" before it leaves.
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
          {M.editorLoadFailed}
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
            <Link href="/batches">{M.backToBatches}</Link>
          </Button>
        </div>
      </>
    );
  }
  return <ViewBody detail={loaded.detail} onDeleted={() => setDeleted(true)} />;
}

function ViewBody({ detail, onDeleted }: { detail: BurnSessionDetail; onDeleted: () => void }) {
  const { session, batch, formula, version, milestone } = detail;
  const router = useRouter();
  const searchParams = useSearchParams();
  const here = `/burn-tests/${session.id}`;
  const [confirming, setConfirming] = useState(false);
  const [csvFailed, setCsvFailed] = useState(false);

  // "?saved=1" shows the confirmation once, then leaves the URL clean.
  const [savedNotice] = useState(() => searchParams.get("saved") === "1");
  const hasParam = searchParams.get("saved") !== null;
  useEffect(() => {
    if (hasParam) router.replace(here, { scroll: false });
  }, [hasParam, router, here]);

  function download() {
    setCsvFailed(false);
    try {
      downloadBurnCsv([detail]);
    } catch {
      setCsvFailed(true);
    }
  }

  const title = sessionTitle(session);

  return (
    <>
      <PageHeader
        title={title}
        description={
          <>
            {M.onBatch}{" "}
            <Link href={`/batches/${batch.id}`} className="underline-offset-4 hover:underline">
              {batchTitle(batch)}
            </Link>
            {MESSAGES.batches.separator}
            <Link href={`/formulas/${formula.id}`} className="underline-offset-4 hover:underline">
              {formula.name}
            </Link>
            {MESSAGES.batches.separator}
            <Link
              href={versionHref(formula.id, version.id)}
              className="underline-offset-4 hover:underline"
            >
              {M.versionText(version.number)}
            </Link>
            {formula.archivedAt !== null ? <ArchivedBadge /> : null}
            {MESSAGES.batches.separator}
            <time dateTime={session.testedOn}>{formatProducedOn(session.testedOn)}</time>
          </>
        }
        action={
          <>
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link href={`${here}/edit`}>{M.edit}</Link>
            </Button>
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link href={`${here}/report`}>{M.report}</Link>
            </Button>
            <Button variant="outline" className="pointer-coarse:min-h-11" onClick={download}>
              {M.downloadCsv}
            </Button>
            <Button
              variant="outline"
              className="pointer-coarse:min-h-11"
              onClick={() => setConfirming(true)}
            >
              {M.delete}
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {savedNotice ? <Notice variant="success">{M.savedNotice}</Notice> : null}
        {csvFailed ? <Notice variant="error">{M.csvFailed}</Notice> : null}
      </div>

      {milestone ? (
        <section aria-labelledby="burn-planned" className="mb-6">
          <h2 id="burn-planned" className="mb-1 text-lg font-semibold">
            {M.plannedHeading}
          </h2>
          <p className="text-sm text-foreground">
            {M.plannedLine(
              milestoneName(milestone),
              formatProducedOn(milestoneDueOn(batch.producedOn, milestone.offsetDays)),
            )}
          </p>
          <p className="text-sm text-text-secondary">
            {milestone.doneOn ? M.plannedDoneOn(formatProducedOn(milestone.doneOn)) : M.plannedNotDone}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="burn-candles" className="flex min-w-0 flex-col gap-6">
        <h2 id="burn-candles" className="text-lg font-semibold">
          {M.candlesSectionHeading}
        </h2>
        {session.candles.map((candle) => (
          <CandleSection key={candle.id} candle={candle} />
        ))}
      </section>

      {session.conclusion ? (
        <TextSection heading={M.conclusionHeading} text={session.conclusion} />
      ) : null}
      {session.notes ? <TextSection heading={M.notesHeading} text={session.notes} /> : null}

      <div className="mt-8">
        <PhotoSection sessionId={session.id} />
      </div>

      <DeleteSessionDialog
        sessionId={session.id}
        title={title}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => {
          onDeleted();
          router.replace(`/batches/${batch.id}`);
        }}
      />
    </>
  );
}

function TextSection({ heading, text }: { heading: string; text: string }) {
  return (
    <section className="mt-8">
      <h2 className="mb-1 text-lg font-semibold">{heading}</h2>
      <p className="max-w-[70ch] text-sm whitespace-pre-wrap wrap-anywhere text-foreground">{text}</p>
    </section>
  );
}

const grams = (mg: number | undefined) => (mg === undefined ? M.notRecorded : formatGrams(mg, 10));

function CandleSection({ candle }: { candle: BurnCandle }) {
  const totals = candleTotals(candle);
  return (
    <article data-testid="candle-section" className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
      <h3 className="text-base font-semibold wrap-anywhere">{candle.label}</h3>
      <p className="text-sm text-text-secondary wrap-anywhere">{M.wickLine(candle.wick.name)}</p>

      {candle.burns.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">{M.burnsNone}</p>
      ) : (
        // Its own scroll area, so a wide table never widens the page.
        <div
          role="region"
          aria-label={`${candle.label}: ${M.burnsHeading}`}
          tabIndex={0}
          className="mt-3 max-w-full overflow-x-auto"
        >
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                {[
                  M.columnBurn,
                  M.columnTime,
                  M.columnBefore,
                  M.columnAfter,
                  M.columnLoss,
                  M.columnRate,
                  M.columnMelt,
                  M.columnFlame,
                  M.columnSoot,
                  M.columnNotes,
                ].map((name) => (
                  <th key={name} scope="col" className="px-2 py-2 font-semibold">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candle.burns.map((burn, index) => (
                <BurnRow key={burn.id} burn={burn} number={index + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 grid gap-0.5 text-sm text-foreground">
        <h4 className="font-semibold">{M.totalsHeading}</h4>
        <p>{M.totalBurns(totals.burnCount)}</p>
        {totals.burnCount > 0 ? <p>{M.totalTime(formatDuration(totals.totalMinutes))}</p> : null}
        {totals.totalLossMg !== null ? <p>{M.totalLoss(formatGrams(totals.totalLossMg, 10))}</p> : null}
        {totals.averageMgPerHour !== null ? <p>{M.averageRate(formatRate(totals.averageMgPerHour))}</p> : null}
        {totals.lastMeltPoolDiameterMm !== null ? <p>{M.lastMelt(formatMm(totals.lastMeltPoolDiameterMm))}</p> : null}
        {totals.maxMeltPoolDepthMm !== null ? <p>{M.maxDepth(formatMm(totals.maxMeltPoolDepthMm))}</p> : null}
        {totals.maxFlameHeightMm !== null ? <p>{M.maxFlame(formatMm(totals.maxFlameHeightMm))}</p> : null}
        {totals.sootLevels.length > 0 ? (
          <p>{M.sootSeen(totals.sootLevels.map((l) => M.soot[l].toLowerCase()).join(", "))}</p>
        ) : null}
        {totals.weighedBurnCount > 0 ? (
          <p className="text-text-secondary">{M.totalsNote}</p>
        ) : null}
      </div>

      {candle.coldThrow ? <Note heading={M.coldThrowHeading} text={candle.coldThrow} /> : null}
      {candle.hotThrow ? <Note heading={M.hotThrowHeading} text={candle.hotThrow} /> : null}
      {candle.notes ? <Note heading={M.candleNotesHeading} text={candle.notes} /> : null}
    </article>
  );
}

function Note({ heading, text }: { heading: string; text: string }) {
  return (
    <div className="mt-3 text-sm">
      <h4 className="font-semibold">{heading}</h4>
      <p className="whitespace-pre-wrap wrap-anywhere text-foreground">{text}</p>
    </div>
  );
}

function BurnRow({ burn, number }: { burn: BurnRecord; number: number }) {
  const figures = burnFigures(burn);
  const mm = (value: number | undefined) => (value === undefined ? null : formatMm(value));
  const melt = M.meltCell(mm(burn.meltPoolDiameterMm), mm(burn.meltPoolDepthMm));
  const dash = M.notRecorded;
  return (
    <tr className="border-b border-border align-top last:border-b-0" data-testid="burn-row">
      <td className="px-2 py-2">{number}</td>
      <td className="px-2 py-2 whitespace-nowrap">{formatDuration(burn.durationMin)}</td>
      <td className="px-2 py-2 whitespace-nowrap">{grams(burn.weightBeforeMg)}</td>
      <td className="px-2 py-2 whitespace-nowrap">{grams(burn.weightAfterMg)}</td>
      <td className="px-2 py-2 whitespace-nowrap">
        {figures.weightLossMg === null ? dash : formatGrams(figures.weightLossMg, 10)}
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        {figures.mgPerHour === null ? dash : formatRate(figures.mgPerHour)}
      </td>
      <td className="px-2 py-2">{melt === "" ? dash : melt}</td>
      <td className="px-2 py-2 whitespace-nowrap">{mm(burn.flameHeightMm) ?? dash}</td>
      <td className="px-2 py-2">{burn.soot ? M.soot[burn.soot] : dash}</td>
      <td className="max-w-[16rem] px-2 py-2 whitespace-pre-wrap wrap-anywhere">{burn.notes ?? ""}</td>
    </tr>
  );
}
