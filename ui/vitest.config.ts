import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      // Same alias `vite.base.ts` gives the three apps. Without it the tests
      // cannot import the compiler-generated module, which is what makes the
      // difference between testing the real deserializer and testing a mock
      // of it.
      "@contracts": fileURLToPath(new URL("../contracts/output", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["{shared,cliente,explorer,pruebas}/**/*.test.ts"],
  },
});
