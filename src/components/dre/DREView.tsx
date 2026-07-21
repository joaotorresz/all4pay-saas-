"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BRL, Card, Skeleton, Select, DatePicker, Icon } from "@/components/ui";
import { getRiscoInput } from "@/lib/data";
import { financialDRE } from "@/core/dre";
import { dreGerencial, movimentosNoPeriodo } from "@/core/dre/engine";
import { FirstRunCard } from "@/components/visao-geral/FirstRunCard";
import type {
  DRELinha,
  DREClienteLinha,
  DRELinhaReceita,
  DRECentroCusto,
  DREProjecao,
} from "@/core/dre/types";

type Regime = "competencia" | "caixa";
type Cadencia = "mensal" | "trimestral" | "semestral" | "anual";
/** Tamanho do bucket (meses) e janela default do range, por cadência. */
const SPAN_MESES: Record<Cadencia, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
const CAD_COL: Record<Cadencia, string> = { mensal: "Mês", trimestral: "Trimestre", semestral: "Semestre", anual: "Ano" };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sign = (v: number) => (v < 0 ? "−" : "");

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mesCurto = (d: Date) => d.toLocaleString("pt-BR", { month: "short" }).replace(".", "") + "/" + String(d.getFullYear()).slice(2);
const fmtDia = (iso: string) => { const [y, m, d] = (iso || "").split("-"); return d ? `${d}/${m}/${y.slice(2)}` : iso; };

/** Buckets da evolução DENTRO do intervalo observado, agrupados pela cadência. */
function bucketsRange(deISO: string, ateISO: string, cad: Cadencia): { de: string; ate: string; label: string }[] {
  if (!deISO || !ateISO || deISO > ateISO) return [];
  const span = SPAN_MESES[cad];
  const [y0, m0] = deISO.split("-").map(Number);
  const [y1, m1] = ateISO.split("-").map(Number);
  const endIdx = (y1 - y0) * 12 + (m1 - m0);
  const out: { de: string; ate: string; label: string }[] = [];
  for (let i = 0; i <= endIdx && out.length < 24; i += span) {
    const bs = new Date(y0, (m0 - 1) + i, 1);
    const beFirst = new Date(y0, (m0 - 1) + i + (span - 1), 1);
    const be = new Date(beFirst.getFullYear(), beFirst.getMonth() + 1, 0); // último dia
    const bDe = i === 0 ? deISO : isoDia(bs);
    const beIso = isoDia(be);
    const bAte = beIso > ateISO ? ateISO : beIso;
    const label = span >= 12 ? String(bs.getFullYear()) : span === 1 ? mesCurto(bs) : `${mesCurto(bs)}–${mesCurto(be)}`;
    out.push({ de: bDe, ate: bAte, label });
  }
  return out;
}

type DREData = ReturnType<typeof financialDRE>;

export function DREView() {
  const hojeISO = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [de, setDe] = React.useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 11); d.setDate(1); return isoDia(d); });
  const [ate, setAte] = React.useState(hojeISO);
  const [regime, setRegime] = React.useState<Regime>("competencia");
  const [cadencia, setCadencia] = React.useState<Cadencia>("mensal");

  const { data: input, isLoading, isError } = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  // nome→id (para abrir a ficha do contato ao clicar no cliente do DRE)
  const nomeToId = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const [pid, n] of Object.entries(input?.partyNames ?? {})) if (n) m[n] = pid;
    return m;
  }, [input]);

  // Trocar a cadência ajusta os MESES do intervalo (De/Até) — sem mexer no ano:
  // o início recua o tamanho do período, mas nunca antes de 1º de janeiro do
  // ano corrente; o fim é hoje. Ex. (junho): mensal=jun · trimestral=abr ·
  // semestral=jan · anual=jan.
  const mudarCadencia = (c: Cadencia) => {
    setCadencia(c);
    const a = new Date();
    const recuo = SPAN_MESES[c] - 1;
    let ini = new Date(a.getFullYear(), a.getMonth() - recuo, 1);
    const janAtual = new Date(a.getFullYear(), 0, 1);
    if (ini < janAtual) ini = janAtual; // mantém o ano corrente
    setDe(isoDia(ini));
    setAte(isoDia(a));
  };

  const periodoLabel = `${fmtDia(de)} – ${fmtDia(ate)}`;
  const data: DREData | undefined = React.useMemo(
    () => (input && de && ate && de <= ate ? financialDRE(input, { regime, de, ate, periodoLabel }) : undefined),
    [input, de, ate, regime, periodoLabel],
  );

  const serie = React.useMemo(() => {
    if (!input) return [] as { label: string; receita: number; ebitda: number; lucro: number; margem: number }[];
    return bucketsRange(de, ate, cadencia).map((b) => {
      const g = dreGerencial(movimentosNoPeriodo(input, regime, b.de, b.ate));
      return { label: b.label, receita: g.receitaLiquida, ebitda: g.ebitda, lucro: g.lucroLiquido, margem: g.margemEbitda };
    });
  }, [input, de, ate, regime, cadencia]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <FirstRunCard />
      {/* Barra de filtros (DRE dinâmico) */}
      <Card className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <DatePicker label="De" value={de} onChange={setDe} max={ate} containerClassName="min-w-[150px]" />
        <DatePicker label="Até" value={ate} onChange={setAte} min={de} containerClassName="min-w-[150px]" />
        <Select
          label="Cadência"
          value={cadencia}
          onChange={(v) => mudarCadencia(v as Cadencia)}
          options={[
            { value: "mensal", label: "Mensal" },
            { value: "trimestral", label: "Trimestral" },
            { value: "semestral", label: "Semestral" },
            { value: "anual", label: "Anual" },
          ]}
          containerClassName="min-w-[150px]"
        />
        <div className="flex flex-col gap-[6px]">
          <span className="text-label font-medium text-muted">Regime</span>
          <div className="flex gap-1">
            {(["competencia", "caixa"] as Regime[]).map((r) => (
              <button
                key={r}
                onClick={() => setRegime(r)}
                className={`text-caption font-medium rounded-pill px-3 py-[7px] ${regime === r ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}
              >
                {r === "competencia" ? "Competência" : "Caixa"}
              </button>
            ))}
          </div>
        </div>
        {de > ate && <span className="text-caption text-negative w-full">A data inicial não pode ser depois da final.</span>}
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
        <Conteudo data={data} serie={serie} cadencia={cadencia} nomeToId={nomeToId} />
      )}
    </div>
  );
}

function Conteudo({
  data, serie, cadencia, nomeToId,
}: {
  data: DREData;
  serie: { label: string; receita: number; ebitda: number; lucro: number; margem: number }[];
  cadencia: Cadencia;
  nomeToId: Record<string, string>;
}) {
  const { gerencial, financeiro, porCliente, porLinha, porCentroCusto, projetado, executivo } = data;
  const varReceita = serie.length >= 2 && serie[serie.length - 2].receita
    ? (serie[serie.length - 1].receita - serie[serie.length - 2].receita) / Math.abs(serie[serie.length - 2].receita)
    : 0;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      {/* Executivo */}
      <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-6 gap-5">
        <Stat label="Receita líquida" value={<BRL value={gerencial.receitaLiquida} />} href="/recebimentos" hrefLabel="Ver a receber" />
        <Stat label="EBITDA" value={<BRL value={gerencial.ebitda} />} tone={gerencial.ebitda < 0 ? "var(--color-negative)" : "var(--color-ink)"} />
        <Stat label="Margem EBITDA" value={pct(gerencial.margemEbitda)} />
        <Stat label="Lucro líquido" value={<BRL value={gerencial.lucroLiquido} />} tone={gerencial.lucroLiquido < 0 ? "var(--color-negative)" : "var(--color-positive)"} />
        <Stat label="Runway" value={`${financeiro.runwayMeses}m`} href="/fluxo-caixa" hrefLabel="Ver fluxo de caixa" />
        <Stat label="Caixa" value={<BRL value={executivo.caixa} />} href="/fluxo-caixa" hrefLabel="Ver fluxo de caixa" />
      </div>

      {/* DRE Gerencial (waterfall + drill-down) */}
      <Card
        className="lg:col-span-2 flex flex-col gap-2"
        info={{
          titulo: "DRE gerencial",
          oQue: "Mostra o resultado do negócio em cascata, da receita bruta ao lucro líquido, com drill-down por categoria.",
          comoCalcula: "Os lançamentos do período são classificados em linhas (impostos, CMV, folha, opex, financeiro) por palavra-chave na categoria, no regime escolhido.",
        }}
      >
        <span className="text-label font-medium text-muted">DRE gerencial · {data.filtro.periodoLabel} · {data.filtro.regime === "caixa" ? "caixa" : "competência"}</span>
        <div className="flex flex-col">
          {gerencial.linhas.map((l) => <LinhaRow key={l.id} l={l} />)}
        </div>
        <span className="text-caption text-faint pt-1">Clique nas linhas com ▸ para abrir a composição (drill-down).</span>
      </Card>

      {/* Financeiro (caixa) */}
      <Card
        className="lg:col-span-1 flex flex-col gap-2"
        info={{
          titulo: "DRE financeiro",
          oQue: "A visão de caixa de fato: o que entrou e saiu, o fluxo operacional, livre e o burn mensal.",
          comoCalcula: "Soma recebimentos e pagamentos efetivados (regime de caixa, pela data de pagamento) e separa operacional, financeiro e investimento.",
        }}
      >
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

      {/* Evolução por cadência (dentro do intervalo observado) */}
      <Card
        className="lg:col-span-3 flex flex-col gap-2"
        info={{
          titulo: "Evolução do resultado",
          oQue: "Acompanha receita, EBITDA, margem e lucro ao longo do tempo, no ritmo (cadência) escolhido.",
          comoCalcula: "O intervalo observado é fatiado em períodos (mês, trimestre, semestre ou ano) e o DRE gerencial é recalculado para cada fatia.",
        }}
      >
        <span className="text-label font-medium text-muted">Evolução · {cadencia} · {data.filtro.periodoLabel}</span>
        <Tabela
          head={[CAD_COL[cadencia], "Receita", "EBITDA", "Margem EBITDA", "Lucro"]}
          rows={serie.map((p) => [p.label, <BRL key="r" value={p.receita} />, <BRL key="e" value={p.ebitda} />, pct(p.margem), <BRL key="l" value={p.lucro} />])}
          alignRight={[1, 2, 3, 4]}
        />
        <span className="text-caption text-faint">
          Variação do último período — receita {varReceita >= 0 ? "+" : ""}{pct(varReceita)}.
        </span>
      </Card>

      {/* Por linha (produto/unidade) */}
      <Card
        className="lg:col-span-1 flex flex-col gap-2"
        info={{
          titulo: "Por linha de receita",
          oQue: "Quanto cada produto ou serviço fatura e com que margem, para ver onde está o resultado.",
          comoCalcula: "A receita é agrupada pela linha (produto/unidade) e o custo é rateado para chegar na margem de cada uma.",
        }}
      >
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
      <Card
        className="lg:col-span-2 flex flex-col gap-2"
        info={{
          titulo: "DRE por cliente",
          oQue: "Os 10 maiores clientes por receita, com participação, margem, risco e valor vencido de cada um.",
          comoCalcula: "A receita é somada por cliente; o risco e o vencido vêm do motor de crédito sobre os recebíveis daquele cliente.",
        }}
      >
        <span className="text-label font-medium text-muted">DRE por cliente · top 10</span>
        <Tabela
          head={["Cliente", "Receita", "Share", "Margem", "Risco", "Vencido"]}
          rows={porCliente.map((c: DREClienteLinha) => [
            nomeToId[c.cliente]
              ? <button key="c" type="button" onClick={() => window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: nomeToId[c.cliente] } }))} className="text-ink hover:underline text-left">{c.cliente}</button>
              : c.cliente,
            <BRL key="r" value={c.receita} />, pct(c.share), pct(c.margem), `${c.risco}`, c.inadimplencia > 0 ? <BRL key="i" value={c.inadimplencia} /> : "—"])}
          alignRight={[1, 2, 3, 4, 5]}
        />
      </Card>

      {/* Por centro de custo */}
      <Card
        className="lg:col-span-3 flex flex-col gap-2"
        info={{
          titulo: "DRE por centro de custo",
          oQue: "Receita, despesa e resultado de cada centro de custo, para ver qual área dá ou consome dinheiro.",
          comoCalcula: "Os lançamentos são agrupados pelo centro de custo escolhido em cada lançamento ou venda.",
        }}
      >
        <span className="text-label font-medium text-muted">DRE por centro de custo</span>
        <Tabela
          head={["Centro de custo", "Receita", "Despesa", "Resultado", "Margem"]}
          rows={porCentroCusto.map((c: DRECentroCusto) => [c.centro, <BRL key="r" value={c.receita} />, <BRL key="d" value={c.despesa} />, <BRL key="res" value={c.resultado} />, pct(c.margem)])}
          alignRight={[1, 2, 3, 4]}
        />
        <span className="text-caption text-faint">Reflete o centro de custo escolhido em cada lançamento/venda.</span>
      </Card>

      {/* Projetado */}
      <Card
        className="lg:col-span-3 flex flex-col gap-2"
        info={{
          titulo: "DRE projetado",
          oQue: "Uma estimativa de receita, EBITDA e lucro para os próximos horizontes (30, 90, 180 e 360 dias).",
          comoCalcula: "Projeta a receita média do período para frente e aplica a margem atual para estimar EBITDA e lucro.",
        }}
      >
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

function Stat({ label, value, tone = "var(--color-ink)", href, hrefLabel }: { label: string; value: React.ReactNode; tone?: string; href?: string; hrefLabel?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-label font-medium text-muted">{label}</span>
      <span className="text-h3 font-medium tabular-nums leading-none" style={{ color: tone }}>{value}</span>
      {href && (
        <Link href={href} className="mt-auto pt-1 self-start inline-flex items-center gap-1 text-caption font-medium text-muted hover:text-ink transition-colors">
          {hrefLabel ?? "Ver detalhe"} <Icon name="arrow-up-right" size={12} color="currentColor" />
        </Link>
      )}
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
