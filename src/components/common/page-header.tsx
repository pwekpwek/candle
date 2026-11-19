import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  /** One line of context under the title. */
  description?: ReactNode;
  /** The primary action, on the right (under the title when space is tight). */
  action?: ReactNode;
  className?: string;
}

/** Page anatomy, blueprint section 2: title, one line of context, action. */
export function PageHeader({
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-60">
        {/* wrap-anywhere: a long label with no spaces (a batch or entry title) must not widen the page. */}
        <h1 className="text-xl font-semibold tracking-tight wrap-anywhere text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? (
        // max-w-full lets the actions wrap on a phone instead of widening the page.
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </header>
  );
}
