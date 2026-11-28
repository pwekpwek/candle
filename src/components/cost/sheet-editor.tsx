"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { calculateCost, centavosToInput } from "@/lib/cost";
import type { CostResult, CostSheetFigures } from "@/lib/cost";
import { DataError, getDataLayer } from "@/lib/db";
import type { CostSheetDetail } from "@/lib/db";
import { focusAfterRemove } from "@/lib/focus-after-remove";
import { MESSAGES } from "@/lib/messages";
import { MAX_SHEET_ITEMS } from "@/lib/types";
import type { CostItem, CostItemPer, CostSheet } from "@/lib/types";
import { CostSummary } from "./cost-results";
import {
  buildFromValues,
  valuesFromSheet,
  type FormValues,
  type ItemValues,
  type LineValues,
  type OverheadMode,
  type PriceMode,
  type ScenarioMode,
  type ScenarioValues,
} from "./editor-model";
import { basisText, lineUnit, priceSourceText, quantityText, sheetHref, sheetTitle } from "./text";

const M = MESSAGES.cost;

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground aria-invalid:border-destructive pointer-coarse:min-h-11";

type Loaded =
  | { status: "ok"; detail: CostSheetDetail; items: CostItem[] }
  | { status: "missing" }
  | { status: "error" };

/** `/costs/[sheetId]/edit`: counts, line prices and pieces, items, labour, overhead, testing, VAT and scenarios, with live results. */
export function CostSheetEditor({ sheetId }: { sheetId: string }) {
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);

  useEffect(() => {
    let live = true;
    (async (): Promise<Loaded> => {
      try {
        const layer = getDataLayer();
        const detail = await layer.costSheets.get(sheetId);
        if (!detail) return { status: "missing" };
        // The packaging list is only a convenience: the sheet still edits without it.
        const items = await layer.costItems.list().catch(() => [] as CostItem[]);
        return { status: "ok", detail, items };
      } catch {
        return { status: "error" };
      }
    })().then((result) => {
      if (live) setLoaded(result);
    });
    return () => {
      live = false;
    };
  }, [sheetId, reload]);

  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={M.editTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {M.editorLoading}
        </p>
      </>
    );
  }
  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={M.editTitle} />
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
    return <NotFound />;
  }
  return <EditorBody detail={loaded.detail} pickerItems={loaded.items} />;
}

function NotFound() {
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

function RadioOption({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-base text-foreground">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="size-4 shrink-0 accent-primary"
      />
      <span>{children}</span>
    </label>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {heading}
      </h2>
      {children}
    </section>
  );
}

function ScenarioFields({
  name,
  label,
  value,
  errors,
  onChange,
}: {
  name: "wholesale" | "retail";
  label: string;
  value: ScenarioValues;
  errors: Record<string, string>;
  onChange: (next: ScenarioValues) => void;
}) {
  const groupName = useId();
  const options: { mode: ScenarioMode; label: string }[] = [
    { mode: "none", label: M.scenarioModeNone },
    { mode: "price", label: M.scenarioModePrice },
    { mode: "margin", label: M.scenarioModeMargin },
  ];
  return (
    <fieldset className="grid min-w-0 gap-1 rounded-lg border border-border p-3">
      <legend className="px-1 text-base font-semibold">{M.scenarioModeLabel(label)}</legend>
      <div className="flex flex-wrap gap-x-4">
        {options.map((o) => (
          <RadioOption
            key={o.mode}
            name={groupName}
            value={o.mode}
            checked={value.mode === o.mode}
            onChange={() => onChange({ ...value, mode: o.mode })}
          >
            {o.label}
          </RadioOption>
        ))}
      </div>
      {value.mode === "price" ? (
        <Field label={M.scenarioPriceLabel(label)} error={errors[`${name}:price`]}>
          {(c) => (
            <Input
              {...c}
              inputMode="decimal"
              value={value.priceText}
              onChange={(e) => onChange({ ...value, priceText: e.target.value })}
            />
          )}
        </Field>
      ) : null}
      {value.mode === "margin" ? (
        <Field label={M.scenarioMarginLabel(label)} error={errors[`${name}:margin`]}>
          {(c) => (
            <Input
              {...c}
              inputMode="decimal"
              value={value.marginText}
              onChange={(e) => onChange({ ...value, marginText: e.target.value })}
            />
          )}
        </Field>
      ) : null}
    </fieldset>
  );
}

function LineFields({
  line,
  errors,
  onChange,
}: {
  line: LineValues;
  errors: Record<string, string>;
  onChange: (next: LineValues) => void;
}) {
  const groupName = useId();
  const unit = lineUnit(line);
  const canKeep = line.original.source === "lot" || line.original.source === "material";
  const options: { mode: PriceMode; label: string }[] = [
    ...(canKeep ? [{ mode: "keep" as const, label: M.priceKeep }] : []),
    { mode: "typed", label: M.priceTyped },
    { mode: "none", label: M.priceNone },
  ];
  return (
    <li data-testid="cost-edit-line" className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3">
      <p className="font-semibold wrap-anywhere text-foreground">{line.name}</p>
      {line.quantity.unit === "mg" ? (
        <p className="text-sm text-text-secondary">{quantityText(line.quantity, null)}</p>
      ) : null}
      {line.quantity.unit === "piece" ? (
        <Field label={M.piecesLabel(line.name)} error={errors[`line:${line.key}:pieces`]}>
          {(c) => (
            <Input
              {...c}
              inputMode="numeric"
              value={line.perCandleText}
              onChange={(e) => onChange({ ...line, perCandleText: e.target.value })}
            />
          )}
        </Field>
      ) : null}
      <fieldset className="grid min-w-0 gap-1">
        <legend className="text-sm font-semibold text-text-secondary">{M.linePriceLegend(line.name)}</legend>
        <p data-testid="cost-original-price" className="text-sm wrap-anywhere text-text-secondary">
          {priceSourceText(line.original, unit)}
        </p>
        {options.map((o) => (
          <RadioOption
            key={o.mode}
            name={groupName}
            value={o.mode}
            checked={line.mode === o.mode}
            onChange={() => onChange({ ...line, mode: o.mode })}
          >
            {o.label}
          </RadioOption>
        ))}
        {line.mode === "typed" ? (
          <Field
            label={unit === "kg" ? M.priceTypedLabelKg(line.name) : M.priceTypedLabelPiece(line.name)}
            error={errors[`line:${line.key}:price`]}
          >
            {(c) => (
              <Input
                {...c}
                inputMode="decimal"
                value={line.priceText}
                onChange={(e) => onChange({ ...line, priceText: e.target.value })}
              />
            )}
          </Field>
        ) : null}
      </fieldset>
    </li>
  );
}

function ItemFields({
  item,
  errors,
  onChange,
  onRemove,
}: {
  item: ItemValues;
  errors: Record<string, string>;
  onChange: (next: ItemValues) => void;
  onRemove: (button: HTMLButtonElement) => void;
}) {
  return (
    <li data-testid="cost-edit-item" className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3">
      <Field label={M.itemName} error={errors[`item:${item.rowKey}:name`]}>
        {(c) => <Input {...c} value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} />}
      </Field>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label={M.itemPrice} error={errors[`item:${item.rowKey}:price`]}>
          {(c) => (
            <Input
              {...c}
              inputMode="decimal"
              value={item.priceText}
              onChange={(e) => onChange({ ...item, priceText: e.target.value })}
            />
          )}
        </Field>
        <Field label={M.itemPer}>
          {(c) => (
            <select
              {...c}
              className={SELECT_CLASS}
              value={item.per}
              onChange={(e) => onChange({ ...item, per: e.target.value as CostItemPer })}
            >
              <option value="sellable">{M.itemPerSellableOption}</option>
              <option value="batch">{M.itemPerBatchOption}</option>
            </select>
          )}
        </Field>
        <Field label={M.itemQuantity} error={errors[`item:${item.rowKey}:quantity`]}>
          {(c) => (
            <Input
              {...c}
              inputMode="numeric"
              value={item.quantityText}
              onChange={(e) => onChange({ ...item, quantityText: e.target.value })}
            />
          )}
        </Field>
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          data-row-remove
          onClick={(event) => onRemove(event.currentTarget)}
        >
          {M.itemRemove(item.name.trim())}
        </Button>
      </div>
    </li>
  );
}

function EditorBody({ detail, pickerItems }: { detail: CostSheetDetail; pickerItems: CostItem[] }) {
  const [sheet, setSheet] = useState<CostSheet>(detail.sheet);
  const [values, setValues] = useState<FormValues>(() => valuesFromSheet(detail.sheet));
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [pick, setPick] = useState("");
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const built = useMemo(() => buildFromValues(values, sheet), [values, sheet]);
  const live = useMemo(
    () => (built.ok ? { figures: built.figures, result: calculateCost(built.figures) } : null),
    [built],
  );
  // While a field is being retyped it is briefly invalid: keep showing the last complete figures.
  const [last, setLast] = useState<{ figures: CostSheetFigures; result: CostResult } | null>(live);
  if (live && live !== last) setLast(live);
  const shown = live ?? last;
  const errors = attempted && !built.ok ? built.errors : {};

  useEffect(() => {
    if (focusTick === 0) return;
    const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    target?.focus();
    target?.scrollIntoView?.({ block: "center" });
  }, [focusTick]);

  function change(next: (current: FormValues) => FormValues) {
    setValues(next);
    setSaved(false);
  }

  function setLine(key: string, next: LineValues) {
    change((v) => ({ ...v, lines: v.lines.map((l) => (l.key === key ? next : l)) }));
  }

  function setItem(rowKey: string, next: ItemValues) {
    change((v) => ({ ...v, items: v.items.map((i) => (i.rowKey === rowKey ? next : i)) }));
  }

  function addItem(item: ItemValues) {
    change((v) => (v.items.length >= MAX_SHEET_ITEMS ? v : { ...v, items: [...v.items, item] }));
  }

  const atMax = values.items.length >= MAX_SHEET_ITEMS;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setAttempted(true);
    setSaved(false);
    setFailure(null);
    if (!built.ok) {
      setFocusTick((n) => n + 1);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const updated = await getDataLayer().costSheets.update(sheet.id, built.input);
      setSheet(updated);
      setValues(valuesFromSheet(updated));
      setSaved(true);
    } catch (error) {
      if (error instanceof DataError && error.code === "not-found") setGone(true);
      else setFailure(error instanceof DataError && error.code === "invalid" ? M.saveInvalid : M.saveFailed);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (gone) return <NotFound />;

  const title = sheetTitle(sheet);
  const overheadGroup = "overhead-mode";

  return (
    <>
      <PageHeader
        title={M.editTitle}
        description={`${title}${M.separator}${basisText({ sheet, formula: detail.formula, version: detail.version, batch: detail.batch })}`}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <form ref={formRef} onSubmit={save} noValidate className="grid min-w-0 gap-8">
          {failure ? <Notice variant="error">{failure}</Notice> : null}
          {attempted && !built.ok ? <Notice variant="error">{M.fixFields}</Notice> : null}

          <Section heading={M.countsHeading}>
            <Field label={M.titleLabel} error={errors.title}>
              {(c) => <Input {...c} value={values.title} onChange={(e) => change((v) => ({ ...v, title: e.target.value }))} />}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={M.candlesLabel} error={errors.candles}>
                {(c) => (
                  <Input
                    {...c}
                    inputMode="numeric"
                    value={values.candlesText}
                    onChange={(e) => change((v) => ({ ...v, candlesText: e.target.value }))}
                  />
                )}
              </Field>
              <Field label={M.sellableLabel} error={errors.sellable}>
                {(c) => (
                  <Input
                    {...c}
                    inputMode="numeric"
                    value={values.sellableText}
                    onChange={(e) => change((v) => ({ ...v, sellableText: e.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Section>

          <Section heading={M.linesHeading}>
            <p className="text-sm text-text-secondary">{M.linesHint}</p>
            <ul className="grid gap-3">
              {values.lines.map((line) => (
                <LineFields key={line.key} line={line} errors={errors} onChange={(next) => setLine(line.key, next)} />
              ))}
            </ul>
          </Section>

          <Section heading={M.itemsEditHeading}>
            <p className="text-sm text-text-secondary">{M.itemsHint}</p>
            {values.items.length > 0 ? (
              <ul className="grid gap-3">
                {values.items.map((item) => (
                  <ItemFields
                    key={item.rowKey}
                    item={item}
                    errors={errors}
                    onChange={(next) => setItem(item.rowKey, next)}
                    onRemove={(button) => {
                      change((v) => ({ ...v, items: v.items.filter((i) => i.rowKey !== item.rowKey) }));
                      focusAfterRemove(button);
                    }}
                  />
                ))}
              </ul>
            ) : null}
            <div className="grid gap-3">
              {pickerItems.length > 0 ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={M.itemPickerLabel} className="min-w-48 flex-1">
                    {(c) => (
                      <select {...c} className={SELECT_CLASS} value={pick} onChange={(e) => setPick(e.target.value)}>
                        <option value="">{M.itemPickerPlaceholder}</option>
                        {pickerItems.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    data-add-row
                    disabled={atMax || pick === ""}
                    onClick={() => {
                      const chosen = pickerItems.find((i) => i.id === pick);
                      if (!chosen) return;
                      addItem({
                        rowKey: crypto.randomUUID(),
                        itemId: chosen.id,
                        name: chosen.name,
                        priceText: centavosToInput(chosen.unitCentavos),
                        per: "sellable",
                        quantityText: "1",
                      });
                      setPick("");
                    }}
                  >
                    {M.itemAddFromList}
                  </Button>
                </div>
              ) : null}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  data-add-row
                  disabled={atMax}
                  onClick={() =>
                    addItem({
                      rowKey: crypto.randomUUID(),
                      itemId: null,
                      name: "",
                      priceText: "0.00",
                      per: "sellable",
                      quantityText: "1",
                    })
                  }
                >
                  {M.itemAddOneOff}
                </Button>
              </div>
              {atMax ? <p className="text-sm text-text-secondary">{M.itemsAtMax(MAX_SHEET_ITEMS)}</p> : null}
            </div>
          </Section>

          <Section heading={M.labourHeading}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={M.labourHoursLabel} error={errors.hours}>
                {(c) => (
                  <Input
                    {...c}
                    inputMode="decimal"
                    value={values.hoursText}
                    onChange={(e) => change((v) => ({ ...v, hoursText: e.target.value }))}
                  />
                )}
              </Field>
              <Field label={M.labourRateLabel} error={errors.rate}>
                {(c) => (
                  <Input
                    {...c}
                    inputMode="decimal"
                    value={values.rateText}
                    onChange={(e) => change((v) => ({ ...v, rateText: e.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Section>

          <Section heading={M.overheadHeading}>
            <fieldset className="grid gap-1">
              <legend className="text-sm font-semibold text-text-secondary">{M.overheadModeLabel}</legend>
              {(["fixed", "percent"] as OverheadMode[]).map((mode) => (
                <RadioOption
                  key={mode}
                  name={overheadGroup}
                  value={mode}
                  checked={values.overheadMode === mode}
                  onChange={() => change((v) => ({ ...v, overheadMode: mode }))}
                >
                  {mode === "fixed" ? M.overheadFixed : M.overheadPercent}
                </RadioOption>
              ))}
            </fieldset>
            {values.overheadMode === "fixed" ? (
              <Field label={M.overheadFixedLabel} error={errors.overheadFixed}>
                {(c) => (
                  <Input
                    {...c}
                    inputMode="decimal"
                    value={values.overheadFixedText}
                    onChange={(e) => change((v) => ({ ...v, overheadFixedText: e.target.value }))}
                  />
                )}
              </Field>
            ) : (
              <Field label={M.overheadPercentLabel} error={errors.overheadPercent}>
                {(c) => (
                  <Input
                    {...c}
                    inputMode="decimal"
                    value={values.overheadPercentText}
                    onChange={(e) => change((v) => ({ ...v, overheadPercentText: e.target.value }))}
                  />
                )}
              </Field>
            )}
            <Field label={M.testingLabelField} error={errors.testing}>
              {(c) => (
                <Input
                  {...c}
                  inputMode="decimal"
                  value={values.testingText}
                  onChange={(e) => change((v) => ({ ...v, testingText: e.target.value }))}
                />
              )}
            </Field>
          </Section>

          <Section heading={M.scenariosHeading}>
            <div className="grid gap-1">
              <label className="flex min-h-11 items-center gap-2 text-base text-foreground">
                <input
                  type="checkbox"
                  role="switch"
                  checked={values.pricesIncludeVat}
                  aria-describedby="cost-vat-note"
                  onChange={(e) => change((v) => ({ ...v, pricesIncludeVat: e.target.checked }))}
                  className="size-4 shrink-0 accent-primary"
                />
                <span>{M.vatSwitch}</span>
              </label>
              <p id="cost-vat-note" className="text-sm text-muted-foreground">
                {M.vatNote}
              </p>
            </div>
            <ScenarioFields
              name="wholesale"
              label={M.wholesale}
              value={values.wholesale}
              errors={errors}
              onChange={(next) => change((v) => ({ ...v, wholesale: next }))}
            />
            <ScenarioFields
              name="retail"
              label={M.retail}
              value={values.retail}
              errors={errors}
              onChange={(next) => change((v) => ({ ...v, retail: next }))}
            />
          </Section>

          <Field label={M.notesFieldLabel} error={errors.notes}>
            {(c) => (
              <Textarea
                {...c}
                rows={3}
                value={values.notes}
                onChange={(e) => change((v) => ({ ...v, notes: e.target.value }))}
              />
            )}
          </Field>

          <div className="grid gap-3">
            {saved ? (
              <Notice
                variant="success"
                action={
                  <Link href={sheetHref(sheet.id)} className="text-sm text-primary underline-offset-4 hover:underline">
                    {M.backToSheet}
                  </Link>
                }
              >
                {M.saved}
              </Notice>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" busy={busy}>
                {M.save}
              </Button>
              <Button asChild variant="ghost">
                <Link href={sheetHref(sheet.id)}>{M.cancel}</Link>
              </Button>
            </div>
          </div>
        </form>

        <aside
          aria-label={M.resultsHeading}
          data-testid="cost-live-results"
          // Scrolls on its own on wide screens, so it must be reachable by keyboard.
          tabIndex={0}
          className="min-w-0 rounded-lg border border-border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        >
          <h2 className="mb-4 text-lg font-semibold">{M.resultsHeading}</h2>
          {shown ? (
            <CostSummary figures={shown.figures} result={shown.result}>
              {live === null ? <Notice variant="info">{M.resultsStale}</Notice> : null}
            </CostSummary>
          ) : (
            <p className="text-sm text-text-secondary">{M.resultsStale}</p>
          )}
        </aside>
      </div>
    </>
  );
}
