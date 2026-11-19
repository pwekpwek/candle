"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClockIcon } from "lucide-react";
import { ArchivedBadge } from "@/components/batches/archived-badge";
import { batchTitle, formatProducedOn } from "@/components/batches/text";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import type { ScheduleData } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { buildSchedule, groupSchedule, todayLocal } from "@/lib/schedule";
import type { ScheduleItem } from "@/lib/schedule";
import { milestoneName } from "./names";
import { StateBadge } from "./state-badge";
import { useToday } from "./use-today";

const S = MESSAGES.schedule;
const B = MESSAGES.batches;

/** At most this many done items are listed, most recent first. */
const DONE_LIMIT = 20;

type Loaded = { ok: true; data: ScheduleData } | { ok: false };

/** The Schedule page (`/schedule`): overdue, due today, upcoming and recently done. */
export function ScheduleView() {
  const today = useToday();
  const [reload, setReload] = useState(0);
  const [failed, setFailed] = useState(false);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, data: await getDataLayer().schedule.read() };
    } catch {
      return { ok: false };
    }
  }, [reload]);

  const groups = useMemo(() => {
    if (loaded === undefined || !loaded.ok || today === null) return null;
    return groupSchedule(buildSchedule(loaded.data, today));
  }, [loaded, today]);

  async function toggle(item: Extract<ScheduleItem, { kind: "milestone" }>) {
    setFailed(false);
    try {
      await getDataLayer().curePlans.setMilestoneDone(
        item.source.batch.id,
        item.milestone.id,
        item.milestone.doneOn === null ? todayLocal() : null,
      );
    } catch {
      setFailed(true);
    }
  }

  let body;
  if (loaded !== undefined && !loaded.ok) {
    body = (
      <Notice
        variant="error"
        title={S.loadFailedTitle}
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {S.tryAgain}
          </Button>
        }
      >
        {S.loadFailed}
      </Notice>
    );
  } else if (groups === null) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {S.loading}
      </p>
    );
  } else {
    const total =
      groups.overdue.length + groups.due.length + groups.upcoming.length + groups.done.length;
    if (total === 0) {
      body = (
        <EmptyState
          icon={CalendarClockIcon}
          title={S.emptyTitle}
          description={S.emptyDescription}
          action={
            <Button asChild>
              <Link href="/batches">{S.emptyBatches}</Link>
            </Button>
          }
          secondaryAction={
            <Button asChild variant="link">
              <Link href="/">{S.emptyFormulas}</Link>
            </Button>
          }
        />
      );
    } else {
      const done = groups.done.slice(0, DONE_LIMIT);
      body = (
        <div className="flex flex-col gap-8">
          {failed ? <Notice variant="error">{S.rowFailed}</Notice> : null}
          <Group title={S.groupOverdue} items={groups.overdue} onToggle={toggle} />
          <Group title={S.groupDue} items={groups.due} onToggle={toggle} />
          <Group title={S.groupUpcoming} items={groups.upcoming} onToggle={toggle} />
          <Group
            title={S.groupDone}
            items={done}
            onToggle={toggle}
            note={groups.done.length > DONE_LIMIT ? S.doneLimited(DONE_LIMIT) : undefined}
          />
        </div>
      );
    }
  }

  return (
    <>
      <PageHeader title={S.title} description={S.description} />
      {body}
    </>
  );
}

function Group({
  title,
  items,
  note,
  onToggle,
}: {
  title: string;
  items: ScheduleItem[];
  note?: string;
  onToggle: (item: Extract<ScheduleItem, { kind: "milestone" }>) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <ul className="border-b border-border">
        {items.map((item) => (
          <Row key={item.key} item={item} onToggle={onToggle} />
        ))}
      </ul>
      {note ? <p className="mt-2 text-sm text-text-secondary">{note}</p> : null}
    </section>
  );
}

function Row({
  item,
  onToggle,
}: {
  item: ScheduleItem;
  onToggle: (item: Extract<ScheduleItem, { kind: "milestone" }>) => void;
}) {
  const done = item.state === "done";
  const dateText = done ? null : formatProducedOn(item.dueOn);

  let title: React.ReactNode;
  let context: React.ReactNode;
  /** The batch link, on its own line so it can be a 44px tap target without breaking the text. */
  let batchLink: React.ReactNode = null;
  let action: React.ReactNode = null;

  if (item.kind === "milestone") {
    const { batch, formula, version } = item.source;
    const name = milestoneName(item.milestone);
    title = <span className="font-semibold wrap-anywhere">{name}</span>;
    batchLink = (
      <Link
        href={`/batches/${batch.id}`}
        className="flex min-h-11 w-fit max-w-full items-center text-sm font-semibold wrap-anywhere text-foreground underline-offset-4 hover:underline"
      >
        {batchTitle(batch)}
      </Link>
    );
    context = (
      <>
        {S.versionOf(formula.name, version.number)}
        {formula.archivedAt !== null ? <ArchivedBadge /> : null}
      </>
    );
    action = (
      <Button
        variant="outline"
        size="sm"
        className="pointer-coarse:min-h-11"
        aria-label={done ? S.markNotDoneFor(name) : S.markDoneFor(name)}
        onClick={() => onToggle(item)}
      >
        {done ? S.markNotDone : S.markDone}
      </Button>
    );
  } else {
    const { plan, formula, version } = item.source;
    title = (
      <Link
        href={`/schedule/plan/${plan.id}`}
        className="inline-flex min-h-11 items-center font-semibold underline-offset-4 wrap-anywhere hover:underline"
      >
        {S.productionTitle}
      </Link>
    );
    context = (
      <>
        {plan.label?.trim() ? `${plan.label.trim()}${B.separator}` : ""}
        {S.versionOf(formula.name, version.number)}
        {formula.archivedAt !== null ? <ArchivedBadge /> : null}
      </>
    );
  }

  return (
    <li
      data-testid="schedule-row"
      data-state={item.state}
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border py-2"
    >
      <div className="min-w-0 flex-1 basis-56">
        <p>{title}</p>
        {batchLink}
        <p className="mt-0.5 text-sm text-text-secondary wrap-anywhere">{context}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
          {dateText !== null ? (
            <span>
              {item.kind === "production" ? S.productionDate(dateText) : S.dueOn(dateText)}
            </span>
          ) : null}
          <StateBadge state={item.state} doneOn={item.doneOn} />
        </p>
      </div>
      {action}
    </li>
  );
}
