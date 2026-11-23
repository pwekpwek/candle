"use client";

import { useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { Supplier } from "@/lib/types";
import {
  SUPPLIER_FIELD_ORDER,
  emptySupplierValues,
  supplierValuesFrom,
  toSupplierInput,
  validateSupplier,
  validateSupplierField,
  type SupplierContext,
  type SupplierErrors,
  type SupplierFieldKey,
  type SupplierValues,
} from "./form-model";
import { codeOf } from "./shared";

const S = MESSAGES.suppliers;

export type SupplierOutcome = { kind: "added" | "edited"; supplier: Supplier };

interface SupplierFormProps {
  /** The supplier being edited, or null to add. */
  editing: Supplier | null;
  /** Every supplier (archived included), for the duplicate name check. */
  suppliers: readonly Supplier[];
  onDone: (outcome: SupplierOutcome) => void;
  onCancel: () => void;
}

/** Add and edit a supplier. Rendered inside the editor sheet. */
export function SupplierForm({ editing, suppliers, onDone, onCancel }: SupplierFormProps) {
  const [values, setValues] = useState<SupplierValues>(() =>
    editing ? supplierValuesFrom(editing) : emptySupplierValues(),
  );
  const [errors, setErrors] = useState<SupplierErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [showFix, setShowFix] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const refs = useRef<Partial<Record<SupplierFieldKey, HTMLElement | null>>>({});
  const ctx: SupplierContext = { suppliers, editingId: editing?.id ?? null };

  function set(key: SupplierFieldKey, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    // An error clears on the next valid keystroke.
    if (key in errors && !validateSupplierField(next, key, ctx)) {
      setErrors((current) => {
        const rest = { ...current };
        delete rest[key];
        return rest;
      });
    }
  }

  function blur(key: SupplierFieldKey) {
    const message = validateSupplierField(values, key, ctx);
    setErrors((current) => {
      const rest = { ...current };
      if (message) rest[key] = message;
      else delete rest[key];
      return rest;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const found = validateSupplier(values, ctx);
    setErrors(found);
    const first = SUPPLIER_FIELD_ORDER.find((key) => found[key]);
    if (first) {
      setShowFix(true);
      const field = refs.current[first];
      field?.focus();
      field?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    setShowFix(false);
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const repo = getDataLayer().suppliers;
      const input = toSupplierInput(values);
      if (editing) onDone({ kind: "edited", supplier: await repo.update(editing.id, input) });
      else onDone({ kind: "added", supplier: await repo.create(input) });
    } catch (error) {
      const code = codeOf(error);
      setFailure(
        code === "storage-full"
          ? S.saveStorageFull
          : code === "invalid"
            ? S.saveInvalid
            : code === "not-found"
              ? S.saveGone
              : S.saveFailed,
      );
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="flex flex-col gap-4 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      {failure ? (
        <Notice variant="error" title={S.saveFailedTitle}>
          {failure}
        </Notice>
      ) : null}
      {showFix && Object.keys(errors).length > 0 ? (
        <Notice variant="warning">{S.fixFirst}</Notice>
      ) : null}

      <Field label={S.nameLabel} error={errors.name}>
        {(c) => (
          <Input
            {...c}
            ref={(el) => {
              refs.current.name = el;
            }}
            autoComplete="off"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => blur("name")}
          />
        )}
      </Field>

      <Field label={S.notesLabel} error={errors.notes}>
        {(c) => (
          <Textarea
            {...c}
            ref={(el) => {
              refs.current.notes = el;
            }}
            rows={3}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            onBlur={() => blur("notes")}
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        {/* Pressing Save must not blur the field first: the blur could move this button before the click lands. */}
        <Button type="submit" busy={busy} onMouseDown={(event) => event.preventDefault()}>
          {S.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {S.cancel}
        </Button>
      </div>
    </form>
  );
}
