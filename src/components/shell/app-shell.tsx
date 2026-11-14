"use client";

import { useEffect, useState, type ReactNode } from "react";
import { probeStorage } from "@/lib/db/probe";
import { Notice } from "@/components/common/notice";
import { BottomNav, SideNav } from "./nav";
import { StorageBlocked } from "./storage-blocked";

// TODO(T05): move to @/lib/messages
const NOT_SAVING_TITLE = "Not saving.";
// TODO(T05): move to @/lib/messages
const NOT_SAVING_BODY =
  "This browser is not letting the site store data, so nothing you enter will be kept.";

type StorageStatus = "pending" | "ok" | "blocked";

/**
 * Storage gate. Probes IndexedDB once on mount. While the probe is pending
 * the page renders normally (no flash of the blocked screen). If storage is
 * blocked, the full-page explanation replaces the app until the maker carries
 * on to the calculator. Dismissal lives in React state only, so it lasts for
 * the session (the layout stays mounted across navigation) and nothing is
 * written to storage.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StorageStatus>("pending");
  const [carriedOn, setCarriedOn] = useState(false);

  useEffect(() => {
    let active = true;
    probeStorage().then((ok) => {
      if (active) setStatus(ok ? "ok" : "blocked");
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === "blocked" && !carriedOn) {
    return <StorageBlocked onCarryOn={() => setCarriedOn(true)} />;
  }

  return (
    <div className="min-h-dvh [--bottom-bar-height:calc(4rem_+_env(safe-area-inset-bottom))] sm:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm font-semibold text-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>
      <SideNav />
      <div className="min-w-0 flex-1">
        <main
          id="main"
          className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-[calc(var(--bottom-bar-height)_+_1rem)] sm:px-6 sm:pt-8 sm:pb-8 lg:px-8"
        >
          {status === "blocked" ? (
            <Notice variant="warning" title={NOT_SAVING_TITLE} className="mb-6">
              {NOT_SAVING_BODY}
            </Notice>
          ) : null}
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
