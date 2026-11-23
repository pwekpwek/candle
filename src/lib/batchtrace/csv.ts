/**
 * Batch CSV export (v0.3): RFC 4180, CRLF, UTF-8 BOM. See ./contract.ts.
 */
import type { BatchTraceItem } from "@/lib/db/contract";
import { formatWeight } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import type { BatchCsvFileName, BuildBatchCsv } from "./contract";

const M = MESSAGES.batchCsv;
const BOM = "﻿";

const HEADERS = [
  M.batch,
  M.batchId,
  M.productionDate,
  M.formula,
  M.version,
  M.component,
  M.material,
  M.plannedG,
  M.measuredG,
  M.lotCode,
  M.supplier,
  M.lotReceived,
  M.curePlan,
  M.burnTests,
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

type Row = {
  component: string;
  material: string;
  plannedMg?: number;
  measuredMg?: number;
  lot: BatchTraceItem["lots"][number] | undefined;
};

export const buildBatchCsv: BuildBatchCsv = (items) => {
  const lines: string[] = [HEADERS.map(quote).join(",")];

  for (const item of items) {
    const { batch, formula, version } = item;
    const title = batch.label?.trim()
      ? batch.label
      : MESSAGES.batches.defaultTitle(batch.id.slice(0, 8).toUpperCase());
    const precision = version.inputs.precisionMg;
    const planned = new Map(version.targets.components.map((c) => [c.componentId, c.targetMg]));
    const measured = new Map(batch.entries.map((e) => [e.componentId, e.actualMg]));
    const rowLot = (componentId: string) =>
      item.lots.find((l) => l.link.part === "row" && l.link.componentId === componentId);
    const partLot = (part: "wick" | "vessel") => item.lots.find((l) => l.link.part === part);

    const rows: Row[] = [];
    for (const c of version.inputs.waxes) {
      rows.push({
        component: M.componentWax,
        material: c.snapshot.name,
        plannedMg: planned.get(c.componentId),
        measuredMg: measured.get(c.componentId),
        lot: rowLot(c.componentId),
      });
    }
    for (const c of version.inputs.oils) {
      rows.push({
        component: M.componentOil,
        material: c.snapshot.name,
        plannedMg: planned.get(c.componentId),
        measuredMg: measured.get(c.componentId),
        lot: rowLot(c.componentId),
      });
    }
    if (version.inputs.wick) {
      rows.push({
        component: M.componentWick,
        material: version.inputs.wick.snapshot.name,
        lot: partLot("wick"),
      });
    }
    if (version.inputs.vessel) {
      rows.push({
        component: M.componentVessel,
        material: version.inputs.vessel.snapshot.name,
        lot: partLot("vessel"),
      });
    }

    const head = [
      textCell(title),
      textCell(batch.id),
      batch.producedOn,
      textCell(formula.name),
      String(version.number),
    ];
    const tail = [item.hasCurePlan ? M.yes : M.no, String(item.burnTestCount)];

    for (const row of rows) {
      lines.push(
        [
          ...head,
          textCell(row.component),
          textCell(row.material),
          row.plannedMg === undefined ? "" : formatWeight(row.plannedMg, precision),
          row.measuredMg === undefined ? "" : formatWeight(row.measuredMg, 10),
          textCell(row.lot?.link.lotCode),
          textCell(row.lot?.link.supplierName),
          row.lot?.lot?.receivedOn ?? "",
          ...tail,
        ].join(","),
      );
    }
  }

  return BOM + lines.join("\r\n") + "\r\n";
};

export const batchCsvFileName: BatchCsvFileName = (localDate) =>
  `candlelab-batches-${localDate.replace(/-/g, "")}.csv`;
