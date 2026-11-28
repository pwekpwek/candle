"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { InvestigationView } from "@/components/candlefix/investigation";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.candleFix;

// Same pattern as /burn-tests/[sessionId]: params are read with use() inside
// Suspense, and the root is keyed on bfcacheId so notices never linger.
// InvestigationView reads useSearchParams ("?saved=1"), which also needs Suspense.
function InvestigationBody({ params }: { params: Promise<{ investigationId: string }> }) {
  const { investigationId } = use(params);
  const { bfcacheId } = useRouter();
  return <InvestigationView key={bfcacheId} investigationId={investigationId} />;
}

function Loading() {
  return (
    <>
      <PageHeader title={M.pageLoadingTitle} />
      <p role="status" className="text-sm text-text-secondary">
        {M.pageLoading}
      </p>
    </>
  );
}

export default function InvestigationPage({
  params,
}: {
  params: Promise<{ investigationId: string }>;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <InvestigationBody params={params} />
    </Suspense>
  );
}
