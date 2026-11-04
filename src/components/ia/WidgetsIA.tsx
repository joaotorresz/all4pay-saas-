"use client";

/**
 * O cartão de um MOTOR dentro da resposta da Quattro AI (Fase 2, 03/11/2026).
 *
 * O resumo que cabe na coluna da conversa: o número que responde a pergunta, a
 * leitura em uma frase e as três primeiras linhas do que o motor propõe. A
 * análise inteira continua na tela do motor ("Ver análise completa"), que o
 * servidor tranca para quem não é Pro.
 *
 * ⚠️ O cartão só LÊ. Nada aqui executa: as ações (cobrar, aprovar) seguem na
 * tela do motor, e a guarda `ia-executa` cobra que o chat não tenha caminho de
 * escrita.
 *
 * ⚠️ O plano aqui é APRESENTAÇÃO (`usePlano`): quem não é Pro vê o convite no
 * lugar do resumo, e a tela completa segue trancada no `middleware.ts`.
 */
import * as React from "react";
import Link from "next/link";
import { Icon, Skeleton, BRL } from "@/components/ui";
import { usePlano } from "@/lib/plano";
import { useRiscoCaixa, useDecisao, useQuantitativo, useOperacaoAutonoma } from "@/components/visao-geral/hooks";
import { WIDGETS_IA, type WidgetIA } from "@/core/assistant/widgets";
import { rotuloRunwayLido } from "@/core/indicadores";
import { CLASSIF_SAUDE_LABEL } from "@/core/quant/types";
import { formatBRL, pct, pctDeInteiro } from "@/lib/format";
import { ROTULO_HORIZONTE_RUPTURA } from "@/core/risk-engine/horizonte";

const NIVEL_RISCO: Record<string, string> = {
  baixo: "Risco baixo", medio: "Risco médio", alto: "Risco alto", critico: "Risco crítico",
};
const COR_NIVEL: Record<string, string> = {
  baixo: "var(--color-positive)", medio: "var(--color-warning)", alto: "var(--color-negative)", critico: "var(--color-negative)",
  excelente: "var(--color-positive)", saudavel: "var(--color-positive)", atencao: "var(--color-warning)", risco: "var(--color-negative)",
};

export function WidgetDaResposta({ id, onNavegar }: { id: WidgetIA; onNavegar?: () => void }) {
  const w = WIDGETS_IA.find((x) => x.id === id);
  const { estado, carregando } = usePlano();
  // Uma conversa salva antes de um cartão sair do catálogo não quebra a tela.
  if (!w) return null;
  const pro = estado.aberto || estado.plano === "pro";
  return (
    <div data-ia="widget" data-widget={id} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
          <Icon name="sparkles" size={14} color="var(--color-on-lime)" />
        </span>
        <span className="text-label font-medium text-muted">{w.titulo}</span>
      </div>
      {carregando ? <Skeleton className="h-[120px]" rounded="card" /> : pro ? <Corpo id={id} /> : (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-body text-ink">
            {w.titulo} é um motor do plano Pro. Com ele, esta resposta traz a análise completa dos seus números.
          </p>
          <Link href="/planos" onClick={onNavegar} className="self-start inline-flex items-center gap-1 text-caption font-medium rounded-pill px-3 py-[6px] bg-ink text-white hover:bg-ink-soft transition-colors">
            Conhecer o plano Pro
            <Icon name="arrow-up-right" size={13} color="currentColor" />
          </Link>
        </div>
      )}
      {pro && !carregando && (
        <Link href={w.rota} onClick={onNavegar} className="self-start inline-flex items-center gap-1 text-caption font-medium text-ink bg-surface-2 hover:bg-surface-3 rounded-pill px-3 py-[6px] transition-colors">
          Ver análise completa
          <Icon name="arrow-up-right" size={13} color="currentColor" />
        </Link>
      )}
    </div>
  );
}

function Corpo({ id }: { id: WidgetIA }) {
  if (id === "risco") return <Risco />;
  if (id === "decisao") return <Decisao />;
  if (id === "saude") return <Saude />;
  return <Sugestoes />;
}

/* ─────────────────────────────── peças ─────────────────────────────── */

function Status({ texto, nivel }: { texto: string; nivel: string }) {
  const cor = COR_NIVEL[nivel] ?? "var(--color-text-secondary)";
  return (
    <span className="self-start inline-flex items-center gap-2 rounded-pill px-3 py-1 text-label font-medium bg-surface-2" style={{ color: cor }}>
      <span className="w-2 h-2 rounded-pill" style={{ background: cor }} />
      {texto}
    </span>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-caption text-faint">{rotulo}</span>
      <span className="text-h3 tabular-nums text-ink leading-none">{valor}</span>
    </div>
  );
}

function Score({ valor }: { valor: number }) {
  return (
    <div className="flex items-end gap-2">
      <span className="text-[52px] leading-none tabular-nums text-ink">{valor}</span>
      <span className="text-h3 text-faint mb-1">/100</span>
    </div>
  );
}

function Linhas({ itens, vazio }: { itens: { titulo: string; detalhe?: React.ReactNode }[]; vazio: string }) {
  if (itens.length === 0) return <span className="text-caption text-faint">{vazio}</span>;
  return (
    <ul className="m-0 p-0 list-none flex flex-col divide-y divide-border-soft">
      {itens.slice(0, 3).map((it, i) => (
        <li key={i} className="py-2 flex flex-col gap-[2px]">
          <span className="text-body text-ink">{it.titulo}</span>
          {it.detalhe && <span className="text-caption text-muted">{it.detalhe}</span>}
        </li>
      ))}
    </ul>
  );
}

const Carregando = () => <Skeleton className="h-[120px]" rounded="card" />;
const Falhou = ({ texto }: { texto: string }) => <p className="m-0 text-caption text-muted">{texto}</p>;

/* ───────────────────────────── os motores ───────────────────────────── */

function Risco() {
  const { data, isLoading, isError } = useRiscoCaixa();
  if (isLoading) return <Carregando />;
  if (isError || !data) return <Falhou texto="Não foi possível calcular o risco de caixa agora." />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2"><Score valor={data.score} /><Status texto={NIVEL_RISCO[data.nivel] ?? data.nivel} nivel={data.nivel} /></div>
        <div className="flex gap-6">
          <Numero rotulo={`Chance de ruptura (${ROTULO_HORIZONTE_RUPTURA})`} valor={pctDeInteiro(data.probabilidadeRuptura * 100)} />
          <Numero rotulo="Runway (base)" valor={rotuloRunwayLido(data.runway.leitura.base)} />
        </div>
      </div>
      <p className="m-0 text-body text-ink leading-[1.5]">{data.narrativa}</p>
      {data.fatoresCriticos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.fatoresCriticos.slice(0, 3).map((f, i) => (
            <span key={i} className="inline-flex items-center gap-[6px] text-caption text-muted bg-surface-2 rounded-pill px-3 py-1">
              <span className="w-[6px] h-[6px] rounded-pill bg-negative" />{f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Decisao() {
  const { data, isLoading, isError } = useDecisao();
  if (isLoading) return <Carregando />;
  if (isError || !data) return <Falhou texto="Não foi possível gerar a decisão financeira agora." />;
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-body text-ink leading-[1.5]">{data.headline}</p>
      <div className="flex gap-6">
        <Numero rotulo={`Chance de ruptura (${ROTULO_HORIZONTE_RUPTURA})`} valor={pctDeInteiro(data.risco.probabilidadeRuptura * 100)} />
        <Numero rotulo={`Caixa em ${ROTULO_HORIZONTE_RUPTURA} (mediana)`} valor={formatBRL(data.previsao.caixaFinalP50)} />
      </div>
      <Linhas
        vazio="Sem ações de melhoria relevantes no momento."
        itens={data.recomendacoes.map((r) => ({ titulo: r.titulo, detalhe: r.descricao }))}
      />
    </div>
  );
}

function Saude() {
  const { data, isLoading, isError } = useQuantitativo();
  if (isLoading) return <Carregando />;
  if (isError || !data) return <Falhou texto="Não foi possível calcular a saúde financeira agora." />;
  const { score } = data;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2"><Score valor={score.score} /><Status texto={CLASSIF_SAUDE_LABEL[score.classificacao]} nivel={score.classificacao} /></div>
      <Numero rotulo={`Chance de ruptura (${ROTULO_HORIZONTE_RUPTURA})`} valor={pct(score.probabilidadeRuptura)} />
    </div>
  );
}

function Sugestoes() {
  const { data, isLoading, isError } = useOperacaoAutonoma();
  if (isLoading) return <Carregando />;
  if (isError || !data) return <Falhou texto="Não foi possível calcular as sugestões agora." />;
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-body text-ink leading-[1.5]">{data.headline}</p>
      <Linhas
        vazio="Operação estável, nada a sugerir agora."
        itens={data.decisoes.map((d) => ({
          titulo: d.titulo,
          detalhe: d.impactoEsperado > 0 ? <>Impacto esperado <BRL value={d.impactoEsperado} /></> : d.recomendacao,
        }))}
      />
    </div>
  );
}
