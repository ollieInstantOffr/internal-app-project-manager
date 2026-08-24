import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.join(process.cwd(), "src"),
      // Lets the tests import the real server modules rather than copies.
      "server-only": path.join(process.cwd(), "test", "server-only.stub.ts"),
    },
  },
});
