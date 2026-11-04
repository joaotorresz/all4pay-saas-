"use client";

/**
 * A LISTA DAS ELIMINAÇÕES INTERCOMPANY — quem com quem, quanto, em que
 * competência. Compartilhada entre o Consolidado e a DRE multiempresas: as
 * duas telas eliminam pelo MESMO motor, e a lista que explica a diferença tem
 * de ser a mesma nas duas.
 */
import * as React from "react";
import { BRL, Tabela, type ColunaTabela } from "@/components/ui";
import { dataBR } from "@/lib/format";
import type { Eliminacao } from "@/core/relatorios";

const COLUNAS: ColunaTabela<Eliminacao>[] = [
  { chave: "entre", rotulo: "Entre", principal: true, render: (e) => e.entre },
  { chave: "competencia", rotulo: "Competência", render: (e) => <span className="text-caption text-muted tabular-nums">{dataBR(e.competencia)}</span> },
  { chave: "valor", rotulo: "Valor eliminado", alinhar: "direita", render: (e) => <BRL value={e.valor} /> },
];

export function ListaEliminacoes({ eliminacoes }: { eliminacoes: Eliminacao[] }) {
  const total = Math.round(eliminacoes.reduce((s, e) => s + e.valor, 0) * 100) / 100;
  const pares = `${eliminacoes.length} ${eliminacoes.length === 1 ? "par eliminado" : "pares eliminados"}`;
  return (
    <div className="flex flex-col gap-2" data-eliminacoes>
      <Tabela
        linhas={eliminacoes}
        colunas={COLUNAS}
        chave={(e) => `${e.entrada}|${e.saida}`}
        emCartao={false}
        rotulo="Eliminações intercompany"
        vazio={<p className="m-0 text-caption text-muted">Nenhuma operação entre as empresas do grupo no período.</p>}
        rodape={
          <tr className="border-t border-border">
            <td className="px-4 py-3 text-label font-medium text-ink" colSpan={2}>{pares}</td>
            <td className="px-4 py-3 text-right text-label font-medium text-ink tabular-nums"><BRL value={total} /></td>
          </tr>
        }
      />
      {eliminacoes.length > 0 && (
        <p className="sm:hidden m-0 flex justify-between text-label font-medium text-ink">
          <span>{pares}</span><span className="tabular-nums"><BRL value={total} /></span>
        </p>
      )}
    </div>
  );
}
