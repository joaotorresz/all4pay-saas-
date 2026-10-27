import { AppShell } from "@/components/app/AppShell";
import { AprovacoesView } from "@/components/aprovacoes/AprovacoesView";

/**
 * APROVAÇÕES — as solicitações acima da alçada. Era a aba "Solicitações" de
 * Aprovações e baixas (`/central`); voltou a endereço próprio em 27/10/2026.
 * Pro pelo prefixo em `ROTAS_PRO`, como a aba era por `ABAS_PRO`.
 */
export default function AprovacoesPage() {
  return (
    <AppShell title="Aprovações" crumb="Caixa e bancos">
      <AprovacoesView />
    </AppShell>
  );
}
