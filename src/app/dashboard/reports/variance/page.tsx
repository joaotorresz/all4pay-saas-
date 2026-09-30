import { AppShell } from "@/components/app/AppShell";
import { VariacaoView } from "@/components/relatorios/VariacaoView";

export default function AnaliseDeVariacaoPage() {
  return (
    <AppShell title="Análise de variação" crumb="Relatórios">
      <VariacaoView />
    </AppShell>
  );
}
