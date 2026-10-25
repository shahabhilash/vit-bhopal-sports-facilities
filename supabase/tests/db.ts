import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const here = import.meta.dirname;
const migrationsDir = join(here, "..", "migrations");

export type Actor =
  | { role: "anon" }
  | { role: "authenticated"; sub: string }
  | { role: "service_role" }
  | { role: "supabase_auth_admin" };

/** Fresh in-memory Postgres with the Supabase shim and every migration applied in order. */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(here, "supabase-shim.sql"), "utf8"));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  return db;
}

/** Creates an auth user the way Supabase Auth would (as a privileged role). */
export async function createAuthUser(
  db: PGlite,
  email: string,
  opts: { confirmed?: boolean; meta?: Record<string, unknown> } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
     values ($1, case when $2 then now() end, $3::jsonb)
     returning id`,
    [email, opts.confirmed ?? true, JSON.stringify(opts.meta ?? {})],
  );
  return rows[0]!.id;
}

/** Runs fn inside a transaction as the given API role, like PostgREST does. */
export async function as<T>(db: PGlite, actor: Actor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = "sub" in actor ? { sub: actor.sub, role: actor.role } : { role: actor.role };
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, ["sub" in actor ? actor.sub : ""]);
    await tx.exec(`set local role ${actor.role}`);
    return fn(tx);
  });
}

/**
 * Asserts that a statement fails with SQLSTATE 42501 (insufficient_privilege),
 * which Postgres uses for missing grants and RLS violations, and which our
 * functions raise for authorization failures.
 */
export async function expectDenied(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const { code, message } = err as { code?: string; message: string };
    if (code === "42501") return;
    throw new Error(`Expected SQLSTATE 42501 but got ${code}: ${message}`);
  }
  throw new Error("Expected the statement to be denied, but it succeeded");
}

/** Makes app_now() read a session setting so tests control the clock. */
export async function pinClock(db: PGlite, iso: string): Promise<void> {
  await db.exec(`
    create or replace function public.app_now() returns timestamptz language sql stable set search_path = ''
    as $$ select current_setting('test.now')::timestamptz $$;
  `);
  await setNow(db, iso);
}

export async function setNow(db: PGlite, iso: string): Promise<void> {
  await db.query(`select set_config('test.now', $1, false)`, [iso]);
}

/** Asserts a call fails with the given SQLSTATE; returns the error for further checks. */
export async function expectCode(
  promise: Promise<unknown>,
  code: string,
  message?: RegExp,
): Promise<{ code?: string; message: string; detail?: string }> {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; message: string; detail?: string };
    if (e.code !== code) throw new Error(`Expected SQLSTATE ${code} but got ${e.code}: ${e.message}`);
    if (message && !message.test(e.message)) throw new Error(`Message ${JSON.stringify(e.message)} does not match ${message}`);
    return e;
  }
  throw new Error(`Expected SQLSTATE ${code}, but the call succeeded`);
}
