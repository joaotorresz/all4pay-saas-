"use client";

/**
 * O ESCOPO DA TELA — a faixa que diz o que esta tela mede e o que a outra mede.
 *
 * ⚠️ Existem duas telas respondendo "quanto tenho a receber", com números que
 * não batem, mesmo título na aba do navegador e nomes quase idênticos no menu.
 * Nenhuma das duas está errada: uma mostra o ESTOQUE de títulos (posição, sem
 * período) e a outra o RESULTADO do período (fluxo, que pode ser negativo).
 *
 * O defeito era a interface não dizer isso. Quem abrisse as duas em sequência
 * não tinha como saber qual era a verdade — e a resposta para "quanto tenho a
 * receber" dependia de qual link tinha sido clicado.
 *
 * Esta faixa mostra a leitura DESTA tela em destaque, a da outra ao lado, e o
 * link para atravessar. Ela não some: um aviso que se fecha é um aviso que a
 * pessoa nunca mais vê justamente quando volta em dúvida.
 */
import * as React from "react";
import Link from "next/link";
import { Icon, BRL, InfoHint } from "@/components/ui";
import { pontePosicaoFluxo, type Janela } from "@/core/indicadores";
import { useRiscoInput } from "@/components/visao-geral/hooks";

export type Leitura = "posicao" | "fluxo";

const OUTRA: Record<Leitura, { rota: string; nome: string }> = {
  // Quem está no estoque atravessa para o extrato, e vice-versa.
  posicao: { rota: "/recebimentos", nome: "Extrato de recebimentos" },
  fluxo: { rota: "/dashboard/financial/accounts-and-transfers?tab=receivables", nome: "Contas a receber (títulos)" },
};

export function EscopoDaTela({
  leitura,
  janela,
  direcao = "entrada",
}: {
  leitura: Leitura;
  janela: Janela;
  direcao?: "entrada" | "saida";
}) {
  const { data: inp } = useRiscoInput();
  const ponte = React.useMemo(
    () => (inp ? pontePosicaoFluxo(inp, janela, direcao) : null),
    [inp, janela, direcao],
  );
  if (!ponte) return null;

  const outra = direcao === "entrada" ? OUTRA[leitura] : null;
  const estaTela =
    leitura === "posicao"
      ? { rotulo: "Estoque de títulos", valor: ponte.posicao.total, detalhe: `${ponte.posicao.titulos} títulos · sem recorte de período` }
      : { rotulo: `Resultado · ${janela.label}`, valor: ponte.fluxo.resultado, detalhe: "entradas − saídas liquidadas na janela" };
  const aOutra =
    leitura === "posicao"
      ? { rotulo: `Resultado · ${janela.label}`, valor: ponte.fluxo.resultado }
      : { rotulo: "Estoque de títulos", valor: ponte.posicao.total };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 rounded-card bg-surface-1 border border-border-soft">
      <div className="flex flex-col">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint inline-flex items-center gap-1">
          Esta tela mostra
          <InfoHint
            align="left"
            titulo="Duas leituras, duas perguntas"
            oQue="Por que esta tela e a outra mostram números diferentes para o mesmo assunto."
            comoCalcula={ponte.explicacao}
          />
        </span>
        <span className="text-[15px] text-ink">{estaTela.rotulo}</span>
        <span className="text-h3 tabular-nums text-ink"><BRL value={estaTela.valor} /></span>
        <span className="text-caption text-faint">{estaTela.detalhe}</span>
      </div>

      {outra && (
        <>
          <span className="hidden sm:block w-px self-stretch bg-border-soft" aria-hidden />
          <div className="flex flex-col">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">A outra tela mostra</span>
            <span className="text-[15px] text-muted">{aOutra.rotulo}</span>
            <span className="text-h3 tabular-nums text-muted"><BRL value={aOutra.valor} /></span>
            <Link
              href={outra.rota}
              className="text-caption font-medium text-ink hover:underline inline-flex items-center gap-1 mt-[2px]"
            >
              Abrir {outra.nome}
              <Icon name="arrow-up-right" size={12} color="currentColor" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
