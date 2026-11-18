"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { StatusPill, type SaveState } from "@/components/common/status-pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDataLayer } from "@/lib/db";
import {
  compareInputFromVersion,
  compareMeasured,
  formatGrams,
  formatMeasured,
  formatSignedGrams,
  formatSignedPercent2,
  parseMeasured,
} from "@/lib/gramguard";
import type {
  ComparisonRow,
  ComponentComparison,
  Issue,
} from "@/lib/gramguard";
import { MESSAGES, messageForIssue } from "@/lib/messages";
import type { FormulaVersion, MeasurementEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BlendCards } from "./blend-cards";

const F = MESSAGES.formula;
const R = MESSAGES.results;

/** Quiet period after typing before the weights are saved. */
export const AUTOSAVE_DELAY_MS = 600;

type Texts = Record<string, string>;
type Precision = FormulaVersion["inputs"]["precisionMg"];

type Collected = {
  entries: MeasurementEntry[];
  issues: Record<string, Issue>;
};

/** Parses every field. Empty means not measured; a bad value is an issue. */
function collect(componentIds: readonly string[], texts: Texts): Collected {
  const entries: MeasurementEntry[] = [];
  const issues: Record<string, Issue> = {};
  for (const componentId of componentIds) {
    const parsed = parseMeasured(texts[componentId] ?? "", `measured.${componentId}`);
    if (!parsed.ok) issues[componentId] = parsed.issue;
    else if (parsed.actualMg !== null) {
      entries.push({ componentId, actualMg: parsed.actualMg });
    }
  }
  return { entries, issues };
}

/** The difference column text (CALC-19, CALC-21). Informational, never pass or fail. */
function differenceText(
  row: ComparisonRow & Partial<Pick<ComponentComparison, "flagged" | "direction">>,
  precisionMg: Precision,
): string | null {
  if (row.diffMg === null) return null;
  const percent =
    row.diffX100 === null ? null : `${formatSignedPercent2(row.diffX100)}%`;
  if (row.flagged && row.direction && percent !== null) {
    const amount = formatSignedGrams(row.diffMg, precisionMg).replace(/^[-+]/, "");
    return F.offTarget(row.direction, amount, percent);
  }
  const grams = formatSignedGrams(row.diffMg, precisionMg);
  return percent === null ? grams : `${grams} ${percent}`;
}

const TH = "px-3 py-2 text-xs font-medium uppercase text-muted-foreground";
const ROW =
  "border-t border-border max-sm:mb-3 max-sm:block max-sm:rounded-lg max-sm:border max-sm:bg-card max-sm:p-3";
const NAME_CELL =
  "px-3 py-2 text-left align-top font-normal wrap-anywhere max-sm:block max-sm:px-0 max-sm:pt-0 max-sm:pb-2 max-sm:font-semibold";
const VALUE_CELL =
  "tabular px-3 py-2 text-right align-top max-sm:flex max-sm:items-start max-sm:justify-between max-sm:gap-3 max-sm:px-0 max-sm:py-1 before:text-left before:font-normal before:text-text-secondary before:content-[attr(data-label)] sm:before:hidden";

export type MeasuredSectionProps = {
  version: FormulaVersion;
  /** The saved record's entries when the section first shows. */
  initialEntries: readonly MeasurementEntry[];
  /** Per componentId: the library's current name when it differs from the snapshot. */
  nowCalled: Record<string, string>;
};

/**
 * The actual blend and the measured-weights table (PRD-20, PRD-21, F3).
 * Planned weights come from the version's stored targets and are never
 * recalculated; typing only changes the Measured and Difference columns.
 * Mount it with `key={version.id}` so each version starts from its own record.
 */
export function MeasuredSection({
  version,
  initialEntries,
  nowCalled,
}: MeasuredSectionProps) {
  const { precisionMg } = version.inputs;
  const headingId = useId();
  const components = useMemo(
    () => [...version.inputs.waxes, ...version.inputs.oils],
    [version],
  );
  const componentIds = useMemo(() => components.map((c) => c.componentId), [components]);
  const names = useMemo(
    () => Object.fromEntries(components.map((c) => [c.componentId, c.snapshot.name])),
    [components],
  );

  const [texts, setTexts] = useState<Texts>(() =>
    Object.fromEntries(
      initialEntries.map((e) => [e.componentId, formatMeasured(e.actualMg, precisionMg)]),
    ),
  );
  /** Messages for fields the maker has left with a bad value (shown on blur). */
  const [shown, setShown] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const textsRef = useRef(texts);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changed = useRef(false);
  const inFlight = useRef(false);
  const again = useRef(false);

  const { entries } = useMemo(() => collect(componentIds, texts), [componentIds, texts]);
  const comparison = useMemo(
    () => compareMeasured(compareInputFromVersion(version), entries),
    [version, entries],
  );

  const persist = useCallback(async () => {
    again.current = true;
    if (inFlight.current) return; // the running save picks the latest text up next
    inFlight.current = true;
    let wrote = false;
    try {
      setSaveState("saving");
      while (again.current) {
        again.current = false;
        changed.current = false;
        const latest = collect(componentIds, textsRef.current);
        if (Object.keys(latest.issues).length > 0) continue; // never save while a field is invalid
        await getDataLayer().measurements.saveEntries(version.id, latest.entries);
        wrote = true;
      }
      // A value typed during this save still waits for its pause: not "Saved" yet.
      setSaveState(timer.current !== null ? "saving" : wrote ? "saved" : "idle");
    } catch {
      setSaveState("error");
    } finally {
      inFlight.current = false;
    }
  }, [componentIds, version.id]);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Leaving the page (unmount, reload or tab close) with a typed value still
  // waiting: save it now.
  useEffect(() => {
    const flush = () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
        void persist();
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  function onChange(componentId: string, value: string) {
    const next = { ...textsRef.current, [componentId]: value };
    textsRef.current = next;
    setTexts(next);
    changed.current = true;
    if (shown[componentId] !== undefined) {
      const parsed = parseMeasured(value, `measured.${componentId}`);
      if (parsed.ok) {
        setShown((prev) => {
          const rest = { ...prev };
          delete rest[componentId];
          return rest;
        });
      }
    }
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      void persist();
    }, AUTOSAVE_DELAY_MS);
    // PRD-20: the pill never says "Saved" while a typed value waits to be saved.
    setSaveState("saving");
  }

  function onBlur(componentId: string) {
    const parsed = parseMeasured(
      textsRef.current[componentId] ?? "",
      `measured.${componentId}`,
    );
    setShown((prev) => {
      const rest = { ...prev };
      if (parsed.ok) delete rest[componentId];
      else rest[componentId] = messageForIssue(parsed.issue);
      return rest;
    });
    if (changed.current) {
      clearTimer();
      void persist();
    }
  }

  const byId = new Map(comparison.components.map((c) => [c.componentId, c]));

  return (
    <>
      <BlendCards
        version={version}
        comparison={comparison}
        names={names}
        className="mt-6"
      />

      <section aria-labelledby={headingId} className="mt-8">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 id={headingId} className="text-lg font-semibold">
            {F.measuredHeading}
          </h2>
          <StatusPill state={saveState} onRetry={() => void persist()} />
        </div>
        <p className="mb-3 text-sm text-text-secondary">
          {F.measuredHint}
          {saveState === "error" ? ` ${F.saveFailedHint}` : ""}
        </p>

        <table className="w-full border-collapse text-sm max-sm:block">
          <caption className="sr-only">{F.measuredHeading}</caption>
          <thead className="bg-muted max-sm:sr-only">
            <tr>
              <th scope="col" className={cn(TH, "text-left")}>
                {F.componentColumn}
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                {F.plannedLabel}
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                {F.measuredLabel}
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                {F.differenceLabel}
              </th>
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {components.map((component) => {
              const id = component.componentId;
              const row = byId.get(id);
              const error = shown[id];
              const hint = nowCalled[id];
              const inputId = `${headingId}-${id}`;
              const errorId = `${inputId}-error`;
              const diff = row ? differenceText(row, precisionMg) : null;
              return (
                <tr key={id} className={ROW}>
                  <th scope="row" className={NAME_CELL}>
                    {component.snapshot.name}
                    {hint ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {F.nowCalled(hint)}
                      </span>
                    ) : null}
                  </th>
                  <td data-label={F.plannedLabel} className={VALUE_CELL}>
                    <span>{formatGrams(row?.targetMg ?? 0, precisionMg)}</span>
                  </td>
                  <td data-label={F.measuredLabel} className={VALUE_CELL}>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center justify-end gap-2">
                        <Label htmlFor={inputId} className="sr-only">
                          {F.measuredFieldLabel(component.snapshot.name)}
                        </Label>
                        <Input
                          id={inputId}
                          data-measured-input=""
                          inputMode="decimal"
                          autoComplete="off"
                          value={texts[id] ?? ""}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(e) => onChange(id, e.target.value)}
                          onBlur={() => onBlur(id)}
                          className="w-28 text-right tabular"
                        />
                        <span aria-hidden="true" className="text-text-secondary">
                          {F.gramUnit}
                        </span>
                      </div>
                      {error ? (
                        <p
                          id={errorId}
                          className="flex max-w-56 items-start gap-1.5 text-left text-sm font-normal text-destructive"
                        >
                          <CircleAlertIcon
                            aria-hidden="true"
                            strokeWidth={1.75}
                            className="mt-0.5 size-4 shrink-0"
                          />
                          <span>{error}</span>
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td data-label={F.differenceLabel} className={VALUE_CELL}>
                    <Figure text={diff} />
                  </td>
                </tr>
              );
            })}

            {version.inputs.oils.length > 0 ? (
              <SummaryRow
                label={R.fragranceRow}
                planned={formatGrams(version.targets.fragranceTotalMg, precisionMg)}
                row={comparison.fragrance}
                precisionMg={precisionMg}
              />
            ) : null}
            <SummaryRow
              label={R.totalRow}
              planned={formatGrams(version.targets.totalMg, precisionMg)}
              row={comparison.total}
              precisionMg={precisionMg}
            />
          </tbody>
        </table>
      </section>
    </>
  );
}

function Figure({ text }: { text: string | null }) {
  if (text === null) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">{"—"}</span>
        <span className="sr-only">{F.notMeasured}</span>
      </span>
    );
  }
  return <span>{text}</span>;
}

/** Fragrance and Total mixture: planned from the stored targets, measured sum from the entries. */
function SummaryRow({
  label,
  planned,
  row,
  precisionMg,
}: {
  label: string;
  planned: string;
  row: ComparisonRow | null;
  precisionMg: Precision;
}) {
  const measured =
    row && row.actualMg !== null
      ? `${formatMeasured(row.actualMg, precisionMg)} ${F.gramUnit}`
      : null;
  return (
    <tr className={cn(ROW, "font-medium")}>
      <th scope="row" className={NAME_CELL}>
        {label}
      </th>
      <td data-label={F.plannedLabel} className={VALUE_CELL}>
        <span>{planned}</span>
      </td>
      <td data-label={F.measuredLabel} className={VALUE_CELL}>
        <Figure text={measured} />
      </td>
      <td data-label={F.differenceLabel} className={VALUE_CELL}>
        <Figure text={row ? differenceText(row, precisionMg) : null} />
      </td>
    </tr>
  );
}
