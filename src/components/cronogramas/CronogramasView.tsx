"use client";

/**
 * Cronogramas — amortização (despesas antecipadas) e depreciação (imobilizado).
 * Os cronogramas vivem no sistema e consolidam em UM lançamento mensal por tipo
 * para revisão (inspirado no Campfire). CRUD local, demo-safe.
 */
import * as React from "react";
import { Card, BRL, StatusBadge, Button, Icon, Input, Select, CurrencyInput, DateField } from "@/components/ui";
import {
  gerarCronograma, lancamentoDoMes, resumoCronogramas, parcelaMensal, tipoLabel,
  type Cronograma, type TipoCronograma,
} from "@/core/schedules";
import { loadCronogramas, salvarCronograma, removerCronograma } from "@/lib/schedules";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AppShell } from "@/components/app/AppShell";

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (mesISO: string) => { const [y, m] = mesISO.split("-").map(Number); return `${MESES_PT[(m || 1) - 1]}/${String(y).slice(2)}`; };
function ultimosMeses(n: number): string[] {
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

type Draft = Omit<Cronograma, "id"> & { id?: string };
const novoDraft = (): Draft => ({ tipo: "amortizacao", descricao: "", valorTotal: 0, residual: 0, meses: 12, inicio: new Date().toISOString().slice(0, 8) + "01", categoria: "" });

export function CronogramasView() {
  const [lista, setLista] = React.useState<Cronograma[]>([]);
  const [mes, setMes] = React.useState<string>(() => new Date().toISOString().slice(0, 7));
  const [draft, setDraft] = React.useState<Draft | null>(null);

  React.useEffect(() => { setLista(loadCronogramas()); }, []);

  const lancamento = React.useMemo(() => lancamentoDoMes(lista, mes), [lista, mes]);
  const resumo = React.useMemo(() => resumoCronogramas(lista, mes), [lista, mes]);
  const meses = ultimosMeses(8);

  const salvar = () => {
    if (!draft || !draft.descricao.trim() || draft.meses <= 0 || draft.valorTotal <= 0) return;
    setLista(salvarCronograma(draft));
    setDraft(null);
  };
  const remover = (id: string) => {
    if (!window.confirm("Remover este cronograma?")) return;
    setLista(removerCronograma(id));
  };

  return (
    <AppShell title="Cronogramas" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      <div className="flex flex-col gap-5">
        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          <Resumo label="Ativos no mês" valor={resumo.ativos} contagem />
          <Resumo label="Lançamento do mês" valor={resumo.valorMensalTotal} />
          <Resumo label="Saldo a amortizar/depreciar" valor={resumo.saldoAmortizar} />
          <Resumo label="Base total" valor={resumo.baseTotal} />
        </div>

        {/* Lançamento contábil consolidado do mês */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-label font-medium text-muted">Lançamento mensal consolidado</span>
            <div className="flex items-center gap-1 flex-wrap">
              {meses.map((m) => (
                <button key={m} onClick={() => setMes(m)}
                  className={`text-caption font-medium rounded-pill px-[10px] py-1 ${m === mes ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}>
                  {mesCurto(m)}
                </button>
              ))}
            </div>
          </div>
          {lancamento.itens.length === 0 ? (
            <span className="text-caption text-faint py-2">Nenhum cronograma ativo em {mesCurto(mes)}.</span>
          ) : (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <Linha label="Amortização" valor={lancamento.porTipo.amortizacao} />
                <Linha label="Depreciação" valor={lancamento.porTipo.depreciacao} />
                <div className="ml-auto text-right">
                  <div className="text-caption text-faint">Total a lançar (saída)</div>
                  <div className="text-[24px] leading-none font-semibold text-ink tabular-nums"><BRL value={lancamento.total} /></div>
                </div>
              </div>
              <div className="flex flex-col gap-1 pt-1">
                {lancamento.itens.map((it) => (
                  <div key={it.cronogramaId} className="flex items-center justify-between gap-3 py-2 border-t border-border-soft text-caption">
                    <span className="text-muted truncate">{it.descricao} · <span className="text-faint">{it.categoria}</span></span>
                    <span className="tabular-nums text-ink shrink-0"><BRL value={it.valor} /></span>
                  </div>
                ))}
              </div>
              <span className="text-caption text-faint">Entrada contábil sugerida para revisão e aprovação — um lançamento de despesa por mês.</span>
            </>
          )}
        </Card>

        {/* Lista + novo */}
        <Card padded={false}>
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-soft">
            <span className="text-label font-medium text-muted">Cronogramas</span>
            <Button size="sm" variant="secondary" leftIcon={<Icon name="plus" size={14} />} onClick={() => setDraft(novoDraft())}>Novo cronograma</Button>
          </div>
          {lista.length === 0 ? (
            <div className="px-5 py-6 text-caption text-faint">Nenhum cronograma. Adicione uma despesa antecipada ou um ativo a depreciar.</div>
          ) : lista.map((c, i) => {
            const linhas = gerarCronograma(c);
            const decorridos = linhas.filter((l) => l.periodo <= mes).length;
            const pct = Math.min(100, Math.round((decorridos / c.meses) * 100));
            return (
              <div key={c.id} className={`px-3 sm:px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md bg-surface-2 shrink-0">
                    <Icon name={c.tipo === "depreciacao" ? "layers" : "file-text"} size={16} color="var(--color-text-secondary)" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-medium text-ink truncate">{c.descricao}</div>
                    <div className="text-caption text-faint truncate">{tipoLabel(c.tipo)} · {c.categoria || "—"}</div>
                  </div>
                  <div className="hidden sm:block text-right shrink-0">
                    <div className="text-caption text-faint">parcela/mês</div>
                    <div className="text-[15px] text-ink tabular-nums"><BRL value={parcelaMensal(c)} /></div>
                  </div>
                  <StatusBadge tone={pct >= 100 ? "positive" : "neutral"}>{Math.min(decorridos, c.meses)}/{c.meses}</StatusBadge>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setDraft({ ...c })} className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2">Editar</button>
                    <button onClick={() => remover(c.id)} className="text-caption text-negative px-2 py-1 rounded-sm hover:bg-surface-2">Remover</button>
                  </div>
                </div>
                <div className="h-[5px] rounded-pill bg-surface-2 overflow-hidden mt-2">
                  <div className="h-full rounded-pill bg-ink" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </Card>

        {/* Form (inline) */}
        {draft && (
          <Card className="flex flex-col gap-4">
            <span className="text-label font-medium text-muted">{draft.id ? "Editar cronograma" : "Novo cronograma"}</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Tipo" value={draft.tipo} onChange={(v) => setDraft({ ...draft, tipo: v as TipoCronograma })}
                options={[{ value: "amortizacao", label: "Amortização (despesa antecipada)" }, { value: "depreciacao", label: "Depreciação (imobilizado)" }]} />
              <Input label="Descrição" value={draft.descricao} onChange={(e) => setDraft({ ...draft, descricao: e.target.value })} />
              <CurrencyInput label="Valor total" value={draft.valorTotal} onValueChange={(v) => setDraft({ ...draft, valorTotal: v })} />
              {draft.tipo === "depreciacao" && (
                <CurrencyInput label="Valor residual" value={draft.residual} onValueChange={(v) => setDraft({ ...draft, residual: v })} />
              )}
              <Input label="Vida útil (meses)" type="number" value={String(draft.meses)} onChange={(e) => setDraft({ ...draft, meses: Math.max(1, Number(e.target.value) || 0) })} />
              <DateField label="Início" value={draft.inicio.slice(0, 10)} onChange={(v) => setDraft({ ...draft, inicio: v })} />
              <Input label="Categoria contábil" value={draft.categoria} onChange={(e) => setDraft({ ...draft, categoria: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
              <Button size="sm" onClick={salvar}>Salvar cronograma</Button>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function Resumo({ label, valor, contagem }: { label: string; valor: number; contagem?: boolean }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[20px] font-semibold text-ink tabular-nums">{contagem ? valor.toLocaleString("pt-BR") : <BRL value={valor} />}</span>
    </Card>
  );
}
function Linha({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[16px] text-ink tabular-nums"><BRL value={valor} /></span>
    </div>
  );
}
