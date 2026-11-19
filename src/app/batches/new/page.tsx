"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreateBatch } from "@/components/batches";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const B = MESSAGES.batches;

// `?version=<versionId>` names the source, `?plan=<planId>` the planned production entry it completes. Reading it needs useSearchParams
// inside a Suspense boundary (Cache Components). Keyed on `bfcacheId` so every
// new navigation gets a fresh form (see ../../formulas/new/page.tsx).
function NewBody() {
  const params = useSearchParams();
  const { bfcacheId } = useRouter();
  return <CreateBatch key={bfcacheId} versionId={params.get("version")} planId={params.get("plan")} />;
}

export default function NewBatchPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={B.createTitle} description={B.createDescription} />
          <p className="text-sm text-text-secondary">{B.detailLoading}</p>
        </>
      }
    >
      <NewBody />
    </Suspense>
  );
}
