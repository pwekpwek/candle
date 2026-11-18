"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { FlameIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";

/*
 * Navigation (blueprint section 2).
 *   >= 1024px  Sidebar, 240px, product name on top, labels visible.
 *   640-1023   Icon rail, 64px. Labels appear on hover and focus and are
 *              always in aria-label.
 *   < 640      Bottom bar, icon and label, padded for the home indicator.
 *
 * usePathname() needs a Suspense boundary under Cache Components on routes
 * whose params are not known at build time, so the link lists are rendered
 * once without a current item as the fallback.
 */

function SideNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-10 items-center justify-center gap-3 rounded-md text-sm transition-colors duration-150 lg:justify-start lg:px-3",
                active
                  ? "bg-accent font-semibold text-foreground"
                  : "text-text-secondary hover:bg-card hover:text-foreground",
              )}
            >
              <Icon
                aria-hidden="true"
                strokeWidth={1.75}
                className={cn("size-5 shrink-0", active && "text-primary")}
              />
              <span
                aria-hidden="true"
                className="max-lg:pointer-events-none max-lg:absolute max-lg:left-full max-lg:z-40 max-lg:ml-2 max-lg:rounded-md max-lg:border max-lg:border-border max-lg:bg-popover max-lg:px-2 max-lg:py-1 max-lg:whitespace-nowrap max-lg:text-popover-foreground max-lg:opacity-0 max-lg:shadow-popover max-lg:transition-opacity max-lg:duration-150 max-lg:group-hover:opacity-100 max-lg:group-focus-visible:opacity-100"
              >
                {item.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BottomNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="grid h-16 grid-cols-4 gap-1 px-2 py-1">
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = item.icon;
        return (
          <li key={item.href} className="min-w-0">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              // The short visible text ("Backup") is part of the full name (label in name).
              aria-label={item.shortLabel ? item.label : undefined}
              className={cn(
                "flex h-full flex-col items-center justify-center gap-1 rounded-md px-1 text-xs transition-colors duration-150",
                active
                  ? "bg-accent font-semibold text-foreground"
                  : "text-text-secondary",
              )}
            >
              <Icon
                aria-hidden="true"
                strokeWidth={1.75}
                className={cn("size-5 shrink-0", active && "text-primary")}
              />
              <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ConnectedSideNavLinks() {
  return <SideNavLinks pathname={usePathname()} />;
}

function ConnectedBottomNavLinks() {
  return <BottomNavLinks pathname={usePathname()} />;
}

/** Sidebar (from 1024px) and icon rail (640 to 1023px). Hidden below 640px. */
export function SideNav() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col border-r border-border bg-muted sm:flex lg:w-60">
      <div className="flex h-16 items-center justify-center gap-2 px-3 lg:justify-start lg:px-5">
        <FlameIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className="size-5 shrink-0 text-foreground"
        />
        <span className="text-base font-semibold tracking-tight text-foreground max-lg:sr-only">
          CandleLab Studio
        </span>
      </div>
      <nav aria-label="Main" className="px-3 lg:px-3">
        <Suspense fallback={<SideNavLinks pathname={null} />}>
          <ConnectedSideNavLinks />
        </Suspense>
      </nav>
    </aside>
  );
}

/** Fixed bottom bar below 640px, padded with the safe-area inset. */
export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-muted pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <Suspense fallback={<BottomNavLinks pathname={null} />}>
        <ConnectedBottomNavLinks />
      </Suspense>
    </nav>
  );
}
