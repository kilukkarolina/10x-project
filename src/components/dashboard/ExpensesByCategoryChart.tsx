import { useState } from "react";
import { PieChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExpenseCategoryChartItemVM } from "./mappers";
import { DashboardSkeleton } from "./DashboardSkeleton";

interface ExpensesByCategoryChartProps {
  data: ExpenseCategoryChartItemVM[];
  loading?: boolean;
  error?: string;
}

// Paleta kolorów dla kategorii
const COLORS = [
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#ef4444", // red-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#6366f1", // indigo-500
];

/**
 * Generuje path SVG dla segmentu koła
 * Dla pełnego koła (360°) używa dwóch arc'ów, aby poprawnie renderować
 */
function createPieSlice(
  startAngle: number,
  endAngle: number,
  radius: number,
  centerX: number,
  centerY: number
): string {
  const angleDiff = endAngle - startAngle;

  // Specjalna obsługa dla pełnego koła (360°)
  // SVG arc nie działa gdy start i end są w tym samym miejscu
  if (Math.abs(angleDiff) >= 360) {
    // Użyj dwóch półokręgów (180° każdy)
    const startRadians = (startAngle * Math.PI) / 180;
    const x1 = centerX + radius * Math.cos(startRadians);
    const y1 = centerY + radius * Math.sin(startRadians);
    const x2 = centerX - radius * Math.cos(startRadians);
    const y2 = centerY - radius * Math.sin(startRadians);

    return [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 0 1 ${x2} ${y2}`,
      `A ${radius} ${radius} 0 0 1 ${x1} ${y1}`,
      "Z",
    ].join(" ");
  }

  const startRadians = (startAngle * Math.PI) / 180;
  const endRadians = (endAngle * Math.PI) / 180;

  const x1 = centerX + radius * Math.cos(startRadians);
  const y1 = centerY + radius * Math.sin(startRadians);
  const x2 = centerX + radius * Math.cos(endRadians);
  const y2 = centerY + radius * Math.sin(endRadians);

  const largeArcFlag = angleDiff > 180 ? 1 : 0;

  return [
    `M ${centerX} ${centerY}`,
    `L ${x1} ${y1}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
    "Z",
  ].join(" ");
}

/**
 * ExpensesByCategoryChart - wykres kołowy wydatków wg kategorii
 *
 * Wyświetla:
 * - Tylko transakcje typu EXPENSE (zgodnie z US-098)
 * - Wykres kołowy proporcjonalny do kwot
 * - Procent i kwotę dla każdej kategorii
 * - Interaktywne podświetlenie (hover)
 * - Sortowanie DESC po kwocie
 */
export function ExpensesByCategoryChart({ data, loading, error }: ExpensesByCategoryChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
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
            <PieChart className="size-5" aria-hidden="true" />
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

  // Oblicz kąty dla każdego segmentu (zaczynając od góry: -90°)
  const segments = sortedData.reduce<
    (ExpenseCategoryChartItemVM & { startAngle: number; endAngle: number; color: string })[]
  >((acc, item, index) => {
    const startAngle = acc.length > 0 ? acc[acc.length - 1].endAngle : -90;
    const angleSize = (item.percentage / 100) * 360;
    const endAngle = startAngle + angleSize;

    acc.push({
      ...item,
      startAngle,
      endAngle,
      color: COLORS[index % COLORS.length],
    });

    return acc;
  }, []);

  // Generuj alt text dla a11y
  const altText = `Wykres kołowy wydatków wg kategorii. ${sortedData
    .map((item) => `${item.categoryLabel}: ${item.totalPLN} PLN (${item.percentage.toFixed(1)}%)`)
    .join(", ")}`;

  const centerX = 150;
  const centerY = 150;
  const radius = 120;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="size-5" aria-hidden="true" />
          Wydatki wg kategorii
        </CardTitle>
        <CardDescription>Szczegółowy podział wydatków w wybranym miesiącu</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row gap-8 items-center">
          {/* Wykres kołowy */}
          <div className="flex-shrink-0">
            <svg
              width="300"
              height="300"
              viewBox="0 0 300 300"
              className="drop-shadow-md"
              role="img"
              aria-label={altText}
            >
              {segments.map((segment, index) => {
                const midAngle = (segment.startAngle + segment.endAngle) / 2;
                const midAngleRad = midAngle * (Math.PI / 180);
                const hoverOffset = hoveredIndex === index ? 5 : 0;
                const textRadius = radius * 0.7;

                return (
                  <g key={segment.categoryCode}>
                    <path
                      d={createPieSlice(segment.startAngle, segment.endAngle, radius, centerX, centerY)}
                      fill={segment.color}
                      stroke="white"
                      strokeWidth="2"
                      className="transition-all duration-200 cursor-pointer"
                      style={{
                        opacity: hoveredIndex === null || hoveredIndex === index ? 1 : 0.5,
                        transform: `translate(${Math.cos(midAngleRad) * hoverOffset}px, ${Math.sin(midAngleRad) * hoverOffset}px)`,
                        transformOrigin: "center",
                      }}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      aria-label={`${segment.categoryLabel}: ${segment.percentage.toFixed(1)}%`}
                    />
                    {/* Tekst procentu w środku segmentu (tylko dla > 5%) */}
                    {segment.percentage > 5 && (
                      <text
                        x={centerX + textRadius * Math.cos(midAngleRad)}
                        y={centerY + textRadius * Math.sin(midAngleRad)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-white font-semibold text-sm pointer-events-none"
                        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
                      >
                        {segment.percentage.toFixed(0)}%
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Legenda */}
          <div className="flex-1 space-y-3 w-full">
            {segments.map((segment, index) => (
              <div
                key={segment.categoryCode}
                className="flex items-center justify-between gap-4 p-2 rounded-md transition-colors cursor-pointer"
                style={{
                  backgroundColor: hoveredIndex === index ? `${segment.color}15` : "transparent",
                }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="size-4 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: segment.color }}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-sm truncate">{segment.categoryLabel}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-semibold text-sm">{segment.totalPLN} PLN</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {segment.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
