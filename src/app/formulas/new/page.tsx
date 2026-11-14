"use client";

import { PageHeader } from "@/components/common/page-header";

// Skeleton (T03). T18 builds the editor here. `?example=1` starts from the
// example: reading it needs useSearchParams inside a Suspense boundary.
export default function NewFormulaPage() {
  return (
    <>
      <PageHeader
        title="New formula"
        description="Work out wax and fragrance weights."
      />
      <p className="text-sm text-text-secondary">
        The formula editor is coming in a later step.
      </p>
    </>
  );
}
