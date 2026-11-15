"use client";

import { useRef, useState, type FormEvent } from "react";
import { Notice } from "@/components/common/notice";
import { Field } from "@/components/common/field";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { Basis, Material, MaterialType } from "@/lib/types";
import {
  FIELD_ORDER,
  emptyValues,
  toInput,
  validateAll,
  validateField,
  valuesFromMaterial,
  type FieldKey,
  type FormErrors,
  type FormValues,
} from "./form-model";

const M = MESSAGES.materials;

const TYPE_ORDER: readonly MaterialType[] = ["wax", "fragranceOil", "wick", "vessel"];

/** Same look as Input, for the native basis select. */
const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none aria-invalid:border-destructive";

export type FormTarget =
  | { kind: "add"; type: MaterialType | null }
  | { kind: "edit"; material: Material };

export type FormOutcome =
  | { kind: "added"; material: Material }
  | { kind: "edited"; material: Material }
  | { kind: "archived"; material: Material }
  | { kind: "unarchived"; material: Material };

interface MaterialFormProps {
  target: FormTarget;
  /** Formulas that use this material (edit only). */
  usedIn: number;
  onDone: (outcome: FormOutcome) => void;
  onCancel: () => void;
}

type Register = (key: FieldKey) => (element: HTMLElement | null) => void;
type SetValue = <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;

/** Add and edit share this form (F8). Rendered inside the drawer or sheet. */
export function MaterialForm({ target, usedIn, onDone, onCancel }: MaterialFormProps) {
  const editing = target.kind === "edit" ? target.material : null;
  const [values, setValues] = useState<FormValues>(() =>
    editing
      ? valuesFromMaterial(editing)
      : emptyValues(target.kind === "add" ? (target.type ?? "wax") : "wax"),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [showFix, setShowFix] = useState(false);
  const [busy, setBusy] = useState<"save" | "archive" | null>(null);
  const inFlight = useRef(false);
  const refs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});

  const chooseType = target.kind === "add" && target.type === null;
  const archived = editing !== null && editing.archivedAt !== null;

  const register: Register = (key) => (element) => {
    refs.current[key] = element;
  };

  const set: SetValue = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    // FLOW-06: an error clears on the next valid keystroke.
    if (key in errors && !validateField(next, key as FieldKey)) {
      setErrors((current) => {
        const rest = { ...current };
        delete rest[key as FieldKey];
        return rest;
      });
    }
  };

  function blur(key: FieldKey) {
    const message = validateField(values, key);
    setErrors((current) => {
      const rest = { ...current };
      if (message) rest[key] = message;
      else delete rest[key];
      return rest;
    });
  }

  async function run(kind: "save" | "archive", work: () => Promise<FormOutcome>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setFailure(null);
    try {
      onDone(await work());
    } catch {
      setFailure(kind === "save" ? M.saveFailed : M.archiveFailed);
      inFlight.current = false;
      setBusy(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const found = validateAll(values);
    setErrors(found);
    const first = FIELD_ORDER.find((key) => found[key]);
    if (first) {
      setShowFix(true);
      refs.current[first]?.focus();
      return;
    }
    setShowFix(false);
    const input = toInput(values);
    void run("save", async () => {
      const repo = getDataLayer().materials;
      if (editing) return { kind: "edited", material: await repo.update(editing.id, input) };
      return { kind: "added", material: await repo.create(input) };
    });
  }

  function toggleArchive() {
    if (!editing) return;
    void run("archive", async () => {
      const material = await getDataLayer().materials.setArchived(editing.id, !archived);
      return { kind: archived ? "unarchived" : "archived", material };
    });
  }

  const typeOptions = TYPE_ORDER.map((type) => ({ value: type, label: M.typeTag[type] }));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
      {failure ? (
        <Notice variant="error" title={M.saveFailedTitle}>
          {failure}
        </Notice>
      ) : null}
      {showFix && Object.keys(errors).length > 0 ? (
        <Notice variant="warning">{M.fixFirst}</Notice>
      ) : null}

      {chooseType ? (
        <div className="flex flex-col gap-1">
          <span aria-hidden="true" className="text-sm font-semibold text-foreground">
            {M.typeChoiceLabel}
          </span>
          <SegmentedControl
            label={M.typeChoiceLabel}
            options={typeOptions}
            value={values.type}
            onChange={(type) => set("type", type)}
          />
        </div>
      ) : null}

      <Field label={M.nameLabel} error={errors.name}>
        {(c) => (
          <Input
            {...c}
            ref={register("name")}
            autoComplete="off"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => blur("name")}
          />
        )}
      </Field>

      <Field label={M.supplierLabel}>
        {(c) => (
          <Input
            {...c}
            ref={register("supplier")}
            autoComplete="off"
            value={values.supplier}
            onChange={(e) => set("supplier", e.target.value)}
          />
        )}
      </Field>

      {values.type === "wax" ? (
        <WaxFields values={values} errors={errors} register={register} set={set} blur={blur} />
      ) : null}

      {values.type === "wick" ? (
        <Field label={M.wickSizeLabel}>
          {(c) => (
            <Input
              {...c}
              ref={register("wickSize")}
              autoComplete="off"
              value={values.wickSize}
              onChange={(e) => set("wickSize", e.target.value)}
            />
          )}
        </Field>
      ) : null}

      {values.type === "vessel" ? (
        <>
          <Field label={M.capacityLabel} error={errors.capacity} unit="mL">
            {(c) => (
              <Input
                {...c}
                ref={register("capacity")}
                inputMode="numeric"
                autoComplete="off"
                value={values.capacity}
                onChange={(e) => set("capacity", e.target.value)}
                onBlur={() => blur("capacity")}
                className="text-right tabular-nums"
              />
            )}
          </Field>
          <Field label={M.defaultFillLabel} error={errors.defaultFill} unit="g">
            {(c) => (
              <Input
                {...c}
                ref={register("defaultFill")}
                inputMode="decimal"
                autoComplete="off"
                value={values.defaultFill}
                onChange={(e) => set("defaultFill", e.target.value)}
                onBlur={() => blur("defaultFill")}
                className="text-right tabular-nums"
              />
            )}
          </Field>
        </>
      ) : null}

      <Field label={M.notesLabel}>
        {(c) => (
          <Textarea
            {...c}
            ref={register("notes")}
            rows={3}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        )}
      </Field>

      {editing && archived ? <Notice variant="info">{M.archivedNotice}</Notice> : null}
      {editing && usedIn > 0 ? (
        <p className="text-sm text-text-secondary">{M.archiveUsedIn(usedIn)}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {/*
          Pressing Save must not blur the field being edited first: the blur
          would show that field's message, move this button down, and the
          click would land on nothing. Submit validates every field anyway.
        */}
        <Button
          type="submit"
          busy={busy === "save"}
          onMouseDown={(event) => event.preventDefault()}
        >
          {M.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {M.cancel}
        </Button>
        {editing ? (
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            busy={busy === "archive"}
            onClick={toggleArchive}
          >
            {archived ? M.unarchive : M.archive}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function WaxFields({
  values,
  errors,
  register,
  set,
  blur,
}: {
  values: FormValues;
  errors: FormErrors;
  register: Register;
  set: SetValue;
  blur: (key: FieldKey) => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Field label={M.supplierMaxLabel} error={errors.maxFragrance} unit="%" className="sm:flex-1">
        {(c) => (
          <Input
            {...c}
            ref={register("maxFragrance")}
            inputMode="decimal"
            autoComplete="off"
            value={values.maxFragrance}
            onChange={(e) => set("maxFragrance", e.target.value)}
            onBlur={() => blur("maxFragrance")}
            className="text-right tabular-nums"
          />
        )}
      </Field>
      <Field label={M.basisLabel} className="sm:flex-1">
        {(c) => (
          <select
            {...c}
            className={SELECT_CLASS}
            value={values.basis}
            onChange={(e) => set("basis", e.target.value as Basis)}
          >
            <option value="wax">{M.basisWax}</option>
            <option value="total">{M.basisTotal}</option>
          </select>
        )}
      </Field>
    </div>
  );
}
