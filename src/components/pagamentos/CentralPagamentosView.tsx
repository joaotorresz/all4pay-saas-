"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Select, Input } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";
import { pagarLote, itemDe, type MetodoPagamento, type ItemPagamento } from "@/lib/pagamentos";
import { usePagaveis, useContasPag, usePartiesPag } from "./hooks";
import type { Movement, Party, FinancialAccount } from "@/lib/types";

type Agrupar = "dia" | "semana" | "mes" | "ano";
const AGRUPAR: { id: Agrupar; label: string }[] = [
  { id: "dia", label: "Dia" }, { id: "semana", label: "Semana" }, { id: "mes", label: "Mês" }, { id: "ano", label: "Ano" },
];
const METODOS: { id: MetodoPagamento; label: string }[] = [
  { id: "pix", label: "Pix" }, { id: "of", label: "Open Finance" }, { id: "ted", label: "TED" }, { id: "boleto", label: "Boleto" },
];

const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
function chaveGrupo(iso: string, modo: Agrupar): { key: string; label: string } {
  const [y, m, d] = iso.split("-");
  if (modo === "dia") return { key: iso, label: fmtDia(iso) };
  if (modo === "mes") return { key: `${y}-${m}`, label: `${m}/${y}` };
  if (modo === "ano") return { key: y, label: y };
  // semana: segunda-feira da semana
  const dt = new Date(iso + "T00:00:00");
  const dow = (dt.getDay() + 6) % 7; // 0 = segunda
  dt.setDate(dt.getDate() - dow);
  const seg = dt.toISOString().slice(0, 10);
  return { key: `w-${seg}`, label: `Semana de ${fmtDia(seg)}` };
}

export function CentralPagamentosView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const movs = usePagaveis();
  const contas = useContasPag();
  const parties = usePartiesPag();

  const [agrupar, setAgrupar] = React.useState<Agrupar>("dia");
  const [busca, setBusca] = React.useState("");
  const [conta, setConta] = React.useState("");
  const [metodo, setMetodo] = React.useState<MetodoPagamento>("pix");
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = React.useState<ItemPagamento[] | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  const nomeDe = React.useCallback((m: Movement) => {
    const p = m.party_id ? (parties.data ?? []).find((x: Party) => x.id === m.party_id) : undefined;
    return p?.name || m.description || m.category || "Sem contraparte";
  }, [parties.data]);

  // conta de saída default = primeira conta
  React.useEffect(() => {
    if (!conta && contas.data?.length) setConta(contas.data[0].id);
  }, [contas.data, conta]);

  const itens: ItemPagamento[] = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (movs.data ?? [])
      .map((m) => itemDe(m, nomeDe(m)))
      .filter((it) => !termo || it.beneficiario.toLowerCase().includes(termo) || (it.category ?? "").toLowerCase().includes(termo) || String(it.amount).includes(termo));
  }, [movs.data, nomeDe, busca]);

  // agrupa
  const grupos = React.useMemo(() => {
    const map = new Map<string, { label: string; itens: ItemPagamento[] }>();
    for (const it of itens) {
      const g = chaveGrupo(it.due_date, agrupar);
      if (!map.has(g.key)) map.set(g.key, { label: g.label, itens: [] });
      map.get(g.key)!.itens.push(it);
    }
    return Array.from(map.values()).sort((a, b) => a.itens[0].due_date.localeCompare(b.itens[0].due_date));
  }, [itens, agrupar]);

  const selItens = itens.filter((it) => sel.has(it.id));
  const selTotal = selItens.reduce((s, it) => s + it.amount, 0);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGrupo = (g: { itens: ItemPagamento[] }) => setSel((s) => {
    const n = new Set(s); const todos = g.itens.every((it) => n.has(it.id));
    g.itens.forEach((it) => (todos ? n.delete(it.id) : n.add(it.id)));
    return n;
  });

  const executar = async (lote: ItemPagamento[]) => {
    if (!conta || !lote.length) return;
    setEnviando(true);
    try {
      const r = await pagarLote(lote, conta, metodo);
      await qc.invalidateQueries();
      setSel(new Set());
      setConfirmar(null);
      show(r.liquidados
        ? `Liquidado: ${r.liquidados} pagamento(s) · ${formatBRL(r.total)} debitado da conta. ${r.duplicados ? "(" + r.duplicados + " ignorado por idempotência)" : ""}`
        : "Nada a liquidar (já pagos / idempotência).");
    } finally {
      setEnviando(false);
    }
  };

  if (movs.isLoading) return <Card className="lg:col-span-3"><span className="text-caption text-faint">Carregando títulos a pagar…</span></Card>;

  const contaNome = (contas.data ?? []).find((c: FinancialAccount) => c.id === conta)?.name ?? "—";

  return (
    <div className="flex flex-col gap-5 pb-24">
      {/* Controles */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center"><Icon name="arrow-up-right" size={14} color="var(--color-on-lime)" /></span>
          <span className="text-label font-medium text-muted">Execução de pagamentos — paga os títulos lançados, em lote, via Pix / Open Finance</span>
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
          <Select label="Conta de saída" value={conta} onChange={setConta}
            options={(contas.data ?? []).map((c: FinancialAccount) => ({ value: c.id, label: c.name }))} containerClassName="min-w-[180px]" />
          <Select label="Método" value={metodo} onChange={(v) => setMetodo(v as MetodoPagamento)}
            options={METODOS.map((m) => ({ value: m.id, label: m.label }))} containerClassName="min-w-[150px]" />
          <div className="flex flex-col gap-[6px] flex-1 min-w-[200px]">
            <span className="text-label font-medium text-muted">Buscar</span>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="beneficiário, classificação ou valor" />
          </div>
        </div>
        <span className="text-caption text-faint">Importar lote e pagamento avulso (Novo) entram em breve. Idempotência: reenviar o mesmo título não paga duas vezes.</span>
      </Card>

      {/* Cards de lote por período */}
      {grupos.length === 0 ? (
        <Card><span className="text-caption text-faint">Nenhum título a pagar em aberto. Lance contas na Caixa de Entrada.</span></Card>
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
                <span className="text-caption text-faint">{g.itens.length} pagamento(s)</span>
                {cats.slice(0, 3).map((c) => <span key={c} className="text-caption text-muted bg-surface-2 rounded-pill px-2 py-[1px]">{c}</span>)}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-body tabular-nums text-ink"><BRL value={total} /></span>
                <Button variant="primary" size="sm" onClick={() => setConfirmar(g.itens)}>Pagar lote via Pix</Button>
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
                    <span className="text-[14px] text-ink truncate">{it.beneficiario}</span>
                    <span className="text-caption text-muted tabular-nums">{fmtDia(it.due_date)}</span>
                    <span className="text-caption text-faint truncate">{it.category ?? "—"}</span>
                    <span className="text-caption text-ink tabular-nums text-right"><BRL value={it.amount} /></span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {/* Barra fixa de seleção múltipla */}
      {sel.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] inline-flex items-center gap-4 rounded-pill bg-ink text-white shadow-popover px-5 py-3">
          <span className="text-caption">{sel.size} selecionado(s) · <span className="tabular-nums font-medium">{formatBRL(selTotal)}</span></span>
          <button onClick={() => setConfirmar(selItens)} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-3 py-[6px]">Pagar selecionados</button>
          <button onClick={() => setSel(new Set())} className="text-caption text-white/70 hover:text-white">Limpar</button>
        </div>
      )}

      {/* Modal de confirmação (envia + liquida) */}
      {confirmar && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-center z-[80] p-6 overflow-y-auto" onClick={() => !enviando && setConfirmar(null)}>
          <div className="w-[460px] max-w-full my-auto" onClick={(e) => e.stopPropagation()}>
            <Card className="flex flex-col gap-4">
              <span className="text-h3 font-medium text-ink">Enviar pagamento</span>
              <div className="flex flex-col gap-2">
                <Linha label="Pagamentos" value={`${confirmar.length}`} />
                <Linha label="Total" value={formatBRL(confirmar.reduce((s, it) => s + it.amount, 0))} forte />
                <Linha label="Conta de saída" value={contaNome} />
                <Linha label="Método" value={METODOS.find((m) => m.id === metodo)?.label ?? metodo} />
              </div>
              <div className="rounded-md p-3 flex items-start gap-2" style={{ background: "var(--color-surface-2)" }}>
                <Icon name="triangle-alert" size={15} color="var(--color-warning)" className="mt-[2px]" />
                <span className="text-caption text-muted leading-[1.5]">Dinheiro saindo em lote. Ao liquidar, o saldo de <b className="text-ink font-medium">{contaNome}</b> cai e os títulos saem de “A pagar”. Idempotência impede pagamento duplicado.</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-3">
                <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={enviando}>Cancelar</Button>
                <Button variant="primary" onClick={() => executar(confirmar)} disabled={enviando || !conta}>{enviando ? "Enviando…" : "Enviar pagamento"}</Button>
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
