import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createAuthUser, createDb, expectCode, expectDenied, pinClock, setNow, type Actor } from "./db";

let db: PGlite;
const u: Record<string, string> = {};
const res: Record<string, string> = {};

// Monday 26 Oct 2026, 08:00 IST.
const BASE = "2026-10-26T08:00:00+05:30";
const ist = (date: string, hhmm: string) => `${date}T${hhmm}:00+05:30`;
const actor = (name: string): Actor => ({ role: "authenticated", sub: u[name]! });

type Json = Record<string, unknown>;

async function rpc<T = Json>(who: string, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await as(db, actor(who), (tx) => tx.query<{ r: T }>(`select ${sql} as r`, params));
  return rows[0]!.r;
}

const book = (who: string, resource: string, date: string, slot: number, count = 2) =>
  rpc<Json>(who, `public.create_booking($1::uuid, $2::date, $3::smallint, $4::smallint, null, $5::uuid)`, [
    res[resource], date, slot, count, randomUUID(),
  ]);
const pass = (who: string, id: unknown) => rpc<{ code: string }>(who, `public.my_booking_pass($1::uuid)`, [id]);
const scan = (who: string, code: string) => rpc<Json>(who, `public.guard_check_in($1)`, [code]);
const join = (who: string, resource: string, date: string, slot: number, count = 2) =>
  rpc<Json>(who, `public.join_waitlist($1::uuid, $2::date, $3::smallint, $4::smallint, null)`, [res[resource], date, slot, count]);
const cancel = (who: string, id: unknown) => rpc<Json>(who, `public.cancel_booking($1::uuid)`, [id]);
const accept = (who: string, id: unknown) => rpc<Json>(who, `public.accept_offer($1::uuid)`, [id]);
const leave = (who: string, id: unknown) => rpc<Json>(who, `public.leave_waitlist($1::uuid)`, [id]);
const entry = async (id: unknown) =>
  (await db.query<{ status: string; offer_expires_at: Date | null }>(`select status, offer_expires_at from public.waitlist_entries where id = $1`, [id])).rows[0]!;
const status = async (id: unknown) =>
  (await db.query<{ status: string }>(`select status from public.bookings where id = $1`, [id])).rows[0]!.status;
const job = async (name: string) => (await db.query<{ n: number }>(`select public.${name}() as n`)).rows[0]!.n;

beforeAll(async () => {
  db = await createDb();
  await pinClock(db, BASE);
  const people = ["alice", "bob", "carol", "dave", "erin", "frank", "gita", "guard", "admin"];
  for (const [i, name] of people.entries()) {
    u[name] = await createAuthUser(db, `${name}.23bce1${String(i).padStart(4, "0")}@vitbhopal.ac.in`, { meta: { full_name: name } });
    await db.query(`update public.profiles set reg_no = $1 where id = $2`, [`23BCE1${String(i).padStart(4, "0")}`, u[name]]);
  }
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'guard'), ($2, 'sports_admin')`, [u.guard, u.admin]);
  const { rows } = await db.query<{ facility_code: string; name: string; id: string }>(`select facility_code, name, id from public.facility_resources`);
  for (const r of rows) res[`${r.facility_code}:${r.name}`] = r.id;
});

beforeEach(async () => {
  await setNow(db, BASE);
});

describe("booking passes", () => {
  it("gives the owner a stable, unguessable code with no personal data", async () => {
    const b = await book("alice", "tennis:Court 1", "2026-10-26", 3);
    const first = await pass("alice", b.id);
    expect(first.code).toMatch(/^VITB1\.[0-9a-f]{64}$/);
    expect(first.code).not.toContain(String(b.id).replace(/-/g, ""));
    expect((await pass("alice", b.id)).code).toBe(first.code);
  });

  it("is refused to other students and for cancelled bookings", async () => {
    const b = await book("bob", "tennis:Court 2", "2026-10-28", 6);
    await expectCode(pass("carol", b.id), "VB008");
    await cancel("bob", b.id);
    await expectCode(pass("bob", b.id), "VB009");
  });

  it("is never readable from the table directly", async () => {
    await expectDenied(as(db, actor("alice"), (tx) => tx.query(`select * from public.booking_passes`)));
    await expectDenied(as(db, actor("guard"), (tx) => tx.query(`select * from public.booking_passes`)));
  });
});

describe("guard check-in", () => {
  it("is only available to guards and admins", async () => {
    await expectDenied(scan("alice", "VITB1." + "0".repeat(64)));
  });

  it("reports invalid and malformed codes", async () => {
    expect(await scan("guard", "VITB1." + "a".repeat(64))).toEqual({ result: "invalid" });
    expect(await scan("guard", "https://evil.example/?x=1")).toEqual({ result: "invalid" });
    expect(await scan("guard", "")).toEqual({ result: "invalid" });
  });

  it("enforces the window from 10 minutes before to 15 minutes after the start", async () => {
    // Slot 3 starts at 10:30 IST.
    const b = await book("carol", "pickleball:Court 1", "2026-10-26", 3);
    const { code } = await pass("carol", b.id);

    await setNow(db, ist("2026-10-26", "10:19"));
    expect(await scan("guard", code)).toMatchObject({ result: "too_early", opensAt: "2026-10-26T04:50:00.000Z" });

    await setNow(db, ist("2026-10-26", "10:20"));
    const ok = await scan("guard", code);
    expect(ok).toMatchObject({
      result: "checked_in",
      booking: { facility: "pickleball", resource: "Court 1", slotIndex: 3, participants: 2, ownerName: "carol", ownerRegNo: "23BCE10002" },
    });
    expect(JSON.stringify(ok)).not.toMatch(/@vitbhopal/);
    expect(await status(b.id)).toBe("checked_in");

    // A second scan is reported, not applied again.
    expect(await scan("guard", code)).toMatchObject({ result: "already_checked_in" });
  });

  it("accepts a scan at exactly start + 15:00 and rejects one a second later", async () => {
    const b1 = await book("dave", "pickleball:Court 2", "2026-10-26", 4); // 11:30
    const b2 = await book("erin", "tennis:Court 2", "2026-10-26", 4);
    const c1 = (await pass("dave", b1.id)).code;
    const c2 = (await pass("erin", b2.id)).code;
    await setNow(db, ist("2026-10-26", "11:45"));
    expect((await scan("guard", c1)).result).toBe("checked_in");
    await setNow(db, "2026-10-26T11:45:01+05:30");
    expect((await scan("guard", c2)).result).toBe("expired");
    expect(await status(b2.id)).toBe("confirmed"); // the scan itself never changes a late booking
  });

  it("rejects bookings for another day and cancelled bookings", async () => {
    const tomorrow = await book("frank", "tennis:Court 1", "2026-10-27", 5);
    expect((await scan("guard", (await pass("frank", tomorrow.id)).code)).result).toBe("wrong_day");

    const b = await book("gita", "tennis:Court 1", "2026-10-26", 12);
    const { code } = await pass("gita", b.id);
    await cancel("gita", b.id);
    expect((await scan("guard", code)).result).toBe("cancelled");
  });

  it("logs every scan; only the admin can read the log", async () => {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.check_in_events where guard_id = $1`, [u.guard]);
    expect(rows[0]!.n).toBeGreaterThanOrEqual(8);
    const student = await as(db, actor("alice"), (tx) => tx.query(`select * from public.check_in_events`));
    expect(student.rows).toEqual([]);
    const admin = await as(db, actor("admin"), (tx) => tx.query(`select * from public.check_in_events`));
    expect(admin.rows.length).toBe(rows[0]!.n);
  });
});

describe("no-show release", () => {
  it("releases unclaimed bookings after start + 15:00, frees the slot, and is idempotent", async () => {
    const b = await book("frank", "pickleball:Court 2", "2026-10-26", 5); // 12:30
    await setNow(db, ist("2026-10-26", "12:45"));
    await job("release_no_shows");
    expect(await status(b.id)).toBe("confirmed"); // exactly start + 15:00 is still in time
    await setNow(db, "2026-10-26T12:45:01+05:30");
    expect(await job("release_no_shows")).toBeGreaterThanOrEqual(1);
    expect(await status(b.id)).toBe("no_show");
    expect(await job("release_no_shows")).toBe(0);

    // The participant slot is released too (same time, other facility).
    await setNow(db, ist("2026-10-26", "12:40"));
    const { rows } = await db.query<{ active: boolean }>(`select active from public.booking_participants where booking_id = $1`, [b.id]);
    expect(rows.every((r) => !r.active)).toBe(true);
  });

  it("never releases a booking that was checked in first", async () => {
    const b = await book("bob", "pickleball:Court 1", "2026-10-26", 6); // 13:30
    const { code } = await pass("bob", b.id);
    await setNow(db, ist("2026-10-26", "13:44"));
    expect((await scan("guard", code)).result).toBe("checked_in");
    await setNow(db, ist("2026-10-26", "13:50"));
    await job("release_no_shows");
    expect(await status(b.id)).toBe("checked_in");
  });

  it("a scan after the release is reported as expired", async () => {
    const b = await book("carol", "tennis:Court 1", "2026-10-26", 7); // 14:30
    const { code } = await pass("carol", b.id);
    await setNow(db, ist("2026-10-26", "14:46"));
    await job("release_no_shows");
    expect((await scan("guard", code)).result).toBe("expired");
  });

  it("auto-completes sessions still checked in after the slot ends", async () => {
    const b = await book("dave", "tennis:Court 2", "2026-10-26", 8); // 15:30
    await setNow(db, ist("2026-10-26", "15:25"));
    await scan("guard", (await pass("dave", b.id)).code);
    await setNow(db, ist("2026-10-26", "16:29"));
    await job("auto_check_out");
    expect(await status(b.id)).toBe("checked_in");
    await setNow(db, ist("2026-10-26", "16:30"));
    await job("auto_check_out");
    expect(await status(b.id)).toBe("completed");
  });
});

describe("check-out and feedback", () => {
  it("completes a checked-in session and stores feedback that only the admin can read", async () => {
    const b = await book("erin", "pickleball:Court 2", "2026-10-26", 9); // 16:30
    await setNow(db, ist("2026-10-26", "16:31"));
    await scan("guard", (await pass("erin", b.id)).code);

    await expectCode(rpc("erin", `public.check_out($1::uuid, 'issue', 'short')`, [b.id]), "VB005");
    await expectCode(rpc("frank", `public.check_out($1::uuid, 'good', null)`, [b.id]), "VB008");
    const done = await rpc<Json>("erin", `public.check_out($1::uuid, 'issue', 'Net on court 2 is torn near the post.')`, [b.id]);
    expect(done.status).toBe("completed");
    await expectCode(rpc("erin", `public.check_out($1::uuid, 'good', null)`, [b.id]), "VB009");

    await expectDenied(as(db, actor("erin"), (tx) => tx.query(`insert into public.facility_feedback (facility_code, slot_date, rating) values ('tennis', '2026-10-26', 'good')`)));
    expect((await as(db, actor("erin"), (tx) => tx.query(`select * from public.facility_feedback`))).rows).toEqual([]);
    const admin = await as(db, actor("admin"), (tx) => tx.query<{ description: string }>(`select description from public.facility_feedback`));
    expect(admin.rows.map((r) => r.description)).toContain("Net on court 2 is torn near the post.");
  });

  it("keeps feedback when the booking is deleted by retention", async () => {
    const { rows } = await db.query<{ booking_id: string }>(`select booking_id from public.facility_feedback where booking_id is not null limit 1`);
    await db.query(`delete from public.bookings where id = $1`, [rows[0]!.booking_id]);
    const left = await db.query(`select 1 from public.facility_feedback where booking_id is null and description like 'Net on court 2%'`);
    expect(left.rows).toHaveLength(1);
  });

  it("cannot check out a session that was never checked in", async () => {
    const b = await book("frank", "pickleball:Court 1", "2026-10-28", 2);
    await expectCode(rpc("frank", `public.check_out($1::uuid, 'good', null)`, [b.id]), "VB009");
  });
});

describe("waiting list", () => {
  // Wednesday 28 Oct, slot 10 (17:30) on tennis court 1: booked by alice.
  const date = "2026-10-28";
  let held: Json;

  beforeAll(async () => {
    await setNow(db, BASE);
    held = await book("alice", "tennis:Court 1", date, 10);
  });

  it("only accepts joins for taken slots, more than 2 hours ahead, once per person", async () => {
    await expectCode(join("bob", "tennis:Court 2", date, 10), "VB005", /open/);
    await expectCode(join("alice", "tennis:Court 1", date, 10), "VB004");
    const first = await join("bob", "tennis:Court 1", date, 10);
    expect(first).toMatchObject({ status: "waiting", position: 1 });
    expect(await join("carol", "tennis:Court 1", date, 10)).toMatchObject({ position: 2 });
    expect(await join("dave", "tennis:Court 1", date, 10)).toMatchObject({ position: 3 });
    await expectCode(join("bob", "tennis:Court 1", date, 10), "VB004", /already on the waiting list/);
    await setNow(db, ist(date, "15:31"));
    await expectCode(join("erin", "tennis:Court 1", date, 10), "VB002", /2 hours/);
  });

  it("offers a cancelled slot to the first in line and holds it for them", async () => {
    await cancel("alice", held.id);
    const [bob] = (await rpc<Json[]>("bob", `public.my_waitlist()`));
    expect(bob).toMatchObject({ status: "offered", offerExpiresAt: "2026-10-26T02:40:00.000Z" });

    // Nobody else can take it, and availability shows it as held.
    await expectCode(book("frank", "tennis:Court 1", date, 10), "VB001", /waiting list/);
    await expectCode(book("carol", "tennis:Court 1", date, 10), "VB001");
    const avail = await rpc<Json[]>("frank", `public.get_availability('tennis', $1::date, $1::date)`, [date]);
    expect(avail).toContainEqual(expect.objectContaining({ slotIndex: 10, state: "booked", label: "Held for the waiting list" }));
  });

  it("moves the offer on when it expires", async () => {
    const [bob] = await rpc<Json[]>("bob", `public.my_waitlist()`);
    await setNow(db, "2026-10-26T08:10:00+05:30");
    expect(await job("expire_offers")).toBe(1);
    expect((await entry(bob!.id)).status).toBe("expired");
    await expectCode(accept("bob", bob!.id), "VB011");
    const [carol] = await rpc<Json[]>("carol", `public.my_waitlist()`);
    expect(carol).toMatchObject({ status: "offered" });
  });

  it("moves the offer on when it is declined", async () => {
    await setNow(db, "2026-10-26T08:11:00+05:30");
    const [carol] = await rpc<Json[]>("carol", `public.my_waitlist()`);
    await leave("carol", carol!.id);
    const [dave] = await rpc<Json[]>("dave", `public.my_waitlist()`);
    expect(dave).toMatchObject({ status: "offered" });
  });

  it("turns an accepted offer into a confirmed booking", async () => {
    await setNow(db, "2026-10-26T08:12:00+05:30");
    const [dave] = await rpc<Json[]>("dave", `public.my_waitlist()`);
    const r = await accept("dave", dave!.id);
    expect(r).toMatchObject({ accepted: true, booking: { status: "confirmed", slotIndex: 10, isOwner: true } });
    expect((await entry(dave!.id)).status).toBe("accepted");
    // Accepting again is harmless.
    expect(await accept("dave", dave!.id)).toMatchObject({ accepted: true });
  });

  it("passes over a student who can no longer take the slot", async () => {
    // Pickleball court 2, Thu 29 Oct slot 2: owned by gita; erin then frank wait.
    await setNow(db, BASE);
    const g = await book("gita", "pickleball:Court 2", "2026-10-29", 2);
    const erin = await join("erin", "pickleball:Court 2", "2026-10-29", 2);
    await join("frank", "pickleball:Court 2", "2026-10-29", 2);
    // Meanwhile erin books another pickleball slot that day (one per sport per day).
    await book("erin", "pickleball:Court 1", "2026-10-29", 8);
    await cancel("gita", g.id);
    const r = await accept("erin", erin.id);
    expect(r).toMatchObject({ accepted: false, error: { code: "VB004" } });
    const [frank] = (await rpc<Json[]>("frank", `public.my_waitlist()`)).filter((e) => e.date === "2026-10-29");
    expect(frank).toMatchObject({ status: "offered" });
  });

  it("does not offer late releases; the slot is simply open", async () => {
    // Slot 12 (19:30) today, cancelled at 17:31: less than 2 hours ahead.
    const b = await book("alice", "pickleball:Court 1", "2026-10-26", 12);
    await join("bob", "pickleball:Court 1", "2026-10-26", 12);
    // Cancel is allowed (more than 1 hour ahead) but less than 2 hours remain.
    await setNow(db, ist("2026-10-26", "17:45"));
    await cancel("alice", b.id);
    const [bob] = (await rpc<Json[]>("bob", `public.my_waitlist()`)).filter((e) => e.date === "2026-10-26");
    expect(bob).toMatchObject({ status: "waiting" });
    const taken = await book("gita", "pickleball:Court 1", "2026-10-26", 12);
    expect(taken.status).toBe("confirmed");
    // The leftover entry is closed by the job.
    await job("expire_offers");
    expect((await entry(bob!.id)).status).toBe("expired");
  });

  it("never offers a blocked slot", async () => {
    await setNow(db, BASE);
    const b = await book("gita", "tennis:Court 2", "2026-10-30", 6);
    const w = await join("bob", "tennis:Court 2", "2026-10-30", 6);
    await db.query(
      `insert into public.facility_blocks (facility_code, resource_id, start_date, end_date, slot_indexes, reason) values ('tennis', $1, '2026-10-30', '2026-10-30', '{6}', 'maintenance')`,
      [res["tennis:Court 2"]],
    );
    await cancel("gita", b.id);
    expect((await entry(w.id)).status).toBe("waiting");
  });

  it("students see only their own entries and cannot write the table", async () => {
    const { rows } = await as(db, actor("bob"), (tx) => tx.query<{ owner_id: string }>(`select owner_id from public.waitlist_entries`));
    expect(new Set(rows.map((r) => r.owner_id))).toEqual(new Set([u.bob]));
    await expectDenied(as(db, actor("bob"), (tx) => tx.query(`update public.waitlist_entries set status = 'offered'`)));
    await expectDenied(as(db, actor("bob"), (tx) => tx.query(`delete from public.waitlist_entries`)));
  });
});

describe("scheduled jobs", () => {
  it("runs every job, records the run, and can be repeated safely", async () => {
    await setNow(db, "2026-10-31T09:00:00+05:30");
    const first = (await db.query<{ r: Json }>(`select public.run_scheduled_jobs() as r`)).rows[0]!.r;
    expect(first).toMatchObject({ ok: true });
    const second = (await db.query<{ r: Json }>(`select public.run_scheduled_jobs() as r`)).rows[0]!.r;
    expect(second).toEqual({ ok: true, release_no_shows: 0, auto_check_out: 0, expire_offers: 0 });
    const runs = await db.query(`select 1 from public.job_runs where ok`);
    expect(runs.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("job functions cannot be called by students or guards", async () => {
    for (const who of ["alice", "guard"]) {
      for (const fn of ["run_scheduled_jobs", "release_no_shows", "expire_offers", "auto_check_out"]) {
        await expectDenied(as(db, actor(who), (tx) => tx.query(`select public.${fn}()`)));
      }
    }
  });
});

describe("guard accounts", () => {
  const fakeId = "00000000-0000-0000-0000-000000000001";

  it("cannot use any student action", async () => {
    await expectDenied(book("guard", "tennis:Court 1", "2026-11-02", 4));
    await expectDenied(join("guard", "tennis:Court 1", "2026-11-02", 4));
    await expectDenied(cancel("guard", fakeId));
    await expectDenied(pass("guard", fakeId));
    await expectDenied(accept("guard", fakeId));
    await expectDenied(leave("guard", fakeId));
    await expectDenied(rpc("guard", `public.my_waitlist()`));
    await expectDenied(rpc("guard", `public.check_out($1::uuid, 'good', null)`, [fakeId]));
    await expectDenied(rpc("guard", `public.feedback_photo_target($1::uuid)`, [fakeId]));
    await expectDenied(rpc("guard", `public.set_feedback_photo($1::uuid, 'x')`, [fakeId]));
    await expectDenied(rpc("guard", `public.update_my_profile('New name', '24BCE99999')`));
  });

  it("cannot edit their profile directly or call the unguarded functions", async () => {
    const rows = await as(db, actor("guard"), (tx) =>
      tx.query(`update public.profiles set full_name = 'x' where id = $1 returning id`, [u.guard]),
    );
    expect(rows.rows).toHaveLength(0);
    await expectDenied(
      rpc("guard", `public.create_booking_unguarded($1::uuid, '2026-11-02'::date, 4::smallint, 2::smallint, null, $2::uuid)`, [
        res["tennis:Court 1"], randomUUID(),
      ]),
    );
    await expectDenied(rpc("alice", `public.my_waitlist_unguarded()`));
  });

  it("can still scan passes and read their own profile, and students and admins are unaffected", async () => {
    const b = await book("gita", "tennis:Court 2", "2026-10-26", 2);
    await setNow(db, ist("2026-10-26", "09:35"));
    expect((await scan("guard", (await pass("gita", b.id)).code)).result).toBe("checked_in");
    expect(await rpc("guard", `public.my_profile()`)).toMatchObject({ roles: ["student", "guard"] });
    expect(await rpc("admin", `public.my_waitlist()`)).toEqual([]);
  });
});
