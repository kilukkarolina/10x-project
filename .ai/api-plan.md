# REST API Plan for FinFlow

## Overview

This document describes the REST API design for FinFlow, a personal finance management application. The API follows REST principles, uses JSON for data exchange, and implements versioning (v1) for future compatibility.

**Base URL:** `/api/v1`

**Authentication:** Supabase Auth (JWT tokens in Authorization header: `Bearer <token>`)

**Data Formats:**

- All monetary amounts are in cents (integer)
- Dates are in `YYYY-MM-DD` format (ISO 8601 date only)
- Timestamps are in ISO 8601 format with timezone (UTC)
- Currency: PLN only (no multi-currency support in MVP)

---

## 1. Resources

| Resource             | Database Table           | Description                                   |
| -------------------- | ------------------------ | --------------------------------------------- |
| Profile              | `profiles`               | User profile information                      |
| Transaction          | `transactions`           | Income and expense transactions               |
| Transaction Category | `transaction_categories` | Predefined transaction categories (read-only) |
| Goal                 | `goals`                  | Savings goals                                 |
| Goal Type            | `goal_types`             | Predefined goal types (read-only)             |
| Goal Event           | `goal_events`            | Deposits and withdrawals for goals            |
| Monthly Metrics      | `monthly_metrics`        | Aggregated monthly financial data             |
| Audit Log            | `audit_log`              | History of changes to user data               |

---

## 2. Endpoints

### 2.1 Authentication & Profile

#### POST /api/v1/auth/register

Register a new user account.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Validation:**

- Password: min 10 characters, at least 1 letter and 1 digit
- Email: valid email format

**Success Response:** `201 Created`

```json
{
  "message": "Rejestracja pomyślna. Sprawdź e-mail w celu weryfikacji konta.",
  "user_id": "uuid-string"
}
```

**Error Responses:**

- `400 Bad Request` - Invalid email or password format
- `409 Conflict` - Email already registered
- `422 Unprocessable Entity` - Validation errors

---

#### POST /api/v1/auth/login

Authenticate user and obtain access token.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Success Response:** `200 OK`

```json
{
  "access_token": "jwt-token",
  "refresh_token": "refresh-token",
  "expires_in": 3600,
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "email_confirmed": false
  }
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid credentials
- `403 Forbidden` - Email not verified (with resend option)

---

#### POST /api/v1/auth/logout

Logout current user session.

**Success Response:** `204 No Content`

---

#### POST /api/v1/auth/refresh

Refresh access token using refresh token.

**Request Body:**

```json
{
  "refresh_token": "refresh-token"
}
```

**Success Response:** `200 OK`

```json
{
  "access_token": "new-jwt-token",
  "expires_in": 3600
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid or expired refresh token

---

#### POST /api/v1/auth/reset-password

Request password reset email.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Rate Limit:** 3 requests per 30 minutes per email

**Success Response:** `200 OK`

```json
{
  "message": "Link resetowania hasła został wysłany na podany adres e-mail."
}
```

**Error Responses:**

- `429 Too Many Requests` - Rate limit exceeded

```json
{
  "error": "rate_limit_exceeded",
  "message": "Przekroczono limit wysyłek. Spróbuj ponownie za X minut.",
  "retry_after_seconds": 1200
}
```

---

#### POST /api/v1/auth/verify-email/resend

Resend verification email.

**Rate Limit:** 3 requests per 30 minutes per user

**Success Response:** `200 OK`

```json
{
  "message": "E-mail weryfikacyjny został wysłany ponownie."
}
```

**Error Responses:**

- `400 Bad Request` - Email already verified
- `429 Too Many Requests` - Rate limit exceeded

---

#### GET /api/v1/me

Get current user profile information.

**Success Response:** `200 OK`

```json
{
  "user_id": "uuid-string",
  "email": "user@example.com",
  "email_confirmed": true,
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z"
}
```

**Error Responses:**

- `401 Unauthorized` - Not authenticated

---

#### DELETE /api/v1/me

Delete user account (hard delete after 24h).

**Success Response:** `202 Accepted`

```json
{
  "message": "Konto zostanie usunięte w ciągu 24 godzin. Logi audytowe będą zachowane przez 30 dni."
}
```

---

### 2.2 Transactions

#### GET /api/v1/transactions

List user transactions with filtering and pagination.

**Query Parameters:**

- `month` (optional) - Filter by month (format: `YYYY-MM`, e.g., `2025-01`)
- `type` (optional) - Filter by type: `INCOME`, `EXPENSE`, `ALL` (default: `ALL`)
- `category` (optional) - Filter by category code
- `search` (optional) - Full-text search in notes (trigram matching)
- `cursor` (optional) - Pagination cursor (base64-encoded `{date}_{id}`)
- `limit` (optional) - Number of records per page (default: 50, max: 100)

**Success Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "uuid-string",
      "type": "EXPENSE",
      "category_code": "GROCERIES",
      "category_label": "Zakupy spożywcze",
      "amount_cents": 15750,
      "occurred_on": "2025-01-15",
      "note": "Zakupy w Biedronce",
      "created_at": "2025-01-15T18:30:00Z",
      "updated_at": "2025-01-15T18:30:00Z"
    }
  ],
  "pagination": {
    "next_cursor": "base64-encoded-cursor",
    "has_more": true,
    "limit": 50
  },
  "meta": {
    "total_amount_cents": 15750,
    "count": 1
  }
}
```

**Error Responses:**

- `400 Bad Request` - Invalid query parameters
- `401 Unauthorized` - Not authenticated

---

#### POST /api/v1/transactions

Create a new transaction.

**Request Body:**

```json
{
  "type": "EXPENSE",
  "category_code": "GROCERIES",
  "amount_cents": 15750,
  "occurred_on": "2025-01-15",
  "note": "Zakupy w Biedronce",
  "client_request_id": "client-generated-uuid"
}
```

**Validation:**

- `type`: required, must be `INCOME` or `EXPENSE`
- `category_code`: required, must exist in `transaction_categories` and match type
- `amount_cents`: required, must be > 0
- `occurred_on`: required, must be <= current_date
- `note`: optional, max 500 characters, no control characters
- `client_request_id`: required for idempotency

**Success Response:** `201 Created`

```json
{
  "id": "uuid-string",
  "type": "EXPENSE",
  "category_code": "GROCERIES",
  "category_label": "Zakupy spożywcze",
  "amount_cents": 15750,
  "occurred_on": "2025-01-15",
  "note": "Zakupy w Biedronce",
  "created_at": "2025-01-15T18:30:00Z",
  "updated_at": "2025-01-15T18:30:00Z"
}
```

**Error Responses:**

- `400 Bad Request` - Invalid data
- `409 Conflict` - Duplicate `client_request_id` (idempotency check)
- `422 Unprocessable Entity` - Validation errors

---

#### GET /api/v1/transactions/:id

Get transaction details.

**Success Response:** `200 OK`

```json
{
  "id": "uuid-string",
  "type": "EXPENSE",
  "category_code": "GROCERIES",
  "category_label": "Zakupy spożywcze",
  "amount_cents": 15750,
  "occurred_on": "2025-01-15",
  "note": "Zakupy w Biedronce",
  "created_at": "2025-01-15T18:30:00Z",
  "updated_at": "2025-01-15T18:30:00Z"
}
```

**Error Responses:**

- `404 Not Found` - Transaction not found or soft-deleted

---

#### PATCH /api/v1/transactions/:id

Update transaction (supports backdate).

**Request Body:**

```json
{
  "category_code": "RESTAURANTS",
  "amount_cents": 18000,
  "occurred_on": "2025-01-14",
  "note": "Kolacja w restauracji"
}
```

**Validation:**

- Same validation rules as POST
- Cannot change `type` (use DELETE + POST instead)
- Changing `occurred_on` to different month triggers backdate recalculation

**Success Response:** `200 OK`

```json
{
  "id": "uuid-string",
  "type": "EXPENSE",
  "category_code": "RESTAURANTS",
  "category_label": "Restauracje",
  "amount_cents": 18000,
  "occurred_on": "2025-01-14",
  "note": "Kolacja w restauracji",
  "created_at": "2025-01-15T18:30:00Z",
  "updated_at": "2025-01-16T10:00:00Z",
  "backdate_warning": true
}
```

**Error Responses:**

- `404 Not Found` - Transaction not found
- `422 Unprocessable Entity` - Validation errors

---

#### DELETE /api/v1/transactions/:id

Soft-delete transaction.

**Success Response:** `204 No Content`

**Error Responses:**

- `404 Not Found` - Transaction not found or already deleted

---

### 2.3 Transaction Categories (Read-Only)

#### GET /api/v1/categories

List all active transaction categories.

**Query Parameters:**

- `kind` (optional) - Filter by kind: `INCOME`, `EXPENSE`

**Success Response:** `200 OK`

```json
{
  "data": [
    {
      "code": "GROCERIES",
      "kind": "EXPENSE",
      "label_pl": "Zakupy spożywcze",
      "is_active": true
    },
    {
      "code": "TRANSPORT",
      "kind": "EXPENSE",
      "label_pl": "Transport",
      "is_active": true
    }
  ]
}
```

---

### 2.4 Goals

#### GET /api/v1/goals

List user goals.

**Query Parameters:**

- `include_archived` (optional) - Include archived goals (default: false)

**Success Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "uuid-string",
      "name": "Wakacje w Grecji",
      "type_code": "VACATION",
      "type_label": "Wakacje",
      "target_amount_cents": 500000,
      "current_balance_cents": 125000,
      "progress_percentage": 25.0,
      "is_priority": true,
      "archived_at": null,
      "created_at": "2025-01-01T10:00:00Z",
      "updated_at": "2025-01-15T18:30:00Z"
    }
  ]
}
```

---

#### POST /api/v1/goals

Create a new goal.

**Request Body:**

```json
{
  "name": "Wakacje w Grecji",
  "type_code": "VACATION",
  "target_amount_cents": 500000,
  "is_priority": false
}
```

**Validation:**

- `name`: required, 1-100 characters
- `type_code`: required, must exist in `goal_types`
- `target_amount_cents`: required, must be > 0
- `is_priority`: optional, default false (only one priority goal allowed)

**Success Response:** `201 Created`

```json
{
  "id": "uuid-string",
  "name": "Wakacje w Grecji",
  "type_code": "VACATION",
  "type_label": "Wakacje",
  "target_amount_cents": 500000,
  "current_balance_cents": 0,
  "progress_percentage": 0.0,
  "is_priority": false,
  "archived_at": null,
  "created_at": "2025-01-15T18:30:00Z",
  "updated_at": "2025-01-15T18:30:00Z"
}
```

**Error Responses:**

- `409 Conflict` - Another goal is already marked as priority
- `422 Unprocessable Entity` - Validation errors

---

#### GET /api/v1/goals/:id

Get goal details with event history.

**Query Parameters:**

- `include_events` (optional) - Include goal events history (default: true)
- `month` (optional) - Filter events by month (format: `YYYY-MM`)

**Success Response:** `200 OK`

```json
{
  "id": "uuid-string",
  "name": "Wakacje w Grecji",
  "type_code": "VACATION",
  "type_label": "Wakacje",
  "target_amount_cents": 500000,
  "current_balance_cents": 125000,
  "progress_percentage": 25.0,
  "is_priority": true,
  "archived_at": null,
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-15T18:30:00Z",
  "events": [
    {
      "id": "uuid-string",
      "type": "DEPOSIT",
      "amount_cents": 50000,
      "occurred_on": "2025-01-15",
      "created_at": "2025-01-15T18:30:00Z"
    }
  ],
  "monthly_change_cents": 50000
}
```

---

#### PATCH /api/v1/goals/:id

Update goal.

**Request Body:**

```json
{
  "name": "Wakacje w Grecji 2025",
  "target_amount_cents": 600000,
  "is_priority": true
}
```

**Validation:**

- Cannot update `current_balance_cents` (use goal-events instead)
- Cannot update archived goals
- Setting `is_priority: true` automatically unsets priority on other goals

**Success Response:** `200 OK`

```json
{
  "id": "uuid-string",
  "name": "Wakacje w Grecji 2025",
  "type_code": "VACATION",
  "type_label": "Wakacje",
  "target_amount_cents": 600000,
  "current_balance_cents": 125000,
  "progress_percentage": 20.83,
  "is_priority": true,
  "archived_at": null,
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-16T10:00:00Z"
}
```

**Error Responses:**

- `404 Not Found` - Goal not found
- `422 Unprocessable Entity` - Validation errors

---

#### POST /api/v1/goals/:id/archive

Archive goal (soft).

**Success Response:** `200 OK`

```json
{
  "id": "uuid-string",
  "name": "Wakacje w Grecji",
  "archived_at": "2025-01-16T10:00:00Z",
  "message": "Cel został zarchiwizowany. Dane historyczne pozostają niezmienione."
}
```

**Error Responses:**

- `404 Not Found` - Goal not found
- `409 Conflict` - Cannot archive priority goal (unset priority first)

---

### 2.5 Goal Types (Read-Only)

#### GET /api/v1/goal-types

List all active goal types.

**Success Response:** `200 OK`

```json
{
  "data": [
    {
      "code": "AUTO",
      "label_pl": "Samochód",
      "is_active": true
    },
    {
      "code": "VACATION",
      "label_pl": "Wakacje",
      "is_active": true
    },
    {
      "code": "RETIREMENT",
      "label_pl": "Emerytura",
      "is_active": true
    }
  ]
}
```

---

### 2.6 Goal Events

#### GET /api/v1/goal-events

List goal events with filtering.

**Query Parameters:**

- `goal_id` (optional) - Filter by goal
- `month` (optional) - Filter by month (format: `YYYY-MM`)
- `type` (optional) - Filter by type: `DEPOSIT`, `WITHDRAW`
- `cursor` (optional) - Pagination cursor
- `limit` (optional) - Records per page (default: 50, max: 100)

**Success Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "uuid-string",
      "goal_id": "uuid-string",
      "goal_name": "Wakacje w Grecji",
      "type": "DEPOSIT",
      "amount_cents": 50000,
      "occurred_on": "2025-01-15",
      "created_at": "2025-01-15T18:30:00Z"
    }
  ],
  "pagination": {
    "next_cursor": "base64-encoded-cursor",
    "has_more": false,
    "limit": 50
  }
}
```

---

#### POST /api/v1/goal-events

Add deposit or withdrawal to goal.

**Implementation Note:** This endpoint calls the `rpc.add_goal_event()` Postgres function (SECURITY DEFINER) which:

1. Validates goal ownership and non-archived status
2. Acquires row lock on goal (SELECT ... FOR UPDATE)
3. Validates balance for WITHDRAW (cannot go below 0)
4. Inserts goal_event record (with idempotency check)
5. Updates goal.current_balance_cents
6. Triggers monthly_metrics recalculation

**Request Body:**

```json
{
  "goal_id": "uuid-string",
  "type": "DEPOSIT",
  "amount_cents": 50000,
  "occurred_on": "2025-01-15",
  "client_request_id": "client-generated-uuid"
}
```

**Validation:**

- `goal_id`: required, must exist and belong to user
- `type`: required, must be `DEPOSIT` or `WITHDRAW`
- `amount_cents`: required, must be > 0
- `occurred_on`: required, must be <= current_date
- `client_request_id`: required for idempotency
- For WITHDRAW: `amount_cents` <= goal.current_balance_cents

**Success Response:** `201 Created`

```json
{
  "id": "uuid-string",
  "goal_id": "uuid-string",
  "goal_name": "Wakacje w Grecji",
  "type": "DEPOSIT",
  "amount_cents": 50000,
  "occurred_on": "2025-01-15",
  "created_at": "2025-01-15T18:30:00Z",
  "goal_balance_after_cents": 175000
}
```

**Error Responses:**

- `400 Bad Request` - Invalid data
- `404 Not Found` - Goal not found or archived
- `409 Conflict` - Duplicate `client_request_id` or insufficient balance for WITHDRAW
- `422 Unprocessable Entity` - Validation errors

---

### 2.7 Monthly Metrics (Dashboard)

#### GET /api/v1/metrics/monthly

Get aggregated monthly financial metrics.

**Query Parameters:**

- `month` (required) - Month to retrieve (format: `YYYY-MM`)

**Success Response:** `200 OK`

```json
{
  "month": "2025-01",
  "income_cents": 450000,
  "expenses_cents": 235000,
  "net_saved_cents": 50000,
  "free_cash_flow_cents": 165000,
  "free_cash_flow_formula": "Dochód (4,500.00 PLN) - Wydatki (2,350.00 PLN) - Odłożone netto (500.00 PLN) = 1,650.00 PLN",
  "refreshed_at": "2025-01-16T10:00:00Z"
}
```

**Note:**

- `free_cash_flow_cents` = `income_cents` - `expenses_cents` - `net_saved_cents`
- `net_saved_cents` = sum of (DEPOSIT - WITHDRAW) in the month

**Error Responses:**

- `400 Bad Request` - Invalid month format

---

#### GET /api/v1/metrics/expenses-by-category

Get expenses breakdown by category for a month.

**Query Parameters:**

- `month` (required) - Month to analyze (format: `YYYY-MM`)

**Success Response:** `200 OK`

```json
{
  "month": "2025-01",
  "data": [
    {
      "category_code": "GROCERIES",
      "category_label": "Zakupy spożywcze",
      "total_cents": 85000,
      "percentage": 36.17,
      "transaction_count": 12
    },
    {
      "category_code": "TRANSPORT",
      "category_label": "Transport",
      "total_cents": 45000,
      "percentage": 19.15,
      "transaction_count": 8
    }
  ],
  "total_expenses_cents": 235000
}
```

---

#### GET /api/v1/metrics/priority-goal

Get priority goal progress with monthly change.

**Query Parameters:**

- `month` (optional) - Month for monthly change calculation (default: current month)

**Success Response:** `200 OK`

```json
{
  "goal_id": "uuid-string",
  "name": "Wakacje w Grecji",
  "type_code": "VACATION",
  "type_label": "Wakacje",
  "target_amount_cents": 500000,
  "current_balance_cents": 175000,
  "progress_percentage": 35.0,
  "monthly_change_cents": 50000,
  "month": "2025-01"
}
```

**Error Responses:**

- `404 Not Found` - No priority goal set

---

### 2.8 Audit Log

#### GET /api/v1/audit-log

Get user's audit log history.

**Query Parameters:**

- `entity_type` (optional) - Filter by entity type: `transaction`, `goal`, `goal_event`
- `entity_id` (optional) - Filter by specific entity
- `action` (optional) - Filter by action: `CREATE`, `UPDATE`, `DELETE`
- `from_date` (optional) - Filter from date (ISO 8601 timestamp)
- `to_date` (optional) - Filter to date (ISO 8601 timestamp)
- `cursor` (optional) - Pagination cursor
- `limit` (optional) - Records per page (default: 50, max: 100)

**Success Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "uuid-string",
      "entity_type": "transaction",
      "entity_id": "uuid-string",
      "action": "UPDATE",
      "before": {
        "amount_cents": 15750,
        "note": "Zakupy w Biedronce"
      },
      "after": {
        "amount_cents": 18000,
        "note": "Kolacja w restauracji"
      },
      "performed_at": "2025-01-16T10:00:00Z"
    }
  ],
  "pagination": {
    "next_cursor": "base64-encoded-cursor",
    "has_more": true,
    "limit": 50
  }
}
```

**Note:** Audit log has 30-day retention. Records older than 30 days are automatically purged.

---

## 3. Authentication and Authorization

### Authentication Mechanism

- **Provider:** Supabase Auth
- **Method:** JWT (JSON Web Tokens)
- **Token Delivery:** Authorization header: `Bearer <access_token>`
- **Token Expiry:** 3600 seconds (1 hour)
- **Refresh:** Use refresh token to obtain new access token

### Authorization Rules

All endpoints (except authentication and public dictionaries) require:

1. Valid JWT token
2. Email verification (`profiles.email_confirmed = true`)

Row-Level Security (RLS) policies enforce:

- Users can only access their own data
- Filters applied automatically: `user_id = auth.uid()`
- Verified email check: `EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND email_confirmed = true)`

### Rate Limiting

Specific endpoints have rate limits:

- **POST /api/v1/auth/verify-email/resend**: 3 requests per 30 minutes per user
- **POST /api/v1/auth/reset-password**: 3 requests per 30 minutes per email

Rate limits are enforced via `rate_limits` table and Edge Functions.

### Security Headers

- **HTTPS Only:** All production traffic forced to HTTPS
- **Secure Cookies:** `Secure`, `HttpOnly`, `SameSite=Lax` attributes
- **CORS:** Configured for frontend domain only

---

## 4. Validation and Business Logic

### 4.1 Data Validation Rules

#### Transactions

- `type`: Must be `INCOME` or `EXPENSE`
- `category_code`:
  - Must exist in `transaction_categories` table
  - Must match transaction type (via FK: `category_code`, `type` → `code`, `kind`)
- `amount_cents`: Integer > 0
- `occurred_on`: Date format `YYYY-MM-DD`, must be <= current_date
- `note`: Optional, max 500 characters, no control characters (regex: `!~ '[[:cntrl:]]'`)
- `client_request_id`: Required UUID for idempotency (unique per user)

#### Goals

- `name`: Required, 1-100 characters
- `type_code`: Must exist in `goal_types` table
- `target_amount_cents`: Integer > 0
- `current_balance_cents`: Integer >= 0 (system-managed, not user-editable)
- `is_priority`: Boolean, only one goal can be priority at a time
- Cannot set priority on archived goals

#### Goal Events

- `type`: Must be `DEPOSIT` or `WITHDRAW`
- `amount_cents`: Integer > 0
- `occurred_on`: Date format `YYYY-MM-DD`, must be <= current_date
- `client_request_id`: Required UUID for idempotency (unique per user)
- **WITHDRAW validation:** `amount_cents` <= goal's `current_balance_cents`

#### Authentication

- **Password:** Minimum 10 characters, at least 1 letter and 1 digit
- **Email:** Valid email format, unique

### 4.2 Business Logic Implementation

#### Idempotency

All mutation operations (POST/PATCH/DELETE) for transactions and goal-events use `client_request_id`:

- Unique constraint: `(user_id, client_request_id)`
- Duplicate request returns `409 Conflict` with original resource
- Client generates UUID v4 or v7 for each operation

#### Soft Delete

- Transactions and goals use `deleted_at` timestamp for soft deletion
- Soft-deleted records excluded from queries via RLS policies
- Audit log preserves deletion history

#### Priority Goal Management

When setting `is_priority = true` on a goal:

1. Check if another goal is already priority
2. In single atomic transaction:
   - Set previous priority goal to `is_priority = false`
   - Set new goal to `is_priority = true`
3. Constraint: `uniq_goals_priority(user_id) WHERE is_priority AND archived_at IS NULL`

#### Goal Event Processing

Handled by `rpc.add_goal_event()` function (SECURITY DEFINER):

1. Validate user owns goal and goal is not archived
2. Acquire row lock: `SELECT ... FOR UPDATE` on `goals` table
3. For WITHDRAW: validate `amount_cents <= current_balance_cents`
4. Check idempotency: `(user_id, client_request_id)` uniqueness
5. Insert record into `goal_events`
6. Update `goals.current_balance_cents`:
   - DEPOSIT: `+= amount_cents`
   - WITHDRAW: `-= amount_cents`
7. Trigger `monthly_metrics` recalculation

#### Monthly Metrics Calculation

Maintained in `monthly_metrics` table via:

- **Triggers:** After INSERT/UPDATE/soft-delete on `transactions` and `goal_events`
- **Reconciliation Job:** Nightly cron (GitHub Actions) recalculates all months for consistency
- **Formulas:**
  - `income_cents` = SUM(amount_cents) WHERE type = 'INCOME' AND month = X
  - `expenses_cents` = SUM(amount_cents) WHERE type = 'EXPENSE' AND month = X
  - `net_saved_cents` = SUM(CASE WHEN type = 'DEPOSIT' THEN amount_cents ELSE -amount_cents END) FROM goal_events WHERE month = X
  - `free_cash_flow_cents` = income_cents - expenses_cents - net_saved_cents

#### Backdate Handling

When transaction or goal_event's `occurred_on` is modified:

1. Detect month change: `old.month != new.month`
2. Recalculate `monthly_metrics` for both old and new months
3. Set flag in response: `backdate_warning: true`
4. Frontend displays banner: "Dokonano korekty historycznej"

#### Audit Log

Automatically created via triggers on:

- `transactions`: CREATE, UPDATE, soft-DELETE
- `goals`: CREATE, UPDATE, soft-DELETE, archive
- `goal_events`: CREATE

Captures:

- `before`: JSONB snapshot before change
- `after`: JSONB snapshot after change
- `performed_at`: Timestamp in UTC
- `actor_user_id`: User who performed action
- Retention: 30 days (cleanup job via cron)

### 4.3 Pagination Strategy

**Keyset Pagination** (cursor-based) for transactions and goal-events:

- Sort order: `(occurred_on DESC, id DESC)`
- Cursor format: Base64-encoded `{date}_{id}` (e.g., `2025-01-15_uuid-string`)
- Index: `idx_tx_keyset(user_id, occurred_on desc, id desc) WHERE deleted_at IS NULL`
- Benefits: No skipping/duplication on concurrent inserts, stable performance

**Example:**

```
GET /api/v1/transactions?cursor=MjAyNS0wMS0xNV91dWlkLXN0cmluZw==&limit=50
```

Decodes to: `2025-01-15_uuid-string`
SQL: `WHERE (occurred_on, id) < ('2025-01-15', 'uuid-string') ORDER BY occurred_on DESC, id DESC LIMIT 51`
(Fetch limit+1 to determine `has_more`)

### 4.4 Performance Requirements

- **List queries:** Median (p50) response time <= 200ms for typical datasets
- **Filtering:** Use partial indexes with `WHERE deleted_at IS NULL`
- **Text search:** Trigram GIN index on `transactions.note`
- **Caching:** `monthly_metrics` pre-computed, no runtime aggregation needed for dashboard

### 4.5 Error Response Format

All error responses follow consistent structure:

```json
{
  "error": "error_code",
  "message": "Czytelny komunikat błędu po polsku",
  "details": {
    "field": "Szczegóły walidacji"
  },
  "retry_after_seconds": 1800
}
```

**Common Error Codes:**

- `unauthorized` - 401
- `forbidden` - 403
- `not_found` - 404
- `conflict` - 409
- `validation_error` - 422
- `rate_limit_exceeded` - 429
- `internal_error` - 500

---

## 5. Additional Considerations

### 5.1 Rounding and Currency Format

- **Storage:** All amounts in cents (integer)
- **Presentation:** Client-side formatting with banker's rounding (HALF-EVEN)
- **Input normalization:** Accept both comma (,) and dot (.) as decimal separators
- **Display format:** `1.234,56 zł` (dot for thousands, comma for decimals)

### 5.2 Date and Time Handling

- **Dates:** All transaction/event dates stored as `DATE` type (`YYYY-MM-DD`)
- **Timestamps:** Audit log uses `TIMESTAMPTZ` in UTC
- **Monthly calculations:** Based on `date_trunc('month', occurred_on)` stored column
- **No DST issues:** Business logic operates on dates only, not times

### 5.3 Optimistic Updates

Frontend implements optimistic UI updates:

1. Update UI immediately on user action
2. Send API request in background
3. On error: rollback UI state and show toast notification
4. On success: confirm operation

### 5.4 API Versioning

- Current version: `v1` (prefix: `/api/v1`)
- Future versions: `/api/v2`, etc.
- Breaking changes require new version
- Non-breaking changes (new optional fields) acceptable in same version

### 5.5 CORS and CSRF Protection

- **CORS:** Whitelist frontend domain only
- **CSRF:** Supabase Auth handles CSRF tokens for authentication
- **Cookie settings:** `SameSite=Lax` for session cookies

### 5.6 Monitoring and Logging

- API response times tracked for performance SLA (p50 <= 200ms)
- Error rates monitored for critical paths (registration, login, transaction CRUD)
- Audit log provides user-facing change history (30-day retention)

---

## 6. Future Considerations (Out of MVP Scope)

The following features are explicitly excluded from MVP but may be added in future versions:

- Bank integrations and automatic transaction import
- CSV/Excel import/export
- Mobile applications (iOS/Android)
- Multi-currency support
- Recurring transactions and budgets
- Push notifications and email reminders
- Advanced analytics and reporting
- Shared accounts/family mode
- Custom categories (user-defined)

---

## Appendix: API Endpoint Summary

| Method | Endpoint                             | Description                | Auth Required |
| ------ | ------------------------------------ | -------------------------- | ------------- |
| POST   | /api/v1/auth/register                | Register new user          | No            |
| POST   | /api/v1/auth/login                   | Login user                 | No            |
| POST   | /api/v1/auth/logout                  | Logout user                | Yes           |
| POST   | /api/v1/auth/refresh                 | Refresh token              | No            |
| POST   | /api/v1/auth/reset-password          | Request password reset     | No            |
| POST   | /api/v1/auth/verify-email/resend     | Resend verification email  | Yes           |
| GET    | /api/v1/me                           | Get user profile           | Yes           |
| DELETE | /api/v1/me                           | Delete user account        | Yes           |
| GET    | /api/v1/transactions                 | List transactions          | Yes           |
| POST   | /api/v1/transactions                 | Create transaction         | Yes           |
| GET    | /api/v1/transactions/:id             | Get transaction            | Yes           |
| PATCH  | /api/v1/transactions/:id             | Update transaction         | Yes           |
| DELETE | /api/v1/transactions/:id             | Delete transaction         | Yes           |
| GET    | /api/v1/categories                   | List categories            | Yes           |
| GET    | /api/v1/goals                        | List goals                 | Yes           |
| POST   | /api/v1/goals                        | Create goal                | Yes           |
| GET    | /api/v1/goals/:id                    | Get goal details           | Yes           |
| PATCH  | /api/v1/goals/:id                    | Update goal                | Yes           |
| POST   | /api/v1/goals/:id/archive            | Archive goal               | Yes           |
| GET    | /api/v1/goal-types                   | List goal types            | Yes           |
| GET    | /api/v1/goal-events                  | List goal events           | Yes           |
| POST   | /api/v1/goal-events                  | Create goal event          | Yes           |
| GET    | /api/v1/metrics/monthly              | Get monthly metrics        | Yes           |
| GET    | /api/v1/metrics/expenses-by-category | Get expenses breakdown     | Yes           |
| GET    | /api/v1/metrics/priority-goal        | Get priority goal progress | Yes           |
| GET    | /api/v1/audit-log                    | Get audit log              | Yes           |

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-16  
**Status:** Draft for MVP Implementation
