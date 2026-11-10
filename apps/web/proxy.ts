import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

// Runs only for pages that need a signed-in user (see `config.matcher`).
// This is a convenience redirect only: the API and the database enforce
// access on every request. Public pages skip it, so they load without a
// round trip to Supabase Auth.
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) {
    // Local development without a Supabase project: let pages render.
    // In deployed environments a missing config must not open protected pages.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Authentication is not configured.", { status: 503 });
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() verifies the token's signature locally against the project's
  // cached signing keys (no call to Supabase Auth) and refreshes an expiring
  // session, writing the new cookies through setAll above.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    "/account/:path*",
    "/my-bookings/:path*",
    "/check-in/:path*",
    "/report/:path*",
    "/guard/:path*",
    "/admin/:path*",
  ],
};
