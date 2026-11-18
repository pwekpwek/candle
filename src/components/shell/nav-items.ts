import { FlaskConicalIcon, HardDriveDownloadIcon, PackageIcon } from "lucide-react";
import { MESSAGES } from "@/lib/messages";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter text for the phone bottom bar, where the full label does not fit. */
  shortLabel?: string;
  icon: typeof FlaskConicalIcon;
  /** Pathname prefixes (besides `href`) that keep this item marked current. */
  alsoActiveFor: readonly string[];
}

/**
 * The three destinations (spec 3 "Navigation", blueprint section 2). "New
 * formula" is the primary action on the Saved formulas page, not a
 * destination, so /formulas/new and the formula pages keep "Formulas" current.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: MESSAGES.app.navFormulas, icon: FlaskConicalIcon, alsoActiveFor: ["/formulas"] },
  { href: "/materials", label: MESSAGES.app.navMaterials, icon: PackageIcon, alsoActiveFor: [] },
  {
    href: "/backup",
    label: MESSAGES.app.navBackup,
    shortLabel: MESSAGES.app.navBackupShort,
    icon: HardDriveDownloadIcon,
    alsoActiveFor: [],
  },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when the item should carry aria-current="page" for this pathname. */
export function isNavItemActive(item: NavItem, pathname: string | null): boolean {
  if (pathname === null) return false;
  if (item.href === "/") {
    if (pathname === "/") return true;
  } else if (matchesPrefix(pathname, item.href)) {
    return true;
  }
  return item.alsoActiveFor.some((prefix) => matchesPrefix(pathname, prefix));
}
