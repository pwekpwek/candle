"use client";

import type { ReactNode } from "react";
import { PhotoGrid } from "@/components/burn/photos";
import { batchName, sessionTitle, sootName, sootText } from "@/components/burn/compare/text";
import { formatProducedOn } from "@/components/batches/text";
import { burnFigures, candleTotals, formatDuration, formatMm, formatRate } from "@/lib/burnmatrix";
import type { BurnSessionDetail } from "@/lib/db";
import { formatGrams } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import type { BurnCandle, BurnPhoto, BurnRecord } from "@/lib/types";

const M = MESSAGES.burnCompare;
const DASH = "—";

const TH =
  "border border-border bg-muted px-2 py-1.5 text-left align-top text-sm font-semibold print:border-black print:bg-transparent print:px-1 print:py-0.5 print:text-[8pt]";
const TD =
  "border border-border px-2 py-1.5 align-top text-sm break-words whitespace-pre-wrap print:border-black print:px-1 print:py-0.5 print:text-[8pt]";

const grams = (mg: number | undefined | null) => (mg === undefined || mg === null ? DASH : formatGrams(mg, 10));
const mm = (value: number | undefined) => (value === undefined ? DASH : formatMm(value));

function meltPoolText(burn: BurnRecord): string {
  if (burn.meltPoolDiameterMm === undefined && burn.meltPoolDepthMm === undefined) return DASH;
  return `${mm(burn.meltPoolDiameterMm)} / ${mm(burn.meltPoolDepthMm)}`;
}

function BurnsTable({ candle }: { candle: BurnCandle }) {
  if (candle.burns.length === 0) {
    return <p className="text-sm text-text-secondary print:text-[9pt]">{M.reportNoBurns}</p>;
  }
  return (
    <table className="w-max min-w-full border-collapse text-left print:w-full print:min-w-0 print:table-fixed">
      <caption className="sr-only">{M.reportBurnsCaption(candle.label)}</caption>
      <thead>
        <tr>
          <th scope="col" className={`${TH} print:w-[6%]`}>
            {M.reportColNumber}
          </th>
          <th scope="col" className={TH}>
            {M.reportColDuration}
          </th>
          <th scope="col" className={TH}>
            {M.reportColBefore}
          </th>
          <th scope="col" className={TH}>
            {M.reportColAfter}
          </th>
          <th scope="col" className={TH}>
            {M.reportColLoss}
          </th>
          <th scope="col" className={TH}>
            {M.reportColRate}
          </th>
          <th scope="col" className={TH}>
            {M.reportColMeltPool}
          </th>
          <th scope="col" className={TH}>
            {M.reportColFlame}
          </th>
          <th scope="col" className={TH}>
            {M.reportColSoot}
          </th>
          <th scope="col" className={`${TH} min-w-48 print:w-[22%] print:min-w-0`}>
            {M.reportColNotes}
          </th>
        </tr>
      </thead>
      <tbody>
        {candle.burns.map((burn, i) => {
          const figures = burnFigures(burn);
          return (
            <tr key={burn.id} className="break-inside-avoid">
              <th scope="row" className={TH}>
                {i + 1}
              </th>
              <td className={TD}>{formatDuration(burn.durationMin)}</td>
              <td className={TD}>{grams(burn.weightBeforeMg)}</td>
              <td className={TD}>{grams(burn.weightAfterMg)}</td>
              <td className={TD}>{grams(figures.weightLossMg)}</td>
              <td className={TD}>{figures.mgPerHour === null ? DASH : formatRate(figures.mgPerHour)}</td>
              <td className={TD}>{meltPoolText(burn)}</td>
              <td className={TD}>{mm(burn.flameHeightMm)}</td>
              <td className={TD}>{burn.soot ? sootName(burn.soot) : DASH}</td>
              <td className={TD}>{burn.notes ?? DASH}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <dt className="text-sm font-semibold print:text-[9pt]">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-wrap print:text-[9pt]">{children}</dd>
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string | undefined }) {
  if (!text) return null;
  return (
    <div className="break-inside-avoid">
      <h4 className="text-sm font-semibold print:text-[9pt]">{title}</h4>
      <p className="text-sm break-words whitespace-pre-wrap print:text-[9pt]">{text}</p>
    </div>
  );
}

function CandleReport({ candle, number }: { candle: BurnCandle; number: number }) {
  const totals = candleTotals(candle);
  return (
    <section
      aria-label={M.reportCandleHeading(number, candle.label)}
      className="grid gap-2 border-t border-border pt-3 print:border-black"
    >
      <h3 className="text-base font-semibold break-words break-after-avoid print:text-[11pt]">
        {M.reportCandleHeading(number, candle.label)}
      </h3>
      <p className="text-sm break-words print:text-[9pt]">
        <span className="font-semibold">{M.rowWick}: </span>
        {candle.wick.name}
      </p>
      <div className="min-w-0 overflow-x-auto print:overflow-visible">
        <BurnsTable candle={candle} />
      </div>
      <div className="break-inside-avoid">
        <h4 className="text-sm font-semibold print:text-[9pt]">{M.reportTotals}</h4>
        <dl className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
          <Fact label={M.rowBurnCount}>{totals.burnCount}</Fact>
          <Fact label={M.rowTotalTime}>{formatDuration(totals.totalMinutes)}</Fact>
          <Fact label={M.rowTotalLoss}>{totals.totalLossMg === null ? DASH : formatGrams(totals.totalLossMg, 10)}</Fact>
          <Fact label={M.rowAverageRate}>
            {totals.averageMgPerHour === null ? DASH : formatRate(totals.averageMgPerHour)}
          </Fact>
          <Fact label={M.rowLastMeltPoolDiameter}>{mm(totals.lastMeltPoolDiameterMm ?? undefined)}</Fact>
          <Fact label={M.rowMaxMeltPoolDepth}>{mm(totals.maxMeltPoolDepthMm ?? undefined)}</Fact>
          <Fact label={M.rowMaxFlameHeight}>{mm(totals.maxFlameHeightMm ?? undefined)}</Fact>
          <Fact label={M.rowSoot}>{sootText(totals.sootLevels) || DASH}</Fact>
        </dl>
      </div>
      {candle.coldThrow || candle.hotThrow ? (
        <div className="grid gap-1 break-inside-avoid">
          <h4 className="text-sm font-semibold print:text-[9pt]">{M.reportThrowNotes}</h4>
          <dl className="grid gap-1">
            {candle.coldThrow ? <Fact label={M.rowColdThrow}>{candle.coldThrow}</Fact> : null}
            {candle.hotThrow ? <Fact label={M.rowHotThrow}>{candle.hotThrow}</Fact> : null}
          </dl>
        </div>
      ) : null}
      <TextBlock title={M.reportCandleNotes} text={candle.notes} />
    </section>
  );
}

/**
 * One session in a report: details, each candle with its burns and totals,
 * the maker's conclusion and notes, and the photos at print size.
 */
export function SessionReport({
  detail,
  photos,
  heading,
}: {
  detail: BurnSessionDetail;
  photos: BurnPhoto[];
  /** "Burn test 1 of 2", when the report holds several sessions. */
  heading?: string;
}) {
  const { session, batch, formula, version } = detail;
  const title = sessionTitle(session);
  return (
    <section aria-label={title} data-testid="report-session" className="grid gap-3">
      <div className="break-after-avoid">
        {heading ? <p className="text-sm text-text-secondary print:text-[9pt]">{heading}</p> : null}
        <h2 className="text-lg font-semibold break-words print:text-[13pt]">{title}</h2>
      </div>
      <h3 className="sr-only">{M.reportDetails}</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
        <Fact label={M.reportTestDate}>
          <time dateTime={session.testedOn}>{formatProducedOn(session.testedOn)}</time>
        </Fact>
        <Fact label={M.reportBatch}>{batchName(batch)}</Fact>
        <Fact label={M.reportFormula}>
          {formula.name}
          {M.separator}
          {M.versionText(version.number)}
        </Fact>
      </dl>
      <div className="grid gap-4">
        <h3 className="sr-only">{M.reportCandlesHeading}</h3>
        {session.candles.map((candle, i) => (
          <CandleReport key={candle.id} candle={candle} number={i + 1} />
        ))}
      </div>
      <div className="grid gap-2 border-t border-border pt-3 print:border-black">
        <div className="break-inside-avoid">
          <h3 className="text-base font-semibold print:text-[11pt]">{M.makerConclusion}</h3>
          <p className="text-sm break-words whitespace-pre-wrap print:text-[9pt]">
            {session.conclusion ?? <span className="text-text-secondary">{M.noConclusion}</span>}
          </p>
        </div>
        {session.notes ? (
          <div className="break-inside-avoid">
            <h3 className="text-base font-semibold print:text-[11pt]">{M.reportNotes}</h3>
            <p className="text-sm break-words whitespace-pre-wrap print:text-[9pt]">{session.notes}</p>
          </div>
        ) : null}
      </div>
      {photos.length > 0 ? (
        <div className="grid gap-2 border-t border-border pt-3 print:border-black">
          <h3 className="text-base font-semibold break-after-avoid print:text-[11pt]">{M.reportPhotos}</h3>
          <PhotoGrid photos={photos} variant="print" />
        </div>
      ) : null}
    </section>
  );
}
