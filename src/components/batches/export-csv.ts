import { batchCsvFileName, buildBatchCsv } from "@/lib/batchtrace";
import type { BatchTraceItem } from "@/lib/db";
import { localToday } from "./text";

/**
 * Downloads the given (already filtered) batches as CSV (v0.3). Throws if the
 * browser cannot start the download; the caller shows the error.
 */
export function downloadBatchCsv(items: readonly BatchTraceItem[]): void {
  const text = buildBatchCsv(items);
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = batchCsvFileName(localToday());
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
