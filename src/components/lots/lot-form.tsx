"use client";

import { useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { todayLocal } from "@/lib/schedule";
import type { Material, MaterialLot, MaterialType, Supplier } from "@/lib/types";
import {
  LOT_FIELD_ORDER,
  emptyLotValues,
  lotValuesFrom,
  toLotInput,
  validateLot,
  validateLotField,
  type LotContext,
  type LotErrors,
  type LotFieldKey,
  type LotValues,
} from "./form-model";
import { SELECT_CLASS, codeOf } from "./shared";

const L = MESSAGES.lots;
const TYPE_TAG = MESSAGES.materials.typeTag;
const TYPE_ORDER: readonly MaterialType[] = ["wax", "fragranceOil", "wick", "vessel"];

export type LotOutcome = { kind: "added" | "edited"; lot: MaterialLot };

interface LotFormProps {
  /** The lot being edited, or null to add. */
  editing: MaterialLot | null;
  /** Every material (archived included): names for the read-only field and the pick list source. */
  materials: readonly Material[];
  /** Every supplier (archived included). */
  suppliers: readonly Supplier[];
  /** Every lot (archived included), for the duplicate code check. */
  lots: readonly MaterialLot[];
  /** Material chosen when adding ("" for none). */
  defaultMaterialId: string;
  onDone: (outcome: LotOutcome) => void;
  onCancel: () => void;
}

/** The suppliers a lot may be given: not archived, plus the one it already has. */
export function supplierChoices(suppliers: readonly Supplier[], currentId: string | null): Supplier[] {
  return suppliers.filter((s) => s.archivedAt === null || s.id === currentId);
}

/** Add and edit a lot. Rendered inside the editor sheet. The material is fixed once the lot exists. */
export function LotForm({
  editing,
  materials,
  suppliers,
  lots,
  defaultMaterialId,
  onDone,
  onCancel,
}: LotFormProps) {
  const [values, setValues] = useState<LotValues>(() =>
    editing ? lotValuesFrom(editing) : emptyLotValues(defaultMaterialId),
  );
  const [errors, setErrors] = useState<LotErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [showFix, setShowFix] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const refs = useRef<Partial<Record<LotFieldKey, HTMLElement | null>>>({});
  // Read once per form, so a form left open past midnight still checks against the day it opened.
  const [today] = useState(() => todayLocal());
  const ctx: LotContext = { lots, editingId: editing?.id ?? null, today };

  const pickable = materials.filter((m) => m.archivedAt === null);
  const fixedMaterial = editing ? materials.find((m) => m.id === editing.materialId) : undefined;
  const supplierOptions = supplierChoices(suppliers, editing?.supplierId ?? null);

  function set(key: keyof LotValues, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    // An error clears on the next valid keystroke. A material or supplier change also re-checks the code.
    setErrors((current) => {
      const rest = { ...current };
      for (const field of LOT_FIELD_ORDER) {
        if (field in rest && !validateLotField(next, field, ctx)) delete rest[field];
      }
      return rest;
    });
  }

  function blur(key: LotFieldKey) {
    const message = validateLotField(values, key, ctx);
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
    const found = validateLot(values, ctx);
    setErrors(found);
    const first = LOT_FIELD_ORDER.find((key) => found[key]);
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
      const repo = getDataLayer().materialLots;
      const input = toLotInput(values);
      if (editing) onDone({ kind: "edited", lot: await repo.update(editing.id, input) });
      else onDone({ kind: "added", lot: await repo.create(input) });
    } catch (error) {
      const code = codeOf(error);
      setFailure(
        code === "storage-full"
          ? L.saveStorageFull
          : code === "invalid"
            ? L.saveInvalid
            : code === "not-found"
              ? L.saveGone
              : L.saveFailed,
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
        <Notice variant="error" title={L.saveFailedTitle}>
          {failure}
        </Notice>
      ) : null}
      {showFix && Object.keys(errors).length > 0 ? (
        <Notice variant="warning">{L.fixFirst}</Notice>
      ) : null}
      {!editing && pickable.length === 0 ? <Notice variant="info">{L.noMaterials}</Notice> : null}

      {editing ? (
        <Field label={L.materialLabel} hint={L.materialFixedHint}>
          {(c) => (
            <Input
              {...c}
              readOnly
              value={fixedMaterial ? `${fixedMaterial.name} (${TYPE_TAG[fixedMaterial.type]})` : ""}
            />
          )}
        </Field>
      ) : (
        <Field label={L.materialLabel} error={errors.materialId}>
          {(c) => (
            <select
              {...c}
              ref={(el) => {
                refs.current.materialId = el;
              }}
              className={SELECT_CLASS}
              value={values.materialId}
              onChange={(e) => set("materialId", e.target.value)}
              onBlur={() => blur("materialId")}
            >
              <option value="">{L.materialChoose}</option>
              {TYPE_ORDER.map((type) => {
                const group = pickable.filter((m) => m.type === type);
                if (group.length === 0) return null;
                return (
                  <optgroup key={type} label={TYPE_TAG[type]}>
                    {group.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          )}
        </Field>
      )}

      <Field label={L.supplierLabel}>
        {(c) => (
          <select
            {...c}
            className={SELECT_CLASS}
            value={values.supplierId}
            onChange={(e) => set("supplierId", e.target.value)}
          >
            <option value="">{L.noSupplier}</option>
            {supplierOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.archivedAt === null ? s.name : L.supplierArchivedOption(s.name)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label={L.codeLabel} error={errors.code}>
        {(c) => (
          <Input
            {...c}
            ref={(el) => {
              refs.current.code = el;
            }}
            autoComplete="off"
            value={values.code}
            onChange={(e) => set("code", e.target.value)}
            onBlur={() => blur("code")}
          />
        )}
      </Field>

      <Field label={L.receivedLabel} error={errors.receivedOn}>
        {(c) => (
          <Input
            {...c}
            ref={(el) => {
              refs.current.receivedOn = el;
            }}
            type="date"
            value={values.receivedOn}
            onChange={(e) => set("receivedOn", e.target.value)}
            onBlur={() => blur("receivedOn")}
          />
        )}
      </Field>

      <Field label={L.notesLabel} error={errors.notes}>
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
          {L.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {L.cancel}
        </Button>
      </div>
    </form>
  );
}
