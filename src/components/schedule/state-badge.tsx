import { MESSAGES } from "@/lib/messages";
import type { ScheduleState } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { formatProducedOn } from "@/components/batches/text";

const S = MESSAGES.schedule;

/** Overdue / Due today / Upcoming / Done on <date>. Always text, never colour alone. */
export function StateBadge({
  state,
  doneOn,
  className,
}: {
  state: ScheduleState;
  /** The date it was marked done (shown for the done state). */
  doneOn?: string | null;
  className?: string;
}) {
  const text =
    state === "overdue"
      ? S.stateOverdue
      : state === "due"
        ? S.stateDue
        : state === "upcoming"
          ? S.stateUpcoming
          : S.stateDone(doneOn ? formatProducedOn(doneOn) : "");
  return (
    <span
      data-state={state}
      className={cn(
        "inline-block rounded-sm border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        state === "overdue" && "border-destructive/40 bg-destructive-soft text-destructive",
        state === "due" && "border-warning/40 bg-warning-soft text-warning",
        state === "upcoming" && "border-border text-text-secondary",
        state === "done" && "border-success/40 bg-success-soft text-success",
        className,
      )}
    >
      {text}
    </span>
  );
}
