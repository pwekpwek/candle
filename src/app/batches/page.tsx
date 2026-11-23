"use client";

import { Suspense } from "react";
import { BatchList } from "@/components/batches";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const B = MESSAGES.batches;

// The list reads its search and filters from the URL (`useSearchParams`), which
// needs a Suspense boundary under Cache Components.
export default function BatchesPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={B.title} description={B.listDescription} />
          <p role="status" className="text-sm text-text-secondary">
            {B.loading}
          </p>
        </>
      }
    >
      <BatchList />
    </Suspense>
  );
}
