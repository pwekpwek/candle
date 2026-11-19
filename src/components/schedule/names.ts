import { MESSAGES } from "@/lib/messages";
import type { CureMilestone } from "@/lib/types";

/** What a milestone is called: its label, or the default for its kind. */
export function milestoneName(milestone: Pick<CureMilestone, "kind" | "label">): string {
  const label = milestone.label?.trim();
  return label ? label : MESSAGES.schedule.kindName[milestone.kind];
}
