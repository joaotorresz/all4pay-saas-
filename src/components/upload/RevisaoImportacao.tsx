"use client";

/**
 * Revisão & confirmação da importação — estilo "confirmação do Open Finance".
 * Recebe o report do FDIP (já com a inteligência: classificação por transação,
 * resolução de fornecedores/clientes e correlação de pagamentos recorrentes/
 * mensais) e deixa o usuário revisar antes de aplicar. Ao confirmar, cadastra
 * contatos + categorias + lançamentos (via aplicarOnboarding).
 */
import * as React from "react";
import { Card, BRL, StatusBadge, Button, Icon } from "@/components/ui";
import type { FDIPReport } from "@/core/fdip";
import type { FinancialRecord } from "@/core/fdip/types";
import type { ResultadoOnboarding } from "@/lib/fdip";

const fmtDate = (iso: string) => { const [y, m, d] = (iso || "").split("-"); return d ? `${d}/${m}/${y.slice(2)}` : iso; };
const confTone = (c: number) => (c >= 0.9 ? "positive" : c >= 0.7 ? "warning" : "neutral");
const confLabel = (c: number) => (c >= 0.9 ? "alta" : c >= 0.7 ? "média" : "baixa");

export function RevisaoImportacao({
  report, onCorrigir, onConfirmar, aplicando, resultado,
}: {
  report: FDIPReport;
  onCorrigir: (r: FinancialRecord, categoria: string) => void;
  onConfirmar: () => void;
  aplicando: boolean;
  resultado: ResultadoOnboarding | null;
}) {
  const [verTodas, setVerTodas] = React.useState(false);
  const clsPorRec = React.useMemo(() => {
    const m = new Map<string, FDIPReport["classificacoes"][number]>();
    for (const c of report.classificacoes) m.set(c.recordId, c);
    return m;
  }, [report]);

  const entradas = report.records.filter((r) => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0);
  const saidas = report.records.filter((r) => r.tipo === "saida").reduce((s, r) => s + r.valor, 0);
  const recorrentes = [...report.padroes.recorrencias, ...report.padroes.assinaturas];
  const novosForn = report.entidades.filter((e) => e.tipo === "fornecedor").length;
  const novosCli = report.entidades.filter((e) => e.tipo === "cliente").length;

  const registros = verTodas ? report.records : report.records.slice(0, 40);

  if (resultado) {
    return (
      <Card className="flex flex-col gap-3 border-l-4" style={{ borderLeftColor: "var(--color-lime)" }}>
        <span className="text-h3 font-medium text-ink inline-flex items-center gap-2">
          <Icon name="check" size={18} color="var(--color-positive)" /> Importação confirmada
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Mini label="Contatos" v={(resultado.clientes ?? 0) + (resultado.fornecedores ?? 0)} />
          <Mini label="Categorias" v={resultado.categorias ?? 0} />
          <Mini label="Centros" v={resultado.centrosCusto ?? 0} />
          <Mini label="Lançamentos" v={resultado.movimentos ?? 0} />
        </div>
        <span className="text-caption text-faint">Os dados já alimentam dashboard, DRE, risco, inteligência e todo o ERP.</span>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Resumo (estilo OF) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Resumo label="Lançamentos" valor={report.records.length} contagem />
        <Resumo label="Entradas" valor={entradas} />
        <Resumo label="Saídas" valor={saidas} />
        <Resumo label="Fornecedores novos" valor={novosForn} contagem />
        <Resumo label="Recorrentes" valor={recorrentes.length} contagem />
      </div>

      {/* INTELIGÊNCIA: pagamentos recorrentes / mensais detectados */}
      {recorrentes.length > 0 && (
        <Card className="flex flex-col gap-2">
          <span className="text-label font-medium text-muted inline-flex items-center gap-2">
            <Icon name="sparkles" size={15} color="var(--color-lime)" /> Pagamentos recorrentes detectados
          </span>
          <span className="text-caption text-faint">Correlações encontradas na leitura — cobranças que se repetem (mensais/assinaturas).</span>
          {recorrentes.map((r, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-t border-border-soft first:border-t-0">
              <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md bg-surface-2 shrink-0">
                <Icon name="repeat" size={16} color="var(--color-text-secondary)" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium text-ink truncate">{r.contraparte}</div>
                <div className="text-caption text-faint truncate">{r.categoria} · {r.ocorrencias}× no período</div>
              </div>
              <StatusBadge tone="neutral">{r.assinatura ? "assinatura" : r.periodicidade}</StatusBadge>
              <span className="tabular-nums text-ink shrink-0 w-[110px] text-right"><BRL value={r.valorMedio} />/mês</span>
            </div>
          ))}
        </Card>
      )}

      {/* Contatos a cadastrar */}
      {report.entidades.length > 0 && (
        <Card className="flex flex-col gap-2">
          <span className="text-label font-medium text-muted">Contatos detectados — serão cadastrados ({novosForn} fornecedor(es) · {novosCli} cliente(s))</span>
          <div className="flex flex-col">
            {report.entidades.slice(0, verTodas ? undefined : 12).map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2 border-t border-border-soft first:border-t-0">
                <Icon name={e.tipo === "fornecedor" ? "arrow-up-right" : "arrow-left-right"} size={15} color="var(--color-text-secondary)" />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] text-ink truncate">{e.nome}</div>
                  <div className="text-caption text-faint">{e.tipo} · {e.transacoes} transação(ões){e.recorrente ? " · recorrente" : ""}</div>
                </div>
                <span className="tabular-nums text-faint shrink-0"><BRL value={e.total} /></span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Lançamentos (revisão por transação, estilo OF) */}
      <Card padded={false}>
        <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">
          Lançamentos lidos — revise a categoria onde a confiança for baixa
        </div>
        {registros.map((r, i) => {
          const c = clsPorRec.get(r.id);
          const conf = c?.confianca ?? 0.7;
          return (
            <div key={r.id} className={`flex items-center gap-3 px-3 sm:px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium text-ink truncate">{r.contraparte || r.descricao}</div>
                <div className="text-caption text-faint truncate">{fmtDate(r.data)} · {c?.destino ?? r.tipo}</div>
              </div>
              <input
                defaultValue={c?.categoria ?? ""}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c?.categoria) onCorrigir(r, v); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="hidden sm:block w-[150px] h-8 px-2 rounded-sm bg-white border border-border text-caption text-ink outline-none focus:border-faint"
                aria-label="Categoria"
              />
              <StatusBadge tone={confTone(conf)}>{confLabel(conf)}</StatusBadge>
              <span className={`tabular-nums shrink-0 w-[110px] text-right ${r.tipo === "saida" ? "text-negative" : "text-ink"}`}>
                <BRL value={r.valor} />
              </span>
            </div>
          );
        })}
        {report.records.length > registros.length && (
          <button onClick={() => setVerTodas(true)} className="w-full px-5 py-3 text-caption text-muted hover:text-ink border-t border-border-soft">
            Ver todos os {report.records.length} lançamentos
          </button>
        )}
      </Card>

      {/* Confirmar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" onClick={onConfirmar} disabled={aplicando} leftIcon={<Icon name="check" size={15} />}>
          {aplicando ? "Confirmando…" : `Confirmar importação (${report.records.length})`}
        </Button>
        <span className="text-caption text-faint">Cadastra contatos + categorias e cria os lançamentos. Em live, entram na fila de confirmação por movimento.</span>
      </div>
    </div>
  );
}

function Resumo({ label, valor, contagem }: { label: string; valor: number; contagem?: boolean }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold text-ink tabular-nums">{contagem ? valor.toLocaleString("pt-BR") : <BRL value={valor} />}</span>
    </Card>
  );
}
function Mini({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold text-ink tabular-nums">{v.toLocaleString("pt-BR")}</span>
    </div>
  );
}
