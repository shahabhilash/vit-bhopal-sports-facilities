import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createAuthUser, createDb, expectDenied, pinClock, setNow, type Actor } from "./db";

let db: PGlite;
const u: Record<string, string> = {};
const res: Record<string, string> = {};
type Json = Record<string, unknown>;
const actor = (name: string): Actor => ({ role: "authenticated", sub: u[name]! });

async function rpc<T = Json>(who: string, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await as(db, actor(who), (tx) => tx.query<{ r: T }>(`select ${sql} as r`, params));
  return rows[0]!.r;
}
const book = (who: string, resource: string, date: string, slot: number, count = 2) =>
  rpc<Json>(who, `public.create_booking($1::uuid, $2::date, $3::smallint, $4::smallint, null, $5::uuid)`, [
    res[resource], date, slot, count, randomUUID(),
  ]);
const exists = async (id: unknown) => (await db.query(`select 1 from public.bookings where id = $1`, [id])).rows.length === 1;
const retention = async () => (await db.query<{ r: Json }>(`select public.run_retention() as r`)).rows[0]!.r;
const analytics = (from: string, to: string) => rpc<{ byFacility: Json[]; daily: Json[]; bySlot: Json[]; heatmap: Json[] }>("admin", `public.admin_analytics($1::date, $2::date)`, [from, to]);

let completed: Json;
let noShow: Json;
let cancelled: Json;
let upcoming: Json;

beforeAll(async () => {
  db = await createDb();
  await pinClock(db, "2026-11-02T08:00:00+05:30"); // Monday
  for (const [i, name] of ["alice", "bob", "carol", "dave", "guard", "admin"].entries()) {
    u[name] = await createAuthUser(db, `${name}.23bce1${String(i).padStart(4, "0")}@vitbhopal.ac.in`, { meta: { full_name: name } });
  }
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'guard'), ($2, 'sports_admin')`, [u.guard, u.admin]);
  const { rows } = await db.query<{ facility_code: string; name: string; id: string }>(`select facility_code, name, id from public.facility_resources`);
  for (const r of rows) res[`${r.facility_code}:${r.name}`] = r.id;

  // Tue 3 Nov: alice completes (with an issue report), bob no-shows, carol cancels.
  completed = await book("alice", "tennis:Court 1", "2026-11-03", 3, 4);
  noShow = await book("bob", "tennis:Court 2", "2026-11-03", 3);
  cancelled = await book("carol", "pickleball:Court 1", "2026-11-03", 5);
  await rpc("carol", `public.cancel_booking($1::uuid)`, [cancelled.id]);
  const pass = await rpc<{ code: string }>("alice", `public.my_booking_pass($1::uuid)`, [completed.id]);
  await rpc("bob", `public.my_booking_pass($1::uuid)`, [noShow.id]);

  await setNow(db, "2026-11-03T10:25:00+05:30");
  await rpc("guard", `public.guard_check_in($1)`, [pass.code]);
  await rpc("alice", `public.check_out($1::uuid, 'issue', 'Baseline paint is peeling on court 1.')`, [completed.id]);
  await setNow(db, "2026-11-03T10:46:00+05:30");
  await db.query(`select public.release_no_shows()`);

  // Still in the future at the end of the test: must never be touched.
  await setNow(db, "2026-11-03T12:00:00+05:30");
  upcoming = await book("dave", "pickleball:Court 2", "2026-11-09", 6);
});

describe("retention", () => {
  it("keeps everything for 10 days", async () => {
    await setNow(db, "2026-11-13T10:00:00+05:30"); // 9 days 23+ hours after checkout / slot end
    const r = await retention();
    expect(r.bookings).toBe(0);
    for (const b of [completed, noShow, cancelled]) expect(await exists(b.id)).toBe(true);
  });

  it("deletes finished bookings after 10 days and leaves upcoming ones alone", async () => {
    const before = await analytics("2026-11-03", "2026-11-03");
    // 10 days after the latest of: checkout 10:25, no-show slot end 11:30, cancelled slot end 13:30.
    await setNow(db, "2026-11-13T13:31:00+05:30");
    const r = await retention();
    expect(r.bookings).toBe(3);
    for (const b of [completed, noShow, cancelled]) expect(await exists(b.id)).toBe(false);
    expect(await exists(upcoming.id)).toBe(true);

    // Participants and passes went with their bookings.
    const left = await db.query(`select 1 from public.booking_participants where booking_id = any($1::uuid[])`, [[completed.id, noShow.id, cancelled.id]]);
    expect(left.rows).toEqual([]);
    const passes = await db.query(`select 1 from public.booking_passes where booking_id = any($1::uuid[])`, [[completed.id, noShow.id]]);
    expect(passes.rows).toEqual([]);

    // Analytics are unchanged after the data moved into the anonymous roll-up.
    expect(await analytics("2026-11-03", "2026-11-03")).toEqual(before);
    expect((await analytics("2026-11-03", "2026-11-03")).byFacility.find((f) => f.facility === "tennis")).toMatchObject({
      bookings: 2, attended: 1, noShows: 1, playersAttended: 4,
    });
  });

  it("keeps the feedback, unlinked from the deleted booking", async () => {
    const { rows } = await db.query<{ booking_id: string | null; description: string }>(`select booking_id, description from public.facility_feedback`);
    expect(rows).toEqual([{ booking_id: null, description: "Baseline paint is peeling on court 1." }]);
  });

  it("stores no personal data in the roll-up", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'daily_usage_stats' order by ordinal_position`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      "slot_date", "facility_code", "slot_index", "bookings", "attended", "no_shows", "cancellations", "players_attended",
    ]);
  });

  it("is safe to run again: nothing is deleted or counted twice", async () => {
    const before = await analytics("2026-11-03", "2026-11-03");
    expect((await retention()).bookings).toBe(0);
    expect(await analytics("2026-11-03", "2026-11-03")).toEqual(before);
  });

  it("removes passes as soon as a booking is no longer active", async () => {
    await setNow(db, "2026-11-03T12:05:00+05:30");
    const b = await book("bob", "tennis:Court 1", "2026-11-05", 2);
    await rpc("bob", `public.my_booking_pass($1::uuid)`, [b.id]);
    await rpc("bob", `public.cancel_booking($1::uuid)`, [b.id]);
    await retention();
    expect((await db.query(`select 1 from public.booking_passes where booking_id = $1`, [b.id])).rows).toEqual([]);
    expect(await exists(b.id)).toBe(true); // the booking itself waits its 10 days
  });

  it("records each hourly run for monitoring", async () => {
    const r = (await db.query<{ r: Json }>(`select public.run_retention_job() as r`)).rows[0]!.r;
    expect(r.ok).toBe(true);
    const { rows } = await db.query<{ job: string; ok: boolean }>(`select job, ok from public.job_runs where job = 'retention'`);
    expect(rows).toEqual([{ job: "retention", ok: true }]);
  });

  it("cannot be triggered by students or the admin through the API roles", async () => {
    for (const who of ["alice", "admin"]) {
      await expectDenied(as(db, actor(who), (tx) => tx.query(`select public.run_retention()`)));
      await expectDenied(as(db, actor(who), (tx) => tx.query(`select public.run_retention_job()`)));
      await expectDenied(as(db, actor(who), (tx) => tx.query(`select public.orphan_feedback_photos(10)`)));
    }
    await expectDenied(as(db, { role: "anon" }, (tx) => tx.query(`select * from public.daily_usage_stats`)));
    expect((await as(db, actor("alice"), (tx) => tx.query(`select * from public.daily_usage_stats`))).rows).toEqual([]);
  });
});

describe("monitoring", () => {
  it("exposes only a heartbeat anonymously", async () => {
    await setNow(db, "2026-11-13T12:00:00+05:30");
    await db.query(`select public.run_scheduled_jobs()`);
    const { rows } = await as(db, { role: "anon" }, (tx) => tx.query<{ r: Json }>(`select public.job_heartbeat() as r`));
    expect(rows[0]!.r).toEqual({ lastOkAt: expect.any(String), lastRetentionOkAt: expect.any(String), recentFailures: 0 });
  });

  it("shows recent runs to the admin only", async () => {
    const runs = await rpc<Json[]>("admin", `public.admin_job_runs()`);
    expect(runs.map((r) => r.job)).toEqual(expect.arrayContaining(["every_minute", "retention"]));
    await expectDenied(rpc("alice", `public.admin_job_runs()`));
  });

  it("orphan photo lookup is a no-op without Supabase Storage", async () => {
    expect((await db.query<{ r: string[] }>(`select public.orphan_feedback_photos(10) as r`)).rows[0]!.r).toEqual([]);
  });
});
