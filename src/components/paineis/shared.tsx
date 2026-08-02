"use client";

/**
 * Peças comuns dos painéis fechados (financeiro, vendas, assinaturas, contas a
 * pagar/receber, calendário).
 *
 * Todas as telas repetem a mesma anatomia — subtítulo, navegação de mês,
 * filtros e cartões de indicador — então isso vive num lugar só: mudar o
 * comportamento do seletor de mês muda em seis telas de uma vez.
 */
import * as React from "react";
import { Card, Icon, Select, BRL, InfoHint } from "@/components/ui";
import { useRiscoInput, useAccounts } from "@/components/visao-geral/hooks";
import { deslocarMes, rotuloMesAno, type FiltroPainel } from "@/core/paineis";

/* ------------------------------- subtítulo ------------------------------- */

/** A linha que explica a tela, logo abaixo do título do AppShell. */
export function Subtitulo({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-label text-muted">{children}</p>;
}

/* ---------------------------- navegação de mês ---------------------------- */

/** Mês corrente no formato "2026-08" — lido no cliente (o fuso do servidor
 *  seria o do datacenter e poderia cair no mês errado). */
export function mesCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** ‹ [Ago 2026 ▾] › — o seletor que manda em todos os painéis mensais. */
export function MesPicker({
  mes, onChange, meses = 24,
}: { mes: string; onChange: (m: string) => void; meses?: number }) {
  // A lista vai do mês corrente para trás; olhar adiante é papel da projeção.
  const opcoes = React.useMemo(() => {
    const base = mesCorrente();
    return Array.from({ length: meses }, (_, k) => {
      const m = deslocarMes(base, -k);
      return { value: m, label: rotuloMesAno(m) };
    });
  }, [meses]);

  return (
    <div className="flex flex-col gap-1 items-end">
      <span className="text-caption text-faint">Mês / Ano</span>
      <div className="flex items-center gap-1">
        <Seta label="Mês anterior" icone="chevron-left" onClick={() => onChange(deslocarMes(mes, -1))} />
        <Select value={mes} onChange={onChange} options={opcoes} containerClassName="w-[150px]" />
        <Seta label="Próximo mês" icone="chevron-right" onClick={() => onChange(deslocarMes(mes, 1))} />
      </div>
    </div>
  );
}

function Seta({ label, icone, onClick }: { label: string; icone: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors"
    >
      <Icon name={icone} size={16} color="currentColor" />
    </button>
  );
}

/* -------------------------------- filtros -------------------------------- */

/**
 * Conta, centro de custo e projeto — os três recortes que existem no lançamento
 * e chegam até aqui (`accountId`/`costCenter`/`projeto`). Cada select só
 * aparece habilitado quando há algo para escolher: um filtro que não filtraria
 * nada é pior que a ausência dele.
 */
export function FiltrosPainel({
  filtro, onChange,
}: { filtro: FiltroPainel; onChange: (f: FiltroPainel) => void }) {
  const { data: contas } = useAccounts();
  const { data: input } = useRiscoInput();

  const centros = React.useMemo(() => {
    const s = new Set<string>();
    for (const m of input?.movements ?? []) if (m.costCenter) s.add(m.costCenter);
    return Array.from(s).sort();
  }, [input]);

  // Projetos: os que REALMENTE aparecem em algum lançamento — oferecer um
  // projeto sem movimento devolveria uma tela vazia sem explicação.
  const projetos = React.useMemo(() => {
    const s = new Set<string>();
    for (const m of input?.movements ?? []) if (m.projeto) s.add(m.projeto);
    return Array.from(s).sort();
  }, [input]);

  return (
    <Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Conta</label>
          <Select
            value={filtro.conta ?? ""}
            onChange={(v) => onChange({ ...filtro, conta: v || null })}
            options={[
              { value: "", label: "Todas as contas" },
              ...(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Centro de custo</label>
          <Select
            value={filtro.centro ?? ""}
            onChange={(v) => onChange({ ...filtro, centro: v || null })}
            options={[
              { value: "", label: "Todos os centros de custo" },
              ...centros.map((c) => ({ value: c, label: c })),
            ]}
            disabled={centros.length === 0}
          />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Projeto</label>
          <Select
            value={filtro.projeto ?? ""}
            onChange={(v) => onChange({ ...filtro, projeto: v || null })}
            options={[
              { value: "", label: projetos.length === 0 ? "Nenhum lançamento com projeto" : "Todos os projetos" },
              ...projetos.map((p) => ({ value: p, label: p })),
            ]}
            disabled={projetos.length === 0}
          />
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ indicadores ------------------------------ */

export type TomKpi = "neutro" | "positivo" | "atencao" | "negativo";

const COR_TOM: Record<TomKpi, string> = {
  neutro: "var(--color-ink)",
  positivo: "var(--color-positive)",
  atencao: "var(--color-warning)",
  negativo: "var(--color-negative)",
};

/** Indicador simples: micro-label em caixa-alta + valor herói. */
export function KpiSimples({
  label, valor, tom = "neutro", rodape, info,
}: {
  label: string; valor: number; tom?: TomKpi; rodape?: React.ReactNode;
  info?: { oQue: string; comoCalcula?: string };
}) {
  return (
    <Card className="h-full flex flex-col justify-between" info={info}>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{label}</span>
      <span className="mt-3 text-[28px] leading-none font-semibold tabular-nums" style={{ color: COR_TOM[tom] }}>
        <BRL value={valor} />
      </span>
      {rodape && <span className="mt-2 text-caption text-faint">{rodape}</span>}
    </Card>
  );
}

/** O mesmo indicador em três janelas (Mês · Trimestre · Ano), como no print. */
export function KpiJanelas({
  label, linhas, info,
}: {
  label: string;
  /** `valor: null` = indefinido (ex.: LTV/CAC sem gasto de aquisição). Um "—"
   *  diz "não dá para calcular"; um "0,00" diria "é péssimo" — coisas bem
   *  diferentes para quem lê. */
  linhas: { nome: string; valor: number | null; formato?: "moeda" | "razao" | "pct" }[];
  info?: { oQue: string; comoCalcula?: string };
}) {
  return (
    <Card className="h-full" info={info}>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{label}</span>
      <div className="flex flex-col mt-3">
        {linhas.map((l) => (
          <div key={l.nome} className="flex items-baseline justify-between gap-3 py-[6px] border-b border-border-soft last:border-0">
            <span className="text-label text-muted">{l.nome}</span>
            <span className="text-label font-medium text-ink tabular-nums shrink-0">
              {l.valor == null ? <span className="text-faint">—</span>
                : l.formato === "razao" ? l.valor.toFixed(2)
                : l.formato === "pct" ? `${l.valor.toFixed(2)}%`
                : <BRL value={l.valor} />}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Cartão de status com o fio de cor no topo (Total · Pago · A vencer ·
 * Atrasado). A cor é um SINAL de 3px — nunca um preenchimento.
 */
export function KpiStatus({
  label, valor, titulos, pct, tom = "neutro", info,
}: {
  label: string; valor: number; titulos: number; pct?: number; tom?: TomKpi;
  info?: { oQue: string; comoCalcula?: string };
}) {
  return (
    <Card className="h-full relative overflow-hidden" info={info}>
      <span className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: COR_TOM[tom] }} />
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{label}</span>
      <span className="block mt-3 text-[28px] leading-none font-semibold tabular-nums" style={{ color: COR_TOM[tom] }}>
        <BRL value={valor} />
      </span>
      <span className="block mt-2 text-caption text-faint tabular-nums">
        {pct != null && `${pct.toFixed(1)}% · `}{titulos} {titulos === 1 ? "título" : "títulos"}
      </span>
    </Card>
  );
}

/* --------------------------------- comuns --------------------------------- */

/** Cabeçalho de card: título + o "i" universal + um slot à direita. */
export function TituloCard({
  children, info, direita, sub,
}: { children: React.ReactNode; info?: { oQue: string; comoCalcula?: string }; direita?: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-h3 font-semibold text-ink">{children}</span>
          {info && <InfoHint align="left" oQue={info.oQue} comoCalcula={info.comoCalcula} />}
        </div>
        {sub && <div className="text-caption text-faint mt-[2px]">{sub}</div>}
      </div>
      {direita && <div className="shrink-0">{direita}</div>}
    </div>
  );
}

export function VazioPainel({ texto, acao }: { texto: string; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Icon name="file-text" size={20} color="var(--color-text-tertiary)" />
      <p className="m-0 text-label text-muted max-w-[42ch]">{texto}</p>
      {acao}
    </div>
  );
}

/** Lista de fatias com barra proporcional — o "por categoria" dos painéis. */
export function ListaFatias({ fatias, total }: { fatias: { nome: string; valor: number }[]; total: number }) {
  const maior = fatias[0]?.valor ?? 0;
  return (
    <div className="flex flex-col">
      {fatias.map((f) => (
        <div key={f.nome} className="py-2 border-b border-border-soft last:border-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-label text-ink truncate">{f.nome}</span>
            <span className="text-label text-ink tabular-nums shrink-0"><BRL value={f.valor} /></span>
          </div>
          <div className="flex items-center gap-2 mt-[6px]">
            <div className="flex-1 h-[4px] rounded-pill bg-surface-2 overflow-hidden">
              <div className="h-full rounded-pill bg-lime" style={{ width: `${maior > 0 ? (f.valor / maior) * 100 : 0}%` }} />
            </div>
            <span className="text-caption text-faint tabular-nums shrink-0 w-[46px] text-right">
              {total > 0 ? `${((f.valor / total) * 100).toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export const tooltipPainel: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-white)",
  fontSize: 13,
};
