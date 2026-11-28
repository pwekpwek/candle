"use client";

import type { ReactNode } from "react";
import { Notice } from "@/components/common/notice";
import { formatBp, formatCentavos, formatHours, formatMargin, formatPeso } from "@/lib/cost";
import type { CostResult, CostSheetFigures, ScenarioResult } from "@/lib/cost";
import { MESSAGES } from "@/lib/messages";
import type { CostScenario } from "@/lib/types";
import { lineUnit, priceSourceText, quantityText, reasonText } from "./text";

const M = MESSAGES.cost;

function Row({
  label,
  detail,
  value,
  strong,
  testId,
}: {
  label: string;
  detail?: string;
  value: string;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="min-w-0">
        <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{label}</span>
        {detail ? <span className="block text-sm wrap-anywhere text-text-secondary">{detail}</span> : null}
      </dt>
      <dd data-testid={testId} className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>
        {value}
      </dd>
    </div>
  );
}

/** The material and item lines with their quantities and price sources (sheet page). */
export function CostLines({ figures, result }: { figures: CostSheetFigures; result: CostResult }) {
  return (
    <>
      <section aria-labelledby="cost-materials-heading" data-testid="cost-material-lines" className="min-w-0">
        <h2 id="cost-materials-heading" className="mb-2 text-lg font-semibold">
          {M.materialsHeading}
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
          {result.materialLines.map((entry) => (
            <li
              key={entry.line.key}
              data-testid="cost-material-line"
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
            >
              <div className="min-w-0">
                <p className="font-semibold wrap-anywhere text-foreground">{entry.line.name}</p>
                <p className="text-sm text-text-secondary">{quantityText(entry.line.quantity, entry.pieces)}</p>
                <p data-testid="cost-price-source" className="text-sm wrap-anywhere text-text-secondary">
                  {priceSourceText(entry.line.price, lineUnit(entry.line))}
                </p>
              </div>
              <p className="tabular-nums">{formatPeso(entry.cost)}</p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="cost-items-heading" data-testid="cost-item-lines" className="min-w-0">
        <h2 id="cost-items-heading" className="mb-2 text-lg font-semibold">
          {M.itemsHeading}
        </h2>
        {result.itemLines.length === 0 ? (
          <p className="text-sm text-text-secondary">{M.itemsEmpty}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
            {result.itemLines.map((entry) => (
              <li
                key={entry.line.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
              >
                <div className="min-w-0">
                  <p className="font-semibold wrap-anywhere text-foreground">{entry.line.name}</p>
                  <p className="text-sm text-text-secondary">
                    {M.itemUnit(formatCentavos(entry.line.unitCentavos))}
                    {M.separator}
                    {entry.line.per === "sellable"
                      ? M.itemQuantitySellable(entry.line.quantity, figures.sellable)
                      : M.itemQuantityBatch(entry.line.quantity)}
                  </p>
                </div>
                <p className="tabular-nums">{formatPeso(entry.cost)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function overheadDetail(figures: CostSheetFigures): string {
  return figures.overhead.mode === "fixed"
    ? M.overheadFixedDetail
    : M.overheadPercentDetail(formatBp(figures.overhead.bp));
}

function scenarioSetBy(scenario: CostScenario | null): string | null {
  if (!scenario) return null;
  return scenario.mode === "price" ? M.scenarioSetByPrice : M.scenarioSetByMargin(formatBp(scenario.marginBp));
}

type Cell = { text: string; testId?: string };

function scenarioCells(result: ScenarioResult | null, vatOn: boolean): Cell[] {
  const dash: Cell = { text: M.notAvailable };
  const count = vatOn ? 6 : 4;
  if (result === null) return [{ text: M.scenarioNotSet }, ...Array.from({ length: count - 1 }, () => dash)];
  if (!result.ok) return [{ text: reasonText(result.reason) }, ...Array.from({ length: count - 1 }, () => dash)];
  const cells: Cell[] = [{ text: formatPeso(result.price) }];
  if (vatOn) cells.push({ text: formatPeso(result.exVatPrice) }, { text: formatPeso(result.vat) });
  cells.push(
    { text: formatPeso(result.profitPerCandle) },
    { text: formatMargin(result.margin) },
    { text: formatPeso(result.batchProfit) },
  );
  return cells;
}

/** Wholesale and retail side by side. Negative figures keep their minus sign and no colour. */
function Scenarios({ figures, result }: { figures: CostSheetFigures; result: CostResult }) {
  const vatOn = figures.pricesIncludeVat;
  const labels = [
    vatOn ? M.rowPriceVat : M.rowPrice,
    ...(vatOn ? [M.rowExVat, M.rowVat] : []),
    M.rowProfit,
    M.rowMargin,
    M.rowBatchProfit,
  ];
  const columns = [
    { key: "wholesale", name: M.wholesale, scenario: figures.wholesale, result: result.wholesale },
    { key: "retail", name: M.retail, scenario: figures.retail, result: result.retail },
  ] as const;
  const cells = columns.map((c) => scenarioCells(c.result, vatOn));
  return (
    <section aria-labelledby="cost-scenarios-heading" data-testid="cost-scenarios" className="min-w-0">
      <h2 id="cost-scenarios-heading" className="mb-2 text-lg font-semibold">
        {M.scenariosHeading}
      </h2>
      <div className="rounded-lg border border-border bg-card px-3 py-1">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-border text-left align-bottom">
              <th scope="col" className="w-[34%] py-2 pr-2 font-normal text-text-secondary">
                <span className="sr-only">{M.scenariosHeading}</span>
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" data-testid={`scenario-${c.key}`} className="py-2 pr-2 align-bottom">
                  <span className="block font-semibold text-foreground">{c.name}</span>
                  <span className="block font-normal wrap-anywhere text-text-secondary">
                    {scenarioSetBy(c.scenario) ?? M.scenarioNotSet}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label} className="border-b border-border last:border-b-0 align-top">
                <th scope="row" className="py-2 pr-2 text-left font-normal wrap-anywhere text-text-secondary">
                  {label}
                </th>
                {cells.map((column, c) => (
                  <td key={columns[c].key} className="py-2 pr-2 wrap-anywhere tabular-nums text-foreground">
                    {column[i].text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-text-secondary">{vatOn ? M.vatOnNote : M.vatOffNote}</p>
    </section>
  );
}

/** Totals, the cost per sellable candle and its four parts, the scenarios, the incomplete warning and the rounding note. */
export function CostSummary({
  figures,
  result,
  children,
}: {
  figures: CostSheetFigures;
  result: CostResult;
  /** Shown first (the editor puts its "figures are from the last valid values" note here). */
  children?: ReactNode;
}) {
  const breakdown = result.perSellableBreakdown;
  return (
    <div data-testid="cost-results" className="grid min-w-0 gap-6">
      {children}
      {result.complete ? null : (
        <Notice variant="warning" title={M.incompleteTitle}>
          {M.incompleteBody(result.missingPrices)}
        </Notice>
      )}
      <section aria-labelledby="cost-per-sellable-heading" className="min-w-0">
        <h2 id="cost-per-sellable-heading" className="text-lg font-semibold">
          {M.perSellableHeading}
        </h2>
        {result.perSellable && breakdown ? (
          <>
            <p data-testid="cost-per-sellable" className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatPeso(result.perSellable)}
            </p>
            <h3 className="mt-3 text-sm font-semibold text-text-secondary">{M.partsHeading}</h3>
            <dl className="divide-y divide-border text-sm">
              <Row label={M.partProduction} value={formatPeso(breakdown.production)} testId="cost-part-production" />
              <Row label={M.partNonSellable} value={formatPeso(breakdown.nonSellableShare)} testId="cost-part-nonsellable" />
              <Row label={M.partTesting} value={formatPeso(breakdown.testing)} testId="cost-part-testing" />
              <Row label={M.partPackaging} value={formatPeso(breakdown.packaging)} testId="cost-part-packaging" />
            </dl>
          </>
        ) : (
          <p data-testid="cost-per-sellable-none" className="mt-1 text-sm text-text-secondary">
            {M.perSellableNone}
          </p>
        )}
      </section>
      <section aria-labelledby="cost-totals-heading" className="min-w-0">
        <h2 id="cost-totals-heading" className="mb-1 text-lg font-semibold">
          {M.totalsHeading}
        </h2>
        <dl className="divide-y divide-border">
          <Row label={M.materialsLabel} value={formatPeso(result.materials)} testId="cost-materials" />
          <Row label={M.itemsPerBatchLabel} value={formatPeso(result.itemsPerBatch)} testId="cost-items-per-batch" />
          <Row
            label={M.labourLabel}
            detail={M.labourDetail(formatHours(figures.labourHoursX100), formatCentavos(figures.labourRateCentavos))}
            value={formatPeso(result.labour)}
            testId="cost-labour"
          />
          <Row
            label={M.overheadLabel}
            detail={overheadDetail(figures)}
            value={formatPeso(result.overhead)}
            testId="cost-overhead"
          />
          <Row label={M.productionLabel} detail={M.productionDetail} value={formatPeso(result.production)} strong testId="cost-production" />
          <Row label={M.perCandleMadeLabel} value={formatPeso(result.perCandleMade)} testId="cost-per-candle-made" />
          <Row
            label={M.nonSellableLabel}
            detail={M.nonSellableDetail(result.nonSellableCount)}
            value={formatPeso(result.nonSellableCost)}
            testId="cost-non-sellable"
          />
          <Row label={M.testingLabel} value={formatPeso(result.testing)} testId="cost-testing" />
          <Row label={M.packagingLabel} value={formatPeso(result.packaging)} testId="cost-packaging" />
          <Row label={M.batchTotalLabel} value={formatPeso(result.batchTotal)} strong testId="cost-batch-total" />
        </dl>
      </section>
      <Scenarios figures={figures} result={result} />
      <p className="text-sm text-text-secondary">{M.roundingNote}</p>
    </div>
  );
}
