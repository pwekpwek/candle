"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { CreatePlan } from "@/components/schedule";
import { MESSAGES } from "@/lib/messages";

const S = MESSAGES.schedule;

// `?version=<versionId>` names the source: useSearchParams inside Suspense
// (Cache Components). Keyed on `bfcacheId` so every new visit gets a fresh form.
function NewBody() {
  const params = useSearchParams();
  const { bfcacheId } = useRouter();
  return <CreatePlan key={bfcacheId} versionId={params.get("version")} />;
}

export default function NewPlanPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={S.planCreateTitle} description={S.planCreateDescription} />
          <p className="text-sm text-text-secondary">{S.planLoading}</p>
        </>
      }
    >
      <NewBody />
    </Suspense>
  );
}
