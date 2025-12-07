/**
 * Test helpers for authentication in integration and E2E tests
 */

import { vi } from "vitest";

/**
 * Create a mock JWT token for integration tests
 * This token will be recognized by our mocked Supabase client
 */
export function createMockToken(userId: string): string {
  return `mock-token-${userId}`;
}

/**
 * Mock Supabase Auth for integration tests
 * This allows us to test business logic without real Supabase Auth
 *
 * Usage in test:
 * ```typescript
 * import { mockSupabaseAuth } from './helpers/test-auth';
 *
 * beforeEach(() => {
 *   const userId = 'test-user-id';
 *   mockSupabaseAuth(userId);
 * });
 * ```
 */
export function mockSupabaseAuth(userId: string, email = "test@example.com") {
  // Mock @supabase/supabase-js
  vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: userId,
              email: email,
            },
          },
          error: null,
        }),
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: {
                id: userId,
                email: email,
              },
              access_token: createMockToken(userId),
            },
          },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
  }));
}

/**
 * Mock headers for authenticated requests in integration tests
 */
export function mockAuthHeaders(userId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${createMockToken(userId)}`,
    "Content-Type": "application/json",
  };
}
