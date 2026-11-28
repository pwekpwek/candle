"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { CostSheetView } from "@/components/cost/sheet-view";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.cost;

// params through use() inside Suspense; root keyed on bfcacheId so a second
// visit never shows the previous sheet (page state is kept by React Activity).
function SheetBody({ params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = use(params);
  const { bfcacheId } = useRouter();
  return <CostSheetView key={bfcacheId} sheetId={sheetId} />;
}

function Loading() {
  return (
    <>
      <PageHeader title={M.pageLoadingTitle} />
      <p role="status" className="text-sm text-text-secondary">
        {M.pageLoading}
      </p>
    </>
  );
}

export default function CostSheetPage({ params }: { params: Promise<{ sheetId: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <SheetBody params={params} />
    </Suspense>
  );
}
