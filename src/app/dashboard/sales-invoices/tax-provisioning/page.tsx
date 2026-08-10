import { AppShell } from "@/components/app/AppShell";
import { ImpostosView } from "@/components/vendas-nf/OutrasViews";
import { ProjecaoCarga } from "@/components/vendas/ProjecaoCarga";

export default function ImpostosPage() {
  return (
    <AppShell title="Impostos e obrigações" crumb="Vendas e NFs">
      <div className="flex flex-col gap-5">
        {/* ⚠️ PORTE de `/impostos` (mapa de consolidação, item 5). Esta tela
            APURA o que já foi vendido e gera a conta a pagar — olha para trás.
            A projeção olha para frente e responde "quanto vou pagar no
            trimestre", que era a única leitura prospectiva do produto. E ela lê
            o REGIME da configuração da empresa, em vez de cravar Lucro
            Presumido para todo mundo como a tela aposentada fazia. */}
        <ProjecaoCarga />
        <ImpostosView />
      </div>
    </AppShell>
  );
}
