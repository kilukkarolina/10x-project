import { Target, ArrowUpCircle, ArrowDownCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { PriorityGoalProgressVM } from "./mappers";
import { DashboardSkeleton } from "./DashboardSkeleton";

interface PriorityGoalProgressProps {
  data: PriorityGoalProgressVM | null;
  loading?: boolean;
  error?: string;
}

/**
 * PriorityGoalProgress - pasek postępu celu priorytetowego
 *
 * Wyświetla:
 * - Pasek postępu z procentem realizacji
 * - Aktualne / docelowe saldo
 * - Miesięczną zmianę (DEPOSIT - WITHDRAW) ze znakiem
 * - Placeholder gdy brak celu priorytetowego (404)
 */
export function PriorityGoalProgress({ data, loading }: PriorityGoalProgressProps) {
  if (loading) {
    return <DashboardSkeleton variant="goal" />;
  }

  // Błąd 404 nie jest krytyczny - wyświetl placeholder
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-5" aria-hidden="true" />
            Cel priorytetowy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <div className="rounded-full bg-muted p-6 mb-4">
              <Target className="size-12 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">Nie ustawiono celu priorytetowego</p>
            <Button asChild variant="outline">
              <a href="/goals">
                <TrendingUp className="size-4 mr-2" />
                Ustaw cel priorytetowy
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Określ kolor paska postępu na podstawie procentu
  const getProgressColor = (percent: number): string => {
    if (percent >= 100) return "bg-green-600";
    if (percent >= 75) return "bg-blue-600";
    if (percent >= 50) return "bg-yellow-600";
    return "bg-orange-600";
  };

  const progressColor = getProgressColor(data.progressPercentage);

  // Ikona dla miesięcznej zmiany
  const MonthlyChangeIcon = data.monthlyChangeCents >= 0 ? ArrowUpCircle : ArrowDownCircle;
  const changeColorClass = data.monthlyChangeCents >= 0 ? "text-green-600" : "text-red-600";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="size-5" aria-hidden="true" />
          {data.name}
        </CardTitle>
        <CardDescription>{data.typeLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pasek postępu */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Postęp: {data.progressPercentage.toFixed(1)}%</span>
            <span className="text-muted-foreground">
              {data.currentPLN} / {data.targetPLN} PLN
            </span>
          </div>
          <div className="relative">
            <Progress
              value={Math.min(data.progressPercentage, 100)}
              className="h-3"
              aria-label={`Postęp realizacji celu: ${data.progressPercentage.toFixed(1)}%`}
            />
            {/* Niestandardowy kolor - nadpisany przez inline style */}
            <div
              className={`absolute top-0 left-0 h-3 rounded-full transition-all ${progressColor}`}
              style={{ width: `${Math.min(data.progressPercentage, 100)}%` }}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Miesięczna zmiana */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <MonthlyChangeIcon className={`size-5 ${changeColorClass}`} aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Zmiana w miesiącu</p>
            <p className={`text-lg font-semibold ${changeColorClass}`}>{data.monthlyChangePLN} PLN</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
