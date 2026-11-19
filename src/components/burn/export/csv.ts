import { buildBurnCsv, csvFileName } from "@/lib/burnmatrix";
import type { BurnSessionListItem } from "@/lib/db";
import { todayLocal } from "@/lib/schedule";

/**
 * Downloads the measurements of the given sessions as CSV (v0.2 BurnMatrix).
 * Shared by the session page and the comparison. Throws if the browser cannot
 * start the download; the caller shows the error.
 */
export function downloadBurnCsv(sessions: readonly BurnSessionListItem[]): void {
  const text = buildBurnCsv(sessions);
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFileName(todayLocal());
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
