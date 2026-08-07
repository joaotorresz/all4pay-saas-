import { AppShell } from "@/components/app/AppShell";
import { TituloForm } from "@/components/movimentacoes/TituloForm";

export default function NovaContaPagarPage() {
  return (
    <AppShell title="Nova conta a pagar" crumb="Financeiro">
      <TituloForm direcao="pagar" />
    </AppShell>
  );
}
