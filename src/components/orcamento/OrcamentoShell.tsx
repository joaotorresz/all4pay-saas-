"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { OrcamentoVarianciaView } from "./OrcamentoView";
import { OrcamentosView } from "@/components/registros/OrcamentosView";

/**
 * Hub de Orçamento — duas perguntas, um destino de menu:
 *  • "Planejado × Realizado" — o que eu orcei e o que de fato aconteceu (passado);
 *  • "Posso comprar?"        — se eu assumir este compromisso, o que acontece
 *                              com o meu caixa daqui pra frente (futuro).
 * Só a aba ativa renderiza → só ela consome dados.
 */
// "Posso comprar?" foi para Inteligência › Simuladores (19/10/2026); o
// cadastro dos orçamentos veio para cá — o previsto e o confronto com o real
// moravam em duas telas.
type Aba = "orcamentos" | "variancia";
const ABAS: { id: Aba; label: string }[] = [
  { id: "orcamentos", label: "Orçamentos" },
  { id: "variancia", label: "Planejado × Realizado" },
];

export function OrcamentoShell() {
  const sp = useSearchParams();
  const [aba, setAba] = React.useState<Aba>("orcamentos");

  // Deep-link reativo (/orcamento?aba=simulador) — a IA e a busca linkam direto.
  React.useEffect(() => {
    const p = sp.get("aba") as Aba | null;
    if (p && ABAS.some((a) => a.id === p)) setAba(p);
  }, [sp]);

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

      {aba === "orcamentos" && <OrcamentosView />}
      {aba === "variancia" && <OrcamentoVarianciaView />}
    </div>
  );
}
