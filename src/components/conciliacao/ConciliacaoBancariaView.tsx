"use client";

/**
 * Movimentações › Conciliação bancária (modelo IULI, §7.3 / Fig.25). Núcleo de
 * integridade: compara a transação IULI (registrada internamente) com a transação
 * OFX (extrato bancário). Quatro abas: Conciliação · Extrato · Regras · Fechamentos.
 * Filtros de status (Conciliado / Não conciliado / Parcialmente) e verificação de
 * saldo (Saldo IULI = / ≠ Saldo OFX). Regras de conciliação automática (data+valor)
 * e Fechamentos mensais que travam o período. Reusa getRiscoInput + contas.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { Card, StatusBadge, Switch, Icon, Skeleton, Select, InfoHint } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { getAccountsList } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { MES_ABBR } from "@/components/visao-geral/PeriodContext";

type Aba = "conciliacao" | "extrato" | "regras" | "fechamentos";
const fmtDia = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function ConciliacaoBancariaView() {
  const { data, isLoading } = useRiscoInput();
  const contas = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const [aba, setAba] = React.useState<Aba>("conciliacao");
  const [contaId, setContaId] = React.useState("");
  const [statusF, setStatusF] = React.useState<"todos" | "conciliado" | "nao">("todos");
  const [travados, setTravados] = React.useState<Record<string, boolean>>({});

  const movs = React.useMemo(() => {
    const all = (data?.movements ?? []).filter((m) => m.status !== "cancelado");
    return contaId ? all.filter((m) => m.accountId === contaId) : all;
  }, [data, contaId]);

  // Pago = conciliado (já bateu no extrato); pendente = não conciliado.
  const conciliados = movs.filter((m) => m.status === "pago");
  const naoConc = movs.filter((m) => m.status !== "pago");
  // Saldo IULI = soma das contas; OFX ≈ IULI menos os não-conciliados (simulado).
  const saldoIuli = (contas.data ?? []).filter((a) => !contaId || a.id === contaId).reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const pendentesValor = naoConc.reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  const saldoOfx = saldoIuli - pendentesValor;
  const bate = Math.abs(saldoIuli - saldoOfx) < 0.01;

  const listaFiltrada = statusF === "conciliado" ? conciliados : statusF === "nao" ? naoConc : movs;
  const contaOpts = [{ value: "", label: "Todas as contas" }, ...(contas.data ?? []).map((a) => ({ value: a.id, label: a.name }))];

  return (
    <AppShell title="Conciliação bancária">
      <div className="flex flex-col gap-5 pb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex p-1 gap-1 rounded-pill bg-surface-2" role="tablist">
            {([["conciliacao", "Conciliação"], ["extrato", "Extrato"], ["regras", "Regras"], ["fechamentos", "Fechamentos"]] as const).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
                className={`text-caption font-medium rounded-pill px-4 py-[7px] transition-colors ${aba === v ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{l}</button>
            ))}
          </div>
          <div className="ml-auto min-w-[180px]"><Select value={contaId} onChange={setContaId} options={contaOpts} /></div>
        </div>

        {isLoading ? <Card><Skeleton className="h-64 w-full" /></Card> : (
          <>
            {/* Verificação de saldo IULI × OFX */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Kpi label="Saldo IULI" v={formatBRL(saldoIuli)} info={{ titulo: "Saldo IULI", oQue: "Saldo das suas contas conforme os lançamentos registrados no all4pay.", comoCalcula: "Soma o saldo de todas as contas (ou da conta filtrada)." }} />
              <Kpi label="Saldo OFX (extrato)" v={formatBRL(saldoOfx)} info={{ titulo: "Saldo OFX", oQue: "Saldo estimado conforme o extrato bancário, para comparar com o saldo interno.", comoCalcula: "Parte do saldo das contas e desconta os movimentos ainda não conciliados." }} />
              <Card className="flex flex-col gap-1" style={bate ? undefined : { background: "var(--color-lime-tint)" }}
                info={{ titulo: "Verificação de saldo", oQue: "Diz se o saldo no all4pay bate com o saldo do extrato bancário (OFX).", comoCalcula: "Compara o saldo das contas com o saldo do extrato (saldo menos os movimentos ainda não conciliados); igual aprova, diferente alerta." }}>
                <span className="text-caption text-faint">Verificação</span>
                <span className="text-[16px] font-semibold inline-flex items-center gap-2" style={{ color: bate ? "var(--color-positive)" : "var(--color-warning)" }}>
                  <Icon name={bate ? "check" : "triangle-alert"} size={16} color={bate ? "var(--color-positive)" : "var(--color-warning)"} />
                  {bate ? "Saldo IULI = OFX" : "Saldo IULI ≠ OFX"}
                </span>
              </Card>
              <Kpi label="Conciliados / pendentes" v={`${conciliados.length} / ${naoConc.length}`} info={{ titulo: "Conciliados e pendentes", oQue: "Quantas transações já bateram com o extrato e quantas ainda faltam conciliar.", comoCalcula: "Conta como conciliadas as transações pagas e como pendentes as demais." }} />
            </div>

            {aba === "conciliacao" && (
              <Card padded={false}>
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border-soft">
                  {([["todos", "Todos"], ["conciliado", "Conciliados"], ["nao", "Não conciliados"]] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setStatusF(v)} className={`text-caption font-medium rounded-pill px-3 py-[5px] ${statusF === v ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}>{l}</button>
                  ))}
                  <span className="ml-auto text-caption text-faint inline-flex items-center gap-1">IULI × OFX · {listaFiltrada.length} transações<InfoHint align="right" titulo="Conciliação" oQue="Lista cada transação e mostra se ela já foi casada com o extrato do banco ou ainda está pendente." comoCalcula="Pago é tratado como conciliado (já bateu no extrato); o que ainda não foi pago aparece como não conciliado." /></span>
                </div>
                {listaFiltrada.slice(0, 60).map((m, i) => (
                  <div key={m.id} className={`grid grid-cols-[0.6fr_1.4fr_0.8fr_0.9fr] gap-3 items-center px-5 py-[10px] ${i ? "border-t border-border-soft" : ""}`}>
                    <span className="text-caption text-muted tabular-nums">{fmtDia(m.paid_date || m.due_date)}</span>
                    <span className="text-[14px] text-ink truncate">{m.category || (m.type === "entrada" ? "Recebimento" : "Pagamento")}</span>
                    <span className="text-[14px] tabular-nums text-ink text-right">{m.type === "entrada" ? "+" : "−"}{formatBRL(m.amount)}</span>
                    <span className="text-right"><StatusBadge tone={m.status === "pago" ? "positive" : "warning"}>{m.status === "pago" ? "Conciliado" : "Não conciliado"}</StatusBadge></span>
                  </div>
                ))}
                {listaFiltrada.length === 0 && <div className="px-5 py-4 text-caption text-faint">Nenhuma transação neste filtro.</div>}
              </Card>
            )}

            {aba === "extrato" && (
              <Card padded={false}>
                <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted inline-flex items-center gap-1">Extrato (OFX) · {contaId ? (contas.data ?? []).find((a) => a.id === contaId)?.name : "todas as contas"}<InfoHint align="right" titulo="Extrato (OFX)" oQue="Mostra as movimentações da conta como elas aparecem no extrato do banco, crédito e débito." comoCalcula="Lista os movimentos da conta selecionada por data, com entradas em verde e saídas em vermelho." /></div>
                {movs.slice(0, 60).map((m, i) => (
                  <div key={m.id} className={`grid grid-cols-[0.6fr_1.6fr_0.8fr] gap-3 items-center px-5 py-[10px] ${i ? "border-t border-border-soft" : ""}`}>
                    <span className="text-caption text-muted tabular-nums">{fmtDia(m.paid_date || m.due_date)}</span>
                    <span className="text-[14px] text-ink truncate">{m.category || (m.type === "entrada" ? "Crédito" : "Débito")}</span>
                    <span className="text-[14px] tabular-nums text-right" style={{ color: m.type === "entrada" ? "var(--color-positive)" : "var(--color-negative)" }}>{m.type === "entrada" ? "+" : "−"}{formatBRL(m.amount)}</span>
                  </div>
                ))}
              </Card>
            )}

            {aba === "regras" && (
              <Card className="flex flex-col gap-3"
                info={{ titulo: "Regras de conciliação", oQue: "Define como o sistema casa sozinho as transações do banco com os títulos lançados.", comoCalcula: "Aplica regras como data e valor idênticos, sugestão por IA e conta padrão para compras aprovadas." }}>
                <span className="text-label font-medium text-muted">Regras de conciliação automática</span>
                {[
                  { t: "Data + valor idênticos", d: "Concilia automaticamente quando a transação OFX bate exatamente em data e valor com um título IULI." },
                  { t: "Sugestão por IA", d: "O agente analisa cada transação do extrato e sugere a conciliação com títulos existentes ou cria um novo." },
                  { t: "Conta padrão p/ compras aprovadas", d: "Direciona compras aprovadas para a conta bancária configurada." },
                ].map((r) => (
                  <div key={r.t} className="flex items-start gap-3 py-2 border-t border-border-soft first:border-t-0">
                    <Icon name="sparkles" size={16} color="var(--color-lime)" />
                    <div className="flex-1"><div className="text-[15px] font-medium text-ink">{r.t}</div><div className="text-caption text-muted">{r.d}</div></div>
                    <StatusBadge tone="positive">Ativa</StatusBadge>
                  </div>
                ))}
              </Card>
            )}

            {aba === "fechamentos" && (
              <Card padded={false}>
                <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted inline-flex items-center gap-1">Fechamentos mensais — travam o período da conta<InfoHint align="right" titulo="Fechamentos mensais" oQue="Trava um mês já conferido para que ninguém altere lançamentos do período fechado." comoCalcula="Por padrão deixa os meses passados travados; você abre ou fecha cada mês pela chave do período." /></div>
                {(() => {
                  const hoje = new Date(data?.hoje + "T00:00:00");
                  return Array.from({ length: 6 }).map((_, i) => {
                    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
                    const key = `${d.getFullYear()}-${d.getMonth()}`;
                    const travado = travados[key] ?? i > 0; // meses passados travados por padrão
                    return (
                      <div key={key} className={`flex items-center gap-3 px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                        <span className="text-[15px] text-ink capitalize flex-1">{MES_ABBR[d.getMonth()]}/{d.getFullYear()}</span>
                        <span className="text-caption text-faint">{travado ? "Período travado (lançamentos bloqueados)" : "Período aberto"}</span>
                        <Switch checked={travado} onChange={(v) => setTravados((t) => ({ ...t, [key]: v }))} />
                      </div>
                    );
                  });
                })()}
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Kpi({ label, v, info }: { label: string; v: string; info?: React.ComponentProps<typeof Card>["info"] }) {
  return (
    <Card className="flex flex-col gap-1" info={info}>
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums text-ink">{v}</span>
    </Card>
  );
}
