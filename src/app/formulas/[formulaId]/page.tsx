"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { FormulaDetail } from "@/components/formulas/detail";
import { MESSAGES } from "@/lib/messages";

// Cache Components: `formulaId` is runtime data (no generateStaticParams), so
// the page reads it with use(params) inside a Suspense boundary. The static
// shell (header and fallback) is prerendered; the id resolves at request time.
// FormulaDetail reads useSearchParams ("?saved=N"), which also needs Suspense.
function FormulaBody({ params }: { params: Promise<{ formulaId: string }> }) {
  const { formulaId } = use(params);
  // A fresh page on every new navigation (see the note in ../new/page.tsx):
  // measured fields and notices are read again from what is saved.
  const { bfcacheId } = useRouter();
  return <FormulaDetail key={bfcacheId} formulaId={formulaId} />;
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

export default function FormulaPage({
  params,
}: PageProps<"/formulas/[formulaId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <FormulaBody params={params} />
    </Suspense>
  );
}
