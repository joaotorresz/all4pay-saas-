import { AppShell } from "@/components/app/AppShell";
import { TitulosView } from "@/components/paineis/TitulosView";

export default function DashContasReceberPage() {
  return (
    <AppShell title="Dash de Contas a Receber" crumb="Dashboard">
      <TitulosView direcao="receber" />
    </AppShell>
  );
}
