"use client";

import { useRouter } from "next/navigation";
import { BackupView } from "@/components/backup";

// Cache Components keeps a route's state alive when the maker navigates away.
// Keying on `bfcacheId` gives a fresh page on every new navigation, so a
// finished restore, an open confirmation or a chosen file never comes back
// stale; browser back/forward still restores what was on screen.
export default function BackupPage() {
  const { bfcacheId } = useRouter();
  return <BackupView key={bfcacheId} />;
}
