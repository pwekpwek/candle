"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { ExperimentEditor } from "@/components/candlefix/experiments";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const X = MESSAGES.candleFixExperiments;

// params through use() inside Suspense; root keyed on bfcacheId so a second visit never shows the previous form.
function EditBody({ params }: { params: Promise<{ investigationId: string; experimentId: string }> }) {
  const { investigationId, experimentId } = use(params);
  const { bfcacheId } = useRouter();
  return <ExperimentEditor key={bfcacheId} mode="edit" investigationId={investigationId} experimentId={experimentId} />;
}

export default function EditExperimentPage({
  params,
}: {
  params: Promise<{ investigationId: string; experimentId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={X.editTitle} />
          <p role="status" className="text-sm text-text-secondary">
            {X.editorLoading}
          </p>
        </>
      }
    >
      <EditBody params={params} />
    </Suspense>
  );
}
