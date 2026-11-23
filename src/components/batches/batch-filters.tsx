"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { SlidersHorizontalIcon } from "lucide-react";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_QUERY_LENGTH } from "@/lib/batchtrace";
import type { BatchQuery, YesNo } from "@/lib/batchtrace";
import type { BatchTraceData } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";

const T = MESSAGES.batchTrace;

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground aria-invalid:border-destructive pointer-coarse:min-h-11";

type Option = { value: string; text: string };

/** Options for the formula, lot and supplier selects, from one read. */
function useFilterOptions(data: BatchTraceData) {
  return useMemo(() => {
    const formulas = new Map<string, string>();
    const usedLots = new Map<string, string>();
    for (const item of data.items) {
      formulas.set(item.formula.id, item.formula.name);
      for (const l of item.lots) usedLots.set(l.link.lotId, l.link.lotCode);
    }
    const lotsById = new Map(data.lots.map((l) => [l.id, l]));
    const materials = new Map(data.materials.map((m) => [m.id, m.name]));
    const byText = (a: Option, b: Option) => a.text.localeCompare(b.text);
    const formulaOptions: Option[] = [...formulas]
      .map(([value, text]) => ({ value, text }))
      .sort(byText);
    const lotOptions: Option[] = [...usedLots]
      .map(([value, recordedCode]) => {
        const lot = lotsById.get(value);
        const code = lot?.code ?? recordedCode;
        const material = lot ? materials.get(lot.materialId) : undefined;
        return { value, text: material ? T.lotOption(code, material) : code };
      })
      .sort(byText);
    const supplierOptions: Option[] = data.suppliers.map((s) => ({ value: s.id, text: s.name }));
    return { formulaOptions, lotOptions, supplierOptions };
  }, [data]);
}

/** How many filters (not the search text) are set. */
export function activeFilterCount(query: BatchQuery): number {
  return [
    query.formulaId,
    query.from,
    query.to,
    query.lotId,
    query.supplierId,
    query.curePlan,
    query.burnTests,
  ].filter((v) => v !== null).length;
}

function SelectField({
  label,
  value,
  onChange,
  allText,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allText: string;
  options: readonly Option[];
}) {
  // A value from the URL that is not in the list stays visible instead of snapping back to "all".
  const unknown = value !== null && !options.some((o) => o.value === value);
  return (
    <Field label={label}>
      {(c) => (
        <select
          {...c}
          className={SELECT_CLASS}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">{allText}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
          {unknown ? <option value={value}>{T.unknownOption}</option> : null}
        </select>
      )}
    </Field>
  );
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: YesNo | null;
  onChange: (value: YesNo | null) => void;
}) {
  return (
    <Field label={label}>
      {(c) => (
        <select
          {...c}
          className={SELECT_CLASS}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as YesNo))}
        >
          <option value="">{T.any}</option>
          <option value="yes">{T.withIt}</option>
          <option value="no">{T.withoutIt}</option>
        </select>
      )}
    </Field>
  );
}

/**
 * The search box and the filters of the Batches list. The URL is the source of
 * truth: every change is reported through `onChange`; only the typed search
 * text is kept by the caller.
 */
export function BatchFilters({
  data,
  query,
  searchText,
  onSearchText,
  onSearchEnter,
  onChange,
  children,
}: {
  data: BatchTraceData;
  query: BatchQuery;
  searchText: string;
  onSearchText: (text: string) => void;
  onSearchEnter: () => void;
  onChange: (next: BatchQuery) => void;
  /** Shown after the filters (the result bar). */
  children?: ReactNode;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const { formulaOptions, lotOptions, supplierOptions } = useFilterOptions(data);
  const count = activeFilterCount(query);
  const rangeError = query.from && query.to && query.from > query.to ? T.dateRangeError : undefined;

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div role="search" className="flex flex-col gap-1">
        <Label htmlFor={`${panelId}-search`}>{T.searchLabel}</Label>
        <Input
          id={`${panelId}-search`}
          type="search"
          autoComplete="off"
          maxLength={MAX_QUERY_LENGTH}
          placeholder={T.searchPlaceholder}
          value={searchText}
          onChange={(e) => onSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearchEnter();
            }
          }}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        className="self-start pointer-coarse:min-h-11 sm:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontalIcon aria-hidden="true" />
        {T.filtersToggle(count)}
      </Button>

      <div
        id={panelId}
        className={cn("gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4", open ? "grid" : "hidden")}
      >
        <SelectField
          label={T.formulaLabel}
          value={query.formulaId}
          onChange={(formulaId) => onChange({ ...query, formulaId })}
          allText={T.allFormulas}
          options={formulaOptions}
        />
        <Field label={T.fromLabel} error={rangeError}>
          {(c) => (
            <Input
              {...c}
              type="date"
              value={query.from ?? ""}
              onChange={(e) => onChange({ ...query, from: e.target.value || null })}
            />
          )}
        </Field>
        <Field label={T.toLabel}>
          {(c) => (
            <Input
              {...c}
              type="date"
              value={query.to ?? ""}
              onChange={(e) => onChange({ ...query, to: e.target.value || null })}
            />
          )}
        </Field>
        <SelectField
          label={T.lotLabel}
          value={query.lotId}
          onChange={(lotId) => onChange({ ...query, lotId })}
          allText={T.allLots}
          options={lotOptions}
        />
        <SelectField
          label={T.supplierLabel}
          value={query.supplierId}
          onChange={(supplierId) => onChange({ ...query, supplierId })}
          allText={T.allSuppliers}
          options={supplierOptions}
        />
        <YesNoField
          label={T.curePlanLabel}
          value={query.curePlan}
          onChange={(curePlan) => onChange({ ...query, curePlan })}
        />
        <YesNoField
          label={T.burnTestsLabel}
          value={query.burnTests}
          onChange={(burnTests) => onChange({ ...query, burnTests })}
        />
      </div>
      {children}
    </div>
  );
}
