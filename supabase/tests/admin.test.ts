import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createAuthUser, createDb, expectCode, expectDenied, pinClock, setNow, type Actor } from "./db";

let db: PGlite;
const u: Record<string, string> = {};
const res: Record<string, string> = {};
type Json = Record<string, unknown>;

// Monday 26 Oct 2026, 08:00 IST.
const BASE = "2026-10-26T08:00:00+05:30";
const actor = (name: string): Actor => ({ role: "authenticated", sub: u[name]! });

async function rpc<T = Json>(who: string, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await as(db, actor(who), (tx) => tx.query<{ r: T }>(`select ${sql} as r`, params));
  return rows[0]!.r;
}

const book = (who: string, resource: string, date: string, slot: number, count = 2) =>
  rpc<Json>(who, `public.create_booking($1::uuid, $2::date, $3::smallint, $4::smallint, null, $5::uuid)`, [
    res[resource], date, slot, count, randomUUID(),
  ]);

const saveBlock = (who: string, a: { id?: string; facility: string; resource?: string; start: string; end: string; slots?: number[] | null; reason: string; note?: string; cancel?: boolean }) =>
  rpc<Json>(
    who,
    `public.admin_save_block($1::uuid, $2, $3::uuid, $4::date, $5::date, $6::smallint[], $7::public.block_reason, $8, $9)`,
    [a.id ?? null, a.facility, a.resource ? res[a.resource] : null, a.start, a.end, a.slots ?? null, a.reason, a.note ?? null, a.cancel ?? false],
  );

const status = async (id: unknown) =>
  (await db.query<{ status: string; cancel_reason: string | null }>(`select status, cancel_reason from public.bookings where id = $1`, [id])).rows[0]!;

beforeAll(async () => {
  db = await createDb();
  await pinClock(db, BASE);
  for (const [i, name] of ["alice", "bob", "carol", "dave", "guard", "admin"].entries()) {
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

describe("admin-only access", () => {
  const calls: [string, unknown[]][] = [
    [`public.admin_analytics('2026-10-01', '2026-10-31')`, []],
    [`public.admin_blocks(null)`, []],
    [`public.admin_bookings('2026-10-26', null)`, []],
    [`public.admin_feedback(null, null, null, null, null, 10, 0)`, []],
    [`public.admin_staff()`, []],
    [`public.admin_block_overlaps('tennis', null, '2026-10-26', '2026-10-27', null, null)`, []],
    [`public.admin_delete_block(gen_random_uuid())`, []],
    [`public.admin_set_feedback_status(gen_random_uuid(), 'resolved')`, []],
    [`public.admin_feedback_photo_path(gen_random_uuid())`, []],
    [`public.admin_cancel_booking(gen_random_uuid(), 'x')`, []],
  ];

  it.each(["alice", "guard"])("refuses every admin function to %s", async (who) => {
    for (const [sql, params] of calls) {
      await expectDenied(rpc(who, sql, params));
    }
    await expectDenied(saveBlock(who, { facility: "tennis", start: "2026-10-27", end: "2026-10-27", reason: "maintenance" }));
  });

  it("refuses them to anonymous users before they run", async () => {
    for (const [sql] of calls) {
      await expectDenied(as(db, { role: "anon" }, (tx) => tx.query(`select ${sql}`)));
    }
  });
});

describe("facility blocks", () => {
  it("validates input", async () => {
    await expectCode(saveBlock("admin", { facility: "gym", start: "2026-10-27", end: "2026-10-27", reason: "hpl" }), "VB005");
    await expectCode(saveBlock("admin", { facility: "tennis", resource: "pickleball:Court 1", start: "2026-10-27", end: "2026-10-27", reason: "hpl" }), "VB005");
    await expectCode(saveBlock("admin", { facility: "tennis", start: "2026-10-28", end: "2026-10-27", reason: "hpl" }), "VB005");
    await expectCode(saveBlock("admin", { facility: "tennis", start: "2026-10-01", end: "2026-10-20", reason: "hpl" }), "VB005");
    await expectCode(saveBlock("admin", { facility: "tennis", start: "2026-10-27", end: "2026-10-27", slots: [13], reason: "hpl" }), "VB005");
  });

  it("previews affected bookings, refuses to cancel them silently, and cancels them on confirmation", async () => {
    const b1 = await book("alice", "tennis:Court 1", "2026-10-28", 4);
    const b2 = await book("bob", "tennis:Court 2", "2026-10-28", 5);
    const outside = await book("carol", "tennis:Court 1", "2026-10-28", 9);

    const preview = await rpc<{ bookings: Json[] }>("admin", `public.admin_block_overlaps('tennis', null, '2026-10-28', '2026-10-28', '{4,5}', null)`);
    expect(preview.bookings.map((b) => b.ownerName).sort()).toEqual(["alice", "bob"]);

    const refused = await expectCode(
      saveBlock("admin", { facility: "tennis", start: "2026-10-28", end: "2026-10-28", slots: [5, 4], reason: "hpl", note: "Inter-hostel final" }),
      "VB012",
    );
    expect(JSON.parse(refused.detail!)).toEqual({ affected: 2 });
    expect((await rpc<Json[]>("admin", `public.admin_blocks(null)`)).length).toBe(0); // nothing was saved

    const saved = await saveBlock("admin", {
      facility: "tennis", start: "2026-10-28", end: "2026-10-28", slots: [5, 4], reason: "hpl", note: "Inter-hostel final", cancel: true,
    });
    expect(saved).toMatchObject({ cancelled: 2, block: { slotIndexes: [4, 5], label: "Booked for HPL", note: "Inter-hostel final" } });
    expect(await status(b1.id)).toEqual({ status: "cancelled", cancel_reason: "Cancelled by the sports office: Booked for HPL" });
    expect((await status(b2.id)).status).toBe("cancelled");
    expect((await status(outside.id)).status).toBe("confirmed");

    // The student sees the reason, and the slot is now blocked.
    const mine = await rpc<Json[]>("alice", `public.my_bookings()`);
    expect(mine.find((b) => b.id === b1.id)).toMatchObject({ status: "cancelled", cancelReason: "Cancelled by the sports office: Booked for HPL" });
    await expectCode(book("dave", "tennis:Court 1", "2026-10-28", 4), "VB003", /HPL/);
  });

  it("closes waiting lists inside a new block", async () => {
    const b = await book("alice", "pickleball:Court 1", "2026-10-29", 10);
    await rpc("bob", `public.join_waitlist($1::uuid, '2026-10-29', 10::smallint, 2::smallint, null)`, [res["pickleball:Court 1"]]);
    await saveBlock("admin", { facility: "pickleball", start: "2026-10-29", end: "2026-10-29", slots: [10], reason: "maintenance", cancel: true });
    expect((await status(b.id)).status).toBe("cancelled");
    const { rows } = await db.query<{ status: string }>(`select status from public.waitlist_entries where owner_id = $1`, [u.bob]);
    expect(rows.map((r) => r.status)).toEqual(["expired"]);
  });

  it("edits a block in place and removes it", async () => {
    const created = await saveBlock("admin", { facility: "turf", start: "2026-11-02", end: "2026-11-03", reason: "event", note: "Fest setup" });
    const id = (created.block as Json).id as string;
    const edited = await saveBlock("admin", { id, facility: "turf", start: "2026-11-02", end: "2026-11-05", slots: [1, 2], reason: "event", note: "Fest setup, extended" });
    expect(edited.block).toMatchObject({ endDate: "2026-11-05", slotIndexes: [1, 2], note: "Fest setup, extended" });
    expect((await rpc<Json[]>("admin", `public.admin_blocks(null)`)).filter((b) => b.facility === "turf")).toHaveLength(1);

    await rpc("admin", `public.admin_delete_block($1::uuid)`, [(edited.block as Json).id]);
    expect((await rpc<Json[]>("admin", `public.admin_blocks(null)`)).filter((b) => b.facility === "turf")).toHaveLength(0);
    await expectCode(rpc("admin", `public.admin_delete_block($1::uuid)`, [(edited.block as Json).id]), "VB008");
  });

  it("never exposes internal notes through public availability", async () => {
    const avail = await as(db, { role: "anon" }, (tx) =>
      tx.query<{ r: Json[] }>(`select public.get_availability('tennis', '2026-10-28', '2026-10-28') as r`),
    );
    expect(JSON.stringify(avail.rows[0]!.r)).not.toMatch(/Inter-hostel/);
  });
});

describe("admin bookings", () => {
  it("lists a day's bookings with owner details, and cancels with a visible reason", async () => {
    const b = await book("carol", "pickleball:Court 2", "2026-10-30", 3);
    const day = await rpc<Json[]>("admin", `public.admin_bookings('2026-10-30', 'pickleball')`);
    expect(day).toContainEqual(expect.objectContaining({ id: b.id, ownerName: "carol", ownerRegNo: "23BCE10002" }));

    await expectCode(rpc("admin", `public.admin_cancel_booking($1::uuid, '')`, [b.id]), "VB005");
    const cancelled = await rpc<Json>("admin", `public.admin_cancel_booking($1::uuid, 'Court resurfacing')`, [b.id]);
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Cancelled by the sports office: Court resurfacing" });
    await expectCode(rpc("admin", `public.admin_cancel_booking($1::uuid, 'again')`, [b.id]), "VB009");
  });
});

describe("analytics", () => {
  beforeAll(async () => {
    // Sun 1 Nov: two tennis bookings (one attended, one no-show), one pickleball cancelled.
    await setNow(db, "2026-10-26T08:00:00+05:30");
    const t1 = await book("dave", "tennis:Court 1", "2026-11-01", 2, 4);
    await book("bob", "tennis:Court 2", "2026-11-01", 2);
    const p1 = await book("alice", "pickleball:Court 2", "2026-11-01", 6);
    await rpc("alice", `public.cancel_booking($1::uuid)`, [p1.id]);

    const { rows } = await as(db, actor("dave"), (tx) => tx.query<{ r: { code: string } }>(`select public.my_booking_pass($1::uuid) as r`, [t1.id]));
    await setNow(db, "2026-11-01T09:25:00+05:30");
    await rpc("guard", `public.guard_check_in($1)`, [rows[0]!.r.code]);
    await setNow(db, "2026-11-01T09:46:00+05:30");
    await db.query(`select public.release_no_shows()`);
  });

  it("separates bookings from actual attendance", async () => {
    const a = await rpc<{ byFacility: Json[]; daily: Json[]; bySlot: Json[]; heatmap: Json[] }>(
      "admin",
      `public.admin_analytics('2026-11-01', '2026-11-01')`,
    );
    expect(a.byFacility.find((f) => f.facility === "tennis")).toEqual({
      facility: "tennis", bookings: 2, attended: 1, noShows: 1, cancellations: 0, playersAttended: 4, slotCapacity: 24,
    });
    expect(a.byFacility.find((f) => f.facility === "pickleball")).toMatchObject({ bookings: 0, cancellations: 1 });
    expect(a.daily).toEqual([{ date: "2026-11-01", bookings: 2, attended: 1 }]);
    expect(a.bySlot.find((s) => s.slotIndex === 2)).toEqual({ slotIndex: 2, bookings: 2, attended: 1 });
    expect(a.heatmap).toEqual([{ weekday: 0, slotIndex: 2, attended: 1 }]);
  });

  it("limits the range to 92 days", async () => {
    await expectCode(rpc("admin", `public.admin_analytics('2026-01-01', '2026-12-31')`), "VB005");
  });
});

describe("feedback inbox and photos", () => {
  let reportId: string;
  let bookingId: string;

  beforeAll(async () => {
    await setNow(db, "2026-10-26T08:00:00+05:30");
    const b = await book("bob", "pickleball:Court 1", "2026-10-26", 4); // 11:30
    bookingId = b.id as string;
    const { rows } = await as(db, actor("bob"), (tx) => tx.query<{ r: { code: string } }>(`select public.my_booking_pass($1::uuid) as r`, [b.id]));
    await setNow(db, "2026-10-26T11:25:00+05:30");
    await rpc("guard", `public.guard_check_in($1)`, [rows[0]!.r.code]);
    await rpc("bob", `public.check_out($1::uuid, 'issue', 'Light 3 on the court is flickering badly.')`, [b.id]);
  });

  it("lets the author attach one photo with a strictly formatted path", async () => {
    await setNow(db, "2026-10-26T12:00:00+05:30");
    reportId = await rpc<string>("bob", `public.feedback_photo_target($1::uuid)`, [bookingId]);
    await expectCode(rpc("alice", `public.feedback_photo_target($1::uuid)`, [bookingId]), "VB008");

    await expectCode(rpc("bob", `public.set_feedback_photo($1::uuid, '../../etc/passwd')`, [reportId]), "VB005");
    await expectCode(rpc("bob", `public.set_feedback_photo($1::uuid, $2)`, [reportId, `feedback/${randomUUID()}/${randomUUID()}.jpg`]), "VB005");
    const path = `feedback/${reportId}/${randomUUID()}.jpg`;
    await expectCode(rpc("alice", `public.set_feedback_photo($1::uuid, $2)`, [reportId, path]), "VB009");
    await rpc("bob", `public.set_feedback_photo($1::uuid, $2)`, [reportId, path]);
    await expectCode(rpc("bob", `public.feedback_photo_target($1::uuid)`, [bookingId]), "VB009", /already attached/);

    expect(await rpc<string>("admin", `public.admin_feedback_photo_path($1::uuid)`, [reportId])).toBe(path);
  });

  it("shows reports to the admin with filters and tracks their status", async () => {
    const open = await rpc<{ total: number; items: Json[] }>("admin", `public.admin_feedback('open', 'pickleball', 'issue', null, null, 10, 0)`);
    expect(open.total).toBe(1);
    expect(open.items[0]).toMatchObject({ id: reportId, hasPhoto: true, authorName: "bob", description: "Light 3 on the court is flickering badly." });

    await rpc("admin", `public.admin_set_feedback_status($1::uuid, 'resolved')`, [reportId]);
    expect((await rpc<{ total: number }>("admin", `public.admin_feedback('open', null, null, null, null, 10, 0)`)).total).toBe(0);
    expect((await rpc<{ total: number }>("admin", `public.admin_feedback('resolved', null, null, null, null, 10, 0)`)).total).toBe(1);
  });

  it("closes photo uploads 24 hours after checkout", async () => {
    // A second report by carol, checked out now; tried 25 hours later.
    await setNow(db, "2026-10-27T08:00:00+05:30");
    const b = await book("carol", "tennis:Court 2", "2026-10-27", 3); // 10:30
    const { rows } = await as(db, actor("carol"), (tx) => tx.query<{ r: { code: string } }>(`select public.my_booking_pass($1::uuid) as r`, [b.id]));
    await setNow(db, "2026-10-27T10:25:00+05:30");
    await rpc("guard", `public.guard_check_in($1)`, [rows[0]!.r.code]);
    await rpc("carol", `public.check_out($1::uuid, 'issue', 'Net strap is broken on one side.')`, [b.id]);
    await setNow(db, "2026-10-28T11:30:00+05:30");
    await expectCode(rpc("carol", `public.feedback_photo_target($1::uuid)`, [b.id]), "VB009", /24 hours/);
  });
});

describe("staff list", () => {
  it("lists guards and admins only", async () => {
    const staff = await rpc<Json[]>("admin", `public.admin_staff()`);
    expect(staff.map((s) => [s.fullName, s.roles])).toEqual([
      ["admin", ["sports_admin"]],
      ["guard", ["guard"]],
    ]);
  });
});
