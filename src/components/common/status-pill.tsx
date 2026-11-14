"use client";

import { CheckIcon, CircleAlertIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface StatusPillProps {
  state: SaveState;
  /** Shown beside "Error" and called when the maker presses Retry. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Autosave state on measured weights (blueprint section 4): Saving..., Saved,
 * or Error with Retry. Always text plus icon, and always inside an
 * aria-live="polite" region that stays mounted, so changes are announced.
 */
export function StatusPill({ state, onRetry, className }: StatusPillProps) {
  return (
    <div
      aria-live="polite"
      data-state={state}
      className={cn("inline-flex min-h-6 items-center gap-1.5 text-sm", className)}
    >
      {state === "saving" ? (
        <span className="inline-flex items-center gap-1.5 text-text-secondary">
          <Loader2Icon
            aria-hidden="true"
            strokeWidth={1.75}
            className="size-4 animate-spin"
          />
          Saving…
        </span>
      ) : null}
      {state === "saved" ? (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CheckIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
          Saved
        </span>
      ) : null}
      {state === "error" ? (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <CircleAlertIcon
            aria-hidden="true"
            strokeWidth={1.75}
            className="size-4"
          />
          Error
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-sm px-1 font-semibold text-primary underline-offset-4 hover:underline"
            >
              Retry
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
