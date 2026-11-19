"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { batchTitle, formatProducedOn } from "@/components/batches/text";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
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
import type { ProductionPlanInput, ProductionPlanListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { ProductionPlanForm } from "./plan-form";
import { PlanSource } from "./plan-source";

const S = MESSAGES.schedule;
const B = MESSAGES.batches;

type Loaded =
  | { status: "ok"; item: ProductionPlanListItem }
  | { status: "missing" }
  | { status: "error" };

/** The planned production entry page (`/schedule/plan/[planId]`): view, edit, delete, Create batch. */
export function PlanView({ planId }: { planId: string }) {
  const [reload, setReload] = useState(0);
  const [deleted, setDeleted] = useState(false);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const item = await getDataLayer().productionPlans.get(planId);
      return item ? { status: "ok", item } : { status: "missing" };
    } catch {
      return { status: "error" };
    }
  }, [planId, reload]);

  if (loaded === undefined || deleted) {
    return (
      <>
        <PageHeader title={S.planViewTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {deleted ? "" : S.planLoading}
        </p>
      </>
    );
  }
  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={S.planViewTitle} />
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
      </>
    );
  }
  if (loaded.status === "missing") {
    return (
      <>
        <PageHeader title={S.planNotFoundTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{S.planNotFoundBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/schedule">{S.backToSchedule}</Link>
          </Button>
        </div>
      </>
    );
  }
  return <PlanBody item={loaded.item} onDeleted={() => setDeleted(true)} />;
}

function PlanBody({ item, onDeleted }: { item: ProductionPlanListItem; onDeleted: () => void }) {
  const { plan, formula, version, batch } = item;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const here = `/schedule/plan/${plan.id}`;

  // "?created=1" shows the confirmation once, then leaves the URL clean.
  const [createdNotice] = useState(() => searchParams.get("created") === "1");
  const hasCreatedParam = searchParams.get("created") !== null;
  useEffect(() => {
    if (hasCreatedParam) router.replace(here);
  }, [hasCreatedParam, router, here]);

  async function save(input: ProductionPlanInput) {
    await getDataLayer().productionPlans.update(plan.id, input);
  }

  const open = plan.batchId === null;
  const title = plan.label?.trim() ? plan.label.trim() : S.planViewTitle;

  return (
    <>
      <PageHeader
        title={title}
        description={
          <>
            {S.productionDate(formatProducedOn(plan.plannedOn))}
          </>
        }
        action={
          <>
            {open ? (
              <Button asChild>
                <Link href={`/batches/new?version=${version.id}&plan=${plan.id}`}>
                  {S.planCreateBatch}
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setConfirming(true)}>
              {S.planDelete}
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {createdNotice ? <Notice variant="success">{S.planSavedNotice}</Notice> : null}
      </div>

      <PlanSource formula={formula} version={version} />

      <p className="mb-6 text-sm">
        {batch ? (
          <>
            {S.planBatchMade}{" "}
            <Link
              href={`/batches/${batch.id}`}
              className="font-semibold underline-offset-4 hover:underline"
            >
              {batchTitle(batch)}
            </Link>
            <span className="text-text-secondary">
              {B.separator}
              {S.planProducedOn(formatProducedOn(batch.producedOn))}
            </span>
          </>
        ) : (
          <span className="text-text-secondary">{S.planOpenLine}</span>
        )}
      </p>

      <ProductionPlanForm
        key={plan.id}
        initial={{ plannedOn: plan.plannedOn, label: plan.label, notes: plan.notes }}
        submitLabel={S.planSaveChanges}
        busyLabel={S.planSavingChanges}
        failureText={S.planSaveFailed}
        successText={S.planChangesSaved}
        onSubmit={save}
      />

      <DeletePlanDialog
        planId={plan.id}
        hasBatch={!open}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => {
          onDeleted();
          router.replace("/schedule");
        }}
      />
    </>
  );
}

function DeletePlanDialog({
  planId,
  hasBatch,
  open,
  onOpenChange,
  onDeleted,
}: {
  planId: string;
  hasBatch: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
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
      await getDataLayer().productionPlans.delete(planId);
      onDeleted();
    } catch {
      setFailed(true);
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
          <DialogTitle>{S.planDeleteTitle}</DialogTitle>
          <DialogDescription className="sr-only">{S.planDeleteTitle}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {failed ? <Notice variant="error">{S.planDeleteFailed}</Notice> : null}
          <p className="text-sm text-foreground">{S.planDeleteBody(hasBatch)}</p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {S.planDeleteKeep}
            </Button>
            <Button type="button" variant="destructive" busy={busy} onClick={confirm}>
              {S.planDeleteConfirm}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
