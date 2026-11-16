"use client";

import { Suspense, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { FormulaEditor } from "@/components/editor";
import { MESSAGES } from "@/lib/messages";

const E = MESSAGES.editor;

// `?from=[versionId]` is read with useSearchParams inside Suspense; the
// formula id comes from the params promise (Cache Components).
function ReviseBody({ params }: { params: Promise<{ formulaId: string }> }) {
  const { formulaId } = use(params);
  const search = useSearchParams();
  // A fresh editor on every new navigation (see the note in ../../new/page.tsx).
  const { bfcacheId } = useRouter();
  return (
    <FormulaEditor
      key={`${bfcacheId}:${formulaId}:${search.get("from") ?? ""}`}
      mode="revise"
      formulaId={formulaId}
      fromVersionId={search.get("from")}
    />
  );
}

export default function RevisePage({
  params,
}: PageProps<"/formulas/[formulaId]/revise">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={E.reviseTitle} description={E.reviseDescription} />
          <p className="text-sm text-text-secondary">{E.loading}</p>
        </>
      }
    >
      <ReviseBody params={params} />
    </Suspense>
  );
}
