"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Switch, Button, Select, Input, StatusBadge, Icon, Skeleton, InfoHint, type SelectOption } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { loadAutomacoes, traceDemo, persistRule } from "@/lib/financial-os";
import { actionLabel, materializarRegra } from "@/core/financial-os";
import type {
  FinancialRule,
  FinancialEventType,
  Operador,
  ActionType,
  Prioridade,
} from "@/core/financial-os";

const TRIGGER_LABEL: Record<string, string> = {
  pagamento_criado: "Pagamento criado",
  pagamento_recebido: "Pagamento recebido",
  saldo_critico: "Saldo crítico",
  nota_emitida: "Nota emitida",
  cliente_inadimplente: "Cliente inadimplente",
  imposto_proximo: "Imposto próximo",
  custo_variou: "Custo variou",
  transacao_reconciliada: "Transação reconciliada",
  anomalia_detectada: "Anomalia detectada",
};
const PRIO_TONE: Record<Prioridade, "neutral" | "warning" | "positive"> = {
  critica: "warning", alta: "warning", media: "neutral", baixa: "neutral",
};
interface NotifStatus { whatsapp: boolean; email: boolean; templateCobranca: boolean; templateAlerta: boolean }
async function fetchNotifStatus(): Promise<NotifStatus> {
  const r = await fetch("/api/notificacoes/status");
  if (!r.ok) throw new Error("status");
  return r.json();
}
/** Resolve o modo do WhatsApp a partir das credenciais/templates do servidor. */
function whatsappMode(s: NotifStatus): { label: string; tone: "neutral" | "warning" | "positive" } {
  if (!s.whatsapp) return { label: "WhatsApp: simulado", tone: "neutral" };
  if (s.templateCobranca) return { label: "WhatsApp: template aprovado", tone: "positive" };
  return { label: "WhatsApp: sandbox / janela 24h", tone: "warning" };
}

const TRIGGERS: SelectOption[] = Object.entries(TRIGGER_LABEL).map(([value, label]) => ({ value, label }));
const OPS: SelectOption[] = [">", "<", ">=", "<=", "=", "contains"].map((o) => ({ value: o, label: o }));
const ACTIONS: SelectOption[] = (
  ["enviar_whatsapp", "enviar_email", "gerar_cobranca", "bloquear_pagamento", "marcar_risco", "notificar_time", "criar_tarefa", "pedir_aprovacao_dupla"] as ActionType[]
).map((a) => ({ value: a, label: actionLabel(a) }));

export function AutomacoesView({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["automacoes-os"], queryFn: loadAutomacoes });
  const { data: notif } = useQuery({ queryKey: ["notif-status"], queryFn: fetchNotifStatus, staleTime: 60_000 });
  const [rules, setRules] = React.useState<FinancialRule[]>([]);
  React.useEffect(() => {
    if (data) setRules(data.rules);
  }, [data]);

  const refetch = () => {
    if (!isDemo) qc.invalidateQueries({ queryKey: ["automacoes-os"] });
  };
  const onAdd = (r: FinancialRule) => {
    setRules((rs) => [...rs, r]);
    persistRule(r).then(refetch).catch(() => {});
    onToast("Regra criada");
  };
  const toggle = (id: string) => {
    setRules((rs) => {
      const nr = rs.map((r) => (r.id === id ? { ...r, ativo: !r.ativo } : r));
      const alvo = nr.find((r) => r.id === id);
      if (alvo) persistRule(alvo).then(refetch).catch(() => {});
      return nr;
    });
  };

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[320px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[320px] lg:col-span-1" rounded="card" />
      </div>
    );
  }

  // Em demo a simulação recalcula localmente; em live vem do estado real.
  const trace = isDemo ? traceDemo(rules) : data.trace;
  const sugestoes = data.suggestions;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <Card elevated={false} style={{ background: "var(--color-surface-2)" }} className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Icon name="workflow" size={16} color="var(--color-text-secondary)" className="mt-[2px]" />
          <p className="m-0 text-caption text-muted leading-[1.5]">
            As regras rodam sobre eventos <b className="text-ink font-medium">derivados do seu estado financeiro atual</b> (saldo crítico,
            inadimplência, recebimentos). {isDemo
              ? "Em demonstração os dados vêm do seed (ou do que você importou no Onboarding inteligente)."
              : "Em produção as regras são persistidas em financial_rules e cada ação executada é auditada em rule_executions."}
            {" "}Os envios reais de <b className="text-ink font-medium">WhatsApp (Twilio)</b> e <b className="text-ink font-medium">e-mail (Resend)</b> ocorrem no runner agendado quando as credenciais estão no servidor — sem elas, ficam em modo simulado.
          </p>
        </div>
        {notif && (
          <div className="flex items-center gap-2 flex-wrap pl-[28px]">
            <StatusBadge tone={whatsappMode(notif).tone}>{whatsappMode(notif).label}</StatusBadge>
            <StatusBadge tone={notif.email ? "positive" : "neutral"}>{notif.email ? "E-mail: Resend ativo" : "E-mail: simulado"}</StatusBadge>
            {notif.whatsapp && !notif.templateCobranca && (
              <span className="text-caption text-faint">free-form só entrega a quem deu “join” / dentro da janela de 24h — configure um template para produção.</span>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Regras */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <Card className="flex flex-col gap-3">
            <span className="text-label font-medium text-muted inline-flex items-center gap-1">Regras<InfoHint align="left" titulo="Regras" oQue="Automações no formato SE acontecer tal evento ENTÃO faça tal ação, que você liga e desliga." comoCalcula="Cada regra tem um gatilho, condições sobre um campo e ações como enviar WhatsApp, cobrar ou bloquear pagamento." /></span>
            {rules.length === 0 && <span className="text-caption text-faint">Nenhuma regra ainda — crie a primeira abaixo.</span>}
            {rules.map((r) => (
              <div key={r.id} className="flex items-start gap-3 py-2 border-t border-border-soft first:border-t-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[17px] font-medium text-ink">{r.nome}</span>
                    <StatusBadge tone={PRIO_TONE[r.prioridade]}>{r.prioridade}</StatusBadge>
                  </div>
                  <p className="m-0 text-caption text-muted mt-1">
                    <b className="font-medium text-ink">SE</b> {TRIGGER_LABEL[r.trigger]}
                    {r.conditions.map((c, i) => (
                      <span key={i}> {i === 0 ? "·" : "e"} {c.campo} {c.operador} {String(c.valor)}</span>
                    ))}{" "}
                    <b className="font-medium text-ink">ENTÃO</b>{" "}
                    {r.actions.map((a) => actionLabel(a.tipo) + (a.destino ? ` (${a.destino})` : "")).join(" · ")}
                  </p>
                </div>
                <Switch checked={r.ativo} onChange={() => toggle(r.id)} />
              </div>
            ))}
            <RuleBuilder onAdd={onAdd} />
          </Card>

          {/* Simulação orientada a eventos */}
          <Card padded={false}>
            <div className="px-5 pt-[18px] pb-2">
              <span className="text-body font-medium text-ink inline-flex items-center gap-1">Simulação · event bus<InfoHint align="left" titulo="Simulação" oQue="Mostra o que as regras ativas fariam sobre os eventos do seu estado financeiro atual." comoCalcula="Deriva eventos do estado atual (saldo, inadimplência, recebimentos), passa pelas regras e lista as ações disparadas." /></span>
              <span className="text-caption text-faint ml-2">{trace.eventos.length} eventos → {trace.execucoes.length} ações automáticas</span>
            </div>
            {trace.execucoes.length === 0 && (
              <div className="px-5 pb-4 text-caption text-faint">Nenhuma ação disparada pelas regras ativas sobre os eventos atuais.</div>
            )}
            {trace.execucoes.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-[10px] border-t border-border-soft">
                <Icon name={e.status === "executada" ? "check" : "repeat"} size={15} color={e.status === "executada" ? "var(--color-positive)" : "var(--color-text-tertiary)"} />
                <div className="flex-1 min-w-0">
                  <div className="text-[17px] text-ink">{e.detalhe}</div>
                  <div className="text-caption text-faint truncate">via {e.ruleNome}</div>
                </div>
                <span className="text-caption text-faint">{e.status}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* IA sugere + eventos */}
        <div className="flex flex-col gap-5">
          {trace.alertasExecutivos.length > 0 && (
            <Card className="flex flex-col gap-3" style={{ background: "var(--color-surface-2)" }} elevated={false}>
              <div className="flex items-center gap-2">
                <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
                  <Icon name="trending-up" size={14} color="var(--color-on-lime)" />
                </span>
                <span className="text-label font-medium text-muted inline-flex items-center gap-1">Alerta executivo · ponte de risco<InfoHint align="right" titulo="Alerta executivo" oQue="Aviso de impacto quando uma automação detecta algo que mexe no risco de caixa." comoCalcula="Quando um custo varia, recalcula o score de risco com a despesa ajustada e gera o alerta." /></span>
              </div>
              {trace.alertasExecutivos.map((a, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-[17px] font-medium text-ink">{a.titulo}</span>
                  <span className="text-caption text-muted leading-[1.5]">{a.texto}</span>
                </div>
              ))}
            </Card>
          )}
          {sugestoes.length > 0 && (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
                  <Icon name="sparkles" size={14} color="var(--color-on-lime)" />
                </span>
                <span className="text-label font-medium text-muted inline-flex items-center gap-1">IA sugere regras<InfoHint align="right" titulo="IA sugere regras" oQue="Recomendações de automações úteis que você pode ativar com um clique." comoCalcula="A IA analisa seus padrões financeiros e propõe regras prontas para automatizar." /></span>
              </div>
              {sugestoes.map((s, i) => (
                <div key={i} className="flex flex-col gap-2 py-2 border-t border-border-soft first:border-t-0">
                  <span className="text-[17px] font-medium text-ink">{s.titulo}</span>
                  <span className="text-caption text-muted">{s.descricao}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => { onAdd(materializarRegra(s, `rule-${Date.now()}`)); onToast("Regra automatizada"); }}
                  >
                    Automatizar
                  </Button>
                </div>
              ))}
            </Card>
          )}

          <Card padded={false} info={{ titulo: "Eventos publicados", oQue: "Lista os eventos financeiros que o sistema detectou e que disparam as regras.", comoCalcula: "Deriva os eventos do estado atual (saldo crítico, inadimplência, recebimento) e marca a prioridade de cada um." }}>
            <div className="px-5 pt-[18px] pb-2 text-label font-medium text-muted">Eventos publicados</div>
            {trace.eventos.length === 0 && <div className="px-5 pb-4 text-caption text-faint">Sem eventos no estado atual.</div>}
            {trace.eventos.map((ev, i) => (
              <div key={ev.id} className={`flex items-center gap-2 px-5 py-2 ${i ? "border-t border-border-soft" : ""}`}>
                <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: ev.prioridade === "critica" || ev.prioridade === "alta" ? "var(--color-negative)" : "var(--color-text-tertiary)" }} />
                <span className="text-caption text-ink flex-1 truncate">{TRIGGER_LABEL[ev.tipo] ?? ev.tipo}</span>
                <span className="text-caption text-faint">{ev.prioridade}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function RuleBuilder({ onAdd }: { onAdd: (r: FinancialRule) => void }) {
  const [open, setOpen] = React.useState(false);
  const [trigger, setTrigger] = React.useState<FinancialEventType>("saldo_critico");
  const [campo, setCampo] = React.useState("saldo");
  const [op, setOp] = React.useState<Operador>("<");
  const [valor, setValor] = React.useState("50000");
  const [acao, setAcao] = React.useState<ActionType>("enviar_whatsapp");

  if (!open)
    return (
      <button className="self-start inline-flex items-center gap-1 text-label font-medium text-muted hover:text-ink mt-1" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> Nova regra
      </button>
    );

  return (
    <div className="rounded-md border border-border-soft p-3 flex flex-col gap-3 mt-1">
      <div className="grid grid-cols-2 gap-3">
        <Select label="SE (evento)" options={TRIGGERS} value={trigger} onChange={(v) => setTrigger(v as FinancialEventType)} />
        <Select label="Ação" options={ACTIONS} value={acao} onChange={(v) => setAcao(v as ActionType)} />
      </div>
      <div className="grid grid-cols-[1fr_90px_1fr] gap-3 items-end">
        <Input label="Campo" value={campo} onChange={(e) => setCampo(e.target.value)} />
        <Select label="Operador" options={OPS} value={op} onChange={(v) => setOp(v as Operador)} />
        <Input label="Valor" value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            const num = Number(valor);
            onAdd({
              id: `rule-${Date.now()}`,
              nome: `${TRIGGER_LABEL[trigger]} · ${campo} ${op} ${valor}`,
              trigger,
              conditions: campo ? [{ campo, operador: op, valor: Number.isNaN(num) ? valor : num }] : [],
              actions: [{ tipo: acao }],
              prioridade: "media",
              ativo: true,
            });
            setOpen(false);
          }}
        >
          Criar regra
        </Button>
      </div>
    </div>
  );
}
