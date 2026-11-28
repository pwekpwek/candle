"use client";

import { useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { codeOf } from "@/components/lots/shared";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { CostItem } from "@/lib/types";
import {
  ITEM_FIELD_ORDER,
  emptyItemValues,
  itemValuesFrom,
  toItemInput,
  validateItem,
  validateItemField,
  type ItemContext,
  type ItemErrors,
  type ItemFieldKey,
  type ItemValues,
} from "./form-model";

const C = MESSAGES.costItems;

export type ItemOutcome = { kind: "added" | "edited"; item: CostItem };

interface ItemFormProps {
  /** The item being edited, or null to add. */
  editing: CostItem | null;
  /** Every item (archived included), for the duplicate name check. */
  items: readonly CostItem[];
  onDone: (outcome: ItemOutcome) => void;
  onCancel: () => void;
}

/** Add and edit a packaging or other item. Rendered inside the editor sheet. */
export function ItemForm({ editing, items, onDone, onCancel }: ItemFormProps) {
  const [values, setValues] = useState<ItemValues>(() =>
    editing ? itemValuesFrom(editing) : emptyItemValues(),
  );
  const [errors, setErrors] = useState<ItemErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [showFix, setShowFix] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const refs = useRef<Partial<Record<ItemFieldKey, HTMLElement | null>>>({});
  const ctx: ItemContext = { items, editingId: editing?.id ?? null };

  function set(key: ItemFieldKey, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    // An error clears on the next valid keystroke.
    if (key in errors && !validateItemField(next, key, ctx)) {
      setErrors((current) => {
        const rest = { ...current };
        delete rest[key];
        return rest;
      });
    }
  }

  function blur(key: ItemFieldKey) {
    const message = validateItemField(values, key, ctx);
    setErrors((current) => {
      const rest = { ...current };
      if (message) rest[key] = message;
      else delete rest[key];
      return rest;
    });
  }

  function focusFirst(found: ItemErrors) {
    const first = ITEM_FIELD_ORDER.find((key) => found[key]);
    if (!first) return;
    setShowFix(true);
    const field = refs.current[first];
    field?.focus();
    field?.scrollIntoView?.({ block: "nearest" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const found = validateItem(values, ctx);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    setShowFix(false);
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const repo = getDataLayer().costItems;
      const input = toItemInput(values);
      if (editing) onDone({ kind: "edited", item: await repo.update(editing.id, input) });
      else onDone({ kind: "added", item: await repo.create(input) });
    } catch (error) {
      const code = codeOf(error);
      inFlight.current = false;
      setBusy(false);
      if (code === "invalid") {
        // The only rule the screen cannot see ahead of time is a name taken since the list loaded.
        const clash = { name: C.nameDuplicate };
        setErrors(clash);
        focusFirst(clash);
        return;
      }
      setFailure(code === "not-found" ? C.saveGone : C.saveFailed);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="flex flex-col gap-4 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      {failure ? (
        <Notice variant="error" title={C.saveFailedTitle}>
          {failure}
        </Notice>
      ) : null}
      {showFix && Object.keys(errors).length > 0 ? (
        <Notice variant="warning">{C.fixFirst}</Notice>
      ) : null}

      <Field label={C.nameLabel} error={errors.name}>
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

      <Field label={C.priceLabel} hint={C.priceNote} error={errors.price}>
        {(c) => (
          <Input
            {...c}
            ref={(el) => {
              refs.current.price = el;
            }}
            inputMode="decimal"
            autoComplete="off"
            value={values.price}
            onChange={(e) => set("price", e.target.value)}
            onBlur={() => blur("price")}
            className="text-right tabular-nums"
          />
        )}
      </Field>

      <Field label={C.notesLabel} error={errors.notes}>
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
          {C.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {C.cancel}
        </Button>
      </div>
    </form>
  );
}
