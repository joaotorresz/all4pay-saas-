import { AppShell } from "@/components/app/AppShell";
import { InstitutionalView } from "@/components/institucional/InstitutionalView";

/**
 * ALÇADAS E PAPÉIS — quem aprova quanto, a matriz de papéis e o teste da
 * trilha. Era a aba "Alçadas e papéis" de `/central`; desde 27/10/2026 mora
 * aqui, em Configurações (é ajuste da empresa, não trabalho do dia). Pro pelo
 * prefixo em `ROTAS_PRO`.
 */
export default function GovernancaPage() {
  return (
    <AppShell title="Alçadas e papéis" crumb="Configurações">
      <InstitutionalView semTrilha />
    </AppShell>
  );
}
