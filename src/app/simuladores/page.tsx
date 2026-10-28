import { AppShell } from "@/components/app/AppShell";
import { SimuladorView } from "@/components/orcamento/SimuladorView";

/**
 * Posso comprar? — "se eu assumir este compromisso, o que acontece com o
 * caixa?". O plano de contratações era a outra aba e virou `/contratacoes`
 * (27/10/2026); o endereço `/simuladores` ficou com este simulador.
 */
export default function SimuladoresPage() {
  return (
    <AppShell title="Posso comprar?" crumb="Inteligência">
      <SimuladorView />
    </AppShell>
  );
}
