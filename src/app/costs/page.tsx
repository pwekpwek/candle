"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { CostList } from "@/components/cost/cost-list";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.cost;

// The list reads `?formula=` and `?batch=` (useSearchParams), which needs Suspense under Cache Components.
function ListBody() {
  const { bfcacheId } = useRouter();
  return <CostList key={bfcacheId} />;
}

export default function CostsPage() {
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
