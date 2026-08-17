"use client";

/**
 * Entrada de dados — a esteira ÚNICA de ingestão (GAP #5). Unifica as três
 * formas de trazer dinheiro-dado para o sistema em abas de um só fluxo:
 *   1. Conectar  → Open Finance (bancos) + posição consolidada por conta;
 *   2. Enviar    → upload de extratos (CSV/OFX) e documentos (OCR) via FDIP;
 *   3. Conciliar → casa o que entrou com os títulos previstos (baixa única).
 * Deep-link por `?aba=`; `/contas` e `/conciliacao` redirecionam para as abas.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { ContasView } from "@/components/contas/ContasView";
import { ConectarBanco } from "@/components/contas/ConectarBanco";
import { UploadView } from "@/components/upload/UploadView";
import { UploadWizard } from "@/components/upload/UploadWizard";
import { ConciliacaoView } from "@/components/conciliacao/ConciliacaoView";
import { RegrasView } from "./RegrasView";
import { LimpezaDuplicatas } from "@/components/upload/LimpezaDuplicatas";
import { FilaRevisaoView } from "@/components/revisao/FilaRevisaoView";

type Aba = "conectar" | "enviar" | "conciliar" | "regras" | "limpeza" | "revisao";
const ABAS: { id: Aba; label: string; icon: string; desc: string }[] = [
  { id: "conectar", label: "Conectar", icon: "building", desc: "Open Finance — bancos e posição por conta" },
  { id: "enviar", label: "Enviar", icon: "upload", desc: "Extratos (CSV/OFX) e documentos (OCR)" },
  { id: "conciliar", label: "Conciliar", icon: "list-checks", desc: "Casar o que entrou com os títulos previstos" },
  { id: "regras", label: "Regras", icon: "workflow", desc: "Categorização automática — escreva uma vez, vale sempre" },
  // A idempotência resolve daqui para a frente; esta aba resolve o passado —
  // as cópias que entraram antes de a chave existir.
  { id: "limpeza", label: "Duplicatas", icon: "scan-line", desc: "Encontra e remove as cópias já gravadas na base" },
  // ⚠️ A fila do que o sistema NÃO classifica sozinho. Mora aqui, e não numa
  // entrada de menu própria, porque é conferência do dado que ENTROU — a mesma
  // esteira. E a aba fica por último de propósito: ela é exceção, não o fluxo.
  { id: "revisao", label: "Revisão", icon: "list-checks", desc: "O que discorda entre si e precisa de uma pessoa" },
];
const isAba = (s: string | null): s is Aba =>
  s === "conectar" || s === "enviar" || s === "conciliar" || s === "regras" || s === "limpeza"
  || s === "revisao";

export function IngestaoView() {
  const router = useRouter();
  const [aba, setAba] = React.useState<Aba>("enviar");

  React.useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("aba");
    if (isAba(a)) setAba(a);
  }, []);

  const trocar = (id: Aba) => {
    setAba(id);
    router.replace(`/upload?aba=${id}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Abas da esteira */}
      <div className="flex items-center gap-1 flex-wrap">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => trocar(a.id)}
            className={`inline-flex items-center gap-2 text-label font-medium rounded-pill px-4 py-2 ${aba === a.id ? "bg-surface-3 text-ink font-semibold" : "bg-surface-2 text-muted hover:text-ink"}`}
            title={a.desc}
          >
            <Icon name={a.icon} size={15} color={aba === a.id ? "var(--color-white)" : "var(--color-text-secondary)"} />
            {a.label}
          </button>
        ))}
        <span className="text-caption text-faint ml-auto hidden sm:block">{ABAS.find((a) => a.id === aba)?.desc}</span>
      </div>

      {aba === "conectar" && (
        <>
          <div className="flex justify-end"><ConectarBanco /></div>
          <ContasView />
        </>
      )}
      {aba === "enviar" && <UploadView />}
      {aba === "conciliar" && <ConciliacaoView />}
      {aba === "regras" && <RegrasView />}
      {aba === "limpeza" && <LimpezaDuplicatas />}
      {aba === "revisao" && <FilaRevisaoView />}

      {/* Botão fixo "Upload de dados" — o mesmo que existia na Home, agora na
          casa dele. Não navega: dispara `a4p:open-upload` e o wizard de 3
          etapas (documento avulso → leitura por OCR → confirmação) abre por
          cima da esteira, valendo para qualquer aba. */}
      <button
        onClick={() => window.dispatchEvent(new Event("a4p:open-upload"))}
        aria-label="Enviar documento para upload de dados"
        className="fixed bottom-[148px] right-6 z-[60] inline-flex items-center gap-2 rounded-pill bg-white text-ink px-4 py-3 hover:bg-surface-2 transition"
      >
        <Icon name="upload" size={18} color="var(--color-ink)" />
        <span className="text-[15px] font-medium">Upload de dados</span>
      </button>

      {/* O wizard vivia montado só na Home (OverviewGrid); sem isto o evento
          disparado aqui não teria ouvinte. */}
      <UploadWizard />
    </div>
  );
}
