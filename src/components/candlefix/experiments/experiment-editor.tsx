"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { batchTitle, formatProducedOn } from "@/components/batches/text";
import { sessionTitle } from "@/components/burn/compare/text";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DataError, getDataLayer } from "@/lib/db";
import type { BatchListItem, BurnSessionListItem, InvestigationDetail } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { MAX_EXPERIMENT_CHANGE_LENGTH, MAX_EXPERIMENT_SESSIONS, MAX_TRACE_NOTES_LENGTH } from "@/lib/types";
import type { CorrectiveExperiment } from "@/lib/types";
import { investigationHref, statusLabel } from "./text";

const X = MESSAGES.candleFixExperiments;
const F = MESSAGES.candleFix;

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground aria-invalid:border-destructive pointer-coarse:min-h-11";

type Props =
  | { mode: "new"; investigationId: string; hypothesisId?: string | null }
  | { mode: "edit"; investigationId: string; experimentId: string };

type Loaded =
  | { status: "ok"; detail: InvestigationDetail; batches: BatchListItem[]; experiment: CorrectiveExperiment | null }
  | { status: "missing-investigation" }
  | { status: "missing-experiment" }
  | { status: "error" };

/** `/investigations/<id>/experiments/new?hypothesis=<id>` and `/investigations/<id>/experiments/<experimentId>`. */
export function ExperimentEditor(props: Props) {
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const { investigationId, mode } = props;
  const experimentId = props.mode === "edit" ? props.experimentId : null;

  useEffect(() => {
    let live = true;
    (async (): Promise<Loaded> => {
      try {
        const layer = getDataLayer();
        const detail = await layer.investigations.get(investigationId);
        if (!detail) return { status: "missing-investigation" };
        if (mode === "edit" && experimentId !== null) {
          const experiment = await layer.correctiveExperiments.get(experimentId);
          if (!experiment || experiment.investigationId !== investigationId) return { status: "missing-experiment" };
          return { status: "ok", detail, batches: [], experiment };
        }
        const batches = await layer.batches.list();
        return { status: "ok", detail, batches, experiment: null };
      } catch (error) {
        console.error(error);
        return { status: "error" };
      }
    })().then((result) => {
      if (live) setLoaded(result);
    });
    return () => {
      live = false;
    };
  }, [investigationId, mode, experimentId, reload]);

  const title = mode === "new" ? X.newTitle : X.editTitle;

  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={title} />
        <p role="status" className="text-sm text-text-secondary">
          {X.editorLoading}
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
              {X.retry}
            </Button>
          }
        >
          {X.editorLoadFailed}
        </Notice>
      </>
    );
  }
  if (loaded.status === "missing-investigation" || loaded.status === "missing-experiment") {
    const investigation = loaded.status === "missing-investigation";
    return (
      <>
        <PageHeader title={investigation ? X.investigationMissingTitle : X.experimentMissingTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">
          {investigation ? X.investigationMissingBody : X.experimentMissingBody}
        </p>
        <div className="mt-4">
          <Button asChild>
            {investigation ? (
              <Link href="/investigations">{MESSAGES.candleFixCompare.listTitle}</Link>
            ) : (
              <Link href={investigationHref(investigationId)}>{X.backToInvestigation}</Link>
            )}
          </Button>
        </div>
      </>
    );
  }
  if (props.mode === "new" && loaded.detail.investigation.hypotheses.length === 0) {
    return (
      <>
        <PageHeader title={X.noHypothesesTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{X.noHypothesesBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href={investigationHref(investigationId)}>{X.backToInvestigation}</Link>
          </Button>
        </div>
      </>
    );
  }
  return (
    <EditorForm
      key={`${investigationId}:${experimentId ?? "new"}`}
      loaded={loaded}
      initialHypothesisId={props.mode === "new" ? (props.hypothesisId ?? "") : ""}
    />
  );
}

type OkLoaded = Extract<Loaded, { status: "ok" }>;

type Values = { hypothesisId: string; batchId: string; sessionIds: string[]; change: string; notes: string };
type Errors = Partial<Record<"hypothesisId" | "batchId" | "change" | "notes" | "form", string>>;

function validate(values: Values, editing: boolean): Errors {
  const errors: Errors = {};
  if (!editing) {
    if (!values.hypothesisId) errors.hypothesisId = X.errHypothesis;
    if (!values.batchId) errors.batchId = X.errBatch;
  }
  if (values.change.trim().length > MAX_EXPERIMENT_CHANGE_LENGTH) {
    errors.change = X.errChangeLong(MAX_EXPERIMENT_CHANGE_LENGTH);
  }
  if (values.notes.trim().length > MAX_TRACE_NOTES_LENGTH) errors.notes = X.errNotesLong(MAX_TRACE_NOTES_LENGTH);
  return errors;
}

type SessionsState =
  | { batchId: string; status: "loading" }
  | { batchId: string; status: "error" }
  | { batchId: string; status: "ok"; items: BurnSessionListItem[] };

function short(text: string, max = 90): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function EditorForm({ loaded, initialHypothesisId }: { loaded: OkLoaded; initialHypothesisId: string }) {
  const { detail, experiment } = loaded;
  const { investigation } = detail;
  const editing = experiment !== null;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Chosen once per editor mount and reused on retry, so a retried create writes nothing twice.
  const [experimentId] = useState(() => experiment?.id ?? crypto.randomUUID());
  const [values, setValues] = useState<Values>(() =>
    experiment
      ? {
          hypothesisId: experiment.hypothesisId,
          batchId: experiment.followUpBatchId,
          sessionIds: [...experiment.burnSessionIds],
          change: experiment.change ?? "",
          notes: experiment.notes ?? "",
        }
      : {
          hypothesisId: investigation.hypotheses.some((h) => h.id === initialHypothesisId) ? initialHypothesisId : "",
          batchId: "",
          sessionIds: [],
          change: "",
          notes: "",
        },
  );
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [sessions, setSessions] = useState<SessionsState | null>(null);
  const [sessionsReload, setSessionsReload] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const submitting = useRef(false);

  // The burn tests of the chosen follow-up batch.
  const batchId = values.batchId;
  useEffect(() => {
    if (!batchId) return;
    let live = true;
    getDataLayer()
      .burnSessions.listByBatch(batchId)
      .then((items) => {
        if (live) setSessions({ batchId, status: "ok", items });
      })
      .catch((error) => {
        console.error(error);
        if (live) setSessions({ batchId, status: "error" });
      });
    return () => {
      live = false;
    };
  }, [batchId, sessionsReload]);

  useEffect(() => {
    if (focusTick === 0) return;
    const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    target?.focus();
    target?.scrollIntoView?.({ block: "center" });
  }, [focusTick]);

  const hypothesisOptions = investigation.hypotheses;
  const followUpItem = useMemo(
    () => (experiment ? detail.experiments.find((e) => e.experiment.id === experiment.id)?.followUp : undefined),
    [detail, experiment],
  );

  // Candidate batches: never the investigation's own; the same formula first.
  const { sameFormula, otherFormula } = useMemo(() => {
    const own = investigation.batchId;
    const candidates = loaded.batches.filter((b) => b.batch.id !== own);
    return {
      sameFormula: candidates.filter((b) => b.formula.id === detail.formula.id),
      otherFormula: candidates.filter((b) => b.formula.id !== detail.formula.id),
    };
  }, [loaded.batches, investigation.batchId, detail.formula.id]);

  const sessionsReady = sessions !== null && sessions.batchId === batchId ? sessions : null;

  function check(next: Values, keys: (keyof Errors)[]) {
    const found = validate(next, editing);
    setErrors((prev) => {
      const merged = { ...prev };
      for (const key of keys) {
        if (found[key]) merged[key] = found[key];
        else delete merged[key];
      }
      return merged;
    });
  }

  function change(next: Values, keys: (keyof Errors)[] = []) {
    setValues(next);
    setFailure(null);
    setErrors((prev) => {
      const found = validate(next, editing);
      const merged = { ...prev };
      for (const key of keys) if (merged[key] && !found[key]) delete merged[key];
      delete merged.form;
      return merged;
    });
  }

  function chooseBatch(next: string) {
    // A different batch has different burn tests: nothing stays ticked.
    change({ ...values, batchId: next, sessionIds: [] }, ["batchId"]);
  }

  function toggleSession(id: string, on: boolean) {
    const current = values.sessionIds;
    if (on) {
      if (current.includes(id) || current.length >= MAX_EXPERIMENT_SESSIONS) return;
      change({ ...values, sessionIds: [...current, id] });
    } else {
      change({ ...values, sessionIds: current.filter((s) => s !== id) });
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting.current) return;
    const found = validate(values, editing);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFailure(null);
      setFocusTick((n) => n + 1);
      return;
    }
    // Only burn tests of the loaded list are sent, in the list's order.
    const known = sessionsReady?.status === "ok" ? sessionsReady.items.map((i) => i.session.id) : null;
    const chosen = known ? known.filter((id) => values.sessionIds.includes(id)) : values.sessionIds;
    const change = values.change.trim();
    const notes = values.notes.trim();
    const input = {
      burnSessionIds: chosen,
      ...(change ? { change } : {}),
      ...(notes ? { notes } : {}),
    };
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const layer = getDataLayer();
      if (editing) await layer.correctiveExperiments.update(experimentId, input);
      else {
        await layer.correctiveExperiments.create({
          ...input,
          experimentId,
          investigationId: investigation.id,
          hypothesisId: values.hypothesisId,
          followUpBatchId: values.batchId,
        });
      }
      router.replace(`${investigationHref(investigation.id)}?saved=experiment`);
      // Stay busy while the page changes.
    } catch (error) {
      submitting.current = false;
      setBusy(false);
      const code = error instanceof DataError ? error.code : undefined;
      if (code === "not-found") {
        setGone(true);
        setFailure(X.saveGone);
      } else if (code === "invalid") setFailure(X.saveInvalid);
      else if (code === "storage-full") setFailure(X.saveStorageFull);
      else setFailure(X.saveFailed);
    }
  }

  const backHref = investigationHref(investigation.id);
  const investigationName = investigation.title?.trim() || detail.batch.label?.trim() || batchTitle(detail.batch);
  const atLimit = values.sessionIds.length >= MAX_EXPERIMENT_SESSIONS;

  const optionText = (b: BatchListItem) =>
    X.batchOption(batchTitle(b.batch), b.formula.name, b.version.number, formatProducedOn(b.batch.producedOn));

  return (
    <>
      <PageHeader
        title={editing ? X.editTitle : X.newTitle}
        description={editing ? X.editDescription(investigationName) : X.newDescription(investigationName)}
      />
      <form ref={formRef} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-8">
        <div className="grid max-w-xl gap-4">
          {editing ? (
            <>
              <ReadOnly label={X.hypothesisField} testId="experiment-hypothesis">
                {(() => {
                  const hypothesis = hypothesisOptions.find((h) => h.id === values.hypothesisId);
                  return hypothesis ? (
                    <>
                      <span className="wrap-anywhere">
                        <span className="font-semibold">{F.hypothesisLabel}: </span>
                        {hypothesis.text}
                      </span>
                      <span className="block text-text-secondary">{statusLabel(hypothesis.status)}</span>
                    </>
                  ) : (
                    <span className="text-text-secondary">{X.hypothesisGone}</span>
                  );
                })()}
              </ReadOnly>
              <ReadOnly label={X.batchField} testId="experiment-batch">
                {followUpItem ? (
                  <>
                    <Link
                      href={`/batches/${followUpItem.batch.id}`}
                      className="text-primary underline-offset-4 wrap-anywhere hover:underline"
                    >
                      {batchTitle(followUpItem.batch)}
                    </Link>
                    <span className="block text-text-secondary">
                      {followUpItem.formula.name}
                      {X.separator}
                      {X.versionText(followUpItem.version.number)}
                      {X.separator}
                      {formatProducedOn(followUpItem.batch.producedOn)}
                    </span>
                  </>
                ) : (
                  <span className="text-text-secondary">{X.saveGone}</span>
                )}
              </ReadOnly>
              <p className="text-sm text-text-secondary">{X.fixedNote}</p>
            </>
          ) : (
            <>
              <Field label={X.hypothesisField} error={errors.hypothesisId}>
                {(c) => (
                  <select
                    {...c}
                    className={SELECT_CLASS}
                    value={values.hypothesisId}
                    onChange={(e) => change({ ...values, hypothesisId: e.target.value }, ["hypothesisId"])}
                    onBlur={() => check(values, ["hypothesisId"])}
                  >
                    <option value="">{X.hypothesisPlaceholder}</option>
                    {hypothesisOptions.map((h) => (
                      <option key={h.id} value={h.id}>
                        {short(h.text)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label={X.batchField}
                hint={sameFormula.length + otherFormula.length === 0 ? X.batchesNone : X.batchHint}
                error={errors.batchId}
              >
                {(c) => (
                  <select
                    {...c}
                    className={SELECT_CLASS}
                    value={values.batchId}
                    onChange={(e) => chooseBatch(e.target.value)}
                    onBlur={() => check(values, ["batchId"])}
                  >
                    <option value="">{X.batchPlaceholder}</option>
                    {sameFormula.length > 0 ? (
                      <optgroup label={X.batchGroupSameFormula}>
                        {sameFormula.map((b) => (
                          <option key={b.batch.id} value={b.batch.id}>
                            {optionText(b)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {otherFormula.length > 0 ? (
                      <optgroup label={X.batchGroupOtherFormula}>
                        {otherFormula.map((b) => (
                          <option key={b.batch.id} value={b.batch.id}>
                            {optionText(b)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                )}
              </Field>
            </>
          )}
        </div>

        <fieldset className="grid max-w-xl min-w-0 gap-2" data-testid="experiment-burn-tests">
          <legend className="text-base font-semibold">{X.burnTestsLegend}</legend>
          <p className="text-sm text-text-secondary">{X.burnTestsHint(MAX_EXPERIMENT_SESSIONS)}</p>
          {!batchId ? (
            <p className="text-sm text-text-secondary">{X.burnTestsChooseBatch}</p>
          ) : sessionsReady === null || sessionsReady.status === "loading" ? (
            <p role="status" className="text-sm text-text-secondary">
              {X.editorLoading}
            </p>
          ) : sessionsReady.status === "error" ? (
            <Notice
              variant="error"
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => setSessionsReload((n) => n + 1)}>
                  {X.retry}
                </Button>
              }
            >
              {X.editorLoadFailed}
            </Notice>
          ) : sessionsReady.items.length === 0 ? (
            <p className="text-sm text-text-secondary">{X.burnTestsNone}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sessionsReady.items.map((item) => {
                const id = item.session.id;
                const checked = values.sessionIds.includes(id);
                const inputId = `experiment-session-${id}`;
                return (
                  <li key={id}>
                    <label
                      htmlFor={inputId}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-1"
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        className="size-5 shrink-0 accent-primary"
                        checked={checked}
                        disabled={!checked && atLimit}
                        onChange={(e) => toggleSession(id, e.target.checked)}
                      />
                      <span className="min-w-0 text-sm wrap-anywhere">
                        {sessionTitle(item.session)}
                        <span className="block text-text-secondary tabular-nums">
                          {formatProducedOn(item.session.testedOn)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {atLimit ? <p className="text-sm text-text-secondary">{X.burnTestsLimit(MAX_EXPERIMENT_SESSIONS)}</p> : null}
        </fieldset>

        <div className="grid max-w-xl gap-4">
          <Field label={X.changeField} hint={X.changeHint} error={errors.change}>
            {(c) => (
              <Textarea
                {...c}
                rows={3}
                value={values.change}
                onChange={(e) => change({ ...values, change: e.target.value }, ["change"])}
                onBlur={() => check(values, ["change"])}
              />
            )}
          </Field>
          <Field label={X.notesField} error={errors.notes}>
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
        </div>

        <div aria-live="polite" className="flex max-w-xl flex-col gap-3 empty:hidden">
          {Object.keys(errors).some((k) => k !== "form") ? <Notice variant="error">{X.errCheckFields}</Notice> : null}
          {failure ? (
            <Notice
              variant="error"
              action={
                gone ? (
                  <Button asChild variant="link" size="sm">
                    <Link href="/batches">{X.backToBatches}</Link>
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => void submit()}>
                    {X.retry}
                  </Button>
                )
              }
            >
              {failure}
            </Notice>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" busy={busy} className="pointer-coarse:min-h-11">
            {X.save}
          </Button>
          <Button asChild variant="secondary" className="pointer-coarse:min-h-11">
            <Link href={backHref}>{X.cancel}</Link>
          </Button>
          {editing ? (
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:min-h-11 sm:ml-auto"
              onClick={() => setDeleteOpen(true)}
            >
              {X.deleteButton}
            </Button>
          ) : null}
        </div>
      </form>
      {editing ? (
        <DeleteDialog
          experimentId={experimentId}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => router.replace(backHref)}
        />
      ) : null}
    </>
  );
}

function ReadOnly({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <div data-testid={testId} className="grid gap-1 rounded-md border border-border bg-muted p-3 text-sm">
      <span className="font-semibold text-text-secondary">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function DeleteDialog({
  experimentId,
  open,
  onOpenChange,
  onDeleted,
}: {
  experimentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);

  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await getDataLayer().correctiveExperiments.delete(experimentId);
      onDeleted();
    } catch (error) {
      if (error instanceof DataError && error.code === "not-found") {
        onDeleted();
        return;
      }
      setFailed(true);
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{X.deleteTitle}</DialogTitle>
          <DialogDescription>{X.deleteBody}</DialogDescription>
        </DialogHeader>
        {failed ? <Notice variant="error">{X.deleteFailed}</Notice> : null}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {X.deleteKeep}
          </Button>
          <Button type="button" variant="destructive" busy={busy} onClick={confirm}>
            {X.deleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
