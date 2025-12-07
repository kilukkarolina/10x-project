/**
 * Test data factories
 * Generate realistic test data for tests
 */

/**
 * Generate a test transaction
 */
export function createTestTransaction(overrides?: Partial<Record<string, unknown>>) {
  return {
    amount: 10000, // 100.00 PLN in cents
    category_id: "food",
    transaction_date: "2024-01-15",
    type: "EXPENSE" as const,
    notes: "Test transaction",
    ...overrides,
  };
}

/**
 * Generate a test goal
 */
export function createTestGoal(overrides?: Partial<Record<string, unknown>>) {
  return {
    name: "Test Goal",
    target_amount: 100000, // 1000.00 PLN in cents
    goal_type_id: "savings",
    is_priority: false,
    ...overrides,
  };
}

/**
 * Generate a test goal event (deposit/withdraw)
 */
export function createTestGoalEvent(goalId: string, overrides?: Partial<Record<string, unknown>>) {
  return {
    goal_id: goalId,
    amount: 5000, // 50.00 PLN in cents
    event_type: "DEPOSIT" as const,
    event_date: "2024-01-15",
    notes: "Test deposit",
    ...overrides,
  };
}

/**
 * Generate a test user email
 */
export function createTestUserEmail(prefix = "test"): string {
  const timestamp = Date.now();
  return `${prefix}-${timestamp}@example.com`;
}
