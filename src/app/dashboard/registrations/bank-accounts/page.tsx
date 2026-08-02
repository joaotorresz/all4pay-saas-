import { AppShell } from "@/components/app/AppShell";
import { ContasBancariasView } from "@/components/registros/ContasBancariasView";

export default function ContasBancariasPage() {
  return (
    <AppShell title="Contas bancárias" crumb="Cadastros">
      <ContasBancariasView />
    </AppShell>
  );
}
