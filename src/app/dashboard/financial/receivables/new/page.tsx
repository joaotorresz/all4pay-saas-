import { AppShell } from "@/components/app/AppShell";
import { TituloForm } from "@/components/movimentacoes/TituloForm";

export default function NovaContaReceberPage() {
  return (
    <AppShell title="Nova conta a receber" crumb="Financeiro">
      <TituloForm direcao="receber" />
    </AppShell>
  );
}
