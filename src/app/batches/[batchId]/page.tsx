"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { BatchDetail } from "@/components/batches";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const B = MESSAGES.batches;

// Same pattern as /formulas/[formulaId]: params are read with use() inside
// Suspense, and the root is keyed on bfcacheId so notices never linger.
// BatchDetail reads useSearchParams ("?created=1"), which also needs Suspense.
function BatchBody({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params);
  const { bfcacheId } = useRouter();
  return <BatchDetail key={bfcacheId} batchId={batchId} />;
}

function Loading() {
  return (
    <>
      <PageHeader title={B.loadingTitle} />
      <p role="status" className="text-sm text-text-secondary">
        {B.detailLoading}
      </p>
    </>
  );
}

export default function BatchPage({ params }: PageProps<"/batches/[batchId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <BatchBody params={params} />
    </Suspense>
  );
}
