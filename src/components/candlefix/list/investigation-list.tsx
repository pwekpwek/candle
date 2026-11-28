"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { SearchCheckIcon } from "lucide-react";
import { batchTitle, formatProducedOn } from "@/components/batches/text";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { investigationHref } from "@/components/candlefix/experiments/text";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import type { InvestigationListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.candleFixCompare;
const F = MESSAGES.candleFix;

type Loaded = { ok: true; items: InvestigationListItem[] } | { ok: false };

/** The row's name: the maker's title, else the issues they recorded. */
export function investigationName(item: InvestigationListItem): string {
  const title = item.investigation.title?.trim();
  if (title) return title;
  const names = item.investigation.issues.map((issue) =>
    issue === "other" && item.investigation.otherIssue ? item.investigation.otherIssue : F.issueLabels[issue],
  );
  return names.length > 0 ? names.join(", ") : M.untitled;
}

/** `/investigations`: every investigation, newest observation first. `?archived=1` shows archived ones too. */
export function InvestigationList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const includeArchived = searchParams.get("archived") === "1";
  const [reload, setReload] = useState(0);

  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, items: await getDataLayer().investigations.list({ includeArchived }) };
    } catch (error) {
      console.error(error);
      return { ok: false };
    }
  }, [includeArchived, reload]);

  function setArchived(on: boolean) {
    router.replace(on ? `${pathname}?archived=1` : pathname, { scroll: false });
  }

  const toggle = (
    <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        checked={includeArchived}
        onChange={(event) => setArchived(event.target.checked)}
      />
      {M.showArchived}
    </label>
  );

  let body;
  if (loaded === undefined) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {M.listLoading}
      </p>
    );
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        title={M.listLoadFailedTitle}
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {M.tryAgain}
          </Button>
        }
      >
        {M.listLoadFailed}
      </Notice>
    );
  } else if (loaded.items.length === 0 && !includeArchived) {
    body = (
      <EmptyState
        icon={SearchCheckIcon}
        title={M.listEmptyTitle}
        description={M.listEmptyBody}
        action={
          <Button asChild>
            <Link href="/batches">{M.listEmptyAction}</Link>
          </Button>
        }
      />
    );
  } else if (loaded.items.length === 0) {
    body = <p className="text-sm text-text-secondary">{M.listNoActive}</p>;
  } else {
    body = (
      <ul data-testid="investigations-list" aria-label={M.listGroupLabel} className="flex flex-col gap-3">
        {loaded.items.map((item) => (
          <Row key={item.investigation.id} item={item} />
        ))}
      </ul>
    );
  }

  const showToggle = loaded?.ok === true;
  return (
    <>
      <PageHeader title={M.listTitle} description={M.listDescription} />
      <div className="grid min-w-0 gap-3">
        {showToggle ? toggle : null}
        {body}
      </div>
    </>
  );
}

function Row({ item }: { item: InvestigationListItem }) {
  const { investigation, batch, formula, version, photoCount, experimentCount } = item;
  const archived = investigation.archivedAt !== null;
  return (
    <li
      data-testid="investigation-list-row"
      className="min-w-0 rounded-lg border border-border bg-card p-3 hover:bg-muted sm:p-4"
    >
      <Link
        href={investigationHref(investigation.id)}
        className="flex min-h-11 flex-wrap items-center gap-x-2 text-base font-semibold text-foreground underline-offset-4 hover:underline"
      >
        <span className="min-w-0 wrap-anywhere">{investigationName(item)}</span>
        {archived ? (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs font-semibold text-text-secondary">
            {M.archivedBadge}
          </span>
        ) : null}
      </Link>
      <p className="text-sm text-text-secondary wrap-anywhere">
        {batchTitle(batch)}
        {M.separator}
        {formula.name}
        {M.separator}
        {M.versionText(version.number)}
      </p>
      <p className="text-sm text-text-secondary tabular-nums">
        <time dateTime={investigation.observedOn}>{M.observedOn(formatProducedOn(investigation.observedOn))}</time>
        {M.separator}
        {M.photoCount(photoCount)}
        {M.separator}
        {M.experimentCount(experimentCount)}
      </p>
    </li>
  );
}
