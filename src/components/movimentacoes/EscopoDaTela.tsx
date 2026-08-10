"use client";

/**
 * O ESCOPO DA TELA — a faixa que diz o que esta tela mede e o que a outra mede.
 *
 * ⚠️ Existiam DUAS telas respondendo "quanto tenho a receber", com números que
 * não batiam. Nenhuma estava errada: uma mostrava o ESTOQUE de títulos (posição,
 * sem período) e a outra o RESULTADO do período (fluxo, que pode ser negativo).
 *
 * O mapa de consolidação (item 2) resolveu isso na RAIZ — as duas viraram uma.
 * Então esta faixa deixou de ser uma ponte entre telas e virou o que sempre
 * deveria ter sido: a DECLARAÇÃO do que este número mede, com a outra leitura
 * ao lado como contexto.
 *
 * A outra leitura continua visível de propósito: quem vem de um relatório com
 * o número de fluxo na cabeça precisa ver os dois juntos para não concluir que
 * um deles está errado.
 *
 * Ela não some: um aviso que se fecha é um aviso que a pessoa nunca mais vê
 * justamente quando volta em dúvida.
 */
import * as React from "react";
import { BRL, InfoHint } from "@/components/ui";
import { pontePosicaoFluxo, type Janela } from "@/core/indicadores";
import { useRiscoInput } from "@/components/visao-geral/hooks";

export type Leitura = "posicao" | "fluxo";

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
        <span className="text-[11px] font-medium tracking-[0.08em] text-faint inline-flex items-center gap-1">
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

      <span className="hidden sm:block w-px self-stretch bg-border-soft" aria-hidden />
      <div className="flex flex-col">
        <span className="text-[11px] font-medium tracking-[0.08em] text-faint">A outra leitura</span>
        <span className="text-[15px] text-muted">{aOutra.rotulo}</span>
        <span className="text-h3 tabular-nums text-muted"><BRL value={aOutra.valor} /></span>
        <span className="text-caption text-faint">medida diferente, não divergência</span>
      </div>
    </div>
  );
}
