// src/components/audit-log/JsonDiffDialog.tsx

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import type { AuditLogEntryDTO } from "@/types";
import type { JsonDiffVM } from "./types";

interface JsonDiffDialogProps {
  open: boolean;
  entry: AuditLogEntryDTO | null;
  onOpenChange: (next: boolean) => void;
  computeDiff: (entry: AuditLogEntryDTO) => JsonDiffVM;
}

type ViewMode = "diff" | "full";

/**
 * JsonDiffDialog - modal prezentujący różnice między before i after
 *
 * Funkcje:
 * - Wyświetlanie zmian (diff)
 * - Wyświetlanie pełnego JSON (before/after)
 * - Przełączanie widoku
 * - Kopiowanie JSON do schowka
 *
 * Obsługuje przypadki:
 * - CREATE (before === null)
 * - DELETE (after === null)
 * - UPDATE (przed i po)
 */
export function JsonDiffDialog({ open, entry, onOpenChange, computeDiff }: JsonDiffDialogProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("diff");
  const [copied, setCopied] = useState(false);

  if (!entry) return null;

  const diff = computeDiff(entry);

  // Handler dla kopiowania JSON
  const handleCopy = async () => {
    try {
      const text =
        viewMode === "diff" ? formatDiffAsText(diff) : `Before:\n${diff.beforePretty}\n\nAfter:\n${diff.afterPretty}`;

      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  // Reset view mode po zamknięciu
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setViewMode("diff");
      setCopied(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Szczegóły zmiany</DialogTitle>
          <DialogDescription>
            Akcja: <strong>{entry.action}</strong> • Typ: <strong>{entry.entity_type}</strong> • ID:{" "}
            <code className="text-xs">{entry.entity_id}</code>
          </DialogDescription>
        </DialogHeader>

        {/* Przełącznik widoku */}
        <div className="flex gap-2 border-b pb-3">
          <Button variant={viewMode === "diff" ? "default" : "outline"} size="sm" onClick={() => setViewMode("diff")}>
            Zmiany ({diff.changes.length})
          </Button>
          <Button variant={viewMode === "full" ? "default" : "outline"} size="sm" onClick={() => setViewMode("full")}>
            Pełny JSON
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
            {copied ? (
              <>
                <Check className="size-4" />
                Skopiowano
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Kopiuj
              </>
            )}
          </Button>
        </div>

        {/* Treść */}
        <div className="flex-1 overflow-auto">
          {viewMode === "diff" ? (
            <DiffView diff={diff} action={entry.action} />
          ) : (
            <FullJsonView diff={diff} action={entry.action} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Widok zmian (diff)
// ============================================================================

interface DiffViewProps {
  diff: JsonDiffVM;
  action: string;
}

function DiffView({ diff, action }: DiffViewProps) {
  if (diff.changes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Brak zmian do wyświetlenia</p>
      </div>
    );
  }

  // CREATE: pokaż wszystkie pola jako added
  if (action === "CREATE") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium mb-3">Utworzone pola:</p>
        {diff.changes.map((change, idx) => (
          <div key={idx} className="p-3 border rounded bg-green-50 dark:bg-green-950/20">
            <div className="flex items-start gap-2">
              <Badge
                variant="outline"
                className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
              >
                DODANO
              </Badge>
              <div className="flex-1">
                <p className="text-sm font-mono font-semibold">{change.path}</p>
                <pre className="text-xs mt-1 overflow-x-auto">{formatValue(change.to)}</pre>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // DELETE: pokaż wszystkie pola jako removed
  if (action === "DELETE") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium mb-3">Usunięte pola:</p>
        {diff.changes.map((change, idx) => (
          <div key={idx} className="p-3 border rounded bg-red-50 dark:bg-red-950/20">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                USUNIĘTO
              </Badge>
              <div className="flex-1">
                <p className="text-sm font-mono font-semibold">{change.path}</p>
                <pre className="text-xs mt-1 overflow-x-auto">{formatValue(change.from)}</pre>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // UPDATE: pokaż zmiany
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium mb-3">Zmienione pola:</p>
      {diff.changes.map((change, idx) => {
        const bgColor =
          change.kind === "added"
            ? "bg-green-50 dark:bg-green-950/20"
            : change.kind === "removed"
              ? "bg-red-50 dark:bg-red-950/20"
              : "bg-yellow-50 dark:bg-yellow-950/20";

        const badgeColor =
          change.kind === "added"
            ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
            : change.kind === "removed"
              ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
              : "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200";

        return (
          <div key={idx} className={`p-3 border rounded ${bgColor}`}>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className={`text-xs ${badgeColor}`}>
                {change.kind === "added" ? "DODANO" : change.kind === "removed" ? "USUNIĘTO" : "ZMIENIONO"}
              </Badge>
              <div className="flex-1">
                <p className="text-sm font-mono font-semibold">{change.path}</p>
                {change.kind === "changed" && (
                  <div className="mt-2 space-y-1">
                    <div>
                      <span className="text-xs text-muted-foreground">Przed:</span>
                      <pre className="text-xs mt-0.5 overflow-x-auto">{formatValue(change.from)}</pre>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Po:</span>
                      <pre className="text-xs mt-0.5 overflow-x-auto">{formatValue(change.to)}</pre>
                    </div>
                  </div>
                )}
                {change.kind === "added" && (
                  <pre className="text-xs mt-1 overflow-x-auto">{formatValue(change.to)}</pre>
                )}
                {change.kind === "removed" && (
                  <pre className="text-xs mt-1 overflow-x-auto">{formatValue(change.from)}</pre>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Widok pełnego JSON
// ============================================================================

interface FullJsonViewProps {
  diff: JsonDiffVM;
  action: string;
}

function FullJsonView({ diff, action }: FullJsonViewProps) {
  return (
    <div className="space-y-4">
      {/* Before */}
      {action !== "CREATE" && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Przed zmianą:</h4>
          <pre className="p-4 bg-muted rounded text-xs overflow-x-auto">{diff.beforePretty}</pre>
        </div>
      )}

      {/* After */}
      {action !== "DELETE" && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Po zmianie:</h4>
          <pre className="p-4 bg-muted rounded text-xs overflow-x-auto">{diff.afterPretty}</pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function formatDiffAsText(diff: JsonDiffVM): string {
  const lines: string[] = [];

  for (const change of diff.changes) {
    lines.push(`[${change.kind.toUpperCase()}] ${change.path}`);
    if (change.kind === "changed") {
      lines.push(`  Before: ${formatValue(change.from)}`);
      lines.push(`  After:  ${formatValue(change.to)}`);
    } else if (change.kind === "added") {
      lines.push(`  Value: ${formatValue(change.to)}`);
    } else if (change.kind === "removed") {
      lines.push(`  Value: ${formatValue(change.from)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
