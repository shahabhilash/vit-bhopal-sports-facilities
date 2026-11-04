import { beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWTVerifyGetKey } from "jose";
import type { ApiErrorBody, Role } from "@vitb/shared";
import { createApp } from "../src/app";
import { loadConfig, type Config } from "../src/config";
import { createTokenVerifier } from "../src/lib/auth";
import type { Db } from "../src/lib/data";
import { type AppEnv, createRoleGuard, requireAuth } from "../src/middleware";

const SUPABASE_URL = "https://project-ref.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const FRONTEND = "https://sports.vitbhopal.example";
const USER_ID = "8d0b8c3e-5a59-4e44-9f3d-6c6f3f0d2a11";

const json = (res: Response) => res.json() as Promise<ApiErrorBody>;

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("ES256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "ES256" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

function baseEnv(overrides: Record<string, string> = {}) {
  return {
    APP_ENV: "production",
    SUPABASE_URL,
    SUPABASE_ANON_KEY: "sb_publishable_test_key_000000",
    CORS_ALLOWED_ORIGINS: FRONTEND,
    RATE_LIMIT_PER_MINUTE: "5",
    BODY_LIMIT_BYTES: "1024",
    ...overrides,
  };
}

async function token(claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; expiresIn?: string; issuer?: string; audience?: string } = {}) {
  return new SignJWT({ role: "authenticated", email: "alice.23bce10001@vitbhopal.ac.in", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setSubject((claims.sub as string | undefined) ?? USER_ID)
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h")
    .sign(opts.key ?? privateKey);
}

/** Stand-in database: answers my_profile, records every call. */
function fakeDb(roles: Role[] = ["student"]): Db & { calls: string[]; fail?: Error } {
  const db = {
    calls: [] as string[],
    fail: undefined as Error | undefined,
    async rpc<T>(fn: string): Promise<T> {
      db.calls.push(fn);
      if (db.fail) throw db.fail;
      if (fn === "my_profile") {
        return { id: USER_ID, email: "alice.23bce10001@vitbhopal.ac.in", fullName: "Alice", regNo: "23BCE10001", roles } as T;
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  };
  return db;
}

function makeApp(env: Record<string, string> = {}, db: Db = fakeDb()) {
  const config: Config = loadConfig(baseEnv(env));
  return createApp({ config, verifyToken: createTokenVerifier(config, jwks), db, photos: null });
}

describe("configuration", () => {
  it("rejects wildcard, non-https and path-bearing origins", () => {
    for (const bad of ["*", "http://sports.example.com", "https://sports.example.com/", "https://a.com/path"]) {
      expect(() => loadConfig(baseEnv({ CORS_ALLOWED_ORIGINS: bad }))).toThrow(/CORS_ALLOWED_ORIGINS/);
    }
  });

  it("allows http://localhost only in development", () => {
    expect(() => loadConfig(baseEnv({ CORS_ALLOWED_ORIGINS: "http://localhost:3000" }))).toThrow();
    expect(loadConfig(baseEnv({ APP_ENV: "development", CORS_ALLOWED_ORIGINS: "http://localhost:3000" })).CORS_ALLOWED_ORIGINS)
      .toEqual(["http://localhost:3000"]);
  });

  it("forbids origin patterns in production and requires them to be anchored", () => {
    expect(() => loadConfig(baseEnv({ CORS_ALLOWED_ORIGIN_PATTERNS: "^https://x-[a-z0-9-]+\\.vercel\\.app$" }))).toThrow();
    expect(() =>
      loadConfig(baseEnv({ APP_ENV: "preview", CORS_ALLOWED_ORIGIN_PATTERNS: "https://.*\\.vercel\\.app" })),
    ).toThrow();
  });

  it("does not echo secret values in configuration errors", () => {
    try {
      loadConfig(baseEnv({ SUPABASE_JWT_SECRET: "short-secret-value" }));
      throw new Error("expected failure");
    } catch (err) {
      expect(String(err)).toContain("SUPABASE_JWT_SECRET");
      expect(String(err)).not.toContain("short-secret-value");
    }
  });
});

describe("CORS", () => {
  it("answers a preflight from the allowed origin with exact headers", async () => {
    const res = await makeApp().request("/v1/me", {
      method: "OPTIONS",
      headers: { Origin: FRONTEND, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(FRONTEND);
    expect(res.headers.get("access-control-allow-methods")).toBe("GET,POST,PATCH,DELETE");
    expect(res.headers.get("access-control-allow-headers")).toBe("Authorization,Content-Type,Idempotency-Key");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("refuses other origins without reflecting them", async () => {
    for (const origin of ["https://evil.example", `${FRONTEND}.evil.example`, "null"]) {
      const res = await makeApp().request("/health", { headers: { Origin: origin } });
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect((await json(res)).error.code).toBe("FORBIDDEN");
    }
  });

  it("accepts preview origins matching an anchored pattern", async () => {
    const app = makeApp({ APP_ENV: "preview", CORS_ALLOWED_ORIGIN_PATTERNS: "^https://vitb-sports-[a-z0-9-]+-team\\.vercel\\.app$" });
    const ok = await app.request("/health", { headers: { Origin: "https://vitb-sports-git-feat-x-team.vercel.app" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://vitb-sports-git-feat-x-team.vercel.app");
    const bad = await app.request("/health", { headers: { Origin: "https://vitb-sports-x-team.vercel.app.evil.com" } });
    expect(bad.status).toBe(403);
  });

  it("keeps CORS headers on error responses for allowed origins", async () => {
    const res = await makeApp().request("/v1/me", { headers: { Origin: FRONTEND } });
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe(FRONTEND);
  });
});

describe("authentication", () => {
  const me = async (authorization?: string) =>
    makeApp().request("/v1/me", { headers: authorization ? { Authorization: authorization } : {} });

  it("returns the caller's profile and roles for a valid token", async () => {
    const res = await me(`Bearer ${await token()}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: USER_ID,
      email: "alice.23bce10001@vitbhopal.ac.in",
      fullName: "Alice",
      regNo: "23BCE10001",
      roles: ["student"],
    });
  });

  it.each([
    ["missing header", undefined],
    ["wrong scheme", "Basic abc"],
    ["garbage token", "Bearer not.a.jwt"],
  ])("rejects %s with 401", async (_label, header) => {
    const res = await me(header);
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects expired, foreign-signed, wrong-issuer and wrong-audience tokens", async () => {
    const tokens = [
      await token({}, { expiresIn: "-10m" }),
      await token({}, { key: otherKey }),
      await token({}, { issuer: "https://other.supabase.co/auth/v1" }),
      await token({}, { audience: "anon" }),
    ];
    for (const t of tokens) {
      const res = await me(`Bearer ${t}`);
      expect(res.status).toBe(401);
    }
  });

  it("explains expired sessions", async () => {
    const res = await me(`Bearer ${await token({}, { expiresIn: "-10m" })}`);
    expect((await json(res)).error.message).toMatch(/expired/);
  });

  it("rejects anon-role, anonymous-user and non-UUID subjects", async () => {
    for (const claims of [{ role: "anon" }, { is_anonymous: true }, { sub: "not-a-uuid" }]) {
      const res = await me(`Bearer ${await token(claims)}`);
      expect(res.status).toBe(401);
    }
  });

  it.each(["alice@gmail.com", "alice@vitbhopal.ac.in.example.com", "alice@sub.vitbhopal.ac.in"])(
    "rejects a validly signed token for %s",
    async (email) => {
      const res = await me(`Bearer ${await token({ email })}`);
      expect(res.status).toBe(403);
      expect((await json(res)).error.code).toBe("EMAIL_DOMAIN_NOT_ALLOWED");
    },
  );

  it("rejects HS256 tokens when no legacy secret is configured", async () => {
    const hs = await new SignJWT({ role: "authenticated", email: "alice.23bce10001@vitbhopal.ac.in" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("x".repeat(40)));
    expect((await me(`Bearer ${hs}`)).status).toBe(401);
  });
});

describe("authorization", () => {
  function guarded(roles: Role[]) {
    let roleCalls = 0;
    const data = {
      get roleCalls() {
        return roleCalls;
      },
      getRoles: async () => {
        roleCalls += 1;
        return roles;
      },
    };
    const config = loadConfig(baseEnv());
    const app = new Hono<AppEnv>();
    app.onError((err, c) => c.json({ code: (err as { code?: string }).code }, (err as { status?: number }).status as 403));
    app.use("*", requireAuth(createTokenVerifier(config, jwks)));
    app.get("/admin", createRoleGuard(data.getRoles)("sports_admin"), (c) => c.text("ok"));
    app.get("/scan", createRoleGuard(data.getRoles)("guard", "sports_admin"), (c) => c.text("ok"));
    return { app, data };
  }

  it("lets only the listed roles through", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    expect((await guarded(["student"]).app.request("/admin", { headers: auth })).status).toBe(403);
    expect((await guarded(["guard"]).app.request("/admin", { headers: auth })).status).toBe(403);
    expect((await guarded(["guard"]).app.request("/scan", { headers: auth })).status).toBe(200);
    expect((await guarded(["sports_admin"]).app.request("/admin", { headers: auth })).status).toBe(200);
  });

  it("caches role lookups per user", async () => {
    const { app, data } = guarded(["sports_admin"]);
    const auth = { Authorization: `Bearer ${await token()}` };
    await app.request("/admin", { headers: auth });
    await app.request("/admin", { headers: auth });
    expect(data.roleCalls).toBe(1);
  });
});

describe("abuse protection and error format", () => {
  it("rate-limits per user and returns Retry-After", async () => {
    const app = makeApp();
    const headers = { Authorization: `Bearer ${await token()}` };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await app.request("/v1/me", { headers })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    const res = await app.request("/v1/me", { headers });
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await json(res)).error.code).toBe("RATE_LIMITED");
  });

  it("does not let one shared IP (campus Wi-Fi) lock out other students", async () => {
    const app = makeApp();
    // Five students behind one IP, each using their full per-user allowance.
    for (let s = 0; s < 5; s++) {
      const headers = { Authorization: `Bearer ${await token({ sub: `00000000-0000-4000-8000-00000000000${s}` })}` };
      for (let i = 0; i < 5; i++) expect((await app.request("/v1/me", { headers })).status).toBe(200);
    }
  });

  it("still stops a flood from one IP", async () => {
    const app = makeApp({ RATE_LIMIT_PER_IP_PER_MINUTE: "3" });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await app.request("/health")).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("rejects oversized bodies with 413", async () => {
    const res = await makeApp().request("/v1/me", {
      method: "POST",
      body: "x".repeat(2048),
      headers: { "Content-Type": "text/plain", "Content-Length": "2048" },
    });
    expect(res.status).toBe(413);
    expect((await json(res)).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns a consistent 404 body and security headers", async () => {
    const res = await makeApp().request("/nope");
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body).toEqual({ error: { code: "NOT_FOUND", message: "Not found.", requestId: expect.any(String) } });
    expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("hides internal errors behind a generic 500", async () => {
    const db = fakeDb();
    db.fail = new Error("connection to 10.0.0.5 failed: password authentication failed");
    const res = await makeApp({}, db).request("/v1/me", { headers: { Authorization: `Bearer ${await token()}` } });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("10.0.0.5");
    expect(JSON.parse(text).error.code).toBe("INTERNAL");
  });

  it("serves an unauthenticated health check", async () => {
    const res = await makeApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
