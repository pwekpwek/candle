"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { CompareView } from "@/components/candlefix/compare";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.candleFixCompare;

// params through use() inside Suspense; root keyed on bfcacheId, as the burn-test routes.
function CompareBody({ params }: { params: Promise<{ investigationId: string }> }) {
  const { investigationId } = use(params);
  const { bfcacheId } = useRouter();
  return <CompareView key={bfcacheId} investigationId={investigationId} />;
}

export default function BeforeAfterPage({ params }: { params: Promise<{ investigationId: string }> }) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={M.title} />
          <p role="status" className="text-sm text-text-secondary">
            {M.loading}
          </p>
        </>
      }
    >
      <CompareBody params={params} />
    </Suspense>
  );
}
