"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArchivedBadge } from "@/components/batches/archived-badge";
import { batchTitle, formatProducedOn, versionHref } from "@/components/batches/text";
import { GallerySection, investigationPhotoAdapter } from "@/components/burn/photos";
import { ExperimentsSection } from "@/components/candlefix/experiments";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { checklistView } from "@/lib/candlefix";
import { getDataLayer } from "@/lib/db";
import type { InvestigationDetail } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { ChecklistTick } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DeleteInvestigationDialog } from "./delete-dialog";
import { investigationTitle } from "./form-model";

const M = MESSAGES.candleFix;
const SEP = MESSAGES.batches.separator;

type Loaded =
  | { status: "ok"; detail: InvestigationDetail }
  | { status: "missing" }
  | { status: "error" };

/** The investigation page (`/investigations/[investigationId]`). */
export function InvestigationView({ investigationId }: { investigationId: string }) {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const detail = await getDataLayer().investigations.get(investigationId);
      return detail ? { status: "ok", detail } : { status: "missing" };
    } catch {
      return { status: "error" };
    }
  }, [investigationId, reload]);
  // Set once the investigation is deleted, so the page does not flash "not found" before it leaves.
  const [deleted, setDeleted] = useState(false);

  if (loaded === undefined || deleted) {
    return (
      <>
        <PageHeader title={M.pageLoadingTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {deleted ? "" : M.pageLoading}
        </p>
      </>
    );
  }
  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={M.pageLoadingTitle} />
        <Notice
          variant="error"
          action={
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              {M.tryAgain}
            </Button>
          }
        >
          {M.editorLoadFailed}
        </Notice>
      </>
    );
  }
  if (loaded.status === "missing") {
    return (
      <>
        <PageHeader title={M.notFoundTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{M.notFoundBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/batches">{M.backToBatches}</Link>
          </Button>
        </div>
      </>
    );
  }
  return (
    <ViewBody
      detail={loaded.detail}
      onChanged={() => setReload((n) => n + 1)}
      onDeleted={() => setDeleted(true)}
    />
  );
}

function ViewBody({
  detail,
  onChanged,
  onDeleted,
}: {
  detail: InvestigationDetail;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { investigation, batch, formula, version } = detail;
  const router = useRouter();
  const searchParams = useSearchParams();
  const here = `/investigations/${investigation.id}`;
  const [confirming, setConfirming] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveFailed, setArchiveFailed] = useState(false);

  // "?saved=1" shows the confirmation once, then leaves the URL clean.
  const [savedNotice] = useState(() => searchParams.get("saved") === "1");
  const hasParam = searchParams.get("saved") !== null;
  useEffect(() => {
    if (hasParam) router.replace(here, { scroll: false });
  }, [hasParam, router, here]);

  const archived = investigation.archivedAt !== null;
  const title = investigationTitle(investigation);

  async function toggleArchived() {
    if (archiveBusy) return;
    setArchiveBusy(true);
    setArchiveFailed(false);
    try {
      await getDataLayer().investigations.setArchived(investigation.id, !archived);
      onChanged();
    } catch {
      setArchiveFailed(true);
    } finally {
      setArchiveBusy(false);
    }
  }

  const view = checklistView(investigation.issues, investigation.checks);

  return (
    <>
      <PageHeader
        title={title}
        description={
          <>
            {M.onBatch}{" "}
            <Link href={`/batches/${batch.id}`} className="underline-offset-4 hover:underline">
              {batchTitle(batch)}
            </Link>
            {SEP}
            <Link href={`/formulas/${formula.id}`} className="underline-offset-4 hover:underline">
              {formula.name}
            </Link>
            {SEP}
            <Link
              href={versionHref(formula.id, version.id)}
              className="underline-offset-4 hover:underline"
            >
              {M.versionText(version.number)}
            </Link>
            {formula.archivedAt !== null ? <ArchivedBadge /> : null}
            {SEP}
            <time dateTime={investigation.observedOn}>{formatProducedOn(investigation.observedOn)}</time>
            {archived ? (
              <span
                data-testid="investigation-archived"
                className="ml-2 inline-block rounded-sm border border-border px-1.5 py-0.5 text-xs font-semibold text-text-secondary"
              >
                {M.archivedBadge}
              </span>
            ) : null}
          </>
        }
        action={
          <>
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link href={`${here}/edit`}>{M.edit}</Link>
            </Button>
            <Button
              variant="outline"
              className="pointer-coarse:min-h-11"
              busy={archiveBusy}
              onClick={() => void toggleArchived()}
            >
              {archived ? M.unarchive : M.archive}
            </Button>
            <Button
              variant="outline"
              className="pointer-coarse:min-h-11"
              onClick={() => setConfirming(true)}
            >
              {M.delete}
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {savedNotice ? <Notice variant="success">{M.savedNotice}</Notice> : null}
        {archiveFailed ? <Notice variant="error">{M.archiveFailed}</Notice> : null}
      </div>

      <section
        aria-labelledby="investigation-observed"
        data-testid="observed-block"
        className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4"
      >
        <h2 id="investigation-observed" className="mb-2 text-lg font-semibold">
          {M.observedHeading}
        </h2>
        <h3 className="text-sm font-semibold">{M.observedIssues}</h3>
        <ul className="mt-1 flex list-none flex-wrap gap-2 p-0" data-testid="observed-issues">
          {investigation.issues.map((issue) => (
            <li
              key={issue}
              className="rounded-sm border border-border px-2 py-1 text-sm text-foreground"
            >
              {M.issueLabels[issue]}
            </li>
          ))}
        </ul>
        {investigation.otherIssue ? (
          <p className="mt-2 text-sm wrap-anywhere text-foreground">
            {M.observedOther(investigation.otherIssue)}
          </p>
        ) : null}
        <h3 className="mt-3 text-sm font-semibold">{M.observedNotes}</h3>
        {investigation.notes ? (
          <p className="max-w-[70ch] text-sm whitespace-pre-wrap wrap-anywhere text-foreground">
            {investigation.notes}
          </p>
        ) : (
          <p className="text-sm text-text-secondary">{M.observedNoNotes}</p>
        )}
      </section>

      <GallerySection
        ownerId={investigation.id}
        adapter={investigationPhotoAdapter}
        className="mt-8"
      />

      <section aria-labelledby="investigation-checks" data-testid="checks-section" className="mt-8 min-w-0">
        <h2 id="investigation-checks" className="mb-1 text-lg font-semibold">
          {M.checksHeading}
        </h2>
        {investigation.checks.length === 0 ? (
          <p className="text-sm text-text-secondary">{M.checksViewNone}</p>
        ) : null}
        <div className="grid gap-4">
          {view.groups.map((group) => (
            <div key={group.issue} role="group" aria-labelledby={`view-checks-${group.issue}`}>
              <h3 id={`view-checks-${group.issue}`} className="mb-1 text-base font-semibold">
                {M.checkGroup(M.issueLabels[group.issue])}
              </h3>
              <ul className="grid list-none gap-1 p-0">
                {group.rows.map((row) => (
                  <CheckRow
                    key={row.item.id}
                    itemId={row.item.id}
                    label={row.label}
                    tick={row.tick}
                  />
                ))}
              </ul>
            </div>
          ))}
          {view.noLongerListed.length > 0 ? (
            <div role="group" aria-labelledby="view-checks-no-longer" data-testid="no-longer-listed">
              <h3 id="view-checks-no-longer" className="mb-1 text-base font-semibold">
                {M.noLongerListedHeading}
              </h3>
              <ul className="grid list-none gap-1 p-0">
                {view.noLongerListed.map((tick) => (
                  <CheckRow key={tick.itemId} itemId={tick.itemId} label={tick.label} tick={tick} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="investigation-hypotheses"
        data-testid="hypotheses-block"
        className="mt-8 grid min-w-0 gap-3 rounded-lg border border-dashed border-border bg-muted p-3 sm:p-4"
      >
        <h2 id="investigation-hypotheses" className="text-lg font-semibold">
          {M.hypothesesHeading}
        </h2>
        {investigation.hypotheses.length === 0 ? (
          <p className="text-sm text-text-secondary">{M.hypothesesViewNone}</p>
        ) : (
          <ul className="grid list-none gap-3 p-0">
            {investigation.hypotheses.map((h, index) => (
              <li
                key={h.id}
                data-testid="hypothesis-card"
                className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{M.hypothesisHeading(index + 1)}</h3>
                  <span
                    data-testid="hypothesis-status"
                    data-status={h.status}
                    className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary"
                  >
                    {M.hypothesisStatus[h.status]}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap wrap-anywhere text-foreground">{h.text}</p>
                {h.notes ? (
                  <p className="text-sm whitespace-pre-wrap wrap-anywhere text-text-secondary">{h.notes}</p>
                ) : null}
                <div>
                  <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
                    <Link
                      href={`${here}/experiments/new?hypothesis=${h.id}`}
                      aria-label={M.hypothesisFollowUpFor(index + 1)}
                    >
                      {M.hypothesisFollowUp}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ExperimentsSection investigationId={investigation.id} className="mt-8" />

      <DeleteInvestigationDialog
        investigationId={investigation.id}
        title={title}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => {
          onDeleted();
          router.replace(`/batches/${batch.id}`);
        }}
      />
    </>
  );
}

/** One thing to check, read-only. Items not ticked and without a note are muted. */
function CheckRow({
  itemId,
  label,
  tick,
}: {
  itemId: string;
  label: string;
  tick: ChecklistTick | null;
}) {
  const ticked = tick?.checked === true;
  const touched = tick !== null && (tick.checked || Boolean(tick.note));
  return (
    <li
      data-testid={`check-item-${itemId}`}
      data-ticked={ticked ? "true" : "false"}
      className={cn("min-w-0 text-sm", touched ? "text-foreground" : "text-text-secondary")}
    >
      <span className="wrap-anywhere">{label}</span>
      <span className="text-text-secondary">
        {SEP}
        {ticked ? M.checkTicked : M.checkNotTicked}
      </span>
      {tick?.note ? (
        <p className="whitespace-pre-wrap wrap-anywhere text-text-secondary">
          {M.checkNote}: {tick.note}
        </p>
      ) : null}
    </li>
  );
}
