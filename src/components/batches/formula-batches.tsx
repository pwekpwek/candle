"use client";

import { useId } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { Batch, FormulaVersion } from "@/lib/types";
import { batchTitle, formatProducedOn } from "./text";

const B = MESSAGES.batches;

type Loaded = { ok: true; batches: Batch[] } | { ok: false };

/** The "Batches" section on the formula page and version view: this formula's batches. */
export function FormulaBatches({
  formulaId,
  versions,
  className,
}: {
  formulaId: string;
  /** Every version of the formula, to turn a batch's version id into its number. */
  versions: readonly FormulaVersion[];
  className?: string;
}) {
  const headingId = useId();
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, batches: await getDataLayer().batches.listByFormula(formulaId) };
    } catch {
      return { ok: false };
    }
  }, [formulaId]);
  const numberOf = new Map(versions.map((v) => [v.id, v.number]));

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="mb-2 text-lg font-semibold">
        {B.formulaBatchesHeading}
      </h2>
      {loaded === undefined ? null : !loaded.ok ? (
        <p className="text-sm text-text-secondary">{B.formulaBatchesLoadFailed}</p>
      ) : loaded.batches.length === 0 ? (
        <p className="text-sm text-text-secondary">{B.formulaNoBatches}</p>
      ) : (
        <ul className="border-b border-border">
          {loaded.batches.map((batch) => {
            const number = numberOf.get(batch.versionId);
            return (
              <li key={batch.id} className="border-t border-border">
                <Link
                  href={`/batches/${batch.id}`}
                  className="flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 py-2 text-sm hover:bg-muted"
                >
                  <span className="min-w-0 font-semibold wrap-anywhere">{batchTitle(batch)}</span>
                  <span className="text-text-secondary">
                    {number !== undefined ? `${B.versionText(number)}${B.separator}` : ""}
                    {formatProducedOn(batch.producedOn)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
