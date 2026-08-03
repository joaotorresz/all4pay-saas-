import { AppShell } from "@/components/app/AppShell";
import { TitulosView } from "@/components/paineis/TitulosView";

export default function DashContasReceberPage() {
  return (
    <AppShell title="Painel de contas a receber" crumb="Dashboard">
      <TitulosView direcao="receber" />
    </AppShell>
  );
}
