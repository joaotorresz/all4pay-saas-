"use client";

/**
 * A BASE DO SALDO — a faixa que diz QUAL saldo esta tela mostra.
 *
 * ⚠️ Três telas respondiam "quanto eu tenho" com números diferentes —
 * `/fluxo-caixa`, o extrato e o dashboard financeiro — e **nenhuma declarava a
 * base**. O defeito não é de cálculo: desde a ONDA 1 a função de saldo é uma só
 * (`core/indicadores.saldo`, que lê o `balance` das contas e usa os movimentos
 * apenas para deslocar esse nível). O que faltava era cada tela dizer qual
 * recorte usa — posição de hoje, projeção do fim do período, ou variação da
 * janela.
 *
 * Um número sem base declarada não é conferível, e três números não conferíveis
 * para a mesma pergunta é o que faz o usuário parar de confiar em todos.
 */
import * as React from "react";
import { Icon, BRL, InfoHint } from "@/components/ui";
import {
  saldo, saldoInicial, resultado, type Janela,
} from "@/core/indicadores";
import { useRiscoInput } from "@/components/visao-geral/hooks";

/** Qual leitura de saldo esta tela mostra. */
export type BaseSaldo =
  /** O saldo consolidado das contas AGORA. Não depende do período. */
  | "posicao_hoje"
  /** O saldo projetado para o fim da janela (hoje + previstos até lá). */
  | "projetado_fim"
  /** A VARIAÇÃO da janela (entradas − saídas), que não é um saldo. */
  | "variacao_janela";

const DESCRICAO: Record<BaseSaldo, { rotulo: string; base: string }> = {
  posicao_hoje: {
    rotulo: "Saldo em conta, hoje",
    base: "o `balance` consolidado das contas financeiras — o que o banco diz que existe agora. Não muda ao trocar o período.",
  },
  projetado_fim: {
    rotulo: "Saldo projetado para o fim do período",
    base: "o saldo de hoje MAIS os títulos previstos que vencem até o fim da janela. É uma projeção, não uma posição.",
  },
  variacao_janela: {
    rotulo: "Resultado do período",
    base: "entradas menos saídas liquidadas na janela. Não é um saldo: pode ser negativo num mês em que se pagou mais do que se recebeu.",
  },
};

export function BaseDoSaldo({ base, janela }: { base: BaseSaldo; janela: Janela }) {
  const { data: inp } = useRiscoInput();
  const calc = React.useMemo(() => {
    if (!inp) return null;
    return {
      posicao_hoje: saldo(inp).valor,
      projetado_fim: saldo(inp, janela).valor,
      variacao_janela: resultado(inp, janela).valor,
      abertura: saldoInicial(inp, janela).valor,
    };
  }, [inp, janela]);
  if (!calc) return null;

  const d = DESCRICAO[base];
  const valor = calc[base];

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 rounded-card bg-surface-1 border border-border-soft">
      <div className="flex flex-col">
        <span className="text-[11px] font-medium tracking-[0.08em] text-faint inline-flex items-center gap-1">
          {d.rotulo}
          <InfoHint
            align="left"
            titulo="Qual saldo é este"
            oQue={`Esta tela mostra ${d.base}`}
            comoCalcula="Todas as telas do sistema usam a mesma função de saldo (core/indicadores): o nível vem do saldo das contas e os lançamentos apenas o deslocam — para trás com o que já foi liquidado, para frente com o que está previsto. O que muda entre as telas é o RECORTE, e é ele que está declarado aqui."
          />
        </span>
        <span
          className="text-h3 tabular-nums"
          style={{ color: "var(--color-ink)" }}
        >
          {valor < 0 && <span aria-hidden>−</span>}<BRL value={Math.abs(valor)} />
        </span>
      </div>

      {/* As outras duas leituras, ao lado — é isso que impede a pessoa de achar
          que a tela vizinha está errada quando mostra outro número. */}
      <div className="flex flex-col gap-[2px] text-caption">
        {(Object.keys(DESCRICAO) as BaseSaldo[])
          .filter((k) => k !== base)
          .map((k) => (
            <span key={k} className="text-faint">
              {DESCRICAO[k].rotulo}:{" "}
              <span className="tabular-nums text-muted">
                {calc[k] < 0 && <span aria-hidden>−</span>}<BRL value={Math.abs(calc[k])} />
              </span>
            </span>
          ))}
      </div>

      <span className="text-caption text-faint max-w-[38ch] flex items-start gap-1">
        <Icon name="info" size={12} color="var(--color-text-tertiary)" />
        Os três saem da mesma função de saldo; o que muda é o recorte.
      </span>
    </div>
  );
}
