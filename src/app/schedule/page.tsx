"use client";

import { useRouter } from "next/navigation";
import { ScheduleView } from "@/components/schedule";

// Keyed on bfcacheId so a failed row message never lingers when the page is
// shown again (the page is kept alive by React Activity).
export default function SchedulePage() {
  const { bfcacheId } = useRouter();
  return <ScheduleView key={bfcacheId} />;
}
