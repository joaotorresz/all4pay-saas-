"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

/**
 * Hub com abas — o padrão de consolidação da navegação.
 *
 * O sistema cresceu para ~40 entradas de menu, muitas delas telas irmãs que o
 * usuário abre em sequência (Razão → Fechamento → Relatórios). Em vez de N
 * destinos, um destino com N abas: menos menu, mesma profundidade, nada
 * removido. As rotas antigas continuam existindo e redirecionam para
 * `/hub?aba=…`, então todo link/atalho/favorito antigo segue funcionando.
 *
 * Só a aba ATIVA é montada → só ela consome dados (as telas são pesadas).
 * As telas entram inteiras, com o `AppShell` delas: o AppShell detecta o
 * aninhamento e vira passthrough (ver `AppShell.tsx`).
 */
export interface AbaHub {
  id: string;
  label: string;
  /** Função (não elemento) para a aba inativa nem ser construída. */
  render: () => React.ReactNode;
}

export function HubShell({ abas, padrao }: { abas: AbaHub[]; padrao?: string }) {
  const sp = useSearchParams();
  const [aba, setAba] = React.useState(padrao ?? abas[0]?.id);

  // Deep-link reativo (?aba=…) — o menu, a busca e a IA linkam direto na aba.
  React.useEffect(() => {
    const p = sp.get("aba");
    if (p && abas.some((a) => a.id === p)) setAba(p);
  }, [sp, abas]);

  const ativa = abas.find((a) => a.id === aba) ?? abas[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 border-b border-border-soft -mt-1 overflow-x-auto">
        {abas.map((a) => {
          const on = ativa?.id === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              aria-current={on ? "page" : undefined}
              className={`relative px-3 py-2 text-label whitespace-nowrap transition-colors ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
            >
              {a.label}
              {on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
            </button>
          );
        })}
      </div>
      {ativa?.render()}
    </div>
  );
}
