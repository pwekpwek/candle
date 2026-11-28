"use client";

import Link from "next/link";
import { calculateCost, formatPeso } from "@/lib/cost";
import type { CostSheetListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { basisText, sheetHref, sheetTitle } from "./text";

const M = MESSAGES.cost;

/** One cost sheet in a list: title, basis, candles, cost per sellable candle, Incomplete badge. */
export function SheetRow({ item }: { item: CostSheetListItem }) {
  const { sheet } = item;
  const result = calculateCost(sheet);
  return (
    <Link
      href={sheetHref(sheet.id)}
      data-testid="cost-sheet-row"
      className="flex min-h-11 min-w-0 flex-col justify-center gap-0.5 rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted"
    >
      <span className="font-semibold wrap-anywhere text-foreground">{sheetTitle(sheet)}</span>
      <span className="text-sm wrap-anywhere text-text-secondary">{basisText(item)}</span>
      <span className="text-sm text-text-secondary">
        {M.rowCandles(sheet.candlesMade, sheet.sellable)}
        {M.separator}
        <span className="font-semibold text-foreground">
          {result.perSellable ? M.rowPerSellable(formatPeso(result.perSellable)) : M.noSellable}
        </span>
        {result.complete ? null : (
          <>
            {M.separator}
            <span
              data-testid="cost-incomplete-badge"
              className="inline-block rounded-sm border border-border px-1.5 py-0.5 text-xs font-semibold"
            >
              {M.incompleteBadge}
            </span>
          </>
        )}
      </span>
    </Link>
  );
}
