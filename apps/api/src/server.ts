import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createTokenVerifier } from "./lib/auth";
import { createSupabaseDb } from "./lib/data";
import { createSupabasePhotoStore } from "./lib/photos";

const config = loadConfig();

const app = createApp({
  config,
  verifyToken: createTokenVerifier(config),
  db: createSupabaseDb(config),
  photos: createSupabasePhotoStore(config),
});

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(JSON.stringify({ msg: "api listening", port: info.port, env: config.APP_ENV }));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
