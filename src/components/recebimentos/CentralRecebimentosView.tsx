"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Select, Input, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";
import {
  receberLote, itemReceb, anexarComprovante, comprovanteDe,
  type MetodoRecebimento, type ItemRecebimento,
} from "@/lib/recebimentos";
import { useRecebiveisOpen, useContasReceb, usePartiesReceb, useRiscoInputReceb } from "./hooks";
import type { Movement, Party, FinancialAccount } from "@/lib/types";

type Agrupar = "dia" | "semana" | "mes" | "ano";
const AGRUPAR: { id: Agrupar; label: string }[] = [
  { id: "dia", label: "Dia" }, { id: "semana", label: "Semana" }, { id: "mes", label: "Mês" }, { id: "ano", label: "Ano" },
];
type RangeId = "7d" | "14d" | "30d" | "3m" | "tudo";
const RANGES: { id: RangeId; label: string; dias: number }[] = [
  { id: "7d", label: "7D", dias: 7 }, { id: "14d", label: "14D", dias: 14 },
  { id: "30d", label: "30D", dias: 30 }, { id: "3m", label: "3M", dias: 90 }, { id: "tudo", label: "Tudo", dias: 99999 },
];
const METODOS: { id: MetodoRecebimento; label: string }[] = [
  { id: "pix", label: "Pix" }, { id: "of", label: "Open Finance" }, { id: "ted", label: "TED" }, { id: "boleto", label: "Boleto" },
];

const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
function chaveGrupo(iso: string, modo: Agrupar): { key: string; label: string } {
  const [y, m] = iso.split("-");
  if (modo === "dia") return { key: iso, label: fmtDia(iso) };
  if (modo === "mes") return { key: `${y}-${m}`, label: `${m}/${y}` };
  if (modo === "ano") return { key: y, label: y };
  const dt = new Date(iso + "T00:00:00");
  const dow = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - dow);
  const seg = dt.toISOString().slice(0, 10);
  return { key: `w-${seg}`, label: `Semana de ${fmtDia(seg)}` };
}

export function CentralRecebimentosView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const movs = useRecebiveisOpen();
  const contas = useContasReceb();
  const parties = usePartiesReceb();
  const risco = useRiscoInputReceb();

  const [agrupar, setAgrupar] = React.useState<Agrupar>("dia");
  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState("");
  const [conta, setConta] = React.useState("");
  const [metodo, setMetodo] = React.useState<MetodoRecebimento>("pix");
  const [range, setRange] = React.useState<RangeId>("30d");
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = React.useState<ItemRecebimento[] | null>(null);
  const [comprovante, setComprovante] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const compRef = React.useRef<HTMLInputElement>(null);

  const nomeDe = React.useCallback((m: Movement) => {
    const p = m.party_id ? (parties.data ?? []).find((x: Party) => x.id === m.party_id) : undefined;
    return p?.name || m.description || m.category || "Sem contraparte";
  }, [parties.data]);

  React.useEffect(() => {
    if (!conta && contas.data?.length) setConta(contas.data[0].id);
  }, [contas.data, conta]);

  const itens: ItemRecebimento[] = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (movs.data ?? [])
      .map((m) => itemReceb(m, nomeDe(m)))
      .filter((it) => (!categoria || (it.category ?? "") === categoria) && (!termo || it.pagador.toLowerCase().includes(termo) || (it.category ?? "").toLowerCase().includes(termo) || String(it.amount).includes(termo)));
  }, [movs.data, nomeDe, busca, categoria]);

  const categorias = React.useMemo(
    () => Array.from(new Set((movs.data ?? []).map((m) => m.category).filter(Boolean))).sort() as string[],
    [movs.data],
  );

  const grupos = React.useMemo(() => {
    const map = new Map<string, { label: string; itens: ItemRecebimento[] }>();
    for (const it of itens) {
      const g = chaveGrupo(it.due_date, agrupar);
      if (!map.has(g.key)) map.set(g.key, { label: g.label, itens: [] });
      map.get(g.key)!.itens.push(it);
    }
    return Array.from(map.values()).sort((a, b) => a.itens[0].due_date.localeCompare(b.itens[0].due_date));
  }, [itens, agrupar]);

  // Contas RECEBIDAS (entrada baixada) no período — correlaciona com o box de range.
  const recebidos = React.useMemo(() => {
    const inp = risco.data;
    if (!inp) return [] as { id: string; nome: string; amount: number; paid: string; category?: string | null }[];
    const dias = RANGES.find((r) => r.id === range)?.dias ?? 30;
    const hoje = inp.hoje;
    const limite = new Date(hoje + "T00:00:00"); limite.setDate(limite.getDate() - dias);
    const limISO = limite.toISOString().slice(0, 10);
    return inp.movements
      .filter((m) => m.type === "entrada" && m.status === "pago" && m.paid_date && m.paid_date >= limISO && m.paid_date <= hoje)
      .map((m) => ({ id: m.id, nome: (m.party_id && inp.partyNames?.[m.party_id]) || m.category || "Sem contraparte", amount: m.amount, paid: m.paid_date as string, category: m.category }))
      .sort((a, b) => (b.paid < a.paid ? -1 : 1));
  }, [risco.data, range]);
  const totalRecebido = recebidos.reduce((s, p) => s + p.amount, 0);

  const selItens = itens.filter((it) => sel.has(it.id));
  const selTotal = selItens.reduce((s, it) => s + it.amount, 0);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGrupo = (g: { itens: ItemRecebimento[] }) => setSel((s) => {
    const n = new Set(s); const todos = g.itens.every((it) => n.has(it.id));
    g.itens.forEach((it) => (todos ? n.delete(it.id) : n.add(it.id)));
    return n;
  });

  const executar = async (lote: ItemRecebimento[]) => {
    if (!conta || !lote.length) return;
    setEnviando(true);
    try {
      const r = await receberLote(lote, conta);
      if (comprovante) lote.forEach((it) => anexarComprovante(it.id, comprovante));
      await qc.invalidateQueries();
      setSel(new Set());
      setConfirmar(null);
      setComprovante(null);
      show(r.recebidos
        ? `Recebido: ${r.recebidos} título(s) · ${formatBRL(r.total)} creditado — em Contas recebidas.`
        : "Nada a receber (já recebidos).");
    } finally {
      setEnviando(false);
    }
  };

  if (movs.isLoading) return <Card><span className="text-caption text-faint">Carregando recebíveis…</span></Card>;

  const contaNome = (contas.data ?? []).find((c: FinancialAccount) => c.id === conta)?.name ?? "—";

  return (
    <div className="flex flex-col gap-5 pb-24">
      {/* Controles */}
      <Card className="flex flex-col gap-4" info={{ titulo: "Execução de recebimentos", oQue: "Dá baixa em lote nos títulos a receber e credita o saldo da conta de destino.", comoCalcula: "Filtra os recebíveis em aberto por conta, método, categoria e busca; agrupar por dia, semana, mês ou ano." }}>
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center"><Icon name="arrow-left-right" size={14} color="var(--color-on-lime)" /></span>
          <span className="text-label font-medium text-muted">Execução de recebimentos — dá baixa nos títulos a receber, em lote, e credita a conta</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-[6px]">
            <span className="text-label font-medium text-muted">Agrupar por</span>
            <div className="inline-flex rounded-md bg-surface-2 p-[3px]">
              {AGRUPAR.map((a) => (
                <button key={a.id} onClick={() => setAgrupar(a.id)} className={`rounded-[7px] px-3 py-[6px] text-caption ${agrupar === a.id ? "bg-white text-ink font-medium shadow-pill" : "text-muted hover:text-ink"}`}>{a.label}</button>
              ))}
            </div>
          </div>
          <Select label="Conta de destino" value={conta} onChange={setConta}
            options={(contas.data ?? []).map((c: FinancialAccount) => ({ value: c.id, label: c.name }))} containerClassName="min-w-[180px]" />
          <Select label="Método" value={metodo} onChange={(v) => setMetodo(v as MetodoRecebimento)}
            options={METODOS.map((m) => ({ value: m.id, label: m.label }))} containerClassName="min-w-[150px]" />
          <Select label="Categoria" value={categoria} onChange={setCategoria}
            options={[{ value: "", label: "Todas" }, ...categorias.map((c) => ({ value: c, label: c }))]} containerClassName="min-w-[170px]" />
          <div className="flex flex-col gap-[6px] flex-1 min-w-[200px]">
            <span className="text-label font-medium text-muted">Buscar</span>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="pagador, classificação ou valor" />
          </div>
        </div>
        <span className="text-caption text-faint">Dar baixa credita o saldo da conta de destino e move o título para “Contas recebidas”. Idempotência: dar baixa no mesmo título não credita duas vezes.</span>
      </Card>

      {/* Cards de lote por período */}
      {grupos.length === 0 ? (
        <Card><span className="text-caption text-faint">Nenhum recebível em aberto. Lance receitas ou emita boletos/recorrências.</span></Card>
      ) : grupos.map((g) => {
        const total = g.itens.reduce((s, it) => s + it.amount, 0);
        const cats = Array.from(new Set(g.itens.map((it) => it.category).filter(Boolean))) as string[];
        const todosSel = g.itens.every((it) => sel.has(it.id));
        return (
          <Card key={g.label} padded={false}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-soft flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => toggleGrupo(g)} className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-sm border" style={{ borderColor: todosSel ? "var(--color-ink)" : "var(--color-border)", background: todosSel ? "var(--color-ink)" : "transparent" }} aria-label="Selecionar lote">
                  {todosSel && <Icon name="check" size={12} color="#ffffff" />}
                </button>
                <span className="text-body font-medium text-ink">{g.label}</span>
                <span className="text-caption text-faint">{g.itens.length} recebimento(s)</span>
                {cats.slice(0, 3).map((c) => <span key={c} className="text-caption text-muted bg-surface-2 rounded-pill px-2 py-[1px]">{c}</span>)}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-body tabular-nums text-ink"><BRL value={total} /></span>
                <Button variant="primary" size="sm" disabled={!g.itens.length} onClick={() => { setComprovante(null); setConfirmar(g.itens); }}>Receber lote via Pix</Button>
              </div>
            </div>
            <div className="flex flex-col">
              {g.itens.map((it) => {
                const on = sel.has(it.id);
                return (
                  <div key={it.id} className="grid grid-cols-[24px_1.6fr_0.9fr_1.1fr_0.9fr] gap-3 items-center px-5 py-[10px] border-t border-border-soft first:border-t-0">
                    <button onClick={() => toggle(it.id)} className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-sm border" style={{ borderColor: on ? "var(--color-ink)" : "var(--color-border)", background: on ? "var(--color-ink)" : "transparent" }} aria-label="Selecionar">
                      {on && <Icon name="check" size={12} color="#ffffff" />}
                    </button>
                    <span className="text-[14px] text-ink truncate">{it.pagador}</span>
                    <span className="text-caption text-muted tabular-nums">{fmtDia(it.due_date)}</span>
                    <span className="text-caption text-faint truncate">{it.category ?? "—"}</span>
                    <span className="text-caption text-ink tabular-nums text-right inline-flex items-center justify-end gap-2">
                      {on && (
                        <button onClick={() => { setComprovante(null); setConfirmar([it]); }} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-3 py-[3px]">Receber</button>
                      )}
                      <BRL value={it.amount} />
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {/* Contas recebidas — correlacionado ao box de período */}
      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-soft flex-wrap">
          <div className="flex items-center gap-2">
            <Icon name="check" size={15} color="var(--color-positive)" />
            <span className="inline-flex items-center text-body font-medium text-ink">Contas recebidas<InfoHint align="left" titulo="Contas recebidas" oQue="Os títulos que já caíram na conta no período — onde o dinheiro de fato entrou." comoCalcula="Entradas com status pago e data de recebimento dentro da janela escolhida (7D, 14D, 30D, 3M ou Tudo)." /></span>
            <span className="text-caption text-faint">{recebidos.length} no período · <span className="tabular-nums">{formatBRL(totalRecebido)}</span></span>
          </div>
          <div className="inline-flex rounded-md bg-surface-2 p-[3px]">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)} className={`rounded-[7px] px-3 py-[5px] text-caption ${range === r.id ? "bg-white text-ink font-medium shadow-pill" : "text-muted hover:text-ink"}`}>{r.label}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col max-h-[320px] overflow-y-auto">
          {recebidos.length === 0 ? (
            <p className="text-caption text-faint text-center py-6">Nenhuma conta recebida neste período.</p>
          ) : recebidos.map((p) => {
            const comp = comprovanteDe(p.id);
            return (
              <div key={p.id} className="grid grid-cols-[1.6fr_0.9fr_1.1fr_0.9fr] gap-3 items-center px-5 py-[10px] border-t border-border-soft first:border-t-0">
                <span className="text-[14px] text-ink truncate">{p.nome}</span>
                <span className="text-caption text-muted tabular-nums">recebido {fmtDia(p.paid)}</span>
                <span className="text-caption text-faint truncate inline-flex items-center gap-1">
                  {comp ? <><Icon name="paperclip" size={12} color="var(--color-text-tertiary)" />{comp}</> : (p.category ?? "—")}
                </span>
                <span className="text-caption text-ink tabular-nums text-right"><BRL value={p.amount} /></span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Barra fixa de seleção múltipla */}
      {sel.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] inline-flex items-center gap-4 rounded-pill bg-ink text-white shadow-popover px-5 py-3">
          <span className="text-caption">{sel.size} selecionado(s) · <span className="tabular-nums font-medium">{formatBRL(selTotal)}</span></span>
          <button onClick={() => { setComprovante(null); setConfirmar(selItens); }} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-3 py-[6px]">Receber selecionados</button>
          <button onClick={() => setSel(new Set())} className="text-caption text-white/70 hover:text-white">Limpar</button>
        </div>
      )}

      {/* Modal de confirmação (dá baixa + credita) */}
      {confirmar && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-center z-[80] p-6 overflow-y-auto" onClick={() => !enviando && setConfirmar(null)}>
          <div className="w-[460px] max-w-full my-auto" onClick={(e) => e.stopPropagation()}>
            <Card className="flex flex-col gap-4">
              <span className="text-h3 font-medium text-ink">Confirmar recebimento</span>
              <div className="flex flex-col gap-2">
                <Linha label="Recebimentos" value={`${confirmar.length}`} />
                <Linha label="Total" value={formatBRL(confirmar.reduce((s, it) => s + it.amount, 0))} forte />
                <Linha label="Conta de destino" value={contaNome} />
                <Linha label="Método" value={METODOS.find((m) => m.id === metodo)?.label ?? metodo} />
              </div>

              <button onClick={() => compRef.current?.click()} className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-caption text-muted hover:border-ink/30">
                <Icon name="paperclip" size={14} color="var(--color-text-secondary)" />
                {comprovante ? <span className="text-ink">{comprovante}</span> : "Anexar comprovante (opcional)"}
              </button>
              <input ref={compRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.pdf,image/*" onChange={(e) => e.target.files?.[0] && setComprovante(e.target.files[0].name)} />

              <div className="rounded-md p-3 flex items-start gap-2" style={{ background: "var(--color-surface-2)" }}>
                <Icon name="triangle-alert" size={15} color="var(--color-positive)" className="mt-[2px]" />
                <span className="text-caption text-muted leading-[1.5]">Ao confirmar, o saldo de <b className="text-ink font-medium">{contaNome}</b> sobe, o título sai de “A receber” e entra em <b className="text-ink font-medium">Contas recebidas</b>. Idempotência impede crédito duplicado.</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-3">
                <Button variant="ghost" onClick={() => { setConfirmar(null); setComprovante(null); }} disabled={enviando}>Cancelar</Button>
                <Button variant="primary" onClick={() => executar(confirmar)} disabled={enviando || !conta}>{enviando ? "Recebendo…" : "Confirmar recebimento"}</Button>
              </div>
            </Card>
          </div>
        </div>
      )}
      {node}
    </div>
  );
}

function Linha({ label, value, forte }: { label: string; value: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-caption text-faint">{label}</span>
      <span className={`tabular-nums ${forte ? "text-body text-ink font-medium" : "text-caption text-ink"}`}>{value}</span>
    </div>
  );
}
