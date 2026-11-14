"use client";

import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";

// Skeleton (T03). T19 fills in the saved formulas list.
export default function SavedFormulasPage() {
  return (
    <>
      <PageHeader
        title="Saved formulas"
        description="Your formulas will appear here."
        action={
          <Button asChild>
            <Link href="/formulas/new">New formula</Link>
          </Button>
        }
      />
      <p className="text-sm text-text-secondary">
        The list of saved formulas is coming in a later step.
      </p>
    </>
  );
}
