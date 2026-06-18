"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BRL, Card, Skeleton, Select } from "@/components/ui";
import { getRiscoInput } from "@/lib/data";
import { financialDRE, periodoPreset } from "@/core/dre";
import { dreGerencial, movimentosNoPeriodo } from "@/core/dre/engine";
import { FirstRunCard } from "@/components/visao-geral/FirstRunCard";
import type {
  DRELinha,
  DREClienteLinha,
  DRELinhaReceita,
  DRECentroCusto,
  DREProjecao,
} from "@/core/dre/types";

type Preset = "mes" | "mes_anterior" | "ytd" | "12m";
type Regime = "competencia" | "caixa";
type Cadencia = "mensal" | "trimestral";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "mes", label: "Mês atual" },
  { id: "mes_anterior", label: "Mês anterior" },
  { id: "ytd", label: "YTD" },
  { id: "12m", label: "12 meses" },
];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sign = (v: number) => (v < 0 ? "−" : "");

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mesCurto = (d: Date) => d.toLocaleString("pt-BR", { month: "short" }).replace(".", "") + "/" + String(d.getFullYear()).slice(2);

/** Buckets da série por cadência (mensal = 6 meses; trimestral = 4 janelas de 3 meses). */
function bucketsCadencia(hojeISO: string, cad: Cadencia): { de: string; ate: string; label: string }[] {
  const [y, m] = hojeISO.slice(0, 7).split("-").map(Number);
  const span = cad === "trimestral" ? 3 : 1;
  const n = cad === "trimestral" ? 4 : 6;
  const out: { de: string; ate: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const endIdx = (m - 1) - i * span;
    const start = new Date(y, endIdx - (span - 1), 1);
    const endFirst = new Date(y, endIdx, 1);
    const end = new Date(endFirst.getFullYear(), endFirst.getMonth() + 1, 0);
    out.push({ de: isoDia(start), ate: isoDia(end), label: span === 1 ? mesCurto(end) : `${mesCurto(start)}–${mesCurto(end)}` });
  }
  return out;
}

type DREData = ReturnType<typeof financialDRE>;

export function DREView() {
  const [preset, setPreset] = React.useState<Preset>("12m");
  const [regime, setRegime] = React.useState<Regime>("competencia");
  const [cadencia, setCadencia] = React.useState<Cadencia>("mensal");
  const [filtro, setFiltro] = React.useState<string>("tudo");

  const { data: input, isLoading, isError } = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });

  // Dimensões disponíveis para o filtro (centros e clientes presentes nos dados).
  const centros = React.useMemo(
    () => (input ? (Array.from(new Set(input.movements.map((m) => m.costCenter).filter(Boolean))) as string[]).sort() : []),
    [input],
  );
  const clientes = React.useMemo(() => {
    if (!input) return [] as { id: string; nome: string }[];
    const ids = Array.from(new Set(input.movements.map((m) => m.party_id).filter(Boolean))) as string[];
    return ids.map((id) => ({ id, nome: input.partyNames?.[id] ?? id })).sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 40);
  }, [input]);

  // Aplica o filtro escopando os movimentos antes de montar o DRE.
  const filtrado = React.useMemo(() => {
    if (!input) return undefined;
    let movs = input.movements;
    if (filtro === "receitas") movs = movs.filter((m) => m.type === "entrada");
    else if (filtro === "despesas") movs = movs.filter((m) => m.type === "saida");
    else if (filtro.startsWith("centro:")) { const c = filtro.slice(7); movs = movs.filter((m) => (m.costCenter || "") === c); }
    else if (filtro.startsWith("cliente:")) { const id = filtro.slice(8); movs = movs.filter((m) => m.party_id === id); }
    return { ...input, movements: movs };
  }, [input, filtro]);

  const data: DREData | undefined = React.useMemo(
    () => (filtrado ? financialDRE(filtrado, { ...periodoPreset(filtrado.hoje, preset), regime }) : undefined),
    [filtrado, preset, regime],
  );

  const serie = React.useMemo(() => {
    if (!filtrado) return [] as { label: string; receita: number; ebitda: number; lucro: number; margem: number }[];
    return bucketsCadencia(filtrado.hoje, cadencia).map((b) => {
      const g = dreGerencial(movimentosNoPeriodo(filtrado, regime, b.de, b.ate));
      return { label: b.label, receita: g.receitaLiquida, ebitda: g.ebitda, lucro: g.lucroLiquido, margem: g.margemEbitda };
    });
  }, [filtrado, regime, cadencia]);

  const filtroOptions = React.useMemo(() => [
    { value: "tudo", label: "Tudo" },
    { value: "receitas", label: "Somente receitas" },
    { value: "despesas", label: "Somente despesas" },
    ...centros.map((c) => ({ value: `centro:${c}`, label: `Centro: ${c}` })),
    ...clientes.map((c) => ({ value: `cliente:${c.id}`, label: `Cliente: ${c.nome}` })),
  ], [centros, clientes]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <FirstRunCard />
      {/* Barra de filtros (DRE dinâmico) */}
      <Card className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-label font-medium text-muted">Período</span>
        <div className="flex gap-1 flex-wrap">
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
        <span className="w-px h-5 bg-border-soft mx-1" />
        <Select
          label="Cadência"
          value={cadencia}
          onChange={(v) => setCadencia(v as Cadencia)}
          options={[{ value: "mensal", label: "Mensal" }, { value: "trimestral", label: "Trimestral" }]}
          containerClassName="min-w-[150px]"
        />
        <Select
          label="Filtro"
          value={filtro}
          onChange={setFiltro}
          options={filtroOptions}
          containerClassName="min-w-[190px]"
        />
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
        <Conteudo data={data} serie={serie} cadencia={cadencia} />
      )}
    </div>
  );
}

function Conteudo({
  data, serie, cadencia,
}: {
  data: DREData;
  serie: { label: string; receita: number; ebitda: number; lucro: number; margem: number }[];
  cadencia: Cadencia;
}) {
  const { gerencial, financeiro, porCliente, porLinha, porCentroCusto, projetado, executivo } = data;
  const varReceita = serie.length >= 2 && serie[serie.length - 2].receita
    ? (serie[serie.length - 1].receita - serie[serie.length - 2].receita) / Math.abs(serie[serie.length - 2].receita)
    : 0;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      {/* Executivo */}
      <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-6 gap-5">
        <Stat label="Receita líquida" value={<BRL value={gerencial.receitaLiquida} />} />
        <Stat label="EBITDA" value={<BRL value={gerencial.ebitda} />} tone={gerencial.ebitda < 0 ? "var(--color-negative)" : "var(--color-ink)"} />
        <Stat label="Margem EBITDA" value={pct(gerencial.margemEbitda)} />
        <Stat label="Lucro líquido" value={<BRL value={gerencial.lucroLiquido} />} tone={gerencial.lucroLiquido < 0 ? "var(--color-negative)" : "var(--color-positive)"} />
        <Stat label="Runway" value={`${financeiro.runwayMeses}m`} />
        <Stat label="Caixa" value={<BRL value={executivo.caixa} />} />
      </div>

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
          <span className="tabular-nums text-ink">{financeiro.burnMensal > 0 ? <BRL value={financeiro.burnMensal} /> : "—"}</span>
        </div>
      </Card>

      {/* Evolução por cadência (Mensal / Trimestral) */}
      <Card className="lg:col-span-3 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">Evolução · {cadencia === "trimestral" ? "trimestral" : "mensal"}</span>
        <Tabela
          head={[cadencia === "trimestral" ? "Trimestre" : "Mês", "Receita", "EBITDA", "Margem EBITDA", "Lucro"]}
          rows={serie.map((p) => [p.label, <BRL key="r" value={p.receita} />, <BRL key="e" value={p.ebitda} />, pct(p.margem), <BRL key="l" value={p.lucro} />])}
          alignRight={[1, 2, 3, 4]}
        />
        <span className="text-caption text-faint">
          Variação do último período — receita {varReceita >= 0 ? "+" : ""}{pct(varReceita)}.
        </span>
      </Card>

      {/* Por linha (produto/unidade) */}
      <Card className="lg:col-span-1 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">Por linha de receita</span>
        {porLinha.map((l: DRELinhaReceita) => (
          <div key={l.linha} className="flex flex-col gap-[3px]">
            <div className="flex justify-between text-caption">
              <span className="text-ink">{l.linha}</span>
              <span className="text-muted tabular-nums"><BRL value={l.receita} /> · {pct(l.margem)}</span>
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
          rows={porCliente.map((c: DREClienteLinha) => [c.cliente, <BRL key="r" value={c.receita} />, pct(c.share), pct(c.margem), `${c.risco}`, c.inadimplencia > 0 ? <BRL key="i" value={c.inadimplencia} /> : "—"])}
          alignRight={[1, 2, 3, 4, 5]}
        />
      </Card>

      {/* Por centro de custo */}
      <Card className="lg:col-span-3 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">DRE por centro de custo</span>
        <Tabela
          head={["Centro de custo", "Receita", "Despesa", "Resultado", "Margem"]}
          rows={porCentroCusto.map((c: DRECentroCusto) => [c.centro, <BRL key="r" value={c.receita} />, <BRL key="d" value={c.despesa} />, <BRL key="res" value={c.resultado} />, pct(c.margem)])}
          alignRight={[1, 2, 3, 4]}
        />
        <span className="text-caption text-faint">Reflete o centro de custo escolhido em cada lançamento/venda.</span>
      </Card>

      {/* Projetado */}
      <Card className="lg:col-span-3 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">DRE projetado · receita média × margem atual</span>
        <Tabela
          head={["Horizonte", "Receita projetada", "EBITDA projetado", "Lucro projetado"]}
          rows={projetado.map((p: DREProjecao) => [p.horizonte, <BRL key="r" value={p.receita} />, <BRL key="e" value={p.ebitda} />, <BRL key="l" value={p.lucro} />])}
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
        <span className={`text-[17px] ${sub ? "font-medium text-ink" : "text-muted"}`}>
          {hasDrill && <span className="text-faint mr-1">{open ? "▾" : "▸"}</span>}
          {l.label}
        </span>
        <span className="flex items-baseline gap-3">
          <span className="text-caption text-faint tabular-nums w-[44px] text-right">{sign(l.pctReceita)}{Math.abs(Math.round(l.pctReceita * 100))}%</span>
          <span className={`text-[17px] tabular-nums font-medium w-[120px] text-right`} style={{ color: cor }}>
            {sign(l.valor)}<BRL value={Math.abs(l.valor)} />
          </span>
        </span>
      </button>
      {open && hasDrill && (
        <div className="pl-5 py-1 bg-surface-1 border-b border-border-soft">
          {l.componentes!.map((c, i) => (
            <div key={i} className="flex justify-between text-caption py-[2px]">
              <span className="text-faint">{c.label}</span>
              <span className="text-muted tabular-nums"><BRL value={c.valor} /></span>
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
        {sign(v)}<BRL value={Math.abs(v)} />
      </span>
    </div>
  );
}

function Stat({ label, value, tone = "var(--color-ink)" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-label font-medium text-muted">{label}</span>
      <span className="text-h3 font-medium tabular-nums leading-none" style={{ color: tone }}>{value}</span>
    </Card>
  );
}

function Tabela({ head, rows, alignRight = [] }: { head: string[]; rows: React.ReactNode[][]; alignRight?: number[] }) {
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
