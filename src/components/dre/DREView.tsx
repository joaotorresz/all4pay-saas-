"use client";

import * as React from "react";
import { Card, Skeleton, Icon } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useDRE } from "@/components/visao-geral/hooks";
import { FirstRunCard } from "@/components/visao-geral/FirstRunCard";
import type {
  DRELinha,
  DREClienteLinha,
  DRELinhaReceita,
  DRECentroCusto,
  DREPeriodo,
  DREProjecao,
} from "@/core/dre/types";

type Preset = "mes" | "mes_anterior" | "ytd" | "12m";
type Regime = "competencia" | "caixa";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "mes", label: "Mês atual" },
  { id: "mes_anterior", label: "Mês anterior" },
  { id: "ytd", label: "YTD" },
  { id: "12m", label: "12 meses" },
];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sign = (v: number) => (v < 0 ? "−" : "");

export function DREView() {
  const [preset, setPreset] = React.useState<Preset>("12m");
  const [regime, setRegime] = React.useState<Regime>("competencia");
  const { data, isLoading, isError } = useDRE(preset, regime);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <FirstRunCard />
      {/* Barra de filtros (DRE dinâmico) */}
      <Card className="flex flex-wrap items-center gap-3">
        <span className="text-label font-medium text-muted">Período</span>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`text-caption font-medium rounded-pill px-3 py-1 ${preset === p.id ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="w-px h-5 bg-border-soft mx-1" />
        <span className="text-label font-medium text-muted">Regime</span>
        <div className="flex gap-1">
          {(["competencia", "caixa"] as Regime[]).map((r) => (
            <button
              key={r}
              onClick={() => setRegime(r)}
              className={`text-caption font-medium rounded-pill px-3 py-1 ${regime === r ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}
            >
              {r === "competencia" ? "Competência" : "Caixa"}
            </button>
          ))}
        </div>
      </Card>

      {isLoading || !data ? (
        isError ? (
          <Card><p className="text-muted">Não foi possível montar o DRE.</p></Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Skeleton className="h-[120px] lg:col-span-3" rounded="card" />
            <Skeleton className="h-[360px] lg:col-span-2" rounded="card" />
            <Skeleton className="h-[360px] lg:col-span-1" rounded="card" />
          </div>
        )
      ) : (
        <Conteudo data={data} />
      )}
    </div>
  );
}

function Conteudo({ data }: { data: NonNullable<ReturnType<typeof useDRE>["data"]> }) {
  const { gerencial, financeiro, comparativo, porCliente, porLinha, porCentroCusto, projetado, executivo } = data;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      {/* Executivo */}
      <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-6 gap-5">
        <Stat label="Receita líquida" value={formatBRL(gerencial.receitaLiquida)} />
        <Stat label="EBITDA" value={formatBRL(gerencial.ebitda)} tone={gerencial.ebitda < 0 ? "var(--color-negative)" : "var(--color-ink)"} />
        <Stat label="Margem EBITDA" value={pct(gerencial.margemEbitda)} />
        <Stat label="Lucro líquido" value={formatBRL(gerencial.lucroLiquido)} tone={gerencial.lucroLiquido < 0 ? "var(--color-negative)" : "var(--color-positive)"} />
        <Stat label="Runway" value={`${financeiro.runwayMeses}m`} />
        <Stat label="Caixa" value={formatBRL(executivo.caixa)} />
      </div>

      {/* Comentário do copiloto */}
      <Card className="lg:col-span-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="sparkles" size={14} color="var(--color-on-lime)" />
          </span>
          <span className="text-label font-medium text-muted">Leitura do resultado · copiloto</span>
        </div>
        <p className="m-0 text-body leading-[1.5] text-ink">{executivo.comentario}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pt-1">
          <div>
            {executivo.problemas.map((p, i) => (
              <span key={i} className="flex items-start gap-[6px] text-caption text-muted"><span className="w-[6px] h-[6px] rounded-pill bg-negative mt-[6px]" />{p}</span>
            ))}
          </div>
          <div>
            {executivo.oportunidades.map((o, i) => (
              <span key={i} className="flex items-start gap-[6px] text-caption text-muted"><span className="w-[6px] h-[6px] rounded-pill bg-positive mt-[6px]" />{o}</span>
            ))}
          </div>
        </div>
      </Card>

      {/* DRE Gerencial (waterfall + drill-down) */}
      <Card className="lg:col-span-2 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">DRE gerencial · {data.filtro.periodoLabel} · {data.filtro.regime === "caixa" ? "caixa" : "competência"}</span>
        <div className="flex flex-col">
          {gerencial.linhas.map((l) => <LinhaRow key={l.id} l={l} />)}
        </div>
        <span className="text-caption text-faint pt-1">Clique nas linhas com ▸ para abrir a composição (drill-down).</span>
      </Card>

      {/* Financeiro (caixa) */}
      <Card className="lg:col-span-1 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">DRE financeiro · caixa</span>
        <FinRow label="Recebimentos" v={financeiro.recebimentos} />
        <FinRow label="Pagamentos" v={-financeiro.pagamentos} />
        <FinRow label="Fluxo operacional" v={financeiro.fluxoOperacional} bold />
        <FinRow label="Fluxo financeiro" v={financeiro.fluxoFinanceiro} />
        <FinRow label="Fluxo de investimento" v={financeiro.fluxoInvestimento} />
        <FinRow label="Fluxo de caixa livre" v={financeiro.fluxoLivre} bold />
        <div className="flex justify-between pt-1 border-t border-border-soft text-caption">
          <span className="text-faint">Burn mensal</span>
          <span className="tabular-nums text-ink">{financeiro.burnMensal > 0 ? formatBRL(financeiro.burnMensal) : "—"}</span>
        </div>
      </Card>

      {/* Comparativo */}
      <Card className="lg:col-span-3 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">DRE comparativo</span>
        <Tabela
          head={["Período", "Receita", "EBITDA", "Margem EBITDA", "Lucro"]}
          rows={comparativo.periodos.map((p: DREPeriodo) => [p.label, formatBRL(p.receita), formatBRL(p.ebitda), pct(p.margemEbitda), formatBRL(p.lucro)])}
          alignRight={[1, 2, 3, 4]}
        />
        <span className="text-caption text-faint">
          Variação mês a mês — receita {comparativo.variacaoReceita >= 0 ? "+" : ""}{pct(comparativo.variacaoReceita)} · EBITDA {comparativo.variacaoEbitda >= 0 ? "+" : ""}{pct(comparativo.variacaoEbitda)}
        </span>
      </Card>

      {/* Por linha (produto/unidade) */}
      <Card className="lg:col-span-1 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">Por linha de receita</span>
        {porLinha.map((l: DRELinhaReceita) => (
          <div key={l.linha} className="flex flex-col gap-[3px]">
            <div className="flex justify-between text-caption">
              <span className="text-ink">{l.linha}</span>
              <span className="text-muted tabular-nums">{formatBRL(l.receita)} · {pct(l.margem)}</span>
            </div>
            <div className="h-[5px] rounded-pill bg-surface-2 overflow-hidden">
              <div className="h-full rounded-pill bg-ink" style={{ width: `${Math.max(0, Math.min(100, l.margem * 100))}%` }} />
            </div>
          </div>
        ))}
      </Card>

      {/* Por cliente */}
      <Card className="lg:col-span-2 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">DRE por cliente · top 10</span>
        <Tabela
          head={["Cliente", "Receita", "Share", "Margem", "Risco", "Vencido"]}
          rows={porCliente.map((c: DREClienteLinha) => [c.cliente, formatBRL(c.receita), pct(c.share), pct(c.margem), `${c.risco}`, c.inadimplencia > 0 ? formatBRL(c.inadimplencia) : "—"])}
          alignRight={[1, 2, 3, 4, 5]}
        />
      </Card>

      {/* Por centro de custo */}
      <Card className="lg:col-span-3 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">DRE por centro de custo</span>
        <Tabela
          head={["Centro de custo", "Receita", "Despesa", "Resultado", "Margem"]}
          rows={porCentroCusto.map((c: DRECentroCusto) => [c.centro, formatBRL(c.receita), formatBRL(c.despesa), formatBRL(c.resultado), pct(c.margem)])}
          alignRight={[1, 2, 3, 4]}
        />
        <span className="text-caption text-faint">Reflete o centro de custo escolhido em cada lançamento/venda.</span>
      </Card>

      {/* Projetado */}
      <Card className="lg:col-span-3 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">DRE projetado · receita média × margem atual</span>
        <Tabela
          head={["Horizonte", "Receita projetada", "EBITDA projetado", "Lucro projetado"]}
          rows={projetado.map((p: DREProjecao) => [p.horizonte, formatBRL(p.receita), formatBRL(p.ebitda), formatBRL(p.lucro)])}
          alignRight={[1, 2, 3]}
        />
      </Card>
    </div>
  );
}

function LinhaRow({ l }: { l: DRELinha }) {
  const [open, setOpen] = React.useState(false);
  const sub = l.papel === "subtotal" || l.papel === "resultado";
  const hasDrill = !!l.componentes && l.componentes.length > 0;
  const cor = l.valor < 0 ? "var(--color-negative)" : l.papel === "resultado" ? "var(--color-positive)" : "var(--color-ink)";
  return (
    <>
      <button
        onClick={() => hasDrill && setOpen((v) => !v)}
        className={`flex items-center justify-between py-[7px] border-b border-border-soft text-left ${sub ? "bg-surface-1" : ""}`}
        style={{ cursor: hasDrill ? "pointer" : "default" }}
      >
        <span className={`text-[14px] ${sub ? "font-medium text-ink" : "text-muted"}`}>
          {hasDrill && <span className="text-faint mr-1">{open ? "▾" : "▸"}</span>}
          {l.label}
        </span>
        <span className="flex items-baseline gap-3">
          <span className="text-caption text-faint tabular-nums w-[44px] text-right">{sign(l.pctReceita)}{Math.abs(Math.round(l.pctReceita * 100))}%</span>
          <span className={`text-[14px] tabular-nums font-medium w-[120px] text-right`} style={{ color: cor }}>
            {sign(l.valor)}{formatBRL(Math.abs(l.valor))}
          </span>
        </span>
      </button>
      {open && hasDrill && (
        <div className="pl-5 py-1 bg-surface-1 border-b border-border-soft">
          {l.componentes!.map((c, i) => (
            <div key={i} className="flex justify-between text-caption py-[2px]">
              <span className="text-faint">{c.label}</span>
              <span className="text-muted tabular-nums">{formatBRL(c.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FinRow({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t border-border-soft pt-1" : ""}`}>
      <span className={`text-caption ${bold ? "font-medium text-ink" : "text-muted"}`}>{label}</span>
      <span className="text-caption tabular-nums font-medium" style={{ color: v < 0 ? "var(--color-negative)" : "var(--color-ink)" }}>
        {sign(v)}{formatBRL(Math.abs(v))}
      </span>
    </div>
  );
}

function Stat({ label, value, tone = "var(--color-ink)" }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-label font-medium text-muted">{label}</span>
      <span className="text-h3 font-medium tabular-nums leading-none" style={{ color: tone }}>{value}</span>
    </Card>
  );
}

function Tabela({ head, rows, alignRight = [] }: { head: string[]; rows: string[][]; alignRight?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-caption">
        <thead>
          <tr className="text-faint">
            {head.map((h, i) => (
              <th key={i} className={`font-medium py-2 px-2 ${alignRight.includes(i) ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-border-soft">
              {r.map((c, ci) => (
                <td key={ci} className={`py-2 px-2 tabular-nums ${ci === 0 ? "text-ink" : "text-muted"} ${alignRight.includes(ci) ? "text-right" : "text-left"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
