import { NextResponse, type NextRequest } from "next/server";
import { classifyOAuthError, safeNext } from "@/lib/auth-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Google sends the student back here with a one-time code. Exchanging it sets
 * the session cookies; the college-domain rule was already enforced by the
 * sign-up hook, which makes Supabase return an error instead of a code.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const toLogin = (reason: string) => {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", reason);
    if (next !== "/") login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  };

  const code = url.searchParams.get("code");
  if (!code || !isSupabaseConfigured) {
    return toLogin(classifyOAuthError(url.searchParams.get("error"), url.searchParams.get("error_description")));
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return toLogin(classifyOAuthError(error.code ?? null, error.message));

  return NextResponse.redirect(new URL(next, url.origin));
}
