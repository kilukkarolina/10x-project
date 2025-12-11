#!/usr/bin/env node

/**
 * Development server for E2E tests
 * Loads environment variables from .env.test and starts Astro dev server
 */

import { spawn } from "child_process";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Load .env.test
const envTestPath = join(projectRoot, ".env.test");
const envTestConfig = config({ path: envTestPath });

if (envTestConfig.error) {
  console.error("❌ Failed to load .env.test file:", envTestConfig.error);
  process.exit(1);
}

console.log("✅ Loaded .env.test configuration");
console.log("📍 Supabase URL:", process.env.PUBLIC_SUPABASE_URL);
console.log("👤 Test user:", process.env.E2E_USERNAME);

// Start Astro dev server with explicit environment variables
// This prevents Astro from loading .env file
const astro = spawn("npx", ["astro", "dev"], {
  stdio: "inherit",
  env: {
    // Pass all environment variables from .env.test
    ...process.env,
    // Explicitly set NODE_ENV to prevent .env loading
    NODE_ENV: "test",
  },
  cwd: projectRoot,
});

astro.on("exit", (code) => {
  process.exit(code || 0);
});
