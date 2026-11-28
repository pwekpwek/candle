"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { CostSheetEditor } from "@/components/cost/sheet-editor";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.cost;

function EditBody({ params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = use(params);
  const { bfcacheId } = useRouter();
  return <CostSheetEditor key={bfcacheId} sheetId={sheetId} />;
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

export default function EditCostSheetPage({ params }: { params: Promise<{ sheetId: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <EditBody params={params} />
    </Suspense>
  );
}
