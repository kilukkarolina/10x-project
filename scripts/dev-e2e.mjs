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
config({ path: join(projectRoot, ".env.test") });

// Start Astro dev server
const astro = spawn("npx", ["astro", "dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
  },
  cwd: projectRoot,
});

astro.on("exit", (code) => {
  process.exit(code || 0);
});
