"use client";

import * as React from "react";
import { Card, Skeleton, Icon, BRL } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import {
  useQuantitativo,
  useRiscoCaixa,
  useInadimplencia,
  useCentroInteligencia,
  useRiscoInput,
  useDecisao,
} from "./hooks";
import { useAccountsList } from "@/components/lancamentos/hooks";
import type { RiskMovement } from "@/core/risk-engine/types";

/* ===================================================================
   Cockpit modular — catálogo de widgets. Filosofia: todo card responde
   uma PERGUNTA EXECUTIVA (não só mostra um número). Cada widget é uma
   função pura sobre o contexto dos motores (já cacheado). Default-off no
   Personalizar Home — o usuário monta o próprio cockpit.
   =================================================================== */

export interface CockpitCtx {
  quant?: ReturnType<typeof useQuantitativo>["data"];
  risco?: ReturnType<typeof useRiscoCaixa>["data"];
  inad?: ReturnType<typeof useInadimplencia>["data"];
  exec?: ReturnType<typeof useCentroInteligencia>["data"];
  decisao?: ReturnType<typeof useDecisao>["data"];
  input?: ReturnType<typeof useRiscoInput>["data"];
  accounts?: ReturnType<typeof useAccountsList>["data"];
  loading: boolean;
}

/** Roda os motores uma vez (compartilham a query ["risco-input"]). */
export function useCockpitCtx(): CockpitCtx {
  const quant = useQuantitativo();
  const risco = useRiscoCaixa();
  const inad = useInadimplencia();
  const exec = useCentroInteligencia();
  const decisao = useDecisao();
  const input = useRiscoInput();
  const accounts = useAccountsList();
  return {
    quant: quant.data, risco: risco.data, inad: inad.data, exec: exec.data,
    decisao: decisao.data, input: input.data, accounts: accounts.data,
    loading: quant.isLoading || input.isLoading,
  };
}

const POS = "var(--color-positive)";
const NEG = "var(--color-negative)";
const WARN = "var(--color-warning)";
const realizado = (m: RiskMovement): string | null => m.paid_date ?? (m.status === "pago" ? m.due_date : null);

/* ----------------------------- MetricCard ----------------------------- */

function MetricCard({ label, value, answer, tone, icon }: {
  label: string;
  value: React.ReactNode;
  answer?: string;
  tone?: string;
  icon?: string;
}) {
  return (
    <Card className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-2">
        {icon && <Icon name={icon} size={14} color="var(--color-text-secondary)" />}
        <span className="text-label font-medium text-muted">{label}</span>
      </div>
      <span className="text-value-lg leading-none font-medium tabular-nums" style={{ color: tone ?? "var(--color-ink)" }}>
        {value}
      </span>
      {answer && <p className="m-0 text-caption text-muted leading-[1.45]">{answer}</p>}
    </Card>
  );
}

function Loading() { return <Skeleton className="h-[120px] w-full" rounded="card" />; }

/* ------------------------------ Card "Hoje" ----------------------------- */

export function ResumoHojeCard({ ctx }: { ctx: CockpitCtx }) {
  if (ctx.loading || !ctx.input) return <Skeleton className="h-[200px] w-full" rounded="card" />;
  const { input, exec } = ctx;
  const hoje = input.hoje;
  let entram = 0, saem = 0, vencem = 0, impostos = 0, pendencias = 0;
  for (const m of input.movements) {
    const real = realizado(m);
    if (real === hoje) { if (m.type === "entrada") entram += m.amount; else saem += m.amount; }
    if (m.status === "pendente") {
      pendencias++;
      if (m.due_date === hoje) vencem++;
      if (m.type === "saida" && /imposto|tribut|das|darf|iss|icms/i.test(String(m.category ?? "")) && m.due_date >= hoje) impostos++;
    }
  }
  const prioridades = (exec?.insights ?? []).slice(0, 3);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
          <Icon name="sparkles" size={14} color="var(--color-on-lime)" />
        </span>
        <span className="text-label font-medium text-muted">Hoje · briefing executivo</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <HojeStat label="Entram" value={<BRL value={entram} />} tone={POS} />
        <HojeStat label="Saem" value={<BRL value={saem} />} tone={NEG} />
        <HojeStat label="Vencem" value={`${vencem}`} sub="cobrança(s)" tone={vencem ? WARN : undefined} />
        <HojeStat label="Pendências" value={`${pendencias}`} sub="em aberto" />
      </div>
      <div className="flex flex-col gap-2 border-t border-border-soft pt-3">
        <span className="text-caption font-medium text-faint uppercase tracking-wide">Prioridade do dia · IA</span>
        {prioridades.length === 0 ? (
          <span className="text-caption text-muted">Nada crítico hoje — operação sob controle.</span>
        ) : (
          prioridades.map((p) => (
            <div key={p.id} className="flex items-start gap-2">
              <span className="w-[6px] h-[6px] rounded-pill mt-[6px] shrink-0" style={{ background: /crit|alta/i.test(p.severidade) ? NEG : WARN }} />
              <span className="text-[13px] text-ink">{p.titulo}<span className="text-muted"> — {p.recomendacoes?.[0] ?? p.descricao}</span></span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function HojeStat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-h3 font-medium tabular-nums leading-none" style={{ color: tone ?? "var(--color-ink)" }}>{value}</span>
      {sub && <span className="text-caption text-faint mt-[2px]">{sub}</span>}
    </div>
  );
}

/* ---------------------------- Catálogo modular --------------------------- */

export interface CatalogWidget {
  id: string;
  label: string;
  categoria: string;
  render: (ctx: CockpitCtx) => React.ReactNode;
}

const meses = (m: number) => (m >= 99 ? "99+" : m.toFixed(1));
const pctTxt = (n: number) => `${Math.round(n * 100)}%`;
const scoreTone = (s: number) => (s >= 75 ? POS : s >= 50 ? WARN : NEG);

/** HHI/maior fatia bancária a partir das contas. */
function exposicaoBancaria(accounts?: { balance: number; bank: string }[]) {
  if (!accounts || !accounts.length) return null;
  const total = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  if (total <= 0) return null;
  const top = accounts.slice().sort((a, b) => b.balance - a.balance)[0];
  return { share: Math.max(0, top.balance) / total, banco: top.bank };
}

export const COCKPIT_CATALOG: CatalogWidget[] = [
  /* ---- Resumo executivo ---- */
  {
    id: "health_score", label: "Financial Health Score", categoria: "Resumo executivo",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="activity" label="Financial Health Score" tone={scoreTone(c.quant.score.score)}
        value={`${c.quant.score.score}/100`}
        answer={`Saúde ${c.quant.score.classificacao}. Liquidez ${c.quant.indicadores.liquidezCorrente.toFixed(2)} · prob. de ruptura ${pctTxt(c.quant.score.probabilidadeRuptura)} em 90d.`} />
    ),
  },
  {
    id: "empresa_risco", label: "Empresa em risco?", categoria: "Resumo executivo",
    render: (c) => !c.risco ? <Loading /> : (
      <MetricCard icon="gauge" label="Empresa em risco?" tone={scoreTone(c.risco.score)}
        value={c.risco.nivel === "baixo" ? "🟢 Saudável" : c.risco.nivel === "medio" ? "🟡 Atenção" : "🔴 Risco"}
        answer={`Chance de ruptura de caixa em 60 dias: ${pctTxt(c.risco.probabilidadeRuptura)}.`} />
    ),
  },
  /* ---- Caixa ---- */
  {
    id: "runway_meses", label: "Fôlego de caixa (runway)", categoria: "Caixa",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="trending-up" label="Fôlego de caixa"
        value={`${meses(c.quant.indicadores.runwayMeses)} meses`}
        answer={c.quant.indicadores.burnRate > 0
          ? `Seu caixa cobre ${meses(c.quant.indicadores.runwayMeses)} meses no burn atual de ${formatBRL(c.quant.indicadores.burnRate)}/mês.`
          : "A operação gera caixa — runway saudável."} />
    ),
  },
  {
    id: "burn_rate", label: "Burn rate", categoria: "Caixa",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="trending-up" label="Burn rate"
        value={c.quant.indicadores.burnRate > 0 ? <BRL value={c.quant.indicadores.burnRate} /> : "—"}
        answer={c.quant.indicadores.burnRate > 0 ? "Consumo líquido de caixa por mês." : "A operação está gerando caixa."} />
    ),
  },
  {
    id: "liquidez_corrente", label: "Liquidez corrente", categoria: "Caixa",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="activity" label="Liquidez corrente" tone={c.quant.indicadores.liquidezCorrente < 1 ? NEG : c.quant.indicadores.liquidezCorrente < 1.5 ? WARN : POS}
        value={c.quant.indicadores.liquidezCorrente.toFixed(2)}
        answer={c.quant.indicadores.liquidezCorrente >= 1 ? "Você consegue cobrir as obrigações de curto prazo." : "Obrigações de curto prazo acima dos ativos líquidos."} />
    ),
  },
  /* ---- Receita ---- */
  {
    id: "receita_recorrente", label: "Receita recorrente", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="repeat" label="Receita recorrente"
        value={pctTxt(c.quant.indicadores.receitaRecorrente)}
        answer={`${pctTxt(c.quant.indicadores.receitaRecorrente)} da sua receita é previsível/recorrente.`} />
    ),
  },
  {
    id: "crescimento_mom", label: "Crescimento (MoM)", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="trending-up" label="Crescimento (MoM)" tone={c.quant.indicadores.crescimentoMensal < 0 ? NEG : POS}
        value={`${c.quant.indicadores.crescimentoMensal >= 0 ? "+" : ""}${pctTxt(c.quant.indicadores.crescimentoMensal)}`}
        answer="Variação da receita vs o mês anterior." />
    ),
  },
  {
    id: "ticket_medio", label: "Ticket médio", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="credit-card" label="Ticket médio" value={<BRL value={c.quant.indicadores.ticketMedio} />}
        answer="Valor médio por venda no período analisado." />
    ),
  },
  /* ---- Despesas ---- */
  {
    id: "inadimplencia_pct", label: "Inadimplência", categoria: "Despesas",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="gauge" label="Inadimplência" tone={c.quant.indicadores.inadimplencia > 0.15 ? NEG : c.quant.indicadores.inadimplencia > 0.05 ? WARN : POS}
        value={pctTxt(c.quant.indicadores.inadimplencia)}
        answer={`${pctTxt(c.quant.indicadores.inadimplencia)} dos recebíveis estão vencidos.`} />
    ),
  },
  /* ---- Cobrança ---- */
  {
    id: "carteira_score", label: "Saúde da carteira", categoria: "Cobrança",
    render: (c) => !c.inad ? <Loading /> : (
      <MetricCard icon="gauge" label="Saúde da carteira" tone={scoreTone(c.inad.resumo.scoreCarteira)}
        value={`${c.inad.resumo.scoreCarteira}/100`}
        answer={`${c.inad.resumo.clientesCriticos} cliente(s) crítico(s); inadimplência esperada de ${formatBRL(c.inad.resumo.inadimplenciaEsperada)}.`} />
    ),
  },
  {
    id: "exposicao_vencida", label: "Exposição vencida", categoria: "Cobrança",
    render: (c) => !c.inad ? <Loading /> : (
      <MetricCard icon="triangle-alert" label="Exposição vencida" tone={c.inad.resumo.exposicaoVencida > 0 ? NEG : POS}
        value={<BRL value={c.inad.resumo.exposicaoVencida} />}
        answer="Total a receber já vencido — priorize a cobrança." />
    ),
  },
  /* ---- Risco / Radares ---- */
  {
    id: "radar_concentracao", label: "Radar de concentração", categoria: "Radares all4pay",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="target" label="Radar de concentração" tone={c.quant.indicadores.concentracaoReceita > 0.4 ? WARN : POS}
        value={pctTxt(c.quant.indicadores.concentracaoReceita)}
        answer={`Seu maior cliente representa ${pctTxt(c.quant.indicadores.concentracaoReceita)} da receita${c.quant.indicadores.concentracaoReceita > 0.4 ? " — dependência alta." : "."}`} />
    ),
  },
  {
    id: "radar_bancario", label: "Radar bancário", categoria: "Radares all4pay",
    render: (c) => {
      const e = exposicaoBancaria(c.accounts);
      if (!e) return <Loading />;
      return (
        <MetricCard icon="building" label="Radar bancário" tone={e.share > 0.7 ? WARN : POS}
          value={pctTxt(e.share)}
          answer={`${pctTxt(e.share)} do seu caixa está em um único banco${e.share > 0.7 ? " — considere diluir." : "."}`} />
      );
    },
  },
  {
    id: "radar_anomalias", label: "Radar de anomalias", categoria: "Radares all4pay",
    render: (c) => !c.exec ? <Loading /> : (
      <MetricCard icon="triangle-alert" label="Radar de anomalias" tone={c.exec.anomalias.length ? WARN : POS}
        value={`${c.exec.anomalias.length}`}
        answer={c.exec.anomalias.length ? `Detectamos ${c.exec.anomalias.length} pagamento(s)/lançamento(s) fora do padrão.` : "Nenhuma anomalia detectada."} />
    ),
  },
  {
    id: "radar_oportunidades", label: "Radar de oportunidades", categoria: "Radares all4pay",
    render: (c) => {
      const rec = c.decisao?.recomendacoes ?? [];
      if (!c.decisao) return <Loading />;
      const top = rec[0];
      return (
        <MetricCard icon="sparkles" label="Radar de oportunidades" tone={POS}
          value={top ? `${rec.length} ação(ões)` : "—"}
          answer={top ? `${top.titulo} — ${top.descricao}` : "Sem oportunidades de melhoria relevantes agora."} />
      );
    },
  },
];

export const CATALOG_BY_ID = new Map(COCKPIT_CATALOG.map((w) => [w.id, w]));
