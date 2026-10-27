"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

/**
 * Seções EMPILHADAS — o que substitui as abas internas (27/10/2026, decisão do
 * dono: "acabar com páginas que dentro de uma página têm duas páginas").
 *
 * ⚠️ Aba esconde. Quem abria "Contas recorrentes" não via que os contratos de
 * fornecedor estavam um clique à direita, e o conteúdo da segunda aba era,
 * para metade das pessoas, conteúdo que não existia. Aqui tudo é a mesma
 * página, uma seção embaixo da outra, cada uma com o seu título.
 *
 * Os links antigos (`?aba=…`, `?painel=…`) continuam valendo: em vez de
 * escolher uma aba, eles ROLAM até a seção com aquele id.
 */
export interface Secao {
  id: string;
  titulo: string;
  /** Uma linha dizendo o que a seção responde. */
  desc?: string;
  conteudo: React.ReactNode;
}

export function Secoes({ secoes, param = "aba" }: { secoes: Secao[]; param?: string }) {
  const sp = useSearchParams();
  const alvo = sp.get(param);

  React.useEffect(() => {
    if (!alvo || !secoes.some((s) => s.id === alvo)) return;
    // Um quadro depois da montagem: antes disso a seção ainda não tem altura.
    const r = requestAnimationFrame(() => {
      document.getElementById(`secao-${alvo}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(r);
  }, [alvo, secoes]);

  return (
    <div className="flex flex-col gap-12">
      {secoes.map((s, i) => (
        <section
          key={s.id}
          id={`secao-${s.id}`}
          aria-labelledby={`secao-${s.id}-titulo`}
          className="a4p-entra flex flex-col gap-5 scroll-mt-6"
          style={{ ["--a4p-atraso" as string]: `${i * 60}ms` }}
        >
          <header className="flex flex-col gap-1">
            <h2 id={`secao-${s.id}-titulo`} className="text-h2">{s.titulo}</h2>
            {s.desc && <p className="text-caption text-muted">{s.desc}</p>}
          </header>
          {s.conteudo}
        </section>
      ))}
    </div>
  );
}
