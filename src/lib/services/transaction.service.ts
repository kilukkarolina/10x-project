import type { SupabaseClient } from "@/db/supabase.client";
import type { CreateTransactionCommand, TransactionDTO } from "@/types";

/**
 * Custom error class for business validation errors
 * Used for 422 Unprocessable Entity responses
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: Record<string, string>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Creates a new transaction for the authenticated user
 *
 * Business logic flow:
 * 1. Validate that category exists and is active
 * 2. Validate that category kind matches transaction type
 * 3. Insert transaction into database (RLS will verify user)
 * 4. Fetch inserted transaction with joined category_label
 * 5. Return TransactionDTO
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param command - Validated command data (CreateTransactionCommand)
 * @returns Promise<TransactionDTO> - Created transaction with category label
 * @throws ValidationError - Business validation failed (422)
 * @throws Error - Database error (will be caught as 500)
 */
export async function createTransaction(
  supabase: SupabaseClient,
  userId: string,
  command: CreateTransactionCommand
): Promise<TransactionDTO> {
  // Step 1: Validate category exists and is active
  const { data: category, error: categoryError } = await supabase
    .from("transaction_categories")
    .select("kind, is_active")
    .eq("code", command.category_code)
    .single();

  if (categoryError || !category) {
    throw new ValidationError("Category code does not exist or is inactive", {
      category_code: command.category_code,
    });
  }

  if (!category.is_active) {
    throw new ValidationError("Category is not active", {
      category_code: command.category_code,
    });
  }

  // Step 2: Validate category kind matches transaction type
  if (category.kind !== command.type) {
    throw new ValidationError(`Category ${command.category_code} is not valid for ${command.type} transactions`, {
      category_code: `Category kind ${category.kind} does not match transaction type ${command.type}`,
    });
  }

  // Step 3: Insert transaction into database
  // Note: RLS will automatically check:
  // - user_id matches auth.uid()
  // - user's email is confirmed (via profiles table)
  const { data: transaction, error: insertError } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      type: command.type,
      category_code: command.category_code,
      amount_cents: command.amount_cents,
      occurred_on: command.occurred_on,
      note: command.note ?? null,
      client_request_id: command.client_request_id,
      created_by: userId,
      updated_by: userId,
    })
    .select(
      `
      id,
      type,
      category_code,
      amount_cents,
      occurred_on,
      note,
      created_at,
      updated_at,
      transaction_categories!inner(label_pl)
    `
    )
    .single();

  if (insertError) {
    // Let database errors propagate
    // Handler will catch them and return 500 or specific error codes (e.g., 409 for duplicate)
    throw insertError;
  }

  // Step 4: Map to TransactionDTO
  // The query above uses inner join to get category label
  return {
    id: transaction.id,
    type: transaction.type,
    category_code: transaction.category_code,
    category_label: (transaction.transaction_categories as { label_pl: string }).label_pl,
    amount_cents: transaction.amount_cents,
    occurred_on: transaction.occurred_on,
    note: transaction.note,
    created_at: transaction.created_at,
    updated_at: transaction.updated_at,
  };
}
