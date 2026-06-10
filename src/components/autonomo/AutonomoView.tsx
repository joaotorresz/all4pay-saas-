"use client";

import * as React from "react";
import { Card, Skeleton, Icon } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useOperacaoAutonoma } from "@/components/visao-geral/hooks";
import {
  TIPO_LABEL,
  type FinancialDecision,
  type TipoDecisao,
  type CollectionPlan,
  type PaymentRoute,
  type PoliticaAutonoma,
} from "@/core/autonomous/types";

const TIPO_COR: Record<TipoDecisao, string> = {
  cobranca: "var(--color-positive)",
  pagamento: "var(--color-warning)",
  capital: "var(--color-ink)",
  risco: "var(--color-negative)",
};
const CANAL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", email: "E-mail", ligacao: "Ligação" };

export function AutonomoView() {
  const { data, isLoading, isError } = useOperacaoAutonoma();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[120px] lg:col-span-3" rounded="card" />
        <Skeleton className="h-[320px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[320px] lg:col-span-1" rounded="card" />
      </div>
    );
  }
  if (isError || !data) {
    return <Card><p className="text-muted">Não foi possível rodar a operação autônoma.</p></Card>;
  }

  const { decisoes, nextBestAction, politicas, collections, routing, hitl } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Headline + next best action */}
      <Card className="lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="cpu" size={14} color="var(--color-ink)" />
          </span>
          <span className="text-label font-medium text-muted">Operação financeira autônoma</span>
        </div>
        <p className="m-0 text-h3 leading-[1.5] font-regular text-ink">{data.headline}</p>
        {nextBestAction && (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-1 p-3">
            <span className="text-caption font-medium text-faint uppercase tracking-wide">Próxima melhor ação</span>
            <span className="text-[15px] font-medium text-ink">{nextBestAction.acao}</span>
            <span className="text-caption text-muted">{nextBestAction.impacto}</span>
            <span className="text-caption text-faint ml-auto">confiança {Math.round(nextBestAction.confianca * 100)}%</span>
          </div>
        )}
      </Card>

      {/* Decisões */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Decisões financeiras</span>
        {decisoes.length === 0 ? (
          <span className="text-caption text-faint">Operação estável — nenhuma decisão acionável.</span>
        ) : (
          decisoes.map((d) => <DecisaoRow key={d.id} d={d} />)
        )}
      </Card>

      {/* Human-in-the-loop */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Human-in-the-loop</span>
        <div className="flex gap-6">
          <div>
            <div className="text-caption text-faint">Automáticas</div>
            <div className="text-h2 font-medium tabular-nums text-positive leading-none">{hitl.automaticas}</div>
          </div>
          <div>
            <div className="text-caption text-faint">Aguardam aprovação</div>
            <div className="text-h2 font-medium tabular-nums text-ink leading-none">{hitl.pendentesAprovacao}</div>
          </div>
        </div>
        <span className="text-caption text-faint">
          Executa sozinho até {formatBRL(hitl.limiteAutomatico)} e confiança ≥ {Math.round(hitl.confiancaMinima * 100)}%; acima disso, escala para aprovação. Ações reversíveis (cobrança/monitoramento) são automáticas.
        </span>
        {decisoes.filter((d) => d.modo === "requer_aprovacao").length > 0 && (
          <div className="flex flex-col gap-1 pt-1 border-t border-border-soft">
            <span className="text-caption font-medium text-faint uppercase tracking-wide">Fila de aprovação</span>
            {decisoes.filter((d) => d.modo === "requer_aprovacao").map((d) => (
              <span key={d.id} className="text-caption text-muted">· {d.titulo}</span>
            ))}
          </div>
        )}
      </Card>

      {/* Políticas */}
      <Card className="lg:col-span-3 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Políticas autônomas · SE → ENTÃO</span>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {politicas.map((p) => <PoliticaRow key={p.id} p={p} />)}
        </div>
      </Card>

      {/* Cobrança autônoma */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Cobrança autônoma · canal · horário · estratégia</span>
        {collections.length === 0 ? (
          <span className="text-caption text-faint">Sem clientes em cobrança no momento.</span>
        ) : (
          <div className="flex flex-col">
            {collections.map((c) => <CollectionRow key={c.cliente} c={c} />)}
          </div>
        )}
      </Card>

      {/* Roteamento de pagamento */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Roteamento de pagamento</span>
        {routing.length === 0 ? (
          <span className="text-caption text-faint">Sem pagamentos pendentes para rotear.</span>
        ) : (
          routing.map((r, i) => <RouteRow key={i} r={r} />)
        )}
      </Card>
    </div>
  );
}

function DecisaoRow({ d }: { d: FinancialDecision }) {
  const auto = d.modo === "automatico";
  return (
    <div className="flex gap-3 py-[10px] border-t border-border-soft first:border-t-0">
      <span className="text-caption font-medium text-faint tabular-nums w-[20px] pt-[2px]">#{d.prioridade}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-caption font-medium rounded-pill px-2 py-[2px]" style={{ background: "var(--color-surface-2)", color: TIPO_COR[d.tipo] }}>
            {TIPO_LABEL[d.tipo]}
          </span>
          <span className="text-[14px] font-medium text-ink">{d.titulo}</span>
          <span className="text-caption font-medium ml-auto" style={{ color: auto ? "var(--color-positive)" : "var(--color-warning)" }}>
            {auto ? "automático" : "requer aprovação"}
          </span>
        </div>
        <span className="text-caption text-muted">{d.recomendacao}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-caption text-faint">
          {d.impactoEsperado > 0 && <span>impacto ≈ {formatBRL(d.impactoEsperado)}</span>}
          <span>confiança {Math.round(d.confianca * 100)}%</span>
          <span>risco exec. {Math.round(d.riscoExecucao * 100)}%</span>
          <span className="text-placeholder">{d.fatores.join(" · ")}</span>
        </div>
      </div>
    </div>
  );
}

function PoliticaRow({ p }: { p: PoliticaAutonoma }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border-soft p-3">
      <span className="w-2 h-2 rounded-pill mt-[5px] shrink-0" style={{ background: p.disparou ? "var(--color-positive)" : "var(--color-text-tertiary)" }} />
      <div className="min-w-0">
        <div className="text-[13px] text-ink">
          <span className="text-faint">SE</span> {p.se} <span className="text-faint">ENTÃO</span> {p.entao}
        </div>
        <span className="text-caption text-faint">
          {p.disparou ? `disparou · ${p.decisoes} decisão(ões)` : "não acionada"}
        </span>
      </div>
    </div>
  );
}

function CollectionRow({ c }: { c: CollectionPlan }) {
  return (
    <div className="flex items-center gap-3 py-2 border-t border-border-soft first:border-t-0">
      <span className="text-[13px] text-ink flex-1 truncate">{c.cliente}</span>
      <span className="text-caption font-medium text-ink bg-surface-2 rounded-pill px-2 py-[2px]">{CANAL_LABEL[c.canal]}</span>
      <span className="text-caption text-muted w-[150px] truncate">{c.horario}</span>
      <span className="text-caption text-faint w-[120px] text-right truncate">{c.tom}</span>
      <span className="text-caption text-muted tabular-nums w-[90px] text-right">{formatBRL(c.exposicao)}</span>
    </div>
  );
}

function RouteRow({ r }: { r: PaymentRoute }) {
  return (
    <div className="flex flex-col gap-[2px] rounded-md border border-border-soft p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-medium tabular-nums text-ink">{formatBRL(r.valor)}</span>
        <span className="text-caption text-ink">{r.banco}</span>
      </div>
      <span className="text-caption text-faint">{r.contaEscolhida} — {r.motivo}</span>
    </div>
  );
}
