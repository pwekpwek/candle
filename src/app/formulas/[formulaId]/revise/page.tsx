"use client";

import { Suspense, use } from "react";
import { PageHeader } from "@/components/common/page-header";

// Skeleton (T03). T18 builds the revise editor here. `?from=[versionId]` is
// read with useSearchParams (or the searchParams prop) inside Suspense.
function ReviseBody({ params }: { params: Promise<{ formulaId: string }> }) {
  const { formulaId } = use(params);
  return (
    <p className="text-sm text-text-secondary">
      Formula {formulaId}: the revise editor is coming in a later step.
    </p>
  );
}

export default function RevisePage({
  params,
}: PageProps<"/formulas/[formulaId]/revise">) {
  return (
    <>
      <PageHeader
        title="Revise formula"
        description="Save changes as a new version."
      />
      <Suspense fallback={<p className="text-sm text-text-secondary">Loading…</p>}>
        <ReviseBody params={params} />
      </Suspense>
    </>
  );
}
