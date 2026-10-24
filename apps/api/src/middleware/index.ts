import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { ApiError, type Role } from "@vitb/shared";
import type { Config } from "../config";
import type { AuthUser, TokenVerifier } from "../lib/auth";
import type { DataSource } from "../lib/data";

export type AppEnv = {
  Variables: {
    requestId: string;
    user: AuthUser;
    clientIp: string;
  };
};

const ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE"];
const ALLOWED_HEADERS = ["Authorization", "Content-Type", "Idempotency-Key"];

export function requestContext(trustProxyHops: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    c.set("clientIp", clientIp(c, trustProxyHops));
    c.header("X-Request-Id", requestId);
    const started = performance.now();
    await next();
    // Path only: query strings and headers can carry tokens.
    console.log(
      JSON.stringify({
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - started),
      }),
    );
  };
}

/**
 * With N trusted proxies, the client address is the N-th entry from the right
 * of X-Forwarded-For; anything further left is client-supplied and spoofable.
 */
function clientIp(c: Context, hops: number): string {
  if (hops > 0) {
    const chain = (c.req.header("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const entry = chain[chain.length - hops];
    if (entry) return entry;
  }
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? "unknown";
}

export function securityHeaders(production: boolean): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cross-Origin-Resource-Policy", "same-site");
    c.header("Cache-Control", "no-store");
    if (production) c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  };
}

/**
 * Exact-origin allowlist plus optional anchored patterns (preview only).
 * Requests from any other browser origin are refused outright, so the API
 * never reflects an arbitrary Origin. Requests without an Origin header
 * (curl, server-to-server) pass through; CORS is not authentication.
 */
export function corsPolicy(config: Pick<Config, "CORS_ALLOWED_ORIGINS" | "CORS_ALLOWED_ORIGIN_PATTERNS">) {
  const exact = new Set(config.CORS_ALLOWED_ORIGINS);
  const patterns = config.CORS_ALLOWED_ORIGIN_PATTERNS.map((p) => new RegExp(p));
  const isAllowed = (origin: string) => exact.has(origin) || patterns.some((p) => p.test(origin));

  const handler = cors({
    origin: (origin) => (isAllowed(origin) ? origin : null),
    allowMethods: ALLOWED_METHODS,
    allowHeaders: ALLOWED_HEADERS,
    exposeHeaders: ["X-Request-Id", "Retry-After"],
    maxAge: 600,
    credentials: false,
  });

  const middleware: MiddlewareHandler<AppEnv> = async (c, next) => {
    const origin = c.req.header("origin");
    if (origin !== undefined && !isAllowed(origin)) {
      throw new ApiError("FORBIDDEN", "This origin is not allowed to use the API.");
    }
    return handler(c, next);
  };
  return middleware;
}

/** Fixed-window limiter, in memory per instance. Correctness never depends on it. */
export function rateLimit(opts: {
  limit: number;
  windowMs?: number;
  key: (c: Context<AppEnv>) => string;
}): MiddlewareHandler<AppEnv> {
  const windowMs = opts.windowMs ?? 60_000;
  const hits = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = Date.now();

  return async (c, next) => {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      lastSweep = now;
    }
    const key = opts.key(c);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > opts.limit) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new ApiError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
    }
    await next();
  };
}

export function requireAuth(verify: TokenVerifier): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
    if (!match?.[1]) {
      throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
    }
    c.set("user", await verify(match[1]));
    await next();
  };
}

/** Checks roles against the database (via RLS), with a short per-user cache. */
export function createRoleGuard(data: DataSource, ttlMs = 30_000) {
  const cache = new Map<string, { roles: Role[]; expiresAt: number }>();

  return (...allowed: Role[]): MiddlewareHandler<AppEnv> =>
    async (c, next) => {
      const user = c.get("user");
      const now = Date.now();
      let cached = cache.get(user.id);
      if (!cached || cached.expiresAt <= now) {
        cached = { roles: await data.getRoles(user), expiresAt: now + ttlMs };
        cache.set(user.id, cached);
      }
      if (!cached.roles.some((r) => allowed.includes(r))) {
        throw new ApiError("FORBIDDEN", "You do not have permission to do this.");
      }
      await next();
    };
}
