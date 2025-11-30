// src/components/audit-log/AuditLogFilters.tsx

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";
import type { AuditLogFiltersVM } from "./types";

interface AuditLogFiltersProps {
  value: AuditLogFiltersVM;
  onChange: (next: AuditLogFiltersVM) => void;
  onApply: () => void;
  onReset: () => void;
}

/**
 * AuditLogFilters - panel filtrów dla widoku Audit Log
 *
 * Kontrolki:
 * - Select: entity_type (transaction, goal, goal_event)
 * - Input: entity_id (UUID)
 * - Select: action (CREATE, UPDATE, DELETE)
 * - Input: from_date, to_date (datetime-local)
 * - Przyciski: Zastosuj, Wyczyść
 */
export function AuditLogFilters({ value, onChange, onApply, onReset }: AuditLogFiltersProps) {
  // Stan lokalny dla pól formularza (kontrolowane)
  const [entityType, setEntityType] = useState<string>(value.entityType || "all");
  const [entityId, setEntityId] = useState<string>(value.entityId || "");
  const [action, setAction] = useState<string>(value.action || "all");
  const [fromDate, setFromDate] = useState<string>(() => {
    // Konwersja ISO 8601 UTC do datetime-local
    return value.fromDate ? isoToDatetimeLocal(value.fromDate) : "";
  });
  const [toDate, setToDate] = useState<string>(() => {
    return value.toDate ? isoToDatetimeLocal(value.toDate) : "";
  });

  // Walidacja UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isEntityIdValid = !entityId || uuidRegex.test(entityId);

  // Walidacja zakresu dat
  const isDateRangeValid = !fromDate || !toDate || fromDate <= toDate;

  const canApply = isEntityIdValid && isDateRangeValid;

  // Synchrionzacja lokalnego stanu z propsem value
  useEffect(() => {
    setEntityType(value.entityType || "all");
    setEntityId(value.entityId || "");
    setAction(value.action || "all");
    setFromDate(value.fromDate ? isoToDatetimeLocal(value.fromDate) : "");
    setToDate(value.toDate ? isoToDatetimeLocal(value.toDate) : "");
  }, [value]);

  // Handler dla przycisku "Zastosuj"
  const handleApply = () => {
    if (!canApply) return;

    const next: AuditLogFiltersVM = {
      entityType: entityType !== "all" ? (entityType as AuditLogFiltersVM["entityType"]) : undefined,
      entityId: entityId.trim() || undefined,
      action: action !== "all" ? (action as AuditLogFiltersVM["action"]) : undefined,
      fromDate: fromDate ? datetimeLocalToIso(fromDate) : undefined,
      toDate: toDate ? datetimeLocalToIso(toDate) : undefined,
      limit: value.limit,
    };

    onChange(next);
    onApply();
  };

  // Handler dla przycisku "Wyczyść"
  const handleReset = () => {
    setEntityType("all");
    setEntityId("");
    setAction("all");
    setFromDate("");
    setToDate("");
    onReset();
  };

  // Handler dla Enter w polach input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canApply) {
      handleApply();
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold">Filtry</h3>
        <div className="group relative">
          <Info className="size-4 text-muted-foreground cursor-help" />
          <div className="absolute left-0 top-6 z-10 hidden w-64 rounded-md bg-popover p-2 text-xs text-popover-foreground shadow-md group-hover:block">
            Dane dziennika zmian przechowywane są przez ostatnie 30 dni. Starsze wpisy nie będą dostępne.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Typ encji */}
        <div className="space-y-2">
          <Label htmlFor="entity-type">Typ encji</Label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger id="entity-type">
              <SelectValue placeholder="Wszystkie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="transaction">Transakcja</SelectItem>
              <SelectItem value="goal">Cel</SelectItem>
              <SelectItem value="goal_event">Zdarzenie celu</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ID encji */}
        <div className="space-y-2">
          <Label htmlFor="entity-id">ID encji (UUID)</Label>
          <Input
            id="entity-id"
            type="text"
            placeholder="np. 123e4567-e89b-12d3-a456-426614174000"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            onKeyDown={handleKeyDown}
            className={!isEntityIdValid ? "border-destructive" : ""}
          />
          {!isEntityIdValid && <p className="text-xs text-destructive">Nieprawidłowy format UUID</p>}
        </div>

        {/* Akcja */}
        <div className="space-y-2">
          <Label htmlFor="action">Akcja</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger id="action">
              <SelectValue placeholder="Wszystkie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="CREATE">Utworzenie</SelectItem>
              <SelectItem value="UPDATE">Aktualizacja</SelectItem>
              <SelectItem value="DELETE">Usunięcie</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Data od */}
        <div className="space-y-2">
          <Label htmlFor="from-date">Data od</Label>
          <Input
            id="from-date"
            type="datetime-local"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Data do */}
        <div className="space-y-2">
          <Label htmlFor="to-date">Data do</Label>
          <Input
            id="to-date"
            type="datetime-local"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className={!isDateRangeValid ? "border-destructive" : ""}
          />
          {!isDateRangeValid && <p className="text-xs text-destructive">Data od musi być wcześniejsza niż data do</p>}
        </div>
      </div>

      {/* Przyciski akcji */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleApply} disabled={!canApply}>
          Zastosuj
        </Button>
        <Button onClick={handleReset} variant="outline">
          Wyczyść
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers - konwersja dat
// ============================================================================

/**
 * Konwertuje ISO 8601 UTC na format datetime-local (yyyy-MM-ddThh:mm)
 */
function isoToDatetimeLocal(iso: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";

    // Format: yyyy-MM-ddThh:mm (strefa lokalna)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
}

/**
 * Konwertuje format datetime-local (yyyy-MM-ddThh:mm) na ISO 8601 UTC
 */
function datetimeLocalToIso(datetimeLocal: string): string {
  try {
    const date = new Date(datetimeLocal);
    if (isNaN(date.getTime())) return "";

    return date.toISOString();
  } catch {
    return "";
  }
}
