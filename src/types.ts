// src/types.ts

import type { Tables } from "./db/database.types";

// ============================================================================
// BASE ENTITY TYPES - Typy encji z bazy danych
// ============================================================================

type TransactionEntity = Tables<"transactions">;
type TransactionCategoryEntity = Tables<"transaction_categories">;
type GoalEntity = Tables<"goals">;
type GoalTypeEntity = Tables<"goal_types">;
type GoalEventEntity = Tables<"goal_events">;
type MonthlyMetricsEntity = Tables<"monthly_metrics">;
type AuditLogEntity = Tables<"audit_log">;

// ============================================================================
// COMMON TYPES - Wspólne typy używane w wielu miejscach
// ============================================================================

/**
 * Pagination metadata for cursor-based pagination
 * Used in list responses to indicate pagination state
 */
export interface PaginationDTO {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
}

/**
 * Standard error response structure for all API endpoints
 * Provides consistent error format with optional details
 */
export interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
  retry_after_seconds?: number;
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * Transaction DTO for API responses
 * Extends database entity with joined category label
 */
export interface TransactionDTO
  extends Pick<
    TransactionEntity,
    "id" | "type" | "category_code" | "amount_cents" | "occurred_on" | "note" | "created_at" | "updated_at"
  > {
  category_label: string; // Joined from transaction_categories.label_pl
  backdate_warning?: boolean; // Optional flag set when month was changed
}

/**
 * Command for creating a new transaction
 * Requires all user-provided fields, system fields are auto-generated
 */
export interface CreateTransactionCommand
  extends Pick<TransactionEntity, "type" | "category_code" | "amount_cents" | "occurred_on" | "client_request_id"> {
  note?: string | null; // Optional field
}

/**
 * Command for updating an existing transaction
 * All fields optional except those being updated
 * Cannot change 'type' - requires DELETE + POST instead
 */
export interface UpdateTransactionCommand {
  category_code?: string;
  amount_cents?: number;
  occurred_on?: string; // YYYY-MM-DD format
  note?: string | null;
}

/**
 * Transaction list response with pagination and metadata
 */
export interface TransactionListResponseDTO {
  data: TransactionDTO[];
  pagination: PaginationDTO;
  meta: {
    total_amount_cents: number;
    count: number;
  };
}

// ============================================================================
// TRANSACTION CATEGORY TYPES (Read-Only)
// ============================================================================

/**
 * Transaction category DTO (read-only dictionary)
 * Subset of entity fields exposed via API
 */
export type TransactionCategoryDTO = Pick<TransactionCategoryEntity, "code" | "kind" | "label_pl" | "is_active">;

/**
 * Transaction category list response
 */
export interface TransactionCategoryListResponseDTO {
  data: TransactionCategoryDTO[];
}

// ============================================================================
// GOAL TYPES
// ============================================================================

/**
 * Goal DTO for API responses
 * Combines database fields with computed progress percentage and joined type label
 */
export interface GoalDTO
  extends Pick<
    GoalEntity,
    | "id"
    | "name"
    | "type_code"
    | "target_amount_cents"
    | "current_balance_cents"
    | "is_priority"
    | "archived_at"
    | "created_at"
    | "updated_at"
  > {
  type_label: string; // Joined from goal_types.label_pl
  progress_percentage: number; // Computed: (current_balance / target_amount) * 100
}

/**
 * Command for creating a new goal
 * User provides name, type, target amount, and optionally priority flag
 */
export interface CreateGoalCommand extends Pick<GoalEntity, "name" | "type_code" | "target_amount_cents"> {
  is_priority?: boolean; // Optional, default false
}

/**
 * Command for updating an existing goal
 * All fields optional - only provided fields will be updated
 * Cannot update current_balance_cents (use goal-events instead)
 */
export interface UpdateGoalCommand {
  name?: string;
  target_amount_cents?: number;
  is_priority?: boolean;
}

/**
 * Goal detail DTO with event history
 * Extends base GoalDTO with events array and monthly change
 */
export interface GoalDetailDTO extends GoalDTO {
  events: GoalEventInDetailDTO[];
  monthly_change_cents: number; // Sum of DEPOSIT - WITHDRAW for specified month
}

/**
 * Simplified goal event structure for inclusion in goal details
 */
type GoalEventInDetailDTO = Pick<GoalEventEntity, "id" | "type" | "amount_cents" | "occurred_on" | "created_at">;

/**
 * Response for goal archive operation
 */
export interface ArchiveGoalResponseDTO extends Pick<GoalEntity, "id" | "name" | "archived_at"> {
  message: string;
}

/**
 * Goal list response
 */
export interface GoalListResponseDTO {
  data: GoalDTO[];
}

// ============================================================================
// GOAL TYPE TYPES (Read-Only)
// ============================================================================

/**
 * Goal type DTO (read-only dictionary)
 * Subset of entity fields exposed via API
 */
export type GoalTypeDTO = Pick<GoalTypeEntity, "code" | "label_pl" | "is_active">;

/**
 * Goal type list response
 */
export interface GoalTypeListResponseDTO {
  data: GoalTypeDTO[];
}

// ============================================================================
// GOAL EVENT TYPES
// ============================================================================

/**
 * Goal event DTO for API responses
 * Extends database fields with joined goal name
 */
export type GoalEventDTO = Pick<
  GoalEventEntity,
  "id" | "goal_id" | "type" | "amount_cents" | "occurred_on" | "created_at"
> & {
  goal_name: string; // Joined from goals.name
};

/**
 * Goal event detail DTO for POST response
 * Includes additional goal_balance_after_cents computed field
 */
export interface GoalEventDetailDTO extends GoalEventDTO {
  goal_balance_after_cents: number; // Goal's current_balance after this event
}

/**
 * Command for creating a new goal event (deposit or withdrawal)
 * Calls rpc.add_goal_event() function which handles validation and balance updates
 */
export type CreateGoalEventCommand = Pick<
  GoalEventEntity,
  "goal_id" | "type" | "amount_cents" | "occurred_on" | "client_request_id"
>;

/**
 * Goal event list response with pagination
 */
export interface GoalEventListResponseDTO {
  data: GoalEventDTO[];
  pagination: PaginationDTO;
}

// ============================================================================
// METRICS TYPES
// ============================================================================

/**
 * Monthly metrics DTO for dashboard
 * Extends database entity with computed formula string for display
 */
export interface MonthlyMetricsDTO
  extends Pick<
    MonthlyMetricsEntity,
    "month" | "income_cents" | "expenses_cents" | "net_saved_cents" | "free_cash_flow_cents" | "refreshed_at"
  > {
  free_cash_flow_formula: string; // Formatted formula for UI display
}

/**
 * Single category expense breakdown item
 */
export interface ExpenseByCategoryDTO {
  category_code: string;
  category_label: string;
  total_cents: number;
  expense_percentage: number; // Percentage of total expenses
  transaction_count: number;
}

/**
 * Expenses by category response
 */
export interface ExpensesByCategoryResponseDTO {
  month: string; // YYYY-MM format
  data: ExpenseByCategoryDTO[];
  total_expenses_cents: number;
}

/**
 * Priority goal metrics for dashboard
 * Combines goal data with monthly change calculation
 */
export interface PriorityGoalMetricsDTO {
  goal_id: string;
  name: string;
  type_code: string;
  type_label: string;
  target_amount_cents: number;
  current_balance_cents: number;
  progress_percentage: number;
  monthly_change_cents: number; // Net change (DEPOSIT - WITHDRAW) for specified month
  month: string; // YYYY-MM format
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

/**
 * Audit log entry DTO
 * Simplified version of database entity for API responses
 */
export type AuditLogEntryDTO = Pick<
  AuditLogEntity,
  "id" | "entity_type" | "entity_id" | "action" | "before" | "after" | "performed_at"
>;

/**
 * Audit log list response with pagination
 */
export interface AuditLogListResponseDTO {
  data: AuditLogEntryDTO[];
  pagination: PaginationDTO;
}

// ============================================================================
// VALIDATION TYPES - Typy używane do walidacji po stronie klienta
// ============================================================================

/**
 * Transaction type literal
 */
export type TransactionType = "INCOME" | "EXPENSE";

/**
 * Goal event type literal
 */
export type GoalEventType = "DEPOSIT" | "WITHDRAW";

/**
 * Audit log action type literal
 */
export type AuditLogAction = "CREATE" | "UPDATE" | "DELETE";

/**
 * Audit log entity type literal
 */
export type AuditLogEntityType = "transaction" | "goal" | "goal_event";
