"use client";

import { Suspense, use } from "react";
import { PageHeader } from "@/components/common/page-header";

// Skeleton (T03). T20 builds the formula page here.
//
// Cache Components: `formulaId` is runtime data (no generateStaticParams), so
// the page reads it with use(params) inside a Suspense boundary. The static
// shell (header and fallback) is prerendered; the id resolves at request time.
function FormulaBody({ params }: { params: Promise<{ formulaId: string }> }) {
  const { formulaId } = use(params);
  return (
    <p className="text-sm text-text-secondary">
      Formula {formulaId}: the formula page is coming in a later step.
    </p>
  );
}

export default function FormulaPage({
  params,
}: PageProps<"/formulas/[formulaId]">) {
  return (
    <>
      <PageHeader title="Formula" description="Latest version." />
      <Suspense fallback={<p className="text-sm text-text-secondary">Loading…</p>}>
        <FormulaBody params={params} />
      </Suspense>
    </>
  );
}
