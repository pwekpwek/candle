"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import type { Material, MaterialType } from "@/lib/types";
import { validateName } from "./form-model";

const M = MESSAGES.materials;

export interface MaterialPickerProps {
  /** Which materials to offer. */
  type: MaterialType;
  /** The chosen material id, or null for none. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Visible label above the control ("Wax", "Wick"). */
  label: string;
  /** Id for the select, so an outside label or test can reach it. */
  id?: string;
  /** Marks the select invalid (aria-invalid) and gives it the error border. */
  invalid?: boolean;
  /** Id of an element (an error message) that describes the select. */
  describedBy?: string;
  /** Adds a "None" choice for optional rows such as wick and vessel. */
  allowNone?: boolean;
  /** Ids to leave out of the list, for example waxes already used in other rows. The current value stays. */
  excludeIds?: readonly string[];
  className?: string;
}

type Loaded = { ok: true; materials: Material[] } | { ok: false };

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none aria-invalid:border-destructive";

/**
 * Material picker for the formula editor (PRD-06, F1 step 2). A native select
 * of unarchived materials of one type, with a quick-add under it that asks for
 * a name only, creates the material and selects it.
 */
export function MaterialPicker({
  type,
  value,
  onChange,
  label,
  id,
  invalid,
  describedBy,
  allowNone = false,
  excludeIds,
  className,
}: MaterialPickerProps) {
  const generated = useId();
  const selectId = id ?? `${generated}-select`;
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState<boolean | null>(null);
  const [created, setCreated] = useState<Material | null>(null);

  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const materials = await getDataLayer().materials.list({ type, includeArchived: true });
      return { ok: true, materials };
    } catch {
      return { ok: false };
    }
  }, [type, reload]);

  const all = loaded?.ok ? loaded.materials : [];
  // A material just created may not be in the live list yet.
  const known =
    created && created.type === type && !all.some((m) => m.id === created.id)
      ? [...all, created]
      : all;
  const unarchived = known.filter((m) => m.archivedAt === null);
  const options = unarchived.filter((m) => m.id === value || !excludeIds?.includes(m.id));
  const current = value === null ? undefined : known.find((m) => m.id === value);
  const currentHidden = value !== null && !options.some((m) => m.id === value);
  const loading = loaded === undefined;
  // With none of this type, the quick-add is the first thing shown.
  const addOpen = adding ?? (loaded?.ok === true && unarchived.length === 0);

  return (
    <div className={cn("flex flex-col gap-1", className)} data-testid="material-picker">
      <Label htmlFor={selectId}>{label}</Label>
      <select
        id={selectId}
        value={value ?? ""}
        disabled={loading}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{loading ? M.pickerLoading : allowNone ? M.pickerNone : M.pickerChoose}</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
        {currentHidden && value !== null ? (
          <option value={value}>
            {current ? `${current.name} (${M.archivedTag})` : M.pickerMissing}
          </option>
        ) : null}
      </select>

      {loaded && !loaded.ok ? (
        <Notice
          variant="error"
          title={M.loadFailedTitle}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setReload((n) => n + 1)}>
              {M.retry}
            </Button>
          }
        >
          {M.loadFailed}
        </Notice>
      ) : null}

      {addOpen ? (
        <QuickAdd
          type={type}
          onCancel={unarchived.length === 0 ? undefined : () => setAdding(false)}
          onCreated={(material) => {
            setCreated(material);
            setAdding(false);
            onChange(material.id);
          }}
        />
      ) : loaded?.ok ? (
        <div>
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-10 px-0 pointer-coarse:min-h-11"
            onClick={() => setAdding(true)}
          >
            {M.pickerAddRow(type)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface QuickAddProps {
  type: MaterialType;
  /** Absent when the form is the only way forward (the library has none of this type). */
  onCancel?: () => void;
  onCreated: (material: Material) => void;
}

/** Asks for a name only (PRD-06). Enter adds; it never submits a form around the picker. */
function QuickAdd({ type, onCancel, onCreated }: QuickAddProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function add() {
    if (inFlight.current) return;
    const problem = validateName(name);
    setError(problem);
    if (problem) {
      inputRef.current?.focus();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFailure(false);
    try {
      const material = await getDataLayer().materials.create({ type, name });
      onCreated(material);
    } catch {
      setFailure(true);
      inFlight.current = false;
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void add();
    } else if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div role="group" aria-label={M.pickerAddRow(type)} className="flex flex-col gap-2 rounded-md border border-border p-3">
      {failure ? (
        <Notice variant="error" title={M.saveFailedTitle}>
          {M.saveFailed}
        </Notice>
      ) : null}
      <Field label={`${M.pickerAddRow(type)}: ${M.pickerNameLabel.toLowerCase()}`} error={error}>
        {(c) => (
          <Input
            {...c}
            ref={inputRef}
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error && !validateName(e.target.value)) setError(undefined);
            }}
            onBlur={() => setError(name === "" ? undefined : validateName(name))}
            onKeyDown={onKeyDown}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" busy={busy} onClick={() => void add()}>
          {M.pickerCreate}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {M.pickerCancel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
