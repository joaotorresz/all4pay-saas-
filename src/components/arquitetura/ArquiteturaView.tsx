"use client";

import * as React from "react";
import {
  ComposedChart,
  Area,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { BRL, Card, Skeleton, Icon, Button, InfoHint } from "@/components/ui";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { useArquitetura } from "@/components/visao-geral/hooks";
import { simularResiliencia, type ResultadoResiliencia, type PassoResiliencia } from "@/core/reliability";
import type { TreasuryCoreResult } from "@/core/treasury";
import type { ArquiteturaReport } from "@/core/architecture";

const STATUS_PASSO: Record<PassoResiliencia["status"], string> = {
  ok: "var(--color-positive)",
  retry: "var(--color-warning)",
  curto_circuito: "var(--color-negative)",
  dlq: "var(--color-negative)",
  lock: "var(--color-text-secondary)",
};
const OBS_COR: Record<string, string> = {
  ok: "var(--color-positive)",
  degradado: "var(--color-warning)",
  critico: "var(--color-negative)",
};
const CENARIO = [
  { key: "pix_001" },
  { key: "pix_002", falhar: true },
  { key: "pix_003", falhar: true },
  { key: "pix_004", falhar: true },
  { key: "pix_005" },
  { key: "pix_001" },
  { key: "pix_006" },
];

export function ArquiteturaView() {
  const { data, isLoading, isError } = useArquitetura();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[200px] lg:col-span-3" rounded="card" />
        <Skeleton className="h-[300px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[300px] lg:col-span-1" rounded="card" />
      </div>
    );
  }
  if (isError || !data) {
    return <Card><p className="text-muted">Não foi possível carregar a arquitetura.</p></Card>;
  }

  const { arq, treasury } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* 10 camadas institucionais */}
      <Card className="lg:col-span-3 flex flex-col gap-3" info={{ titulo: "Arquitetura institucional", oQue: "Mostra as 10 camadas que compõem a infraestrutura financeira e onde cada uma vive no sistema." }}>
        <div className="flex items-center gap-2">
          <Icon name="building" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Arquitetura institucional · 10 camadas</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {arq.camadas.map((c) => (
            <div key={c.id} className="rounded-md border border-border-soft p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[16px] font-medium text-ink">{c.nome}</span>
                <span className="w-2 h-2 rounded-pill" style={{ background: "var(--color-positive)" }} />
              </div>
              <span className="text-caption text-faint">{c.descricao}</span>
              <span className="text-caption text-placeholder">{c.onde}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Serviços distribuídos */}
      <Card className="lg:col-span-2 flex flex-col gap-3" info={{ titulo: "Serviços distribuídos", oQue: "Lista os serviços financeiros da plataforma com a latência e o throughput de cada um." }}>
        <span className="text-label font-medium text-muted">Serviços financeiros distribuídos</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {arq.servicos.map((s) => (
            <div key={s.nome} className="flex items-center gap-3 rounded-md border border-border-soft px-3 py-2">
              <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: "var(--color-positive)" }} />
              <span className="text-[16px] text-ink flex-1 truncate">{s.nome}</span>
              <span className="text-caption text-faint tabular-nums">{s.latenciaMs}ms</span>
              <span className="text-caption text-muted tabular-nums w-[96px] text-right truncate">{s.throughput}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Pipeline realtime */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-label font-medium text-muted inline-flex items-center gap-1">
            Pipeline tempo real
            <InfoHint align="left" oQue="Mostra as etapas que um evento financeiro percorre e quanto tempo leva ponta a ponta." comoCalcula="Soma a latência de cada etapa do pipeline para chegar ao tempo total de processamento." />
          </span>
          <span className="text-caption text-faint tabular-nums">{arq.pipeline.latenciaTotalMs}ms ponta a ponta</span>
        </div>
        <div className="flex flex-col gap-1">
          {arq.pipeline.etapas.map((e, i) => (
            <div key={e.etapa} className="flex items-center gap-2">
              <span className="text-caption text-faint w-[14px] tabular-nums">{i + 1}</span>
              <span className="text-[16px] text-ink flex-1">{e.etapa}</span>
              <div className="h-[5px] rounded-pill bg-surface-2 overflow-hidden w-[70px]">
                <div className="h-full rounded-pill bg-ink" style={{ width: `${(e.latenciaMs / 12) * 100}%` }} />
              </div>
              <span className="text-caption text-faint tabular-nums w-[34px] text-right">{e.latenciaMs}ms</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Treasury Core */}
      <TreasuryCard t={treasury} />

      {/* Reliability console */}
      <ReliabilityCard />

      {/* Observabilidade */}
      <Card className="lg:col-span-2 flex flex-col gap-3" info={{ titulo: "Observability platform", oQue: "Reúne as métricas de saúde da plataforma para acompanhar a operação em tempo real.", comoCalcula: "As métricas vêm do estado do sistema, inclusive do ledger real, sinalizando cada uma como ok, degradado ou crítico." }}>
        <div className="flex items-center gap-2">
          <Icon name="activity" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Observability platform</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
          {arq.observabilidade.map((m) => (
            <div key={m.nome} className="flex flex-col gap-[2px]">
              <span className="text-caption text-faint">{m.nome}</span>
              <span className="inline-flex items-center gap-2 text-[18px] font-medium" style={{ color: OBS_COR[m.status] }}>
                <span className="w-2 h-2 rounded-pill" style={{ background: OBS_COR[m.status] }} />
                {m.valor}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Tenant isolation */}
      <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Multi-tenant institucional", oQue: "Explica como os dados de cada empresa ficam isolados dos demais clientes da plataforma." }}>
        <div className="flex items-center gap-2">
          <Icon name="shield-check" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Multi-tenant institucional</span>
        </div>
        <span className="text-caption text-ink">{arq.tenancy.isolamento}</span>
        <ul className="m-0 pl-4 flex flex-col gap-1">
          {arq.tenancy.itens.map((i, k) => (
            <li key={k} className="text-caption text-muted">{i}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function TreasuryCard({ t }: { t: TreasuryCoreResult }) {
  return (
    <Card className="lg:col-span-2 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-label font-medium text-muted inline-flex items-center gap-1">
          Treasury Core · posição consolidada
          <InfoHint align="left" oQue="Mostra a posição de caixa consolidada por banco, a liquidez por prazo e os cenários de stress da tesouraria." comoCalcula="Soma os saldos das contas, mede a concentração bancária (HHI), projeta a liquidez em janelas e reusa o motor de risco para o stress." />
        </span>
        <span className="text-h3 font-medium tabular-nums text-ink"><BRL value={t.posicaoTotal} /></span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Mini label="Liquidez imediata" value={formatBRLCompact(t.liquidez.imediata)} />
        <Mini label="Curto prazo (30d)" value={formatBRLCompact(t.liquidez.curto30)} tone={t.liquidez.curto30 < t.liquidez.imediata ? "var(--color-warning)" : undefined} />
        <Mini label="Projetada (90d)" value={formatBRLCompact(t.liquidez.projetada90)} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-caption text-faint">Concentração bancária · HHI {Math.round(t.concentracaoBancariaHHI)}</span>
        {t.bancos.map((b) => (
          <div key={b.banco} className="flex flex-col gap-[3px]">
            <div className="flex justify-between text-caption">
              <span className="text-ink">{b.banco}</span>
              <span className="text-muted tabular-nums">{Math.round(b.share * 100)}% · <BRL value={b.saldo} /></span>
            </div>
            <div className="h-[6px] rounded-pill bg-surface-2 overflow-hidden">
              <div className="h-full rounded-pill" style={{ width: `${b.share * 100}%`, background: b.share > 0.6 ? "var(--color-warning)" : "var(--color-ink)" }} />
            </div>
          </div>
        ))}
      </div>

      <div>
        <span className="text-caption text-faint">Cash positioning · 8 semanas</span>
        <div role="img" aria-label="Posição de caixa projetada por semana">
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={t.cashPositioning} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="archGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dcff00" stopOpacity={0.26} />
                  <stop offset="70%" stopColor="#dcff00" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="#dcff00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
              <XAxis dataKey="semana" tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatBRLCompact(v)} />
              <ReferenceLine y={0} stroke="var(--color-border)" />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.03)" }}
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? (
                    <div className="bg-white rounded-card border border-border shadow-popover px-3 py-2 text-caption tabular-nums">
                      <div className="font-medium text-ink mb-1">{label}</div>
                      <div className="text-muted">acum. {formatBRL(payload.find((p: any) => p.dataKey === "acumulado")?.value ?? 0)}</div>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="liquido" radius={[2, 2, 0, 0]}>
                {t.cashPositioning.map((p, i) => (
                  <Cell key={i} fill={p.liquido < 0 ? "var(--color-negative)" : "var(--color-border)"} />
                ))}
              </Bar>
              <Area type="monotone" dataKey="acumulado" stroke="none" fill="url(#archGlow)" isAnimationActive={false} />
              <Line type="monotone" dataKey="acumulado" stroke="var(--color-chart-line)" strokeWidth={1.4} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {t.stress.map((s) => (
          <div key={s.id} className="rounded-md border border-border-soft p-2 flex flex-col gap-[2px]">
            <span className="text-caption font-medium text-ink">{s.label}</span>
            <span className="text-caption tabular-nums" style={{ color: s.impacto < 0 ? "var(--color-negative)" : "var(--color-positive)" }}>
              {s.impacto < 0 ? "−" : "+"}<BRL value={Math.abs(s.impacto)} /> · runway {s.runwayDias >= 999 ? "24+m" : `${(s.runwayDias / 30).toFixed(1)}m`}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReliabilityCard() {
  const [res, setRes] = React.useState<ResultadoResiliencia | null>(null);
  return (
    <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Reliability layer", oQue: "Demonstra como o sistema resiste a um provedor de pagamento instável sem perder nem duplicar dinheiro.", comoCalcula: "Simula um cenário de falhas e mostra o circuit breaker, os retries, a fila de mensagens mortas e a recuperação em ação." }}>
      <span className="text-label font-medium text-muted">Reliability layer</span>
      <span className="text-caption text-faint">
        Circuit breaker, retries, dead-letter queue e locks protegem contra PSP instável — sem duplicar dinheiro.
      </span>
      <Button variant="primary" fullWidth onClick={() => setRes(simularResiliencia(CENARIO))}>
        Rodar cenário de falha
      </Button>

      {res && (
        <>
          <div className="flex gap-4 text-caption">
            <span>Breaker: <span className="font-medium text-ink">{res.estadoFinal}</span></span>
            <span>Liquidados: <span className="font-medium text-positive tabular-nums">{res.processados}</span></span>
            <span>DLQ: <span className="font-medium text-negative tabular-nums">{res.dlq.length}</span></span>
          </div>
          <div className="flex flex-col max-h-[260px] overflow-auto">
            {res.passos.map((p) => (
              <div key={p.ordem} className="flex items-center gap-2 py-1 border-t border-border-soft first:border-t-0">
                <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: STATUS_PASSO[p.status] }} />
                <span className="text-caption text-ink flex-1 truncate">{p.evento}</span>
                <span className="text-caption text-muted truncate max-w-[150px] text-right">{p.acao}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function Mini({ label, value, tone = "var(--color-ink)" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-medium tabular-nums" style={{ color: tone }}>{value}</span>
    </div>
  );
}
