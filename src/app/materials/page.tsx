"use client";

import { PageHeader } from "@/components/common/page-header";

// Skeleton (T03). T16 builds the material library here.
export default function MaterialsPage() {
  return (
    <>
      <PageHeader
        title="Materials"
        description="The waxes, oils, wicks and vessels you use."
      />
      <p className="text-sm text-text-secondary">
        The material library is coming in a later step.
      </p>
    </>
  );
}
