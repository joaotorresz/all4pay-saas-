"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Select, CurrencyInput, Input } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";
import { getRecebiveisBoleto, getAccountsList } from "@/lib/data";
import { listParties } from "@/lib/cadastros";
import { useInadimplencia } from "@/components/visao-geral/hooks";
import { emitirBoleto, marcarPagoBoleto, cancelarBoleto, statusEfetivo, type OpcoesBoleto } from "@/lib/boletos";
import { isoDay } from "@/lib/aggregations";
import type { Movement, Party, FinancialAccount, BoletoStatus } from "@/lib/types";

const ST: Record<BoletoStatus, { label: string; cor: string }> = {
  gerado: { label: "Gerado", cor: "var(--color-muted)" },
  registrado: { label: "Registrado", cor: "var(--color-muted)" },
  emitido: { label: "Emitido", cor: "var(--color-warning)" },
  pago: { label: "Pago", cor: "var(--color-positive)" },
  vencido: { label: "Vencido", cor: "var(--color-negative)" },
  cancelado: { label: "Cancelado", cor: "var(--color-faint)" },
  conciliado: { label: "Conciliado", cor: "var(--color-positive)" },
};
const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

export function BoletosView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const recs = useQuery({ queryKey: ["recebiveis-boleto"], queryFn: getRecebiveisBoleto });
  const parties = useQuery({ queryKey: ["parties-list"], queryFn: listParties });
  const contas = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const inad = useInadimplencia();
  const [emitindo, setEmitindo] = React.useState<Movement | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const hoje = isoDay(new Date());

  const nomeDe = (m: Movement) => {
    const p = m.party_id ? (parties.data ?? []).find((x: Party) => x.id === m.party_id) : undefined;
    return p?.name || m.description || m.category || "Cliente";
  };

  const lista = recs.data ?? [];
  const venceMes = lista.filter((m) => m.status === "pendente" && m.due_date.slice(0, 7) === hoje.slice(0, 7)).reduce((s, m) => s + m.amount, 0);
  const prox30 = lista.filter((m) => m.status === "pendente" && m.due_date >= hoje && m.due_date <= isoDay(new Date(Date.now() + 30 * 864e5))).reduce((s, m) => s + m.amount, 0);

  const refresh = async () => { await qc.invalidateQueries(); };

  const confirmarEmissao = async (opts: OpcoesBoleto) => {
    if (!emitindo) return;
    setBusy(emitindo.id);
    try {
      await emitirBoleto(emitindo, opts);
      setEmitindo(null);
      await refresh();
      show("Boleto emitido — nosso número e linha digitável gerados (mock do trilho)");
    } finally { setBusy(null); }
  };
  const pagar = async (m: Movement) => {
    setBusy(m.id);
    try { await marcarPagoBoleto(m); await refresh(); show("Boleto pago → conciliado automático; o recebível liquidou e o saldo subiu"); }
    finally { setBusy(null); }
  };
  const cancelar = async (m: Movement) => { setBusy(m.id); try { await cancelarBoleto(m); await refresh(); show("Boleto cancelado"); } finally { setBusy(null); } };
  const enviar = (m: Movement) => show(`Enviado ao pagador via Cobrança (WhatsApp/e-mail) — ${nomeDe(m)}`); // reusa Cobrança existente

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Dashboard de cobranças — reusa analisarInadimplencia (aging) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Vence neste mês" v={venceMes} />
        <Kpi label="Próximos 30 dias" v={prox30} />
        <Kpi label="Inadimplência (vencido)" v={inad.data?.resumo.exposicaoVencida ?? 0} tone="var(--color-negative)" />
        <Kpi label="Perda esperada" v={inad.data?.resumo.inadimplenciaEsperada ?? 0} tone="var(--color-warning)" />
      </div>

      {inad.data && inad.data.clientes.length > 0 && (
        <Card className="flex flex-col gap-2">
          <span className="text-label font-medium text-muted">Aging — clientes em risco (do motor de inadimplência)</span>
          <div className="flex flex-col gap-1">
            {inad.data.clientes.slice(0, 6).map((c) => (
              <div key={c.clienteId} className="flex items-center justify-between text-caption">
                <span className="text-ink truncate max-w-[50%]">{c.nome}</span>
                <span className="text-muted">score {Math.round(c.score)} · {c.segmento}</span>
                <span className="text-ink tabular-nums"><BRL value={c.features.volumeAberto} /></span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recebíveis → boleto */}
      <Card padded={false}>
        <div className="px-5 pt-[16px] pb-2 flex items-center justify-between">
          <span className="text-body font-medium text-ink">Recebíveis · boletos</span>
          <span className="text-caption text-faint">{lista.length}</span>
        </div>
        <div className="hidden md:grid grid-cols-[1.4fr_0.8fr_0.9fr_1.2fr_1.4fr] gap-3 px-5 py-2 text-caption text-faint border-b border-border-soft">
          <span>Cliente</span><span>Vencimento</span><span className="text-right">Valor</span><span>Boleto</span><span className="text-right">Ações</span>
        </div>
        <div className="flex flex-col max-h-[520px] overflow-y-auto">
          {lista.length === 0 ? (
            <p className="text-caption text-faint text-center py-8">Nenhum recebível em aberto. Faturas de Recorrência aparecem aqui para emitir boleto.</p>
          ) : lista.map((m) => {
            const st = statusEfetivo(m, hoje);
            return (
              <div key={m.id} className="grid grid-cols-[1.4fr_0.8fr_0.9fr_1.2fr_1.4fr] gap-3 items-center px-5 py-3 border-t border-border-soft first:border-t-0">
                <span className="text-[14px] text-ink truncate">{nomeDe(m)}</span>
                <span className="text-caption text-muted tabular-nums">{fmtDia(m.due_date)}</span>
                <span className="text-caption text-ink tabular-nums text-right"><BRL value={m.amount} /></span>
                <span className="text-caption truncate">
                  {st ? (
                    <span className="inline-flex flex-col">
                      <span style={{ color: ST[st].cor }}>{ST[st].label}</span>
                      {m.boleto?.linha_digitavel && <span className="text-faint text-[11px] tabular-nums truncate max-w-[200px]">{m.boleto.linha_digitavel}</span>}
                    </span>
                  ) : <span className="text-faint">sem boleto</span>}
                </span>
                <span className="flex items-center justify-end gap-1 flex-wrap">
                  {!st && <button disabled={busy === m.id} onClick={() => setEmitindo(m)} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-3 py-[4px]">Emitir boleto</button>}
                  {(st === "emitido" || st === "vencido") && <>
                    <button disabled={busy === m.id} onClick={() => pagar(m)} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-2 py-[4px]">Marcar pago</button>
                    <button onClick={() => enviar(m)} className="text-caption font-medium text-ink bg-surface-2 rounded-pill px-2 py-[4px]">Enviar</button>
                    <button onClick={() => cancelar(m)} title="Cancelar" className="inline-flex p-[4px] rounded-md hover:bg-surface-2"><Icon name="x" size={12} color="var(--color-text-tertiary)" /></button>
                  </>}
                  {(st === "conciliado" || st === "pago") && <span className="inline-flex items-center gap-1 text-caption text-positive"><Icon name="check" size={12} color="var(--color-positive)" /> conciliado</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-border-soft">
          <span className="text-caption text-faint">Boleto próprio: ao marcar pago, concilia automático (não passa pelo /conciliacao) e o saldo sobe. Emissão real do trilho fica como integração PSP (mockada).</span>
        </div>
      </Card>

      {/* Modal de emissão */}
      {emitindo && <EmitirModal mov={emitindo} contas={contas.data ?? []} busy={busy === emitindo.id} onClose={() => setEmitindo(null)} onConfirm={confirmarEmissao} nome={nomeDe(emitindo)} />}
      {node}
    </div>
  );
}

function EmitirModal({ mov, contas, busy, onClose, onConfirm, nome }: {
  mov: Movement; contas: FinancialAccount[]; busy: boolean; onClose: () => void; onConfirm: (o: OpcoesBoleto) => void; nome: string;
}) {
  const [multa, setMulta] = React.useState(0);
  const [juros, setJuros] = React.useState(0);
  const [desconto, setDesconto] = React.useState(0);
  const [instrucoes, setInstrucoes] = React.useState("");
  const [conta, setConta] = React.useState(mov.account_id || (contas[0]?.id ?? ""));
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-center z-[80] p-6 overflow-y-auto" onClick={() => !busy && onClose()}>
      <div className="w-[460px] max-w-full my-auto" onClick={(e) => e.stopPropagation()}>
        <Card className="flex flex-col gap-3">
          <span className="text-h3 font-medium text-ink">Emitir boleto</span>
          <div className="flex items-center justify-between text-caption"><span className="text-faint">Pagador</span><span className="text-ink">{nome}</span></div>
          <div className="flex items-center justify-between text-caption"><span className="text-faint">Valor · vencimento</span><span className="text-ink tabular-nums"><BRL value={mov.amount} /> · {fmtDia(mov.due_date)}</span></div>
          <Select label="Conta de recebimento" value={conta} onChange={setConta} options={contas.map((c) => ({ value: c.id, label: c.name }))} />
          <div className="grid grid-cols-3 gap-2">
            <CurrencyInput label="Multa" value={multa} onValueChange={setMulta} />
            <CurrencyInput label="Juros" value={juros} onValueChange={setJuros} />
            <CurrencyInput label="Desconto" value={desconto} onValueChange={setDesconto} />
          </div>
          <Input label="Instruções" value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} placeholder="Ex.: não receber após 30 dias" />
          <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-3">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button variant="primary" onClick={() => onConfirm({ multa, juros, desconto, instrucoes: instrucoes.trim() || undefined, conta })} disabled={busy}>{busy ? "Emitindo…" : "Emitir boleto"}</Button>
          </div>
          <span className="text-caption text-faint">{/* TODO INTEGRAÇÃO PSP */}O registro no banco emissor é simulado — nosso número e linha digitável são gerados para destravar o ciclo.</span>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, v, tone = "var(--color-ink)" }: { label: string; v: number; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-h3 font-medium tabular-nums leading-none" style={{ color: tone }}><BRL value={v} /></span>
    </Card>
  );
}
