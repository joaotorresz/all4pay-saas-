"use client";

import * as React from "react";
import { Card, Skeleton, Icon, BRL, type InfoConteudo } from "@/components/ui";
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

function MetricCard({ label, value, answer, tone, icon, info }: {
  label: string;
  value: React.ReactNode;
  answer?: string;
  tone?: string;
  icon?: string;
  info?: InfoConteudo;
}) {
  return (
    <Card className="flex flex-col gap-2" info={info}>
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
        <span className="text-caption font-medium text-faint tracking-wide">Prioridade do dia · IA</span>
        {prioridades.length === 0 ? (
          <span className="text-caption text-muted">Nada crítico hoje — operação sob controle.</span>
        ) : (
          prioridades.map((p) => (
            <div key={p.id} className="flex items-start gap-2">
              <span className="w-[6px] h-[6px] rounded-pill mt-[6px] shrink-0" style={{ background: /crit|alta/i.test(p.severidade) ? NEG : WARN }} />
              <span className="text-[16px] text-ink">{p.titulo}<span className="text-muted"> — {p.recomendacoes?.[0] ?? p.descricao}</span></span>
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
        answer={`Saúde ${c.quant.score.classificacao}. Liquidez ${c.quant.indicadores.liquidezCorrente.toFixed(2)} · prob. de ruptura ${pctTxt(c.quant.score.probabilidadeRuptura)} em 90d.`}
        info={{ titulo: "Financial Health Score", oQue: "Resume a saúde financeira da empresa num único número de 0 a 100.", comoCalcula: "Pondera liquidez, runway, inadimplência, margem, volatilidade, concentração e crescimento." }} />
    ),
  },
  {
    id: "empresa_risco", label: "Empresa em risco?", categoria: "Resumo executivo",
    render: (c) => !c.risco ? <Loading /> : (
      <MetricCard icon="gauge" label="Empresa em risco?" tone={scoreTone(c.risco.score)}
        value={c.risco.nivel === "baixo" ? "🟢 Saudável" : c.risco.nivel === "medio" ? "🟡 Atenção" : "🔴 Risco"}
        answer={`Chance de ruptura de caixa em 60 dias: ${pctTxt(c.risco.probabilidadeRuptura)}.`}
        info={{ titulo: "Empresa em risco?", oQue: "Sinaliza, num semáforo, se o caixa corre risco no curto prazo.", comoCalcula: "Deriva do score de risco de caixa e da probabilidade de ruptura projetada em 60 dias." }} />
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
          : "A operação gera caixa — runway saudável."}
        info={{ titulo: "Fôlego de caixa", oQue: "Por quantos meses o caixa atual aguenta no ritmo de gasto de hoje.", comoCalcula: "Saldo de caixa dividido pelo burn rate (consumo líquido mensal)." }} />
    ),
  },
  {
    id: "burn_rate", label: "Burn rate", categoria: "Caixa",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="trending-up" label="Burn rate"
        value={c.quant.indicadores.burnRate > 0 ? <BRL value={c.quant.indicadores.burnRate} /> : "—"}
        answer={c.quant.indicadores.burnRate > 0 ? "Consumo líquido de caixa por mês." : "A operação está gerando caixa."}
        info={{ titulo: "Burn rate", oQue: "Quanto de caixa a empresa queima, em média, por mês.", comoCalcula: "Saídas menos entradas operacionais médias no período. Zero quando a operação gera caixa." }} />
    ),
  },
  {
    id: "liquidez_corrente", label: "Liquidez corrente", categoria: "Caixa",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="activity" label="Liquidez corrente" tone={c.quant.indicadores.liquidezCorrente < 1 ? NEG : c.quant.indicadores.liquidezCorrente < 1.5 ? WARN : POS}
        value={c.quant.indicadores.liquidezCorrente.toFixed(2)}
        answer={c.quant.indicadores.liquidezCorrente >= 1 ? "Você consegue cobrir as obrigações de curto prazo." : "Obrigações de curto prazo acima dos ativos líquidos."}
        info={{ titulo: "Liquidez corrente", oQue: "Mostra se os ativos de curto prazo cobrem as obrigações de curto prazo.", comoCalcula: "Ativos líquidos divididos pelas obrigações de curto prazo. Acima de 1 é confortável." }} />
    ),
  },
  /* ---- Receita ---- */
  {
    id: "receita_recorrente", label: "Receita recorrente", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="repeat" label="Receita recorrente"
        value={pctTxt(c.quant.indicadores.receitaRecorrente)}
        answer={`${pctTxt(c.quant.indicadores.receitaRecorrente)} da sua receita é previsível/recorrente.`}
        info={{ titulo: "Receita recorrente", oQue: "Quanto da receita é previsível, vindo de contratos e cobranças recorrentes.", comoCalcula: "Parcela da receita identificada como recorrente sobre a receita total do período." }} />
    ),
  },
  {
    id: "crescimento_mom", label: "Crescimento (MoM)", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="trending-up" label="Crescimento (MoM)" tone={c.quant.indicadores.crescimentoMensal < 0 ? NEG : POS}
        value={`${c.quant.indicadores.crescimentoMensal >= 0 ? "+" : ""}${pctTxt(c.quant.indicadores.crescimentoMensal)}`}
        answer="Variação da receita vs o mês anterior."
        info={{ titulo: "Crescimento (MoM)", oQue: "O ritmo de crescimento da receita de um mês para o outro.", comoCalcula: "Variação percentual da receita do mês atual contra o mês anterior." }} />
    ),
  },
  {
    id: "ticket_medio", label: "Ticket médio", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="credit-card" label="Ticket médio" value={<BRL value={c.quant.indicadores.ticketMedio} />}
        answer="Valor médio por venda no período analisado."
        info={{ titulo: "Ticket médio", oQue: "Quanto vale, em média, cada venda.", comoCalcula: "Receita total dividida pelo número de vendas no período." }} />
    ),
  },
  /* ---- Despesas ---- */
  {
    id: "inadimplencia_pct", label: "Inadimplência", categoria: "Despesas",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="gauge" label="Inadimplência" tone={c.quant.indicadores.inadimplencia > 0.15 ? NEG : c.quant.indicadores.inadimplencia > 0.05 ? WARN : POS}
        value={pctTxt(c.quant.indicadores.inadimplencia)}
        answer={`${pctTxt(c.quant.indicadores.inadimplencia)} dos recebíveis estão vencidos.`}
        info={{ titulo: "Inadimplência", oQue: "A fatia dos recebíveis que já passou do vencimento sem pagamento.", comoCalcula: "Total a receber vencido dividido pelo total a receber." }} />
    ),
  },
  /* ---- Cobrança ---- */
  {
    id: "carteira_score", label: "Saúde da carteira", categoria: "Cobrança",
    render: (c) => !c.inad ? <Loading /> : (
      <MetricCard icon="gauge" label="Saúde da carteira" tone={scoreTone(c.inad.resumo.scoreCarteira)}
        value={`${c.inad.resumo.scoreCarteira}/100`}
        answer={`${c.inad.resumo.clientesCriticos} cliente(s) crítico(s); inadimplência esperada de ${formatBRL(c.inad.resumo.inadimplenciaEsperada)}.`}
        info={{ titulo: "Saúde da carteira", oQue: "Avalia o risco de crédito do conjunto de clientes que devem à empresa.", comoCalcula: "Score ponderado pelo comportamento de pagamento de cada cliente da carteira." }} />
    ),
  },
  {
    id: "exposicao_vencida", label: "Exposição vencida", categoria: "Cobrança",
    render: (c) => !c.inad ? <Loading /> : (
      <MetricCard icon="triangle-alert" label="Exposição vencida" tone={c.inad.resumo.exposicaoVencida > 0 ? NEG : POS}
        value={<BRL value={c.inad.resumo.exposicaoVencida} />}
        answer="Total a receber já vencido — priorize a cobrança."
        info={{ titulo: "Exposição vencida", oQue: "Quanto dinheiro a receber já está vencido e aguardando cobrança.", comoCalcula: "Soma dos recebíveis com vencimento no passado ainda não pagos." }} />
    ),
  },
  /* ---- Risco / Radares ---- */
  {
    id: "radar_concentracao", label: "Radar de concentração", categoria: "Radares all4pay",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="target" label="Radar de concentração" tone={c.quant.indicadores.concentracaoReceita > 0.4 ? WARN : POS}
        value={pctTxt(c.quant.indicadores.concentracaoReceita)}
        answer={`Seu maior cliente representa ${pctTxt(c.quant.indicadores.concentracaoReceita)} da receita${c.quant.indicadores.concentracaoReceita > 0.4 ? " — dependência alta." : "."}`}
        info={{ titulo: "Radar de concentração", oQue: "Mostra se a receita depende demais de um único cliente.", comoCalcula: "Fatia da receita total que vem do maior cliente. Acima de 40% vira alerta." }} />
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
          answer={`${pctTxt(e.share)} do seu caixa está em um único banco${e.share > 0.7 ? " — considere diluir." : "."}`}
          info={{ titulo: "Radar bancário", oQue: "Mostra se o caixa está concentrado demais em um único banco.", comoCalcula: "Fatia do saldo total que está no banco com maior posição. Acima de 70% sugere diluir." }} />
      );
    },
  },
  {
    id: "radar_anomalias", label: "Radar de anomalias", categoria: "Radares all4pay",
    render: (c) => !c.exec ? <Loading /> : (
      <MetricCard icon="triangle-alert" label="Radar de anomalias" tone={c.exec.anomalias.length ? WARN : POS}
        value={`${c.exec.anomalias.length}`}
        answer={c.exec.anomalias.length ? `Detectamos ${c.exec.anomalias.length} pagamento(s)/lançamento(s) fora do padrão.` : "Nenhuma anomalia detectada."}
        info={{ titulo: "Radar de anomalias", oQue: "Aponta lançamentos fora do padrão, como gasto anormal ou duplicidade.", comoCalcula: "Compara cada despesa com o histórico da categoria e sinaliza desvios e pagamentos atípicos." }} />
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
          answer={top ? `${top.titulo} — ${top.descricao}` : "Sem oportunidades de melhoria relevantes agora."}
          info={{ titulo: "Radar de oportunidades", oQue: "Sugere ações que melhoram o caixa, como antecipar recebíveis ou renegociar.", comoCalcula: "O motor de decisão simula cada ação e mede o impacto real no runway e no score." }} />
      );
    },
  },
  /* ============ Novos widgets executivos ============ */
  /* ---- Resumo executivo ---- */
  {
    id: "prob-ruptura-90d", label: "Prob. de ruptura (90d)", categoria: "Resumo executivo",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="triangle-alert" label="Prob. de ruptura (90d)"
        tone={c.quant.score.probabilidadeRuptura > 0.3 ? NEG : c.quant.score.probabilidadeRuptura > 0.1 ? WARN : POS}
        value={pctTxt(c.quant.score.probabilidadeRuptura)}
        answer={`Chance de o caixa ficar negativo nos próximos 90 dias: ${pctTxt(c.quant.score.probabilidadeRuptura)}.`}
        info={{ titulo: "Prob. de ruptura (90d)", oQue: "A probabilidade de o caixa faltar dentro de 90 dias.", comoCalcula: "Sai do score de saúde financeira, que projeta o caixa e mede o risco de ruptura em 90 dias." }} />
    ),
  },
  {
    id: "eficiencia-operacional", label: "Eficiência operacional", categoria: "Resumo executivo",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="activity" label="Eficiência operacional"
        tone={c.quant.indicadores.eficienciaOperacional >= 6 ? POS : c.quant.indicadores.eficienciaOperacional >= 3 ? WARN : NEG}
        value={`${c.quant.indicadores.eficienciaOperacional.toFixed(1)}/10`}
        answer="Quanto de receita a operação gera para cada real de custo."
        info={{ titulo: "Eficiência operacional", oQue: "Mede o quão bem a empresa converte custos em receita, de 0 a 10.", comoCalcula: "Receita média sobre os custos operacionais do período, reescalada para uma nota de 0 a 10." }} />
    ),
  },
  {
    id: "roic-proxy", label: "ROIC (proxy)", categoria: "Resumo executivo",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="trending-up" label="ROIC (proxy)"
        tone={c.quant.indicadores.roic > 0 ? POS : NEG}
        value={`${c.quant.indicadores.roic >= 0 ? "+" : ""}${pctTxt(c.quant.indicadores.roic)}`}
        answer="Retorno aproximado sobre o capital empregado na operação."
        info={{ titulo: "ROIC (proxy)", oQue: "Estima o retorno gerado sobre o capital investido na operação.", comoCalcula: "Lucro operacional anualizado dividido pelo capital empregado. É uma aproximação a partir dos lançamentos." }} />
    ),
  },
  /* ---- Caixa ---- */
  {
    id: "volatilidade-fluxo", label: "Volatilidade do fluxo", categoria: "Caixa",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="activity" label="Volatilidade do fluxo"
        tone={c.quant.indicadores.volatilidadeFluxo > 0.5 ? NEG : c.quant.indicadores.volatilidadeFluxo > 0.25 ? WARN : POS}
        value={pctTxt(c.quant.indicadores.volatilidadeFluxo)}
        answer={c.quant.indicadores.volatilidadeFluxo > 0.5 ? "Seu fluxo de caixa oscila muito — mais difícil de prever." : "Fluxo de caixa estável e previsível."}
        info={{ titulo: "Volatilidade do fluxo", oQue: "O quanto o fluxo de caixa varia de um período para o outro.", comoCalcula: "Coeficiente de variação do fluxo mensal (desvio padrão sobre a média). Quanto maior, mais instável." }} />
    ),
  },
  {
    id: "burn-multiple", label: "Burn multiple", categoria: "Caixa",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="trending-up" label="Burn multiple"
        tone={c.quant.indicadores.burnMultiple <= 0 ? POS : c.quant.indicadores.burnMultiple > 3 ? NEG : WARN}
        value={c.quant.indicadores.burnMultiple <= 0 ? "—" : `${meses(c.quant.indicadores.burnMultiple)}x`}
        answer={c.quant.indicadores.burnMultiple <= 0 ? "A operação gera caixa — sem queima." : "Quanto de caixa você queima para cada real de nova receita."}
        info={{ titulo: "Burn multiple", oQue: "Quanto de caixa a empresa queima para gerar cada real de receita nova.", comoCalcula: "Queima líquida de caixa dividida pela nova receita do período. Abaixo de 1x é eficiente." }} />
    ),
  },
  /* ---- Receita ---- */
  {
    id: "margem-liquida", label: "Margem líquida", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="gauge" label="Margem líquida"
        tone={c.quant.indicadores.margemLiquida > 0.1 ? POS : c.quant.indicadores.margemLiquida > 0 ? WARN : NEG}
        value={`${c.quant.indicadores.margemLiquida >= 0 ? "+" : ""}${pctTxt(c.quant.indicadores.margemLiquida)}`}
        answer="Quanto sobra de cada real de receita depois de todos os custos e perdas."
        info={{ titulo: "Margem líquida", oQue: "A fatia da receita que vira lucro depois de custos, despesas e inadimplência.", comoCalcula: "Resultado líquido mensal, já descontada a perda por inadimplência, sobre a receita mensal." }} />
    ),
  },
  {
    id: "margem-operacional", label: "Margem operacional", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="gauge" label="Margem operacional"
        tone={c.quant.indicadores.margemOperacional > 0.15 ? POS : c.quant.indicadores.margemOperacional > 0 ? WARN : NEG}
        value={`${c.quant.indicadores.margemOperacional >= 0 ? "+" : ""}${pctTxt(c.quant.indicadores.margemOperacional)}`}
        answer="Quanto a operação gera de resultado antes de perdas por inadimplência."
        info={{ titulo: "Margem operacional", oQue: "O resultado da operação como fatia da receita, antes de perdas de crédito.", comoCalcula: "Resultado operacional mensal (entradas menos saídas operacionais) sobre a receita mensal." }} />
    ),
  },
  {
    id: "qualidade-receita", label: "Qualidade da receita", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="activity" label="Qualidade da receita"
        tone={scoreTone(c.quant.indicadores.qualidadeReceita)}
        value={`${Math.round(c.quant.indicadores.qualidadeReceita)}/100`}
        answer="O quão previsível, recorrente e diversificada é a sua receita."
        info={{ titulo: "Qualidade da receita", oQue: "Avalia se a receita é confiável: recorrente, estável e sem depender de poucos clientes.", comoCalcula: "Combina recorrência, baixa volatilidade e baixa concentração de clientes numa nota de 0 a 100." }} />
    ),
  },
  {
    id: "sazonalidade", label: "Sazonalidade", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="repeat" label="Sazonalidade"
        tone={c.quant.indicadores.sazonalidade > 0.4 ? WARN : POS}
        value={pctTxt(c.quant.indicadores.sazonalidade)}
        answer={c.quant.indicadores.sazonalidade > 0.4 ? "Sua receita tem picos e vales fortes ao longo do ano." : "Receita distribuída de forma estável ao longo do ano."}
        info={{ titulo: "Sazonalidade", oQue: "O quanto a receita concentra picos e quedas em certos períodos do ano.", comoCalcula: "Amplitude do índice sazonal da receita mensal. Quanto maior, mais a receita depende da época." }} />
    ),
  },
  /* ---- Cobrança ---- */
  {
    id: "exposicao-total", label: "Exposição total em aberto", categoria: "Cobrança",
    render: (c) => !c.inad ? <Loading /> : (
      <MetricCard icon="credit-card" label="Exposição total em aberto"
        value={<BRL value={c.inad.resumo.exposicaoTotal} />}
        answer={`Total a receber de clientes; ${formatBRL(c.inad.resumo.exposicaoVencida)} já vencido.`}
        info={{ titulo: "Exposição total em aberto", oQue: "Quanto a empresa tem a receber de clientes, vencido ou a vencer.", comoCalcula: "Soma de todos os recebíveis em aberto na carteira de clientes." }} />
    ),
  },
  {
    id: "clientes-ativos", label: "Clientes na carteira", categoria: "Cobrança",
    render: (c) => !c.inad ? <Loading /> : (
      <MetricCard icon="target" label="Clientes na carteira"
        tone={c.inad.resumo.clientesCriticos > 0 ? WARN : POS}
        value={`${c.inad.resumo.totalClientes}`}
        answer={c.inad.resumo.clientesCriticos > 0 ? `${c.inad.resumo.clientesCriticos} em situação crítica de crédito.` : "Nenhum cliente em situação crítica de crédito."}
        info={{ titulo: "Clientes na carteira", oQue: "Quantos clientes têm recebíveis em aberto e como está o risco deles.", comoCalcula: "Número de clientes com saldo a receber; destaca quantos estão classificados como crítico." }} />
    ),
  },
  {
    id: "receita-media-cliente", label: "Receita média por cliente", categoria: "Cobrança",
    render: (c) => !c.inad ? <Loading /> : (
      <MetricCard icon="credit-card" label="Receita média por cliente"
        value={<BRL value={c.inad.resumo.totalClientes > 0 ? c.inad.resumo.exposicaoTotal / c.inad.resumo.totalClientes : 0} />}
        answer="Valor médio em aberto por cliente da carteira."
        info={{ titulo: "Receita média por cliente", oQue: "Quanto, em média, cada cliente tem em aberto com a empresa.", comoCalcula: "Exposição total em aberto dividida pelo número de clientes na carteira." }} />
    ),
  },
  /* ---- Radares ---- */
  {
    id: "radar-dependencia-cliente", label: "Dependência de clientes", categoria: "Radares all4pay",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="target" label="Dependência de clientes"
        tone={c.quant.indicadores.dependenciaCliente > 0.6 ? WARN : POS}
        value={pctTxt(c.quant.indicadores.dependenciaCliente)}
        answer={`Seus 2 maiores clientes somam ${pctTxt(c.quant.indicadores.dependenciaCliente)} da receita${c.quant.indicadores.dependenciaCliente > 0.6 ? " — dependência alta." : "."}`}
        info={{ titulo: "Dependência de clientes", oQue: "Mostra o quanto a receita depende dos dois maiores clientes juntos.", comoCalcula: "Fatia da receita total que vem dos dois maiores clientes. Acima de 60% acende alerta." }} />
    ),
  },
  {
    id: "radar-projecao-score", label: "Projeção de score (cenário)", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.quant) return <Loading />;
      const cen = c.quant.cenarios[0];
      if (!cen) return (
        <MetricCard icon="gauge" label="Projeção de score (cenário)" value="—"
          answer="Sem cenário preditivo relevante no momento."
          info={{ titulo: "Projeção de score (cenário)", oQue: "Como a saúde financeira reagiria a um choque simulado.", comoCalcula: "O motor projeta o score sob cenários de choque de receita, despesa e inadimplência." }} />
      );
      return (
        <MetricCard icon="gauge" label="Projeção de score (cenário)"
          tone={cen.delta < 0 ? NEG : POS}
          value={`${cen.scoreProjetado}/100`}
          answer={`${cen.label}: score iria para ${cen.scoreProjetado} (${cen.delta >= 0 ? "+" : ""}${cen.delta}) em ${cen.emDias}d.`}
          info={{ titulo: "Projeção de score (cenário)", oQue: "Como a saúde financeira reagiria ao cenário de choque mais relevante.", comoCalcula: "O motor recalcula o score aplicando o choque simulado e mostra a variação e o prazo." }} />
      );
    },
  },
  {
    id: "radar-insight-critico", label: "Insight crítico do dia", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.exec) return <Loading />;
      const top = c.exec.insights[0];
      return (
        <MetricCard icon="sparkles" label="Insight crítico do dia"
          tone={top ? (/crit|alta/i.test(top.severidade) ? NEG : WARN) : POS}
          value={top ? top.titulo : "Tudo sob controle"}
          answer={top ? (top.recomendacoes?.[0] ?? top.descricao) : "Nenhum ponto crítico priorizado pela IA hoje."}
          info={{ titulo: "Insight crítico do dia", oQue: "O ponto mais importante que a IA priorizou para você agir hoje.", comoCalcula: "A IA ordena os insights por impacto, urgência e probabilidade e destaca o de maior prioridade." }} />
      );
    },
  },
  {
    id: "radar-forecast-30d", label: "Forecast de caixa", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.exec) return <Loading />;
      const pressao = c.exec.forecast.janelaPressao;
      return (
        <MetricCard icon="trending-up" label="Forecast de caixa"
          tone={pressao ? WARN : POS}
          value={pressao ? "Pressão à vista" : "Sem pressão"}
          answer={pressao ? pressao.texto : c.exec.forecast.texto}
          info={{ titulo: "Forecast de caixa", oQue: "A projeção de caixa e se há uma janela de aperto pela frente.", comoCalcula: "Média móvel ponderada ajustada por sazonalidade projeta o fluxo e sinaliza janelas de pressão de caixa." }} />
      );
    },
  },
  /* ============ Novos widgets: decisão · contas · lançamentos ============ */
  /* ---- Caixa (contas bancárias) ---- */
  {
    id: "caixa-consolidado", label: "Caixa consolidado", categoria: "Caixa",
    render: (c) => {
      const contas = c.accounts;
      if (!contas) return <Loading />;
      const total = contas.reduce((s, a) => s + a.balance, 0);
      return (
        <MetricCard icon="building" label="Caixa consolidado"
          tone={total < 0 ? NEG : POS}
          value={<BRL value={total} />}
          answer={`Saldo somado das ${contas.length} conta(s) bancária(s) da empresa.`}
          info={{ titulo: "Caixa consolidado", oQue: "O saldo total disponível somando todas as contas bancárias.", comoCalcula: "Soma o saldo atual de cada conta financeira cadastrada." }} />
      );
    },
  },
  {
    id: "contas-bancarias", label: "Contas bancárias", categoria: "Caixa",
    render: (c) => {
      const contas = c.accounts;
      if (!contas) return <Loading />;
      const positivas = contas.filter((a) => a.balance > 0).length;
      return (
        <MetricCard icon="layers" label="Contas bancárias"
          value={`${contas.length}`}
          answer={contas.length ? `${positivas} conta(s) com saldo positivo hoje.` : "Nenhuma conta bancária cadastrada ainda."}
          info={{ titulo: "Contas bancárias", oQue: "Quantas contas bancárias a empresa mantém.", comoCalcula: "Conta o número de contas financeiras cadastradas e quantas têm saldo positivo." }} />
      );
    },
  },
  {
    id: "maior-conta", label: "Maior conta", categoria: "Caixa",
    render: (c) => {
      const contas = c.accounts;
      if (!contas) return <Loading />;
      if (!contas.length) return (
        <MetricCard icon="building" label="Maior conta" value="—"
          answer="Nenhuma conta bancária cadastrada ainda."
          info={{ titulo: "Maior conta", oQue: "A conta bancária que concentra o maior saldo.", comoCalcula: "Ordena as contas pelo saldo e destaca a de maior valor." }} />
      );
      const top = contas.slice().sort((a, b) => b.balance - a.balance)[0];
      return (
        <MetricCard icon="building" label="Maior conta"
          value={<BRL value={top.balance} />}
          answer={`${top.name} concentra o maior saldo entre as suas contas.`}
          info={{ titulo: "Maior conta", oQue: "A conta bancária que concentra o maior saldo.", comoCalcula: "Ordena as contas pelo saldo e destaca a de maior valor." }} />
      );
    },
  },
  /* ---- Caixa (Monte Carlo · decisão) ---- */
  {
    id: "prob-caixa-negativo", label: "Risco de caixa negativo", categoria: "Caixa",
    render: (c) => {
      if (!c.decisao) return <Loading />;
      const p = c.decisao.previsao.probabilidadeNegativo;
      return (
        <MetricCard icon="triangle-alert" label="Risco de caixa negativo"
          tone={p > 0.3 ? NEG : p > 0.1 ? WARN : POS}
          value={pctTxt(p)}
          answer={c.decisao.previsao.semanaProvavel
            ? `${pctTxt(p)} de chance de o caixa ficar negativo — provável na ${c.decisao.previsao.semanaProvavel}.`
            : `${pctTxt(p)} de chance de o caixa ficar negativo no horizonte projetado.`}
          info={{ titulo: "Risco de caixa negativo", oQue: "A chance de o caixa cruzar o zero dentro do horizonte projetado.", comoCalcula: "Simulação de Monte Carlo do caixa diário (deriva e volatilidade) conta em quantos cenários o saldo fica negativo." }} />
      );
    },
  },
  {
    id: "caixa-projetado-p50", label: "Caixa projetado (mediana)", categoria: "Caixa",
    render: (c) => {
      if (!c.decisao) return <Loading />;
      const p50 = c.decisao.previsao.caixaFinalP50;
      return (
        <MetricCard icon="trending-up" label="Caixa projetado (mediana)"
          tone={p50 < 0 ? NEG : POS}
          value={<BRL value={p50} />}
          answer={`Saldo mais provável ao fim de ${c.decisao.previsao.horizonteDias} dias (cenário mediano).`}
          info={{ titulo: "Caixa projetado (mediana)", oQue: "O saldo de caixa mais provável ao fim do horizonte de projeção.", comoCalcula: "Cenário mediano (p50) da simulação de Monte Carlo do caixa diário." }} />
      );
    },
  },
  {
    id: "caixa-pessimista-p10", label: "Caixa no pior cenário", categoria: "Caixa",
    render: (c) => {
      if (!c.decisao) return <Loading />;
      const p10 = c.decisao.previsao.caixaFinalP10;
      return (
        <MetricCard icon="triangle-alert" label="Caixa no pior cenário"
          tone={p10 < 0 ? NEG : WARN}
          value={<BRL value={p10} />}
          answer={`Saldo em ${c.decisao.previsao.horizonteDias} dias no cenário pessimista (p10).`}
          info={{ titulo: "Caixa no pior cenário", oQue: "O saldo de caixa no cenário ruim ao fim do horizonte.", comoCalcula: "Cenário pessimista (p10) da simulação de Monte Carlo: só 10% dos casos terminam abaixo dele." }} />
      );
    },
  },
  {
    id: "data-provavel-ruptura", label: "Data provável de aperto", categoria: "Caixa",
    render: (c) => {
      if (!c.decisao) return <Loading />;
      const dia = c.decisao.previsao.diaProvavelNegativo;
      return (
        <MetricCard icon="calendar" label="Data provável de aperto"
          tone={dia != null ? NEG : POS}
          value={dia != null ? `${dia} dias` : "Sem aperto"}
          answer={dia != null
            ? `O caixa deve ficar negativo em cerca de ${dia} dias, se nada mudar.`
            : "Nenhuma data de caixa negativo prevista no horizonte."}
          info={{ titulo: "Data provável de aperto", oQue: "Em quantos dias o caixa deve ficar negativo, se nada mudar.", comoCalcula: "Primeiro dia em que a simulação de Monte Carlo cruza o zero no cenário mais provável." }} />
      );
    },
  },
  /* ---- Resumo executivo (matriz de risco · decisão) ---- */
  {
    id: "prob-stress-90d", label: "Prob. de stress (90d)", categoria: "Resumo executivo",
    render: (c) => {
      if (!c.decisao) return <Loading />;
      const p = c.decisao.risco.probabilidadeStress;
      return (
        <MetricCard icon="gauge" label="Prob. de stress (90d)"
          tone={p > 0.3 ? NEG : p > 0.1 ? WARN : POS}
          value={pctTxt(p)}
          answer={`Risco geral (${c.decisao.risco.nivelGeral}): ${pctTxt(p)} de chance de stress financeiro em 90 dias.`}
          info={{ titulo: "Prob. de stress (90d)", oQue: "A probabilidade agregada de a empresa entrar em stress financeiro em 90 dias.", comoCalcula: "Combina 8 dimensões de risco (caixa, liquidez, inadimplência, concentração, fornecedor, operacional, sazonal, crescimento) numa probabilidade ponderada." }} />
      );
    },
  },
  {
    id: "dimensao-risco-critica", label: "Maior risco agora", categoria: "Resumo executivo",
    render: (c) => {
      if (!c.decisao) return <Loading />;
      const dims = c.decisao.risco.dimensoes;
      if (!dims.length) return (
        <MetricCard icon="target" label="Maior risco agora" value="—"
          answer="Sem dimensões de risco relevantes no momento."
          info={{ titulo: "Maior risco agora", oQue: "Qual das dimensões de risco está mais crítica hoje.", comoCalcula: "Ordena as 8 dimensões da matriz de risco pela probabilidade e destaca a maior." }} />
      );
      const top = dims.slice().sort((a, b) => b.probabilidade - a.probabilidade)[0];
      return (
        <MetricCard icon="target" label="Maior risco agora"
          tone={top.probabilidade > 0.3 ? NEG : top.probabilidade > 0.1 ? WARN : POS}
          value={top.label}
          answer={`${top.fator} (${pctTxt(top.probabilidade)} de probabilidade).`}
          info={{ titulo: "Maior risco agora", oQue: "Qual das dimensões de risco está mais crítica hoje.", comoCalcula: "Ordena as 8 dimensões da matriz de risco pela probabilidade e destaca a de maior peso." }} />
      );
    },
  },
  /* ---- Radares (recomendações e plano autônomo · decisão) ---- */
  {
    id: "impacto-melhor-acao", label: "Impacto da melhor ação", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.decisao) return <Loading />;
      const rec = c.decisao.recomendacoes[0];
      if (!rec) return (
        <MetricCard icon="sparkles" label="Impacto da melhor ação" value="—"
          answer="Nenhuma ação com impacto relevante no caixa agora."
          info={{ titulo: "Impacto da melhor ação", oQue: "Quanto de fôlego de caixa a ação mais recomendada geraria.", comoCalcula: "O motor de decisão simula cada ação e mede o ganho de runway em dias." }} />
      );
      const dias = Math.round(rec.deltaRunwayDias);
      return (
        <MetricCard icon="sparkles" label="Impacto da melhor ação"
          tone={dias > 0 ? POS : WARN}
          value={dias > 0 ? `+${dias} dias` : `${rec.deltaScore >= 0 ? "+" : ""}${rec.deltaScore} pts`}
          answer={`${rec.titulo}: ${dias > 0 ? `+${dias} dias de fôlego` : `${rec.deltaScore >= 0 ? "+" : ""}${rec.deltaScore} no score`} (${formatBRL(rec.valorEnvolvido)} envolvidos).`}
          info={{ titulo: "Impacto da melhor ação", oQue: "Quanto de fôlego de caixa a ação mais recomendada geraria.", comoCalcula: "O motor de decisão constrói o cenário com a ação aplicada e re-roda o score, medindo o ganho de runway em dias." }} />
      );
    },
  },
  {
    id: "plano-autonomo-status", label: "Plano autônomo", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.decisao) return <Loading />;
      const plano = c.decisao.plano;
      const n = plano.acoes.length;
      return (
        <MetricCard icon="activity" label="Plano autônomo"
          tone={plano.ativo ? (plano.severidade === "critico" || plano.severidade === "alto" ? NEG : WARN) : POS}
          value={plano.ativo ? `${n} ação(ões)` : "Em espera"}
          answer={plano.ativo ? plano.resumo : "Nenhuma resposta coordenada necessária no momento."}
          info={{ titulo: "Plano autônomo", oQue: "O plano de resposta coordenado que a IA prepara quando o risco sobe.", comoCalcula: "A partir da matriz de risco, o motor monta ações com guardrails (automático, proposto ou requer aprovação)." }} />
      );
    },
  },
  /* ---- Receita / Operação (lançamentos · input) ---- */
  {
    id: "movimentos-mes", label: "Movimentos no mês", categoria: "Operação",
    render: (c) => {
      if (!c.input) return <Loading />;
      const prefixo = c.input.hoje.slice(0, 7);
      const n = c.input.movements.filter((m) => (m.paid_date ?? m.due_date).slice(0, 7) === prefixo).length;
      return (
        <MetricCard icon="repeat" label="Movimentos no mês"
          value={`${n}`}
          answer="Lançamentos de entrada e saída registrados no mês atual."
          info={{ titulo: "Movimentos no mês", oQue: "Quantos lançamentos financeiros aconteceram no mês corrente.", comoCalcula: "Conta os movimentos cuja data (pagamento, ou vencimento se em aberto) cai no mês atual." }} />
      );
    },
  },
  {
    id: "contrapartes-distintas", label: "Contrapartes ativas", categoria: "Operação",
    render: (c) => {
      if (!c.input) return <Loading />;
      const ids = new Set<string>();
      for (const m of c.input.movements) { if (m.party_id) ids.add(m.party_id); }
      return (
        <MetricCard icon="users" label="Contrapartes ativas"
          value={`${ids.size}`}
          answer="Clientes e fornecedores distintos com movimentação registrada."
          info={{ titulo: "Contrapartes ativas", oQue: "Quantos clientes e fornecedores diferentes têm lançamentos no sistema.", comoCalcula: "Conta os identificadores de contraparte distintos entre todos os movimentos." }} />
      );
    },
  },
  {
    id: "ticket-medio-movimento", label: "Valor médio por lançamento", categoria: "Operação",
    render: (c) => {
      if (!c.input) return <Loading />;
      const movs = c.input.movements;
      const media = movs.length ? movs.reduce((s, m) => s + m.amount, 0) / movs.length : 0;
      return (
        <MetricCard icon="credit-card" label="Valor médio por lançamento"
          value={<BRL value={media} />}
          answer="Valor médio de cada movimento financeiro registrado."
          info={{ titulo: "Valor médio por lançamento", oQue: "Quanto vale, em média, cada lançamento de entrada ou saída.", comoCalcula: "Soma o valor de todos os movimentos e divide pela quantidade de lançamentos." }} />
      );
    },
  },
];

export const CATALOG_BY_ID = new Map(COCKPIT_CATALOG.map((w) => [w.id, w]));
