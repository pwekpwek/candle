"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ReportView } from "@/components/burn/report";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.burnCompare;

// Same pattern as /batches/[batchId]: params are read with use() inside Suspense.
function ReportBody({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { bfcacheId } = useRouter();
  return <ReportView key={`${bfcacheId}:${sessionId}`} sessionId={sessionId} />;
}

export default function SessionReportPage({ params }: PageProps<"/burn-tests/[sessionId]/report">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={M.reportSessionTitle} />
          <p role="status" className="text-sm text-text-secondary">
            {M.reportLoading}
          </p>
        </>
      }
    >
      <ReportBody params={params} />
    </Suspense>
  );
}
