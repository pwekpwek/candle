import { MESSAGES } from "@/lib/messages";

/** "Formula archived": shown beside a link to an archived source formula. */
export function ArchivedBadge() {
  return (
    <span className="ml-2 inline-block rounded-sm border border-border px-1.5 py-0.5 text-xs font-semibold text-text-secondary">
      {MESSAGES.batches.formulaArchivedBadge}
    </span>
  );
}
