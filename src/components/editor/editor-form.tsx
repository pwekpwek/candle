"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleAlertIcon } from "lucide-react";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { SegmentedControl } from "@/components/common/segmented-control";
import { MaterialPicker } from "@/components/materials";
import { PlanSummaryLine, ResultsPanel } from "@/components/results";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDataLayer } from "@/lib/db";
import {
  LIMITS,
  PRECISIONS,
  evaluateFormula,
  formatGrams,
  parseFixed,
  precisionLabel,
  sizingTotalMg,
} from "@/lib/gramguard";
import type {
  BlendRowFields,
  EditorFields,
  Issue,
  MaterialInfo,
  MaterialLookup,
} from "@/lib/gramguard";
import { MESSAGES, basisExplanation, basisWords, messageForIssue } from "@/lib/messages";
import type { Basis, PrecisionMg, SizingMode } from "@/lib/types";
import { formatDraftTime } from "./draft-time";
import { newRowId, type EditorStart } from "./load-editor";
import { NumberField } from "./number-field";

const E = MESSAGES.editor;
const AUTOSAVE_MS = 500;

type BlendKind = "waxes" | "oils";

/** Shown under a field as plain error text, tied to it with aria-describedby. */
function IssueText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-destructive">
      <CircleAlertIcon aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Moves focus to the element a data-field key names (or the first control inside it). */
function focusField(root: HTMLElement | null, key: string) {
  if (!root) return;
  const holder = Array.from(root.querySelectorAll<HTMLElement>("[data-field]")).find(
    (el) => el.dataset.field === key,
  );
  if (!holder) return;
  const target = holder.matches("input,select,textarea,button,[tabindex]")
    ? holder
    : holder.querySelector<HTMLElement>("select,input,textarea,button,[tabindex]");
  if (!target) return;
  target.focus();
  // focus() does nothing when the field already has focus (Save keeps focus
  // where it was), so bring the problem into view explicitly. jsdom has no
  // scrollIntoView.
  target.scrollIntoView?.({ block: "center" });
}

export function EditorForm({ start }: { start: EditorStart }) {
  const router = useRouter();
  const revise = start.mode === "revise";
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [fields, setFields] = useState<EditorFields>(start.fields);
  const [touched, setTouched] = useState<Record<string, true>>({});
  const [submitted, setSubmitted] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(start.restoredAt);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // One id per editor instance, reused on every attempt and retry (PRD-19).
  const [versionId] = useState(() => crypto.randomUUID());
  const [newFormulaId] = useState(() => crypto.randomUUID());

  // ───────────────────────── Live evaluation ─────────────────────────

  const materials = useLiveQuery(async () => {
    try {
      return await getDataLayer().materials.list({ includeArchived: true });
    } catch {
      return [];
    }
  }, []);

  const lookup: MaterialLookup = useMemo(() => {
    const map = new Map<string, MaterialInfo>();
    for (const m of materials ?? []) {
      map.set(m.id, {
        id: m.id,
        type: m.type,
        name: m.name,
        maxFragranceBp: m.wax?.maxFragranceBp,
        maxFragranceBasis: m.wax?.maxFragranceBasis,
      });
    }
    return (id: string) => map.get(id);
  }, [materials]);

  const evaluation = useMemo(() => evaluateFormula(fields, lookup), [fields, lookup]);

  const issueByField = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of evaluation.issues) if (!map.has(issue.field)) map.set(issue.field, issue);
    return map;
  }, [evaluation.issues]);

  const resultErrors = useMemo(
    () => evaluation.issues.filter((i) => i.field === "result"),
    [evaluation.issues],
  );
  const fragranceWarnings = useMemo(
    () => evaluation.warnings.filter((i) => i.rule === "V-08" || i.rule === "V-09"),
    [evaluation.warnings],
  );
  const panelWarnings = useMemo(
    () => evaluation.warnings.filter((i) => i.rule === "CALC-13" || i.rule === "CALC-17"),
    [evaluation.warnings],
  );
  const names = useMemo(() => {
    const record: Record<string, string> = {};
    for (const row of [...fields.waxes, ...fields.oils]) {
      if (row.materialId) record[row.rowId] = lookup(row.materialId)?.name ?? "";
    }
    return record;
  }, [fields.waxes, fields.oils, lookup]);

  // ───────────────────────── Validation display ─────────────────────────

  /** The message for a field, once it has been blurred or Save was pressed. */
  const messageFor = (key: string): string | undefined => {
    if (!submitted && !touched[key]) return undefined;
    const issue = issueByField.get(key);
    return issue ? messageForIssue(issue) : undefined;
  };
  const touch = (key: string) =>
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));

  // ───────────────────────── Field updates ─────────────────────────

  const patch = (p: Partial<EditorFields>) => setFields((f) => ({ ...f, ...p }));
  const updateRow = (kind: BlendKind, rowId: string, p: Partial<BlendRowFields>) =>
    setFields((f) => ({
      ...f,
      [kind]: f[kind].map((r) => (r.rowId === rowId ? { ...r, ...p } : r)),
    }));
  const addRow = (kind: BlendKind) =>
    setFields((f) => ({
      ...f,
      [kind]: [...f[kind], { rowId: newRowId(), materialId: null, parts: "" }],
    }));
  const removeRow = (kind: BlendKind, rowId: string) => {
    setFields((f) => ({ ...f, [kind]: f[kind].filter((r) => r.rowId !== rowId) }));
    // Taking the last oil away leaves the blend itself to explain (V-11).
    if (kind === "oils") touch("oils");
  };

  // ───────────────────────── Drafts (PRD-13) ─────────────────────────

  const pristineJson = useMemo(() => JSON.stringify(start.pristine), [start.pristine]);
  const fieldsRef = useRef(fields);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const saveInFlight = useRef(false);
  const finished = useRef(false);
  const draftStored = useRef(start.restoredAt !== null);
  const lastWritten = useRef<string | null>(
    start.restoredAt !== null ? JSON.stringify(start.fields) : null,
  );

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const writeDraft = useCallback(async () => {
    timer.current = null;
    if (!pending.current || saveInFlight.current || finished.current) return;
    pending.current = false;
    const current = fieldsRef.current;
    try {
      await getDataLayer().drafts.put(start.draftKey, start.baseVersionId, current);
      lastWritten.current = JSON.stringify(current);
      draftStored.current = true;
    } catch {
      // A draft failure never interrupts typing or the live results.
    }
  }, [start.draftKey, start.baseVersionId]);

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const scheduleDraft = useCallback(() => {
    pending.current = true;
    cancelTimer();
    timer.current = setTimeout(() => void writeDraft(), AUTOSAVE_MS);
  }, [cancelTimer, writeDraft]);

  useEffect(() => {
    const json = JSON.stringify(fields);
    if (json === pristineJson) {
      // Back to the starting point: nothing to keep.
      cancelTimer();
      pending.current = false;
      if (draftStored.current && !saveInFlight.current && !finished.current) {
        draftStored.current = false;
        lastWritten.current = null;
        void getDataLayer()
          .drafts.delete(start.draftKey)
          .catch(() => undefined);
      }
      return;
    }
    if (json === lastWritten.current) return;
    scheduleDraft();
  }, [fields, pristineJson, cancelTimer, scheduleDraft, start.draftKey]);

  useEffect(() => {
    const flush = () => {
      cancelTimer();
      void writeDraft();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [cancelTimer, writeDraft]);

  async function discardDraft() {
    cancelTimer();
    pending.current = false;
    draftStored.current = false;
    lastWritten.current = null;
    setFields(start.pristine);
    setTouched({});
    setSubmitted(false);
    setRestoredAt(null);
    try {
      await getDataLayer().drafts.delete(start.draftKey);
    } catch {
      // Nothing more to do: the editor is already back to its starting state.
    }
  }

  // The cursor starts in the name field of a new formula (F1 step 1).
  useEffect(() => {
    if (!revise) nameRef.current?.focus();
  }, [revise]);

  // ───────────────────────── Save (PRD-14, PRD-19, FLOW-07) ─────────────────────────

  const saveGuard = useRef(false);

  /** Field keys in screen order, for moving focus to the first problem. */
  function screenOrder(): string[] {
    const keys: string[] = [];
    if (!revise) keys.push("name");
    if (fields.sizingMode === "vessels") keys.push("vesselCount", "fillWeight");
    else keys.push("amount");
    keys.push("fragrancePct", "waxes");
    for (const r of fields.waxes) keys.push(`waxes.${r.rowId}.material`, `waxes.${r.rowId}.parts`);
    keys.push("oils");
    for (const r of fields.oils) keys.push(`oils.${r.rowId}.material`, `oils.${r.rowId}.parts`);
    keys.push("result");
    return keys;
  }

  async function save() {
    if (saveGuard.current) return;
    setSubmitted(true);
    const input = evaluation.input;
    if (!input) {
      const first = screenOrder().find((key) => issueByField.has(key));
      const fallback = evaluation.issues[0]?.field;
      focusField(rootRef.current, first ?? fallback ?? "name");
      return;
    }
    saveGuard.current = true;
    saveInFlight.current = true;
    cancelTimer();
    pending.current = false;
    setSaving(true);
    setSaveFailed(false);
    try {
      const { formula, version } = await getDataLayer().versions.save({
        versionId,
        target: revise
          ? { kind: "existing", formulaId: start.draftKey }
          : { kind: "new", formulaId: newFormulaId },
        origin: revise ? "revision" : "initial",
        parentVersionId: revise ? start.baseVersionId : null,
        scale: null,
        input,
        draftKey: start.draftKey,
      });
      finished.current = true;
      router.replace(`/formulas/${formula.id}?saved=${version.number}`);
    } catch {
      saveGuard.current = false;
      saveInFlight.current = false;
      setSaving(false);
      setSaveFailed(true);
      // The draft stays, and typing since the last write is kept too.
      if (JSON.stringify(fieldsRef.current) !== lastWritten.current) scheduleDraft();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  // ───────────────────────── Derived display ─────────────────────────

  const vessels = fields.sizingMode === "vessels";
  let derivedTotal: string | null = null;
  if (vessels && !issueByField.has("vesselCount") && !issueByField.has("fillWeight")) {
    const count = parseFixed(fields.vesselCount, 0);
    const fill = parseFixed(fields.fillWeight, 3);
    if (count.ok && fill.ok) {
      const total = sizingTotalMg({ mode: "vessels", count: count.value, fillMg: fill.value });
      if (total !== null) derivedTotal = formatGrams(total, fields.precisionMg);
    }
  }

  let explanation: string | null = null;
  if (!issueByField.has("fragrancePct")) {
    const pct = parseFixed(fields.fragrancePct, 2);
    if (pct.ok) explanation = basisExplanation(pct.value, fields.basis);
  }

  const modeOptions: { value: SizingMode; label: string }[] = [
    { value: "total", label: E.modeTotal },
    { value: "vessels", label: E.modeVessels },
    { value: "wax", label: E.modeWax },
  ];
  const basisOptions: { value: Basis; label: string }[] = [
    { value: "wax", label: basisWords("wax") },
    { value: "total", label: basisWords("total") },
  ];
  const precisionOptions = PRECISIONS.map((mg) => ({
    value: String(mg),
    label: precisionLabel(mg),
  }));

  // ───────────────────────── Blend rows ─────────────────────────

  function renderBlend(kind: BlendKind) {
    const rows = fields[kind];
    const isWax = kind === "waxes";
    const max = isWax ? LIMITS.maxWaxes : LIMITS.maxOils;
    const many = rows.length > 1;
    const type = isWax ? "wax" : "fragranceOil";
    const blendMessage = messageFor(kind);
    const blendErrorId = `${kind}-blend-error`;
    return (
      <div className="flex flex-col gap-3" data-field={kind}>
        {blendMessage ? <IssueText id={blendErrorId}>{blendMessage}</IssueText> : null}
        {rows.map((row, index) => {
          const base = isWax ? E.waxLabel : E.oilLabel;
          const label = isWax && !many ? base : `${base} ${index + 1}`;
          const materialKey = `${kind}.${row.rowId}.material`;
          const partsKey = `${kind}.${row.rowId}.parts`;
          const materialMessage = messageFor(materialKey);
          const materialErrorId = `${kind}-${row.rowId}-material-error`;
          const canRemove = isWax ? many : true;
          const excludeIds = rows
            .filter((r) => r.rowId !== row.rowId && r.materialId !== null)
            .map((r) => r.materialId as string);
          return (
            <div
              key={row.rowId}
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <div data-field={materialKey}>
                <MaterialPicker
                  type={type}
                  label={label}
                  value={row.materialId}
                  excludeIds={excludeIds}
                  invalid={materialMessage !== undefined}
                  describedBy={materialMessage ? materialErrorId : undefined}
                  onChange={(id) => {
                    updateRow(kind, row.rowId, { materialId: id });
                    touch(materialKey);
                  }}
                />
                {materialMessage ? (
                  <div className="mt-1">
                    <IssueText id={materialErrorId}>{materialMessage}</IssueText>
                  </div>
                ) : null}
              </div>
              {many || canRemove ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {many ? (
                    <NumberField
                      className="w-32"
                      label={E.partsLabel}
                      ariaLabel={`${E.partsLabel} (${label})`}
                      dataField={partsKey}
                      value={row.parts}
                      onChange={(parts) => updateRow(kind, row.rowId, { parts })}
                      onBlur={() => touch(partsKey)}
                      error={messageFor(partsKey)}
                    />
                  ) : (
                    <span />
                  )}
                  {canRemove ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="pointer-coarse:min-h-11"
                      aria-label={`${E.remove} ${label}`}
                      onClick={() => removeRow(kind, row.rowId)}
                    >
                      {E.remove}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {rows.length < max ? (
          <div>
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-10 px-0 pointer-coarse:min-h-11"
              onClick={() => addRow(kind)}
            >
              {isWax ? E.addAnotherWax : E.addOil}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  // ───────────────────────── Layout ─────────────────────────

  const title = revise ? (start.formulaName ?? E.reviseTitle) : E.title;
  const description = revise ? E.reviseDescription : E.newDescription;

  return (
    <div ref={rootRef}>
      <PageHeader title={title} description={description} />
      <div className="pb-36 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 lg:pb-0 xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-8">
        <form noValidate onSubmit={onSubmit} className="flex min-w-0 flex-col gap-6">
          {revise && start.revising ? (
            <Notice variant="info">
              {E.revising(start.revising.fromNumber, start.revising.nextNumber)}
            </Notice>
          ) : null}

          {restoredAt !== null ? (
            <Notice
              variant="info"
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => void discardDraft()}>
                  {E.discard}
                </Button>
              }
            >
              {E.draftRestored(formatDraftTime(restoredAt))}
            </Notice>
          ) : null}

          {!revise ? (
            <Field label={E.nameLabel} error={messageFor("name")}>
              {(c) => (
                <Input
                  {...c}
                  ref={nameRef}
                  type="text"
                  autoComplete="off"
                  data-field="name"
                  value={fields.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  onBlur={() => touch("name")}
                />
              )}
            </Field>
          ) : null}

          <section className="flex flex-col gap-3">
            <span aria-hidden="true" className="text-sm font-semibold text-foreground">
              {E.batchSizeLabel}
            </span>
            <SegmentedControl
              label={E.batchSizeLabel}
              options={modeOptions}
              value={fields.sizingMode}
              onChange={(sizingMode) => patch({ sizingMode })}
            />
            {vessels ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label={E.vesselCountLabel}
                    inputMode="numeric"
                    dataField="vesselCount"
                    value={fields.vesselCount}
                    onChange={(vesselCount) => patch({ vesselCount })}
                    onBlur={() => touch("vesselCount")}
                    error={messageFor("vesselCount")}
                  />
                  <NumberField
                    label={E.fillWeightLabel}
                    unit="g"
                    dataField="fillWeight"
                    value={fields.fillWeight}
                    onChange={(fillWeight) => patch({ fillWeight })}
                    onBlur={() => touch("fillWeight")}
                    error={messageFor("fillWeight")}
                  />
                </div>
                {derivedTotal ? (
                  <p className="tabular text-sm text-text-secondary">
                    {`= ${derivedTotal} ${E.derivedTotalSuffix}`}
                  </p>
                ) : null}
              </>
            ) : (
              <NumberField
                label={E.amountLabel[fields.sizingMode === "wax" ? "wax" : "total"]}
                unit="g"
                dataField="amount"
                value={fields.amount}
                onChange={(amount) => patch({ amount })}
                onBlur={() => touch("amount")}
                error={messageFor("amount")}
              />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">{E.fragranceLabel}</h2>
            <NumberField
              label={E.fragrancePctLabel}
              unit="%"
              dataField="fragrancePct"
              value={fields.fragrancePct}
              onChange={(fragrancePct) => patch({ fragrancePct })}
              onBlur={() => touch("fragrancePct")}
              error={messageFor("fragrancePct")}
            />
            <div className="flex flex-col gap-1">
              <span aria-hidden="true" className="text-sm font-semibold text-foreground">
                {E.basisLabel}
              </span>
              <SegmentedControl
                label={E.basisLabel}
                options={basisOptions}
                value={fields.basis}
                onChange={(basis) => patch({ basis })}
              />
            </div>
            {explanation ? (
              <p data-testid="basis-explanation" className="text-sm text-text-secondary">
                {explanation}
              </p>
            ) : null}
            {fragranceWarnings.map((issue, i) => (
              <Notice key={`${issue.rule}-${i}`} variant="warning">
                {messageForIssue(issue)}
              </Notice>
            ))}
            <div className="flex flex-col gap-1">
              <span aria-hidden="true" className="text-sm font-semibold text-foreground">
                {E.precisionLabel}
              </span>
              <SegmentedControl
                label={E.precisionLabel}
                options={precisionOptions}
                value={String(fields.precisionMg)}
                onChange={(mg) => patch({ precisionMg: Number(mg) as PrecisionMg })}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">{renderBlend("waxes")}</section>

          <section aria-labelledby="oils-heading" className="flex flex-col gap-3">
            <h2 id="oils-heading" className="text-base font-semibold text-foreground">
              {E.oilsLabel}
            </h2>
            {renderBlend("oils")}
          </section>

          <section className="flex flex-col gap-4">
            <MaterialPicker
              type="wick"
              label={`${E.wickLabel} (${E.optional})`}
              allowNone
              value={fields.wickId}
              onChange={(wickId) => patch({ wickId })}
            />
            <MaterialPicker
              type="vessel"
              label={`${E.vesselLabel} (${E.optional})`}
              allowNone
              value={fields.vesselId}
              onChange={(vesselId) => patch({ vesselId })}
            />
            <Field label={E.notesLabel}>
              {(c) => (
                <Textarea
                  {...c}
                  value={fields.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                />
              )}
            </Field>
            {revise ? (
              <Field label={`${E.whatChanged} (${E.optional})`}>
                {(c) => (
                  <Input
                    {...c}
                    type="text"
                    autoComplete="off"
                    value={fields.changeNote}
                    onChange={(e) => patch({ changeNote: e.target.value })}
                  />
                )}
              </Field>
            ) : null}
          </section>

          {/* Fixed above the phone nav below 1024px; inline after the notes from there up. */}
          <div className="fixed inset-x-0 bottom-[var(--bottom-bar-height)] z-30 flex flex-col gap-2 border-t border-border bg-card px-4 py-3 sm:bottom-0 sm:left-16 sm:px-6 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0">
            {saveFailed ? (
              <Notice
                variant="error"
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => void save()}>
                    {E.retry}
                  </Button>
                }
              >
                {E.saveFailed}
              </Notice>
            ) : null}
            <PlanSummaryLine plan={evaluation.plan} className="text-sm text-foreground lg:hidden" />
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                busy={saving}
                className="min-w-40 flex-1 pointer-coarse:min-h-11 lg:flex-none"
                onMouseDown={(event) => event.preventDefault()}
              >
                {E.saveFormula}
              </Button>
              <Button asChild variant="ghost" className="pointer-coarse:min-h-11">
                <Link href={revise ? `/formulas/${start.draftKey}` : "/"}>{E.cancel}</Link>
              </Button>
            </div>
          </div>
        </form>

        <div className="mt-6 min-w-0 lg:sticky lg:top-8 lg:mt-0 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto">
          <div data-field="result" tabIndex={-1} className="rounded-xl outline-none">
            <ResultsPanel
              plan={evaluation.plan}
              names={names}
              errors={resultErrors}
              warnings={panelWarnings}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
