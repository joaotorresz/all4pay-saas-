"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Skeleton } from "@/components/ui";
import { getAccountsList, getRiscoInput } from "@/lib/data";
import { treasuryCore } from "@/core/treasury";
import { useToast } from "@/components/listas/ListChrome";
import { EditAccountModal } from "./EditAccountModal";
import type { FinancialAccount } from "@/lib/types";

const BANCO: Record<string, string> = {
  itau: "Itaú", bradesco: "Bradesco", nubank: "Nubank", inter: "Inter",
  caixa: "Caixa", santander: "Santander", bb: "Banco do Brasil", btg: "BTG",
};
const labelBanco = (b: string) => BANCO[b] ?? (b ? b[0].toUpperCase() + b.slice(1) : "—");
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Contas financeiras — posição consolidada por conta/banco (Treasury Core).
 *  É o "ver o saldo de manhã" que faltava (esqueleto do RECEBER/CONTAS). */
export function ContasView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const acc = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const inp = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  const [editing, setEditing] = React.useState<FinancialAccount | null>(null);

  if (acc.isLoading || inp.isLoading) return <Skeleton className="h-[280px]" />;
  if (!acc.data || !inp.data) return <Card><span className="text-caption text-faint">Sem contas cadastradas.</span></Card>;

  const t = treasuryCore(acc.data, inp.data);

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Posição consolidada + liquidez */}
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

      {/* Contas */}
      <Card padded={false}>
        <div className="px-5 pt-[16px] pb-2 flex items-center justify-between">
          <span className="text-body font-medium text-ink">Contas financeiras</span>
          <span className="text-caption text-faint">{t.contas.length}</span>
        </div>
        <div className="hidden md:grid grid-cols-[1.6fr_1fr_0.8fr_1fr] gap-3 px-5 py-2 text-caption text-faint border-b border-border-soft">
          <span>Conta</span><span>Banco</span><span className="text-right">% do caixa</span><span className="text-right">Saldo</span>
        </div>
        <div className="flex flex-col">
          {t.contas.map((c) => {
            const conta = (acc.data ?? []).find((a) => a.id === c.id);
            return (
              <button
                key={c.id}
                onClick={() => conta && setEditing(conta)}
                title="Editar conta"
                className="grid grid-cols-[1.6fr_1fr_0.8fr_1fr] gap-3 items-center px-5 py-3 border-t border-border-soft first:border-t-0 text-left w-full hover:bg-surface-1 transition-colors"
              >
                <span className="text-[14px] text-ink truncate inline-flex items-center gap-2">
                  {c.nome}
                  <Icon name="settings" size={13} color="var(--color-text-tertiary)" />
                </span>
                <span className="text-caption text-muted">{labelBanco(c.banco)}</span>
                <span className="text-caption text-muted tabular-nums text-right">{pct(c.share)}</span>
                <span className="text-caption text-ink tabular-nums text-right"><BRL value={c.saldo} /></span>
              </button>
            );
          })}
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
          onSaved={async (msg) => { show(msg); await qc.invalidateQueries(); }}
        />
      )}
      {node}
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
function Linha({ k, v, cor, forte }: { k: string; v: React.ReactNode; cor: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-caption ${forte ? "text-ink font-medium" : "text-muted"}`}>{k}</span>
      <span className={`tabular-nums ${forte ? "text-body" : "text-caption"}`} style={{ color: cor }}>{v}</span>
    </div>
  );
}
