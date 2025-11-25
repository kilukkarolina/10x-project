import { BarChart3, PieChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExpenseCategoryChartItemVM } from "./mappers";
import { DashboardSkeleton } from "./DashboardSkeleton";

interface ExpensesByCategoryChartProps {
  data: ExpenseCategoryChartItemVM[];
  loading?: boolean;
  error?: string;
}

/**
 * ExpensesByCategoryChart - wykres słupkowy poziomy wydatków wg kategorii
 *
 * Wyświetla:
 * - Tylko transakcje typu EXPENSE (zgodnie z US-098)
 * - Słupki proporcjonalne do kwot
 * - Procent i kwotę dla każdej kategorii
 * - Sortowanie DESC po kwocie
 */
export function ExpensesByCategoryChart({ data, loading, error }: ExpensesByCategoryChartProps) {
  if (loading) {
    return <DashboardSkeleton variant="chart" />;
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive text-center">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" aria-hidden="true" />
            Wydatki wg kategorii
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <PieChart className="size-12 mb-4 opacity-50" aria-hidden="true" />
            <p className="text-sm">Brak wydatków w tym miesiącu</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sortuj dane DESC po kwocie
  const sortedData = [...data].sort((a, b) => b.totalCents - a.totalCents);

  // Znajdź maksymalną wartość dla skalowania słupków
  const maxValue = Math.max(...sortedData.map((item) => item.totalCents));

  // Generuj alt text dla a11y
  const altText = `Wykres wydatków wg kategorii. ${sortedData
    .map((item) => `${item.categoryLabel}: ${item.totalPLN} PLN (${item.percentage.toFixed(1)}%)`)
    .join(", ")}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-5" aria-hidden="true" />
          Wydatki wg kategorii
        </CardTitle>
        <CardDescription>Szczegółowy podział wydatków w wybranym miesiącu</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4" role="img" aria-label={altText}>
          {sortedData.map((item) => {
            const widthPercent = maxValue > 0 ? (item.totalCents / maxValue) * 100 : 0;

            return (
              <div key={item.categoryCode} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.categoryLabel}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-semibold text-foreground">{item.totalPLN} PLN</span>
                    <span className="text-xs">({item.percentage.toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="h-8 bg-muted rounded-md overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out flex items-center justify-end px-2"
                    style={{ width: `${widthPercent}%` }}
                    role="progressbar"
                    aria-valuenow={item.totalCents}
                    aria-valuemin={0}
                    aria-valuemax={maxValue}
                    aria-label={`${item.categoryLabel}: ${item.percentage.toFixed(1)}%`}
                  >
                    {widthPercent > 20 && (
                      <span className="text-xs font-medium text-white">
                        {item.transactionCount} {item.transactionCount === 1 ? "transakcja" : "transakcje"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
