"use client";

/**
 * Cost sheets section on the formula page (v0.3 TrueCandle Cost): the
 * formula's sheets and "New cost sheet from version n" for the version on screen.
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

type Loaded = { ok: true; items: CostSheetListItem[]; versionNumber: number | null } | { ok: false };

export function FormulaCostSection({
  formulaId,
  versionId,
  className,
}: {
  formulaId: string;
  versionId: string;
  className?: string;
}) {
  const headingId = useId();
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const [items, version] = await Promise.all([
        layer.costSheets.list({ formulaId }),
        layer.versions.get(versionId),
      ]);
      return { ok: true, items, versionNumber: version?.number ?? null };
    } catch {
      return { ok: false };
    }
  }, [formulaId, versionId, reload]);

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
          <p className="max-w-[60ch] text-sm text-text-secondary">{M.sectionEmptyFormula}</p>
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
          {loaded.versionNumber !== null ? (
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link href={`/costs/new?version=${versionId}`}>{M.newSheetFromVersion(loaded.versionNumber)}</Link>
            </Button>
          ) : null}
          <Link
            href={`/costs?formula=${formulaId}`}
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
        {M.formulaSectionHeading}
      </h2>
      {body}
    </section>
  );
}
