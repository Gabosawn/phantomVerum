import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/harness/global-setup.ts"],
  },
});

// Note: runs print one Vite warning — "Sourcemap for .../contract/index.js points to missing
// source files". The compiled contract ships an `index.js.map` referencing `.compact` sources
// that compactc does not copy into `output/`. It says nothing about this code. Silencing it
// needs a custom Vite logger, which would mean depending on `vite` here just for a log line.
