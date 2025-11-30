// src/components/audit-log/AuditLogRow.tsx

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock } from "lucide-react";
import type { AuditLogListItemVM } from "./types";

interface AuditLogRowProps {
  item: AuditLogListItemVM;
  onClick: (item: AuditLogListItemVM) => void;
}

/**
 * AuditLogRow - pojedynczy wiersz listy audit log
 *
 * Struktura:
 * - Czas (lokalny) z tooltipem (UTC)
 * - Typ encji i akcja (badges)
 * - Streszczenie zmian
 * - ID encji (obcięte)
 *
 * Interakcje:
 * - Klik wiersza → otwarcie szczegółów (modal diff)
 */
export function AuditLogRow({ item, onClick }: AuditLogRowProps) {
  const handleClick = () => {
    onClick(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(item);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="p-4 border-b last:border-b-0 hover:bg-accent transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Lewa strona: Czas i streszczenie */}
        <div className="flex-1 min-w-0">
          {/* Czas */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Clock className="size-3" />
                  <span>{item.performedAtLocal}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">UTC: {item.performedAtUTC}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Streszczenie */}
          <p className="text-sm font-medium mb-2">{item.summary}</p>

          {/* ID encji (obcięte) */}
          <p className="text-xs text-muted-foreground font-mono truncate">ID: {item.entityId}</p>
        </div>

        {/* Prawa strona: Badges */}
        <div className="flex flex-col gap-1.5 items-end">
          {/* Akcja */}
          <Badge variant={getActionVariant(item.action)} className="text-xs">
            {getActionLabel(item.action)}
          </Badge>

          {/* Typ encji */}
          <Badge variant="outline" className="text-xs">
            {getEntityTypeLabel(item.entityType)}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Zwraca wariant badge dla akcji
 */
function getActionVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  switch (action) {
    case "CREATE":
      return "default";
    case "UPDATE":
      return "secondary";
    case "DELETE":
      return "destructive";
    default:
      return "outline";
  }
}

/**
 * Zwraca polską etykietę dla akcji
 */
function getActionLabel(action: string): string {
  switch (action) {
    case "CREATE":
      return "Utworzono";
    case "UPDATE":
      return "Zaktualizowano";
    case "DELETE":
      return "Usunięto";
    default:
      return action;
  }
}

/**
 * Zwraca polską etykietę dla typu encji
 */
function getEntityTypeLabel(entityType: string): string {
  switch (entityType) {
    case "transaction":
      return "Transakcja";
    case "goal":
      return "Cel";
    case "goal_event":
      return "Zdarzenie celu";
    default:
      return entityType;
  }
}
