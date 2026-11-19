/**
 * BurnMatrix CSV export (RFC 4180, CRLF, UTF-8 BOM).
 */
import type { BurnSessionListItem } from "@/lib/db/contract";
import { formatWeight } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import type { SootLevel } from "@/lib/types";
import { burnFigures } from "./calc";

const M = MESSAGES.burnCsv;
const BOM = "﻿";

const SOOT_NAMES: Record<SootLevel, string> = {
  none: M.sootNone,
  light: M.sootLight,
  moderate: M.sootModerate,
  heavy: M.sootHeavy,
};

const HEADERS = [
  M.testDate,
  M.session,
  M.batch,
  M.formula,
  M.version,
  M.candle,
  M.wick,
  M.burn,
  M.durationMin,
  M.weightBeforeG,
  M.weightAfterG,
  M.weightLossG,
  M.rateGPerHour,
  M.meltPoolDiameterMm,
  M.meltPoolDepthMm,
  M.flameHeightMm,
  M.soot,
  M.burnNotes,
  M.coldThrow,
  M.hotThrow,
  M.candleNotes,
  M.conclusion,
];

/** RFC 4180 quoting. */
function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Text cell: formula-injection guard, then quoting. */
function textCell(value: string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return quote(guarded);
}

const grams = (mg: number | null | undefined): string =>
  mg === null || mg === undefined ? "" : formatWeight(mg, 10);
const num = (n: number | undefined): string => (n === undefined ? "" : String(n));

export function buildBurnCsv(sessions: readonly BurnSessionListItem[]): string {
  const lines: string[] = [HEADERS.map(quote).join(",")];

  for (const { session, batch, formula, version } of sessions) {
    const batchText = batch.label?.trim()
      ? batch.label
      : MESSAGES.batches.defaultTitle(batch.id.slice(0, 8).toUpperCase());
    const head = [
      session.testedOn,
      textCell(session.label),
      textCell(batchText),
      textCell(formula.name),
      String(version.number),
    ];
    const tail = [textCell(session.conclusion)];

    for (const candle of session.candles) {
      const candleCols = [textCell(candle.label), textCell(candle.wick.name)];
      const candleTail = [textCell(candle.coldThrow), textCell(candle.hotThrow), textCell(candle.notes)];
      if (candle.burns.length === 0) {
        const empty = Array<string>(11).fill("");
        lines.push([...head, ...candleCols, ...empty, ...candleTail, ...tail].join(","));
        continue;
      }
      candle.burns.forEach((burn, i) => {
        const f = burnFigures(burn);
        const burnCols = [
          String(i + 1),
          String(burn.durationMin),
          grams(burn.weightBeforeMg),
          grams(burn.weightAfterMg),
          grams(f.weightLossMg),
          grams(f.mgPerHour),
          num(burn.meltPoolDiameterMm),
          num(burn.meltPoolDepthMm),
          num(burn.flameHeightMm),
          burn.soot ? textCell(SOOT_NAMES[burn.soot]) : "",
          textCell(burn.notes),
        ];
        lines.push([...head, ...candleCols, ...burnCols, ...candleTail, ...tail].join(","));
      });
    }
  }

  return BOM + lines.join("\r\n") + "\r\n";
}

/** `candlelab-burn-tests-YYYYMMDD.csv` from a local date "YYYY-MM-DD". */
export function csvFileName(today: string): string {
  return `candlelab-burn-tests-${today.replace(/-/g, "")}.csv`;
}
