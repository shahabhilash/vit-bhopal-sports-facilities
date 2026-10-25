import type { PGlite } from "@electric-sql/pglite";
import type { AuthUser } from "../../src/lib/auth";
import { mapDbError, type Db } from "../../src/lib/data";

/**
 * Stands in for PostgREST: calls the same SQL functions with the same JWT
 * claims and API role, so tests and the local demo server exercise the real
 * booking rules without a Supabase project. Never used in production.
 */
export function pgliteDb(db: PGlite): Db {
  return {
    async rpc<T>(fn: string, args: Record<string, unknown>, user: AuthUser | null): Promise<T> {
      if (!/^[a-z_]+$/.test(fn)) throw new Error("bad function name");
      const names = Object.keys(args);
      const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`;
      try {
        return await db.transaction(async (tx) => {
          const claims = user ? { sub: user.id, role: "authenticated", email: user.email } : { role: "anon" };
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
          await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user?.id ?? ""]);
          await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
          const { rows } = await tx.query<{ r: T }>(sql, names.map((n) => args[n]));
          return rows[0]!.r;
        });
      } catch (err) {
        const e = err as { code?: string; message?: string; detail?: string };
        if (e.code) throw mapDbError(e);
        throw err;
      }
    },
  };
}
