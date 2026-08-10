import { AppShell } from "@/components/app/AppShell";
import { BoletosView } from "@/components/boletos/BoletosView";

/**
 * ⚠️ Rota PRÓPRIA criada ao portar o hub legado (mapa de consolidação, item 2).
 * Esta tela só existia como aba de `/recebimentos`/`/pagamentos`; aposentar o
 * hub sem lhe dar endereço a apagaria do produto, e ninguém notaria até alguém
 * procurá-la e não achar.
 */
export default function Page() {
  return (
    <AppShell title="Boletos e PIX" crumb="Financeiro">
      <BoletosView />
    </AppShell>
  );
}
