/*
 * LOCAL DEMO ONLY. Runs the API against an in-memory Postgres (PGlite) with
 * every migration applied and a few clearly fake demo bookings, so the web
 * app's public booking screens can be developed without a Supabase project.
 * Signed-in routes still need real Supabase tokens and will return 401.
 *
 *   npm run dev:local -w @vitb/api
 */
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { addDays, istDateString } from "@vitb/shared";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createTokenVerifier } from "../src/lib/auth";
import { createAuthUser, createDb } from "../../../supabase/tests/db";
import { pgliteDb } from "../test/support/pglite-db";

const pg = await createDb();
const db = pgliteDb(pg);

const demoUser = await createAuthUser(pg, "demo.23bce00000@vitbhopal.ac.in");
const resources = await db.rpc<{ id: string; facility: string; name: string }[]>("list_resources", {}, null);
const id = (facility: string, name: string) => resources.find((r) => r.facility === facility && r.name === name)!.id;
const tomorrow = addDays(istDateString(), 1);

for (const [facility, name, slot] of [
  ["pickleball", "Court 1", 3],
  ["tennis", "Court 1", 10],
] as const) {
  await db.rpc(
    "create_booking",
    {
      p_resource_id: id(facility, name),
      p_slot_date: tomorrow,
      p_slot_index: slot,
      p_participant_count: 2,
      p_participant_reg_nos: null,
      p_idempotency_key: randomUUID(),
    },
    { id: demoUser, email: "demo.23bce00000@vitbhopal.ac.in", token: "" },
  );
}
await pg.query(
  `insert into public.facility_blocks (facility_code, resource_id, start_date, end_date, slot_indexes, reason)
   values ('tennis', $1, $2, $2, '{4,5}', 'maintenance'), ('pickleball', null, $2, $2, '{11,12}', 'hpl')`,
  [id("tennis", "Court 2"), tomorrow],
);

const config = loadConfig({
  APP_ENV: "development",
  PORT: process.env.PORT ?? "8787",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "local-demo-placeholder-key",
  CORS_ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:3101",
});
const app = createApp({ config, verifyToken: createTokenVerifier(config), db });
serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`LOCAL DEMO API on http://localhost:${info.port} (in-memory database, demo bookings for ${tomorrow})`);
});
