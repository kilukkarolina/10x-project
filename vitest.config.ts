import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  test: {
    // Include both unit tests (in src/) and integration tests (in tests/)
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.integration.test.ts"],

    globals: true,
    environment: "jsdom",

    setupFiles: ["./tests/setup-unit.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/types.ts",
        "src/env.d.ts",
        "src/db/database.types.ts",
      ],
      // Coverage targets from test-plan.md
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
