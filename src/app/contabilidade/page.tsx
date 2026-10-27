import { AppShell } from "@/components/app/AppShell";
import { RazaoView } from "@/components/razao/RazaoView";

/**
 * O Razão contábil — só os lançamentos (27/10/2026, fim das abas internas).
 * Reconhecimento de receita, Cronogramas e Dimensões eram abas daqui e viraram
 * telas próprias (`/receita`, `/cronogramas`, `/dimensoes`); os endereços
 * `?aba=` antigos desviam para elas (`ALIASES_DE_ABA`).
 */
export default function ContabilidadePage() {
  return (
    <AppShell title="Razão contábil" crumb="Contabilidade">
      <RazaoView />
    </AppShell>
  );
}
