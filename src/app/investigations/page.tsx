"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { InvestigationList } from "@/components/candlefix/list";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.candleFixCompare;

// The list reads `?archived=1` (useSearchParams), which needs Suspense under Cache Components.
function ListBody() {
  const { bfcacheId } = useRouter();
  return <InvestigationList key={bfcacheId} />;
}

export default function InvestigationsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={M.listTitle} description={M.listDescription} />
          <p role="status" className="text-sm text-text-secondary">
            {M.listLoading}
          </p>
        </>
      }
    >
      <ListBody />
    </Suspense>
  );
}
