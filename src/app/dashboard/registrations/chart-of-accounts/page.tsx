import { AppShell } from "@/components/app/AppShell";
import { PlanoContasView } from "@/components/registros/PlanoContasView";

export default function PlanoDeContasPage() {
  return (
    <AppShell title="Plano de Contas" crumb="Cadastros">
      <PlanoContasView />
    </AppShell>
  );
}
