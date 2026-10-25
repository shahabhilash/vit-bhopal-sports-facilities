import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createTokenVerifier } from "./lib/auth";
import { createSupabaseDb } from "./lib/data";
import { cleanupOrphanPhotos, createSupabasePhotoStore } from "./lib/photos";

const config = loadConfig();

const photos = createSupabasePhotoStore(config);
const app = createApp({
  config,
  verifyToken: createTokenVerifier(config),
  db: createSupabaseDb(config),
  photos,
});

// Every 6 hours, remove issue photos that no report points to (failed or
// abandoned uploads). Deleting through the storage API is the supported way.
if (photos) {
  const sweep = () =>
    cleanupOrphanPhotos(photos)
      .then((removed) => console.log(JSON.stringify({ msg: "orphan photo sweep", removed })))
      .catch((err: Error) => console.error(JSON.stringify({ msg: "orphan photo sweep failed", error: err.message })));
  setTimeout(sweep, 60_000).unref();
  setInterval(sweep, 6 * 60 * 60 * 1000).unref();
}

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(JSON.stringify({ msg: "api listening", port: info.port, env: config.APP_ENV }));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
