"use client";

import * as React from "react";
import { Icon } from "./Icon";
import { formatBRL } from "@/lib/format";
import type { Cancelados } from "@/core/indicadores";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ **O RODAPÉ DO CANCELADO — o que o relatório deixou de fora, dito**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Excluir o título cancelado do resultado está certo: ele não é receita, não é
 * despesa e não vai ao caixa. O defeito era o SILÊNCIO — um DRE sobre uma base
 * com centenas de cancelados tem a mesma cara de um DRE sobre uma base limpa, e
 * quem confere o faturamento contra o extrato encontra a diferença sem ter por
 * onde começar a explicá-la.
 *
 * ⚠️ **É rodapé, não linha.** Somar o cancelado devolveria ao resultado dinheiro
 * que ninguém deve nem receberá — um defeito bem pior que o silêncio que este
 * aviso conserta. Por isso ele fica FORA da tabela, em texto, com os dois lados
 * separados: entrada e saída cancelada não se somam, e um total único sugeriria
 * que sim.
 *
 * ⚠️ Some quando não há cancelado. Um rodapé permanente de "0 títulos
 * cancelados" é ruído em toda tela, e ruído é o que treina a pessoa a não ler o
 * rodapé no dia em que ele tem algo a dizer.
 */
export function NotaCancelados({ dados, escopo }: { dados: Cancelados; escopo?: string }) {
  if (dados.quantidade === 0) return null;
  const plural = dados.quantidade === 1 ? "título cancelado" : "títulos cancelados";
  return (
    <div
      className="flex items-start gap-2 px-1 pt-1"
      role="note"
      aria-label="Títulos cancelados fora deste relatório"
    >
      <Icon name="triangle-alert" size={14} color="var(--color-warning)" />
      <p className="m-0 text-caption text-muted leading-snug">
        <b className="text-ink tabular-nums">{dados.quantidade}</b> {plural}
        {escopo ? ` ${escopo}` : " com vencimento no período"}, somando{" "}
        <b className="text-ink tabular-nums">{formatBRL(dados.total)}</b>
        {dados.entradas > 0 && dados.saidas > 0 ? (
          <>
            {" "}
            (<span className="tabular-nums">{formatBRL(dados.entradas)}</span> de entrada ·{" "}
            <span className="tabular-nums">{formatBRL(dados.saidas)}</span> de saída)
          </>
        ) : null}
        . Cancelado não é receita nem despesa e não vai ao caixa — por isso ele
        fica fora dos números acima. Está aqui porque a diferença aparece quando
        alguém confere o total contra o extrato.
      </p>
    </div>
  );
}
