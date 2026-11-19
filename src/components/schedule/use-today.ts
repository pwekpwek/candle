"use client";

import { useEffect, useState } from "react";
import { todayLocal } from "@/lib/schedule";

const MINUTE = 60_000;

/**
 * The device's local today, or null until the first effect has run. The clock
 * is read in an effect, never during render (Cache Components, and the page
 * may be kept alive by React Activity). It is read again on window focus, when
 * the tab becomes visible, and once a minute, so a page left open overnight
 * moves on by itself.
 */
export function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const next = todayLocal();
      setToday((prev) => (prev === next ? prev : next));
    };
    update();
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(update, MINUTE);
    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);
  return today;
}
