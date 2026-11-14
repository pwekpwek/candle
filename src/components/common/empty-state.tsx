import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** A lucide icon component. Shown at 20px in muted-foreground, no tile. */
  icon: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
    strokeWidth?: number;
  }>;
  title: string;
  description?: ReactNode;
  /** The primary button. */
  action?: ReactNode;
  /** An optional quiet link or button beside the primary one. */
  secondaryAction?: ReactNode;
  className?: string;
}

/**
 * The one empty-state pattern (blueprint section 5): inside the region it
 * replaces, left-aligned, 48px vertical padding (32px on phones), max width
 * 44ch. Icon, title, one line of description, then the actions. No
 * illustration and no tile.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={cn("max-w-[44ch] py-8 sm:py-12", className)}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.75}
        className="size-5 text-muted-foreground"
      />
      <h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
