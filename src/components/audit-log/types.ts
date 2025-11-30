// src/components/audit-log/types.ts

/**
 * Stan filtrów widoku Audit Log
 */
export interface AuditLogFiltersVM {
  entityType?: "transaction" | "goal" | "goal_event";
  entityId?: string; // UUID v4
  action?: "CREATE" | "UPDATE" | "DELETE";
  fromDate?: string; // ISO 8601 (UTC)
  toDate?: string; // ISO 8601 (UTC)
  limit: number; // 1..100 (domyślnie 50)
}

/**
 * ViewModel pojedynczego wpisu audit log w liście
 */
export interface AuditLogListItemVM {
  id: string;
  entityType: "transaction" | "goal" | "goal_event";
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  performedAtLocal: string; // np. "2025-01-16 11:00"
  performedAtUTC: string; // np. "2025-01-16T10:00:00Z"
  summary: string; // krótkie streszczenie zmian
}

/**
 * Pojedyncza zmiana w JSON diff
 */
export interface JsonDiffChange {
  path: string; // np. "amount_cents"
  from: unknown;
  to: unknown;
  kind: "added" | "removed" | "changed";
}

/**
 * ViewModel różnic JSON (before vs after)
 */
export interface JsonDiffVM {
  changes: JsonDiffChange[];
  beforePretty: string; // JSON.stringify(before, null, 2)
  afterPretty: string; // JSON.stringify(after, null, 2)
}
