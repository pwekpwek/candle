"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
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
import { CuringSection } from "@/components/schedule/curing-section";
import { getDataLayer } from "@/lib/db";
import type { BatchInput, BatchListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { ArchivedBadge } from "./archived-badge";
import { BatchForm } from "./batch-form";
import { batchTitle, formatProducedOn, versionHref } from "./text";

const B = MESSAGES.batches;
const F = MESSAGES.formula;
const S = MESSAGES.schedule;

type Loaded =
  | { status: "ok"; item: BatchListItem; latestNumber: number }
  | { status: "missing" }
  | { status: "error" };

/** The batch page (`/batches/[batchId]`): source, editable form, delete. */
export function BatchDetail({ batchId }: { batchId: string }) {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const item = await layer.batches.get(batchId);
      if (!item) return { status: "missing" };
      const versions = await layer.versions.listByFormula(item.formula.id);
      const latestNumber = versions[0]?.number ?? item.formula.latestVersionNumber;
      return { status: "ok", item, latestNumber };
    } catch {
      return { status: "error" };
    }
  }, [batchId, reload]);
  // Set once the batch is deleted, so the page does not flash "not found" before it leaves.
  const [deleted, setDeleted] = useState(false);

  if (loaded === undefined || deleted) {
    return (
      <>
        <PageHeader title={B.loadingTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {deleted ? "" : B.detailLoading}
        </p>
      </>
    );
  }

  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={B.loadingTitle} />
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
        <PageHeader title={B.notFoundTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{B.notFoundBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/batches">{B.backToBatches}</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <DetailBody
      item={loaded.item}
      latestNumber={loaded.latestNumber}
      onDeleted={() => setDeleted(true)}
    />
  );
}

function DetailBody({
  item,
  latestNumber,
  onDeleted,
}: {
  item: BatchListItem;
  latestNumber: number;
  onDeleted: () => void;
}) {
  const { batch, formula, version } = item;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const here = `/batches/${batch.id}`;

  // "?created=1" shows the confirmation once, then leaves the URL clean.
  const [createdNotice] = useState(() => searchParams.get("created") === "1");
  // "?cureSaved=1" (from the cure-plan editor) works the same way.
  const [cureSavedNotice] = useState(() => searchParams.get("cureSaved") === "1");
  const hasParam = searchParams.get("created") !== null || searchParams.get("cureSaved") !== null;
  useEffect(() => {
    if (hasParam) router.replace(here);
  }, [hasParam, router, here]);

  async function save(input: BatchInput) {
    await getDataLayer().batches.update(batch.id, input);
  }

  return (
    <>
      <PageHeader
        title={batchTitle(batch)}
        description={
          <>
            {B.madeFrom}{" "}
            <Link
              href={`/formulas/${formula.id}`}
              className="underline-offset-4 hover:underline"
            >
              {formula.name}
            </Link>
            {B.separator}
            <Link
              href={versionHref(formula.id, version.id)}
              className="underline-offset-4 hover:underline"
            >
              {B.versionText(version.number)}
            </Link>
            {formula.archivedAt !== null ? <ArchivedBadge /> : null}
            {B.separator}
            <time dateTime={batch.producedOn}>{formatProducedOn(batch.producedOn)}</time>
          </>
        }
        action={
          <Button variant="outline" onClick={() => setConfirming(true)}>
            {B.deleteBatch}
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {createdNotice ? <Notice variant="success">{B.createdNotice}</Notice> : null}
        {cureSavedNotice ? <Notice variant="success">{S.cureSavedNotice}</Notice> : null}
        {version.number !== latestNumber ? (
          <Notice
            variant="info"
            action={
              <Button asChild variant="link" size="sm">
                <Link href={`/formulas/${formula.id}`}>{F.openLatest}</Link>
              </Button>
            }
          >
            {B.notLatestNotice(version.number, latestNumber)}
          </Notice>
        ) : null}
      </div>

      <BatchForm
        key={batch.id}
        version={version}
        initial={{
          producedOn: batch.producedOn,
          label: batch.label,
          notes: batch.notes,
          entries: batch.entries,
        }}
        submitLabel={B.saveChanges}
        busyLabel={B.savingChanges}
        failureText={B.saveFailed}
        successText={B.changesSaved}
        showBlend
        onSubmit={save}
      />

      <CuringSection batchId={batch.id} producedOn={batch.producedOn} className="mt-8" />

      <DeleteBatchDialog
        title={batchTitle(batch)}
        batchId={batch.id}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => {
          onDeleted();
          router.replace("/batches");
        }}
      />
    </>
  );
}

function DeleteBatchDialog({
  title,
  batchId,
  open,
  onOpenChange,
  onDeleted,
}: {
  title: string;
  batchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{B.deleteTitle}</DialogTitle>
          <DialogDescription className="sr-only">{B.deleteTitle}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so what goes with the batch is read fresh each time. */}
        <DeleteBody
          title={title}
          batchId={batchId}
          onCancel={() => onOpenChange(false)}
          onDeleted={onDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}

type Impact =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; milestones: number; productionPlans: number };

function DeleteBody({
  title,
  batchId,
  onCancel,
  onDeleted,
}: {
  title: string;
  batchId: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // What else goes with the batch (CurePilot). "failed" still allows the delete: the base text stands.
  const [impact, setImpact] = useState<Impact>({ state: "loading" });
  const submitting = useRef(false);

  useEffect(() => {
    let live = true;
    getDataLayer()
      .batches.deletionImpact(batchId)
      .then((counts) => {
        if (live) setImpact({ state: "ready", ...counts });
      })
      .catch(() => {
        if (live) setImpact({ state: "failed" });
      });
    return () => {
      live = false;
    };
  }, [batchId]);

  async function confirm() {
    if (submitting.current || impact.state === "loading") return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await getDataLayer().batches.delete(batchId);
      onDeleted();
    } catch {
      setFailed(true);
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {failed ? <Notice variant="error">{B.deleteFailed}</Notice> : null}
      <p className="text-sm text-foreground">{B.deleteBody(title)}</p>
      {impact.state === "loading" ? (
        <p role="status" className="text-sm text-text-secondary">
          {B.deleteChecking}
        </p>
      ) : null}
      {impact.state === "ready" && impact.milestones > 0 ? (
        <p className="text-sm text-foreground">{B.deleteCureNote(impact.milestones)}</p>
      ) : null}
      {impact.state === "ready" && impact.productionPlans > 0 ? (
        <p className="text-sm text-foreground">{B.deletePlanNote}</p>
      ) : null}
      <DialogFooter>
        {/* First in the tab order, so the keep button takes the opening focus. */}
        <Button type="button" variant="secondary" onClick={onCancel}>
          {B.deleteKeep}
        </Button>
        <Button
          type="button"
          variant="destructive"
          busy={busy}
          disabled={impact.state === "loading"}
          onClick={confirm}
        >
          {B.deleteConfirm}
        </Button>
      </DialogFooter>
    </div>
  );
}
