import { AppShell } from "@/components/app/AppShell";
import { TitulosView } from "@/components/paineis/TitulosView";

export default function DashContasPagarPage() {
  return (
    <AppShell title="Dash de Contas a Pagar" crumb="Dashboard">
      <TitulosView direcao="pagar" />
    </AppShell>
  );
}
