import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["**/*.test.ts"],
    // Each file boots its own WASM Postgres; that takes a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
