"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardListIcon, SearchXIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  EMPTY_BATCH_QUERY,
  filterBatches,
  isEmptyBatchQuery,
  parseBatchQuery,
  serializeBatchQuery,
} from "@/lib/batchtrace";
import type { BatchQuery } from "@/lib/batchtrace";
import { getDataLayer } from "@/lib/db";
import type { BatchTraceData, BatchTraceItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { ArchivedBadge } from "./archived-badge";
import { BatchFilters } from "./batch-filters";
import { downloadBatchCsv } from "./export-csv";
import { batchTitle, formatProducedOn, weighedStatus } from "./text";

const B = MESSAGES.batches;
const T = MESSAGES.batchTrace;

/** How long typing in the search box waits before it writes the URL. */
const SEARCH_DEBOUNCE_MS = 300;

type Loaded = { ok: true; data: BatchTraceData } | { ok: false };

/**
 * The Batches list (`/batches`): search, filters and CSV export. The URL holds
 * the query (`?q=...&lot=...`), so reload and Back restore the same view; the
 * only state kept here is the search text while it is being typed.
 */
export function BatchList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const query = useMemo(() => parseBatchQuery(new URLSearchParams(queryString)), [queryString]);

  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, data: await getDataLayer().batchTrace.read() };
    } catch {
      return { ok: false };
    }
  }, [reload]);

  const [searchText, setSearchText] = useState(query.q);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The q this component last wrote, so the URL change it causes does not reset the box mid-typing.
  const written = useRef<string | null>(null);
  const [exportFailed, setExportFailed] = useState(false);

  function writeQuery(next: BatchQuery) {
    const qs = serializeBatchQuery(next);
    router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
  }

  function cancelTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  function writeSearch(text: string) {
    cancelTimer();
    const q = text.trim();
    written.current = q;
    writeQuery({ ...queryRef.current, q });
  }

  // Back, Forward or a link changed the URL: show its search text.
  useEffect(() => {
    if (written.current === query.q) {
      written.current = null;
      return;
    }
    setSearchText((prev) => (prev.trim() === query.q ? prev : query.q));
  }, [query.q]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  function onSearchText(text: string) {
    setSearchText(text);
    cancelTimer();
    timer.current = setTimeout(() => writeSearch(text), SEARCH_DEBOUNCE_MS);
  }

  function onFilterChange(next: BatchQuery) {
    // A filter change carries the text typed so far, so nothing typed is lost.
    cancelTimer();
    const q = searchText.trim();
    written.current = q;
    writeQuery({ ...next, q });
  }

  function clearFilters() {
    cancelTimer();
    setSearchText("");
    written.current = "";
    writeQuery(EMPTY_BATCH_QUERY);
  }

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
  } else if (loaded.data.items.length === 0) {
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
      <Results
        data={loaded.data}
        query={query}
        searchText={searchText}
        onSearchText={onSearchText}
        onSearchEnter={() => writeSearch(searchText)}
        onChange={onFilterChange}
        onClear={clearFilters}
        exportFailed={exportFailed}
        onExport={(items) => {
          setExportFailed(false);
          try {
            downloadBatchCsv(items);
          } catch {
            setExportFailed(true);
          }
        }}
      />
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

function Results({
  data,
  query,
  searchText,
  onSearchText,
  onSearchEnter,
  onChange,
  onClear,
  exportFailed,
  onExport,
}: {
  data: BatchTraceData;
  query: BatchQuery;
  searchText: string;
  onSearchText: (text: string) => void;
  onSearchEnter: () => void;
  onChange: (next: BatchQuery) => void;
  onClear: () => void;
  exportFailed: boolean;
  onExport: (items: readonly BatchTraceItem[]) => void;
}) {
  const filtered = useMemo(() => filterBatches(data.items, query), [data.items, query]);
  const showClear = !isEmptyBatchQuery(query);

  return (
    <>
      <BatchFilters
        data={data}
        query={query}
        searchText={searchText}
        onSearchText={onSearchText}
        onSearchEnter={onSearchEnter}
        onChange={onChange}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p role="status" className="text-sm text-text-secondary">
            {T.count(filtered.length, data.items.length)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {showClear ? (
              <Button
                type="button"
                variant="outline"
                className="pointer-coarse:min-h-11"
                onClick={onClear}
              >
                {T.clearFilters}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:min-h-11"
              disabled={filtered.length === 0}
              onClick={() => onExport(filtered)}
            >
              {T.exportCsv}
            </Button>
          </div>
        </div>
        {exportFailed ? <Notice variant="error">{T.exportFailed}</Notice> : null}
      </BatchFilters>
      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchXIcon}
          title={T.noMatchTitle}
          description={T.noMatchDescription}
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label={B.title}>
          {filtered.map((item) => (
            <BatchRow key={item.batch.id} item={item} />
          ))}
        </ul>
      )}
    </>
  );
}

/** The title is a real link stretched over the whole card (the tap target). */
function BatchRow({ item }: { item: BatchTraceItem }) {
  const { batch, formula, version } = item;
  const codes = [...new Set(item.lots.map((l) => l.link.lotCode))];
  return (
    <li
      data-testid="batch-row"
      className="relative rounded-lg border border-border bg-card p-3 hover:bg-muted has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring sm:px-4"
    >
      <Link
        href={`/batches/${batch.id}`}
        className="flex min-h-11 items-center text-base font-semibold break-words text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
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
      {codes.length > 0 ? (
        <p className="truncate text-sm text-text-secondary">{B.rowLots(codes.join(", "))}</p>
      ) : null}
    </li>
  );
}
