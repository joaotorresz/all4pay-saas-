import { ReceivablesCard } from "./ReceivablesCard";
import { PayablesCard } from "./PayablesCard";
import { AccountsCard } from "./AccountsCard";
import { DailyCashflowChart } from "./DailyCashflowChart";
import { SalesChart } from "./SalesChart";
import { FirstRunCard } from "./FirstRunCard";

/** The financial overview: 5 isolated widgets. Responsive 2-col / stack. */
export function OverviewGrid() {
  return (
    <div className="flex flex-col gap-5">
      <FirstRunCard />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <ReceivablesCard />
        <PayablesCard />

        {/* Contas ocupa as duas colunas no desktop */}
        <div className="md:col-span-2">
          <AccountsCard />
        </div>

        <DailyCashflowChart />
        <SalesChart />
      </div>
    </div>
  );
}
