import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWTVerifyGetKey } from "jose";
import type { ApiErrorBody, AvailabilityEntry, BookingDto, ProfileDto, ResourceDto } from "@vitb/shared";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createTokenVerifier } from "../src/lib/auth";
import { pgliteDb } from "./support/pglite-db";
import { createAuthUser, createDb } from "../../../supabase/tests/db";

/*
 * End-to-end through the HTTP API and the real SQL migrations. PostgREST is
 * replaced by a PGlite adapter that calls the same functions with the same
 * JWT claims, so the API's routing, validation, auth and error mapping are
 * exercised against the real booking rules.
 */

const SUPABASE_URL = "https://project-ref.supabase.co";
let pg: PGlite;
let key: CryptoKey;
let jwks: JWTVerifyGetKey;
let app: ReturnType<typeof createApp>;
const ids: Record<string, string> = {};
let resources: ResourceDto[] = [];

async function tokenFor(name: string, email: string) {
  return new SignJWT({ role: "authenticated", email })
    .setProtectedHeader({ alg: "ES256", kid: "k" })
    .setSubject(ids[name]!)
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience("authenticated")
    .setExpirationTime("1h")
    .sign(key);
}

const tokens: Record<string, string> = {};
const resId = (facility: string, name: string) => resources.find((r) => r.facility === facility && r.name === name)!.id;

async function call<T>(method: string, path: string, opts: { as?: string; body?: unknown; key?: string | null } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.as) headers.Authorization = `Bearer ${tokens[opts.as]}`;
  if (opts.key !== null && method === "POST" && path === "/v1/bookings") headers["Idempotency-Key"] = opts.key ?? randomUUID();
  const res = await app.request(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return { status: res.status, body: (await res.json()) as T & ApiErrorBody };
}

beforeAll(async () => {
  pg = await createDb();
  await pg.exec(`
    create or replace function public.app_now() returns timestamptz language sql stable set search_path = ''
    as $$ select current_setting('test.now')::timestamptz $$;
    select set_config('test.now', '2026-10-25T06:00:00+05:30', false);
  `);

  const pair = await generateKeyPair("ES256");
  key = pair.privateKey;
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k", alg: "ES256" }] });

  const people = [
    ["alice", "alice.23bce10001@vitbhopal.ac.in"],
    ["bob", "bob.23bce10002@vitbhopal.ac.in"],
    ...Array.from({ length: 20 }, (_, i) => [`s${i}`, `s${i}.23bce3${String(i).padStart(4, "0")}@vitbhopal.ac.in`]),
  ];
  for (const [name, email] of people) {
    ids[name!] = await createAuthUser(pg, email!);
    tokens[name!] = await tokenFor(name!, email!);
  }

  const config = loadConfig({
    APP_ENV: "production",
    SUPABASE_URL,
    SUPABASE_ANON_KEY: "sb_publishable_test_key_000000",
    CORS_ALLOWED_ORIGINS: "https://sports.example.edu",
    RATE_LIMIT_PER_MINUTE: "1000",
  });
  app = createApp({ config, verifyToken: createTokenVerifier(config, jwks), db: pgliteDb(pg) });
  resources = (await call<ResourceDto[]>("GET", "/v1/facilities")).body as ResourceDto[];
});

describe("public endpoints", () => {
  it("lists bookable resources without signing in", () => {
    expect(resources.map((r) => `${r.facility}:${r.name}`).sort()).toEqual([
      "pickleball:Court 1", "pickleball:Court 2", "tennis:Court 1", "tennis:Court 2", "turf:Full turf",
    ]);
  });

  it("lets clients cache facility configuration but never availability", async () => {
    const facilities = await app.request("/v1/facilities");
    expect(facilities.headers.get("cache-control")).toBe("public, max-age=300");
    const avail = await app.request("/v1/availability?facility=tennis&from=2026-10-25&to=2026-10-26");
    expect(avail.headers.get("cache-control")).toBe("no-store");
  });

  it("validates availability queries", async () => {
    const bad = await call("GET", "/v1/availability?facility=gym&from=2026-10-25&to=2026-10-26");
    expect(bad.status).toBe(422);
    const tooLong = await call("GET", "/v1/availability?facility=tennis&from=2026-10-01&to=2026-10-30");
    expect(tooLong.status).toBe(422);
  });
});

describe("booking through the API", () => {
  const body = () => ({ resourceId: resId("tennis", "Court 1"), date: "2026-10-26", slotIndex: 4, participantCount: 2 });

  it("requires sign-in and an Idempotency-Key", async () => {
    expect((await call("POST", "/v1/bookings", { body: body() })).status).toBe(401);
    const noKey = await call("POST", "/v1/bookings", { as: "alice", body: body(), key: null });
    expect(noKey.status).toBe(422);
    expect(noKey.body.error.message).toMatch(/Idempotency-Key/);
  });

  it("rejects malformed bodies with field details", async () => {
    const res = await call("POST", "/v1/bookings", {
      as: "alice",
      body: { resourceId: "nope", date: "2026-02-30", slotIndex: 13, extra: true },
    });
    expect(res.status).toBe(422);
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["resourceId", "date", "slotIndex"]));
  });

  it("books, is idempotent, and reports SLOT_TAKEN to the next person", async () => {
    const k = randomUUID();
    const first = await call<BookingDto>("POST", "/v1/bookings", { as: "alice", body: body(), key: k });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ facility: "tennis", resource: "Court 1", slotIndex: 4, status: "confirmed" });

    const retry = await call<BookingDto>("POST", "/v1/bookings", { as: "alice", body: body(), key: k });
    expect(retry.body.id).toBe(first.body.id);

    const taken = await call("POST", "/v1/bookings", { as: "bob", body: body() });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toMatchObject({ code: "SLOT_TAKEN", message: expect.stringMatching(/just booked/) });

    const avail = await call<AvailabilityEntry[]>("GET", "/v1/availability?facility=tennis&from=2026-10-26&to=2026-10-26");
    expect(avail.body).toEqual([{ resourceId: resId("tennis", "Court 1"), date: "2026-10-26", slotIndex: 4, state: "booked" }]);
  });

  it("gives exactly one winner when 20 students request the same slot at once", async () => {
    const target = { resourceId: resId("pickleball", "Court 2"), date: "2026-10-27", slotIndex: 10, participantCount: 2 };
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => call("POST", "/v1/bookings", { as: `s${i}`, body: target })),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === "SLOT_TAKEN")).toBe(true);
  });

  it("lists and cancels the caller's own bookings only", async () => {
    const mine = await call<BookingDto[]>("GET", "/v1/bookings", { as: "alice" });
    expect(mine.body.length).toBeGreaterThan(0);
    const target = mine.body[0]!;

    const notYours = await call("POST", `/v1/bookings/${target.id}/cancel`, { as: "bob" });
    expect(notYours.status).toBe(404);
    const garbage = await call("POST", `/v1/bookings/not-a-uuid/cancel`, { as: "bob" });
    expect(garbage.status).toBe(404);

    const cancelled = await call<BookingDto>("POST", `/v1/bookings/${target.id}/cancel`, { as: "alice" });
    expect(cancelled.body.status).toBe("cancelled");
    const bobs = await call<BookingDto[]>("GET", "/v1/bookings", { as: "bob" });
    expect(bobs.body.find((b) => b.id === target.id)).toBeUndefined();
  });

  it("maps rule failures to stable error codes", async () => {
    const closedTurf = await call("POST", "/v1/bookings", {
      as: "alice",
      body: { resourceId: resId("turf", "Full turf"), date: "2026-10-31", slotIndex: 2, participantRegNos: [] },
    });
    expect(closedTurf.status).toBe(409);
    expect(closedTurf.body.error.code).toBe("BOOKING_WINDOW_CLOSED");

    const noReg = await call("POST", "/v1/bookings", {
      as: "alice",
      body: { resourceId: resId("turf", "Full turf"), date: "2026-10-26", slotIndex: 2, participantRegNos: [] },
    });
    expect(noReg.body.error.code).toBe("PROFILE_INCOMPLETE");
  });
});

describe("profile", () => {
  it("sets the registration number once and reports clear errors", async () => {
    const set = await call<ProfileDto>("PATCH", "/v1/me", { as: "bob", body: { fullName: "Bob B", regNo: "23bce10002" } });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ fullName: "Bob B", regNo: "23BCE10002", roles: ["student"] });

    const change = await call("PATCH", "/v1/me", { as: "bob", body: { regNo: "23BCE10009" } });
    expect(change.status).toBe(403);
    expect(change.body.error.message).toMatch(/already set/);

    const dupe = await call("PATCH", "/v1/me", { as: "alice", body: { regNo: "23BCE10002" } });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.message).toMatch(/another account/);

    const bad = await call("PATCH", "/v1/me", { as: "alice", body: { regNo: "nope" } });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).not.toMatch(/profiles_|constraint/);
  });

  it("returns unregistered turf players in error details so the organiser can fix them", async () => {
    await call("PATCH", "/v1/me", { as: "alice", body: { regNo: "23BCE10001" } });
    const res = await call("POST", "/v1/bookings", {
      as: "alice",
      body: {
        resourceId: resId("turf", "Full turf"),
        date: "2026-10-26",
        slotIndex: 3,
        participantRegNos: ["23BCE10001", "23BCE10002", ...Array.from({ length: 8 }, (_, i) => `23BCE9900${i}`)],
      },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual({ unregistered: Array.from({ length: 8 }, (_, i) => `23BCE9900${i}`) });
  });
});
