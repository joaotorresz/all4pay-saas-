"use client";

import * as React from "react";
import { BRL, Card, Icon, Select, CurrencyInput, Input, Button } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { FinancialPlatform, criarPlataformaDemo } from "@/core/platform";
import type {
  ResultadoPagamento,
  MetodoPagamento,
  SaudeNivel,
  DomainStatus,
  QueueJob,
  JobStatus,
} from "@/core/platform/types";

const SAUDE_COR: Record<SaudeNivel, string> = {
  ok: "var(--color-positive)",
  degradado: "var(--color-warning)",
  critico: "var(--color-negative)",
};
const DOM_COR: Record<DomainStatus, string> = {
  ativo: "var(--color-positive)",
  parcial: "var(--color-warning)",
  planejado: "var(--color-text-tertiary)",
};
const JOB_COR: Record<JobStatus, string> = {
  pendente: "var(--color-text-secondary)",
  processando: "var(--color-text-secondary)",
  retentando: "var(--color-warning)",
  concluido: "var(--color-positive)",
  falha: "var(--color-negative)",
};
const METODOS: MetodoPagamento[] = ["pix", "ted", "boleto", "cartao"];

let _k = 0;
const novaKey = (m: string) => `${m}_${Date.now().toString(36)}_${(_k++).toString(36)}`;

export function InfraestruturaView() {
  const platRef = React.useRef<FinancialPlatform | null>(null);
  if (platRef.current === null) platRef.current = criarPlataformaDemo();
  const plat = platRef.current;

  const [, force] = React.useReducer((x) => x + 1, 0);
  const [metodo, setMetodo] = React.useState<MetodoPagamento>("pix");
  const [valor, setValor] = React.useState(25000);
  const [contraparte, setContraparte] = React.useState("Cliente Aurora");
  const [key, setKey] = React.useState(() => novaKey("pix"));
  const [ultimaKey, setUltimaKey] = React.useState<string | null>(null);
  const [resultado, setResultado] = React.useState<ResultadoPagamento | null>(null);

  const processar = (k: string, falharVezes?: number) => {
    const r = plat.processarPagamento({ idempotencyKey: k, metodo, valor, contraparte, falharVezes });
    setResultado(r);
    setUltimaKey(k);
    force();
  };

  const saldoLedger = plat.recuperarCaixa();
  const tb = plat.ledger.trialBalance();
  const saldos = plat.ledger.saldos().filter((s) => Math.abs(s.saldo) > 0);
  const txs = plat.ledger.transactions().slice().reverse().slice(0, 6);
  const jobs = plat.queue.jobs();
  const saude = plat.saude(saldoLedger);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Arquitetura de domínios */}
      <Card className="lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="layers" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Arquitetura de domínios financeiros</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {plat.dominios().map((d) => (
            <div key={d.id} className="rounded-md border border-border-soft p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[17px] font-medium text-ink">{d.nome}</span>
                <span className="w-2 h-2 rounded-pill" style={{ background: DOM_COR[d.status] }} />
              </div>
              <span className="text-caption text-faint">{d.descricao}</span>
              {d.modulo && <span className="text-caption text-placeholder">{d.modulo}</span>}
            </div>
          ))}
        </div>
      </Card>

      {/* Ledger Core */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-label font-medium text-muted">Ledger Core · dupla partida</span>
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-caption font-medium"
            style={{ background: "var(--color-surface-2)", color: tb.balanceado ? "var(--color-positive)" : "var(--color-negative)" }}
          >
            <span className="w-2 h-2 rounded-pill" style={{ background: tb.balanceado ? "var(--color-positive)" : "var(--color-negative)" }} />
            {tb.balanceado ? "Trial balance fechado" : "Desbalanceado"}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
          {saldos.map((s) => (
            <div key={s.code} className="flex flex-col">
              <span className="text-caption text-faint">{s.code} · {s.name}</span>
              <span className="text-[18px] font-medium tabular-nums text-ink"><BRL value={s.saldo} /></span>
            </div>
          ))}
        </div>

        <div className="text-caption text-faint border-t border-border-soft pt-2">
          Caixa derivado do ledger (state recovery por replay): <span className="text-ink tabular-nums"><BRL value={saldoLedger} /></span> · débitos <BRL value={tb.totalDebito} /> = créditos <BRL value={tb.totalCredito} />
        </div>

        <div className="flex flex-col">
          {txs.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2 border-t border-border-soft">
              <span className="text-caption text-faint tabular-nums w-[18px]">{t.seq}</span>
              <span className="text-[16px] text-ink flex-1 truncate">{t.descricao}</span>
              <span className="text-caption text-muted">
                {t.postings.map((p) => `${p.direction === "debit" ? "D" : "C"} ${p.accountCode}`).join(" · ")}
              </span>
              <span className="text-label tabular-nums text-ink"><BRL value={t.postings[0].amount} /></span>
            </div>
          ))}
        </div>
      </Card>

      {/* Payment Orchestrator */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Payment Orchestrator</span>
        <Select label="Método" value={metodo} onChange={(v) => setMetodo(v as MetodoPagamento)} options={METODOS.map((m) => ({ value: m, label: m.toUpperCase() }))} />
        <CurrencyInput label="Valor" value={valor} onValueChange={setValor} />
        <Input label="Contraparte" value={contraparte} onChange={(e) => setContraparte(e.target.value)} />
        <Input label="Idempotency key" value={key} onChange={(e) => setKey(e.target.value)} />

        <Button variant="primary" fullWidth onClick={() => { processar(key); setKey(novaKey(metodo)); }}>
          Processar pagamento
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={!ultimaKey} onClick={() => ultimaKey && processar(ultimaKey)}>
            Repetir (idempotência)
          </Button>
          <Button variant="secondary" onClick={() => { processar(novaKey("retry"), 2); }}>
            Falha + retry
          </Button>
        </div>

        {resultado && (
          <div className="rounded-md bg-surface-1 p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-label font-medium" style={{ color: resultado.status === "falha" ? "var(--color-negative)" : resultado.duplicado ? "var(--color-warning)" : "var(--color-positive)" }}>
                {resultado.duplicado ? "Duplicado ignorado" : resultado.status === "concluido" ? "Liquidado" : "Falhou"}
              </span>
              <span className="text-caption text-faint">{resultado.tentativas} tentativa(s)</span>
            </div>
            <span className="text-caption text-muted">{resultado.detalhe}</span>
          </div>
        )}
      </Card>

      {/* Fila */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Fila financeira · retry · idempotência</span>
        {jobs.length === 0 ? (
          <span className="text-caption text-faint">Nenhum job ainda.</span>
        ) : (
          <div className="flex flex-col">
            {jobs.slice(0, 8).map((j) => (
              <JobRow key={j.id} j={j} onReplay={() => { plat.queue.replay(j.id); force(); }} />
            ))}
          </div>
        )}
      </Card>

      {/* Observabilidade */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="activity" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Observabilidade financeira</span>
        </div>
        {saude.map((s) => (
          <div key={s.id} className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-pill mt-[5px] shrink-0" style={{ background: SAUDE_COR[s.status] }} />
            <div>
              <div className="text-[16px] font-medium text-ink">{s.nome}</div>
              <div className="text-caption text-muted">{s.detalhe}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function JobRow({ j, onReplay }: { j: QueueJob; onReplay: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2 border-t border-border-soft first:border-t-0">
      <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: JOB_COR[j.status] }} />
      <span className="text-[16px] text-ink flex-1 truncate">{j.metodo.toUpperCase()} · {j.contraparte ?? "—"}</span>
      <span className="text-caption text-faint tabular-nums"><BRL value={j.valor} /></span>
      <span className="text-caption tabular-nums w-[60px] text-right" style={{ color: JOB_COR[j.status] }}>{j.status}</span>
      <span className="text-caption text-faint tabular-nums w-[40px] text-right">{j.tentativas}/{j.maxTentativas}</span>
      {j.status === "falha" && (
        <button onClick={onReplay} className="text-caption text-ink underline">replay</button>
      )}
    </div>
  );
}
