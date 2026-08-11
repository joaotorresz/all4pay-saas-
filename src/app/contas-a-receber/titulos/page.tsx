import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { TitulosView } from "@/components/movimentacoes/TitulosView";

/**
 * TÍTULOS A RECEBER — a mesma ferramenta de `TitulosView`, só o lado de receber.
 *
 * ⚠️ É o MESMO componente da tela de títulos a pagar, com `direcao="receber"`,
 * e não uma cópia. Duas listas de títulos divergiriam no primeiro ajuste — e é
 * dinheiro que elas somam, então a divergência apareceria como dois valores
 * para a mesma pergunta. Foi exatamente assim que o produto acumulou duas telas
 * de "a receber" que não batiam.
 */
export default function TitulosAReceberPage() {
  return (
    <AppShell title="Títulos a receber" crumb="Contas a receber" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <TitulosView direcao="receber" />
      </Suspense>
    </AppShell>
  );
}
