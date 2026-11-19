"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { formatProducedOn } from "@/components/batches/text";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { cureEndOf, milestoneDueOn, todayLocal, viewMilestones } from "@/lib/schedule";
import type { MilestoneView } from "@/lib/schedule";
import type { CurePlan } from "@/lib/types";
import { milestoneName } from "./names";
import { StateBadge } from "./state-badge";
import { useToday } from "./use-today";

const S = MESSAGES.schedule;

type Loaded = { ok: true; plan: CurePlan | undefined } | { ok: false };

/**
 * The Curing section on the batch page. Due dates are computed from the
 * batch's production date, which the page passes in live, so editing and
 * saving the date moves every open milestone at once.
 */
export function CuringSection({
  batchId,
  producedOn,
  className,
}: {
  batchId: string;
  producedOn: string;
  className?: string;
}) {
  const headingId = useId();
  const today = useToday();
  const [reload, setReload] = useState(0);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, plan: await getDataLayer().curePlans.get(batchId) };
    } catch {
      return { ok: false };
    }
  }, [batchId, reload]);

  const editHref = `/batches/${batchId}/cure-plan`;

  async function toggle(view: MilestoneView) {
    setFailed(false);
    try {
      await getDataLayer().curePlans.setMilestoneDone(
        batchId,
        view.milestone.id,
        view.milestone.doneOn === null ? todayLocal() : null,
      );
    } catch {
      setFailed(true);
    }
  }

  let body;
  let actions = null;
  if (loaded === undefined) {
    body = null;
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {S.tryAgain}
          </Button>
        }
      >
        {S.curingLoadFailed}
      </Notice>
    );
  } else if (loaded.plan === undefined) {
    body = (
      <>
        <p className="mb-3 max-w-[60ch] text-sm text-text-secondary">{S.curingEmpty}</p>
        <Button asChild variant="outline" className="pointer-coarse:min-h-11">
          <Link href={editHref}>{S.addCurePlan}</Link>
        </Button>
      </>
    );
  } else {
    const plan: CurePlan = loaded.plan;
    const cureEnd = cureEndOf(plan);
    const views = today === null ? null : viewMilestones(plan, producedOn, today);
    actions = (
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
          <Link href={editHref}>{S.editCurePlan}</Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="pointer-coarse:min-h-11"
          onClick={() => setRemoving(true)}
        >
          {S.removeCurePlan}
        </Button>
      </div>
    );
    body = (
      <>
        <p className="mb-3 text-sm">
          {cureEnd ? (
            <>
              {S.cureTime(cureEnd.offsetDays)}
              <span className="text-text-secondary">
                {" · "}
                {S.plannedCureEnd(formatProducedOn(milestoneDueOn(producedOn, cureEnd.offsetDays)))}
              </span>
            </>
          ) : (
            <span className="text-text-secondary">{S.noCureTime}</span>
          )}
        </p>
        {failed ? (
          <Notice variant="error" className="mb-3">
            {S.markFailed}
          </Notice>
        ) : null}
        {views === null ? null : (
          <ul aria-label={S.curingDatesLabel} className="border-b border-border">
            {views.map((view) => (
              <MilestoneRow key={view.milestone.id} view={view} onToggle={() => void toggle(view)} />
            ))}
          </ul>
        )}
        <RemoveDialog
          batchId={batchId}
          milestones={plan.milestones.length}
          open={removing}
          onOpenChange={setRemoving}
        />
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={headingId} className="text-lg font-semibold">
          {S.curingHeading}
        </h2>
        {actions}
      </div>
      {body}
    </section>
  );
}

function MilestoneRow({ view, onToggle }: { view: MilestoneView; onToggle: () => void }) {
  const { milestone } = view;
  const name = milestoneName(milestone);
  const done = milestone.doneOn !== null;
  return (
    <li
      data-testid="milestone-row"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border py-2"
    >
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-semibold wrap-anywhere">{name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
          {done ? null : <span>{S.dueOn(formatProducedOn(view.dueOn))}</span>}
          <StateBadge state={view.state} doneOn={milestone.doneOn} />
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="pointer-coarse:min-h-11"
        aria-label={done ? S.markNotDoneFor(name) : S.markDoneFor(name)}
        onClick={onToggle}
      >
        {done ? S.markNotDone : S.markDone}
      </Button>
    </li>
  );
}

function RemoveDialog({
  batchId,
  milestones,
  open,
  onOpenChange,
}: {
  batchId: string;
  milestones: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);

  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await getDataLayer().curePlans.delete(batchId);
      onOpenChange(false);
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setFailed(false);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{S.removeTitle}</DialogTitle>
          <DialogDescription className="sr-only">{S.removeTitle}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {failed ? <Notice variant="error">{S.removeFailed}</Notice> : null}
          <p className="text-sm text-foreground">{S.removeBody(milestones)}</p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {S.removeKeep}
            </Button>
            <Button type="button" variant="destructive" busy={busy} onClick={confirm}>
              {S.removeConfirm}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
