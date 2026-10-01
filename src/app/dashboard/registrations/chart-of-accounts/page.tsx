import { AppShell } from "@/components/app/AppShell";
import { PlanoContasView } from "@/components/registros/PlanoContasView";

export default function PlanoDeContasPage() {
  return (
    <AppShell title="Plano de contas" crumb="Estrutura e cadastros">
      <PlanoContasView />
    </AppShell>
  );
}
