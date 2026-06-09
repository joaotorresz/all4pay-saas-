"use client";

import * as React from "react";
import { Card, Money, Button, StatusBadge, Icon } from "@/components/ui";
import { brlParts, formatBRL } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { getReconciliation } from "@/lib/financial-os";
import type { MatchResult, FonteFinanceira } from "@/core/financial-os";

const FONTE_LABEL: Record<FonteFinanceira, string> = {
  ofx: "OFX", pix: "PIX", boleto: "Boleto", cartao: "Cartão", ted: "TED",
  comprovante: "Comprovante", nota_fiscal: "Nota fiscal", api_bancaria: "API banco",
  erp: "ERP", email: "E-mail", manual: "Manual",
};

const confColor = (c: number) =>
  c >= 90 ? "var(--color-positive)" : c >= 70 ? "var(--color-warning)" : "var(--color-negative)";

export function ReconciliationView({ onToast }: { onToast: (m: string) => void }) {
  const result = React.useMemo(() => getReconciliation(), []);
  const [reconciliadas, setReconciliadas] = React.useState(false);

  if (!isDemo || !result) {
    return (
      <Card>
        <p className="m-0 text-muted text-body">
          Conecte uma integração bancária (OFX, PIX, API) ou envie comprovantes para
          a engine de conciliação processar as fontes. Em modo demonstração os
          exemplos abaixo ilustram o motor em ação.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Resumo */}
      <Card className="flex flex-wrap items-center gap-x-10 gap-y-3">
        <Stat label="Entradas processadas" value={String(result.total)} />
        <Stat label="Conciliação automática" value={`${Math.round(result.taxaAuto * 100)}%`} tone="var(--color-positive)" />
        <Stat label="Sugestões" value={String(result.sugestoes.length)} tone="var(--color-warning)" />
        <Stat label="Exceções (manual)" value={String(result.excecoes.length)} tone="var(--color-negative)" />
        <div className="ml-auto">
          <Button
            variant="primary"
            disabled={reconciliadas || result.auto.length === 0}
            leftIcon={<Icon name="check" size={15} />}
            onClick={() => {
              setReconciliadas(true);
              onToast(`${result.auto.length} transações conciliadas automaticamente`);
            }}
          >
            {reconciliadas
              ? "Conciliado"
              : `Reconciliar ${result.auto.length} automaticamente`}
          </Button>
        </div>
      </Card>

      <Fila titulo="Conciliadas automaticamente" hint="confiança ≥ 90%" itens={result.auto} done={reconciliadas} />
      <Fila titulo="Sugestões de conciliação" hint="confiança 70–90% · requer 1 clique" itens={result.sugestoes} />
      <Fila titulo="Exceções" hint="confiança < 70% · tratamento manual" itens={result.excecoes} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-caption text-faint">{label}</div>
      <div className="text-h3 font-medium tabular-nums" style={{ color: tone ?? "var(--color-ink)" }}>{value}</div>
    </div>
  );
}

function Fila({ titulo, hint, itens, done }: { titulo: string; hint: string; itens: MatchResult[]; done?: boolean }) {
  if (itens.length === 0) return null;
  return (
    <Card padded={false}>
      <div className="flex items-baseline gap-[10px] px-5 pt-[18px] pb-2">
        <span className="text-body font-medium text-ink">{titulo}</span>
        <span className="text-caption text-faint">{hint}</span>
      </div>
      {itens.map((m, i) => (
        <MatchRow key={m.transacao.id} m={m} done={done} border={i > 0} />
      ))}
    </Card>
  );
}

function MatchRow({ m, done, border }: { m: MatchResult; done?: boolean; border: boolean }) {
  const v = brlParts(m.transacao.valor);
  return (
    <div className={`px-5 py-3 ${border ? "border-t border-border-soft" : ""}`}>
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-medium text-muted bg-surface-2 border border-border rounded-sm px-[6px] py-[2px]">
          {FONTE_LABEL[m.transacao.origem]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-ink truncate">
            {m.transacao.contraparte ?? "—"}
          </div>
          <div className="text-caption text-faint tabular-nums">
            {m.transacao.data}
            {m.ledger ? ` · casa com ${m.ledger.contraparte ?? "lançamento"}` : " · sem correspondência"}
            {m.transacao.documento ? ` · doc ${m.transacao.documento}` : ""}
          </div>
        </div>
        {done && m.decisao === "auto" ? (
          <StatusBadge tone="positive">Conciliado</StatusBadge>
        ) : (
          <span className="text-label font-medium tabular-nums" style={{ color: confColor(m.confidence) }}>
            {m.confidence}%
          </span>
        )}
        <div className="w-[120px] flex justify-end">
          <Money integer={v.integer} decimals={v.decimals} size="sm" color={m.transacao.tipo === "saida" ? "var(--color-negative)" : "var(--color-ink)"} />
        </div>
      </div>
      {/* breakdown probabilístico */}
      {m.ledger && (
        <div className="flex gap-3 mt-2 pl-[52px]">
          {(["valor", "data", "documento", "contraparte"] as const).map((k) => (
            <span key={k} className="flex items-center gap-[5px] text-caption text-faint">
              <span className="w-[34px] h-[4px] rounded-pill bg-surface-2 overflow-hidden inline-block">
                <span className="block h-full rounded-pill bg-ink" style={{ width: `${m.breakdown[k] * 100}%` }} />
              </span>
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
