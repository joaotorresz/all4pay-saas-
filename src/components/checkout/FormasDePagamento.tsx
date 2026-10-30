"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * "Selecione a forma de pagamento" — Boleto e Pix lado a lado, como na Asaas
 * (30/10/2026). Só alterna o que JÁ foi desenhado pelo servidor: com uma forma
 * só, a escolha some e ela aparece direto.
 */
export function FormasDePagamento({ boleto, pix }: { boleto?: React.ReactNode; pix?: React.ReactNode }) {
  const formas = [
    ...(boleto ? [{ id: "boleto" as const, rotulo: "Boleto bancário", no: boleto }] : []),
    ...(pix ? [{ id: "pix" as const, rotulo: "Pix", no: pix }] : []),
  ];
  const [ativa, setAtiva] = React.useState(formas[0]?.id);
  if (!formas.length) return null;
  const atual = formas.find((f) => f.id === ativa) ?? formas[0];
  return (
    <section data-card="1" className="rounded-card bg-white p-6 flex flex-col gap-4" aria-label="Forma de pagamento">
      <h2 className="text-h3 text-ink">Selecione a forma de pagamento</h2>
      {formas.length > 1 && (
        <div role="tablist" aria-label="Forma de pagamento" className="flex flex-wrap gap-2">
          {formas.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === atual.id}
              onClick={() => setAtiva(f.id)}
              className={cn(
                "rounded-pill px-4 py-2 text-label font-medium transition-colors",
                f.id === atual.id ? "bg-ink text-white" : "bg-surface-1 text-ink hover:bg-surface-2",
              )}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel">{atual.no}</div>
    </section>
  );
}
