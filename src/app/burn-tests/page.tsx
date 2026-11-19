"use client";

import { Suspense } from "react";
import { BurnList } from "@/components/burn/list";
import { PageHeader } from "@/components/common/page-header";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.burnCompare;

export default function BurnTestsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={M.listTitle} description={M.listDescription} />
          <p role="status" className="text-sm text-text-secondary">
            {M.listLoading}
          </p>
        </>
      }
    >
      <BurnList />
    </Suspense>
  );
}
