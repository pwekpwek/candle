"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardListIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import type { BatchListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { ArchivedBadge } from "./archived-badge";
import { batchTitle, formatProducedOn, weighedStatus } from "./text";

const B = MESSAGES.batches;

type Loaded = { ok: true; items: BatchListItem[] } | { ok: false };

/** The Batches list (`/batches`): newest production date first, as the data layer returns it. */
export function BatchList() {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, items: await getDataLayer().batches.list() };
    } catch {
      return { ok: false };
    }
  }, [reload]);

  let body;
  if (loaded === undefined) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {B.loading}
      </p>
    );
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        title={B.loadFailedTitle}
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {B.tryAgain}
          </Button>
        }
      >
        {B.loadFailed}
      </Notice>
    );
  } else if (loaded.items.length === 0) {
    body = (
      <EmptyState
        icon={ClipboardListIcon}
        title={B.emptyTitle}
        description={B.emptyDescription}
        action={
          <Button asChild>
            <Link href="/">{B.emptyAction}</Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <ul className="flex flex-col gap-3" aria-label={B.title}>
        {loaded.items.map((item) => (
          <BatchRow key={item.batch.id} item={item} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <PageHeader
        title={B.title}
        description={B.listDescription}
        action={
          <Button asChild variant="outline">
            <Link href="/burn-tests">{MESSAGES.burnCompare.batchesLink}</Link>
          </Button>
        }
      />
      {body}
    </>
  );
}

/** The title is a real link stretched over the whole card (the tap target). */
function BatchRow({ item }: { item: BatchListItem }) {
  const { batch, formula, version } = item;
  return (
    <li
      data-testid="batch-row"
      className="relative rounded-lg border border-border bg-card p-3 hover:bg-muted has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring sm:px-4"
    >
      <Link
        href={`/batches/${batch.id}`}
        className="flex min-h-11 items-center text-base font-semibold break-words text-foreground underline-offset-4 outline-none after:absolute after:inset-0 hover:underline"
      >
        {batchTitle(batch)}
      </Link>
      <p className="text-sm text-text-secondary">
        {`${formula.name}${B.separator}${B.versionText(version.number)}`}
        {formula.archivedAt !== null ? <ArchivedBadge /> : null}
      </p>
      <p className="text-sm text-text-secondary">
        <time dateTime={batch.producedOn}>{formatProducedOn(batch.producedOn)}</time>
        {B.separator}
        {weighedStatus(batch, version)}
      </p>
    </li>
  );
}
