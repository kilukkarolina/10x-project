import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface DashboardSkeletonProps {
  variant?: "all" | "cards" | "chart" | "goal";
}

/**
 * DashboardSkeleton - placeholdery ładowania
 *
 * Wyświetla animowane placeholdery dla:
 * - Kart metryk (4 karty)
 * - Wykresu wydatków
 * - Progresu celu priorytetowego
 */
export function DashboardSkeleton({ variant = "all" }: DashboardSkeletonProps) {
  const showCards = variant === "all" || variant === "cards";
  const showChart = variant === "all" || variant === "chart";
  const showGoal = variant === "all" || variant === "goal";

  return (
    <div className="space-y-8">
      {showCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showChart && (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {showGoal && (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
            <Skeleton className="h-4 w-48" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
