import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  test: {
    // Include both unit tests (in src/ and tests/unit/) and integration tests (in tests/)
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.ts", "tests/integration/**/*.integration.test.ts"],

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
      // Coverage targets - MVP realistic thresholds
      // Will be increased progressively as test coverage improves
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 10,
        statements: 10,
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
