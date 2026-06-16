"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Skeleton } from "@/components/ui";
import { getAccountsList, getRiscoInput, getBankAccounts, setBankAccountSource, linkBankAccount } from "@/lib/data";
import { treasuryCore } from "@/core/treasury";
import { useToast } from "@/components/listas/ListChrome";
import { EditAccountModal } from "./EditAccountModal";
import { unificarContas, contasEfetivas, type ContaUnificada } from "@/lib/contas-unificadas";
import type { FinancialAccount } from "@/lib/types";

const BANCO: Record<string, string> = {
  itau: "Itaú", bradesco: "Bradesco", nubank: "Nubank", inter: "Inter",
  caixa: "Caixa", santander: "Santander", bb: "Banco do Brasil", btg: "BTG",
};
const labelBanco = (b: string) => BANCO[b] ?? (b ? b[0].toUpperCase() + b.slice(1) : "—");
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Open Finance — posição consolidada unificando contas manuais + bancárias
 *  (bank_accounts), sem duplicar (vínculo 2A) e com escolha do saldo oficial (1C). */
export function ContasView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const acc = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const inp = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  const bank = useQuery({ queryKey: ["bank-accounts"], queryFn: getBankAccounts });
  const [editing, setEditing] = React.useState<FinancialAccount | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const reload = async () => { await qc.invalidateQueries(); };

  if (acc.isLoading || inp.isLoading) return <Skeleton className="h-[280px]" />;
  if (!acc.data || !inp.data) return <Card><span className="text-caption text-faint">Sem contas cadastradas.</span></Card>;

  const unificadas = unificarContas(acc.data, bank.data ?? []);
  const t = treasuryCore(contasEfetivas(unificadas), inp.data);

  const escolherOficial = async (c: ContaUnificada, source: "open_finance" | "manual") => {
    if (!c.bankAccountId) return;
    setBusy(c.key);
    try { await setBankAccountSource(c.bankAccountId, source); show("Saldo oficial atualizado"); await reload(); }
    catch { show("Não foi possível atualizar"); }
    finally { setBusy(null); }
  };
  const vincular = async (c: ContaUnificada) => {
    if (!c.bankAccountId || !c.duplicataCom) return;
    if (!window.confirm("Vincular esta conta do Open Finance à conta manual de mesmo banco? Os saldos passam a contar como uma só conta.")) return;
    setBusy(c.key);
    try { await linkBankAccount(c.bankAccountId, c.duplicataCom); show("Contas vinculadas"); await reload(); }
    catch { show("Não foi possível vincular"); }
    finally { setBusy(null); }
  };
  const editar = (c: ContaUnificada) => {
    const conta = (acc.data ?? []).find((a) => a.id === c.financialAccountId);
    if (conta) setEditing(conta);
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Posição consolidada + liquidez (inclui Open Finance) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="flex flex-col gap-1 md:col-span-1">
          <span className="text-caption text-faint">Posição consolidada</span>
          <span className="text-value-lg font-medium tabular-nums text-ink leading-none"><BRL value={t.posicaoTotal} /></span>
        </Card>
        <Kpi label="Liquidez imediata" v={t.liquidez.imediata} />
        <Kpi label="Curto prazo (30d)" v={t.liquidez.curto30} />
        <Kpi label="Projetada (90d)" v={t.liquidez.projetada90} tone={t.liquidez.projetada90 < 0 ? "var(--color-negative)" : "var(--color-ink)"} />
      </div>

      {/* Exposição + concentração */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <Card className="flex flex-col gap-3 lg:col-span-1">
          <span className="text-label font-medium text-muted">Exposição</span>
          <Linha k="A receber" v={<BRL value={t.exposicao.aReceber} />} cor="var(--color-positive)" />
          <Linha k="A pagar" v={<BRL value={t.exposicao.aPagar} />} cor="var(--color-ink)" />
          <div className="border-t border-border-soft pt-2">
            <Linha k="Líquida" v={<span>{t.exposicao.liquida < 0 ? "−" : ""}<BRL value={Math.abs(t.exposicao.liquida)} /></span>} cor={t.exposicao.liquida < 0 ? "var(--color-negative)" : "var(--color-positive)"} forte />
          </div>
        </Card>

        <Card className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-label font-medium text-muted">Concentração bancária</span>
            <span className="text-caption text-faint">HHI {Math.round(t.concentracaoBancariaHHI)} · maior banco {pct(t.topBancoShare)}</span>
          </div>
          <div className="flex flex-col gap-2">
            {t.bancos.map((b) => (
              <div key={b.banco} className="flex items-center gap-3">
                <span className="text-caption text-ink w-[120px] truncate">{labelBanco(b.banco)}</span>
                <div className="flex-1 h-[8px] rounded-pill bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-pill bg-ink" style={{ width: `${Math.max(2, b.share * 100)}%` }} />
                </div>
                <span className="text-caption tabular-nums text-muted w-[42px] text-right">{pct(b.share)}</span>
                <span className="text-caption tabular-nums text-ink w-[110px] text-right"><BRL value={b.saldo} /></span>
              </div>
            ))}
          </div>
          {t.topBancoShare > 0.6 && (
            <span className="text-caption text-warning">Atenção: mais de 60% do caixa num só banco — risco de concentração.</span>
          )}
        </Card>
      </div>

      {/* Contas (manuais + Open Finance, unificadas) */}
      <Card padded={false}>
        <div className="px-5 pt-[16px] pb-2 flex items-center justify-between">
          <span className="text-body font-medium text-ink">Contas</span>
          <span className="text-caption text-faint">{unificadas.length}</span>
        </div>
        <div className="flex flex-col">
          {unificadas.length === 0 ? (
            <span className="text-caption text-faint px-5 py-4">Nenhuma conta. Cadastre uma conta ou conecte um banco (Open Finance).</span>
          ) : unificadas.map((c) => (
            <div key={c.key} className="flex items-center gap-3 px-5 py-3 border-t border-border-soft first:border-t-0">
              <div className="flex-1 min-w-0">
                <span className="text-[15px] text-ink truncate inline-flex items-center gap-2">
                  {c.nome}
                  <OrigemBadge origem={c.origem} />
                </span>
                <div className="text-caption text-faint truncate">{labelBanco(c.banco)}</div>
                {c.duplicataCom && (
                  <button onClick={() => vincular(c)} disabled={busy === c.key} className="text-caption text-warning underline mt-[2px] disabled:opacity-45">
                    Possível conta duplicada — vincular?
                  </button>
                )}
              </div>

              {c.origem === "vinculada" ? (
                <div className="flex flex-col items-end gap-[3px]">
                  <SaldoEscolha label="Open Finance" v={c.saldoOF ?? 0} oficial={c.balanceSource !== "manual"} onClick={() => escolherOficial(c, "open_finance")} />
                  <SaldoEscolha label="Manual" v={c.saldoManual ?? 0} oficial={c.balanceSource === "manual"} onClick={() => escolherOficial(c, "manual")} />
                </div>
              ) : (
                <span className="text-caption text-ink tabular-nums w-[120px] text-right"><BRL value={c.saldoEfetivo} /></span>
              )}

              {c.financialAccountId && (
                <button onClick={() => editar(c)} className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2 shrink-0">Editar</button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Cash positioning — próximas semanas */}
      {t.cashPositioning.length > 0 && (
        <Card className="flex flex-col gap-3">
          <span className="text-label font-medium text-muted">Posicionamento de caixa — próximas semanas</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {t.cashPositioning.map((w) => (
              <div key={w.semana} className="flex flex-col gap-[2px] rounded-md border border-border-soft p-2">
                <span className="text-caption text-faint">{w.semana} · {w.periodo}</span>
                <span className="text-caption text-positive tabular-nums">+<BRL value={w.entradas} /></span>
                <span className="text-caption text-muted tabular-nums">−<BRL value={w.saidas} /></span>
                <span className="text-caption font-medium tabular-nums border-t border-border-soft pt-1" style={{ color: w.acumulado < 0 ? "var(--color-negative)" : "var(--color-ink)" }}>
                  {w.acumulado < 0 ? "−" : ""}<BRL value={Math.abs(w.acumulado)} />
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {editing && (
        <EditAccountModal
          conta={editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { show(msg); await reload(); }}
        />
      )}
      {node}
    </div>
  );
}

function OrigemBadge({ origem }: { origem: ContaUnificada["origem"] }) {
  const map = {
    manual: { label: "Manual", cls: "bg-surface-2 text-muted" },
    open_finance: { label: "Open Finance", cls: "bg-lime-tint text-ink" },
    vinculada: { label: "Vinculada", cls: "bg-lime-tint text-ink" },
  } as const;
  const m = map[origem];
  return <span className={`text-[11px] rounded-pill px-2 py-[1px] ${m.cls}`}>{m.label}</span>;
}

function SaldoEscolha({ label, v, oficial, onClick }: { label: string; v: number; oficial: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={oficial ? "Saldo oficial" : "Definir como oficial"} className="inline-flex items-center gap-2">
      {oficial ? <Icon name="check" size={12} color="var(--color-positive)" /> : <span className="inline-block w-3 h-3 rounded-pill border border-border" />}
      <span className="text-[12px] text-faint">{label}</span>
      <span className={`text-caption tabular-nums ${oficial ? "text-ink font-medium" : "text-muted"}`}><BRL value={v} /></span>
    </button>
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
function Linha({ k, v, cor, forte }: { k: string; v: React.ReactNode; cor: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-caption ${forte ? "text-ink font-medium" : "text-muted"}`}>{k}</span>
      <span className={`tabular-nums ${forte ? "text-body" : "text-caption"}`} style={{ color: cor }}>{v}</span>
    </div>
  );
}
