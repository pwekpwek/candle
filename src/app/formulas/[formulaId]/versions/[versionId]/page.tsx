"use client";

import { Suspense, use } from "react";
import { PageHeader } from "@/components/common/page-header";

// Skeleton (T03). T20 builds the read-only version view here. Params are read
// with use() inside Suspense (see the formula page for why).
function VersionBody({
  params,
}: {
  params: Promise<{ formulaId: string; versionId: string }>;
}) {
  const { formulaId, versionId } = use(params);
  return (
    <p className="text-sm text-text-secondary">
      Formula {formulaId}, version {versionId}: the version view is coming in a
      later step.
    </p>
  );
}

export default function VersionPage({
  params,
}: PageProps<"/formulas/[formulaId]/versions/[versionId]">) {
  return (
    <>
      <PageHeader title="Version" description="A saved version, read only." />
      <Suspense fallback={<p className="text-sm text-text-secondary">Loading…</p>}>
        <VersionBody params={params} />
      </Suspense>
    </>
  );
}
