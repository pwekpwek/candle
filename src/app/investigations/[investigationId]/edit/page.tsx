"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { InvestigationEditor } from "@/components/candlefix/investigation";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.candleFix;

// params through use() inside Suspense; root keyed on bfcacheId so a second
// visit never shows the previous form (page state is kept by React Activity).
function EditBody({ params }: { params: Promise<{ investigationId: string }> }) {
  const { investigationId } = use(params);
  const { bfcacheId } = useRouter();
  return <InvestigationEditor key={bfcacheId} mode="edit" investigationId={investigationId} />;
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

export default function EditInvestigationPage({
  params,
}: {
  params: Promise<{ investigationId: string }>;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <EditBody params={params} />
    </Suspense>
  );
}
