"use client";

/**
 * O MOVIMENTO DA CONVERSA com a Quattro AI — uma peça só para toda tela em que
 * a IA conversa (abertura de conta, chat em tela cheia, ajuste da Home,
 * automações pela conversa e Central de Ajuda).
 *
 *  · `DigitandoIA` — enquanto a IA pensa: a marca respira, três pontos pulam e
 *    o rótulo ("Pensando") tem um brilho que passa por ele.
 *  · `TextoRevelado` — quando a resposta chega, as palavras surgem uma depois
 *    da outra, saindo do desfoque, como nas IAs que escrevem ao vivo.
 *
 * ⚠️ Só a resposta que ACABOU de chegar se revela: uma conversa reaberta do
 * histórico aparece inteira de uma vez (`animar` falso), senão a pessoa
 * esperaria o texto antigo "ser escrito" de novo. E tudo para em
 * `prefers-reduced-motion` (regras em `globals.css`).
 */

import * as React from "react";
import { MarcaIA } from "./marca";
import { MARCA_IA } from "@/core/marca";

/** Intervalo entre uma palavra e a seguinte. */
const PASSO_MS = 28;
/** Teto do atraso: um texto longo não pode levar mais que isso para terminar de surgir. */
const TETO_MS = 1400;
/** Duração da animação de cada palavra (a mesma do `.a4p-palavra`). */
const PALAVRA_MS = 460;

/** Quanto tempo o texto leva para terminar de surgir (para encadear o que vem depois). */
export function duracaoRevelar(texto: string): number {
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  return Math.min(palavras * PASSO_MS, TETO_MS) + PALAVRA_MS;
}

export function TextoRevelado({
  texto, animar = true, atrasoMs = 0,
}: {
  texto: string;
  /** Falso = texto que já existia (histórico): aparece inteiro, sem animação. */
  animar?: boolean;
  /** Começa depois deste atraso (ex.: o texto que segue outro bloco). */
  atrasoMs?: number;
}) {
  if (!animar) return <>{texto}</>;
  const pedacos = texto.split(/(\s+)/);
  let n = 0;
  return (
    <>
      {pedacos.map((p, i) => {
        if (!p || /^\s+$/.test(p)) return p;
        const atraso = atrasoMs + Math.min(n++ * PASSO_MS, TETO_MS);
        return (
          <span key={i} className="a4p-palavra" style={{ "--a4p-atraso": `${atraso}ms` } as React.CSSProperties}>
            {p}
          </span>
        );
      })}
    </>
  );
}

export function DigitandoIA({ rotulo = "Pensando", className = "" }: { rotulo?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-label={`${MARCA_IA}: ${rotulo}…`}
      data-ia="digitando"
      className={`a4p-entra inline-flex w-fit items-center gap-3 py-1 ${className}`}
    >
      <span className="a4p-ia-respira inline-flex">
        <MarcaIA size={24} radius={8} />
      </span>
      <span className="a4p-digitando inline-flex items-center gap-[5px]" aria-hidden>
        <span className="block w-[6px] h-[6px] rounded-pill bg-muted" />
        <span className="block w-[6px] h-[6px] rounded-pill bg-muted" />
        <span className="block w-[6px] h-[6px] rounded-pill bg-muted" />
      </span>
      <span className="a4p-brilho-texto text-[14px]" aria-hidden>{rotulo}</span>
    </div>
  );
}
