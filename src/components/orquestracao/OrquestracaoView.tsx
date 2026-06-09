"use client";

import * as React from "react";
import { Card, Skeleton, Icon, Select, CurrencyInput, Input, Button } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useOrquestracaoInput } from "@/components/visao-geral/hooks";
import { criarOrquestrador, type FinancialOrchestrator } from "@/core/orchestration";
import {
  EVENTO_LABEL,
  type EventoTipo,
  type ResultadoOrquestracao,
  type StateDelta,
  type PassoOrquestracao,
  type Reacao,
} from "@/core/orchestration/types";

const STATUS_COR: Record<PassoOrquestracao["status"], string> = {
  ok: "var(--color-positive)",
  alerta: "var(--color-warning)",
  critico: "var(--color-negative)",
};
const SEV_COR: Record<string, string> = {
  baixa: "var(--color-text-secondary)",
  media: "var(--color-warning)",
  alta: "var(--color-negative)",
  critica: "var(--color-negative)",
};
const TIPOS: EventoTipo[] = [
  "PIX_RECEBIDO",
  "BOLETO_EMITIDO",
  "BOLETO_VENCIDO",
  "PAGAMENTO_APROVADO",
  "PAGAMENTO_EXECUTADO",
];
const PRESETS: { tipo: EventoTipo; valor: number; contraparte: string }[] = [
  { tipo: "PIX_RECEBIDO", valor: 35000, contraparte: "Cliente Aurora" },
  { tipo: "BOLETO_VENCIDO", valor: 48000, contraparte: "Cliente Beta" },
  { tipo: "PAGAMENTO_EXECUTADO", valor: 160000, contraparte: "Fornecedor Z" },
];

export function OrquestracaoView() {
  const { data: input, isLoading, isError } = useOrquestracaoInput();
  const orqRef = React.useRef<FinancialOrchestrator | null>(null);
  const [resultado, setResultado] = React.useState<ResultadoOrquestracao | null>(null);
  const [, force] = React.useReducer((x) => x + 1, 0);

  const [tipo, setTipo] = React.useState<EventoTipo>("PIX_RECEBIDO");
  const [valor, setValor] = React.useState(35000);
  const [contraparte, setContraparte] = React.useState("Cliente Aurora");

  React.useEffect(() => {
    if (input) {
      orqRef.current = criarOrquestrador(input);
      setResultado(null);
      force();
    }
  }, [input]);

  const disparar = (ev: { tipo: EventoTipo; valor: number; contraparte: string }) => {
    if (!orqRef.current) return;
    const r = orqRef.current.orquestrar({ tipo: ev.tipo, entidadeId: ev.contraparte, valor: ev.valor, contraparte: ev.contraparte });
    setResultado(r);
    force();
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[120px] lg:col-span-3" rounded="card" />
        <Skeleton className="h-[320px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[320px] lg:col-span-1" rounded="card" />
      </div>
    );
  }
  if (isError || !orqRef.current) {
    return <Card><p className="text-muted">Não foi possível iniciar a orquestração.</p></Card>;
  }

  const orq = orqRef.current;
  const estado = orq.estadoAtual();
  const eventos = orq.store.todos().slice().reverse();
  const integridade = orq.store.verificarIntegridade();
  const saldos = orq.ledger.saldos();
  const grafo = orq.grafo();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Estado consolidado (vivo) */}
      <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-4 gap-5">
        <Stat label="Caixa consolidado" value={formatBRL(estado.saldoConsolidado)} />
        <Stat label="Runway" value={estado.runwayDias >= 999 ? "24+ m" : `${(estado.runwayDias / 30).toFixed(1)} m`} />
        <Stat label="Score de risco" value={`${estado.riscoScore}/100`} tone={estado.riscoScore < 50 ? "var(--color-negative)" : "var(--color-ink)"} />
        <Stat label="Prob. de ruptura" value={`${Math.round(estado.probRuptura * 100)}%`} tone={estado.probRuptura >= 0.5 ? "var(--color-negative)" : "var(--color-ink)"} />
      </div>

      {/* Disparar evento */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="network" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Disparar evento financeiro</span>
        </div>
        <Select
          label="Tipo de evento"
          value={tipo}
          onChange={(v) => setTipo(v as EventoTipo)}
          options={TIPOS.map((t) => ({ value: t, label: EVENTO_LABEL[t] }))}
        />
        <CurrencyInput label="Valor" value={valor} onValueChange={setValor} />
        <Input label="Contraparte" value={contraparte} onChange={(e) => setContraparte(e.target.value)} />
        <Button variant="primary" fullWidth onClick={() => disparar({ tipo, valor, contraparte })}>
          Orquestrar
        </Button>
        <div className="flex flex-wrap gap-2 pt-1">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => disparar(p)}
              className="text-caption text-muted bg-surface-2 hover:text-ink rounded-pill px-3 py-1"
            >
              {EVENTO_LABEL[p.tipo]} {formatBRL(p.valor)}
            </button>
          ))}
        </div>
        <p className="m-0 text-caption text-faint">
          Cada evento propaga pela cascata: Event Store → Ledger → caixa/liquidez/risco/projeção → decisão/IA → auditoria → antifraude → webhook.
        </p>
      </Card>

      {/* Cascata do último evento */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Cascata de orquestração</span>
        {!resultado ? (
          <span className="text-caption text-faint">Dispare um evento para ver a propagação pelo sistema.</span>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
              {resultado.passos.map((p, i) => (
                <React.Fragment key={p.ordem}>
                  {i > 0 && <Icon name="arrow-up-right" size={12} color="var(--color-text-tertiary)" />}
                  <span
                    className="inline-flex items-center gap-[6px] rounded-pill px-2 py-[3px] text-caption font-medium"
                    style={{ background: "var(--color-surface-2)", color: STATUS_COR[p.status] }}
                  >
                    <span className="w-[6px] h-[6px] rounded-pill" style={{ background: STATUS_COR[p.status] }} />
                    {p.modulo}
                  </span>
                </React.Fragment>
              ))}
            </div>

            {resultado.deltas.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {resultado.deltas.map((d) => (
                  <DeltaCell key={d.campo} d={d} />
                ))}
              </div>
            )}

            {resultado.lancamentos.map((l) => (
              <div key={l.id} className="text-caption text-muted bg-surface-1 rounded-md px-3 py-2">
                Ledger: <span className="text-ink">{l.contaDebito}</span> ⇆ <span className="text-ink">{l.contaCredito}</span> · {formatBRL(l.valor)} ({l.status})
              </div>
            ))}

            <div className="flex flex-col gap-2 pt-1">
              {resultado.reacoes.map((r, i) => (
                <ReacaoRow key={i} r={r} />
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Event store */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-label font-medium text-muted">Event Store · histórico imutável</span>
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-caption font-medium"
            style={{ background: "var(--color-surface-2)", color: integridade.intacta ? "var(--color-positive)" : "var(--color-negative)" }}
          >
            <span className="w-2 h-2 rounded-pill" style={{ background: integridade.intacta ? "var(--color-positive)" : "var(--color-negative)" }} />
            {integridade.intacta ? "Cadeia íntegra" : "Adulterado"}
          </span>
        </div>
        {eventos.length === 0 ? (
          <span className="text-caption text-faint">Nenhum evento ainda.</span>
        ) : (
          <div className="flex flex-col">
            {eventos.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2 border-t border-border-soft first:border-t-0">
                <span className="text-caption text-faint tabular-nums w-[18px]">{e.seq}</span>
                <span className="text-[14px] text-ink flex-1">{EVENTO_LABEL[e.tipo]}</span>
                {e.contraparte && <span className="text-caption text-faint">{e.contraparte}</span>}
                <span className="text-label tabular-nums text-muted">{formatBRL(e.valor)}</span>
                <span className="text-[11px] text-placeholder tabular-nums">{e.hash.slice(0, 10)}…</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Ledger */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Ledger · dupla partida</span>
        {saldos.length === 0 ? (
          <span className="text-caption text-faint">Sem lançamentos ainda.</span>
        ) : (
          saldos.map((s) => (
            <div key={s.conta} className="flex items-center justify-between">
              <span className="text-[13px] text-ink">{s.conta}</span>
              <span className="text-label font-medium tabular-nums" style={{ color: s.saldo < 0 ? "var(--color-negative)" : "var(--color-ink)" }}>
                {formatBRL(s.saldo)}
              </span>
            </div>
          ))
        )}
      </Card>

      {/* Grafo financeiro */}
      <Card className="lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="network" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Grafo financeiro unificado</span>
          <span className="text-caption text-faint">
            · {grafo.resumo.clientes} clientes · {grafo.resumo.fornecedores} fornecedores · fluxo {formatBRL(grafo.resumo.fluxoTotal)}
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
          <FlowColumn
            titulo="Clientes → Empresa"
            nodes={grafo.nodes.filter((n) => n.tipo === "cliente")}
            cor="var(--color-positive)"
          />
          <div className="flex flex-col items-center gap-1">
            <span className="w-12 h-12 rounded-card bg-ink inline-flex items-center justify-center">
              <Icon name="network" size={20} color="var(--color-white)" />
            </span>
            <span className="text-label font-medium text-ink">Empresa</span>
            {grafo.resumo.concentracaoTop && (
              <span className="text-caption text-faint text-center">
                Topo: {grafo.resumo.concentracaoTop.nome} ({Math.round(grafo.resumo.concentracaoTop.share * 100)}%)
              </span>
            )}
          </div>
          <FlowColumn
            titulo="Empresa → Fornecedores"
            nodes={grafo.nodes.filter((n) => n.tipo === "fornecedor")}
            cor="var(--color-negative)"
            alinharDireita
          />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone = "var(--color-ink)" }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-label font-medium text-muted">{label}</span>
      <span className="text-h2 font-medium tabular-nums leading-none" style={{ color: tone }}>{value}</span>
    </Card>
  );
}

function DeltaCell({ d }: { d: StateDelta }) {
  const pos = d.delta > 0;
  const bom = d.campo === "saldoConsolidado" || d.campo === "riscoScore" || d.campo === "runwayDias" ? pos : !pos;
  const cor = bom ? "var(--color-positive)" : "var(--color-negative)";
  const fmtV = (v: number) =>
    d.formato === "pct" ? `${(v * 100).toFixed(1)}pp` : d.formato === "dias" ? `${Math.round(v / 30)}m` : d.formato === "score" ? `${Math.round(v)}` : formatBRL(v);
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-caption text-faint">{d.label}</span>
      <span className="text-label font-medium tabular-nums" style={{ color: cor }}>
        {pos ? "+" : ""}{fmtV(d.delta)}
      </span>
    </div>
  );
}

function ReacaoRow({ r }: { r: Reacao }) {
  const icon = r.tipo === "antifraude" ? "triangle-alert" : r.tipo === "webhook" ? "arrow-up-right" : r.tipo === "alerta" ? "triangle-alert" : "sparkles";
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} size={14} color={SEV_COR[r.severidade]} className="mt-[2px]" />
      <span className={`text-caption ${r.tipo === "webhook" ? "text-faint" : "text-muted"}`}>{r.texto}</span>
    </div>
  );
}

function FlowColumn({ titulo, nodes, cor, alinharDireita }: { titulo: string; nodes: { id: string; label: string; valor: number; metrica?: string }[]; cor: string; alinharDireita?: boolean }) {
  const max = Math.max(1, ...nodes.map((n) => n.valor));
  return (
    <div className="flex flex-col gap-2">
      <span className={`text-caption text-faint ${alinharDireita ? "text-right" : ""}`}>{titulo}</span>
      {nodes.length === 0 && <span className="text-caption text-placeholder">—</span>}
      {nodes.slice(0, 6).map((n) => (
        <div key={n.id} className="flex flex-col gap-[3px]">
          <div className={`flex items-baseline justify-between gap-2 ${alinharDireita ? "flex-row-reverse" : ""}`}>
            <span className="text-caption text-ink truncate">{n.label}</span>
            <span className="text-caption text-faint tabular-nums">{formatBRL(n.valor)}</span>
          </div>
          <div className={`h-[5px] rounded-pill bg-surface-2 overflow-hidden ${alinharDireita ? "flex justify-end" : ""}`}>
            <div className="h-full rounded-pill" style={{ width: `${(n.valor / max) * 100}%`, background: cor }} />
          </div>
        </div>
      ))}
    </div>
  );
}
