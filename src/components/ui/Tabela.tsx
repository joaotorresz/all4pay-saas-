"use client";

/**
 * TABELA — a peça única de lista em linhas do design system (Fase 3.2 do
 * plano, 03/11/2026).
 *
 * No computador é uma tabela; no celular (abaixo de 640px) cada linha vira um
 * CARTÃO: a coluna `principal` em cima, as outras como "rótulo · valor"
 * embaixo, e as ações no pé. A tabela larga com rolagem lateral no telefone
 * escondia exatamente as colunas que respondiam a pergunta (valor, situação).
 *
 * As regras do DS de 27/10 moram aqui, uma vez:
 *  · cabeçalho em Inter Display 500, 11px, cor `faint`, sem caixa alta;
 *  · fio `border-soft` entre linhas, cartão branco sem borda nem sombra;
 *  · número alinhado à direita com `tabular-nums` (o `MarcaNumeros` põe a
 *    Agrandir);
 *  · linha clicável ganha o hover `surface-2` e o cursor.
 *
 * ⚠️ Uma tela nova NÃO escreve `<table>`: monta as colunas e passa para cá. A
 * guarda `tabela-unica` (npm test) conta as tabelas escritas à mão fora desta
 * peça, com teto que só desce.
 */
import * as React from "react";
import { Card } from "./Card";

export interface ColunaTabela<T> {
  chave: string;
  rotulo: React.ReactNode;
  render: (linha: T) => React.ReactNode;
  alinhar?: "esquerda" | "direita" | "centro";
  /** Classe extra da célula (largura, `whitespace-nowrap`…). */
  classe?: string;
  /** A coluna que dá nome à linha: vira o título do cartão no celular. */
  principal?: boolean;
  /** Some do cartão no celular (o que só faz sentido lado a lado). */
  ocultarNoCelular?: boolean;
  /** Atributos `data-*` da célula (testes e gaveta de origem do número). */
  dados?: (linha: T) => Record<`data-${string}`, string | number | undefined>;
}

export interface TabelaProps<T> {
  linhas: readonly T[];
  colunas: readonly ColunaTabela<T>[];
  chave: (linha: T) => string;
  /** O que aparece quando não há linha. Sem ele, a peça não desenha nada. */
  vazio?: React.ReactNode;
  /** Botões da linha (editar, excluir). Ficam à direita; no cartão, no pé. */
  acoes?: (linha: T) => React.ReactNode;
  onLinha?: (linha: T) => void;
  /** Linha de total (já montada em células), só no computador. */
  rodape?: React.ReactNode;
  /** Rótulo da região rolável, lido pelo leitor de tela. */
  rotulo?: string;
  /** `false` quando a tabela já mora dentro de um cartão. */
  emCartao?: boolean;
  /** Marca para teste e impressão (`data-tabela`). */
  id?: string;
  /** Classe extra de cada linha (destaque, opacidade). */
  classeDaLinha?: (linha: T) => string;
  /**
   * O que abre embaixo da linha (parcelas, histórico). `null` = fechado. No
   * computador ocupa a largura toda; no cartão, entra antes das ações.
   */
  detalhe?: (linha: T) => React.ReactNode | null;
  /** Atributos `data-*` da linha (na `<tr>` e no cartão). */
  dadosDaLinha?: (linha: T) => Record<`data-${string}`, string | number | undefined>;
}

const ALINHAR = { esquerda: "text-left", direita: "text-right", centro: "text-center" } as const;

/**
 * Linha clicável responde ao TECLADO também (ONDA 12): uma linha com `onClick`
 * que não recebe foco nem responde a Enter deixa de fora quem não usa o mouse,
 * e no telefone é o único jeito de abrir a ficha.
 */
function clicavel<T>(onLinha: ((l: T) => void) | undefined, l: T) {
  if (!onLinha) return {};
  return {
    tabIndex: 0,
    onClick: () => onLinha(l),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onLinha(l); }
    },
  };
}

export function Tabela<T>({
  linhas, colunas, chave, vazio, acoes, onLinha, rodape, rotulo = "Tabela", emCartao = true, id, classeDaLinha, detalhe, dadosDaLinha,
}: TabelaProps<T>) {
  if (linhas.length === 0) {
    if (!vazio) return null;
    return emCartao ? <Card>{vazio}</Card> : <>{vazio}</>;
  }
  const principais = colunas.filter((c) => c.principal);
  const titulo = principais.length > 0 ? principais : colunas.slice(0, 1);
  const resto = colunas.filter((c) => !titulo.includes(c) && !c.ocultarNoCelular);

  const tabela = (
    <div className="hidden sm:block overflow-x-auto" tabIndex={0} role="region" aria-label={rotulo}>
      <table data-tabela={id ?? ""} className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-soft">
            {colunas.map((c) => (
              <th key={c.chave} scope="col"
                className={`px-4 py-3 text-[11px] font-medium tracking-[0.08em] text-faint whitespace-nowrap ${ALINHAR[c.alinhar ?? "esquerda"]}`}>
                {c.rotulo}
              </th>
            ))}
            {acoes && <th scope="col" className="px-4 py-3 text-[11px] font-medium tracking-[0.08em] text-faint text-right">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const aberto = detalhe?.(l) ?? null;
            return (
            <React.Fragment key={chave(l)}>
            <tr
              {...dadosDaLinha?.(l)}
              {...clicavel(onLinha, l)}
              className={`border-b border-border-soft last:border-0 transition-colors hover:bg-surface-2/60 ${onLinha ? "cursor-pointer focus-visible:outline-none focus-visible:bg-surface-2/60" : ""} ${classeDaLinha?.(l) ?? ""}`}>
              {colunas.map((c) => (
                <td key={c.chave} {...c.dados?.(l)}
                  className={`px-4 py-3 align-middle text-label text-ink ${ALINHAR[c.alinhar ?? "esquerda"]} ${c.alinhar === "direita" ? "tabular-nums whitespace-nowrap" : ""} ${c.classe ?? ""}`}>
                  {c.render(l)}
                </td>
              ))}
              {acoes && (
                <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">{acoes(l)}</div>
                </td>
              )}
            </tr>
            {aberto != null && (
              <tr className="border-b border-border-soft bg-surface-2/40">
                <td colSpan={colunas.length + (acoes ? 1 : 0)} className="px-4 py-4">{aberto}</td>
              </tr>
            )}
            </React.Fragment>
            );
          })}
        </tbody>
        {rodape && <tfoot>{rodape}</tfoot>}
      </table>
    </div>
  );

  const cartoes = (
    <ul data-tabela-cartoes={id ?? ""} className="sm:hidden m-0 p-0 list-none flex flex-col divide-y divide-border-soft">
      {linhas.map((l) => (
        <li key={chave(l)} {...dadosDaLinha?.(l)}
          {...clicavel(onLinha, l)}
          className={`px-4 py-3 flex flex-col gap-2 ${onLinha ? "cursor-pointer active:bg-surface-2/60" : ""} ${classeDaLinha?.(l) ?? ""}`}>
          <div className="flex flex-col gap-[2px] min-w-0 text-body text-ink">
            {titulo.map((c) => <div key={c.chave} className="min-w-0">{c.render(l)}</div>)}
          </div>
          {resto.length > 0 && (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {resto.map((c) => (
                <React.Fragment key={c.chave}>
                  <dt className="text-caption text-faint">{c.rotulo}</dt>
                  <dd className={`m-0 text-label text-ink min-w-0 text-right ${c.alinhar === "direita" ? "tabular-nums" : ""}`}>{c.render(l)}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
          {detalhe?.(l) != null && <div className="rounded-sm bg-surface-2/40 px-3 py-3">{detalhe(l)}</div>}
          {acoes && (
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>{acoes(l)}</div>
          )}
        </li>
      ))}
    </ul>
  );

  const corpo = <>{tabela}{cartoes}</>;
  return emCartao ? <Card padded={false} className="overflow-hidden">{corpo}</Card> : corpo;
}
