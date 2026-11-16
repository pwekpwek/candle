"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { FormulaEditor } from "@/components/editor";
import { MESSAGES } from "@/lib/messages";

const E = MESSAGES.editor;

// `?example=1` starts from the example. Reading it needs useSearchParams
// inside a Suspense boundary (Cache Components).
// Cache Components keeps a route's state alive when the maker navigates away
// (React Activity). Keying on `bfcacheId` gives a fresh instance on every new
// navigation here, so an old editor or a stale notice never comes back, while
// browser back/forward still restores what was on screen.
function NewBody() {
  const params = useSearchParams();
  const { bfcacheId } = useRouter();
  return (
    <FormulaEditor key={bfcacheId} mode="new" example={params.get("example") === "1"} />
  );
}

export default function NewFormulaPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={E.title} description={E.newDescription} />
          <p className="text-sm text-text-secondary">{E.loading}</p>
        </>
      }
    >
      <NewBody />
    </Suspense>
  );
}
