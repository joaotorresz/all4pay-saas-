"use client";

import * as React from "react";
import { CopilotoView } from "@/components/copiloto/CopilotoView";
import { QuantView } from "@/components/quant/QuantView";
import { DecisaoView } from "@/components/decisao/DecisaoView";
import { RiscoView } from "@/components/risco/RiscoView";
import { AutonomoView } from "@/components/autonomo/AutonomoView";
import { DadosView } from "@/components/dados/DadosView";

/**
 * Centro de Inteligência — um cérebro, não cinco. Onda 3.2: Quant/Decisão/Risco/
 * Autônomo/Dados viram ABAS dentro do Copiloto (em vez de 5 destinos de menu).
 * Só a aba ativa renderiza → só ela consome dados.
 */
type Aba = "copiloto" | "quant" | "decisao" | "risco" | "autonomo" | "dados";
const ABAS: { id: Aba; label: string }[] = [
  { id: "copiloto", label: "Copiloto" },
  { id: "quant", label: "Quant" },
  { id: "decisao", label: "Decisão" },
  { id: "risco", label: "Risco" },
  { id: "autonomo", label: "Autônomo" },
  { id: "dados", label: "Dados" },
];

export function InteligenciaShell() {
  const [aba, setAba] = React.useState<Aba>("copiloto");

  // Deep-link opcional: /copiloto?aba=quant
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("aba") as Aba | null;
    if (p && ABAS.some((a) => a.id === p)) setAba(p);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 border-b border-border-soft -mt-1">
        {ABAS.map((a) => {
          const on = aba === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              aria-current={on ? "page" : undefined}
              className={`relative px-3 py-2 text-label transition-colors ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
            >
              {a.label}
              {on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
            </button>
          );
        })}
      </div>

      {aba === "copiloto" && <CopilotoView />}
      {aba === "quant" && <QuantView />}
      {aba === "decisao" && <DecisaoView />}
      {aba === "risco" && <RiscoView />}
      {aba === "autonomo" && <AutonomoView />}
      {aba === "dados" && <DadosView />}
    </div>
  );
}
