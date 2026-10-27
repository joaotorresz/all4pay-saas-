import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { CentralView } from "@/components/central/CentralView";

/**
 * BAIXAS A CONFIRMAR — o que falta confirmar e baixar.
 *
 * ⚠️ Até 27/10/2026 era "Aprovações e baixas", com três abas. Viraram três
 * telas com linha de menu própria (decisão do dono, o fim das abas internas):
 * esta, as solicitações em `/aprovacoes` e as alçadas e papéis em
 * `/governanca` (as duas últimas são Pro, como as abas eram).
 */

export default function CentralPage() {
  /* ⚠️ A aprovação por WhatsApp nasce DESLIGADA. Com o portão fechado a ação
     nem aparece (um botão que sempre responde "desligada" é ruído); o portão
     de verdade é o da server action e o da rota, que conferem de novo. */
  const whatsappLigado = process.env.WHATSAPP_APROVACAO === "ligado";
  return (
    <AppShell title="Baixas a confirmar" crumb="Caixa e bancos" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <CentralView whatsappLigado={whatsappLigado} />
      </Suspense>
    </AppShell>
  );
}
