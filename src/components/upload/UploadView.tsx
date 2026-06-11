"use client";

import { InboxView } from "@/components/inbox/InboxView";
import { ImportView } from "@/components/import/ImportView";

/**
 * Upload de dados — junção da Caixa de Entrada (documentos/OCR: boleto,
 * comprovante, nota) com o Onboarding inteligente (extratos OFX/CSV em lote, FDIP).
 * Tudo que entra na empresa passa por aqui e se correlaciona em todo o sistema.
 * O botão da home abre o wizard rápido de 3 etapas; esta página é a central
 * completa (lista de documentos, workbench, central de confiança e setup).
 */
export function UploadView() {
  return (
    <div className="flex flex-col gap-8 pb-4">
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-label font-medium text-faint tracking-wide">Documentos · leitura inteligente (OCR)</h2>
        <InboxView />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-label font-medium text-faint tracking-wide">Importação em lote · extratos OFX/CSV</h2>
        <ImportView />
      </section>
    </div>
  );
}
