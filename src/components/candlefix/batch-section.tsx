"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { batchTitle, formatProducedOn } from "@/components/batches/text";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import type { FollowUpLink, InvestigationListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { investigationTitle } from "./investigation/form-model";

const M = MESSAGES.candleFix;

type Loaded = { ok: true; items: InvestigationListItem[]; links: FollowUpLink[] } | { ok: false };

/** The Investigations section on the batch page. */
export function InvestigationsSection({
  batchId,
  className,
}: {
  batchId: string;
  className?: string;
}) {
  const headingId = useId();
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const [items, links] = await Promise.all([
        layer.investigations.listByBatch(batchId),
        layer.investigations.followUpLinks(batchId),
      ]);
      return { ok: true, items, links };
    } catch {
      return { ok: false };
    }
  }, [batchId, reload]);

  const recordButton = (
    <Button asChild variant="outline" className="pointer-coarse:min-h-11">
      <Link href={`/investigations/new?batch=${batchId}`}>{M.recordButton}</Link>
    </Button>
  );

  let body = null;
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
          <p className="max-w-[60ch] text-sm text-text-secondary">{M.sectionEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {loaded.items.map(({ investigation, photoCount, experimentCount }) => (
              <li key={investigation.id}>
                <Link
                  href={`/investigations/${investigation.id}`}
                  data-testid="investigation-row"
                  className="flex min-h-11 min-w-0 flex-col justify-center gap-0.5 rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted"
                >
                  <span className="font-semibold wrap-anywhere text-foreground">
                    {investigationTitle(investigation)}
                  </span>
                  <span className="text-sm text-text-secondary">
                    <time dateTime={investigation.observedOn}>
                      {M.rowObserved(formatProducedOn(investigation.observedOn))}
                    </time>
                    {investigation.archivedAt !== null ? (
                      <>
                        {MESSAGES.batches.separator}
                        <span
                          data-testid="investigation-archived"
                          className="inline-block rounded-sm border border-border px-1.5 py-0.5 text-xs font-semibold"
                        >
                          {M.archivedBadge}
                        </span>
                      </>
                    ) : null}
                    {MESSAGES.batches.separator}
                    {M.rowPhotos(photoCount)}
                    {MESSAGES.batches.separator}
                    {M.rowExperiments(experimentCount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">{recordButton}</div>
        {loaded.links.length > 0 ? (
          <div data-testid="follow-up-links" className="mt-4">
            <h3 className="mb-1 text-base font-semibold">{M.followUpHeading}</h3>
            <ul className="grid list-none gap-1 p-0">
              {loaded.links.map(({ experiment, investigation, original }) => (
                <li key={experiment.id}>
                  <Link
                    href={`/investigations/${investigation.id}`}
                    className="inline-flex min-h-11 items-center text-sm wrap-anywhere text-primary underline-offset-4 hover:underline"
                  >
                    {M.followUpLink(investigationTitle(investigation), batchTitle(original.batch))}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid="investigations-section"
      className={cn("min-w-0", className)}
    >
      <h2 id={headingId} className="mb-3 text-lg font-semibold">
        {M.sectionHeading}
      </h2>
      {body}
    </section>
  );
}
