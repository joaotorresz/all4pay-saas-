"use client";

/**
 * Entrada de dados — a esteira ÚNICA de ingestão (GAP #5), numa página só
 * (27/10/2026, "sem abas internas"): enviar extrato, conectar banco e a fila
 * de revisão, uma seção embaixo da outra. Regras de categoria e Duplicatas
 * viraram páginas próprias (`/upload/regras`, `/upload/duplicatas`); os
 * `?aba=` antigos rolam até a seção ou respondem 308.
 */
import * as React from "react";
import { Icon } from "@/components/ui";
import { Secoes } from "@/components/app/Secoes";
import { ContasView } from "@/components/contas/ContasView";
import { ConectarBanco } from "@/components/contas/ConectarBanco";
import { UploadView } from "@/components/upload/UploadView";
import { UploadWizard } from "@/components/upload/UploadWizard";
import { FilaRevisaoView } from "@/components/revisao/FilaRevisaoView";

export function IngestaoView() {
  return (
    <div className="flex flex-col gap-5 pb-4">
      <Secoes
        secoes={[
          { id: "enviar", titulo: "Enviar extrato", desc: "Extratos (CSV/OFX/PDF) e documentos (OCR)", conteudo: <UploadView /> },
          {
            id: "conectar", titulo: "Conectar banco", desc: "Open Finance — bancos e posição por conta",
            conteudo: (
              <>
                <div className="flex justify-end"><ConectarBanco /></div>
                <ContasView />
              </>
            ),
          },
          // ⚠️ A fila do que o sistema NÃO classifica sozinho: conferência do
          // dado que ENTROU, a mesma esteira. Por último porque é exceção.
          { id: "revisao", titulo: "Revisão", desc: "O que discorda entre si e precisa de uma pessoa", conteudo: <FilaRevisaoView /> },
        ]}
      />

      {/* Botão fixo "Upload de dados" — o mesmo que existia na Home, agora na
          casa dele. Não navega: dispara `a4p:open-upload` e o wizard de 3
          etapas (documento avulso → leitura por OCR → confirmação) abre por
          cima da esteira, valendo para qualquer seção. */}
      <button
        onClick={() => window.dispatchEvent(new Event("a4p:open-upload"))}
        aria-label="Enviar documento para a entrada de dados"
        className="fixed bottom-[148px] right-6 z-[60] inline-flex items-center gap-2 rounded-pill bg-white text-ink px-4 py-3 hover:bg-surface-2 transition"
      >
        <Icon name="upload" size={18} color="var(--color-ink)" />
        <span className="text-[15px] font-medium">Enviar dados</span>
      </button>

      {/* O wizard vivia montado só na Home (OverviewGrid); sem isto o evento
          disparado aqui não teria ouvinte. */}
      <UploadWizard />
    </div>
  );
}
