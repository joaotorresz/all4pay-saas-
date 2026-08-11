"use client";

/**
 * ⚠️ ONDA 4 — **A TELA MOSTRA "SEM DADOS", NÃO R$ 0.**
 *
 * A camada canônica passou a dizer quando não sabe (`Indicador.indisponivel`).
 * Isto é a outra metade: sem um componente que HONRE o contrato, cada tela
 * escreve `{i.valor}` e a onda inteira se desfaz num `?? 0` — o defeito volta
 * exatamente como entrou, sem ninguém decidir que voltasse.
 *
 * Três regras, e as três são a mesma:
 *
 *  1. **Com `indisponivel`, o número não aparece.** Nem cinza, nem pequeno, nem
 *     entre parênteses. Um R$ 0 desbotado continua sendo um R$ 0 na leitura de
 *     quem passa o olho, e é a leitura de quem passa o olho que vira decisão.
 *  2. **O motivo ocupa o lugar do número**, no tamanho do número. Uma nota de
 *     rodapé explicando por que o zero é zero deixa o zero mandando na tela.
 *  3. **A origem fica a um clique**, sempre — inclusive na ausência, onde a
 *     pergunta "por que não tem número?" é mais urgente que de costume.
 */
import * as React from "react";
import type { Indicador, Procedencia } from "@/core/indicadores";
import { BRL } from "./BRL";
import { MarcaProcedencia, textoDeOrigem } from "./Procedencia";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

/** Como o número é escrito quando existe. */
export type FormatoValor = "moeda" | "numero" | "percentual" | "dias" | "meses";

function escrever(valor: number, formato: FormatoValor): React.ReactNode {
  switch (formato) {
    case "moeda": return <BRL value={valor} />;
    // ⚠️ Uma casa no percentual, como manda `REGRAS_DE_FORMATO`: zero apaga a
    // diferença entre 12,4% e 12,9%; duas fingem precisão que uma média de 90
    // dias não tem.
    case "percentual": return <span className="tabular-nums">{(valor * 100).toFixed(1).replace(".", ",")}%</span>;
    case "dias": return <span className="tabular-nums">{Math.round(valor)} dias</span>;
    case "meses": return <span className="tabular-nums">{valor.toFixed(1).replace(".", ",")} meses</span>;
    default: return <span className="tabular-nums">{valor.toLocaleString("pt-BR")}</span>;
  }
}

/* -------------------------------------------------------------------------- */
/* A origem — fórmula, período, regime e os lançamentos que compõem            */
/* -------------------------------------------------------------------------- */

const NATUREZA = {
  fato: "Soma de lançamentos que já aconteceram.",
  estimativa: "Medido por média ou por semelhança, não contado um a um.",
  projecao: "Conta sobre o futuro: depende de os títulos previstos serem pagos nas datas previstas.",
} as const;

const REGIME = {
  posicao: "posição das contas",
  caixa: "regime de caixa (data de pagamento)",
  competencia: "regime de competência (data de vencimento)",
} as const;

/**
 * O painel de origem, aberto pelo próprio número.
 *
 * ⚠️ Ele NÃO é microtexto escrito à mão: cada linha sai do que o motor
 * devolveu. Texto à mão envelhece na primeira mudança de fórmula e passa a
 * descrever um cálculo que não existe — pior que não explicar, porque agora
 * está errado com autoridade.
 */
export function PainelOrigem({
  titulo, procedencia, indisponivel, onVerLancamentos,
}: {
  titulo: string;
  procedencia: Procedencia;
  indisponivel?: { motivo: string; comoResolver?: string };
  onVerLancamentos?: (ids: readonly string[]) => void;
}) {
  const ids = procedencia.movimentos ?? [];
  return (
    <div className="flex flex-col gap-3 min-w-[260px] max-w-[340px]">
      <div className="flex flex-col gap-1">
        <span className="text-label font-medium text-muted">{titulo}</span>
        {indisponivel ? (
          <p className="m-0 text-caption text-ink">{indisponivel.motivo}.</p>
        ) : (
          <p className="m-0 text-caption text-muted">{NATUREZA[procedencia.natureza]}</p>
        )}
      </div>

      {indisponivel?.comoResolver && (
        <p className="m-0 text-caption text-muted">{indisponivel.comoResolver}</p>
      )}

      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
        <dt className="text-faint">Fórmula</dt>
        <dd className="m-0 text-ink">{procedencia.formula}</dd>
        <dt className="text-faint">Período</dt>
        <dd className="m-0 text-ink">
          {procedencia.janela.vazia ? "intervalo inválido" : procedencia.janela.label}
        </dd>
        <dt className="text-faint">Regime</dt>
        <dd className="m-0 text-ink">{REGIME[procedencia.regime]}</dd>
        <dt className="text-faint">Lançamentos</dt>
        <dd className="m-0 text-ink tabular-nums">{procedencia.lancamentos}</dd>
      </dl>

      {/* ⚠️ "34 lançamentos" é um número sobre o número. O que fecha a conta é
          poder VER os 34 — a diferença entre confiar e conferir. O botão só
          existe quando o indicador carrega os ids: uma média não tem linha
          para apontar, e um botão que abre o vazio ensina a não clicar. */}
      {ids.length > 0 && onVerLancamentos && (
        <button
          type="button"
          onClick={() => onVerLancamentos(ids)}
          className="self-start text-caption text-ink underline underline-offset-2 decoration-border"
        >
          Ver os {ids.length} lançamentos
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* O valor                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A forma CURTA de cada ausência — a que cabe no lugar de um número.
 *
 * ⚠️ O motivo por extenso ("nenhum lançamento no período") não cabe numa
 * coluna de tabela nem numa linha de KPI de 280px: ele quebraria o layout de
 * todas as telas, e o conserto de layout mais provável é alguém trocar de
 * volta por `{valor}`. Então o slot do número recebe a forma curta, e a frase
 * inteira fica no `title`, no leitor de tela e no painel de origem — a um
 * clique, junto com o que fazer a respeito.
 *
 * As cinco são NEGATIVAS ou neutras de propósito. "Sem movimento" não pode
 * soar como notícia boa; era exatamente esse o defeito do R$ 0.
 */
const CURTO: Record<string, string> = {
  janela_invalida: "período inválido",
  sem_lancamentos: "sem movimento",
  sem_base: "sem base de cálculo",
  caixa_negativo: "não se aplica",
  sem_queima: "não há queima",
};

/**
 * A frase que ocupa o lugar do número.
 *
 * ⚠️ Ela é `faint` e em corpo de texto, não em corpo de valor: a ausência não
 * deve competir com os números que existem ao lado. Mas ocupa o MESMO lugar —
 * mandar o motivo para o rodapé devolveria o zero ao posto de resposta.
 */
export function SemDados({
  motivo, codigo, className,
}: { motivo: string; codigo?: string; className?: string }) {
  const curto = (codigo && CURTO[codigo]) || motivo;
  return (
    <span
      className={cn("inline-flex items-baseline gap-1 text-body text-faint", className)}
      title={motivo}
    >
      <span aria-hidden>—</span>
      <span>{curto}</span>
    </span>
  );
}

export interface ValorIndicadorProps {
  indicador: Indicador;
  /** Rótulo do indicador — vai para o painel de origem e para o leitor de tela. */
  titulo: string;
  formato?: FormatoValor;
  /** Classe do NÚMERO, quando ele existe. */
  className?: string;
  /** Abre a lista dos lançamentos que compõem o número. */
  onVerLancamentos?: (ids: readonly string[]) => void;
}

/**
 * O número de um indicador canônico — ou, quando não há número, a frase que
 * diz por quê.
 */
export function ValorIndicador({
  indicador, titulo, formato = "moeda", className, onVerLancamentos,
}: ValorIndicadorProps) {
  const [aberto, setAberto] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  const { indisponivel, procedencia } = indicador;

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    // ⚠️ Esc fecha, como todo sobreposto do sistema — é o que a guarda de
    // controles (ONDA 7) cobra de qualquer coisa que abre por cima.
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <span ref={ref} className="relative inline-flex items-baseline gap-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={
          indisponivel
            ? `${titulo}: sem dados — ${indisponivel.motivo}. Ver origem.`
            : `${titulo}. Ver de onde vem este número.`
        }
        className="inline-flex items-baseline gap-1 text-left"
      >
        {indisponivel
          ? <SemDados motivo={indisponivel.motivo} codigo={indisponivel.codigo} />
          : <span className={className}>{escrever(indicador.valor, formato)}</span>}
        <Icon name="info" size={12} color="var(--color-faint)" />
      </button>

      {!indisponivel && <MarcaProcedencia procedencia={procedencia} />}

      {aberto && (
        <div
          role="dialog"
          className="absolute z-50 top-full left-0 mt-2 p-4 rounded-card bg-white shadow-popover"
        >
          <PainelOrigem
            titulo={titulo}
            procedencia={procedencia}
            indisponivel={indisponivel}
            onVerLancamentos={onVerLancamentos}
          />
        </div>
      )}
    </span>
  );
}

export { textoDeOrigem };
