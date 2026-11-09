"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, CalendarPlus, Home, Info, QrCode, UserRound, type LucideIcon } from "lucide-react";
import { SignOutButton, useGuardOnly } from "@/components/guard-only";
import { cn } from "@/lib/utils";
import { useSessionStatus } from "@/lib/supabase/session";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that should mark this item active. */
  match?: string[];
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/book", label: "Book", icon: CalendarPlus },
  { href: "/my-bookings", label: "Bookings", icon: CalendarCheck, match: ["/report"] },
  // Students only show a pass here; the guard's scan is what checks them in.
  { href: "/check-in", label: "My pass", icon: QrCode },
];

const GUARD: NavItem[] = [{ href: "/guard", label: "Scanner", icon: QrCode }];

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...(item.match ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function useAccountItem(): NavItem {
  const status = useSessionStatus();
  return status === "signed-in"
    ? { href: "/account", label: "Account", icon: UserRound }
    : { href: "/login", label: "Sign in", icon: UserRound, match: ["/account"] };
}

export function SiteHeader() {
  const pathname = usePathname();
  const account = useAccountItem();
  const guardOnly = useGuardOnly();
  const items = guardOnly ? GUARD : [...PRIMARY, { href: "/access", label: "Facility info", icon: Info }];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="container flex h-14 items-center justify-between gap-4 md:h-16">
        <Link
          href={guardOnly ? "/guard" : "/"}
          className="flex flex-col leading-tight"
          aria-label={guardOnly ? "VIT Bhopal Sports Facilities, check-in scanner" : "VIT Bhopal Sports Facilities, home"}
        >
          <span className="text-base font-bold md:text-lg">VIT Bhopal</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Sports Facilities</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-lg px-3 text-sm font-semibold transition-colors",
                  active ? "bg-brand-soft text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {guardOnly ? (
          <SignOutButton className="inline-flex h-11 items-center gap-2 rounded-lg border border-input bg-surface px-3 text-sm font-semibold transition-colors hover:bg-accent" />
        ) : (
          <Link
            href={account.href}
            aria-current={isActive(pathname, account) ? "page" : undefined}
            className={cn(
              "hidden h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors md:inline-flex",
              account.href === "/login"
                ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                : "border border-input bg-surface hover:bg-accent",
            )}
          >
            <UserRound className="h-4 w-4" aria-hidden />
            {account.label}
          </Link>
        )}
      </div>
    </header>
  );
}

/** Thumb-reachable tab bar for phones; hidden from md up where the header nav takes over. */
export function BottomNav() {
  const pathname = usePathname();
  const account = useAccountItem();
  // Guards get the scanner and sign-out in the header; the page itself is the tool.
  if (useGuardOnly()) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-surface/90 md:hidden"
    >
      <ul className="mx-auto grid h-bottom-nav max-w-md grid-cols-5">
        {[...PRIMARY, account].map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-brand-soft",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
