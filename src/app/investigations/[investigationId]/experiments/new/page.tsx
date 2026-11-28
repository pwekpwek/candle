"use client";

import { Suspense, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExperimentEditor } from "@/components/candlefix/experiments";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const X = MESSAGES.candleFixExperiments;

// `?hypothesis=<id>` needs useSearchParams inside Suspense (Cache Components); params come through use().
function NewBody({ params }: { params: Promise<{ investigationId: string }> }) {
  const { investigationId } = use(params);
  const search = useSearchParams();
  const { bfcacheId } = useRouter();
  const hypothesisId = search.get("hypothesis");
  return (
    <ExperimentEditor
      key={`${bfcacheId}:${hypothesisId ?? ""}`}
      mode="new"
      investigationId={investigationId}
      hypothesisId={hypothesisId}
    />
  );
}

export default function NewExperimentPage({ params }: { params: Promise<{ investigationId: string }> }) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={X.newTitle} />
          <p role="status" className="text-sm text-text-secondary">
            {X.editorLoading}
          </p>
        </>
      }
    >
      <NewBody params={params} />
    </Suspense>
  );
}
