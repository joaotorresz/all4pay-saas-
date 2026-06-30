"use client";

/**
 * Razão (General Ledger) — Fase 1. Mostra o balancete (trial balance), os
 * lançamentos de dupla entrada e permite Backfill (derivar do histórico de
 * movimentos) + postar um lançamento manual balanceado. Demo e live.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, BRL, Button, Icon, Select, CurrencyInput, DatePicker, Input, Skeleton, StatusBadge, InfoHint } from "@/components/ui";
import { getLedgerEntries, balancete, postarLancamento, clearRazao, ingerirOpenFinanceRazao, PLANO, type RazaoLancamento } from "@/lib/ledger";
import { CAIXA } from "@/core/ledger/chart";
import { totais } from "@/core/ledger";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AppShell } from "@/components/app/AppShell";

const fmtDia = (iso: string) => { const [y, m, d] = (iso || "").split("-"); return d ? `${d}/${m}/${y.slice(2)}` : iso; };
const hojeISO = () => new Date().toISOString().slice(0, 10);

export function RazaoView() {
  const qc = useQueryClient();
  const [entries, setEntries] = React.useState<RazaoLancamento[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState<Record<string, boolean>>({});
  const [form, setForm] = React.useState(false);
  // form manual (2 linhas: débito × crédito)
  const [dDeb, setDDeb] = React.useState(CAIXA);
  const [dCred, setDCred] = React.useState("3.1.01");
  const [valor, setValor] = React.useState(0);
  const [data, setData] = React.useState(hojeISO());
  const [desc, setDesc] = React.useState("");

  const recarregar = React.useCallback(async () => {
    try { setEntries(await getLedgerEntries()); } catch { setEntries([]); }
  }, []);
  React.useEffect(() => { recarregar(); }, [recarregar]);

  const bal = React.useMemo(() => (entries ? balancete(entries) : []), [entries]);
  const totDeb = bal.reduce((s, c) => s + c.debito, 0);
  const totCred = bal.reduce((s, c) => s + c.credito, 0);
  const balanceado = Math.round((totDeb - totCred) * 100) === 0;

  const limpar = async () => { clearRazao(); await recarregar(); setMsg("Lançamentos próprios (demo) limpos."); };

  const importarOF = async () => {
    setBusy("of"); setMsg(null);
    try {
      const r = await ingerirOpenFinanceRazao();
      await recarregar();
      setMsg(r.lidas === 0 && isDemo ? "Open Finance disponível só em live (conecte um banco em Contas)." : `Open Finance: ${r.lidas} lida(s), ${r.postadas} postada(s) no razão.`);
    } catch (e) { setMsg(`Falha na importação Open Finance: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const postar = async () => {
    if (valor <= 0 || dDeb === dCred) { setMsg("Informe um valor e contas diferentes."); return; }
    setBusy("post"); setMsg(null);
    try {
      await postarLancamento({
        entryDate: data, description: desc || "Lançamento manual", source: "manual",
        lines: [{ accountId: dDeb, debit: valor }, { accountId: dCred, credit: valor }],
      });
      await recarregar();
      setForm(false); setValor(0); setDesc("");
      setMsg("Lançamento postado.");
      await qc.invalidateQueries();
    } catch (e) { setMsg(`Falha ao postar: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const opcoes = PLANO.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }));

  return (
    <AppShell title="Razão" crumb="Contabilidade" actions={isDemo ? <DemoBadge /> : null}>
      <div className="flex flex-col gap-5 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => setForm((f) => !f)} leftIcon={<Icon name="plus" size={15} />}>Novo lançamento</Button>
          <Button variant="secondary" onClick={importarOF} disabled={busy !== null || isDemo} title={isDemo ? "Disponível em live (Open Finance)" : "Importar transações do Open Finance para o razão"} leftIcon={<Icon name="building" size={15} />}>
            {busy === "of" ? "Importando…" : "Importar Open Finance"}
          </Button>
          {isDemo && (
            <button onClick={limpar} className="text-caption text-muted hover:text-ink underline ml-auto">Limpar lançamentos próprios (demo)</button>
          )}
        </div>
        <span className="text-caption text-faint">O razão é uma <b className="text-muted font-medium">projeção dos movimentos</b> (sempre em sincronia) + os lançamentos próprios do GL (manual, cronogramas, provisões, receita).</span>
        {msg && <span className="text-caption text-muted">{msg}</span>}

        {form && (
          <Card className="flex flex-col gap-4">
            <span className="text-label font-medium text-muted">Novo lançamento (dupla entrada)</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Débito (conta)" value={dDeb} onChange={setDDeb} options={opcoes} />
              <Select label="Crédito (conta)" value={dCred} onChange={setDCred} options={opcoes} />
              <CurrencyInput label="Valor" value={valor} onValueChange={setValor} />
              <DatePicker label="Data" value={data} onChange={setData} />
              <Input label="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} containerClassName="sm:col-span-2" />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={postar} disabled={busy === "post"}>{busy === "post" ? "Postando…" : "Postar (D=C)"}</Button>
            </div>
          </Card>
        )}

        {entries === null ? (
          <Card><Skeleton className="h-40 w-full" /></Card>
        ) : entries.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <span className="text-h3 font-medium text-ink">Razão vazio</span>
            <span className="text-caption text-muted">Lance um movimento (Nova transação) ou importe dados — o razão projeta tudo automaticamente. Você também pode postar um lançamento manual aqui.</span>
          </Card>
        ) : (
          <>
            {/* Balancete (trial balance) */}
            <Card padded={false}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-soft">
                <span className="text-label font-medium text-muted inline-flex items-center gap-1">Balancete<InfoHint align="left" titulo="Balancete" oQue="Resumo por conta de quanto entrou no débito e no crédito, com o saldo de cada uma." comoCalcula="Soma os débitos e créditos de cada conta nos lançamentos; o razão fecha quando o total de débito é igual ao de crédito." /></span>
                <StatusBadge tone={balanceado ? "positive" : "warning"}>{balanceado ? "Razão balanceado ✓" : "Desbalanceado"}</StatusBadge>
              </div>
              <div className="hidden sm:flex items-center gap-3 px-5 py-2 text-caption font-medium text-muted border-b border-border-soft">
                <span className="flex-1">Conta</span>
                <span className="w-[120px] text-right">Débito</span>
                <span className="w-[120px] text-right">Crédito</span>
                <span className="w-[120px] text-right">Saldo</span>
              </div>
              {bal.map((c, i) => (
                <div key={c.conta} className={`flex items-center gap-3 px-3 sm:px-5 py-2 ${i ? "border-t border-border-soft" : ""}`}>
                  <span className="flex-1 min-w-0 truncate text-[15px] text-ink">{c.conta} · {c.nome}</span>
                  <span className="hidden sm:block w-[120px] text-right tabular-nums text-muted"><BRL value={c.debito} /></span>
                  <span className="hidden sm:block w-[120px] text-right tabular-nums text-muted"><BRL value={c.credito} /></span>
                  <span className="w-[120px] text-right tabular-nums text-ink font-medium"><BRL value={c.saldo} /></span>
                </div>
              ))}
              <div className="flex items-center gap-3 px-5 py-2 border-t border-border-soft text-caption font-medium">
                <span className="flex-1 text-muted">Totais</span>
                <span className="hidden sm:block w-[120px] text-right tabular-nums text-ink"><BRL value={totDeb} /></span>
                <span className="hidden sm:block w-[120px] text-right tabular-nums text-ink"><BRL value={totCred} /></span>
                <span className="w-[120px] text-right tabular-nums text-faint">{balanceado ? "0" : <BRL value={totDeb - totCred} />}</span>
              </div>
            </Card>

            {/* Lançamentos */}
            <Card padded={false}
              info={{ titulo: "Lançamentos", oQue: "Cada registro de dupla entrada do razão, com suas linhas de débito e crédito ao abrir.", comoCalcula: "Reúne os lançamentos projetados dos movimentos mais os manuais, cronogramas e provisões." }}>
              <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Lançamentos · {entries.length}</div>
              {entries.slice(0, 200).map((e, i) => {
                const on = aberto[e.id];
                const t = totais(e.linhas.map((l) => ({ accountId: l.conta, debit: l.debito, credit: l.credito })));
                return (
                  <div key={e.id} className={i ? "border-t border-border-soft" : ""}>
                    <button onClick={() => setAberto((a) => ({ ...a, [e.id]: !a[e.id] }))} className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 text-left hover:bg-surface-1">
                      <Icon name={on ? "chevron-down" : "chevron-right"} size={15} color="var(--color-text-tertiary)" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-ink truncate">{e.descricao}</div>
                        <div className="text-caption text-faint">{fmtDia(e.data)} · {e.origem}</div>
                      </div>
                      <span className="tabular-nums text-ink shrink-0"><BRL value={t.debito} /></span>
                    </button>
                    {on && (
                      <div className="px-3 sm:px-12 pb-3 pt-1 bg-surface-1/40 flex flex-col gap-1">
                        {e.linhas.map((l, k) => (
                          <div key={k} className="flex items-center justify-between gap-3 text-caption py-1">
                            <span className="text-muted truncate">{l.conta} · {l.nome}</span>
                            <span className="flex items-center gap-4 tabular-nums shrink-0">
                              <span className="w-[100px] text-right text-ink">{l.debito ? <BRL value={l.debito} /> : "—"}</span>
                              <span className="w-[100px] text-right text-ink">{l.credito ? <BRL value={l.credito} /> : "—"}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
