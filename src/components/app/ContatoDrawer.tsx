"use client";

/**
 * Ficha do contato (drawer global) — o drill-down de cliente/fornecedor. Abre
 * por evento `a4p:open-contato` ({ detail: { id } }) de qualquer lista (Top
 * clientes, Inadimplência, contatos…) e mostra a visão 360º daquele contato,
 * correlacionando os motores: recebido/pago, em aberto, vencido, o SCORE de
 * crédito (motor de inadimplência) com fatores explicáveis + recomendação, e os
 * últimos lançamentos. Montado uma vez no AppShell. Demo/live idêntico.
 */
import * as React from "react";
import { Icon, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useRiscoInput, useInadimplencia } from "@/components/visao-geral/hooks";
import { MES_ABBR } from "@/components/visao-geral/PeriodContext";
import { posicaoDaContraparte } from "@/core/indicadores";

const dia = (ds?: string | null) => (ds ? ds.slice(0, 10).split("-").reverse().join("/") : "—");
const CLASS_COR: Record<string, string> = {
  baixo: "var(--color-positive)", moderado: "var(--color-warning)",
  alto: "var(--color-negative)", critico: "var(--color-negative)",
};

export function ContatoDrawer() {
  const [id, setId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [everOpen, setEverOpen] = React.useState(false);

  React.useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.id) { setId(String(d.id)); setOpen(true); setEverOpen(true); } };
    window.addEventListener("a4p:open-contato", h);
    return () => window.removeEventListener("a4p:open-contato", h);
  }, []);

  if (!everOpen) return null; // só roda os motores depois de abrir a 1ª vez
  return <ContatoPanel id={id} open={open} onClose={() => setOpen(false)} />;
}

function ContatoPanel({ id, open, onClose }: { id: string | null; open: boolean; onClose: () => void }) {
  const { data: inp } = useRiscoInput();
  const { data: inad } = useInadimplencia();

  const resumo = React.useMemo(() => {
    if (!inp || !id) return null;
    const movs = inp.movements.filter((m) => m.party_id === id && m.status !== "cancelado");
    const nome = inp.partyNames?.[id] ?? "Contato";
    // ⚠️ A conta é da camada canônica, não desta tela. As cinco linhas que
    // estavam aqui usavam `Math.abs(m.amount)` — a convenção de sinal
    // contornada — e a mesma conta existia no motor da IA e no DRE por cliente.
    const pos = posicaoDaContraparte(inp, id);
    const { recebido, pago, aReceber, aPagar, vencido } = pos;
    const ultimos = [...movs].sort((a, b) => (b.paid_date || b.due_date).localeCompare(a.paid_date || a.due_date)).slice(0, 8);
    const perfil = inad?.clientes?.find((c) => c.clienteId === id) ?? null;
    // participação na receita total (concentração) — também canônica
    const share = pos.share;
    // histórico dos últimos 6 meses (recebido pago, por mês de caixa)
    const byMonth = new Map<string, number>();
    for (const m of movs) { if (m.type !== "entrada" || m.status !== "pago") continue; const k = (m.paid_date || m.due_date || "").slice(0, 7); if (k) byMonth.set(k, (byMonth.get(k) || 0) + Math.abs(m.amount)); }
    const hojeD = new Date(inp.hoje + "T00:00:00");
    const historico: { mes: string; valor: number }[] = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(hojeD.getFullYear(), hojeD.getMonth() - i, 1); historico.push({ mes: MES_ABBR[d.getMonth()], valor: byMonth.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`) || 0 }); }
    const ehCliente = recebido > 0 || aReceber > 0;
    const ehFornecedor = pago > 0 || aPagar > 0;
    return { nome, recebido, pago, aReceber, aPagar, vencido, ultimos, perfil, historico, share, ehCliente, ehFornecedor };
  }, [inp, inad, id]);


  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 z-[78] bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`} aria-hidden />
      <aside role="dialog" aria-label="Ficha do contato"
        className={`a4p-glass fixed top-0 right-0 z-[80] h-full w-full sm:w-[440px] bg-white border-l border-border flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ boxShadow: "-12px 0 40px rgba(14,19,30,0.12)" }}>
        <header className="flex items-center gap-3 px-5 h-[64px] border-b border-border-soft shrink-0">
          <span className="w-9 h-9 rounded-pill bg-surface-2 inline-flex items-center justify-center shrink-0">
            <Icon name="users" size={18} color="var(--color-muted)" />
          </span>
          <div className="min-w-0">
            <div className="text-[16px] font-semibold text-ink truncate inline-flex items-center gap-2">
              {resumo?.nome ?? "Contato"}
              {resumo?.ehCliente && <span className="text-[10px] font-medium uppercase tracking-wide text-muted bg-surface-2 rounded-pill px-2 py-[1px]">Cliente</span>}
              {resumo?.ehFornecedor && <span className="text-[10px] font-medium uppercase tracking-wide text-muted bg-surface-2 rounded-pill px-2 py-[1px]">Fornecedor</span>}
            </div>
            {resumo?.perfil && (
              <div className="text-caption capitalize" style={{ color: CLASS_COR[resumo.perfil.classificacao] }}>
                Risco {resumo.perfil.classificacao} · score {resumo.perfil.score}/100
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="ml-auto w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2 transition-colors">
            <Icon name="x" size={18} color="currentColor" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {!resumo ? (
            <div className="text-caption text-faint">Carregando…</div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="Recebido" v={formatBRL(resumo.recebido)} />
                <Kpi label="A receber" v={formatBRL(resumo.aReceber)} />
                {resumo.pago > 0 && <Kpi label="Pago a ele" v={formatBRL(resumo.pago)} />}
                {resumo.aPagar > 0 && <Kpi label="A pagar" v={formatBRL(resumo.aPagar)} />}
                {resumo.vencido > 0 && <Kpi label="Vencido" v={formatBRL(resumo.vencido)} tone="var(--color-negative)" />}
                {resumo.share > 0.001 && <Kpi label="Participação na receita" v={`${(resumo.share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} tone={resumo.share >= 0.3 ? "var(--color-warning)" : undefined} />}
              </div>

              {/* Histórico de recebimento (6 meses) */}
              {resumo.historico.some((h) => h.valor > 0) && (
                <section className="flex flex-col gap-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-faint inline-flex items-center gap-1">
                    Recebido por mês
                    <InfoHint align="left" oQue="Quanto este contato pagou a você mês a mês, nos últimos 6 meses." comoCalcula="Soma das entradas pagas do contato, agrupadas pelo mês de caixa (paid_date)." />
                  </div>
                  <Sparkline data={resumo.historico} />
                </section>
              )}

              {/* Risco de crédito */}
              {resumo.perfil && (
                <section className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-faint inline-flex items-center gap-1">
                    Risco de crédito
                    <InfoHint align="left" oQue="O risco de o cliente atrasar/não pagar, previsto pelo comportamento de pagamento dele." comoCalcula="Score 0–100 do motor de inadimplência (atraso médio, tendência, oscilação, recorrência); quanto maior, pior. Os fatores abaixo explicam a nota." />
                  </div>
                  <div className="rounded-card bg-surface-1 p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[28px] font-semibold tabular-nums leading-none" style={{ color: CLASS_COR[resumo.perfil.classificacao] }}>{resumo.perfil.score}</span>
                      <div className="text-caption text-muted">
                        <div className="capitalize text-ink font-medium">{resumo.perfil.classificacao}</div>
                        <div>prob. de atraso {Math.round(resumo.perfil.probabilidadeInadimplencia * 100)}%</div>
                      </div>
                    </div>
                    {resumo.perfil.fatoresRisco.slice(0, 3).map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-caption">
                        <span className="w-1.5 h-1.5 rounded-pill mt-[6px] shrink-0" style={{ background: CLASS_COR[resumo.perfil!.classificacao] }} />
                        <span className="text-muted"><b className="text-ink font-medium">{f.fator}:</b> {f.detalhe}</span>
                      </div>
                    ))}
                    <div className="rounded-md bg-white border border-border-soft p-2 text-caption text-ink">{resumo.perfil.credito.resumo}</div>
                  </div>
                </section>
              )}

              {/* Últimos lançamentos */}
              <section className="flex flex-col gap-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-1">Últimos lançamentos</div>
                {resumo.ultimos.length === 0 ? (
                  <span className="text-caption text-faint">Sem lançamentos.</span>
                ) : resumo.ultimos.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2 border-t border-border-soft first:border-t-0">
                    <div className="min-w-0">
                      <div className="text-[14px] text-ink truncate">{m.category || (m.type === "entrada" ? "Recebimento" : "Pagamento")}</div>
                      <div className="text-[11px] text-faint tabular-nums">{dia(m.paid_date || m.due_date)} · {m.status === "pago" ? "pago" : m.due_date.slice(0, 10) < (inp?.hoje ?? "") ? "vencido" : "pendente"}</div>
                    </div>
                    <span className="text-[14px] tabular-nums shrink-0" style={{ color: m.type === "entrada" ? "var(--color-positive)" : "var(--color-ink)" }}>
                      {m.type === "entrada" ? "+" : "−"}{formatBRL(Math.abs(m.amount))}
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/** Mini-histórico em barras (CSS, responsivo) — recebido por mês. */
function Sparkline({ data }: { data: { mes: string; valor: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.valor));
  return (
    <div>
      <div className="flex items-end gap-1.5 h-12">
        {data.map((d, i) => (
          <div key={i} className="flex-1 rounded-sm transition-all" title={`${d.mes}: ${formatBRL(d.valor)}`}
            style={{ height: `${Math.max(3, (d.valor / max) * 100)}%`, background: d.valor > 0 ? "var(--color-positive)" : "var(--color-surface-2)" }} />
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {data.map((d, i) => <span key={i} className="flex-1 text-center text-[10px] text-faint capitalize">{d.mes}</span>)}
      </div>
    </div>
  );
}

function Kpi({ label, v, tone }: { label: string; v: string; tone?: string }) {
  return (
    <div className="rounded-card bg-surface-1 p-3 flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums" style={{ color: tone ?? "var(--color-ink)" }}>{v}</span>
    </div>
  );
}
