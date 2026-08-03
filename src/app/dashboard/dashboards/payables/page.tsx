import { AppShell } from "@/components/app/AppShell";
import { TitulosView } from "@/components/paineis/TitulosView";

export default function DashContasPagarPage() {
  return (
    <AppShell title="Painel de contas a pagar" crumb="Dashboard">
      <TitulosView direcao="pagar" />
    </AppShell>
  );
}
