// src/components/audit-log/mappers.ts

import type { AuditLogEntryDTO } from "@/types";
import type { AuditLogListItemVM } from "./types";

/**
 * Mapuje AuditLogEntryDTO na AuditLogListItemVM
 * @param dto - AuditLogEntryDTO z API
 * @returns AuditLogListItemVM z sformatowanym czasem i streszczeniem
 */
export function mapAuditLogDtoToVm(dto: AuditLogEntryDTO): AuditLogListItemVM {
  const performedAtDate = new Date(dto.performed_at);

  return {
    id: dto.id,
    entityType: dto.entity_type as "transaction" | "goal" | "goal_event",
    entityId: dto.entity_id,
    action: dto.action as "CREATE" | "UPDATE" | "DELETE",
    performedAtLocal: formatDateTimeLocal(performedAtDate),
    performedAtUTC: dto.performed_at,
    summary: generateSummary(dto),
  };
}

/**
 * Formatuje datę na format lokalny (YYYY-MM-DD HH:mm)
 */
function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Generuje streszczenie zmian na podstawie wpisu audit log
 */
function generateSummary(dto: AuditLogEntryDTO): string {
  const entityLabel = getEntityLabel(dto.entity_type);

  switch (dto.action) {
    case "CREATE":
      return `Utworzono ${entityLabel}`;

    case "DELETE":
      return `Usunięto ${entityLabel}`;

    case "UPDATE":
      return generateUpdateSummary(dto);

    default:
      return `${dto.action} ${entityLabel}`;
  }
}

/**
 * Generuje streszczenie dla akcji UPDATE
 */
function generateUpdateSummary(dto: AuditLogEntryDTO): string {
  const entityLabel = getEntityLabel(dto.entity_type);

  if (!dto.before || !dto.after || typeof dto.before !== "object" || typeof dto.after !== "object") {
    return `Zaktualizowano ${entityLabel}`;
  }

  const changes = getChangedFields(dto.before as Record<string, unknown>, dto.after as Record<string, unknown>);

  if (changes.length === 0) {
    return `Zaktualizowano ${entityLabel}`;
  }

  if (changes.length === 1) {
    return `Zaktualizowano ${entityLabel}: ${getFieldLabel(changes[0])}`;
  }

  if (changes.length <= 3) {
    const fieldLabels = changes.map(getFieldLabel).join(", ");
    return `Zaktualizowano ${entityLabel}: ${fieldLabels}`;
  }

  return `Zaktualizowano ${entityLabel} (${changes.length} zmian)`;
}

/**
 * Zwraca zmieniuone pola między before i after
 */
function getChangedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const changed: string[] = [];

  // Sprawdź wszystkie pola z after
  for (const key in after) {
    if (after[key] !== before[key]) {
      changed.push(key);
    }
  }

  // Sprawdź pola które zniknęły (są w before ale nie w after)
  for (const key in before) {
    if (!(key in after)) {
      changed.push(key);
    }
  }

  return changed;
}

/**
 * Zwraca polską etykietę dla typu encji
 */
function getEntityLabel(entityType: string): string {
  switch (entityType) {
    case "transaction":
      return "transakcję";
    case "goal":
      return "cel";
    case "goal_event":
      return "zdarzenie celu";
    default:
      return entityType;
  }
}

/**
 * Zwraca polską etykietę dla pola encji
 */
function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: "nazwa",
    amount_cents: "kwota",
    type: "typ",
    category_code: "kategoria",
    occurred_on: "data wystąpienia",
    note: "notatka",
    target_amount_cents: "kwota docelowa",
    current_balance_cents: "saldo",
    is_priority: "priorytet",
    archived_at: "archiwizacja",
  };

  return labels[field] || field;
}
