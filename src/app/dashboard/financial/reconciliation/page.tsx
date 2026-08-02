import { AppShell } from "@/components/app/AppShell";
import { ConciliacaoView } from "@/components/movimentacoes/ConciliacaoView";

export default function ConciliacaoBancariaPage() {
  return (
    <AppShell title="Conciliação Bancária" crumb="Financeiro">
      <ConciliacaoView />
    </AppShell>
  );
}
