import { AppShell } from "@/components/app/AppShell";
import { ReceitaReconhecimentoView } from "@/components/receita/ReceitaView";

/** Reconhecimento de receita — era aba do Razão contábil (27/10/2026). */
export default function ReceitaPage() {
  return (
    <AppShell title="Reconhecimento de receita" crumb="Contabilidade">
      <ReceitaReconhecimentoView />
    </AppShell>
  );
}
