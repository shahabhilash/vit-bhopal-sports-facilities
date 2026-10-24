import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createTokenVerifier } from "./lib/auth";
import { createSupabaseDataSource } from "./lib/data";

const config = loadConfig();

const app = createApp({
  config,
  verifyToken: createTokenVerifier(config),
  data: createSupabaseDataSource(config),
});

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(JSON.stringify({ msg: "api listening", port: info.port, env: config.APP_ENV }));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
