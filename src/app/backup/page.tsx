"use client";

import { PageHeader } from "@/components/common/page-header";

// Skeleton (T03). T22 builds backup and restore here.
export default function BackupPage() {
  return (
    <>
      <PageHeader
        title="Backup and restore"
        description="Keep a copy of your formulas outside this browser."
      />
      <p className="text-sm text-text-secondary">
        Backup and restore are coming in a later step.
      </p>
    </>
  );
}
