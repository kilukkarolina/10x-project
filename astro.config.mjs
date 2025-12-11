// @ts-check
import { defineConfig } from "astro/config";
import { config as loadEnvFile } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables based on NODE_ENV
// For E2E tests (NODE_ENV=test), load .env.test instead of .env
// In CI, environment variables are set by GitHub Secrets, so no file is needed
const mode = process.env.NODE_ENV || "development";
const isCI = process.env.CI === "true";
const envFile = mode === "test" ? ".env.test" : ".env";
const envPath = join(__dirname, envFile);

// Load the appropriate .env file BEFORE Vite/Astro initialization
// Skip if in CI (variables already set by GitHub Secrets)
if (!isCI && existsSync(envPath)) {
  loadEnvFile({ path: envPath, override: true });
  console.log(`🔧 Astro Config: NODE_ENV=${mode}, loaded ${envFile}`);
} else if (isCI) {
  console.log(`🔧 Astro Config: NODE_ENV=${mode}, using CI environment variables`);
} else {
  console.log(`⚠️  Astro Config: NODE_ENV=${mode}, ${envFile} not found, using existing env vars`);
}

if (mode === "test") {
  console.log(`📍 Test Supabase: ${process.env.PUBLIC_SUPABASE_URL}`);
  console.log(`👤 Test User: ${process.env.E2E_USERNAME}`);
}

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  server: { port: 3004 },
  vite: {
    plugins: [tailwindcss()],
    server: { strictPort: true },
  },
  adapter: node({
    mode: "standalone",
  }),
});
