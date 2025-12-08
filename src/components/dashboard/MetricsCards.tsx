import { TrendingUp, TrendingDown, Wallet, Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetricsCardsVM } from "./mappers";
import { FreeCashFlowTooltip } from "./FreeCashFlowTooltip";

interface MetricsCardsProps {
  data: MetricsCardsVM;
}

/**
 * MetricsCards - 4 karty z metrykami miesięcznymi
 *
 * Wyświetla:
 * - Dochód (INCOME)
 * - Wydatki (EXPENSE)
 * - Odłożone netto (NET_SAVED)
 * - Wolne środki (FREE_CASH_FLOW) z tooltipem wzoru
 */
export function MetricsCards({ data }: MetricsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Karta: Dochód */}
      <Card data-test-id="metric-card-income">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Dochód</CardTitle>
          <TrendingUp className="size-4 text-green-600" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.incomePLN} PLN</div>
          {data.refreshedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Odświeżono: {new Date(data.refreshedAt).toLocaleString("pl-PL")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Karta: Wydatki */}
      <Card data-test-id="metric-card-expenses">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Wydatki</CardTitle>
          <TrendingDown className="size-4 text-blue-600" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.expensesPLN} PLN</div>
        </CardContent>
      </Card>

      {/* Karta: Odłożone netto */}
      <Card data-test-id="metric-card-net-saved">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Odłożone netto</CardTitle>
          <Wallet className="size-4 text-blue-600" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.netSavedPLN} PLN</div>
        </CardContent>
      </Card>

      {/* Karta: Wolne środki z tooltipem */}
      <Card data-test-id="metric-card-free-cash-flow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Wolne środki</CardTitle>
            <FreeCashFlowTooltip formula={data.freeCashFlowFormula} />
          </div>
          <Coins className="size-4 text-purple-600" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.freeCashFlowPLN} PLN</div>
        </CardContent>
      </Card>
    </div>
  );
}
