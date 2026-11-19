"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { formatProducedOn } from "@/components/batches/text";
import { Notice } from "@/components/common/notice";
import { milestoneName } from "@/components/schedule/names";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import type { BurnSessionListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { CureMilestone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { sessionTitle } from "./text";

const M = MESSAGES.burn;

/** The most sessions the comparison takes. */
const COMPARE_MAX = 4;

type Loaded =
  | { ok: true; sessions: BurnSessionListItem[]; milestones: Map<string, CureMilestone> }
  | { ok: false };

/** The Burn tests section on the batch page. */
export function BurnTestsSection({ batchId, className }: { batchId: string; className?: string }) {
  const headingId = useId();
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const [sessions, plan] = await Promise.all([
        layer.burnSessions.listByBatch(batchId),
        layer.curePlans.get(batchId),
      ]);
      const milestones = new Map((plan?.milestones ?? []).map((m) => [m.id, m]));
      return { ok: true, sessions, milestones };
    } catch {
      return { ok: false };
    }
  }, [batchId, reload]);

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
  } else if (loaded.sessions.length === 0) {
    body = <p className="max-w-[60ch] text-sm text-text-secondary">{M.sectionEmpty}</p>;
  } else {
    body = (
      <ul className="flex flex-col gap-2">
        {loaded.sessions.map((entry) => {
          const { session } = entry;
          const milestone = session.milestoneId ? loaded.milestones.get(session.milestoneId) : undefined;
          return (
            <li key={session.id}>
              <Link
                href={`/burn-tests/${session.id}`}
                data-testid="burn-row"
                className="flex min-h-11 min-w-0 flex-col justify-center gap-0.5 rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted"
              >
                <span className="font-semibold wrap-anywhere text-foreground">
                  {sessionTitle(session)}
                </span>
                <span className="text-sm text-text-secondary">
                  <time dateTime={session.testedOn}>{formatProducedOn(session.testedOn)}</time>
                  {MESSAGES.batches.separator}
                  {M.rowCandles(session.candles.length)}
                  {MESSAGES.batches.separator}
                  {M.rowPhotos(entry.photoCount)}
                  {milestone ? (
                    <>
                      {MESSAGES.batches.separator}
                      {M.rowPlanned(milestoneName(milestone))}
                    </>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  const sessions = loaded?.ok ? loaded.sessions : [];
  const latest = sessions.slice(0, COMPARE_MAX);

  return (
    <section aria-labelledby={headingId} className={cn("min-w-0", className)}>
      <h2 id={headingId} className="mb-3 text-lg font-semibold">
        {M.sectionHeading}
      </h2>
      {body}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" className="pointer-coarse:min-h-11">
          <Link href={`/burn-tests/new?batch=${batchId}`}>{M.recordButton}</Link>
        </Button>
        {latest.length >= 2 ? (
          <Button asChild variant="outline" className="pointer-coarse:min-h-11">
            <Link href={`/burn-tests/compare?sessions=${latest.map((e) => e.session.id).join(",")}`}>
              {M.compareLatest(latest.length)}
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost" className="pointer-coarse:min-h-11">
          <Link href="/burn-tests">{M.compareAll}</Link>
        </Button>
      </div>
    </section>
  );
}
