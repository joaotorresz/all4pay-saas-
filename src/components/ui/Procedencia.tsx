"use client";

/**
 * A MARCA DO QUE NÃO É FATO — e a origem do número a um toque.
 *
 * ⚠️ Um saldo de extrato e uma projeção de caixa saíam da tela com exatamente a
 * mesma cara: mesmo tamanho, mesma cor, mesmo prefixo de moeda. Quem lê não tem
 * como saber que o segundo depende de todo mundo pagar em dia — e é o segundo
 * que costuma virar decisão ("dá para contratar"), porque é maior.
 *
 * A regra do sistema, agora tipada em `Procedencia.natureza`:
 *
 *  - **fato** — não recebe marca. Marcar tudo é não marcar nada: se toda linha
 *    tem selo, o selo deixa de ser lido, e aí a projeção volta a passar
 *    despercebida no meio do ruído que a própria marcação criou.
 *  - **estimativa** — texto discreto: o número foi MEDIDO, mas por média ou
 *    proxy.
 *  - **projeção** — marca visível: o número fala do futuro.
 *
 * A cor é `warning`, nunca `negative`: projeção não é erro nem má notícia. O
 * vermelho aqui diria que tem algo errado com o número, quando o que há é uma
 * natureza diferente.
 */
import * as React from "react";
import type { Procedencia as ProcedenciaDados } from "@/core/indicadores";
import { InfoHint } from "./InfoHint";
import { cn } from "@/lib/utils";

const ROTULO = { fato: "", estimativa: "estimativa", projecao: "projeção" } as const;

const EXPLICACAO = {
  fato: "Soma de lançamentos que já aconteceram.",
  estimativa: "Medido por média ou por semelhança, não contado um a um — o número muda conforme a base muda.",
  projecao: "Conta sobre o futuro: depende de os títulos previstos serem pagos nas datas previstas.",
} as const;

/** O selo. Some no fato, por decisão — ver o cabeçalho. */
export function MarcaProcedencia({
  procedencia, className,
}: { procedencia: ProcedenciaDados; className?: string }) {
  const { natureza } = procedencia;
  if (natureza === "fato") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[3px] text-[11px] uppercase tracking-[0.07em] align-middle",
        className,
      )}
      style={{ color: "var(--color-warning)" }}
      title={EXPLICACAO[natureza]}
    >
      <span aria-hidden className="inline-block w-[5px] h-[5px] rounded-pill" style={{ background: "currentColor" }} />
      {ROTULO[natureza]}
    </span>
  );
}

/**
 * O "i" do indicador, montado a partir da própria procedência.
 *
 * ⚠️ O texto NÃO é escrito à mão na tela: ele é gerado do que o motor devolveu.
 * Microtexto escrito à mão envelhece na primeira mudança de fórmula, e aí a
 * explicação passa a descrever um cálculo que não existe mais — que é pior que
 * não explicar, porque agora está errado com autoridade.
 */
export function InfoProcedencia({
  titulo, procedencia, align = "right",
}: { titulo: string; procedencia: ProcedenciaDados; align?: "left" | "right" }) {
  return (
    <InfoHint
      align={align}
      titulo={titulo}
      oQue={`${EXPLICACAO[procedencia.natureza]} ${textoDeOrigem(procedencia)}`}
      comoCalcula={procedencia.formula}
    />
  );
}

/**
 * "De onde vem e de que período" — a frase que a ONDA 11 exige em todo
 * indicador não óbvio, montada do que o motor já sabe.
 */
export function textoDeOrigem(p: ProcedenciaDados): string {
  const regime =
    p.regime === "posicao" ? "posição das contas"
      : p.regime === "caixa" ? "regime de caixa (data de pagamento)"
      : "regime de competência (data de vencimento)";
  const janela = p.janela.vazia ? "período inválido" : p.janela.label;
  const base = p.regime === "posicao"
    ? `${p.lancamentos} lançamentos considerados`
    : `${p.lancamentos} lançamento${p.lancamentos === 1 ? "" : "s"}`;
  return `Período: ${janela} · ${regime} · ${base}.`;
}

/**
 * A linha de rodapé de um box: período e origem, sempre visíveis.
 *
 * ⚠️ Fica no rodapé e não dentro do "i" quando o número é projeção: o que
 * depende de um clique não conta como declarado para quem só olhou.
 */
export function LinhaProcedencia({
  procedencia, className,
}: { procedencia: ProcedenciaDados; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-caption text-faint", className)}>
      <MarcaProcedencia procedencia={procedencia} />
      <span>{textoDeOrigem(procedencia)}</span>
      {procedencia.aviso && (
        <span style={{ color: "var(--color-warning)" }}>{procedencia.aviso}</span>
      )}
    </span>
  );
}
