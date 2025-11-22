import type { SupabaseClient } from "@/db/supabase.client";
import type {
  CreateTransactionCommand,
  TransactionDTO,
  TransactionListResponseDTO,
  UpdateTransactionCommand,
} from "@/types";
import { decodeCursor, encodeCursor } from "@/lib/schemas/transaction.schema";

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

/**
 * Filters for listing transactions
 * Used as parameter for listTransactions function
 */
export interface ListTransactionsFilters {
  month?: string; // YYYY-MM format
  type: "INCOME" | "EXPENSE" | "ALL";
  category?: string;
  search?: string;
  cursor?: string; // base64-encoded
  limit: number;
}

/**
 * List user transactions with filtering and pagination
 *
 * Business logic flow:
 * 1. Decode pagination cursor (if provided)
 * 2. Build query with filters (month, type, category, search)
 * 3. Apply cursor-based pagination (keyset)
 * 4. Fetch limit+1 records to detect has_more
 * 5. Map results to TransactionDTO with category_label
 * 6. Calculate metadata (count, total_amount_cents)
 * 7. Generate next_cursor from last record
 * 8. Return TransactionListResponseDTO
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user
 * @param filters - Validated filter parameters
 * @returns Promise<TransactionListResponseDTO>
 * @throws ValidationError - Invalid cursor format
 * @throws Error - Database error
 */
export async function listTransactions(
  supabase: SupabaseClient,
  userId: string,
  filters: ListTransactionsFilters
): Promise<TransactionListResponseDTO> {
  // Step 1: Decode cursor if provided
  let cursorData: { occurred_on: string; id: string } | null = null;
  if (filters.cursor) {
    try {
      cursorData = decodeCursor(filters.cursor);
    } catch (error) {
      throw new ValidationError("Invalid cursor format", {
        cursor: error instanceof Error ? error.message : "Invalid format",
      });
    }
  }

  // Step 2: Build base query with JOIN
  let query = supabase
    .from("transactions")
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
    .eq("user_id", userId)
    .is("deleted_at", null);

  // Step 3: Apply filters

  // Month filter (convert YYYY-MM to date)
  if (filters.month) {
    const monthStart = `${filters.month}-01`;
    query = query.eq("month", monthStart);
  }

  // Type filter (INCOME/EXPENSE, skip if ALL)
  if (filters.type !== "ALL") {
    query = query.eq("type", filters.type);
  }

  // Category filter
  if (filters.category) {
    query = query.eq("category_code", filters.category);
  }

  // Search filter (trigram matching in notes)
  if (filters.search) {
    query = query.ilike("note", `%${filters.search}%`);
  }

  // Step 4: Apply cursor-based pagination
  if (cursorData) {
    // Keyset pagination: WHERE (occurred_on, id) < (cursor_date, cursor_id)
    // Supabase doesn't support tuple comparison, so we use OR logic:
    // (occurred_on < cursor_date) OR (occurred_on = cursor_date AND id < cursor_id)
    query = query.or(
      `occurred_on.lt.${cursorData.occurred_on},and(occurred_on.eq.${cursorData.occurred_on},id.lt.${cursorData.id})`
    );
  }

  // Step 5: Order and limit
  query = query
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limit + 1); // +1 to detect has_more

  // Step 6: Execute query
  const { data: rawData, error } = await query;

  if (error) {
    throw error;
  }

  // Step 7: Detect has_more and slice to limit
  const hasMore = rawData.length > filters.limit;
  const transactions = hasMore ? rawData.slice(0, filters.limit) : rawData;

  // Step 8: Map to TransactionDTO[]
  const data: TransactionDTO[] = transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    category_code: tx.category_code,
    category_label: (tx.transaction_categories as { label_pl: string }).label_pl,
    amount_cents: tx.amount_cents,
    occurred_on: tx.occurred_on,
    note: tx.note,
    created_at: tx.created_at,
    updated_at: tx.updated_at,
  }));

  // Step 9: Calculate metadata
  const totalAmountCents = data.reduce((sum, tx) => sum + tx.amount_cents, 0);
  const count = data.length;

  // Step 10: Generate next_cursor
  const nextCursor =
    hasMore && data.length > 0 ? encodeCursor(data[data.length - 1].occurred_on, data[data.length - 1].id) : null;

  // Step 11: Build response
  return {
    data,
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
      limit: filters.limit,
    },
    meta: {
      total_amount_cents: totalAmountCents,
      count,
    },
  };
}

/**
 * Get a single transaction by ID for the authenticated user
 *
 * Business logic flow:
 * 1. Query transaction with INNER JOIN on transaction_categories
 * 2. Filter by user_id (explicit ownership check)
 * 3. Filter by id (UUID)
 * 4. Filter deleted_at IS NULL (exclude soft-deleted)
 * 5. Return TransactionDTO or null if not found
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param transactionId - UUID of transaction to fetch
 * @returns Promise<TransactionDTO | null> - Transaction with category label, or null if not found
 * @throws Error - Database error (will be caught as 500)
 */
export async function getTransactionById(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string
): Promise<TransactionDTO | null> {
  // Step 1: Query with JOIN on transaction_categories
  const { data, error } = await supabase
    .from("transactions")
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
    .eq("user_id", userId)
    .eq("id", transactionId)
    .is("deleted_at", null)
    .single();

  // Step 2: Handle database errors
  if (error) {
    // Supabase returns PGRST116 for .single() when no rows found
    // We return null for consistent 404 handling in API route
    if (error.code === "PGRST116") {
      return null;
    }

    // Other database errors should propagate as 500
    throw error;
  }

  // Step 3: Handle not found (null data)
  if (!data) {
    return null;
  }

  // Step 4: Map to TransactionDTO
  return {
    id: data.id,
    type: data.type,
    category_code: data.category_code,
    category_label: (data.transaction_categories as { label_pl: string }).label_pl,
    amount_cents: data.amount_cents,
    occurred_on: data.occurred_on,
    note: data.note,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * Updates an existing transaction for the authenticated user
 *
 * Business logic flow:
 * 1. Fetch existing transaction (validate ownership, not soft-deleted)
 * 2. If category_code is being changed:
 *    - Validate category exists and is active
 *    - Validate category kind matches transaction type (cannot change type)
 * 3. Detect if month is changing (for backdate_warning)
 * 4. Build update payload with only provided fields
 * 5. Execute UPDATE with RETURNING clause
 * 6. Return TransactionDTO with backdate_warning if month changed
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param transactionId - UUID of transaction to update
 * @param command - Validated command data (UpdateTransactionCommand)
 * @returns Promise<TransactionDTO | null> - Updated transaction, or null if not found
 * @throws ValidationError - Business validation failed (422)
 * @throws Error - Database error (will be caught as 500)
 */
export async function updateTransaction(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string,
  command: UpdateTransactionCommand
): Promise<TransactionDTO | null> {
  // Step 1: Fetch existing transaction
  // We need: type (for category validation), occurred_on (for backdate detection)
  const { data: existing, error: fetchError } = await supabase
    .from("transactions")
    .select("id, type, category_code, occurred_on")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  // Handle not found cases
  if (fetchError) {
    // Supabase returns PGRST116 for .single() when no rows found
    if (fetchError.code === "PGRST116") {
      return null;
    }
    // Other database errors should propagate as 500
    throw fetchError;
  }

  if (!existing) {
    return null;
  }

  // Step 2: Validate category if being changed
  if (command.category_code !== undefined) {
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

    // Validate category kind matches transaction type (cannot change type)
    if (category.kind !== existing.type) {
      throw new ValidationError(`Category ${command.category_code} is not valid for ${existing.type} transactions`, {
        category_code: `Category kind ${category.kind} does not match transaction type ${existing.type}`,
      });
    }
  }

  // Step 3: Detect month change for backdate_warning
  let monthChanged = false;
  if (command.occurred_on !== undefined && command.occurred_on !== existing.occurred_on) {
    // Extract YYYY-MM from YYYY-MM-DD
    const oldMonth = existing.occurred_on.substring(0, 7);
    const newMonth = command.occurred_on.substring(0, 7);
    monthChanged = oldMonth !== newMonth;
  }

  // Step 4: Build update payload
  // Only include fields that are present in command (partial update)
  const updateData: Record<string, string | number | null> = {
    updated_by: userId, // Always update this field
  };

  if (command.category_code !== undefined) {
    updateData.category_code = command.category_code;
  }
  if (command.amount_cents !== undefined) {
    updateData.amount_cents = command.amount_cents;
  }
  if (command.occurred_on !== undefined) {
    updateData.occurred_on = command.occurred_on;
  }
  if (command.note !== undefined) {
    updateData.note = command.note;
  }

  // Step 5: Execute UPDATE with RETURNING
  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update(updateData)
    .eq("id", transactionId)
    .eq("user_id", userId)
    .is("deleted_at", null) // Extra safety check
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

  if (updateError) {
    // Handle not found (e.g., concurrent soft-delete)
    if (updateError.code === "PGRST116") {
      return null;
    }
    // Let other database errors propagate
    throw updateError;
  }

  if (!updated) {
    return null;
  }

  // Step 6: Map to TransactionDTO with optional backdate_warning
  const result: TransactionDTO = {
    id: updated.id,
    type: updated.type,
    category_code: updated.category_code,
    category_label: (updated.transaction_categories as { label_pl: string }).label_pl,
    amount_cents: updated.amount_cents,
    occurred_on: updated.occurred_on,
    note: updated.note,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
  };

  // Add backdate_warning only if month changed
  if (monthChanged) {
    result.backdate_warning = true;
  }

  return result;
}
