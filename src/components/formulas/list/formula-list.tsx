"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArchiveIcon, FlaskConicalIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDataLayer } from "@/lib/db";
import type { FormulaListItem, MetaState } from "@/lib/db";
import { formatGrams, formatRequestedPercent } from "@/lib/gramguard";
import { MESSAGES, basisWords } from "@/lib/messages";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const L = MESSAGES.list;

type View = "active" | "archived";

type Loaded =
  | { ok: true; items: FormulaListItem[]; meta: MetaState; now: number }
  | { ok: false };

const VIEWS: { value: View; label: string }[] = [
  { value: "active", label: L.showActive },
  { value: "archived", label: L.showArchived },
];

/** "8% of wax weight"; an unscented formula is just "0%". */
function fragranceText(item: FormulaListItem): string {
  const { fragranceBp, basis } = item.latestVersion.inputs;
  const pct = `${formatRequestedPercent(fragranceBp)}%`;
  return fragranceBp === 0 ? pct : `${pct} ${basisWords(basis)}`;
}

function totalText(item: FormulaListItem): string {
  const v = item.latestVersion;
  return formatGrams(v.targets.totalMg, v.inputs.precisionMg);
}

/** The saved formulas list (F2): last-backup line, search, Active/Archived, rows or cards. */
export function FormulaList() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("active");
  const [reload, setReload] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // One query for the whole page: every formula with its latest version, plus meta.
  // The clock is read here, with the data, not during render: under Cache
  // Components a render-time Date.now() would be evaluated in the prerender.
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const [items, meta] = await Promise.all([layer.formulas.list(), layer.meta.get()]);
      return { ok: true, items, meta, now: Date.now() };
    } catch {
      return { ok: false };
    }
  }, [reload]);

  const items = loaded?.ok ? loaded.items : undefined;
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!items) return [];
    const wantArchived = view === "archived";
    return items.filter(
      ({ formula }) =>
        (formula.archivedAt !== null) === wantArchived &&
        (needle === "" || formula.name.toLowerCase().includes(needle)),
    );
  }, [items, view, needle]);

  const newFormula = (
    <Button asChild>
      <Link href="/formulas/new">
        <PlusIcon aria-hidden="true" strokeWidth={1.75} />
        {L.newFormula}
      </Link>
    </Button>
  );

  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }

  let body;
  if (loaded === undefined) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {L.loading}
      </p>
    );
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        title={L.loadFailedTitle}
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {L.retry}
          </Button>
        }
      >
        {L.loadFailed}
      </Notice>
    );
  } else if (loaded.items.length === 0) {
    body = (
      <EmptyState
        icon={FlaskConicalIcon}
        title={L.empty.title}
        description={L.empty.description}
        action={
          <Button asChild>
            <Link href="/formulas/new">{L.newFormula}</Link>
          </Button>
        }
        secondaryAction={
          <Button asChild variant="link" className="px-0">
            <Link href="/formulas/new?example=1">{L.startFromExample}</Link>
          </Button>
        }
      />
    );
  } else {
    let results;
    if (visible.length > 0) {
      results = <FormulaTable items={visible} now={loaded.now} />;
    } else if (needle !== "") {
      results = (
        <div className="py-8">
          <p className="text-sm text-text-secondary">{L.noMatch(query.trim())}</p>
          <Button variant="outline" className="mt-3" onClick={clearSearch}>
            {L.clearSearch}
          </Button>
        </div>
      );
    } else if (view === "archived") {
      results = (
        <EmptyState
          icon={ArchiveIcon}
          title={L.noArchived.title}
          description={L.noArchived.description}
          action={
            <Button variant="outline" onClick={() => setView("active")}>
              {L.archivedNone}
            </Button>
          }
        />
      );
    } else {
      results = (
        <EmptyState
          icon={ArchiveIcon}
          title={L.allArchived.title}
          action={
            <Button variant="outline" onClick={() => setView("archived")}>
              {L.allArchived.action}
            </Button>
          }
        />
      );
    }

    const backupText = loaded.meta.lastBackupAt
      ? L.lastBackupNudge(formatRelativeTime(loaded.meta.lastBackupAt, loaded.now))
      : L.neverBackedUp;

    body = (
      <>
        <p className="-mt-3 mb-5 text-sm text-text-secondary">
          <Link
            href="/backup"
            className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:text-foreground hover:underline sm:min-h-0"
          >
            {backupText}
          </Link>
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 basis-64 sm:max-w-xs sm:flex-1">
            <label htmlFor="formula-search" className="sr-only">
              {L.searchLabel}
            </label>
            <Input
              id="formula-search"
              ref={searchRef}
              type="search"
              value={query}
              placeholder={L.searchLabel}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <SegmentedControl
            label={L.showLabel}
            options={VIEWS}
            value={view}
            onChange={setView}
          />
        </div>
        <div aria-live="polite">{results}</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={L.title} action={newFormula} />
      {body}
    </>
  );
}

const GRID =
  "sm:grid sm:grid-cols-[minmax(0,2.5fr)_4.5rem_minmax(0,2fr)_6.5rem_5.5rem] sm:items-center sm:gap-x-4";

/** One structure for both layouts: a table from 640px, labelled cards below it. */
function FormulaTable({ items, now }: { items: FormulaListItem[]; now: number }) {
  const head = "text-sm font-semibold text-text-secondary";
  return (
    <div
      role="table"
      className="sm:overflow-hidden sm:rounded-lg sm:border sm:border-border sm:bg-card"
    >
      <div role="rowgroup" className="max-sm:sr-only sm:bg-muted">
        <div role="row" className={cn(GRID, "px-4 py-2")}>
          <span role="columnheader" className={head}>{L.columnName}</span>
          <span role="columnheader" className={head}>{L.columnVersion}</span>
          <span role="columnheader" className={head}>{L.columnFragrance}</span>
          <span role="columnheader" className={cn(head, "text-right")}>{L.columnTotal}</span>
          <span role="columnheader" className={cn(head, "text-right")}>{L.columnUpdated}</span>
        </div>
      </div>
      <div role="rowgroup" className="flex flex-col gap-3 sm:block">
        {items.map((item) => (
          <FormulaRow key={item.formula.id} item={item} now={now} />
        ))}
      </div>
    </div>
  );
}

/** The name is a real link stretched over the whole row or card (the tap target). */
function FormulaRow({ item, now }: { item: FormulaListItem; now: number }) {
  const { formula } = item;
  const archived = formula.archivedAt !== null;
  const updated = formatRelativeTime(formula.updatedAt, now);
  const full = new Date(formula.updatedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const total = totalText(item);
  return (
    <div
      role="row"
      data-testid="formula-row"
      className={cn(
        "relative grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-lg border border-border bg-card p-3 hover:bg-muted",
        "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring",
        "sm:rounded-none sm:border-0 sm:border-t sm:bg-transparent sm:px-4 sm:py-0 sm:first:border-t-0",
        GRID,
        archived && "text-text-secondary",
      )}
    >
      <span role="cell" className="min-w-0 sm:py-1">
        <Link
          href={`/formulas/${formula.id}`}
          className="flex min-h-11 items-center text-base font-semibold break-words text-foreground underline-offset-4 outline-none after:absolute after:inset-0 hover:underline"
        >
          {formula.name}
        </Link>
      </span>
      <span
        role="cell"
        className="col-start-2 row-start-1 self-center text-sm text-text-secondary tabular-nums sm:col-auto sm:row-auto"
      >
        {`v${formula.latestVersionNumber}`}
      </span>
      <span role="cell" className="col-span-2 text-sm text-text-secondary sm:col-auto sm:py-3">
        {fragranceText(item)}
      </span>
      <span role="cell" className="col-span-2 text-sm text-text-secondary tabular-nums sm:hidden">
        {`${L.totalLabel} ${total} · ${updated}`}
      </span>
      <span role="cell" className="text-right text-sm text-foreground tabular-nums max-sm:hidden sm:py-3">
        {total}
      </span>
      <span
        role="cell"
        className="text-right text-sm text-text-secondary tabular-nums max-sm:hidden sm:py-3"
      >
        <time dateTime={formula.updatedAt} title={full}>
          {updated}
        </time>
      </span>
    </div>
  );
}
