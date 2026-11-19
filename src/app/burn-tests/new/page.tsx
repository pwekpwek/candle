"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SessionEditor } from "@/components/burn/session";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.burn;

// `?batch=<batchId>` names the batch. Reading it needs useSearchParams inside a
// Suspense boundary (Cache Components). Keyed on `bfcacheId` so every new
// navigation gets a fresh form (see ../../batches/new/page.tsx).
function NewBody() {
  const params = useSearchParams();
  const { bfcacheId } = useRouter();
  return <SessionEditor key={bfcacheId} mode="new" batchId={params.get("batch") ?? ""} />;
}

export default function NewBurnTestPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={M.newTitle} />
          <p role="status" className="text-sm text-text-secondary">
            {M.editorLoading}
          </p>
        </>
      }
    >
      <NewBody />
    </Suspense>
  );
}
