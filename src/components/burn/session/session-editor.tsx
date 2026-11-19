"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { batchTitle, formatProducedOn } from "@/components/batches/text";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataError, getDataLayer } from "@/lib/db";
import type { BatchListItem, BurnSessionDetail, BurnTestOption } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { milestoneDueOn, todayLocal } from "@/lib/schedule";
import { MAX_BURN_CANDLES, MAX_BURNS_PER_CANDLE } from "@/lib/types";
import type { Material } from "@/lib/types";
import { milestoneName } from "@/components/schedule/names";
import {
  SOOT_LEVELS,
  WICK_OWN,
  burnKeyOf,
  candleKeyOf,
  emptyBurn,
  emptyCandle,
  formErrors,
  newFormValues,
  validateForm,
  valuesFromSession,
  type BurnRow,
  type CandleRow,
  type Context,
  type FormErrors,
  type FormValues,
} from "./form-model";

const M = MESSAGES.burn;

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none aria-invalid:border-destructive pointer-coarse:min-h-11";

type Props = { mode: "new"; batchId: string } | { mode: "edit"; sessionId: string };

type Loaded =
  | {
      status: "ok";
      item: BatchListItem;
      session: BurnSessionDetail | null;
      wicks: Material[];
      allMaterialIds: Set<string>;
      options: BurnTestOption[];
    }
  | { status: "missing-batch" }
  | { status: "missing-session" }
  | { status: "error" };

/** The burn test editor: `/burn-tests/new?batch=<id>` and `/burn-tests/<id>/edit`. */
export function SessionEditor(props: Props) {
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const sourceId = props.mode === "new" ? props.batchId : props.sessionId;
  const mode = props.mode;

  useEffect(() => {
    let live = true;
    (async (): Promise<Loaded> => {
      try {
        const layer = getDataLayer();
        let session: BurnSessionDetail | null = null;
        let batchId: string;
        if (mode === "edit") {
          const found = await layer.burnSessions.get(sourceId);
          if (!found) return { status: "missing-session" };
          session = found;
          batchId = found.session.batchId;
        } else {
          batchId = sourceId;
        }
        const item = await layer.batches.get(batchId);
        if (!item) return { status: "missing-batch" };
        const [materials, options] = await Promise.all([
          layer.materials.list({ includeArchived: true }),
          layer.burnSessions.burnTestOptions(batchId),
        ]);
        return {
          status: "ok",
          item,
          session,
          wicks: materials.filter((m) => m.type === "wick"),
          allMaterialIds: new Set(materials.map((m) => m.id)),
          options,
        };
      } catch {
        return { status: "error" };
      }
    })().then((result) => {
      if (live) setLoaded(result);
    });
    return () => {
      live = false;
    };
  }, [mode, sourceId, reload]);

  const title = mode === "new" ? M.newTitle : M.editTitle;

  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={title} />
        <p role="status" className="text-sm text-text-secondary">
          {M.editorLoading}
        </p>
      </>
    );
  }
  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={title} />
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
  if (loaded.status === "missing-batch") {
    return (
      <>
        <PageHeader title={M.batchMissingTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{M.batchMissingBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/batches">{M.backToBatches}</Link>
          </Button>
        </div>
      </>
    );
  }
  if (loaded.status === "missing-session") {
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
  return <EditorForm key={sourceId} loaded={loaded} />;
}

const newKey = () => crypto.randomUUID();

type OkLoaded = Extract<Loaded, { status: "ok" }>;

function EditorForm({ loaded }: { loaded: OkLoaded }) {
  const { item, session, wicks, options } = loaded;
  const { batch } = item;
  const editing = session !== null;
  const hasActiveWicks = wicks.some((w) => w.archivedAt === null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Chosen once per editor mount and reused on retry, so a retried create writes nothing twice.
  const [sessionId] = useState(() => session?.session.id ?? crypto.randomUUID());
  const [values, setValues] = useState<FormValues>(() =>
    session
      ? valuesFromSession(session.session, {
          newKey,
          knownMaterialIds: loaded.allMaterialIds,
          linkResolves: session.milestone !== null,
        })
      : newFormValues(todayLocal(), newKey, hasActiveWicks),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const submitting = useRef(false);

  const context = useCallback(
    (): Context => ({
      today: todayLocal(),
      producedOn: batch.producedOn,
      formatDate: formatProducedOn,
    }),
    [batch.producedOn],
  );

  // A save found problems: focus the first invalid field once it is marked.
  useEffect(() => {
    if (focusTick === 0) return;
    const form = formRef.current;
    if (!form) return;
    const target = form.querySelector<HTMLElement>('[aria-invalid="true"]');
    target?.focus();
    target?.scrollIntoView?.({ block: "center" });
  }, [focusTick]);

  /** On blur: check these fields (and nothing else) and show or clear their errors. */
  function check(next: FormValues, keys: string[]) {
    const found = formErrors(next, context());
    setErrors((prev) => {
      const merged = { ...prev };
      for (const key of keys) {
        if (found[key]) merged[key] = found[key];
        else delete merged[key];
      }
      return merged;
    });
  }

  /** While typing: only clear errors that no longer apply. */
  function change(next: FormValues, keys: string[] = []) {
    setValues(next);
    setFailure(null);
    if (keys.length === 0 && !errors.form) return;
    const found = formErrors(next, context());
    setErrors((prev) => {
      const merged = { ...prev };
      for (const key of keys) if (merged[key] && !found[key]) delete merged[key];
      delete merged.form;
      return merged;
    });
  }

  function updateCandle(key: string, patch: Partial<CandleRow>, errorKeys: string[] = []) {
    change(
      { ...values, candles: values.candles.map((c) => (c.key === key ? { ...c, ...patch } : c)) },
      errorKeys,
    );
  }

  function updateBurn(
    candleKey: string,
    key: string,
    patch: Partial<BurnRow>,
    errorKeys: string[] = [],
  ) {
    change(
      {
        ...values,
        candles: values.candles.map((c) =>
          c.key === candleKey
            ? { ...c, burns: c.burns.map((b) => (b.key === key ? { ...b, ...patch } : b)) }
            : c,
        ),
      },
      errorKeys,
    );
  }

  function dropErrors(prefixes: string[]) {
    setErrors((prev) => {
      const merged: FormErrors = {};
      for (const [key, value] of Object.entries(prev)) {
        if (!prefixes.some((p) => key.startsWith(`${p}.`))) merged[key] = value;
      }
      return merged;
    });
  }

  function addCandle() {
    if (values.candles.length >= MAX_BURN_CANDLES) return;
    change({
      ...values,
      candles: [
        ...values.candles,
        emptyCandle(newKey(), values.candles.length + 1, hasActiveWicks),
      ],
    });
  }

  function removeCandle(key: string) {
    const removed = values.candles.find((c) => c.key === key);
    if (!removed || values.candles.length <= 1) return;
    change({ ...values, candles: values.candles.filter((c) => c.key !== key) });
    dropErrors([key, ...removed.burns.map((b) => b.key)]);
  }

  function addBurn(candleKey: string) {
    const candle = values.candles.find((c) => c.key === candleKey);
    if (!candle || candle.burns.length >= MAX_BURNS_PER_CANDLE) return;
    updateCandle(candleKey, { burns: [...candle.burns, emptyBurn(newKey())] });
  }

  function removeBurn(candleKey: string, key: string) {
    const candle = values.candles.find((c) => c.key === candleKey);
    if (!candle) return;
    updateCandle(candleKey, { burns: candle.burns.filter((b) => b.key !== key) });
    dropErrors([key]);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting.current) return;
    const { errors: found, input } = validateForm(values, context());
    setErrors(found);
    if (input === null) {
      setFailure(null);
      setFocusTick((n) => n + 1);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const layer = getDataLayer();
      if (editing) await layer.burnSessions.update(sessionId, input);
      else await layer.burnSessions.create({ ...input, sessionId, batchId: batch.id });
      router.replace(`/burn-tests/${sessionId}?saved=1`);
      // Stay busy while the page changes.
    } catch (error) {
      submitting.current = false;
      setBusy(false);
      const code = error instanceof DataError ? error.code : undefined;
      if (code === "not-found") {
        setGone(true);
        setFailure(editing ? M.saveGone : M.saveBatchGone);
      } else if (code === "invalid") setFailure(M.saveInvalid);
      else if (code === "storage-full") setFailure(M.saveStorageFull);
      else setFailure(M.saveFailed);
    }
  }

  const sessionHref = editing ? `/burn-tests/${sessionId}` : `/batches/${batch.id}`;
  const taken = (option: BurnTestOption) =>
    option.linkedSessionId !== null && option.linkedSessionId !== sessionId;
  const candleCount = values.candles.length;

  return (
    <>
      <PageHeader
        title={editing ? M.editTitle : M.newTitle}
        description={
          editing
            ? M.editDescription(batchTitle(batch))
            : M.newDescription(batchTitle(batch), formatProducedOn(batch.producedOn))
        }
      />
      <form ref={formRef} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-8">
        <section aria-labelledby="burn-details" className="grid max-w-xl gap-4">
          <h2 id="burn-details" className="sr-only">
            {editing ? M.editTitle : M.newTitle}
          </h2>
          <Field label={M.dateLabel} error={errors.testedOn}>
            {(c) => (
              <Input
                {...c}
                type="date"
                autoComplete="off"
                value={values.testedOn}
                onChange={(e) => change({ ...values, testedOn: e.target.value }, ["testedOn"])}
                onBlur={() => check(values, ["testedOn"])}
              />
            )}
          </Field>
          <Field label={M.labelLabel} hint={M.labelHint} error={errors.label}>
            {(c) => (
              <Input
                {...c}
                autoComplete="off"
                value={values.label}
                onChange={(e) => change({ ...values, label: e.target.value }, ["label"])}
                onBlur={() => check(values, ["label"])}
              />
            )}
          </Field>
          <Field
            label={M.plannedLabel}
            hint={options.length === 0 ? M.plannedNoOptions : M.plannedHint}
          >
            {(c) => (
              <select
                {...c}
                className={SELECT_CLASS}
                value={values.milestoneId}
                onChange={(e) => change({ ...values, milestoneId: e.target.value })}
              >
                <option value="">{M.plannedNone}</option>
                {options.map((option) => {
                  const name = milestoneName(option.milestone);
                  const due = formatProducedOn(
                    milestoneDueOn(batch.producedOn, option.milestone.offsetDays),
                  );
                  return (
                    <option
                      key={option.milestone.id}
                      value={option.milestone.id}
                      disabled={taken(option)}
                    >
                      {taken(option) ? M.plannedOptionTaken(name, due) : M.plannedOption(name, due)}
                    </option>
                  );
                })}
              </select>
            )}
          </Field>
        </section>

        <section aria-labelledby="burn-candles" className="min-w-0">
          <h2 id="burn-candles" className="text-lg font-semibold">
            {M.candlesHeading}
          </h2>
          <p className="mt-1 mb-4 text-sm text-text-secondary">{M.candlesHint}</p>
          <ul className="mb-4 flex flex-col gap-4">
            {values.candles.map((candle, index) => (
              <CandleEditor
                key={candle.key}
                candle={candle}
                number={index + 1}
                wicks={wicks}
                canRemove={candleCount > 1}
                errors={errors}
                onChange={(patch, keys) => updateCandle(candle.key, patch, keys)}
                onCheck={(keys) => check(values, keys)}
                onRemove={() => removeCandle(candle.key)}
                onAddBurn={() => addBurn(candle.key)}
                onBurnChange={(burnKey, patch, keys) => updateBurn(candle.key, burnKey, patch, keys)}
                onBurnRemove={(burnKey) => removeBurn(candle.key, burnKey)}
              />
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            disabled={candleCount >= MAX_BURN_CANDLES}
            className="pointer-coarse:min-h-11"
            onMouseDown={(event) => event.preventDefault()}
            onClick={addCandle}
          >
            {M.addCandle}
          </Button>
          {candleCount >= MAX_BURN_CANDLES ? (
            <p className="mt-2 text-sm text-text-secondary">{M.candleLimit(MAX_BURN_CANDLES)}</p>
          ) : null}
        </section>

        <section aria-labelledby="burn-closing" className="grid max-w-xl gap-4">
          <h2 id="burn-closing" className="text-lg font-semibold">
            {M.closingHeading}
          </h2>
          <Field label={M.conclusionLabel} hint={M.conclusionHint} error={errors.conclusion}>
            {(c) => (
              <Textarea
                {...c}
                rows={4}
                value={values.conclusion}
                onChange={(e) => change({ ...values, conclusion: e.target.value }, ["conclusion"])}
                onBlur={() => check(values, ["conclusion"])}
              />
            )}
          </Field>
          <Field label={M.notesLabel} error={errors.notes}>
            {(c) => (
              <Textarea
                {...c}
                rows={3}
                value={values.notes}
                onChange={(e) => change({ ...values, notes: e.target.value }, ["notes"])}
                onBlur={() => check(values, ["notes"])}
              />
            )}
          </Field>
          {!editing ? <p className="text-sm text-text-secondary">{M.photosAfterSave}</p> : null}
        </section>

        <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
          {errors.form ? <Notice variant="error">{errors.form}</Notice> : null}
          {Object.keys(errors).some((k) => k !== "form") ? (
            <Notice variant="error">{M.errCheckFields}</Notice>
          ) : null}
          {failure ? (
            <Notice
              variant="error"
              action={
                gone ? (
                  <Button asChild variant="link" size="sm">
                    <Link href="/batches">{M.backToBatches}</Link>
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => void submit()}>
                    {M.retry}
                  </Button>
                )
              }
            >
              {failure}
            </Notice>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            busy={busy}
            className="pointer-coarse:min-h-11"
            onMouseDown={(event) => event.preventDefault()}
          >
            {busy ? (editing ? M.savingChanges : M.saving) : editing ? M.saveChanges : M.save}
          </Button>
          <Button asChild variant="ghost" className="pointer-coarse:min-h-11">
            <Link href={sessionHref}>{M.cancel}</Link>
          </Button>
        </div>
      </form>
    </>
  );
}

/** A label whose accessible name starts with where the field is (screen readers and tests). */
function Where({ prefix, children }: { prefix: string; children: ReactNode }) {
  return (
    <>
      <span className="sr-only">{prefix}: </span>
      {children}
    </>
  );
}

function CandleEditor({
  candle,
  number,
  wicks,
  canRemove,
  errors,
  onChange,
  onCheck,
  onRemove,
  onAddBurn,
  onBurnChange,
  onBurnRemove,
}: {
  candle: CandleRow;
  number: number;
  wicks: Material[];
  canRemove: boolean;
  errors: FormErrors;
  onChange: (patch: Partial<CandleRow>, errorKeys?: string[]) => void;
  onCheck: (keys: string[]) => void;
  onRemove: () => void;
  onAddBurn: () => void;
  onBurnChange: (burnKey: string, patch: Partial<BurnRow>, errorKeys?: string[]) => void;
  onBurnRemove: (burnKey: string) => void;
}) {
  const where = M.candleGroup(number);
  const k = (field: string) => candleKeyOf(candle.key, field);
  // A candle keeps its archived wick: it stays in the list for this candle only.
  const atBurnLimit = candle.burns.length >= MAX_BURNS_PER_CANDLE;
  const wickOptions = wicks.filter((w) => w.archivedAt === null || w.id === candle.wick);

  return (
    <li>
      <fieldset
        data-testid="candle-editor"
        className="grid min-w-0 gap-4 rounded-lg border border-border bg-card p-3 sm:p-4"
      >
        <legend className="sr-only">{where}</legend>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{M.candleHeading(number)}</h3>
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="pointer-coarse:min-h-11"
              aria-label={M.removeCandleFor(number)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onRemove}
            >
              {M.removeCandle}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={<Where prefix={where}>{M.candleLabelLabel}</Where>}
            error={errors[k("label")]}
          >
            {(c) => (
              <Input
                {...c}
                autoComplete="off"
                value={candle.label}
                onChange={(e) => onChange({ label: e.target.value }, [k("label")])}
                onBlur={() => onCheck([k("label")])}
              />
            )}
          </Field>
          <Field
            label={<Where prefix={where}>{M.wickLabel}</Where>}
            error={candle.wick === WICK_OWN ? undefined : errors[k("wick")]}
          >
            {(c) => (
              <select
                {...c}
                className={SELECT_CLASS}
                value={candle.wick}
                onChange={(e) => {
                  onChange({ wick: e.target.value }, [k("wick")]);
                }}
                onBlur={() => onCheck([k("wick")])}
              >
                <option value="">{M.wickChoose}</option>
                {wickOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.archivedAt !== null ? M.wickArchived(w.name) : w.name}
                  </option>
                ))}
                <option value={WICK_OWN}>{M.wickOwn}</option>
              </select>
            )}
          </Field>
          {candle.wick === WICK_OWN ? (
            <Field
              label={<Where prefix={where}>{M.wickTextLabel}</Where>}
              hint={M.wickTextHint}
              error={errors[k("wick")]}
              className="sm:col-span-2"
            >
              {(c) => (
                <Input
                  {...c}
                  autoComplete="off"
                  value={candle.wickText}
                  onChange={(e) => onChange({ wickText: e.target.value }, [k("wick")])}
                  onBlur={() => onCheck([k("wick")])}
                />
              )}
            </Field>
          ) : null}
        </div>

        <section aria-label={`${where}: ${M.burnsHeading}`} className="grid min-w-0 gap-3">
          <div>
            <h4 className="text-base font-semibold">{M.burnsHeading}</h4>
            <p className="text-sm text-text-secondary">{M.burnsHint}</p>
          </div>
          {candle.burns.length === 0 ? (
            <p className="text-sm text-text-secondary">{M.burnsNone}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {candle.burns.map((burn, index) => (
                <BurnEditor
                  key={burn.key}
                  burn={burn}
                  candleNumber={number}
                  number={index + 1}
                  errors={errors}
                  onChange={(patch, keys) => onBurnChange(burn.key, patch, keys)}
                  onCheck={onCheck}
                  onRemove={() => onBurnRemove(burn.key)}
                />
              ))}
            </ul>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={atBurnLimit}
              className="pointer-coarse:min-h-11"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onAddBurn}
            >
              {M.addBurn}
            </Button>
            {atBurnLimit ? (
              <p className="mt-2 text-sm text-text-secondary">{M.burnLimit(MAX_BURNS_PER_CANDLE)}</p>
            ) : null}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={<Where prefix={where}>{M.coldThrowLabel}</Where>}
            hint={M.throwHint}
            error={errors[k("coldThrow")]}
          >
            {(c) => (
              <Textarea
                {...c}
                rows={2}
                value={candle.coldThrow}
                onChange={(e) => onChange({ coldThrow: e.target.value }, [k("coldThrow")])}
                onBlur={() => onCheck([k("coldThrow")])}
              />
            )}
          </Field>
          <Field
            label={<Where prefix={where}>{M.hotThrowLabel}</Where>}
            hint={M.throwHint}
            error={errors[k("hotThrow")]}
          >
            {(c) => (
              <Textarea
                {...c}
                rows={2}
                value={candle.hotThrow}
                onChange={(e) => onChange({ hotThrow: e.target.value }, [k("hotThrow")])}
                onBlur={() => onCheck([k("hotThrow")])}
              />
            )}
          </Field>
          <Field
            label={<Where prefix={where}>{M.candleNotesLabel}</Where>}
            error={errors[k("notes")]}
            className="sm:col-span-2"
          >
            {(c) => (
              <Textarea
                {...c}
                rows={2}
                value={candle.notes}
                onChange={(e) => onChange({ notes: e.target.value }, [k("notes")])}
                onBlur={() => onCheck([k("notes")])}
              />
            )}
          </Field>
        </div>
      </fieldset>
    </li>
  );
}

function BurnEditor({
  burn,
  candleNumber,
  number,
  errors,
  onChange,
  onCheck,
  onRemove,
}: {
  burn: BurnRow;
  candleNumber: number;
  number: number;
  errors: FormErrors;
  onChange: (patch: Partial<BurnRow>, errorKeys?: string[]) => void;
  onCheck: (keys: string[]) => void;
  onRemove: () => void;
}) {
  const where = M.burnGroup(candleNumber, number);
  const k = (field: string) => burnKeyOf(burn.key, field);

  /** A numeric text field with its error handling. */
  function numberField(
    field: "duration" | "before" | "after" | "diameter" | "depth" | "flame",
    label: string,
    mode: "numeric" | "decimal",
    linked: string[] = [],
  ) {
    return (
      <Field label={<Where prefix={where}>{label}</Where>} error={errors[k(field)]}>
        {(c) => (
          <Input
            {...c}
            inputMode={mode}
            autoComplete="off"
            value={burn[field]}
            onChange={(e) => onChange({ [field]: e.target.value }, [k(field), ...linked.map(k)])}
            onBlur={() => onCheck([k(field), ...linked.map(k)])}
          />
        )}
      </Field>
    );
  }

  return (
    <li>
      <fieldset
        data-testid="burn-editor"
        className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-2 sm:p-4"
      >
        <legend className="sr-only">{where}</legend>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <h5 className="text-sm font-semibold">{M.burnHeading(number)}</h5>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:min-h-11"
            aria-label={M.removeBurnFor(candleNumber, number)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onRemove}
          >
            {M.removeBurn}
          </Button>
        </div>
        {numberField("duration", M.durationLabel, "numeric")}
        <div className="hidden sm:block" aria-hidden="true" />
        {numberField("before", M.weightBeforeLabel, "decimal", ["after"])}
        {numberField("after", M.weightAfterLabel, "decimal")}
        {numberField("diameter", M.meltDiameterLabel, "numeric")}
        {numberField("depth", M.meltDepthLabel, "numeric")}
        {numberField("flame", M.flameLabel, "numeric")}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${burn.key}-soot`}>
            <Where prefix={where}>{M.sootLabel}</Where>
          </Label>
          <select
            id={`${burn.key}-soot`}
            className={SELECT_CLASS}
            value={burn.soot}
            onChange={(e) => onChange({ soot: e.target.value as BurnRow["soot"] })}
          >
            <option value="">{M.sootNotRecorded}</option>
            {SOOT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {M.soot[level]}
              </option>
            ))}
          </select>
        </div>
        <Field
          label={<Where prefix={where}>{M.burnNotesLabel}</Where>}
          error={errors[k("notes")]}
          className="sm:col-span-2"
        >
          {(c) => (
            <Textarea
              {...c}
              rows={2}
              value={burn.notes}
              onChange={(e) => onChange({ notes: e.target.value }, [k("notes")])}
              onBlur={() => onCheck([k("notes")])}
            />
          )}
        </Field>
      </fieldset>
    </li>
  );
}
