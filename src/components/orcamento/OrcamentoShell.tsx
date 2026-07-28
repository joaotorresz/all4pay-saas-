"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { OrcamentoVarianciaView } from "./OrcamentoView";
import { SimuladorView } from "./SimuladorView";

/**
 * Hub de Orçamento — duas perguntas, um destino de menu:
 *  • "Planejado × Realizado" — o que eu orcei e o que de fato aconteceu (passado);
 *  • "Posso comprar?"        — se eu assumir este compromisso, o que acontece
 *                              com o meu caixa daqui pra frente (futuro).
 * Só a aba ativa renderiza → só ela consome dados.
 */
type Aba = "variancia" | "simulador";
const ABAS: { id: Aba; label: string }[] = [
  { id: "variancia", label: "Planejado × Realizado" },
  { id: "simulador", label: "Posso comprar?" },
];

export function OrcamentoShell() {
  const sp = useSearchParams();
  const [aba, setAba] = React.useState<Aba>("variancia");

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

      {aba === "variancia" && <OrcamentoVarianciaView />}
      {aba === "simulador" && <SimuladorView />}
    </div>
  );
}
