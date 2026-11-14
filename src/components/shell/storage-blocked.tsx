"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// TODO(T05): move to @/lib/messages
const STORAGE_BLOCKED_TITLE = "This browser can't store data right now.";
// TODO(T05): move to @/lib/messages
// Spec 3 gives the heading and says "what to try" and that the calculator
// still works without saving, but does not give the explanation word for word.
const STORAGE_BLOCKED_BODY_TRY =
  "Your browser is not letting this site keep data. A private or incognito window, a full device, or a browser setting that blocks site data can cause this. Try a regular window, free up some space, or allow site data for this page, then reload.";
// TODO(T05): move to @/lib/messages
const STORAGE_BLOCKED_BODY_CALCULATOR =
  "The calculator still works without saving. Nothing you enter will be kept when you close or reload the page.";
// TODO(T05): move to @/lib/messages
const STORAGE_BLOCKED_ACTION = "Carry on without saving";

/** Full-page explanation shown when the browser blocks storage at start. */
export function StorageBlocked({ onCarryOn }: { onCarryOn: () => void }) {
  return (
    <main
      id="main"
      data-testid="storage-blocked"
      className="mx-auto flex min-h-dvh w-full max-w-[44ch] flex-col justify-center px-4 py-12 sm:px-6"
    >
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {STORAGE_BLOCKED_TITLE}
      </h1>
      <p className="mt-3 text-base text-text-secondary">
        {STORAGE_BLOCKED_BODY_TRY}
      </p>
      <p className="mt-3 text-base text-text-secondary">
        {STORAGE_BLOCKED_BODY_CALCULATOR}
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link href="/formulas/new" onClick={onCarryOn}>
            {STORAGE_BLOCKED_ACTION}
          </Link>
        </Button>
      </div>
    </main>
  );
}
