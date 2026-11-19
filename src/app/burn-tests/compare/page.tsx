"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CompareView } from "@/components/burn/compare";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.burnCompare;

// `?sessions=a,b,c` needs useSearchParams inside Suspense (Cache Components).
// Keyed on `bfcacheId` so every navigation starts fresh.
function CompareBody() {
  const params = useSearchParams();
  const { bfcacheId } = useRouter();
  return <CompareView key={`${bfcacheId}:${params.get("sessions") ?? ""}`} sessionsParam={params.get("sessions")} />;
}

export default function CompareBurnTestsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={M.compareTitle} description={M.compareDescription} />
          <p role="status" className="text-sm text-text-secondary">
            {M.compareLoading}
          </p>
        </>
      }
    >
      <CompareBody />
    </Suspense>
  );
}
