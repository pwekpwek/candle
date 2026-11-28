"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { GitCompareArrowsIcon } from "lucide-react";
import { batchTitle, formatProducedOn, versionHref } from "@/components/batches/text";
import { sessionTitle } from "@/components/burn/compare/text";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { buildTimeline } from "@/lib/candlefix";
import type { TimelineEvent } from "@/lib/candlefix";
import { getDataLayer } from "@/lib/db";
import type { InvestigationComparisonData, InvestigationDetail } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { compareHref, eventLabel, experimentHref, localDateOf, statusLabel } from "./text";

const X = MESSAGES.candleFixExperiments;
const F = MESSAGES.candleFix;

type Loaded =
  | { ok: true; detail: InvestigationDetail | undefined; comparison: InvestigationComparisonData | undefined }
  | { ok: false };

/**
 * Corrective experiments of an investigation, with a link to the
 * before-and-after view and a timeline of dated events. Loads its own data.
 */
export function ExperimentsSection({ investigationId, className }: { investigationId: string; className?: string }) {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const [detail, comparison] = await Promise.all([
        layer.investigations.get(investigationId),
        layer.investigations.comparison(investigationId),
      ]);
      return { ok: true, detail, comparison };
    } catch (error) {
      console.error(error);
      return { ok: false };
    }
  }, [investigationId, reload]);

  let body;
  if (loaded === undefined) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {X.loading}
      </p>
    );
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {X.tryAgain}
          </Button>
        }
      >
        {X.loadFailed}
      </Notice>
    );
  } else if (!loaded.detail) {
    body = null;
  } else {
    body = <SectionBody detail={loaded.detail} comparison={loaded.comparison} />;
  }

  return (
    <section
      aria-labelledby="experiments-heading"
      data-testid="experiments-section"
      className={cn("grid min-w-0 gap-4", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <h2 id="experiments-heading" className="text-lg font-semibold">
            {X.heading}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{X.description}</p>
        </div>
        {loaded?.ok && loaded.detail && loaded.detail.experiments.length > 0 ? (
          <Button asChild variant="outline" className="pointer-coarse:min-h-11">
            <Link href={compareHref(investigationId)}>
              <GitCompareArrowsIcon aria-hidden="true" />
              {X.compareLink}
            </Link>
          </Button>
        ) : null}
      </div>
      {body}
    </section>
  );
}

function SectionBody({
  detail,
  comparison,
}: {
  detail: InvestigationDetail;
  comparison: InvestigationComparisonData | undefined;
}) {
  const { investigation, experiments } = detail;
  const events = comparison ? buildTimeline(comparison, localDateOf) : [];
  return (
    <>
      {experiments.length === 0 ? (
        <EmptyState icon={GitCompareArrowsIcon} title={X.emptyTitle} description={X.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-3" aria-label={X.heading}>
          {experiments.map((item) => {
            const { experiment, followUp, burnSessions } = item;
            const hypothesis = investigation.hypotheses.find((h) => h.id === experiment.hypothesisId);
            const title = batchTitle(followUp.batch);
            return (
              <li
                key={experiment.id}
                data-testid="experiment-card"
                aria-label={X.cardLabel(title)}
                className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-4"
              >
                <dl className="grid min-w-0 gap-3 text-sm">
                  <Row label={X.hypothesisFollowed}>
                    {hypothesis ? (
                      <>
                        <span className="wrap-anywhere">
                          <span className="font-semibold">{F.hypothesisLabel}: </span>
                          {hypothesis.text}
                        </span>
                        <span className="block text-text-secondary">{statusLabel(hypothesis.status)}</span>
                      </>
                    ) : (
                      <span className="text-text-secondary">{X.hypothesisGone}</span>
                    )}
                  </Row>
                  <Row label={X.followUpBatch}>
                    <Link
                      href={`/batches/${followUp.batch.id}`}
                      className="text-primary underline-offset-4 wrap-anywhere hover:underline"
                    >
                      {title}
                    </Link>
                    <span className="block text-text-secondary">
                      {X.formulaLabel}: {followUp.formula.name}
                      {X.separator}
                      <Link
                        href={versionHref(followUp.formula.id, followUp.version.id)}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {X.versionText(followUp.version.number)}
                      </Link>
                    </span>
                  </Row>
                  <Row label={X.changeLabel}>
                    {experiment.change ? (
                      <span className="whitespace-pre-wrap wrap-anywhere">{experiment.change}</span>
                    ) : (
                      <span className="text-text-secondary">{X.noChange}</span>
                    )}
                  </Row>
                  {experiment.notes ? (
                    <Row label={X.notesLabel}>
                      <span className="whitespace-pre-wrap wrap-anywhere">{experiment.notes}</span>
                    </Row>
                  ) : null}
                  <Row label={X.burnTestsLabel}>
                    {burnSessions.length === 0 ? (
                      <span className="text-text-secondary">{X.noBurnTests}</span>
                    ) : (
                      <ul className="grid gap-1">
                        {burnSessions.map((s) => (
                          <li key={s.session.id}>
                            <Link
                              href={`/burn-tests/${s.session.id}`}
                              className="inline-flex min-h-11 items-center text-primary underline-offset-4 wrap-anywhere hover:underline sm:min-h-0"
                            >
                              {sessionTitle(s.session)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Row>
                </dl>
                <div>
                  <Button asChild variant="outline" className="pointer-coarse:min-h-11">
                    <Link href={experimentHref(investigation.id, experiment.id)} aria-label={X.editLabel(title)}>
                      {X.editLink}
                    </Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Timeline events={events} />
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="font-semibold text-text-secondary">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function eventHref(event: TimelineEvent): string {
  return event.kind === "burnTest" ? `/burn-tests/${event.refId}` : `/batches/${event.batchId}`;
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="grid gap-2">
      <h3 id="timeline-heading" className="text-base font-semibold">
        {X.timelineHeading}
      </h3>
      {events.length === 0 ? (
        <p className="text-sm text-text-secondary">{X.timelineEmpty}</p>
      ) : (
        <ol
          data-testid="timeline"
          aria-labelledby="timeline-heading"
          className="grid gap-2 border-l border-border pl-4"
        >
          {events.map((event) => (
            <li key={event.key} data-testid="timeline-event" className="min-w-0 text-sm">
              <time dateTime={event.date} className="block font-semibold tabular-nums">
                {formatProducedOn(event.date)}
              </time>
              <Link href={eventHref(event)} className="text-primary underline-offset-4 wrap-anywhere hover:underline">
                {eventLabel(event.kind)}
              </Link>
              {event.text ? <span className="text-text-secondary wrap-anywhere">{`: ${event.text}`}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
