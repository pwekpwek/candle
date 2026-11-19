"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDataLayer } from "@/lib/db";
import { attentionCount, buildSchedule } from "@/lib/schedule";
import { useToday } from "./use-today";

/**
 * Items that are overdue or due today, for the nav badge. 0 while loading, when
 * storage is not available, or when the read fails: the badge is only a hint.
 */
export function useAttentionCount(): number {
  const today = useToday();
  const count = useLiveQuery(async () => {
    try {
      const data = await getDataLayer().schedule.read();
      return data;
    } catch {
      return null;
    }
  }, []);
  if (today === null || !count) return 0;
  try {
    return attentionCount(buildSchedule(count, today));
  } catch {
    // A date that is not a real calendar date (damaged data only). The badge is a hint.
    return 0;
  }
}
