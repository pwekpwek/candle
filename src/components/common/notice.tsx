import type { ReactNode } from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NoticeVariant = "info" | "warning" | "error" | "success";

interface NoticeProps {
  variant?: NoticeVariant;
  /** The first words, in the status colour and semibold. */
  title?: string;
  children?: ReactNode;
  /** An optional action (a button or link) shown after the text. */
  action?: ReactNode;
  className?: string;
}

/*
 * Blueprint section 3 and 4: a *-soft fill with a 1px border in the status
 * colour at low strength, text in foreground, the status colour on the icon
 * and the first words. Info is bg-muted. Status is never colour alone: every
 * variant has an icon.
 */
const styles: Record<
  NoticeVariant,
  { box: string; accent: string; Icon: typeof InfoIcon; role: "alert" | "status" }
> = {
  info: {
    box: "border-border bg-muted",
    accent: "text-foreground",
    Icon: InfoIcon,
    role: "status",
  },
  warning: {
    box: "border-warning/30 bg-warning-soft",
    accent: "text-warning",
    Icon: TriangleAlertIcon,
    role: "status",
  },
  error: {
    box: "border-destructive/30 bg-destructive-soft",
    accent: "text-destructive",
    Icon: CircleAlertIcon,
    role: "alert",
  },
  success: {
    box: "border-success/30 bg-success-soft",
    accent: "text-success",
    Icon: CircleCheckIcon,
    role: "status",
  },
};

/** Inline message above the thing it concerns. Errors use role="alert". */
export function Notice({
  variant = "info",
  title,
  children,
  action,
  className,
}: NoticeProps) {
  const { box, accent, Icon, role } = styles[variant];
  return (
    <div
      role={role}
      data-variant={variant}
      className={cn(
        // flex-wrap: on a narrow screen the action moves under the text
        // instead of pushing the page sideways (found at 375px in wave 7).
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border p-3 text-sm text-foreground sm:p-4",
        box,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.75}
        className={cn("mt-0.5 size-5 shrink-0", accent)}
      />
      <div className="min-w-0 flex-1 basis-40">
        {title ? (
          <span className={cn("font-semibold", accent)}>{title} </span>
        ) : null}
        {children}
      </div>
      {action ? <div className="max-w-full min-w-0 shrink-0">{action}</div> : null}
    </div>
  );
}
