"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { FlaskConicalIcon } from "lucide-react";
import { ArchivedBadge } from "@/components/batches/archived-badge";
import { formatProducedOn } from "@/components/batches/text";
import { batchName, compareHref, MAX_COMPARE, sessionTitle } from "@/components/burn/compare/text";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import type { BurnSessionListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.burnCompare;

type Loaded = { ok: true; items: BurnSessionListItem[] } | { ok: false };

/** `/burn-tests`: every burn test, newest first, with a picker of up to 4 to compare. */
export function BurnList() {
  const router = useRouter();
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, items: await getDataLayer().burnSessions.list() };
    } catch (error) {
      console.error(error);
      return { ok: false };
    }
  }, [reload]);

  const items = loaded?.ok ? loaded.items : [];
  // A session deleted elsewhere drops out of the selection.
  const selected = picked.filter((id) => items.some((item) => item.session.id === id));
  const full = selected.length >= MAX_COMPARE;

  function toggle(id: string, on: boolean) {
    setPicked(() => (on ? [...selected.filter((s) => s !== id), id].slice(0, MAX_COMPARE) : selected.filter((s) => s !== id)));
  }

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
  } else if (loaded.items.length === 0) {
    body = (
      <EmptyState
        icon={FlaskConicalIcon}
        title={M.listEmptyTitle}
        description={M.listEmptyDescription}
        action={
          <Button asChild>
            <Link href="/batches">{M.listEmptyAction}</Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className="grid gap-3">
        <div
          data-testid="compare-bar"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted p-3"
        >
          <p role="status" aria-live="polite" className="min-w-0 flex-1 basis-40 text-sm font-semibold tabular-nums">
            {M.selectedCount(selected.length, MAX_COMPARE)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={selected.length === 0}
              onClick={() => router.push(compareHref(selected))}
            >
              {M.compareButton}
            </Button>
            <Button type="button" variant="outline" disabled={selected.length === 0} onClick={() => setPicked([])}>
              {M.clearSelection}
            </Button>
          </div>
          {full ? <p className="basis-full text-sm text-text-secondary">{M.selectionFull(MAX_COMPARE)}</p> : null}
        </div>
        <ul className="flex flex-col gap-3" aria-label={M.listGroupLabel}>
          {loaded.items.map((item) => {
            const id = item.session.id;
            const checked = selected.includes(id);
            return (
              <BurnRow
                key={id}
                item={item}
                checked={checked}
                disabled={full && !checked}
                onToggle={(on) => toggle(id, on)}
              />
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={M.listTitle} description={M.listDescription} />
      {body}
    </>
  );
}

function BurnRow({
  item,
  checked,
  disabled,
  onToggle,
}: {
  item: BurnSessionListItem;
  checked: boolean;
  disabled: boolean;
  onToggle: (on: boolean) => void;
}) {
  const { session, batch, formula, version, photoCount } = item;
  const title = sessionTitle(session);
  const checkboxId = `pick-${session.id}`;
  return (
    <li
      data-testid="burn-row"
      className="flex items-start gap-1 rounded-lg border border-border bg-card p-1 pr-3 hover:bg-muted"
    >
      <label
        htmlFor={checkboxId}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="size-5 accent-primary"
        />
        <span className="sr-only">{M.selectLabel(title)}</span>
      </label>
      <div className="min-w-0 flex-1 py-0.5">
        <Link
          href={`/burn-tests/${session.id}`}
          className="flex min-h-11 flex-wrap items-center gap-x-2 text-base font-semibold break-words text-foreground underline-offset-4 hover:underline"
        >
          <span className="min-w-0 wrap-anywhere">{title}</span>
        </Link>
        <p className="text-sm text-text-secondary">
          <time dateTime={session.testedOn}>{formatProducedOn(session.testedOn)}</time>
          {M.separator}
          <span className="wrap-anywhere">{batchName(batch)}</span>
        </p>
        <p className="text-sm text-text-secondary">
          <span className="wrap-anywhere">
            {formula.name}
            {M.separator}
            {M.versionText(version.number)}
          </span>
          {formula.archivedAt !== null ? <ArchivedBadge /> : null}
        </p>
        <p className="text-sm text-text-secondary">
          {M.candleCount(session.candles.length)}
          {M.separator}
          {M.photoCount(photoCount)}
        </p>
      </div>
    </li>
  );
}
