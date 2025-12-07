/**
 * Setup for integration tests with Testcontainers
 * This file provides utilities for running tests against a real Postgres database
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { readdir, readFile } from "fs/promises";
import path from "path";
import pg from "pg";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;

/**
 * Start Postgres container and run migrations
 * Call this in beforeAll() of your test suite
 */
export async function setupIntegrationTests(): Promise<{
  container: StartedPostgreSqlContainer;
  pool: pg.Pool;
}> {
  // eslint-disable-next-line no-console
  console.log("🚀 Starting Supabase Postgres container...");

  // Using Supabase Postgres image which includes auth schema and auth.uid() function
  // This ensures full compatibility with Supabase-specific migrations
  container = await new PostgreSqlContainer("supabase/postgres:15.1.0.147")
    .withDatabase("postgres")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const connectionUri = container.getConnectionUri();
  process.env.DATABASE_URL = connectionUri;

  // Create connection pool
  pool = new pg.Pool({
    connectionString: connectionUri,
  });

  // eslint-disable-next-line no-console
  console.log("📦 Running Supabase migrations...");
  await runMigrations(pool);

  // eslint-disable-next-line no-console
  console.log("✅ Test environment ready!");

  return { container, pool };
}

/**
 * Stop container and cleanup
 * Call this in afterAll() of your test suite
 */
export async function teardownIntegrationTests() {
  // eslint-disable-next-line no-console
  console.log("🧹 Cleaning up test environment...");
  await pool?.end();
  await container?.stop();
}

/**
 * Run all migrations from ./supabase/migrations/
 */
async function runMigrations(pool: pg.Pool) {
  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

  const files = await readdir(migrationsDir);
  const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

  for (const file of migrationFiles) {
    const sql = await readFile(path.join(migrationsDir, file), "utf-8");

    try {
      await pool.query(sql);
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${file}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`  ✗ ${file}:`, error);
      throw error;
    }
  }
}

/**
 * Clean all business tables between tests
 * Call this in afterEach() to ensure test isolation
 */
export async function cleanDatabase(pool: pg.Pool) {
  await pool.query(`
    TRUNCATE 
      transactions, 
      goals, 
      goal_events, 
      audit_log, 
      rate_limits,
      profiles
    CASCADE;
    
    -- Clean auth.users (will cascade to profiles due to FK)
    DELETE FROM auth.users;
  `);
}

/**
 * Seed a test user in Supabase auth.users and profiles
 * Returns userId for use in tests
 */
export async function seedTestUser(pool: pg.Pool, email = "test@example.com"): Promise<string> {
  const userId = crypto.randomUUID();

  // Insert into auth.users with minimal required fields for Supabase
  // Note: Some fields may have defaults, we provide only essential ones
  await pool.query(
    `INSERT INTO auth.users (
      id, 
      instance_id, 
      email, 
      encrypted_password, 
      email_change,
      aud,
      role,
      confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) 
    VALUES (
      $1, 
      '00000000-0000-0000-0000-000000000000', 
      $2, 
      '$2a$10$FAKEPASSWORDHASH', 
      '',
      'authenticated',
      'authenticated',
      NOW(),
      '{}',
      '{}',
      NOW(),
      NOW()
    )`,
    [userId, email]
  );

  // Insert corresponding profile
  await pool.query(
    `INSERT INTO profiles (user_id, email_confirmed, created_at, updated_at)
     VALUES ($1, true, NOW(), NOW())`,
    [userId]
  );

  return userId;
}
