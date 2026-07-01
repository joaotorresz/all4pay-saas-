"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArquiteturaView } from "@/components/arquitetura/ArquiteturaView";
import { InfraestruturaView } from "@/components/infraestrutura/InfraestruturaView";
import { OrquestracaoView } from "@/components/orquestracao/OrquestracaoView";

/**
 * Hub de Plataforma — um destino, não três. Arquitetura institucional,
 * Infraestrutura (ledger core) e Orquestração (event-driven) viram ABAS de
 * /plataforma em vez de três entradas de menu. Só a aba ativa renderiza.
 */
type Aba = "arquitetura" | "infraestrutura" | "orquestracao";
const ABAS: { id: Aba; label: string }[] = [
  { id: "arquitetura", label: "Arquitetura" },
  { id: "infraestrutura", label: "Infraestrutura" },
  { id: "orquestracao", label: "Orquestração" },
];

export function PlataformaShell() {
  const sp = useSearchParams();
  const [aba, setAba] = React.useState<Aba>("arquitetura");

  // Deep-link reativo (/plataforma?aba=…) — troca a aba ao navegar pela Sidebar
  // ou pelos redirects das rotas antigas (/orquestracao, /infraestrutura, …).
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

      {aba === "arquitetura" && <ArquiteturaView />}
      {aba === "infraestrutura" && <InfraestruturaView />}
      {aba === "orquestracao" && <OrquestracaoView />}
    </div>
  );
}
