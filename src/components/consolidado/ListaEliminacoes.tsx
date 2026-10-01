"use client";

/**
 * A LISTA DAS ELIMINAÇÕES INTERCOMPANY — quem com quem, quanto, em que
 * competência. Compartilhada entre o Consolidado e a DRE multiempresas: as
 * duas telas eliminam pelo MESMO motor, e a lista que explica a diferença tem
 * de ser a mesma nas duas.
 */
import * as React from "react";
import { BRL } from "@/components/ui";
import { dataBR } from "@/lib/format";
import { CRITERIO_ELIMINACAO } from "@/core/relatorios/posicao-consolidada";
import type { Eliminacao } from "@/core/relatorios";

export function ListaEliminacoes({ eliminacoes }: { eliminacoes: Eliminacao[] }) {
  const total = Math.round(eliminacoes.reduce((s, e) => s + e.valor, 0) * 100) / 100;
  return (
    <div className="flex flex-col gap-2" data-eliminacoes>
      <p className="m-0 text-caption text-muted max-w-[80ch]">
        <b className="text-ink">Critério conservador.</b> {CRITERIO_ELIMINACAO}
      </p>
      {eliminacoes.length === 0 ? (
        <p className="m-0 text-caption text-muted">
          Nenhuma operação entre as empresas do grupo foi reconhecida no período — nada foi eliminado, e o consolidado é a soma das partes.
        </p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Eliminações intercompany">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-soft text-[11px] font-medium tracking-[0.08em] text-faint">
                <th className="text-left px-3 py-2">Entre</th>
                <th className="text-left px-3 py-2">Competência</th>
                <th className="text-right px-3 py-2">Valor eliminado</th>
              </tr>
            </thead>
            <tbody>
              {eliminacoes.map((e) => (
                <tr key={`${e.entrada}|${e.saida}`} className="border-b border-border-soft last:border-0">
                  <td className="px-3 py-2 text-label text-ink">{e.entre}</td>
                  <td className="px-3 py-2 text-caption text-muted tabular-nums">{dataBR(e.competencia)}</td>
                  <td className="px-3 py-2 text-right text-label text-ink tabular-nums"><BRL value={e.valor} /></td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="px-3 py-2 text-label font-medium text-ink" colSpan={2}>
                  {eliminacoes.length} {eliminacoes.length === 1 ? "par eliminado" : "pares eliminados"} — sai da receita de uma empresa e da despesa da outra
                </td>
                <td className="px-3 py-2 text-right text-label font-medium text-ink tabular-nums"><BRL value={total} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
