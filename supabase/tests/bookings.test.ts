import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createAuthUser, createDb, expectDenied, type Actor } from "./db";

let db: PGlite;
const users: Record<string, string> = {};
const res: Record<string, string> = {};

// Sunday 25 Oct 2026, 06:00 IST. Turf week Sat 24 - Fri 30 is open; Sat 31 opens Fri 30 at 12:00.
const DEFAULT_NOW = "2026-10-25T06:00:00+05:30";

async function setNow(iso: string) {
  await db.query(`select set_config('test.now', $1, false)`, [iso]);
}

const student = (sub: string): Actor => ({ role: "authenticated", sub });

interface BookArgs {
  resource: string;
  date: string;
  slot: number;
  count?: number | null;
  regNos?: string[] | null;
  key?: string;
}

async function book(who: string, a: BookArgs) {
  const { rows } = await as(db, student(users[who]!), (tx) =>
    tx.query<{ r: Record<string, unknown> }>(
      `select public.create_booking($1::uuid, $2::date, $3::smallint, $4::smallint, $5::text[], $6::uuid) as r`,
      [res[a.resource], a.date, a.slot, a.count ?? null, a.regNos ?? null, a.key ?? randomUUID()],
    ),
  );
  return rows[0]!.r;
}

async function expectCode(promise: Promise<unknown>, code: string, message?: RegExp) {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; message: string; detail?: string };
    expect(e.code, e.message).toBe(code);
    if (message) expect(e.message).toMatch(message);
    return e;
  }
  throw new Error(`Expected SQLSTATE ${code}, but the call succeeded`);
}

const TURF_TEAM = Array.from({ length: 12 }, (_, i) => `23BCE2${String(i).padStart(4, "0")}`);

beforeAll(async () => {
  db = await createDb();
  // Pin the clock for every rule check.
  await db.exec(`
    create or replace function public.app_now() returns timestamptz language sql stable set search_path = ''
    as $$ select current_setting('test.now')::timestamptz $$;
  `);

  const people: [string, string, string | null][] = [
    ["alice", "alice.23bce10001@vitbhopal.ac.in", "23BCE10001"],
    ["bob", "bob.23bce10002@vitbhopal.ac.in", "23BCE10002"],
    ["carol", "carol.23bce10003@vitbhopal.ac.in", null],
    ["admin", "fr.sports@vitbhopal.ac.in", null],
    ...TURF_TEAM.map((reg, i) => [`p${i}`, `player${i}.${reg.toLowerCase()}@vitbhopal.ac.in`, reg] as [string, string, string]),
  ];
  for (const [key, email, reg] of people) {
    users[key] = await createAuthUser(db, email);
    if (reg) await db.query(`update public.profiles set reg_no = $1 where id = $2`, [reg, users[key]]);
  }
  users.unverified = await createAuthUser(db, "new.24bce10009@vitbhopal.ac.in", { confirmed: false });
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'sports_admin')`, [users.admin]);

  const { rows } = await db.query<{ facility_code: string; name: string; id: string }>(
    `select facility_code, name, id from public.facility_resources`,
  );
  for (const r of rows) res[`${r.facility_code}:${r.name}`] = r.id;
});

beforeEach(async () => {
  await setNow(DEFAULT_NOW);
});

describe("court bookings", () => {
  it("creates a confirmed booking and returns its details", async () => {
    const b = await book("alice", { resource: "pickleball:Court 1", date: "2026-10-26", slot: 3, count: 4 });
    expect(b).toMatchObject({
      facility: "pickleball",
      resource: "Court 1",
      date: "2026-10-26",
      slotIndex: 3,
      participants: 4,
      status: "confirmed",
      isOwner: true,
      startsAt: "2026-10-26T05:00:00.000Z",
    });
  });

  it("rejects a second booking of the same court and slot (SLOT_TAKEN)", async () => {
    await book("alice", { resource: "tennis:Court 1", date: "2026-10-27", slot: 5, count: 2 });
    await expectCode(book("bob", { resource: "tennis:Court 1", date: "2026-10-27", slot: 5, count: 2 }), "VB001");
    // The other court is independent.
    const other = await book("bob", { resource: "tennis:Court 2", date: "2026-10-27", slot: 5, count: 2 });
    expect(other.status).toBe("confirmed");
  });

  it("treats a retried request with the same idempotency key as the same booking", async () => {
    const key = randomUUID();
    const first = await book("bob", { resource: "pickleball:Court 2", date: "2026-10-28", slot: 2, count: 2, key });
    const retry = await book("bob", { resource: "pickleball:Court 2", date: "2026-10-28", slot: 2, count: 2, key });
    expect(retry.id).toBe(first.id);
    const { rows } = await db.query(`select 1 from public.bookings where idempotency_key = $1`, [key]);
    expect(rows).toHaveLength(1);
  });

  it("allows one booking per sport per day (LIMIT_REACHED)", async () => {
    await book("carol", { resource: "pickleball:Court 1", date: "2026-10-29", slot: 1, count: 2 });
    await expectCode(
      book("carol", { resource: "pickleball:Court 2", date: "2026-10-29", slot: 9, count: 2 }),
      "VB004",
      /already have a pickleball booking/,
    );
    // A different sport on the same day is fine, at a different time.
    await book("carol", { resource: "tennis:Court 1", date: "2026-10-29", slot: 9, count: 2 });
  });

  it("stops one person holding two facilities at the same time (PARTICIPANT_CONFLICT)", async () => {
    await book("carol", { resource: "pickleball:Court 1", date: "2026-10-30", slot: 4, count: 2 });
    await expectCode(book("carol", { resource: "tennis:Court 2", date: "2026-10-30", slot: 4, count: 2 }), "VB010");
  });

  it("enforces the 2-10 player range", async () => {
    await expectCode(book("bob", { resource: "pickleball:Court 1", date: "2026-10-31", slot: 1, count: 1 }), "VB005");
    await expectCode(book("bob", { resource: "pickleball:Court 1", date: "2026-10-31", slot: 1, count: 11 }), "VB005");
    await expectCode(book("bob", { resource: "pickleball:Court 1", date: "2026-10-31", slot: 1, count: null }), "VB005");
  });

  it("rejects slots that have started, and dates beyond the 7-day horizon", async () => {
    await setNow("2026-10-25T08:31:00+05:30");
    await expectCode(book("bob", { resource: "tennis:Court 2", date: "2026-10-25", slot: 1, count: 2 }), "VB002", /already started/);
    // Today + 6 is the last bookable day; today + 7 is not.
    await expectCode(book("bob", { resource: "tennis:Court 2", date: "2026-11-01", slot: 1, count: 2 }), "VB002", /7 days/);
    const ok = await book("bob", { resource: "tennis:Court 2", date: "2026-10-31", slot: 12, count: 2 });
    expect(ok.status).toBe("confirmed");
  });

  it("uses IST, not UTC, for 'today'", async () => {
    // 00:30 IST on 26 Oct is still 25 Oct in UTC. The horizon runs from 26 Oct.
    await setNow("2026-10-26T00:30:00+05:30");
    const ok = await book("p0", { resource: "pickleball:Court 2", date: "2026-11-01", slot: 6, count: 2 });
    expect(ok.status).toBe("confirmed");
  });

  it("requires a verified email and a signed-in user", async () => {
    await expectCode(book("unverified", { resource: "tennis:Court 1", date: "2026-10-26", slot: 8, count: 2 }), "VB006");
    await expectDenied(
      as(db, { role: "anon" }, (tx) =>
        tx.query(`select public.create_booking($1::uuid, '2026-10-26', 8::smallint, 2::smallint, null, gen_random_uuid())`, [
          res["tennis:Court 1"],
        ]),
      ),
    );
  });

  it("rejects unknown resources and slots", async () => {
    await expectCode(
      as(db, student(users.bob!), (tx) =>
        tx.query(`select public.create_booking(gen_random_uuid(), '2026-10-26', 1::smallint, 2::smallint, null, gen_random_uuid())`),
      ),
      "VB008",
    );
    await expectCode(book("bob", { resource: "tennis:Court 1", date: "2026-10-26", slot: 13, count: 2 }), "VB005");
  });
});

describe("court player lists", () => {
  it("books with one registration number per player and keeps them on the booking", async () => {
    const b = await book("alice", {
      resource: "tennis:Court 1",
      date: "2026-10-30",
      slot: 2,
      regNos: ["23bce10001", " 22MIM10045 ", "24BAI10123"],
    });
    expect(b).toMatchObject({ status: "confirmed", participants: 3 });
    const { rows } = await db.query<{ participant_reg_nos: string[] }>(
      `select participant_reg_nos from public.bookings where id = $1`,
      [b.id],
    );
    // Friends need no account here; numbers are cleaned up and kept in order.
    expect(rows[0]!.participant_reg_nos).toEqual(["23BCE10001", "22MIM10045", "24BAI10123"]);
  });

  it("rejects bad, repeated or too few numbers, and a list without the booker", async () => {
    const at = { resource: "pickleball:Court 2", date: "2026-10-30", slot: 3 };
    const bad = await expectCode(book("bob", { ...at, regNos: ["23BCE10002", "hello"] }), "VB005", /not valid/);
    expect(JSON.parse(bad.detail!)).toEqual({ invalid: ["HELLO"] });
    await expectCode(book("bob", { ...at, regNos: ["23BCE10002", "22MIM10045", "22mim10045"] }), "VB005", /only once/);
    await expectCode(book("bob", { ...at, regNos: ["23BCE10002"] }), "VB005", /2 to 10 players; you listed 1/);
    await expectCode(book("bob", { ...at, regNos: ["22MIM10045", "24BAI10123"] }), "VB005", /your own registration number/);
    // A booker with no registration number saved is sent to the Account page.
    await expectCode(book("carol", { ...at, regNos: ["23BCE10003", "22MIM10045"] }), "VB007");
  });
});

describe("maintenance and HPL blocks", () => {
  beforeAll(async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.facility_blocks (facility_code, resource_id, start_date, end_date, slot_indexes, reason)
       values ('tennis', $1, '2026-10-28', '2026-10-28', '{4,5}', 'maintenance'),
              ('pickleball', null, '2026-10-30', '2026-10-31', null, 'hpl')
       returning id`,
      [res["tennis:Court 2"]],
    );
    await db.query(`insert into public.facility_block_notes (block_id, note) values ($1, 'Net replacement, vendor ABC')`, [rows[0]!.id]);
  });

  it("rejects bookings inside a block with the public reason", async () => {
    const e = await expectCode(
      book("p1", { resource: "tennis:Court 2", date: "2026-10-28", slot: 4, count: 2 }),
      "VB003",
      /Under maintenance/,
    );
    expect(JSON.parse(e.detail ?? "{}")).toEqual({ reason: "maintenance" });
    await expectCode(book("p2", { resource: "pickleball:Court 2", date: "2026-10-31", slot: 7, count: 2 }), "VB003", /HPL/);
  });

  it("leaves unblocked slots and courts bookable", async () => {
    await book("p1", { resource: "tennis:Court 2", date: "2026-10-28", slot: 6, count: 2 });
    await book("p3", { resource: "tennis:Court 1", date: "2026-10-28", slot: 4, count: 2 });
  });

  it("hides internal notes from students but shows them to the admin", async () => {
    const studentView = await as(db, student(users.bob!), (tx) => tx.query(`select * from public.facility_block_notes`));
    expect(studentView.rows).toEqual([]);
    const adminView = await as(db, student(users.admin!), (tx) => tx.query(`select note from public.facility_block_notes`));
    expect(adminView.rows).toHaveLength(1);
    await expectDenied(as(db, { role: "anon" }, (tx) => tx.query(`select * from public.facility_block_notes`)));
  });

  it("students cannot create or remove blocks", async () => {
    await expectDenied(
      as(db, student(users.bob!), (tx) =>
        tx.query(`insert into public.facility_blocks (facility_code, start_date, end_date, reason) values ('turf', '2026-10-26', '2026-10-26', 'other')`),
      ),
    );
    await expectDenied(as(db, student(users.bob!), (tx) => tx.query(`delete from public.facility_blocks`)));
  });
});

describe("availability", () => {
  it("lists booked and blocked slots without any personal data, to anyone", async () => {
    const { rows } = await as(db, { role: "anon" }, (tx) =>
      tx.query<{ r: Record<string, unknown>[] }>(`select public.get_availability('tennis', '2026-10-27', '2026-10-28') as r`),
    );
    const entries = rows[0]!.r;
    expect(entries).toContainEqual({ resourceId: res["tennis:Court 1"], date: "2026-10-27", slotIndex: 5, state: "booked" });
    expect(entries).toContainEqual({
      resourceId: res["tennis:Court 2"], date: "2026-10-28", slotIndex: 4, state: "blocked", label: "Under maintenance",
    });
    const keys = new Set(entries.flatMap((e) => Object.keys(e)));
    expect([...keys].sort()).toEqual(["date", "label", "resourceId", "slotIndex", "state"]);
  });

  it("expands a full-day, all-court block to every slot", async () => {
    const { rows } = await as(db, { role: "anon" }, (tx) =>
      tx.query<{ r: { state: string }[] }>(`select public.get_availability('pickleball', '2026-10-30', '2026-10-30') as r`),
    );
    expect(rows[0]!.r.filter((e) => e.state === "blocked")).toHaveLength(24);
  });

  it("limits the range to 14 days", async () => {
    await expectCode(
      as(db, { role: "anon" }, (tx) => tx.query(`select public.get_availability('tennis', '2026-10-01', '2026-10-20')`)),
      "VB005",
    );
  });
});

describe("turf", () => {
  const roster = (n: number, extra: string[] = []) => ["23BCE10001", ...TURF_TEAM.slice(0, n - 1 - extra.length), ...extra];

  it("is closed until the Friday 12:00 IST release for that week", async () => {
    await expectCode(
      book("alice", { resource: "turf:Full turf", date: "2026-10-31", slot: 10, regNos: roster(10) }),
      "VB002",
      /open on Fri 30 Oct at 12:00 PM/,
    );
    await setNow("2026-10-30T11:59:59+05:30");
    await expectCode(book("alice", { resource: "turf:Full turf", date: "2026-10-31", slot: 10, regNos: roster(10) }), "VB002");
  });

  it("opens at exactly 12:00 IST on Friday", async () => {
    await setNow("2026-10-30T12:00:00+05:30");
    const b = await book("alice", { resource: "turf:Full turf", date: "2026-10-31", slot: 10, regNos: roster(10) });
    expect(b).toMatchObject({ status: "confirmed", participants: 10 });
    const { rows } = await db.query(`select 1 from public.booking_participants where booking_id = $1`, [b.id]);
    expect(rows).toHaveLength(10);
  });

  it("allows one turf booking per owner per turf week", async () => {
    await setNow("2026-10-30T12:05:00+05:30");
    await expectCode(
      book("alice", { resource: "turf:Full turf", date: "2026-11-02", slot: 3, regNos: roster(10) }),
      "VB004",
      /turf booking this week/,
    );
  });

  it("validates the roster", async () => {
    const day = "2026-10-26";
    // Fewer than 10.
    await expectCode(book("bob", { resource: "turf:Full turf", date: day, slot: 1, regNos: ["23BCE10002", ...TURF_TEAM.slice(0, 8)] }), "VB005", /10 to 26/);
    // Duplicates (after normalising case and spaces).
    const dupe = await expectCode(
      book("bob", { resource: "turf:Full turf", date: day, slot: 1, regNos: ["23BCE10002", ...TURF_TEAM.slice(0, 9), "23bce 20000"] }),
      "VB005",
    );
    expect(JSON.parse(dupe.detail!)).toEqual({ duplicates: ["23BCE20000"] });
    // Malformed.
    const bad = await expectCode(
      book("bob", { resource: "turf:Full turf", date: day, slot: 1, regNos: ["23BCE10002", ...TURF_TEAM.slice(0, 8), "XYZ"] }),
      "VB005",
    );
    expect(JSON.parse(bad.detail!)).toEqual({ invalid: ["XYZ"] });
    // Owner missing from the list.
    await expectCode(book("bob", { resource: "turf:Full turf", date: day, slot: 1, regNos: TURF_TEAM.slice(0, 10) }), "VB005", /your own/);
    // Unregistered players are listed back so the organiser can fix them.
    const unknown = await expectCode(
      book("bob", { resource: "turf:Full turf", date: day, slot: 1, regNos: ["23BCE10002", ...TURF_TEAM.slice(0, 8), "23BCE99999"] }),
      "VB005",
    );
    expect(JSON.parse(unknown.detail!)).toEqual({ unregistered: ["23BCE99999"] });
  });

  it("requires the organiser's own registration number", async () => {
    await expectCode(book("carol", { resource: "turf:Full turf", date: "2026-10-26", slot: 2, regNos: TURF_TEAM.slice(0, 10) }), "VB007");
  });

  it("stops a listed player from being booked elsewhere at the same time", async () => {
    // Bob's turf group includes p0; p0 then tries pickleball in the same slot.
    await book("bob", { resource: "turf:Full turf", date: "2026-10-27", slot: 11, regNos: ["23BCE10002", ...TURF_TEAM.slice(0, 9)] });
    await expectCode(book("p0", { resource: "pickleball:Court 1", date: "2026-10-27", slot: 11, count: 2 }), "VB010");
  });

  it("shows the booking to listed players, but not to others", async () => {
    const asP0 = await as(db, student(users.p0!), (tx) => tx.query<{ r: { facility: string; isOwner: boolean }[] }>(`select public.my_bookings() as r`));
    expect(asP0.rows[0]!.r).toContainEqual(expect.objectContaining({ facility: "turf", isOwner: false }));
    const asP11 = await as(db, student(users.p11!), (tx) => tx.query<{ r: unknown[] }>(`select public.my_bookings() as r`));
    expect(asP11.rows[0]!.r).toEqual([]);
  });
});

describe("cancellation", () => {
  it("frees the slot when cancelled more than 1 hour ahead", async () => {
    const b = await book("p4", { resource: "tennis:Court 1", date: "2026-10-26", slot: 9, count: 2 });
    const cancelled = await as(db, student(users.p4!), (tx) =>
      tx.query<{ r: { status: string } }>(`select public.cancel_booking($1) as r`, [b.id]),
    );
    expect(cancelled.rows[0]!.r.status).toBe("cancelled");
    // Slot, daily limit and participant slot are all released.
    await book("p5", { resource: "tennis:Court 1", date: "2026-10-26", slot: 9, count: 2 });
    await book("p4", { resource: "tennis:Court 2", date: "2026-10-26", slot: 9, count: 2 });
  });

  it("is idempotent", async () => {
    const b = await book("p6", { resource: "pickleball:Court 2", date: "2026-10-27", slot: 2, count: 2 });
    for (let i = 0; i < 2; i++) {
      await as(db, student(users.p6!), (tx) => tx.query(`select public.cancel_booking($1)`, [b.id]));
    }
  });

  it("closes 1 hour before the start", async () => {
    const b = await book("p7", { resource: "pickleball:Court 2", date: "2026-10-25", slot: 4, count: 2 }); // 11:30 IST
    await setNow("2026-10-25T10:30:00+05:30");
    await expectCode(as(db, student(users.p7!), (tx) => tx.query(`select public.cancel_booking($1)`, [b.id])), "VB009");
  });

  it("cannot cancel someone else's booking", async () => {
    const b = await book("p8", { resource: "pickleball:Court 1", date: "2026-10-28", slot: 8, count: 2 });
    await expectCode(as(db, student(users.alice!), (tx) => tx.query(`select public.cancel_booking($1)`, [b.id])), "VB008");
    const { rows } = await db.query<{ status: string }>(`select status from public.bookings where id = $1`, [b.id]);
    expect(rows[0]!.status).toBe("confirmed");
  });
});

describe("booking RLS and direct-write protection", () => {
  it("students cannot insert, update or delete bookings or participants directly", async () => {
    const asAlice = (sql: string, params: unknown[] = []) => as(db, student(users.alice!), (tx) => tx.query(sql, params));
    await expectDenied(
      asAlice(
        `insert into public.bookings (owner_id, facility_code, resource_id, slot_date, slot_index, starts_at, week_start, participant_count, idempotency_key)
         values ($1, 'tennis', $2, '2026-10-29', 2, now(), public.turf_week_start('2026-10-29'), 2, gen_random_uuid())`,
        [users.alice, res["tennis:Court 1"]],
      ),
    );
    await expectDenied(asAlice(`update public.bookings set status = 'checked_in'`));
    await expectDenied(asAlice(`update public.bookings set owner_id = $1`, [users.bob]));
    await expectDenied(asAlice(`delete from public.bookings`));
    await expectDenied(asAlice(`insert into public.booking_participants (booking_id, profile_id, slot_date, slot_index) select id, $1, slot_date, slot_index from public.bookings limit 1`, [users.alice]));
  });

  it("students see only bookings they own or play in", async () => {
    const { rows } = await as(db, student(users.carol!), (tx) => tx.query<{ owner_id: string }>(`select owner_id from public.bookings`));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.owner_id))).toEqual(new Set([users.carol]));
  });

  it("participants rosters are visible only to the owner, the player, and the admin", async () => {
    const asAlice = await as(db, student(users.alice!), (tx) => tx.query<{ profile_id: string }>(`select profile_id from public.booking_participants`));
    // Alice owns a 10-person turf booking: she sees its roster, but nothing of Bob's turf group.
    expect(asAlice.rows.length).toBeGreaterThanOrEqual(10);
    const asP0 = await as(db, student(users.p0!), (tx) => tx.query<{ profile_id: string }>(`select distinct profile_id from public.booking_participants`));
    expect(asP0.rows.map((r) => r.profile_id)).toEqual([users.p0]);
  });

  it("anonymous users cannot read bookings", async () => {
    await expectDenied(as(db, { role: "anon" }, (tx) => tx.query(`select * from public.bookings`)));
    await expectDenied(as(db, { role: "anon" }, (tx) => tx.query(`select public.my_bookings()`)));
  });

  it("the admin can read every booking", async () => {
    const all = await db.query<{ n: number }>(`select count(*)::int as n from public.bookings`);
    const { rows } = await as(db, student(users.admin!), (tx) => tx.query<{ n: number }>(`select count(*)::int as n from public.bookings`));
    expect(rows[0]!.n).toBe(all.rows[0]!.n);
  });

  it("the unique index alone prevents two active bookings of one slot", async () => {
    // Even a privileged writer that skips create_booking cannot double-book.
    const insert = `insert into public.bookings (owner_id, facility_code, resource_id, slot_date, slot_index, starts_at, week_start, participant_count, idempotency_key)
      values ($1, 'tennis', $2, '2026-10-31', 3, now(), public.turf_week_start('2026-10-31'), 2, gen_random_uuid())`;
    await db.query(insert, [users.p9, res["tennis:Court 1"]]);
    await expect(db.query(insert, [users.p10, res["tennis:Court 1"]])).rejects.toThrow(/bookings_active_slot_uq/);
  });
});

describe("profile updates", () => {
  it("lets a student set their name and registration number once", async () => {
    const r = await as(db, student(users.carol!), (tx) =>
      tx.query<{ r: { regNo: string; fullName: string } }>(`select public.update_my_profile('Carol C', ' 23bce 10003 ') as r`),
    );
    expect(r.rows[0]!.r).toMatchObject({ fullName: "Carol C", regNo: "23BCE10003" });
    await expectDenied(as(db, student(users.carol!), (tx) => tx.query(`select public.update_my_profile(null, '23BCE19999')`)));
  });

  it("returns the caller's own profile and roles", async () => {
    const { rows } = await as(db, student(users.admin!), (tx) => tx.query<{ r: { roles: string[] } }>(`select public.my_profile() as r`));
    expect(rows[0]!.r.roles).toEqual(["student", "sports_admin"]);
  });
});
