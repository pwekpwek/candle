"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import type { ProductionPlanInput } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { Formula, FormulaVersion } from "@/lib/types";
import { ProductionPlanForm } from "./plan-form";
import { PlanSource } from "./plan-source";

const S = MESSAGES.schedule;
const B = MESSAGES.batches;

type Loaded =
  | { status: "ok"; formula: Formula; version: FormulaVersion }
  | { status: "missing" }
  | { status: "error" };

/** Plan production (`/schedule/plan/new?version=<versionId>`): the source, then the form. */
export function CreatePlan({ versionId }: { versionId: string | null }) {
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
        <PageHeader title={S.planCreateTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {S.planLoading}
        </p>
      </>
    );
  }
  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={S.planCreateTitle} />
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
        <p className="max-w-[44ch] text-sm text-text-secondary">{S.planSourceNotFoundBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/">{B.backToFormulas}</Link>
          </Button>
        </div>
      </>
    );
  }
  return <CreateForm formula={loaded.formula} version={loaded.version} />;
}

function CreateForm({ formula, version }: { formula: Formula; version: FormulaVersion }) {
  const router = useRouter();
  // Chosen once and reused on every retry: the create is idempotent.
  const [planId] = useState(() => crypto.randomUUID());

  async function create(input: ProductionPlanInput) {
    const { plan } = await getDataLayer().productionPlans.create({
      ...input,
      planId,
      versionId: version.id,
    });
    router.replace(`/schedule/plan/${plan.id}?created=1`);
  }

  return (
    <>
      <PageHeader title={S.planCreateTitle} description={S.planCreateDescription} />
      <PlanSource formula={formula} version={version} />
      <ProductionPlanForm
        submitLabel={S.planSave}
        busyLabel={S.planSaving}
        failureText={S.planCreateFailed}
        onSubmit={create}
      />
    </>
  );
}
