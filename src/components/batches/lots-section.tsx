"use client";

import { useId } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Field } from "@/components/common/field";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { BatchLot, FormulaVersion, MaterialLot, Supplier } from "@/lib/types";
import type { LotChoices } from "./form-model";
import { buildLotOptions, supplierNameMap } from "./lot-options";

const B = MESSAGES.batches;

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground aria-invalid:border-destructive pointer-coarse:min-h-11";

type Loaded = { ok: true; lots: MaterialLot[]; suppliers: Supplier[] } | { ok: false };

type Slot = {
  key: string;
  label: string;
  materialId: string;
  materialName: string;
  value: string;
  linked: BatchLot | undefined;
  set: (lotId: string) => LotChoices;
};

/**
 * The optional lot per component of the batch form: each wax and oil row, the
 * wick and the vessel when the version has them. Nothing is saved from here;
 * the form sends the choices with its other fields.
 */
export function LotsSection({
  version,
  choices,
  storedLots,
  onChange,
}: {
  version: FormulaVersion;
  choices: LotChoices;
  /** The links stored on the batch (none on Create batch). */
  storedLots: readonly BatchLot[];
  onChange: (next: LotChoices) => void;
}) {
  const headingId = useId();
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const [lots, suppliers] = await Promise.all([
        layer.materialLots.list({ includeArchived: true }),
        layer.suppliers.list({ includeArchived: true }),
      ]);
      return { ok: true, lots, suppliers };
    } catch {
      return { ok: false };
    }
  }, []);

  const { waxes, oils, wick, vessel } = version.inputs;
  const slots: Slot[] = [
    ...[...waxes, ...oils].map((c) => ({
      key: c.componentId,
      label: B.lotFieldLabel(c.snapshot.name),
      materialId: c.materialId,
      materialName: c.snapshot.name,
      value: choices.rows[c.componentId] ?? "",
      linked: storedLots.find((l) => l.part === "row" && l.componentId === c.componentId),
      set: (lotId: string) => ({ ...choices, rows: { ...choices.rows, [c.componentId]: lotId } }),
    })),
    ...(wick
      ? [
          {
            key: "wick",
            label: B.lotFieldLabelWick(wick.snapshot.name),
            materialId: wick.materialId,
            materialName: wick.snapshot.name,
            value: choices.wick,
            linked: storedLots.find((l) => l.part === "wick"),
            set: (lotId: string) => ({ ...choices, wick: lotId }),
          },
        ]
      : []),
    ...(vessel
      ? [
          {
            key: "vessel",
            label: B.lotFieldLabelVessel(vessel.snapshot.name),
            materialId: vessel.materialId,
            materialName: vessel.snapshot.name,
            value: choices.vessel,
            linked: storedLots.find((l) => l.part === "vessel"),
            set: (lotId: string) => ({ ...choices, vessel: lotId }),
          },
        ]
      : []),
  ];

  const names = loaded?.ok ? supplierNameMap(loaded.suppliers) : new Map<string, string>();

  return (
    <section aria-labelledby={`${headingId}-heading`}>
      <h2 id={`${headingId}-heading`} className="mb-1 text-lg font-semibold">
        {B.lotsHeading}
      </h2>
      <p className="mb-3 text-sm text-text-secondary">{B.lotsHint}</p>
      {loaded === undefined ? (
        <p role="status" className="text-sm text-text-secondary">
          {B.lotsLoading}
        </p>
      ) : !loaded.ok ? (
        <p role="status" className="text-sm text-text-secondary">
          {B.lotsLoadFailed}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {slots.map((slot) => {
            const options = buildLotOptions(
              loaded.lots,
              slot.materialId,
              slot.value,
              slot.linked,
              names,
            );
            if (options.length === 0) {
              return (
                <div key={slot.key} className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground wrap-anywhere">{slot.label}</p>
                  <p className="text-sm text-text-secondary">{B.lotNoLotsHint(slot.materialName)}</p>
                  {/* A block-level link, so it is a full 44px target on touch screens. */}
                  <Link
                    href={`/materials/lots?material=${encodeURIComponent(slot.materialId)}`}
                    className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
                  >
                    {B.lotAddLink}
                  </Link>
                </div>
              );
            }
            return (
              <Field key={slot.key} label={slot.label}>
                {(c) => (
                  <select
                    {...c}
                    className={SELECT_CLASS}
                    value={slot.value}
                    onChange={(e) => onChange(slot.set(e.target.value))}
                  >
                    <option value="">{B.lotNone}</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.text}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            );
          })}
        </div>
      )}
    </section>
  );
}
