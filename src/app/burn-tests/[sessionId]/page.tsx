"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { SessionView } from "@/components/burn/session";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.burn;

// Same pattern as /batches/[batchId]: params are read with use() inside
// Suspense, and the root is keyed on bfcacheId so notices never linger.
// SessionView reads useSearchParams ("?saved=1"), which also needs Suspense.
function SessionBody({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { bfcacheId } = useRouter();
  return <SessionView key={bfcacheId} sessionId={sessionId} />;
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

export default function BurnTestPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <SessionBody params={params} />
    </Suspense>
  );
}
