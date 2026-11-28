/**
 * Built-in things to check, and the view that joins them with stored ticks.
 * Text lives in MESSAGES.candleFixChecks; ids are `<issue>.<slug>`.
 */
import { MESSAGES } from "@/lib/messages";
import { FIX_ISSUES } from "@/lib/types";
import type { ChecklistTick, FixIssue } from "@/lib/types";
import type { ChecklistItem, ChecklistRow, ChecklistView } from "./contract";

const LISTS: Record<FixIssue, ChecklistItem[]> = Object.fromEntries(
  FIX_ISSUES.map((issue) => [
    issue,
    Object.entries(MESSAGES.candleFixChecks[issue] as Record<string, string>).map(
      ([slug, text]): ChecklistItem => ({ id: `${issue}.${slug}`, issue, text }),
    ),
  ]),
) as Record<FixIssue, ChecklistItem[]>;

const BY_ID = new Map<string, ChecklistItem>(
  FIX_ISSUES.flatMap((issue) => LISTS[issue]).map((item) => [item.id, item]),
);

export function checklistFor(issue: FixIssue): ChecklistItem[] {
  return LISTS[issue].map((item) => ({ ...item }));
}

export function checklistItemById(id: string): ChecklistItem | undefined {
  const item = BY_ID.get(id);
  return item === undefined ? undefined : { ...item };
}

export function checklistView(
  issues: readonly FixIssue[],
  ticks: readonly ChecklistTick[],
): ChecklistView {
  const chosen = new Set<FixIssue>(issues);
  const shown = new Set<string>();
  const groups = FIX_ISSUES.filter((issue) => chosen.has(issue)).map((issue) => {
    const rows: ChecklistRow[] = LISTS[issue].map((item) => {
      const tick = ticks.find((t) => t.itemId === item.id) ?? null;
      if (tick !== null) shown.add(tick.itemId);
      return { item: { ...item }, tick, label: tick !== null ? tick.label : item.text };
    });
    return { issue, rows };
  });
  return { groups, noLongerListed: ticks.filter((t) => !shown.has(t.itemId)) };
}
