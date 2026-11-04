import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function origin(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const api = origin(process.env.NEXT_PUBLIC_API_URL);

// Without per-request nonces Next.js needs 'unsafe-inline' for its bootstrap
// scripts. The policy still pins where data can be sent (connect-src) and
// blocks framing, plugins and foreign form targets.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ""}`,
  "font-src 'self'",
  [
    "connect-src 'self'",
    supabase && `${supabase} ${supabase.replace(/^https:/, "wss:")}`,
    api,
    isDev && "ws:",
  ]
    .filter(Boolean)
    .join(" "),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  transpilePackages: ["@vitb/shared"],
  turbopack: { root: path.join(import.meta.dirname, "../..") },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera is allowed for this origin only, for the guard QR scanner.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          // Browsers only honour this over HTTPS; local http development ignores it.
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
