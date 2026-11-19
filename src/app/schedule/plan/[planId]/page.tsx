"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { PlanView } from "@/components/schedule";
import { MESSAGES } from "@/lib/messages";

const S = MESSAGES.schedule;

// Same pattern as /batches/[batchId]: params through use() inside Suspense,
// root keyed on bfcacheId. PlanView reads useSearchParams ("?created=1").
function PlanBodyRoute({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const { bfcacheId } = useRouter();
  return <PlanView key={bfcacheId} planId={planId} />;
}

function Loading() {
  return (
    <>
      <PageHeader title={S.planViewTitle} />
      <p role="status" className="text-sm text-text-secondary">
        {S.planLoading}
      </p>
    </>
  );
}

export default function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <PlanBodyRoute params={params} />
    </Suspense>
  );
}
