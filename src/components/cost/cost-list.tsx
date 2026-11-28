"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CalculatorIcon } from "lucide-react";
import { batchTitle } from "@/components/batches/text";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import type { CostSheetListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { SheetRow } from "./sheet-row";

const M = MESSAGES.cost;

type Loaded = { ok: true; items: CostSheetListItem[] } | { ok: false };

/** `/costs`: every cost sheet, newest first. `?formula=` or `?batch=` narrows it. */
export function CostList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const formulaId = searchParams.get("formula") ?? undefined;
  const batchId = searchParams.get("batch") ?? undefined;
  const [reload, setReload] = useState(0);

  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const filter = { ...(formulaId ? { formulaId } : {}), ...(batchId ? { batchId } : {}) };
      return { ok: true, items: await getDataLayer().costSheets.list(filter) };
    } catch (error) {
      console.error(error);
      return { ok: false };
    }
  }, [formulaId, batchId, reload]);

  const filtered = Boolean(formulaId || batchId);

  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={M.listTitle} description={M.listDescription} />
        <p role="status" className="text-sm text-text-secondary">
          {M.listLoading}
        </p>
      </>
    );
  }
  if (!loaded.ok) {
    return (
      <>
        <PageHeader title={M.listTitle} description={M.listDescription} />
        <Notice
          variant="error"
          title={M.listLoadFailedTitle}
          action={
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              {M.tryAgain}
            </Button>
          }
        >
          {M.listLoadFailedBody}
        </Notice>
      </>
    );
  }

  const first = loaded.items[0];
  let filterText: string | null = null;
  if (first) {
    if (batchId && first.batch) filterText = M.filterBatch(batchTitle(first.batch));
    else if (formulaId) filterText = M.filterFormula(first.formula.name);
  }

  return (
    <>
      <PageHeader title={M.listTitle} description={M.listDescription} />
      {filtered ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          {filterText ? (
            <p data-testid="cost-filter" className="text-sm wrap-anywhere text-text-secondary">
              {filterText}
            </p>
          ) : null}
          <Button variant="link" className="h-auto min-h-11 px-0" onClick={() => router.replace(pathname)}>
            {M.filterClear}
          </Button>
        </div>
      ) : null}
      {loaded.items.length === 0 ? (
        filtered ? (
          <p className="max-w-[60ch] text-sm text-text-secondary">{M.listEmptyFiltered}</p>
        ) : (
          <EmptyState
            icon={CalculatorIcon}
            title={M.listEmptyTitle}
            description={M.listEmptyBody}
            action={
              <Button asChild>
                <Link href="/formulas">{M.openFormulas}</Link>
              </Button>
            }
            secondaryAction={
              <Link
                href="/batches"
                className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
              >
                {M.openBatches}
              </Link>
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {loaded.items.map((item) => (
            <li key={item.sheet.id}>
              <SheetRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
