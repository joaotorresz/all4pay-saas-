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
  /* ============ Novos widgets: quant (score/receita/benchmark) + inad (carteira) ============ */
  /* ---- Resumo executivo (tendência do score · quant) ---- */
  {
    id: "tendencia-score", label: "Tendência da saúde", categoria: "Resumo executivo",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="trending-up" label="Tendência da saúde"
        tone={c.quant.score.tendencia === "melhorando" ? POS : c.quant.score.tendencia === "piorando" ? NEG : WARN}
        value={c.quant.score.tendencia === "melhorando" ? "Melhorando" : c.quant.score.tendencia === "piorando" ? "Piorando" : "Estável"}
        answer={c.quant.score.tendencia === "melhorando"
          ? "O score de saúde financeira vem subindo nos últimos meses."
          : c.quant.score.tendencia === "piorando"
            ? "O score de saúde financeira vem caindo — atenção."
            : "O score de saúde financeira se mantém estável."}
        info={{ titulo: "Tendência da saúde", oQue: "Para onde a saúde financeira está caminhando: melhorando, estável ou piorando.", comoCalcula: "Compara o score de saúde mês a mês e classifica a direção da evolução recente." }} />
    ),
  },
  /* ---- Receita (receita mensal média · quant) ---- */
  {
    id: "receita-mensal-media", label: "Receita mensal média", categoria: "Receita",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="trending-up" label="Receita mensal média"
        tone={c.quant.indicadores.receitaMensal > 0 ? POS : WARN}
        value={<BRL value={c.quant.indicadores.receitaMensal} />}
        answer="Receita média que a operação gera por mês no período analisado."
        info={{ titulo: "Receita mensal média", oQue: "Quanto a empresa fatura, em média, a cada mês.", comoCalcula: "Média mensal das entradas de receita ao longo do período analisado." }} />
    ),
  },
  /* ---- Despesas (despesa mensal média · quant) ---- */
  {
    id: "despesa-mensal-media", label: "Despesa mensal média", categoria: "Despesas",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="credit-card" label="Despesa mensal média"
        tone={c.quant.indicadores.despesaMensal > c.quant.indicadores.receitaMensal ? NEG : POS}
        value={<BRL value={c.quant.indicadores.despesaMensal} />}
        answer={c.quant.indicadores.despesaMensal > c.quant.indicadores.receitaMensal
          ? "As despesas médias superam a receita média — operação no vermelho."
          : "Despesa média mensal dentro da receita gerada."}
        info={{ titulo: "Despesa mensal média", oQue: "Quanto a empresa gasta, em média, a cada mês.", comoCalcula: "Média mensal das saídas ao longo do período analisado." }} />
    ),
  },
  /* ---- Caixa (previsibilidade do fluxo · quant) ---- */
  {
    id: "previsibilidade-fluxo", label: "Previsibilidade do fluxo", categoria: "Caixa",
    render: (c) => !c.quant ? <Loading /> : (
      <MetricCard icon="activity" label="Previsibilidade do fluxo"
        tone={c.quant.indicadores.volatilidadeNivel === "alta_previsibilidade" ? POS : c.quant.indicadores.volatilidadeNivel === "moderada" ? WARN : NEG}
        value={c.quant.indicadores.volatilidadeNivel === "alta_previsibilidade" ? "Alta" : c.quant.indicadores.volatilidadeNivel === "moderada" ? "Moderada" : "Baixa"}
        answer={c.quant.indicadores.volatilidadeNivel === "alta_previsibilidade"
          ? "Fluxo de caixa estável — fácil de planejar."
          : c.quant.indicadores.volatilidadeNivel === "moderada"
            ? "Fluxo de caixa com oscilação moderada."
            : "Fluxo de caixa muito volátil — difícil de prever."}
        info={{ titulo: "Previsibilidade do fluxo", oQue: "O quanto o fluxo de caixa é previsível para planejar o mês.", comoCalcula: "Classifica a volatilidade do fluxo mensal (coeficiente de variação) em alta, moderada ou baixa previsibilidade." }} />
    ),
  },
  /* ---- Radares (benchmark de margem vs setor · quant) ---- */
  {
    id: "benchmark-margem", label: "Margem vs setor", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.quant) return <Loading />;
      const linha = c.quant.benchmark.find((b) => b.metrica === "Margem operacional");
      if (!linha) return (
        <MetricCard icon="gauge" label="Margem vs setor" value="—"
          answer="Sem referência setorial de margem no momento."
          info={{ titulo: "Margem vs setor", oQue: "Como a sua margem operacional se compara à mediana do setor.", comoCalcula: "Compara a margem operacional da empresa com a mediana de referência do setor." }} />
      );
      return (
        <MetricCard icon="gauge" label="Margem vs setor"
          tone={linha.acima ? POS : NEG}
          value={`${linha.empresa >= 0 ? "+" : ""}${pctTxt(linha.empresa)}`}
          answer={`Sua margem ${linha.acima ? "supera" : "está abaixo"} da mediana do setor (${pctTxt(linha.setor)}).`}
          info={{ titulo: "Margem vs setor", oQue: "Como a sua margem operacional se compara à mediana do setor.", comoCalcula: "Compara a margem operacional da empresa com a mediana de referência do setor e indica se está acima." }} />
      );
    },
  },
  /* ---- Radares (benchmark de crescimento vs setor · quant) ---- */
  {
    id: "benchmark-crescimento", label: "Crescimento vs setor", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.quant) return <Loading />;
      const linha = c.quant.benchmark.find((b) => b.metrica === "Crescimento mensal");
      if (!linha) return (
        <MetricCard icon="trending-up" label="Crescimento vs setor" value="—"
          answer="Sem referência setorial de crescimento no momento."
          info={{ titulo: "Crescimento vs setor", oQue: "Como o seu crescimento mensal se compara à mediana do setor.", comoCalcula: "Compara o crescimento mensal da receita com a mediana de referência do setor." }} />
      );
      return (
        <MetricCard icon="trending-up" label="Crescimento vs setor"
          tone={linha.acima ? POS : NEG}
          value={`${linha.empresa >= 0 ? "+" : ""}${pctTxt(linha.empresa)}`}
          answer={`Seu crescimento ${linha.acima ? "supera" : "está abaixo"} da mediana do setor (${pctTxt(linha.setor)}).`}
          info={{ titulo: "Crescimento vs setor", oQue: "Como o seu crescimento mensal se compara à mediana do setor.", comoCalcula: "Compara o crescimento mensal da receita com a mediana de referência do setor e indica se está acima." }} />
      );
    },
  },
  /* ---- Cobrança (perda esperada · inad) ---- */
  {
    id: "perda-esperada-inad", label: "Perda esperada por inadimplência", categoria: "Cobrança",
    render: (c) => !c.inad ? <Loading /> : (
      <MetricCard icon="triangle-alert" label="Perda esperada por inadimplência"
        tone={c.inad.resumo.inadimplenciaEsperada > 0 ? WARN : POS}
        value={<BRL value={c.inad.resumo.inadimplenciaEsperada} />}
        answer={c.inad.resumo.exposicaoTotal > 0
          ? `Perda projetada da carteira — ${pctTxt(c.inad.resumo.inadimplenciaEsperada / c.inad.resumo.exposicaoTotal)} do total em aberto.`
          : "Sem exposição em aberto para projetar perda."}
        info={{ titulo: "Perda esperada por inadimplência", oQue: "Quanto da carteira deve virar perda por inadimplência.", comoCalcula: "Soma, para cada cliente, o valor em aberto multiplicado pela sua probabilidade de inadimplência." }} />
    ),
  },
  /* ---- Cobrança (clientes de alto risco · inad) ---- */
  {
    id: "clientes-alto-risco", label: "Clientes de alto risco", categoria: "Cobrança",
    render: (c) => {
      if (!c.inad) return <Loading />;
      const n = c.inad.resumo.clientesCriticos + c.inad.resumo.clientesAlto;
      return (
        <MetricCard icon="target" label="Clientes de alto risco"
          tone={n > 0 ? NEG : POS}
          value={`${n}`}
          answer={n > 0
            ? `${c.inad.resumo.clientesCriticos} crítico(s) e ${c.inad.resumo.clientesAlto} de risco alto na carteira.`
            : "Nenhum cliente classificado como risco alto ou crítico."}
          info={{ titulo: "Clientes de alto risco", oQue: "Quantos clientes estão classificados como risco alto ou crítico de crédito.", comoCalcula: "Soma os clientes das classificações alto e crítico do motor de inadimplência." }} />
      );
    },
  },
  /* ---- Cobrança (bons pagadores · inad segmentos) ---- */
  {
    id: "bons-pagadores", label: "Bons pagadores", categoria: "Cobrança",
    render: (c) => {
      if (!c.inad) return <Loading />;
      const seg = c.inad.segmentos.find((s) => s.segmento === "bom_pagador");
      const n = seg?.clientes ?? 0;
      const total = c.inad.resumo.totalClientes;
      return (
        <MetricCard icon="users" label="Bons pagadores"
          tone={POS}
          value={`${n}`}
          answer={total > 0
            ? `${pctTxt(total ? n / total : 0)} da carteira são bons pagadores${seg ? ` (${formatBRL(seg.exposicao)} em aberto)` : ""}.`
            : "Nenhum cliente na carteira ainda."}
          info={{ titulo: "Bons pagadores", oQue: "Quantos clientes têm bom histórico de pagamento.", comoCalcula: "Segmenta a carteira pelo comportamento e conta os clientes classificados como bons pagadores." }} />
      );
    },
  },
  /* ---- Cobrança (cliente de maior risco · inad clientes) ---- */
  {
    id: "cliente-maior-risco", label: "Cliente de maior risco", categoria: "Cobrança",
    render: (c) => {
      if (!c.inad) return <Loading />;
      const top = c.inad.clientes[0];
      if (!top) return (
        <MetricCard icon="triangle-alert" label="Cliente de maior risco" value="—"
          answer="Nenhum cliente com recebível em aberto na carteira."
          info={{ titulo: "Cliente de maior risco", oQue: "O cliente com o maior score de risco de crédito na carteira.", comoCalcula: "Ordena os clientes pelo score de risco e destaca o de maior risco." }} />
      );
      return (
        <MetricCard icon="triangle-alert" label="Cliente de maior risco"
          tone={top.score >= 70 ? NEG : top.score >= 45 ? WARN : POS}
          value={top.nome}
          answer={`Score de risco ${top.score}/100 · ${pctTxt(top.probabilidadeInadimplencia)} de prob. de inadimplência · ${formatBRL(top.features.volumeAberto)} em aberto.`}
          info={{ titulo: "Cliente de maior risco", oQue: "O cliente com o maior score de risco de crédito na carteira.", comoCalcula: "Ordena os clientes pelo score de risco (comportamento de pagamento) e destaca o de maior risco." }} />
      );
    },
  },
  /* ---- Radares (early warnings da carteira · inad clientes) ---- */
  {
    id: "early-warnings-carteira", label: "Alertas antecipados", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.inad) return <Loading />;
      const n = c.inad.clientes.filter((cl) => cl.earlyWarning.ativo).length;
      return (
        <MetricCard icon="triangle-alert" label="Alertas antecipados"
          tone={n > 0 ? WARN : POS}
          value={`${n}`}
          answer={n > 0
            ? `${n} cliente(s) mostram sinais de stress antes do vencimento — aja cedo.`
            : "Nenhum cliente com sinal de deterioração antecipada."}
          info={{ titulo: "Alertas antecipados", oQue: "Quantos clientes mostram sinais de stress antes de deixar de pagar.", comoCalcula: "Conta os clientes cujo motor de early-warning detectou deterioração de comportamento (atraso subindo, queda de ticket)." }} />
      );
    },
  },
  /* ---- Cobrança (chance de recuperação dos vencidos · inad clientes) ---- */
  {
    id: "recuperacao-vencidos", label: "Chance de recuperação", categoria: "Cobrança",
    render: (c) => {
      if (!c.inad) return <Loading />;
      const vencidos = c.inad.clientes.filter((cl) => cl.features.volumeVencido > 0);
      if (!vencidos.length) return (
        <MetricCard icon="repeat" label="Chance de recuperação" tone={POS} value="—"
          answer="Sem valores vencidos para recuperar."
          info={{ titulo: "Chance de recuperação", oQue: "A probabilidade média de recuperar os valores já vencidos.", comoCalcula: "Média da chance de recuperação estimada para os clientes com valores vencidos, ponderada pelo motor de recovery." }} />
      );
      const media = vencidos.reduce((s, cl) => s + cl.recovery.chanceRecuperacao, 0) / vencidos.length;
      return (
        <MetricCard icon="repeat" label="Chance de recuperação"
          tone={media >= 0.6 ? POS : media >= 0.3 ? WARN : NEG}
          value={pctTxt(media)}
          answer={`Probabilidade média de recuperar o vencido em ${vencidos.length} cliente(s).`}
          info={{ titulo: "Chance de recuperação", oQue: "A probabilidade média de recuperar os valores já vencidos.", comoCalcula: "Média da chance de recuperação estimada pelo motor de recovery para os clientes com valores vencidos." }} />
      );
    },
  },
  /* ============ Novos widgets executivos: risco (scoreRiscoCaixa) + exec (centroInteligencia) ============ */
  /* ---- Caixa (runway 3 cenários · risco) ---- */
  {
    id: "runway-pessimista", label: "Fôlego no pior cenário", categoria: "Caixa",
    render: (c) => {
      if (!c.risco) return <Loading />;
      const r = c.risco.runway;
      const pess = Math.max(0, r.pessimista);
      return (
        <MetricCard icon="trending-up" label="Fôlego no pior cenário"
          tone={pess < 30 ? NEG : pess < 90 ? WARN : POS}
          value={`${pess} dias`}
          answer={`No cenário pessimista o caixa dura ${pess} dias (base ${Math.max(0, r.base)} · otimista ${Math.max(0, r.otimista)}).`}
          info={{ titulo: "Fôlego no pior cenário", oQue: "Por quantos dias o caixa aguenta no cenário mais adverso.", comoCalcula: "O motor de risco projeta o caixa diário em 3 cenários (otimista, base, pessimista) e conta os dias até faltar no pessimista." }} />
      );
    },
  },
  /* ---- Caixa (dia da ruptura no cenário base · risco) ---- */
  {
    id: "ruptura-dia-risco", label: "Dias até a ruptura (risco)", categoria: "Caixa",
    render: (c) => {
      if (!c.risco) return <Loading />;
      const dia = c.risco.rupturaDia;
      return (
        <MetricCard icon="calendar" label="Dias até a ruptura (risco)"
          tone={dia == null ? POS : dia < 30 ? NEG : WARN}
          value={dia == null ? "Sem ruptura" : `${dia} dias`}
          answer={dia == null
            ? "O caixa não fica negativo no horizonte projetado pelo motor de risco."
            : `No cenário base, o caixa fica negativo em cerca de ${dia} dias.`}
          info={{ titulo: "Dias até a ruptura (risco)", oQue: "Em quantos dias o caixa deve cruzar o zero no cenário base do motor de risco.", comoCalcula: "Primeiro dia em que a projeção de liquidez diária do motor de risco de caixa fica negativa no cenário base." }} />
      );
    },
  },
  /* ---- Radares (pior teste de stress · risco) ---- */
  {
    id: "pior-stress-test", label: "Pior teste de stress", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.risco) return <Loading />;
      const st = c.risco.stress;
      if (!st.length) return (
        <MetricCard icon="triangle-alert" label="Pior teste de stress" value="—"
          answer="Sem cenários de stress relevantes no momento."
          info={{ titulo: "Pior teste de stress", oQue: "O choque que mais derruba o caixa entre os testes simulados.", comoCalcula: "Simula choques (queda de receita, atraso, alta de despesa) e mede o impacto no saldo ao fim do horizonte." }} />
      );
      const pior = st.slice().sort((a, b) => a.impactoSaldo - b.impactoSaldo)[0];
      return (
        <MetricCard icon="triangle-alert" label="Pior teste de stress"
          tone={pior.impactoSaldo < 0 ? NEG : WARN}
          value={<BRL value={pior.impactoSaldo} />}
          answer={`${pior.label}: impacto de ${formatBRL(pior.impactoSaldo)} no saldo, runway cairia para ${pior.runwayDias} dias.`}
          info={{ titulo: "Pior teste de stress", oQue: "O choque que mais derruba o caixa entre os testes simulados.", comoCalcula: "Simula choques (queda de receita, atraso de recebimento, alta de despesa) e destaca o de maior impacto negativo no saldo." }} />
      );
    },
  },
  /* ---- Radares (concentração HHI de clientes · risco) ---- */
  {
    id: "hhi-clientes-risco", label: "Concentração de clientes (HHI)", categoria: "Radares all4pay",
    render: (c) => {
      if (!c.risco) return <Loading />;
      const conc = c.risco.concentracao;
      const top = conc.top[0];
      return (
        <MetricCard icon="target" label="Concentração de clientes (HHI)"
          tone={conc.hhi > 2500 ? NEG : conc.hhi > 1500 ? WARN : POS}
          value={`${Math.round(conc.hhi)}`}
          answer={conc.hhi > 2500
            ? `Carteira muito concentrada${top ? ` — ${top.name} responde por ${pctTxt(top.share)} da receita.` : "."}`
            : `Concentração ${conc.hhi > 1500 ? "moderada" : "saudável"}${top ? ` — maior cliente com ${pctTxt(top.share)}.` : "."}`}
          info={{ titulo: "Concentração de clientes (HHI)", oQue: "Mede o quanto a receita está concentrada em poucos clientes.", comoCalcula: "Índice de Herfindahl-Hirschman das fatias de receita por cliente (0 a 10000). Acima de 2500 indica concentração alta." }} />
      );
    },
  },
  /* ---- Cobrança (clientes em atraso · risco) ---- */
  {
    id: "clientes-em-atraso-risco", label: "Clientes em atraso", categoria: "Cobrança",
    render: (c) => {
      if (!c.risco) return <Loading />;
      const inad = c.risco.inadimplencia;
      return (
        <MetricCard icon="users" label="Clientes em atraso"
          tone={inad.clientesEmAtraso > 0 ? WARN : POS}
          value={`${inad.clientesEmAtraso}`}
          answer={inad.clientesEmAtraso > 0
            ? `${inad.clientesEmAtraso} cliente(s) com pagamento vencido — ${formatBRL(inad.overdueAmount)} em atraso.`
            : "Nenhum cliente com pagamento em atraso agora."}
          info={{ titulo: "Clientes em atraso", oQue: "Quantos clientes têm recebíveis vencidos e não pagos.", comoCalcula: "Conta as contrapartes com pelo menos um recebível vencido em aberto no motor de risco de caixa." }} />
      );
    },
  },
  /* ---- Inteligência (alertas críticos do motor de risco) ---- */
  {
    id: "alertas-criticos-risco", label: "Alertas do motor de risco", categoria: "Inteligência",
    render: (c) => {
      if (!c.risco) return <Loading />;
      const alertas = c.risco.alertas;
      const criticos = alertas.filter((a) => a.nivel === "critico").length;
      const atencao = alertas.filter((a) => a.nivel === "atencao").length;
      const top = alertas.slice().sort((a, b) =>
        (a.nivel === "critico" ? 0 : a.nivel === "atencao" ? 1 : 2) -
        (b.nivel === "critico" ? 0 : b.nivel === "atencao" ? 1 : 2))[0];
      return (
        <MetricCard icon="triangle-alert" label="Alertas do motor de risco"
          tone={criticos > 0 ? NEG : atencao > 0 ? WARN : POS}
          value={`${alertas.length}`}
          answer={alertas.length
            ? `${criticos} crítico(s) · ${atencao} de atenção. ${top ? top.titulo : ""}`
            : "Nenhum alerta de risco de caixa no momento."}
          info={{ titulo: "Alertas do motor de risco", oQue: "Quantos alertas de risco de caixa estão ativos e o mais grave deles.", comoCalcula: "Conta os alertas gerados pelo motor de risco (crítico, atenção, informativo) e destaca o de maior severidade." }} />
      );
    },
  },
  /* ---- Resumo executivo (pilar mais fraco do score de risco) ---- */
  {
    id: "pilar-mais-fraco", label: "Pilar mais frágil", categoria: "Resumo executivo",
    render: (c) => {
      if (!c.risco) return <Loading />;
      const comp = c.risco.componentes;
      if (!comp.length) return (
        <MetricCard icon="gauge" label="Pilar mais frágil" value="—"
          answer="Sem pilares de risco avaliados no momento."
          info={{ titulo: "Pilar mais frágil", oQue: "Qual dimensão do score de risco de caixa está pior avaliada.", comoCalcula: "Ordena os pilares do score de risco pela nota e destaca o de menor pontuação." }} />
      );
      const pior = comp.slice().sort((a, b) => a.score - b.score)[0];
      return (
        <MetricCard icon="gauge" label="Pilar mais frágil"
          tone={scoreTone(pior.score)}
          value={pior.label}
          answer={`${pior.score}/100 · ${pior.detalhe}`}
          info={{ titulo: "Pilar mais frágil", oQue: "Qual dimensão do score de risco de caixa está pior avaliada.", comoCalcula: "O score de risco combina 8 pilares (liquidez, previsibilidade, concentração, burn...); este destaca o de menor nota." }} />
      );
    },
  },
  /* ---- Inteligência (impacto financeiro dos insights · exec) ---- */
  {
    id: "impacto-insights-exec", label: "Impacto dos insights", categoria: "Inteligência",
    render: (c) => {
      if (!c.exec) return <Loading />;
      const insights = c.exec.insights;
      const totalReais = insights.reduce((s, i) => s + Math.abs(i.impactoCentavos), 0) / 100;
      return (
        <MetricCard icon="sparkles" label="Impacto dos insights"
          tone={insights.length ? WARN : POS}
          value={<BRL value={totalReais} />}
          answer={insights.length
            ? `${insights.length} insight(s) da IA somam ${formatBRL(totalReais)} em impacto financeiro estimado.`
            : "Nenhum insight com impacto financeiro relevante agora."}
          info={{ titulo: "Impacto dos insights", oQue: "O tamanho financeiro somado dos pontos que a IA levantou.", comoCalcula: "Soma o impacto estimado (em reais) de todos os insights priorizados pela IA executiva." }} />
      );
    },
  },
  /* ---- Inteligência (oportunidades do briefing · exec) ---- */
  {
    id: "oportunidades-briefing", label: "Oportunidades do dia", categoria: "Inteligência",
    render: (c) => {
      if (!c.exec) return <Loading />;
      const ops = c.exec.briefing.oportunidades;
      return (
        <MetricCard icon="sparkles" label="Oportunidades do dia"
          tone={POS}
          value={`${ops.length}`}
          answer={ops.length ? ops[0] : "Nenhuma oportunidade destacada no briefing de hoje."}
          info={{ titulo: "Oportunidades do dia", oQue: "As oportunidades que a IA destacou no briefing executivo de hoje.", comoCalcula: "Conta e mostra as oportunidades identificadas pelo briefing executivo a partir dos motores financeiros." }} />
      );
    },
  },
  /* ---- Inteligência (próximas ações do briefing · exec) ---- */
  {
    id: "acoes-briefing", label: "Ações recomendadas", categoria: "Inteligência",
    render: (c) => {
      if (!c.exec) return <Loading />;
      const acoes = c.exec.briefing.acoes;
      const risco = c.exec.briefing.riscoRuptura;
      return (
        <MetricCard icon="activity" label="Ações recomendadas"
          tone={risco === "elevado" ? NEG : risco === "moderado" ? WARN : POS}
          value={`${acoes.length}`}
          answer={acoes.length
            ? `${acoes[0]} (risco de ruptura ${risco}).`
            : `Nenhuma ação pendente hoje (risco de ruptura ${risco}).`}
          info={{ titulo: "Ações recomendadas", oQue: "O que a IA sugere fazer hoje, no briefing executivo.", comoCalcula: "Lista as ações que o briefing executivo recomenda com base no risco de ruptura e nos alertas do dia." }} />
      );
    },
  },
  /* ---- Despesas (maior anomalia detectada · exec) ---- */
  {
    id: "maior-anomalia-exec", label: "Maior anomalia detectada", categoria: "Despesas",
    render: (c) => {
      if (!c.exec) return <Loading />;
      const anomalias = c.exec.anomalias;
      if (!anomalias.length) return (
        <MetricCard icon="triangle-alert" label="Maior anomalia detectada" tone={POS} value="—"
          answer="Nenhuma anomalia de despesa detectada."
          info={{ titulo: "Maior anomalia detectada", oQue: "O lançamento mais fora do padrão identificado pela IA.", comoCalcula: "Compara cada despesa com o histórico da categoria e destaca o desvio de maior valor." }} />
      );
      const maior = anomalias.slice().sort((a, b) => b.valor - a.valor)[0];
      return (
        <MetricCard icon="triangle-alert" label="Maior anomalia detectada"
          tone={/crit|alta/i.test(maior.severidade) ? NEG : WARN}
          value={<BRL value={maior.valor} />}
          answer={`${maior.titulo} — ${maior.descricao}`}
          info={{ titulo: "Maior anomalia detectada", oQue: "O lançamento mais fora do padrão identificado pela IA.", comoCalcula: "Compara cada despesa com o histórico da categoria (z-score) e destaca a anomalia de maior valor." }} />
      );
    },
  },
  /* ---- Cobrança (clientes de risco no contexto executivo · exec) ---- */
  {
    id: "clientes-risco-exec", label: "Clientes de risco (contexto)", categoria: "Cobrança",
    render: (c) => {
      if (!c.exec) return <Loading />;
      const cli = c.exec.context.clientesRisco;
      const exposicao = cli.reduce((s, x) => s + x.exposicao, 0);
      const top = cli.slice().sort((a, b) => b.score - a.score)[0];
      return (
        <MetricCard icon="target" label="Clientes de risco (contexto)"
          tone={cli.length ? NEG : POS}
          value={`${cli.length}`}
          answer={cli.length
            ? `${formatBRL(exposicao)} em exposição${top ? ` — ${top.nome} lidera o risco (score ${top.score}).` : "."}`
            : "Nenhum cliente de risco no contexto executivo."}
          info={{ titulo: "Clientes de risco (contexto)", oQue: "Os clientes de maior risco que a IA carrega no contexto de decisão.", comoCalcula: "Lista os clientes marcados como de risco pelo context builder da IA e soma a exposição em aberto deles." }} />
      );
    },
  },
];

export const CATALOG_BY_ID = new Map(COCKPIT_CATALOG.map((w) => [w.id, w]));
