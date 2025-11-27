// src/components/transactions/TransactionRow.tsx

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";
import type { TransactionsListItemVM } from "./types";
import { formatDateShort } from "./utils/groupByDate";

interface TransactionRowProps {
  item: TransactionsListItemVM;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * TransactionRow - wiersz transakcji na liście
 *
 * Wyświetla:
 * - Data (DD.MM.YYYY)
 * - Typ (badge: INCOME/EXPENSE)
 * - Kategoria
 * - Kwota (PLN)
 * - Notatka (opcjonalnie)
 * - Akcje (Edit/Delete)
 */
export function TransactionRow({ item, onEdit, onDelete }: TransactionRowProps) {
  const handleEdit = () => onEdit(item.id);
  const handleDelete = () => onDelete(item.id);

  return (
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-muted/50 transition-colors border-b last:border-b-0">
      {/* Data */}
      <div className="w-24 text-sm text-muted-foreground">{formatDateShort(item.occurred_on)}</div>

      {/* Typ */}
      <Badge variant={item.type === "INCOME" ? "default" : "secondary"} className="w-20 justify-center">
        {item.type === "INCOME" ? "Przychód" : "Wydatek"}
      </Badge>

      {/* Kategoria */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{item.category_label}</div>
        {item.note && <div className="text-xs text-muted-foreground truncate mt-1">{item.note}</div>}
      </div>

      {/* Kwota */}
      <div className="text-right w-32">
        <div className={`text-sm font-semibold ${item.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
          {item.type === "INCOME" ? "+" : "-"}
          {item.amount_pln} zł
        </div>
      </div>

      {/* Akcje */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={handleEdit} aria-label="Edytuj transakcję">
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleDelete} aria-label="Usuń transakcję">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
