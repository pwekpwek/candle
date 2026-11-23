"use client";

import { useId } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { Batch, BatchLot, FormulaVersion, MaterialLot, Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";

const B = MESSAGES.batches;

type Current = { lot: MaterialLot | null; supplier: Supplier | null };
type Loaded = { ok: true; byLotId: Map<string, Current> } | { ok: false };

type Part = { key: string; heading: string; name: string; materialId: string; link: BatchLot | undefined };

/** The version's components in its order (waxes, oils, wick, vessel) with the lot recorded for each. */
function partsOf(batch: Batch, version: FormulaVersion): Part[] {
  const links = batch.lots ?? [];
  const { waxes, oils, wick, vessel } = version.inputs;
  const parts: Part[] = [
    ...waxes.map((c) => ({
      key: c.componentId,
      heading: B.partWax,
      name: c.snapshot.name,
      materialId: c.materialId,
      link: links.find((l) => l.part === "row" && l.componentId === c.componentId),
    })),
    ...oils.map((c) => ({
      key: c.componentId,
      heading: B.partOil,
      name: c.snapshot.name,
      materialId: c.materialId,
      link: links.find((l) => l.part === "row" && l.componentId === c.componentId),
    })),
  ];
  if (wick) {
    parts.push({
      key: "wick",
      heading: B.partWick,
      name: wick.snapshot.name,
      materialId: wick.materialId,
      link: links.find((l) => l.part === "wick"),
    });
  }
  if (vessel) {
    parts.push({
      key: "vessel",
      heading: B.partVessel,
      name: vessel.snapshot.name,
      materialId: vessel.materialId,
      link: links.find((l) => l.part === "vessel"),
    });
  }
  return parts;
}

/**
 * "Recorded lots" on the batch page: what the batch recorded for each component,
 * with a hint when the lot or its supplier has been edited since, and a badge
 * when the lot is archived. Read only; the pickers in the form change the links.
 */
export function LotsDetail({
  batch,
  version,
  className,
}: {
  batch: Batch;
  version: FormulaVersion;
  className?: string;
}) {
  const headingId = useId();
  const lotKey = (batch.lots ?? []).map((l) => l.lotId).join("|");
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const byLotId = new Map<string, Current>();
      for (const link of batch.lots ?? []) {
        if (byLotId.has(link.lotId)) continue;
        const lot = (await layer.materialLots.get(link.lotId)) ?? null;
        const supplier = lot?.supplierId ? ((await layer.suppliers.get(lot.supplierId)) ?? null) : null;
        byLotId.set(link.lotId, { lot, supplier });
      }
      return { ok: true, byLotId };
    } catch {
      return { ok: false };
    }
    // lotKey stands for batch.lots, so the query runs again when the links change.
  }, [batch.id, lotKey]);

  const parts = partsOf(batch, version);

  return (
    <section aria-labelledby={`${headingId}-heading`} className={className}>
      <h2 id={`${headingId}-heading`} className="mb-3 text-lg font-semibold">
        {B.lotsRecordedHeading}
      </h2>
      <ul className="flex flex-col gap-3">
        {parts.map((part) => (
          <li
            key={part.key}
            data-testid="lot-detail-row"
            className="rounded-lg border border-border bg-card p-3 sm:px-4"
          >
            <p className="text-sm font-semibold text-foreground wrap-anywhere">
              {`${part.heading}${B.separator}${part.name}`}
            </p>
            <LotLine part={part} current={loaded?.ok ? loaded.byLotId.get(part.link?.lotId ?? "") : undefined} loaded={loaded} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LotLine({
  part,
  current,
  loaded,
}: {
  part: Part;
  current: Current | undefined;
  loaded: Loaded | undefined;
}) {
  const { link } = part;
  if (!link) return <p className="text-sm text-text-secondary">{B.lotNone}</p>;

  const lot = current?.lot ?? null;
  const known = loaded?.ok === true;
  const codeChanged = known && lot !== null && lot.code !== link.lotCode;
  const currentSupplierName = current?.supplier?.name ?? null;
  const supplierChanged =
    known &&
    lot !== null &&
    ((lot.supplierId ?? null) !== (link.supplierId ?? null) ||
      currentSupplierName !== (link.supplierName ?? null));

  return (
    <div className="mt-1 flex flex-col gap-1 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          href={`/materials/lots?material=${encodeURIComponent(part.materialId)}`}
          className="font-medium text-foreground underline underline-offset-4 wrap-anywhere"
        >
          {link.lotCode}
        </Link>
        {lot?.archivedAt ? (
          <span className="inline-block rounded-sm border border-border px-1.5 py-0.5 text-xs font-semibold text-text-secondary">
            {B.lotArchivedBadge}
          </span>
        ) : null}
      </p>
      <p className="text-text-secondary wrap-anywhere">
        {link.supplierName ? B.lotSupplierLabel(link.supplierName) : B.lotNoSupplier}
      </p>
      {known && lot === null ? <p className="text-text-secondary wrap-anywhere">{B.lotNotFound}</p> : null}
      {codeChanged ? (
        <p className={cn("text-text-secondary wrap-anywhere")}>{B.lotNowCode(lot.code)}</p>
      ) : null}
      {supplierChanged ? (
        <p className="text-text-secondary wrap-anywhere">{B.lotNowSupplier(currentSupplierName)}</p>
      ) : null}
    </div>
  );
}
