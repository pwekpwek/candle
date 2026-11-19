"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { SessionEditor } from "@/components/burn/session";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.burn;

// params through use() inside Suspense; root keyed on bfcacheId so a second
// visit never shows the previous form (page state is kept by React Activity).
function EditBody({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { bfcacheId } = useRouter();
  return <SessionEditor key={bfcacheId} mode="edit" sessionId={sessionId} />;
}

function Loading() {
  return (
    <>
      <PageHeader title={M.editTitle} />
      <p role="status" className="text-sm text-text-secondary">
        {M.editorLoading}
      </p>
    </>
  );
}

export default function EditBurnTestPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <EditBody params={params} />
    </Suspense>
  );
}
