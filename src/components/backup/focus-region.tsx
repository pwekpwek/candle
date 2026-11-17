"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Wraps a result or error message. When it appears it takes focus and scrolls
 * into view, so a keyboard or screen reader user lands on the outcome of the
 * action (PRD-29). Mount a new one (change its key) for each new outcome.
 */
export function FocusRegion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView?.({ block: "nearest" });
  }, []);
  return (
    <div ref={ref} tabIndex={-1} className="rounded-lg outline-offset-2">
      {children}
    </div>
  );
}
