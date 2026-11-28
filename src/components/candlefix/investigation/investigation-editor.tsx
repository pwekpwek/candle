"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { batchTitle, formatProducedOn, localToday } from "@/components/batches/text";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { checklistView } from "@/lib/candlefix";
import { DataError, getDataLayer } from "@/lib/db";
import type { InvestigationDetail } from "@/lib/db";
import { focusAfterRemove } from "@/lib/focus-after-remove";
import { MESSAGES } from "@/lib/messages";
import { FIX_ISSUES, HYPOTHESIS_STATUSES, MAX_HYPOTHESES } from "@/lib/types";
import type { Batch, FixIssue } from "@/lib/types";
import {
  checkErrorKey,
  emptyHypothesis,
  formErrors,
  hypothesisErrorKey,
  newFormValues,
  noLongerListed,
  validateForm,
  valuesFromInvestigation,
  type Context,
  type FormErrors,
  type FormValues,
  type HypothesisRow,
} from "./form-model";

const M = MESSAGES.candleFix;

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground aria-invalid:border-destructive pointer-coarse:min-h-11";

type Props = { mode: "new"; batchId: string } | { mode: "edit"; investigationId: string };

type Loaded =
  | { status: "ok"; batch: Batch; detail: InvestigationDetail | null }
  | { status: "missing-batch" }
  | { status: "missing-investigation" }
  | { status: "error" };

/** The investigation editor: `/investigations/new?batch=<id>` and `/investigations/<id>/edit`. */
export function InvestigationEditor(props: Props) {
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const mode = props.mode;
  const sourceId = props.mode === "new" ? props.batchId : props.investigationId;

  useEffect(() => {
    let live = true;
    (async (): Promise<Loaded> => {
      try {
        const layer = getDataLayer();
        if (mode === "edit") {
          const detail = await layer.investigations.get(sourceId);
          if (!detail) return { status: "missing-investigation" };
          return { status: "ok", batch: detail.batch, detail };
        }
        const item = await layer.batches.get(sourceId);
        if (!item) return { status: "missing-batch" };
        return { status: "ok", batch: item.batch, detail: null };
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
  if (loaded.status === "missing-batch" || loaded.status === "missing-investigation") {
    const batchGone = loaded.status === "missing-batch";
    return (
      <>
        <PageHeader title={batchGone ? M.batchMissingTitle : M.notFoundTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">
          {batchGone ? M.batchMissingBody : M.notFoundBody}
        </p>
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

/** Stored hypotheses that an experiment follows but the form no longer has. */
function missingFollowed(
  values: FormValues,
  detail: InvestigationDetail | null,
): { index: number; id: string }[] {
  if (!detail) return [];
  const followed = new Set(detail.experiments.map((e) => e.experiment.hypothesisId));
  const present = new Set(values.hypotheses.map((h) => h.id).filter(Boolean));
  const missing: { index: number; id: string }[] = [];
  detail.investigation.hypotheses.forEach((h, index) => {
    if (followed.has(h.id) && !present.has(h.id)) missing.push({ index, id: h.id });
  });
  return missing;
}

function EditorForm({ loaded }: { loaded: OkLoaded }) {
  const { batch, detail } = loaded;
  const editing = detail !== null;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Chosen once per editor mount and reused on retry, so a retried create writes nothing twice.
  const [investigationId] = useState(() => detail?.investigation.id ?? crypto.randomUUID());
  const [values, setValues] = useState<FormValues>(() =>
    detail ? valuesFromInvestigation(detail.investigation, newKey) : newFormValues(localToday()),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const submitting = useRef(false);

  const context = useCallback(
    (): Context => ({
      today: localToday(),
      producedOn: batch.producedOn,
      formatDate: formatProducedOn,
      ...(detail ? { storedObservedOn: detail.investigation.observedOn } : {}),
    }),
    [batch.producedOn, detail],
  );

  // A save found problems: focus the first invalid field once it is marked.
  useEffect(() => {
    if (focusTick === 0) return;
    const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
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

  function toggleIssue(issue: FixIssue, on: boolean) {
    const issues = FIX_ISSUES.filter((i) => (i === issue ? on : values.issues.includes(i)));
    change({ ...values, issues }, ["issues", "otherIssue"]);
  }

  function setCheck(itemId: string, patch: Partial<{ checked: boolean; note: string }>) {
    const current = values.checks[itemId] ?? { checked: false, note: "" };
    change(
      { ...values, checks: { ...values.checks, [itemId]: { ...current, ...patch } } },
      [checkErrorKey(itemId)],
    );
  }

  function updateHypothesis(key: string, patch: Partial<HypothesisRow>, errorKeys: string[] = []) {
    change(
      { ...values, hypotheses: values.hypotheses.map((h) => (h.key === key ? { ...h, ...patch } : h)) },
      errorKeys,
    );
  }

  function addHypothesis() {
    if (values.hypotheses.length >= MAX_HYPOTHESES) return;
    change({ ...values, hypotheses: [...values.hypotheses, emptyHypothesis(newKey())] });
  }

  function removeHypothesis(key: string) {
    change({ ...values, hypotheses: values.hypotheses.filter((h) => h.key !== key) });
    setErrors((prev) => {
      const merged: FormErrors = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`hyp.${key}.`)) merged[k] = v;
      }
      return merged;
    });
  }

  /**
   * An experiment follows a hypothesis the form no longer has: put it back as it
   * was stored, in its place, and say which one it is. The rest of the form stays.
   */
  function restoreFollowed(missing: { index: number; id: string }[]): string {
    const stored = detail?.investigation.hypotheses ?? [];
    const rows = [...values.hypotheses];
    for (const { index, id } of missing) {
      const h = stored[index];
      if (!h) continue;
      const row: HypothesisRow = {
        key: newKey(),
        id,
        text: h.text,
        status: h.status,
        notes: h.notes ?? "",
      };
      rows.splice(Math.min(index, rows.length), 0, row);
    }
    setValues({ ...values, hypotheses: rows });
    const first = stored[missing[0]?.index ?? 0];
    return M.errHypothesisInUse((missing[0]?.index ?? 0) + 1, first?.text ?? "");
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
    const missing = missingFollowed(values, detail);
    if (missing.length > 0) {
      setErrors({ form: restoreFollowed(missing) });
      setFailure(null);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const layer = getDataLayer();
      if (editing) await layer.investigations.update(investigationId, input);
      else await layer.investigations.create({ ...input, investigationId, batchId: batch.id });
      router.replace(`/investigations/${investigationId}?saved=1`);
      // Stay busy while the page changes.
    } catch (error) {
      submitting.current = false;
      setBusy(false);
      const code = error instanceof DataError ? error.code : undefined;
      if (code === "in-use") {
        // Another record started following a hypothesis since the form opened.
        try {
          const fresh = await getDataLayer().investigations.get(investigationId);
          const missingNow = missingFollowed(values, fresh ?? null);
          if (missingNow.length > 0 && fresh) {
            const stored = fresh.investigation.hypotheses[missingNow[0].index];
            setErrors({ form: M.errHypothesisInUse(missingNow[0].index + 1, stored?.text ?? "") });
            return;
          }
        } catch {
          // fall through to the general message
        }
        setFailure(M.saveFailed);
      } else if (code === "not-found") {
        setGone(true);
        setFailure(editing ? M.saveGone : M.saveBatchGone);
      } else if (code === "invalid") setFailure(M.saveInvalid);
      else if (code === "storage-full") setFailure(M.saveStorageFull);
      else setFailure(M.saveFailed);
    }
  }

  const backHref = editing ? `/investigations/${investigationId}` : `/batches/${batch.id}`;
  const view = checklistView(values.issues, values.storedTicks);
  const listedOut = noLongerListed(values);
  const hasOther = values.issues.includes("other");
  const issuesErrorId = `${useId()}-issues-error`;
  const hasFieldErrors = Object.keys(errors).some((k) => k !== "form");

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
        <section aria-labelledby="investigation-observed" className="grid max-w-xl gap-4">
          <h2 id="investigation-observed" className="sr-only">
            {M.observedHeading}
          </h2>
          <Field label={M.dateLabel} error={errors.observedOn}>
            {(c) => (
              <Input
                {...c}
                type="date"
                autoComplete="off"
                value={values.observedOn}
                onChange={(e) => change({ ...values, observedOn: e.target.value }, ["observedOn"])}
                onBlur={() => check(values, ["observedOn"])}
              />
            )}
          </Field>
          <Field label={M.titleLabel} hint={M.titleHint} error={errors.title}>
            {(c) => (
              <Input
                {...c}
                autoComplete="off"
                value={values.title}
                onChange={(e) => change({ ...values, title: e.target.value }, ["title"])}
                onBlur={() => check(values, ["title"])}
              />
            )}
          </Field>

          <fieldset className="grid min-w-0 gap-1 border-0 p-0" data-testid="issues-group">
            <legend className="mb-1 text-sm font-medium text-foreground">{M.issuesLegend}</legend>
            <p className="text-sm text-muted-foreground">{M.issuesHint}</p>
            <ul className="grid list-none gap-0 p-0 sm:grid-cols-2">
              {FIX_ISSUES.map((issue, index) => (
                <li key={issue}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1">
                    <input
                      type="checkbox"
                      data-testid={`issue-checkbox-${issue}`}
                      className="size-5 shrink-0 accent-primary"
                      checked={values.issues.includes(issue)}
                      onChange={(e) => toggleIssue(issue, e.target.checked)}
                      onBlur={() => check(values, ["issues"])}
                      {...(index === 0 && errors.issues
                        ? { "aria-invalid": true as const, "aria-describedby": issuesErrorId }
                        : {})}
                    />
                    <span>{M.issueLabels[issue]}</span>
                  </label>
                </li>
              ))}
            </ul>
            {errors.issues ? (
              <p id={issuesErrorId} className="text-sm text-destructive">
                {errors.issues}
              </p>
            ) : null}
          </fieldset>

          {hasOther ? (
            <Field label={M.otherLabel} error={errors.otherIssue}>
              {(c) => (
                <Input
                  {...c}
                  autoComplete="off"
                  value={values.otherIssue}
                  onChange={(e) => change({ ...values, otherIssue: e.target.value }, ["otherIssue"])}
                  onBlur={() => check(values, ["otherIssue"])}
                />
              )}
            </Field>
          ) : null}

          <Field label={M.notesLabel} hint={M.notesHint} error={errors.notes}>
            {(c) => (
              <Textarea
                {...c}
                rows={4}
                value={values.notes}
                onChange={(e) => change({ ...values, notes: e.target.value }, ["notes"])}
                onBlur={() => check(values, ["notes"])}
              />
            )}
          </Field>
        </section>

        <section
          aria-labelledby="investigation-checks"
          data-testid="checks-section"
          className="grid max-w-xl gap-4"
        >
          <div>
            <h2 id="investigation-checks" className="text-lg font-semibold">
              {M.checksHeading}
            </h2>
            <p className="text-sm text-text-secondary">{M.checksIntro}</p>
          </div>
          {view.groups.length === 0 ? (
            <p className="text-sm text-text-secondary">{M.checksNone}</p>
          ) : null}
          {view.groups.map((group) => {
            const headingId = `checks-${group.issue}`;
            return (
              <div key={group.issue} role="group" aria-labelledby={headingId} className="grid gap-2">
                <h3 id={headingId} className="text-base font-semibold">
                  {M.checkGroup(M.issueLabels[group.issue])}
                </h3>
                <ul className="grid list-none gap-2 p-0">
                  {group.rows.map((row) => {
                    const value = values.checks[row.item.id] ?? { checked: false, note: "" };
                    const showNote = value.checked || value.note !== "";
                    return (
                      <li key={row.item.id} className="grid gap-1">
                        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                          <input
                            type="checkbox"
                            data-testid={`check-item-${row.item.id}`}
                            className="mt-0.5 size-5 shrink-0 accent-primary"
                            checked={value.checked}
                            onChange={(e) => setCheck(row.item.id, { checked: e.target.checked })}
                          />
                          <span className="min-w-0 wrap-anywhere">{row.label}</span>
                        </label>
                        {showNote ? (
                          <Field
                            className="pl-8"
                            label={<span className="sr-only">{M.checkNoteLabel(row.label)}</span>}
                            error={errors[checkErrorKey(row.item.id)]}
                          >
                            {(c) => (
                              <Textarea
                                {...c}
                                rows={2}
                                placeholder={M.checkNoteLabel(row.label)}
                                value={value.note}
                                onChange={(e) => setCheck(row.item.id, { note: e.target.value })}
                                onBlur={() => check(values, [checkErrorKey(row.item.id)])}
                              />
                            )}
                          </Field>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {listedOut.length > 0 ? (
            <div data-testid="no-longer-listed" role="group" aria-labelledby="checks-no-longer" className="grid gap-2">
              <h3 id="checks-no-longer" className="text-base font-semibold">
                {M.noLongerListedHeading}
              </h3>
              <p className="text-sm text-text-secondary">{M.noLongerListedHint}</p>
              <ul className="grid list-none gap-2 p-0">
                {listedOut.map((tick) => (
                  <li key={tick.itemId} className="text-sm" data-testid={`kept-check-${tick.itemId}`}>
                    <span className="font-medium wrap-anywhere">{tick.label}</span>
                    <span className="text-text-secondary">
                      {MESSAGES.batches.separator}
                      {M.issueLabels[tick.issue]}
                      {MESSAGES.batches.separator}
                      {tick.checked ? M.checkTicked : M.checkNotTicked}
                    </span>
                    {tick.note ? (
                      <p className="whitespace-pre-wrap wrap-anywhere text-text-secondary">{tick.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section
          aria-labelledby="investigation-hypotheses"
          data-testid="hypotheses-block"
          className="grid max-w-2xl gap-4 rounded-lg border border-dashed border-border bg-muted p-3 sm:p-4"
        >
          <div>
            <h2 id="investigation-hypotheses" className="text-lg font-semibold">
              {M.hypothesesHeading}
            </h2>
            <p className="text-sm text-text-secondary">{M.hypothesesHint}</p>
          </div>
          {values.hypotheses.length === 0 ? (
            <p className="text-sm text-text-secondary">{M.hypothesesNone}</p>
          ) : (
            <ul className="grid list-none gap-4 p-0">
              {values.hypotheses.map((row, index) => {
                const n = index + 1;
                const prefix = <span className="sr-only">{M.hypothesisHeading(n)}: </span>;
                return (
                  <li
                    key={row.key}
                    data-testid="hypothesis-card"
                    className="grid gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold">{M.hypothesisHeading(n)}</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="pointer-coarse:min-h-11"
                        data-row-remove=""
                        aria-label={M.removeHypothesisFor(n)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          removeHypothesis(row.key);
                          focusAfterRemove(event.currentTarget);
                        }}
                      >
                        {M.removeHypothesis}
                      </Button>
                    </div>
                    <Field
                      label={<>{prefix}{M.hypothesisTextLabel}</>}
                      hint={M.hypothesisTextHint}
                      error={errors[hypothesisErrorKey(row.key, "text")]}
                    >
                      {(c) => (
                        <Textarea
                          {...c}
                          rows={3}
                          value={row.text}
                          onChange={(e) =>
                            updateHypothesis(row.key, { text: e.target.value }, [
                              hypothesisErrorKey(row.key, "text"),
                            ])
                          }
                          onBlur={() => check(values, [hypothesisErrorKey(row.key, "text")])}
                        />
                      )}
                    </Field>
                    <Field label={<>{prefix}{M.hypothesisStatusLabel}</>}>
                      {(c) => (
                        <select
                          {...c}
                          className={SELECT_CLASS}
                          value={row.status}
                          onChange={(e) =>
                            updateHypothesis(row.key, {
                              status: e.target.value as HypothesisRow["status"],
                            })
                          }
                          data-testid="hypothesis-status-select"
                        >
                          {HYPOTHESIS_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {M.hypothesisStatus[status]}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <Field
                      label={<>{prefix}{M.hypothesisNotesLabel}</>}
                      error={errors[hypothesisErrorKey(row.key, "notes")]}
                    >
                      {(c) => (
                        <Textarea
                          {...c}
                          rows={2}
                          value={row.notes}
                          onChange={(e) =>
                            updateHypothesis(row.key, { notes: e.target.value }, [
                              hypothesisErrorKey(row.key, "notes"),
                            ])
                          }
                          onBlur={() => check(values, [hypothesisErrorKey(row.key, "notes")])}
                        />
                      )}
                    </Field>
                  </li>
                );
              })}
            </ul>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={values.hypotheses.length >= MAX_HYPOTHESES}
              className="pointer-coarse:min-h-11"
              onMouseDown={(event) => event.preventDefault()}
              data-add-row=""
              onClick={addHypothesis}
            >
              {M.addHypothesis}
            </Button>
            {values.hypotheses.length >= MAX_HYPOTHESES ? (
              <p className="mt-2 text-sm text-text-secondary">{M.hypothesisLimit(MAX_HYPOTHESES)}</p>
            ) : null}
          </div>
        </section>

        {!editing ? (
          <p className="max-w-xl text-sm text-text-secondary">{MESSAGES.candleFix.photosAfterSave}</p>
        ) : null}

        <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
          {errors.form ? <Notice variant="error">{errors.form}</Notice> : null}
          {hasFieldErrors ? <Notice variant="error">{M.errCheckFields}</Notice> : null}
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
            <Link href={backHref}>{M.cancel}</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
