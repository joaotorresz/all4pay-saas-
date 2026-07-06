"use client";

import * as React from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  LineChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BRL, Card, Skeleton, Icon, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { useMoat } from "@/components/visao-geral/hooks";
import type { BenchmarkLinha, ModelStats } from "@/core/datamoat/types";
import { chartAnim } from "@/lib/chart-anim";

const fmtMetric = (v: number, f: BenchmarkLinha["formato"]) =>
  f === "pct" ? `${Math.round(v * 100)}%` : f === "meses" ? `${v.toFixed(1)}m` : f === "moeda" ? formatBRL(v) : v.toFixed(2);

export function DadosView() {
  const { data, isLoading, isError } = useMoat();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[280px] lg:col-span-1" rounded="card" />
        <Skeleton className="h-[280px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[240px] lg:col-span-3" rounded="card" />
      </div>
    );
  }
  if (isError || !data) {
    return <Card><p className="text-muted">Não foi possível analisar a inteligência de dados.</p></Card>;
  }

  const { dna, benchmark, behavioral, credito, treasury, modelo } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Company DNA */}
      <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "DNA financeiro", oQue: "Resume o perfil da sua empresa em um arquétipo e nos traços que mais a caracterizam.", comoCalcula: "Derivado dos seus indicadores quantitativos, que definem o arquétipo (agressiva, conservadora, sazonal, recorrente) e a assinatura." }}>
        <span className="text-label font-medium text-muted">DNA financeiro</span>
        <div className="flex items-baseline gap-2">
          <span className="text-h3 font-medium text-ink">{dna.arquetipo}</span>
          <span className="text-caption text-faint tabular-nums">{dna.assinatura}</span>
        </div>
        <p className="m-0 text-caption text-muted">{dna.descricao}</p>
        <div role="img" aria-label={`DNA: ${dna.tracos.map((t) => `${t.nome} ${t.valor}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={dna.tracos} outerRadius="72%">
              <PolarGrid stroke="var(--color-border-soft)" />
              <PolarAngleAxis dataKey="nome" tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }} />
              <Radar dataKey="valor" stroke="var(--color-ink)" fill="var(--color-ink)" fillOpacity={0.08} strokeWidth={1.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Self-improving model */}
      <ModeloCard modelo={modelo} />

      {/* Benchmark */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-label font-medium text-muted inline-flex items-center gap-1">
            Benchmark vs setor
            <InfoHint align="left" oQue="Compara os seus números com os das empresas parecidas do mesmo setor." comoCalcula="Calcula o seu percentil e a mediana de cada métrica contra a coorte de pares do seu setor e faixa." />
          </span>
          <span className="text-caption text-faint">{benchmark.setor} · {benchmark.pares} pares</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
          {benchmark.linhas.map((l) => (
            <BenchRow key={l.metrica} l={l} />
          ))}
        </div>
        {isDemo && (
          <span className="text-caption text-faint border-t border-border-soft pt-2">
            Coorte sintética anonimizada — o benchmark cross-tenant real ativa com a base conectada.
          </span>
        )}
      </Card>

      {/* Behavioral + Credit + Treasury */}
      <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Modelo comportamental", oQue: "Estima o desfecho provável da sua empresa com base em quem se parece com você na rede.", comoCalcula: "Usa vizinhança (KNN) aos desfechos históricos da coorte para indicar o padrão e o percentual de pares semelhantes que entraram em stress." }}>
        <span className="text-label font-medium text-muted">Modelo comportamental</span>
        <p className="m-0 text-[16px] text-ink leading-snug">{behavioral.padrao}</p>
        <div className="flex gap-6">
          <div>
            <div className="text-caption text-faint">Desfecho provável</div>
            <div className="text-[18px] font-medium text-ink">{behavioral.desfechoProvavel}</div>
          </div>
          <div>
            <div className="text-caption text-faint">Stress nos pares</div>
            <div className="text-[18px] font-medium tabular-nums" style={{ color: behavioral.shareStress >= 0.4 ? "var(--color-negative)" : "var(--color-positive)" }}>
              {Math.round(behavioral.shareStress * 100)}%
            </div>
          </div>
        </div>
        {behavioral.alerta && (
          <div className="rounded-md p-2 text-caption" style={{ background: "var(--color-surface-2)", color: "var(--color-warning)" }}>
            {behavioral.alerta}
          </div>
        )}
      </Card>

      <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Credit intelligence", oQue: "Indica um limite de crédito recomendado e a chance de inadimplência para a sua empresa.", comoCalcula: "O modelo da rede estima a probabilidade de inadimplência e deriva o limite recomendado e a confiabilidade da estimativa." }}>
        <span className="text-label font-medium text-muted">Credit intelligence</span>
        <div className="flex items-end gap-2">
          <span className="text-value-lg leading-none font-medium tabular-nums text-ink"><BRL value={credito.limiteRecomendado} /></span>
        </div>
        <span className="text-caption text-faint">limite recomendado</span>
        <div className="flex gap-6 pt-1">
          <div>
            <div className="text-caption text-faint">Prob. inadimplência</div>
            <div className="text-[18px] font-medium tabular-nums text-ink">{(credito.probabilidadeInadimplencia * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-caption text-faint">Confiabilidade</div>
            <div className="text-[18px] font-medium text-ink">{credito.confiabilidade}</div>
          </div>
        </div>
      </Card>

      <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Treasury network", oQue: "Antecipa as janelas do ano em que o seu setor costuma sofrer mais pressão de caixa.", comoCalcula: "Cruza a sazonalidade dos pares do setor na rede para apontar os meses de maior stress." }}>
        <div className="flex items-center gap-2">
          <Icon name="network" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Treasury network</span>
        </div>
        <p className="m-0 text-caption text-muted">{treasury.texto}</p>
        <div className="flex flex-wrap gap-2">
          {treasury.mesesStress.map((m) => (
            <span key={m} className="text-caption font-medium text-warning bg-surface-2 rounded-pill px-3 py-1">{m}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ModeloCard({ modelo }: { modelo: ModelStats }) {
  const curva = modelo.curvaAprendizado;
  if (!curva.length) return null; // defensivo: sem curva, oculta só este cartão
  const ult = curva[curva.length - 1];
  const pri = curva[0];
  return (
    <Card className="lg:col-span-2 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="database" size={14} color="var(--color-on-lime)" />
          </span>
          <span className="text-label font-medium text-muted inline-flex items-center gap-1">
            Modelo proprietário · auto-aprendiz
            <InfoHint align="left" oQue="Mostra a precisão do modelo de risco e como ela melhora à medida que mais empresas entram na rede." comoCalcula="Regressão logística treinada na coorte; a curva de aprendizado mostra a acurácia crescendo com o número de empresas." />
          </span>
        </div>
        <div className="flex gap-5">
          <Metric label="Acurácia" value={`${Math.round(modelo.acuracia * 100)}%`} />
          <Metric label="AUC" value={modelo.auc.toFixed(2)} />
          <Metric label="Empresas" value={String(modelo.amostras)} />
        </div>
      </div>

      <div role="img" aria-label={`Curva de aprendizado: de ${Math.round(pri.acuracia * 100)}% com ${pri.n} empresas a ${Math.round(ult.acuracia * 100)}% com ${ult.n}.`}>
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={modelo.curvaAprendizado} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="dadosGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dcff00" stopOpacity={0.28} />
                <stop offset="70%" stopColor="#dcff00" stopOpacity={0.05} />
                <stop offset="100%" stopColor="#dcff00" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
            <XAxis dataKey="n" tick={{ fontSize: 13, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} label={{ value: "nº de empresas", position: "insideBottom", offset: -2, fontSize: 12, fill: "var(--color-text-tertiary)" }} />
            <YAxis domain={[0.6, 1]} tick={{ fontSize: 13, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={38} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip
              cursor={{ stroke: "var(--color-border)" }}
              content={({ active, payload, label }: any) =>
                active && payload?.length ? (
                  <div className="bg-white rounded-card border border-border shadow-popover px-3 py-2 text-caption tabular-nums">
                    {label} empresas · {Math.round(payload[0].value * 100)}%
                  </div>
                ) : null
              }
            />
            <Area type="monotone" dataKey="acuracia" stroke="none" fill="url(#dadosGlow)" {...chartAnim()} />
            <Line type="monotone" dataKey="acuracia" stroke="var(--color-chart-line)" strokeWidth={1.4} dot={{ r: 3, fill: "var(--color-chart-line)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <span className="text-caption text-faint">
        Quanto mais empresas na rede, mais preciso o modelo — de {Math.round(pri.acuracia * 100)}% ({pri.n}) para {Math.round(ult.acuracia * 100)}% ({ult.n}). É o moat de dados.
      </span>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-caption text-faint">{label}</div>
      <div className="text-[18px] font-medium tabular-nums text-ink">{value}</div>
    </div>
  );
}

function BenchRow({ l }: { l: BenchmarkLinha }) {
  const cor = l.melhorAcima ? "var(--color-positive)" : "var(--color-negative)";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[16px] text-ink">{l.metrica}</span>
        <span className="text-caption text-muted tabular-nums">
          <span className="font-medium" style={{ color: cor }}>{fmtMetric(l.empresa, l.formato)}</span> vs {fmtMetric(l.medianaSetor, l.formato)}
        </span>
      </div>
      <div className="h-[6px] rounded-pill bg-surface-2 overflow-hidden relative">
        <div className="h-full rounded-pill" style={{ width: `${l.percentil}%`, background: cor }} />
      </div>
      <span className="text-caption text-faint">percentil {l.percentil} no setor</span>
    </div>
  );
}
