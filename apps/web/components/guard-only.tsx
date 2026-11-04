"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useProfile } from "@/lib/bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionStatus } from "@/lib/supabase/session";

/** Pages a guard-only account may open; everything else sends them to the scanner. */
const GUARD_PATHS = ["/guard", "/login", "/auth", "/privacy"];

/**
 * True for accounts that hold the guard role without sports_admin. The
 * database refuses every student action for them; this only keeps the
 * interface to the scanner so they never see screens that would fail.
 */
export function useGuardOnly(): boolean {
  const session = useSessionStatus();
  const profile = useProfile(session);
  const roles = profile.data?.roles ?? [];
  return session === "signed-in" && roles.includes("guard") && !roles.includes("sports_admin");
}

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <button type="button" className={className} onClick={() => void signOut()}>
      <LogOut className="h-4 w-4" aria-hidden />
      Sign out
    </button>
  );
}

export function GuardOnlyRedirect() {
  const guardOnly = useGuardOnly();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = GUARD_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (guardOnly && !allowed) router.replace("/guard");
  }, [guardOnly, allowed, router]);

  return null;
}
