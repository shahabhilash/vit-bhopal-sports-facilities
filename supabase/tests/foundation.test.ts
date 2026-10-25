import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { FACILITY_RULES, TIME_SLOTS } from "@vitb/shared";
import { as, createAuthUser, createDb, expectDenied } from "./db";

let db: PGlite;
let studentA: string;
let studentB: string;
let admin: string;
let guard: string;
let unverified: string;


beforeAll(async () => {
  db = await createDb();
  studentA = await createAuthUser(db, "alice.23bce10001@vitbhopal.ac.in", { meta: { full_name: "Alice" } });
  studentB = await createAuthUser(db, "bob.23bce10002@vitbhopal.ac.in");
  admin = await createAuthUser(db, "fr.sports@vitbhopal.ac.in");
  guard = await createAuthUser(db, "guard.gate1@vitbhopal.ac.in");
  unverified = await createAuthUser(db, "new.24bce10003@vitbhopal.ac.in", { confirmed: false });
  // Trusted bootstrap, as documented in docs/ROLES.md (run by the database owner).
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'sports_admin'), ($2, 'guard')`, [admin, guard]);
});

const student = (sub: string) => ({ role: "authenticated" as const, sub });

describe("sign-up domain restriction", () => {
  const hook = (email: string | null, extra: Record<string, unknown> = {}) =>
    as(db, { role: "supabase_auth_admin" }, (tx) =>
      tx.query<{ r: Record<string, unknown> }>(`select public.hook_before_user_created($1::jsonb) as r`, [
        JSON.stringify({ user: { email, ...extra } }),
      ]),
    ).then((res) => res.rows[0]!.r);

  it("allows a college address", async () => {
    expect(await hook("Someone.23BCE1@VITBHOPAL.AC.IN")).toEqual({});
  });

  it.each([
    "someone@gmail.com",
    "someone@vitbhopal.ac.in.example.com",
    "someone@sub.vitbhopal.ac.in",
    "someone@evilvitbhopal.ac.in",
    "someone@vitbhopalxac.in",
    "a@vitbhopal.ac.in@gmail.com",
  ])("rejects %s with HTTP 403", async (email) => {
    expect(await hook(email)).toMatchObject({ error: { http_code: 403 } });
  });

  it("rejects users without an email and anonymous users", async () => {
    expect(await hook(null)).toMatchObject({ error: { http_code: 403 } });
    expect(await hook("x@vitbhopal.ac.in", { is_anonymous: true })).toMatchObject({ error: { http_code: 403 } });
  });

  it("cannot be called by API roles", async () => {
    await expectDenied(as(db, { role: "anon" }, (tx) => tx.query(`select public.hook_before_user_created('{}'::jsonb)`)));
    await expectDenied(
      as(db, student(studentA), (tx) => tx.query(`select public.hook_before_user_created('{}'::jsonb)`)),
    );
  });

  it("blocks a non-college auth user even if the hook is bypassed", async () => {
    await expect(createAuthUser(db, "outsider@gmail.com")).rejects.toThrow(/profiles_email_check|check constraint/);
  });

  it("blocks changing an account's email to another domain", async () => {
    await expect(
      db.query(`update auth.users set email = 'alice@gmail.com' where id = $1`, [studentA]),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("profile creation", () => {
  it("creates a profile and a student role, ignoring a role in user metadata", async () => {
    const id = await createAuthUser(db, "mallory.23bce10009@vitbhopal.ac.in", {
      meta: { full_name: "Mallory", role: "sports_admin" },
    });
    const { rows } = await db.query<{ role: string }>(`select role from public.user_roles where user_id = $1`, [id]);
    expect(rows.map((r) => r.role)).toEqual(["student"]);
    const profile = await db.query(`select email, full_name from public.profiles where id = $1`, [id]);
    expect(profile.rows[0]).toEqual({ email: "mallory.23bce10009@vitbhopal.ac.in", full_name: "Mallory" });
  });
});

describe("profiles RLS", () => {
  it("anonymous users cannot read profiles", async () => {
    await expectDenied(as(db, { role: "anon" }, (tx) => tx.query(`select * from public.profiles`)));
  });

  it("a student sees only their own profile", async () => {
    const { rows } = await as(db, student(studentA), (tx) => tx.query<{ id: string }>(`select id from public.profiles`));
    expect(rows.map((r) => r.id)).toEqual([studentA]);
  });

  it("a student can update their own name but not someone else's", async () => {
    const own = await as(db, student(studentA), (tx) =>
      tx.query(`update public.profiles set full_name = 'Alice A' where id = $1`, [studentA]),
    );
    expect(own.affectedRows).toBe(1);
    const other = await as(db, student(studentA), (tx) =>
      tx.query(`update public.profiles set full_name = 'Hacked' where id = $1`, [studentB]),
    );
    expect(other.affectedRows).toBe(0);
    const { rows } = await db.query<{ full_name: string | null }>(`select full_name from public.profiles where id = $1`, [studentB]);
    expect(rows[0]!.full_name).toBeNull();
  });

  it("a student cannot change their email or id", async () => {
    await expectDenied(
      as(db, student(studentA), (tx) =>
        tx.query(`update public.profiles set email = 'x@vitbhopal.ac.in' where id = $1`, [studentA]),
      ),
    );
    await expectDenied(
      as(db, student(studentA), (tx) =>
        tx.query(`update public.profiles set id = gen_random_uuid() where id = $1`, [studentA]),
      ),
    );
  });

  it("a student can set their registration number once", async () => {
    await as(db, student(studentB), (tx) =>
      tx.query(`update public.profiles set reg_no = '23bce10002' where id = $1`, [studentB]),
    );
    const { rows } = await db.query<{ reg_no: string }>(`select reg_no from public.profiles where id = $1`, [studentB]);
    expect(rows[0]!.reg_no).toBe("23BCE10002");
    await expectDenied(
      as(db, student(studentB), (tx) =>
        tx.query(`update public.profiles set reg_no = '23BCE99999' where id = $1`, [studentB]),
      ),
    );
  });

  it("rejects malformed and duplicate registration numbers", async () => {
    await expect(
      as(db, student(studentA), (tx) => tx.query(`update public.profiles set reg_no = 'abc' where id = $1`, [studentA])),
    ).rejects.toThrow(/check constraint/);
    await expect(
      as(db, student(studentA), (tx) =>
        tx.query(`update public.profiles set reg_no = '23BCE10002' where id = $1`, [studentA]),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("a student cannot insert or delete profiles", async () => {
    await expectDenied(
      as(db, student(studentA), (tx) =>
        tx.query(`insert into public.profiles (id, email) values (gen_random_uuid(), 'z@vitbhopal.ac.in')`),
      ),
    );
    await expectDenied(as(db, student(studentA), (tx) => tx.query(`delete from public.profiles where id = $1`, [studentA])));
  });

  it("the sports admin can read all profiles; a guard cannot", async () => {
    const adminView = await as(db, student(admin), (tx) => tx.query(`select id from public.profiles`));
    expect(adminView.rows.length).toBeGreaterThanOrEqual(5);
    const guardView = await as(db, student(guard), (tx) => tx.query<{ id: string }>(`select id from public.profiles`));
    expect(guardView.rows.map((r) => r.id)).toEqual([guard]);
  });
});

describe("roles", () => {
  it("a student cannot grant themselves a role or edit roles", async () => {
    await expectDenied(
      as(db, student(studentA), (tx) =>
        tx.query(`insert into public.user_roles (user_id, role) values ($1, 'sports_admin')`, [studentA]),
      ),
    );
    await expectDenied(
      as(db, student(studentA), (tx) => tx.query(`update public.user_roles set role = 'sports_admin' where user_id = $1`, [studentA])),
    );
    await expectDenied(
      as(db, student(studentA), (tx) => tx.query(`delete from public.user_roles where user_id = $1`, [admin])),
    );
  });

  it("a student sees only their own roles and cannot see the role audit log", async () => {
    const { rows } = await as(db, student(studentA), (tx) =>
      tx.query<{ user_id: string }>(`select user_id from public.user_roles`),
    );
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([studentA]));
    const log = await as(db, student(studentA), (tx) => tx.query(`select * from public.role_changes`));
    expect(log.rows).toEqual([]);
  });

  it("has_role reflects the caller only", async () => {
    const { rows } = await as(db, student(studentA), (tx) =>
      tx.query<{ a: boolean; g: boolean }>(`select public.has_role('sports_admin') as a, public.has_role('guard') as g`),
    );
    expect(rows[0]).toEqual({ a: false, g: false });
  });

  it("students and guards cannot call admin_set_role", async () => {
    for (const sub of [studentA, guard]) {
      await expectDenied(
        as(db, student(sub), (tx) =>
          tx.query(`select public.admin_set_role('alice.23bce10001@vitbhopal.ac.in', 'sports_admin', true)`),
        ),
      );
    }
  });

  it("the sports admin can grant and revoke roles, and changes are logged", async () => {
    await as(db, student(admin), (tx) =>
      tx.query(`select public.admin_set_role('BOB.23bce10002@vitbhopal.ac.in', 'guard', true)`),
    );
    let roles = await db.query<{ role: string }>(`select role from public.user_roles where user_id = $1 order by role`, [studentB]);
    expect(roles.rows.map((r) => r.role)).toEqual(["student", "guard"]);

    await as(db, student(admin), (tx) =>
      tx.query(`select public.admin_set_role('bob.23bce10002@vitbhopal.ac.in', 'guard', false)`),
    );
    roles = await db.query<{ role: string }>(`select role from public.user_roles where user_id = $1`, [studentB]);
    expect(roles.rows.map((r) => r.role)).toEqual(["student"]);

    const log = await as(db, student(admin), (tx) =>
      tx.query<{ action: string; actor_id: string }>(`select action, actor_id from public.role_changes where user_id = $1 order by id`, [studentB]),
    );
    expect(log.rows).toEqual([
      { action: "grant", actor_id: admin },
      { action: "revoke", actor_id: admin },
    ]);
  });

  it("roles cannot be granted to unverified accounts", async () => {
    await expect(
      as(db, student(admin), (tx) => tx.query(`select public.admin_set_role('new.24bce10003@vitbhopal.ac.in', 'guard', true)`)),
    ).rejects.toThrow(/No verified account/);
    const { rows } = await db.query(`select 1 from public.user_roles where user_id = $1 and role = 'guard'`, [unverified]);
    expect(rows).toEqual([]);
  });

  it("the sports admin cannot remove their own admin role", async () => {
    await expectDenied(
      as(db, student(admin), (tx) => tx.query(`select public.admin_set_role('fr.sports@vitbhopal.ac.in', 'sports_admin', false)`)),
    );
  });
});

describe("facility configuration", () => {
  it("is readable anonymously and matches the shared configuration", async () => {
    const facilities = await as(db, { role: "anon" }, (tx) =>
      tx.query<{ code: string; name: string; bookable: boolean; min_participants: number | null; max_participants: number | null; booking_horizon_days: number | null; release_rule: string | null }>(
        `select code, name, bookable, min_participants, max_participants, booking_horizon_days, release_rule from public.facilities`,
      ),
    );
    const resources = await as(db, { role: "anon" }, (tx) =>
      tx.query<{ facility_code: string; name: string }>(`select facility_code, name from public.facility_resources order by sort_order`),
    );
    expect(facilities.rows).toHaveLength(Object.keys(FACILITY_RULES).length);
    for (const row of facilities.rows) {
      const rule = FACILITY_RULES[row.code as keyof typeof FACILITY_RULES];
      expect(row).toEqual({
        code: rule.code,
        name: rule.name,
        bookable: rule.bookable,
        min_participants: rule.minParticipants,
        max_participants: rule.maxParticipants,
        booking_horizon_days: rule.bookingHorizonDays,
        release_rule: rule.releaseRule,
      });
      expect(resources.rows.filter((r) => r.facility_code === row.code).map((r) => r.name)).toEqual([...rule.resources]);
    }

    const slots = await as(db, { role: "anon" }, (tx) =>
      tx.query<{ slot_index: number; start_time: string; end_time: string }>(
        `select slot_index, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time
         from public.time_slots order by slot_index`,
      ),
    );
    expect(slots.rows).toEqual(TIME_SLOTS.map((s) => ({ slot_index: s.index, start_time: s.start, end_time: s.end })));
  });

  it("cannot be modified by anonymous users or students", async () => {
    for (const actor of [{ role: "anon" as const }, student(studentA), student(admin)]) {
      await expectDenied(as(db, actor, (tx) => tx.query(`update public.facilities set max_participants = 99`)));
      await expectDenied(as(db, actor, (tx) => tx.query(`delete from public.time_slots`)));
      await expectDenied(
        as(db, actor, (tx) => tx.query(`insert into public.facility_resources (facility_code, name) values ('turf', 'Half')`)),
      );
    }
  });
});

describe("schema-wide guarantees", () => {
  it("every table in public has RLS enabled", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("API roles have no table-level write privileges anywhere in public", async () => {
    const { rows } = await db.query<{ grantee: string; table_name: string; privilege_type: string }>(
      `select grantee, table_name, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')`,
    );
    expect(rows).toEqual([]);
  });

  it("the only column-level write grant is profiles(full_name, reg_no) for authenticated", async () => {
    const { rows } = await db.query<{ grantee: string; table_name: string; column_name: string }>(
      `select grantee, table_name, column_name from information_schema.column_privileges
       where table_schema = 'public' and grantee in ('anon', 'authenticated')
         and privilege_type in ('INSERT', 'UPDATE')
       order by column_name`,
    );
    expect(rows).toEqual([
      { grantee: "authenticated", table_name: "profiles", column_name: "full_name" },
      { grantee: "authenticated", table_name: "profiles", column_name: "reg_no" },
    ]);
  });

  it("security definer functions pin search_path and are not callable anonymously", async () => {
    const { rows } = await db.query<{ proname: string; config: string[] | null; anon_exec: boolean }>(
      `select p.proname, p.proconfig as config, has_function_privilege('anon', p.oid, 'execute') as anon_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const fn of rows) {
      expect(fn.config, fn.proname).toContain('search_path=""');
      // Deliberately public: get_availability returns only taken/blocked slots,
      // job_heartbeat only job timestamps and a failure count.
      expect(fn.anon_exec, fn.proname).toBe(["get_availability", "job_heartbeat"].includes(fn.proname));
    }
  });
});
