"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LotsView } from "@/components/lots";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const L = MESSAGES.lots;

// `?material=<id>` preselects the material filter. Reading it needs useSearchParams
// inside a Suspense boundary (Cache Components). Keyed on `bfcacheId` so every
// new navigation starts with its own filter (see ../../batches/new/page.tsx).
function LotsBody() {
  const params = useSearchParams();
  const { bfcacheId } = useRouter();
  return <LotsView key={bfcacheId} initialMaterialId={params.get("material")} />;
}

export default function LotsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={L.title} description={L.description} />
          <p className="text-sm text-text-secondary">{L.loading}</p>
        </>
      }
    >
      <LotsBody />
    </Suspense>
  );
}
