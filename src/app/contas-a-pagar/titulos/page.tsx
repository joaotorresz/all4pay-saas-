import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { TitulosView } from "@/components/movimentacoes/TitulosView";

/**
 * TÍTULOS A PAGAR — a mesma ferramenta de `TitulosView`, só o lado de pagar.
 *
 * ⚠️ É o MESMO componente da tela de títulos, não uma cópia. Duas listas de
 * títulos divergiriam no primeiro ajuste — e é dinheiro que elas somam, então a
 * divergência apareceria como dois valores para a mesma pergunta.
 *
 * O que muda é a MOLDURA: aqui não existem as abas de receber e transferências.
 * Na área "Contas a pagar" a pergunta já está respondida pelo menu, e oferecer
 * uma aba "Títulos a receber" dentro dela seria a mesma tela servindo a duas
 * áreas — que é como o produto acumulou duas telas de "a receber".
 */
export default function TitulosAPagarPage() {
  return (
    <AppShell title="Títulos a pagar" crumb="Contas a pagar" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <TitulosView direcao="pagar" />
      </Suspense>
    </AppShell>
  );
}
