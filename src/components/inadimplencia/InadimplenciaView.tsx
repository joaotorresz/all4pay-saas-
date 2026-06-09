"use client";

import * as React from "react";
import { Card, Skeleton, Money, Icon } from "@/components/ui";
import { formatBRL, brlParts } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { useInadimplencia } from "@/components/visao-geral/hooks";
import {
  CLASSIF_LABEL,
  type ClassificacaoRisco,
  type CustomerRiskProfile,
} from "@/core/risk/types";

const COR: Record<ClassificacaoRisco, string> = {
  baixo: "var(--color-positive)",
  moderado: "var(--color-warning)",
  alto: "var(--color-negative)",
  critico: "var(--color-negative)",
};
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function InadimplenciaView() {
  const { data, isLoading, isError } = useInadimplencia();
  const [sel, setSel] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-[96px] lg:col-span-3" rounded="card" />
        <Skeleton className="h-[420px] lg:col-span-2" rounded="card" />
        <Skeleton className="h-[420px] lg:col-span-1" rounded="card" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <p className="text-muted">Não foi possível analisar a inadimplência.</p>
      </Card>
    );
  }
  if (data.clientes.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-2">
        <span className="text-h3 font-medium text-ink">Sem recebíveis ainda</span>
        <p className="m-0 text-muted max-w-[60ch]">
          Cadastre lançamentos de receita (com cliente e vencimento) para o motor
          aprender o comportamento de pagamento e prever inadimplência.
        </p>
      </Card>
    );
  }

  const r = data.resumo;
  const selected =
    data.clientes.find((c) => c.clienteId === sel) ?? data.clientes[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Resumo da carteira */}
      <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-4 gap-5">
        <Stat label="Exposição em aberto" value={r.exposicaoTotal} />
        <Stat label="Vencido" value={r.exposicaoVencida} tone="var(--color-negative)" />
        <Stat
          label="Inadimplência esperada"
          value={r.inadimplenciaEsperada}
          tone="var(--color-warning)"
          hint={`${pct(r.exposicaoTotal > 0 ? r.inadimplenciaEsperada / r.exposicaoTotal : 0)} da exposição`}
        />
        <Card className="flex flex-col gap-2">
          <span className="text-label font-medium text-muted">Score da carteira</span>
          <div className="flex items-end gap-2">
            <span
              className="text-value-lg leading-none font-medium tabular-nums"
              style={{ color: scoreColor(r.scoreCarteira) }}
            >
              {r.scoreCarteira}
            </span>
            <span className="text-label text-faint mb-1">/100</span>
          </div>
          <span className="text-caption text-faint">
            {r.clientesCriticos} crítico(s) · {r.clientesAlto} alto(s)
          </span>
        </Card>
      </div>

      {/* Heatmap de risco */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-label font-medium text-muted">
            Heatmap de risco · {r.totalClientes} clientes
          </span>
          <span className="text-caption text-faint">ordenado por score</span>
        </div>
        <div className="flex flex-col">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-2 pb-2 text-caption text-faint border-b border-border-soft">
            <span>Cliente</span>
            <span className="text-right w-[120px]">Score / prob.</span>
            <span className="text-right w-[110px]">Em aberto</span>
            <span className="text-right w-[88px]">Classe</span>
          </div>
          {data.clientes.map((c) => (
            <ClienteRow
              key={c.clienteId}
              c={c}
              active={c.clienteId === selected.clienteId}
              onClick={() => setSel(c.clienteId)}
            />
          ))}
        </div>
      </Card>

      {/* Perfil do cliente selecionado */}
      <ProfilePanel c={selected} />

      {/* Segmentação */}
      <Card className="lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="users" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Segmentação da carteira</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {data.segmentos.map((s) => (
            <div
              key={s.segmento}
              className="rounded-md border border-border-soft p-3 flex flex-col gap-1"
            >
              <span className="text-[14px] font-medium text-ink">{s.label}</span>
              <span className="text-caption text-faint">{s.clientes} cliente(s)</span>
              <span className="text-label text-muted tabular-nums">{formatBRL(s.exposicao)}</span>
            </div>
          ))}
        </div>
      </Card>

      {isDemo && (
        <Card className="lg:col-span-3 bg-surface-2" elevated={false}>
          <div className="flex items-start gap-3">
            <Icon name="gauge" size={18} color="var(--color-text-secondary)" />
            <div>
              <div className="text-label font-medium text-ink">
                Inteligência proprietária de crédito
              </div>
              <p className="m-0 text-caption text-muted mt-1 max-w-[80ch]">
                O score é comportamental e explicável (frequência e tendência de
                atraso, oscilação de pagamento, queda de ticket, concentração). Com
                a base conectada, o modelo aprende padrões e a precisão cresce —
                evoluindo para underwriting e crédito proprietários.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function scoreColor(s: number) {
  return s <= 20
    ? "var(--color-positive)"
    : s <= 50
      ? "var(--color-warning)"
      : "var(--color-negative)";
}

function Stat({
  label,
  value,
  tone = "var(--color-ink)",
  hint,
}: {
  label: string;
  value: number;
  tone?: string;
  hint?: string;
}) {
  const p = brlParts(value);
  return (
    <Card className="flex flex-col gap-2">
      <span className="text-label font-medium text-muted">{label}</span>
      <Money integer={p.integer} decimals={p.decimals} size="md" color={tone} />
      {hint && <span className="text-caption text-faint">{hint}</span>}
    </Card>
  );
}

function ClienteRow({
  c,
  active,
  onClick,
}: {
  c: CustomerRiskProfile;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-2 py-[10px] text-left border-b border-border-soft rounded-sm ${
        active ? "bg-surface-2" : "hover:bg-surface-1"
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        {c.earlyWarning.ativo && (
          <Icon name="triangle-alert" size={14} color="var(--color-warning)" />
        )}
        <span className="text-[14px] text-ink truncate">{c.nome}</span>
      </span>
      <span className="w-[120px] flex items-center gap-2 justify-end">
        <span className="h-[6px] w-[52px] rounded-pill bg-surface-2 overflow-hidden">
          <span
            className="block h-full rounded-pill"
            style={{ width: `${c.score}%`, background: COR[c.classificacao] }}
          />
        </span>
        <span
          className="text-label font-medium tabular-nums w-[28px] text-right"
          style={{ color: COR[c.classificacao] }}
        >
          {c.score}
        </span>
        <span className="text-caption text-faint tabular-nums w-[34px] text-right">
          {pct(c.probabilidadeInadimplencia)}
        </span>
      </span>
      <span className="w-[110px] text-right text-[14px] text-ink tabular-nums">
        {formatBRL(c.features.volumeAberto)}
      </span>
      <span className="w-[88px] flex justify-end">
        <span
          className="inline-flex items-center gap-[6px] rounded-pill px-2 py-[2px] text-caption font-medium"
          style={{ background: "var(--color-surface-2)", color: COR[c.classificacao] }}
        >
          <span className="w-[6px] h-[6px] rounded-pill" style={{ background: COR[c.classificacao] }} />
          {c.classificacao}
        </span>
      </span>
    </button>
  );
}

const ESTRATEGIA_LABEL: Record<string, string> = {
  amigavel: "Cobrança amigável",
  proativa: "Cobrança proativa",
  agressiva_precoce: "Cobrança agressiva precoce",
};

function ProfilePanel({ c }: { c: CustomerRiskProfile }) {
  return (
    <Card className="lg:col-span-1 flex flex-col gap-4">
      <div>
        <div className="text-[14px] font-medium text-ink truncate">{c.nome}</div>
        <div className="flex items-end gap-2 mt-1">
          <span
            className="text-value-lg leading-none font-medium tabular-nums"
            style={{ color: COR[c.classificacao] }}
          >
            {c.score}
          </span>
          <span className="text-label text-faint mb-1">/100 ·</span>
          <span className="text-label mb-1" style={{ color: COR[c.classificacao] }}>
            {CLASSIF_LABEL[c.classificacao]}
          </span>
        </div>
        <div className="text-caption text-faint mt-1">
          {pct(c.probabilidadeInadimplencia)} de probabilidade de inadimplência ·
          recuperação {pct(c.recovery.chanceRecuperacao)}
        </div>
      </div>

      {/* Fatores explicados */}
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-faint uppercase tracking-wide">
          Por que esse risco
        </span>
        {c.fatoresRisco.length === 0 && (
          <span className="text-caption text-faint">Comportamento saudável.</span>
        )}
        {c.fatoresRisco.map((f) => (
          <div key={f.fator} className="flex flex-col gap-1">
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-ink">{f.fator}</span>
              <span className="text-caption text-muted tabular-nums">+{f.contribuicao}</span>
            </div>
            <span className="text-caption text-faint">{f.detalhe}</span>
          </div>
        ))}
      </div>

      {/* Early warning */}
      {c.earlyWarning.ativo && (
        <div className="flex flex-col gap-1 rounded-md border border-border-soft p-3">
          <span className="inline-flex items-center gap-[6px] text-label font-medium text-warning">
            <Icon name="triangle-alert" size={14} color="var(--color-warning)" />
            Alerta antecipado ({c.earlyWarning.severidade})
          </span>
          {c.earlyWarning.sinais.map((s, i) => (
            <span key={i} className="text-caption text-muted">· {s}</span>
          ))}
        </div>
      )}

      {/* Recomendação de crédito */}
      <div className="flex flex-col gap-2 rounded-md bg-surface-1 p-3">
        <span className="text-caption font-medium text-faint uppercase tracking-wide">
          Recomendação
        </span>
        <p className="m-0 text-[13px] text-ink leading-snug">{c.credito.resumo}</p>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Mini label="Limite" value={formatBRL(c.credito.limiteSugerido)} />
          <Mini label="Prazo" value={`${c.credito.prazoSugeridoDias}d`} />
          <Mini label="Entrada" value={pct(c.credito.entradaSugeridaPct)} />
        </div>
        <span className="text-caption text-faint">
          {ESTRATEGIA_LABEL[c.credito.estrategiaCobranca]}
        </span>
      </div>

      {c.recomendacoes.length > 0 && (
        <ul className="m-0 pl-4 flex flex-col gap-1">
          {c.recomendacoes.map((rec, i) => (
            <li key={i} className="text-caption text-muted">{rec}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[13px] font-medium text-ink tabular-nums">{value}</span>
    </div>
  );
}
