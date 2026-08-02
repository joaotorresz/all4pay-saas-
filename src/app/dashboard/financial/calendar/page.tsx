import { AppShell } from "@/components/app/AppShell";
import { CalendarioView } from "@/components/paineis/CalendarioView";

export default function CalendarioFinanceiroPage() {
  return (
    <AppShell title="Calendário" crumb="Financeiro">
      <CalendarioView />
    </AppShell>
  );
}
