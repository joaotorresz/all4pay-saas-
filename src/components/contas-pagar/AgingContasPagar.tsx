"use client";

/**
 * AGING DE CONTAS A PAGAR — a carteira inteira em aberto, por idade, por
 * fornecedor e por categoria.
 *
 * ⚠️ A tela não soma nada: tudo sai de `montarAgingContasPagar`
 * (`core/contas-pagar/aging`). E ela diz "carteira inteira" ao lado do título,
 * porque os cards acima são do PERÍODO — sem o rótulo, o vencido daqui e o
 * card "Contas atrasadas" pareceriam discordar (POSIÇÃO × FLUXO).
 */
import * as React from "react";
import type { RiskInput } from "@/core/risk-engine/types";
import { Card, BRL } from "@/components/ui";
import {
  montarAgingContasPagar, ORDEM_VENCIDO, ORDEM_A_VENCER, ROTULO_FAIXA_AGING,
  type Dimensao, type FaixaAging,
} from "@/core/contas-pagar/aging";
import { FaixasDeIdade } from "@/components/titulos/kit";

const PESO_VENCIDO: Record<string, number> = { ate_30: 0, de_31_a_60: 1, de_61_a_90: 2, acima_90: 3 };
const PESO_A_VENCER: Record<string, number> = { ate_7: 3, de_8_a_15: 2, de_16_a_30: 1, acima_30: 0 };

const CURTO: Record<FaixaAging, string> = {
  acima_90: "+90", de_61_a_90: "61–90", de_31_a_60: "31–60", ate_30: "1–30",
  ate_7: "até 7", de_8_a_15: "8–15", de_16_a_30: "16–30", acima_30: "+30",
};

export function AgingContasPagar({ input }: { input: RiskInput }) {
  const aging = React.useMemo(() => montarAgingContasPagar(input), [input]);
  const [dim, setDim] = React.useState<Dimensao>("fornecedor");
  const { totais } = aging;
  const linhas = dim === "fornecedor" ? aging.porFornecedor : aging.porCategoria;
  const fracao = (v: number, base: number) => (base > 0 ? v / base : 0);

  return (
    <Card
      className="flex flex-col gap-4"
      data-aging="pagar"
      info={{
        titulo: "Aging de contas a pagar",
        oQue: "De tudo que a empresa deve e ainda não pagou: quanto já venceu, há quanto tempo, e quanto vence nas próximas semanas — por fornecedor e por categoria.",
        comoCalcula:
          "Cada título em aberto entra numa faixa pelos dias entre o vencimento e hoje: vencidos em 1–30, 31–60, 61–90 e mais de 90 dias; a vencer em até 7, 8–15, 16–30 e mais de 30 dias. O que vence hoje conta como a vencer. É a carteira inteira, sem recorte de período.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8">
        <span className="text-h3 text-ink">Aging de contas a pagar</span>
        <span className="text-caption text-faint">carteira inteira</span>
      </div>

      {totais.quantidade === 0 ? (
        <p className="m-0 py-10 text-center text-body text-muted">Nenhuma conta a pagar em aberto.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-caption text-muted inline-flex items-center gap-2">
                  {/* ⚠️ O alerta é um PONTO ao lado do rótulo; o número fica em tinta. */}
                  {totais.vencido > 0 && <span className="inline-block w-2 h-2 rounded-pill bg-warning" aria-hidden />}
                  Vencido e não pago
                </span>
                <span className="a4p-num text-[24px] leading-none text-ink" data-aging-total="vencido"><BRL value={totais.vencido} /></span>
              </div>
              <FaixasDeIdade
                cor="var(--color-negative)"
                faixas={ORDEM_VENCIDO.map((f) => ({
                  chave: f, rotulo: ROTULO_FAIXA_AGING[f], valor: totais.faixas[f], quantidade: totais.quantidades[f],
                  fracao: fracao(totais.faixas[f], totais.vencido), peso: PESO_VENCIDO[f],
                }))}
              />
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-caption text-muted">A vencer</span>
                <span className="a4p-num text-[24px] leading-none text-ink" data-aging-total="a-vencer"><BRL value={totais.aVencer} /></span>
              </div>
              <FaixasDeIdade
                cor="var(--color-ink)"
                faixas={ORDEM_A_VENCER.map((f) => ({
                  chave: f, rotulo: ROTULO_FAIXA_AGING[f], valor: totais.faixas[f], quantidade: totais.quantidades[f],
                  fracao: fracao(totais.faixas[f], totais.aVencer), peso: PESO_A_VENCER[f],
                }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-1" role="group" aria-label="Agrupar o aging por">
            {(["fornecedor", "categoria"] as Dimensao[]).map((d) => (
              <button key={d} type="button" aria-pressed={dim === d} onClick={() => setDim(d)}
                className={`text-caption font-medium rounded-pill px-3 py-1 ${dim === d ? "bg-surface-3 text-ink" : "bg-surface-2 text-muted hover:text-ink"}`}>
                Por {d}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto" role="region" aria-label={`Aging por ${dim}`} tabIndex={0}>
            <table className="w-full text-caption tabular-nums">
              <thead>
                <tr className="text-faint">
                  <th className="text-left font-medium py-2 pr-3 uppercase tracking-[0.08em] text-[11px]">{dim === "fornecedor" ? "Fornecedor" : "Categoria"}</th>
                  <th colSpan={4} className="text-center font-medium py-2 uppercase tracking-[0.08em] text-[11px]">Vencido há (dias)</th>
                  <th colSpan={4} className="text-center font-medium py-2 uppercase tracking-[0.08em] text-[11px]">Vence em (dias)</th>
                  <th className="text-right font-medium py-2 pl-3 uppercase tracking-[0.08em] text-[11px]">Total</th>
                </tr>
                <tr className="text-faint">
                  <th />
                  {[...ORDEM_VENCIDO, ...ORDEM_A_VENCER].map((f) => (
                    <th key={f} className="text-right font-medium py-1 px-2 text-[11px]">{CURTO[f]}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.nome} className="border-t border-border-soft" data-aging-linha={l.nome}>
                    <td className="py-2 pr-3 text-label text-ink max-w-[220px] truncate">
                      <span className="inline-flex items-center gap-2">
                        {l.vencido > 0 && <span className="inline-block w-2 h-2 rounded-pill bg-warning shrink-0" aria-label="tem valor vencido" />}
                        {l.nome}
                      </span>
                    </td>
                    {[...ORDEM_VENCIDO, ...ORDEM_A_VENCER].map((f) => (
                      <td key={f} className="text-right py-2 px-2 text-ink a4p-num">
                        {l.faixas[f] > 0 ? <BRL value={l.faixas[f]} /> : <span className="text-faint">—</span>}
                      </td>
                    ))}
                    <td className="text-right py-2 pl-3 text-ink a4p-num font-medium"><BRL value={l.total} /></td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="py-2 pr-3 text-label text-ink font-medium">Total ({totais.quantidade} títulos)</td>
                  {[...ORDEM_VENCIDO, ...ORDEM_A_VENCER].map((f) => (
                    <td key={f} className="text-right py-2 px-2 text-ink a4p-num font-medium"><BRL value={totais.faixas[f]} /></td>
                  ))}
                  <td className="text-right py-2 pl-3 text-ink a4p-num font-medium" data-aging-total="carteira"><BRL value={totais.total} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
