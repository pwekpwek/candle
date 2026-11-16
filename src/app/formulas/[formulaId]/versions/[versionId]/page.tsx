"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { FormulaDetail } from "@/components/formulas/detail";
import { MESSAGES } from "@/lib/messages";

// Read-only view of one saved version. Params are read with use() inside
// Suspense (see the formula page for why).
function VersionBody({
  params,
}: {
  params: Promise<{ formulaId: string; versionId: string }>;
}) {
  const { formulaId, versionId } = use(params);
  // A fresh page on every new navigation (see the note in ../../../new/page.tsx).
  const { bfcacheId } = useRouter();
  return <FormulaDetail key={bfcacheId} formulaId={formulaId} versionId={versionId} />;
}

function Loading() {
  return (
    <>
      <PageHeader title={MESSAGES.formula.loadingTitle} />
      <p role="status" className="text-sm text-text-secondary">
        {MESSAGES.formula.loading}
      </p>
    </>
  );
}

export default function VersionPage({
  params,
}: PageProps<"/formulas/[formulaId]/versions/[versionId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <VersionBody params={params} />
    </Suspense>
  );
}
