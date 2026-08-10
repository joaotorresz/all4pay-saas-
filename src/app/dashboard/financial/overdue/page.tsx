import { AppShell } from "@/components/app/AppShell";
import { InadimplenciaView } from "@/components/inadimplencia/InadimplenciaView";

/**
 * ⚠️ Rota PRÓPRIA criada ao portar o hub legado (mapa de consolidação, item 2).
 * Esta tela só existia como aba de `/recebimentos`/`/pagamentos`; aposentar o
 * hub sem lhe dar endereço a apagaria do produto, e ninguém notaria até alguém
 * procurá-la e não achar.
 */
export default function Page() {
  return (
    <AppShell title="Inadimplência e cobrança" crumb="Financeiro">
      <InadimplenciaView />
    </AppShell>
  );
}
