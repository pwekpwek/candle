"use client";

/**
 * Costs section on the batch page (v0.3 TrueCandle Cost): this batch's cost
 * sheets with the cost per sellable candle, "New cost sheet" and a link to all
 * of them.
 */
import { useId, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import type { CostSheetListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { SheetRow } from "./sheet-row";

const M = MESSAGES.cost;

type Loaded = { ok: true; items: CostSheetListItem[] } | { ok: false };

export function BatchCostSection({ batchId, className }: { batchId: string; className?: string }) {
  const headingId = useId();
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, items: await getDataLayer().costSheets.list({ batchId }) };
    } catch {
      return { ok: false };
    }
  }, [batchId, reload]);

  let body;
  if (loaded === undefined) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {M.sectionLoading}
      </p>
    );
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {M.tryAgain}
          </Button>
        }
      >
        {M.sectionLoadFailed}
      </Notice>
    );
  } else {
    body = (
      <>
        {loaded.items.length === 0 ? (
          <p className="max-w-[60ch] text-sm text-text-secondary">{M.sectionEmptyBatch}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {loaded.items.map((item) => (
              <li key={item.sheet.id}>
                <SheetRow item={item} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button asChild variant="outline" className="pointer-coarse:min-h-11">
            <Link href={`/costs/new?batch=${batchId}`}>{M.newSheet}</Link>
          </Button>
          <Link
            href={`/costs?batch=${batchId}`}
            className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
          >
            {M.allSheets}
          </Link>
        </div>
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} data-testid="cost-section" className={cn("min-w-0", className)}>
      <h2 id={headingId} className="mb-3 text-lg font-semibold">
        {M.sectionHeading}
      </h2>
      {body}
    </section>
  );
}
