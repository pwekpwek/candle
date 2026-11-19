"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ReportView } from "@/components/burn/report";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.burnCompare;

function ReportBody() {
  const params = useSearchParams();
  const { bfcacheId } = useRouter();
  return <ReportView key={`${bfcacheId}:${params.get("sessions") ?? ""}`} sessionsParam={params.get("sessions")} />;
}

export default function CompareReportPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={M.reportCompareTitle} />
          <p role="status" className="text-sm text-text-secondary">
            {M.reportLoading}
          </p>
        </>
      }
    >
      <ReportBody />
    </Suspense>
  );
}
