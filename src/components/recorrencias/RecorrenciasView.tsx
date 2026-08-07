"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Input, Select, CurrencyInput, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";
import { listParties, listProducts, listServices } from "@/lib/cadastros";
import {
  listRecorrencias, criarRecorrencia, ativarRecorrencia, encerrarRecorrencia,
  kpisRecorrencia, projetarProximasFaturas, totalFatura, rolarRecorrencias, CICLOS,
  type Recorrencia, type ItemRec, type Ciclo, type StatusRec,
} from "@/lib/recorrencias";
import { criarNfse, transmitirNfse } from "@/lib/nfse";
import type { Party } from "@/lib/types";

const STATUS: Record<StatusRec, { label: string; cor: string }> = {
  rascunho: { label: "Rascunho", cor: "var(--color-muted)" },
  ativa: { label: "Ativa", cor: "var(--color-positive)" },
  pausada: { label: "Pausada", cor: "var(--color-warning)" },
  cancelada: { label: "Cancelada", cor: "var(--color-negative)" },
};
const CATEGORIAS = ["Assinatura de software", "Serviço recorrente", "Manutenção", "Licença", "Mensalidade"];
const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

export function RecorrenciasView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const parties = useQuery({ queryKey: ["parties-list"], queryFn: listParties });
  const prods = useQuery({ queryKey: ["produtos-list"], queryFn: listProducts });
  const servs = useQuery({ queryKey: ["servicos-list"], queryFn: listServices });

  const [lista, setLista] = React.useState<Recorrencia[]>([]);
  const [aberto, setAberto] = React.useState<string | null>(null);
  React.useEffect(() => {
    // N6 — roll-forward: materializa novas faturas conforme o tempo passa.
    rolarRecorrencias().then(async (n) => { setLista(listRecorrencias()); if (n) await qc.invalidateQueries(); });
  }, [qc]);
  const refresh = async () => { setLista(listRecorrencias()); await qc.invalidateQueries(); };
  const kpis = kpisRecorrencia();

  // catálogo combinado
  const catalogo = React.useMemo(() => [
    ...(prods.data ?? []).map((p) => ({ nome: p.name, valor: p.sale_price ?? 0 })),
    ...(servs.data ?? []).map((s) => ({ nome: s.name, valor: s.price ?? 0 })),
  ], [prods.data, servs.data]);
  const clientes = (parties.data ?? []).filter((p: Party) => p.is_customer !== false);

  // form
  const [titulo, setTitulo] = React.useState("");
  const [clienteId, setClienteId] = React.useState("");
  const [ciclo, setCiclo] = React.useState<Ciclo>("mensal");
  const [dia, setDia] = React.useState(5);
  const [classificacao, setClassificacao] = React.useState(CATEGORIAS[0]);
  const [itens, setItens] = React.useState<ItemRec[]>([{ nome: "", valor: 0, qtd: 1 }]);

  const setItem = (i: number, patch: Partial<ItemRec>) => setItens((a) => a.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const totalForm = itens.reduce((s, it) => s + it.valor * it.qtd, 0);

  const criar = async () => {
    const cli = clientes.find((c: Party) => c.id === clienteId);
    const validos = itens.filter((it) => it.nome.trim() && it.valor > 0);
    if (!titulo.trim() || !cli || !validos.length) { show("Informe título, cliente e ao menos um item"); return; }
    await criarRecorrencia({ titulo: titulo.trim(), clienteId, clienteNome: cli.name, itens: validos, ciclo, diaFaturamento: dia, classificacao });
    setTitulo(""); setClienteId(""); setItens([{ nome: "", valor: 0, qtd: 1 }]);
    await refresh();
    show("Recorrência criada como rascunho — ative para projetar as faturas");
  };

  const ativar = async (r: Recorrencia) => { await ativarRecorrencia(r.id); await refresh(); show("Ativada — próximas faturas entram no previsto (/recebiveis, fluxo, DRE)"); };
  const encerrar = async (r: Recorrencia, st: "pausada" | "cancelada") => { await encerrarRecorrencia(r.id, st); await refresh(); show(st === "cancelada" ? "Cancelada (churn) — faturas previstas saem do fluxo" : "Pausada — faturas previstas removidas"); };

  // N2: emite a NFS-e da próxima fatura reusando o MESMO movement (não duplica receita).
  const emitirNfse = async (r: Recorrencia) => {
    if (!r.movimentos.length) return;
    const nf = await criarNfse({
      tomadorId: r.clienteId, tomadorNome: r.clienteNome, discriminacao: r.titulo,
      codigoServico: "1.05 — Licenciamento de software", valorServico: totalFatura(r),
      municipio: "São Paulo", issAliquota: 5, aguardarPagamento: false,
      recorrenciaId: r.id, movimentoReceita: r.movimentos[0],
    });
    await transmitirNfse(nf.id);
    await refresh();
    show("NFS-e emitida da fatura — receita reaproveitada (não duplica)");
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Dashboard de assinatura */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="MRR" node={<BRL value={kpis.mrr} />} info={{ titulo: "MRR", oQue: "Receita recorrente mensal contratada — quanto entra de assinatura todo mês.", comoCalcula: "Soma do valor por ciclo de todas as recorrências ativas, normalizado para o mês." }} />
        <Kpi label="Recorrências ativas" node={<span>{kpis.ativas}</span>} info={{ titulo: "Recorrências ativas", oQue: "Quantos contratos estão gerando faturas no momento.", comoCalcula: "Contagem das recorrências com status ativa." }} />
        <Kpi label="Ticket médio" node={<BRL value={kpis.ticketMedio} />} info={{ titulo: "Ticket médio", oQue: "Valor médio de cada contrato de assinatura.", comoCalcula: "MRR dividido pelo número de recorrências ativas." }} />
        <Kpi label="Churn" node={<span>{Math.round(kpis.churn * 100)}%</span>} tone={kpis.churn > 0.2 ? "var(--color-negative)" : "var(--color-ink)"} info={{ titulo: "Churn", oQue: "Percentual de contratos que foram pausados ou cancelados — o quanto você perde de base.", comoCalcula: "Recorrências canceladas ou pausadas sobre o total de contratos." }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Nova recorrência */}
        <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Nova recorrência", oQue: "Cria um contrato de assinatura que projeta as próximas faturas como receita prevista no hub.", comoCalcula: "Os itens vêm do catálogo de Produtos/Serviços; o ciclo e o dia definem o vencimento de cada fatura." }}>
          <span className="text-label font-medium text-muted">Nova recorrência</span>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (ex.: Assinatura mensal)" />
          <Select label="Cliente" value={clienteId} onChange={setClienteId} options={[{ value: "", label: "Selecione…" }, ...clientes.map((c: Party) => ({ value: c.id, label: c.name }))]} />
          <div className="grid grid-cols-2 gap-2">
            <Select label="Ciclo" value={ciclo} onChange={(v) => setCiclo(v as Ciclo)} options={CICLOS.map((c) => ({ value: c.id, label: c.label }))} />
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">Dia faturamento</span>
              <Input type="number" value={String(dia)} onChange={(e) => setDia(Math.max(1, Math.min(28, Number(e.target.value) || 1)))} />
            </div>
          </div>
          <Select label="Classificação" value={classificacao} onChange={setClassificacao} options={CATEGORIAS.map((c) => ({ value: c, label: c }))} />

          <span className="text-caption font-medium text-faint tracking-wide">Itens (do catálogo)</span>
          {itens.map((it, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border border-border-soft p-2">
              <Select value={it.nome} onChange={(v) => { const c = catalogo.find((x) => x.nome === v); setItem(i, { nome: v, valor: c?.valor ?? it.valor }); }}
                options={[{ value: "", label: "Escolher do catálogo…" }, ...catalogo.map((c) => ({ value: c.nome, label: `${c.nome} · ${formatBRL(c.valor)}` }))]} />
              <div className="grid grid-cols-2 gap-2">
                <CurrencyInput value={it.valor} onValueChange={(v) => setItem(i, { valor: v })} />
                <Input type="number" value={String(it.qtd)} onChange={(e) => setItem(i, { qtd: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              {itens.length > 1 && <button onClick={() => setItens((a) => a.filter((_, k) => k !== i))} className="text-caption text-faint hover:text-negative self-end">remover</button>}
            </div>
          ))}
          <button onClick={() => setItens((a) => [...a, { nome: "", valor: 0, qtd: 1 }])} className="text-caption font-medium text-muted hover:text-ink self-start">+ adicionar item</button>

          <div className="flex items-center justify-between border-t border-border-soft pt-2">
            <span className="text-caption text-faint">Por ciclo <span className="text-ink tabular-nums font-medium"><BRL value={totalForm} /></span></span>
            <Button variant="primary" size="sm" onClick={criar}>Criar</Button>
          </div>
        </Card>

        {/* Lista de contratos */}
        <Card padded={false} className="lg:col-span-2">
          <div className="px-5 pt-[16px] pb-2 flex items-center justify-between">
            <span className="inline-flex items-center text-body font-medium text-ink">Contratos de recorrência<InfoHint align="left" titulo="Contratos de recorrência" oQue="Lista as assinaturas e suas próximas faturas; aqui você ativa, pausa, cancela e emite NFS-e." comoCalcula="Ativar projeta as faturas no previsto (recebíveis, fluxo, DRE); pausar ou cancelar as remove." /></span>
            <span className="text-caption text-faint">{lista.length}</span>
          </div>
          <div className="flex flex-col max-h-[560px] overflow-y-auto">
            {lista.length === 0 ? (
              <p className="text-caption text-faint text-center py-8">Nenhuma recorrência. Crie ao lado — itens vêm do catálogo de Produtos/Serviços.</p>
            ) : lista.map((r) => {
              const on = aberto === r.id;
              return (
                <div key={r.id} className="border-t border-border-soft first:border-t-0">
                  <div className="flex items-center gap-3 px-5 py-3">
                    <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: STATUS[r.status].cor }} />
                    <button onClick={() => setAberto(on ? null : r.id)} className="flex-1 min-w-0 text-left">
                      <div className="text-[14px] text-ink truncate">{r.titulo} · {r.clienteNome}</div>
                      <div className="text-caption text-faint truncate">{CICLOS.find((c) => c.id === r.ciclo)?.label} · dia {r.diaFaturamento} · {STATUS[r.status].label}</div>
                    </button>
                    <span className="text-caption text-ink tabular-nums shrink-0"><BRL value={totalFatura(r)} /></span>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.clienteId && <button onClick={() => window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: r.clienteId } }))} title="Ficha do cliente" className="inline-flex p-[5px] rounded-md hover:bg-surface-2"><Icon name="users" size={13} color="var(--color-text-tertiary)" /></button>}
                      {r.status !== "ativa" && r.status !== "cancelada" && <button onClick={() => ativar(r)} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-3 py-[4px]">Ativar</button>}
                      {r.status === "ativa" && <button onClick={() => emitirNfse(r)} className="text-caption font-medium text-ink bg-surface-2 rounded-pill px-2 py-[4px]">NFS-e</button>}
                      {r.status === "ativa" && <button onClick={() => encerrar(r, "pausada")} className="text-caption font-medium text-muted bg-surface-2 rounded-pill px-2 py-[4px]">Pausar</button>}
                      {r.status !== "cancelada" && <button onClick={() => encerrar(r, "cancelada")} title="Cancelar (churn)" className="inline-flex p-[5px] rounded-md hover:bg-surface-2"><Icon name="x" size={13} color="var(--color-text-tertiary)" /></button>}
                    </div>
                  </div>
                  {on && (
                    <div className="px-5 pb-3">
                      <span className="text-caption font-medium text-faint tracking-wide">Próximas faturas (previstas)</span>
                      <div className="mt-1 flex flex-col gap-1">
                        {projetarProximasFaturas(r, 6).map((f, i) => (
                          <div key={i} className="flex items-center justify-between text-caption">
                            <span className="text-muted">{f.periodo} · vence {fmtDia(f.vencimento)}</span>
                            <span className="text-ink tabular-nums"><BRL value={f.valor} /></span>
                          </div>
                        ))}
                      </div>
                      {r.status === "ativa" && (
                        <span className="text-caption text-positive mt-1 inline-flex items-center gap-2 flex-wrap">
                          Projetadas no hub — aparecem em
                          <Link href="/recebimentos" className="underline decoration-1 underline-offset-2 hover:opacity-80 inline-flex items-center gap-1">Contas a receber <Icon name="arrow-up-right" size={12} color="currentColor" /></Link>
                          e em
                          <Link href="/fluxo-caixa" className="underline decoration-1 underline-offset-2 hover:opacity-80 inline-flex items-center gap-1">Fluxo de caixa <Icon name="arrow-up-right" size={12} color="currentColor" /></Link>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      {node}
    </div>
  );
}

function Kpi({ label, node, tone = "var(--color-ink)", info }: { label: string; node: React.ReactNode; tone?: string; info?: React.ComponentProps<typeof Card>["info"] }) {
  return (
    <Card className="flex flex-col gap-1" info={info}>
      <span className="text-caption text-faint">{label}</span>
      <span className="text-h3 font-medium tabular-nums leading-none" style={{ color: tone }}>{node}</span>
    </Card>
  );
}
