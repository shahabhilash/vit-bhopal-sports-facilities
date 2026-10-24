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
