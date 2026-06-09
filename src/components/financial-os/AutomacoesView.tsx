"use client";

import * as React from "react";
import { Card, Switch, Button, Select, Input, StatusBadge, Icon, type SelectOption } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { getRules, getOsTrace, getRuleSuggestions } from "@/lib/financial-os";
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
const TRIGGERS: SelectOption[] = Object.entries(TRIGGER_LABEL).map(([value, label]) => ({ value, label }));
const OPS: SelectOption[] = [">", "<", ">=", "<=", "=", "contains"].map((o) => ({ value: o, label: o }));
const ACTIONS: SelectOption[] = (
  ["enviar_whatsapp", "enviar_email", "gerar_cobranca", "bloquear_pagamento", "marcar_risco", "notificar_time", "criar_tarefa", "pedir_aprovacao_dupla"] as ActionType[]
).map((a) => ({ value: a, label: actionLabel(a) }));

export function AutomacoesView({ onToast }: { onToast: (m: string) => void }) {
  const [rules, setRules] = React.useState<FinancialRule[]>(() => getRules());
  const sugestoes = React.useMemo(() => getRuleSuggestions(), []);
  const trace = React.useMemo(() => getOsTrace(rules), [rules]);

  const toggle = (id: string) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ativo: !r.ativo } : r)));

  if (!isDemo) {
    return (
      <Card>
        <p className="m-0 text-muted text-body">
          O motor de regras opera sobre os eventos financeiros reais quando o
          Supabase está conectado. Em modo demonstração as regras abaixo são
          avaliadas contra eventos de exemplo.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Regras */}
      <div className="lg:col-span-2 flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <span className="text-label font-medium text-muted">Regras</span>
          {rules.map((r) => (
            <div key={r.id} className="flex items-start gap-3 py-2 border-t border-border-soft first:border-t-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-ink">{r.nome}</span>
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
          <RuleBuilder onAdd={(r) => { setRules((rs) => [...rs, r]); onToast("Regra criada"); }} />
        </Card>

        {/* Simulação orientada a eventos */}
        <Card padded={false}>
          <div className="px-5 pt-[18px] pb-2">
            <span className="text-body font-medium text-ink">Simulação · event bus</span>
            <span className="text-caption text-faint ml-2">{trace.eventos.length} eventos → {trace.execucoes.length} ações automáticas</span>
          </div>
          {trace.execucoes.length === 0 && (
            <div className="px-5 pb-4 text-caption text-faint">Nenhuma ação disparada pelas regras ativas.</div>
          )}
          {trace.execucoes.map((e, i) => (
            <div key={e.id} className={`flex items-center gap-3 px-5 py-[10px] ${i ? "border-t border-border-soft" : "border-t border-border-soft"}`}>
              <Icon name={e.status === "executada" ? "check" : "repeat"} size={15} color={e.status === "executada" ? "var(--color-positive)" : "var(--color-text-tertiary)"} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-ink">{e.detalhe}</div>
                <div className="text-caption text-faint truncate">via {e.ruleNome}</div>
              </div>
              <span className="text-caption text-faint">{e.status}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* IA sugere + eventos */}
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
              <Icon name="sparkles" size={14} color="var(--color-ink)" />
            </span>
            <span className="text-label font-medium text-muted">IA sugere regras</span>
          </div>
          {sugestoes.map((s, i) => (
            <div key={i} className="flex flex-col gap-2 py-2 border-t border-border-soft first:border-t-0">
              <span className="text-[14px] font-medium text-ink">{s.titulo}</span>
              <span className="text-caption text-muted">{s.descricao}</span>
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => {
                  setRules((rs) => [...rs, materializarRegra(s, `rule-${Date.now()}`)]);
                  onToast("Regra automatizada");
                }}
              >
                Automatizar
              </Button>
            </div>
          ))}
        </Card>

        <Card padded={false}>
          <div className="px-5 pt-[18px] pb-2 text-label font-medium text-muted">Eventos publicados</div>
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
