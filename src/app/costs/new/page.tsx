"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NewCostSheet } from "@/components/cost/new-sheet";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.cost;

// `?version=<versionId>` or `?batch=<batchId>` names the basis. Reading it needs
// useSearchParams inside Suspense (Cache Components). Keyed on `bfcacheId` so
// every new navigation gets a fresh form.
function NewBody() {
  const params = useSearchParams();
  const { bfcacheId } = useRouter();
  return <NewCostSheet key={bfcacheId} versionId={params.get("version") ?? ""} batchId={params.get("batch") ?? ""} />;
}

export default function NewCostSheetPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={M.newTitle} />
          <p role="status" className="text-sm text-text-secondary">
            {M.newLoading}
          </p>
        </>
      }
    >
      <NewBody />
    </Suspense>
  );
}
