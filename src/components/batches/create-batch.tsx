"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { DataError, getDataLayer } from "@/lib/db";
import type { BatchInput, ProductionPlanListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { Formula, FormulaVersion } from "@/lib/types";
import { formatProducedOn } from "./text";
import { BatchForm } from "./batch-form";
import { SourceSummary } from "./source-summary";

const B = MESSAGES.batches;

type Loaded =
  | { status: "ok"; formula: Formula; version: FormulaVersion }
  | { status: "missing" }
  | { status: "error" };

/** Create batch (`/batches/new?version=<versionId>`): the source, then the form. */
export function CreateBatch({
  versionId,
  planId = null,
}: {
  versionId: string | null;
  /** CurePilot: the planned production entry this batch is made from (`?plan=`). */
  planId?: string | null;
}) {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    if (!versionId) return { status: "missing" };
    try {
      const layer = getDataLayer();
      const version = await layer.versions.get(versionId);
      if (!version) return { status: "missing" };
      const formula = await layer.formulas.get(version.formulaId);
      if (!formula) return { status: "missing" };
      return { status: "ok", formula, version };
    } catch {
      return { status: "error" };
    }
  }, [versionId, reload]);

  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={B.createTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {B.detailLoading}
        </p>
      </>
    );
  }

  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={B.createTitle} />
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
        <PageHeader title={B.sourceNotFoundTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{B.sourceNotFoundBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/">{B.backToFormulas}</Link>
          </Button>
        </div>
      </>
    );
  }

  if (planId !== null) {
    return <PlannedGate formula={loaded.formula} version={loaded.version} planId={planId} />;
  }
  return <CreateForm formula={loaded.formula} version={loaded.version} />;
}

type PlanLoaded =
  | { status: "ok"; item: ProductionPlanListItem }
  | { status: "missing" }
  | { status: "error" };

/**
 * Checks the planned production entry once, when the page opens. It is not a
 * live query on purpose: saving the batch links the entry, and the form must
 * not turn into "already has a batch" before the page has moved on.
 */
function PlannedGate({
  formula,
  version,
  planId,
}: {
  formula: Formula;
  version: FormulaVersion;
  planId: string;
}) {
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<PlanLoaded | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getDataLayer()
      .productionPlans.get(planId)
      .then((item) => {
        if (live) setLoaded(item ? { status: "ok", item } : { status: "missing" });
      })
      .catch(() => {
        if (live) setLoaded({ status: "error" });
      });
    return () => {
      live = false;
    };
  }, [planId, reload]);

  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={B.createTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {B.detailLoading}
        </p>
      </>
    );
  }
  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={B.createTitle} />
        <Notice
          variant="error"
          action={
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              {B.tryAgain}
            </Button>
          }
        >
          {B.planCheckFailed}
        </Notice>
      </>
    );
  }
  if (loaded.status === "missing") {
    return (
      <>
        <PageHeader title={B.createTitle} />
        <Notice variant="warning" title={B.planGoneTitle}>
          {B.planGoneBody}
        </Notice>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          <Button asChild>
            <Link href={`/batches/new?version=${version.id}`}>{B.createButton}</Link>
          </Button>
          <Button asChild variant="link">
            <Link href="/schedule">{MESSAGES.schedule.backToSchedule}</Link>
          </Button>
        </div>
      </>
    );
  }
  const { plan } = loaded.item;
  if (plan.batchId !== null) {
    return (
      <>
        <PageHeader title={B.createTitle} />
        <Notice
          variant="info"
          title={B.planAlreadyTitle}
          action={
            <Button asChild variant="outline">
              <Link href={`/batches/${plan.batchId}`}>{B.planOpenBatch}</Link>
            </Button>
          }
        >
          {B.planAlreadyBody}
        </Notice>
      </>
    );
  }
  if (plan.versionId !== version.id) {
    return (
      <>
        <PageHeader title={B.createTitle} />
        <Notice
          variant="warning"
          title={B.planOtherVersionTitle}
          action={
            <Button asChild variant="outline">
              <Link href={`/schedule/plan/${plan.id}`}>{B.planOpenEntry}</Link>
            </Button>
          }
        >
          {B.planOtherVersionBody}
        </Notice>
      </>
    );
  }
  return (
    <CreateForm
      formula={formula}
      version={version}
      plan={{ id: plan.id, label: plan.label, plannedOn: plan.plannedOn }}
    />
  );
}

function CreateForm({
  formula,
  version,
  plan,
}: {
  formula: Formula;
  version: FormulaVersion;
  plan?: { id: string; label?: string; plannedOn: string };
}) {
  const router = useRouter();
  // Chosen once and reused on every retry: the create is idempotent.
  const [batchId] = useState(() => crypto.randomUUID());
  const [failure, setFailure] = useState<string | null>(null);

  async function create(input: BatchInput) {
    setFailure(null);
    try {
      const { batch } = await getDataLayer().batches.create({
        ...input,
        batchId,
        versionId: version.id,
        ...(plan ? { productionPlanId: plan.id } : {}),
      });
      router.replace(`/batches/${batch.id}?created=1`);
    } catch (error) {
      if (plan && error instanceof DataError && error.code === "invalid") {
        setFailure(B.planCreateInvalid);
      } else if (plan && error instanceof DataError && error.code === "not-found") {
        setFailure(B.planCreateGone);
      }
      throw error;
    }
  }

  return (
    <>
      <PageHeader title={B.createTitle} description={B.createDescription} />
      {plan ? (
        <Notice variant="info" title={B.planNoticeTitle} className="mb-6">
          {B.planNotice(
            plan.label?.trim() ? plan.label.trim() : formula.name,
            formatProducedOn(plan.plannedOn),
          )}
        </Notice>
      ) : null}
      <SourceSummary formula={formula} version={version} />
      <BatchForm
        version={version}
        initial={plan?.label ? { label: plan.label } : undefined}
        submitLabel={B.createButton}
        busyLabel={B.creating}
        failureText={failure ?? B.createFailed}
        onSubmit={create}
      />
    </>
  );
}
