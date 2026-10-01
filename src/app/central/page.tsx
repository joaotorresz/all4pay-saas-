import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { CentralView } from "@/components/central/CentralView";

export default function CentralPage() {
  /* ⚠️ A aprovação por WhatsApp nasce DESLIGADA. Com o portão fechado a ação
     nem aparece (um botão que sempre responde "desligada" é ruído); o portão
     de verdade é o da server action e o da rota, que conferem de novo. */
  const whatsappLigado = process.env.WHATSAPP_APROVACAO === "ligado";
  return (
    <AppShell title="Central financeira" crumb="Confirmação e baixa" actions={isDemo ? <DemoBadge /> : null}>
      <Suspense fallback={null}>
        <CentralView whatsappLigado={whatsappLigado} />
      </Suspense>
    </AppShell>
  );
}
