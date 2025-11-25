import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DashboardMonth } from "./hooks/useMonthState";

interface MonthPickerProps {
  value: DashboardMonth;
  onChange: (month: DashboardMonth) => void;
  onPrev: () => void;
  onNext: () => void;
  isNextDisabled: boolean;
  minMonth?: DashboardMonth;
}

/**
 * MonthPicker - kontrolka wyboru miesiąca
 *
 * Funkcjonalności:
 * - Nawigacja prev/next
 * - Dropdown z listą miesięcy
 * - Blokada miesięcy przyszłych
 * - Format polski (styczeń 2024, luty 2024, etc.)
 */
export function MonthPicker({ value, onChange, onPrev, onNext, isNextDisabled, minMonth }: MonthPickerProps) {
  // Generuj listę miesięcy (ostatnie 24 miesiące)
  const monthOptions = generateMonthOptions(24, minMonth);

  // Format wyświetlania miesiąca (np. "Styczeń 2024")
  const formatMonth = (month: string): string => {
    const [year, monthNum] = month.split("-");
    const monthNames = [
      "Styczeń",
      "Luty",
      "Marzec",
      "Kwiecień",
      "Maj",
      "Czerwiec",
      "Lipiec",
      "Sierpień",
      "Wrzesień",
      "Październik",
      "Listopad",
      "Grudzień",
    ];
    return `${monthNames[parseInt(monthNum) - 1]} ${year}`;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="outline" size="icon" onClick={onPrev} aria-label="Poprzedni miesiąc">
        <ChevronLeft className="size-4" />
      </Button>

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[200px]" aria-label="Wybierz miesiąc">
          <Calendar className="size-4 mr-2" />
          <SelectValue>{formatMonth(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((month) => (
            <SelectItem key={month} value={month}>
              {formatMonth(month)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" size="icon" onClick={onNext} disabled={isNextDisabled} aria-label="Następny miesiąc">
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Generuje listę miesięcy wstecz od bieżącego
 */
function generateMonthOptions(count: number, minMonth?: string): string[] {
  const options: string[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  for (let i = 0; i < count; i++) {
    let year = currentYear;
    let month = currentMonth - i;

    while (month < 1) {
      month += 12;
      year -= 1;
    }

    const monthStr = `${year}-${month.toString().padStart(2, "0")}`;

    // Sprawdź minMonth jeśli podany
    if (minMonth && monthStr < minMonth) {
      break;
    }

    options.push(monthStr);
  }

  return options;
}
