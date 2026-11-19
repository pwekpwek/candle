"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { CurePlanEditor } from "@/components/schedule";
import { MESSAGES } from "@/lib/messages";

const S = MESSAGES.schedule;

// params through use() inside Suspense; root keyed on bfcacheId so a second
// visit never shows the previous draft (page state is kept by React Activity).
function EditorBody({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params);
  const { bfcacheId } = useRouter();
  return <CurePlanEditor key={bfcacheId} batchId={batchId} />;
}

function Loading() {
  return (
    <>
      <PageHeader title={S.editorAddTitle} />
      <p role="status" className="text-sm text-text-secondary">
        {S.editorLoading}
      </p>
    </>
  );
}

export default function CurePlanPage({ params }: { params: Promise<{ batchId: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <EditorBody params={params} />
    </Suspense>
  );
}
