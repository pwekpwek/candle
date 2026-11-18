"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/lib/messages";

const S = MESSAGES.storage;

/** Full-page explanation shown when the browser blocks storage at start. */
export function StorageBlocked({ onCarryOn }: { onCarryOn: () => void }) {
  return (
    <main
      id="main"
      data-testid="storage-blocked"
      className="mx-auto flex min-h-dvh w-full max-w-[44ch] flex-col justify-center px-4 py-12 sm:px-6"
    >
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {S.blockedTitle}
      </h1>
      <p className="mt-3 text-base text-text-secondary">
        {S.blockedCauses}
      </p>
      <p className="mt-3 text-base text-text-secondary">
        {`${S.blockedExplanation} ${S.blockedNotKept}`}
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link href="/formulas/new" onClick={onCarryOn}>
            {S.carryOn}
          </Link>
        </Button>
      </div>
    </main>
  );
}
