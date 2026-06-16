"use client";

import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { Card, Select, Switch, Icon, Button } from "@/components/ui";
import {
  BANDEIRAS,
  MODALIDADES,
  MCCS,
  RANGES,
  type Bandeira,
  type RateTable,
  type ModalidadeRow,
  type PosConfig,
  loadPosConfig,
  savePosConfig,
  POS_DEFAULT,
  mccCodigo,
  taxaFinal,
} from "@/lib/pos-taxas";

/** % a partir de decimal, pt-BR com sinal (ex.: 2,25% · −0,05%). */
function pct(v: number): string {
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + "%";
}
function parsePct(s: string): number {
  const n = Number(s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".").replace("−", "-"));
  return Number.isFinite(n) ? n / 100 : 0;
}

/** Célula editável de taxa/spread (input inline em %, aceita negativo). */
function TaxaInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [txt, setTxt] = React.useState(() => (value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 6 }));
  React.useEffect(() => {
    setTxt((value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 6 }));
  }, [value]);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => onCommit(parsePct(txt))}
        inputMode="decimal"
        className="w-[72px] h-8 px-2 text-right rounded-sm bg-white border border-border text-[15px] text-ink tabular-nums outline-none focus:border-faint"
      />
      <span className="text-faint text-[13px]">%</span>
    </span>
  );
}

export function CentralPosTaxasView() {
  const [cfg, setCfg] = React.useState<PosConfig>(POS_DEFAULT);
  const [draft, setDraft] = React.useState<PosConfig | null>(null);
  const [salvo, setSalvo] = React.useState(false);

  React.useEffect(() => { setCfg(loadPosConfig()); }, []);

  const editando = draft !== null;
  const ativo = draft ?? cfg; // o que está sendo exibido/calculado

  function persistir(next: PosConfig) {
    setCfg(next);
    savePosConfig(next);
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 2000);
  }
  /** Muta o config: em edição vai p/ o rascunho; fora, persiste na hora. */
  function mutate(next: PosConfig) {
    if (editando) setDraft(next);
    else persistir(next);
  }
  const set = <K extends keyof PosConfig>(k: K, v: PosConfig[K]) => mutate({ ...ativo, [k]: v });

  function editTabela(qual: "custo" | "spread", mod: string, b: Bandeira, v: number) {
    const table = { ...ativo[qual] };
    table[mod] = { ...table[mod], [b]: v };
    mutate({ ...ativo, [qual]: table });
  }

  function iniciarEdicao() { setDraft(JSON.parse(JSON.stringify(cfg)) as PosConfig); }
  function salvarEdicoes() { if (draft) persistir(draft); setDraft(null); }
  function cancelarEdicao() { setDraft(null); }
  function restaurarPadrao() { setDraft(null); persistir(POS_DEFAULT); }

  const selicTxt = (ativo.selic * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <AppShell
      title="Taxa padrão"
      crumb="Central POS · simulador visão parceiro"
      actions={
        <div className="flex items-center gap-2">
          {salvo && <span className="text-caption text-positive">Salvo · vale para todo o sistema</span>}
          {editando ? (
            <>
              <Button variant="ghost" onClick={cancelarEdicao}>Cancelar</Button>
              <Button variant="primary" leftIcon={<Icon name="check" size={15} />} onClick={salvarEdicoes}>
                Salvar edições
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={restaurarPadrao}>Restaurar padrão</Button>
              <Button variant="secondary" leftIcon={<Icon name="settings" size={15} />} onClick={iniciarEdicao}>
                Editar taxas
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        <div className="text-caption text-faint -mb-1">
          Simulador visão parceiro · MDR + Antecipação
        </div>

        {/* Informações de precificação */}
        <Card>
          <div className="text-h3 text-ink mb-4">Informações de precificação</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">Parceiro</span>
              <div className="h-10 flex items-center text-body text-ink">ALL4PAY</div>
            </div>
            <Select
              label="Descrição MCC"
              value={ativo.mccDesc}
              onChange={(v) => set("mccDesc", v)}
              options={MCCS.map((m) => ({ value: m.descricao, label: m.descricao }))}
            />
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">MCC</span>
              <div className="h-10 flex items-center text-body text-ink tabular-nums">{mccCodigo(ativo.mccDesc)}</div>
            </div>
            <Select
              label="Range"
              value={ativo.range}
              onChange={(v) => set("range", v)}
              options={RANGES.map((r) => ({ value: r, label: r }))}
            />
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">SELIC a.a.</span>
              <div className="inline-flex items-center gap-2 h-10">
                <input
                  value={selicTxt}
                  onChange={(e) => set("selic", parsePct(e.target.value))}
                  inputMode="decimal"
                  className="w-[96px] h-10 px-3 text-right rounded-md bg-white border border-border text-body text-ink tabular-nums outline-none focus:border-faint"
                />
                <span className="text-faint text-label">%</span>
              </div>
            </div>
            <div className="flex items-center h-10 sm:mt-5">
              <Switch checked={ativo.antecipacao} onChange={(v) => set("antecipacao", v)} label="Terá antecipação?" />
            </div>
            <div className="flex items-center h-10 sm:mt-5">
              <Switch checked={ativo.online} onChange={(v) => set("online", v)} label="Online" />
            </div>
          </div>
        </Card>

        {/* Taxa de custo MDR */}
        <Card className="overflow-x-auto">
          <div className="text-h3 text-ink mb-1">Taxa de custo MDR</div>
          <p className="text-caption text-faint mb-4">Custo MDR por modalidade × bandeira (o que a all4pay paga).</p>
          <RateTableBody
            table={ativo.custo}
            editavel={editando}
            render={(v) => (v == null ? "—" : pct(v))}
            onEdit={(mod, b, v) => editTabela("custo", mod, b, v)}
          />
        </Card>

        {/* Spread (% editável) — em cima da taxa final */}
        <Card className="overflow-x-auto">
          <div className="text-h3 text-ink mb-1">Spread</div>
          <p className="text-caption text-faint mb-4">
            Margem do parceiro em %. Editar aqui aumenta ou diminui diretamente a taxa final do estabelecimento (Taxa final = Custo MDR + Spread).
          </p>
          <RateTableBody
            table={ativo.spread}
            editavel={editando}
            render={(v) =>
              v == null ? "—" : <span className={v < 0 ? "text-negative" : "text-ink"}>{v > 0 ? "+" : ""}{pct(v)}</span>
            }
            onEdit={(mod, b, v) => editTabela("spread", mod, b, v)}
          />
        </Card>

        {/* Taxa final para o estabelecimento = custo + spread (derivada) */}
        <Card className="overflow-x-auto">
          <div className="text-h3 text-ink mb-1">Taxa final para o estabelecimento</div>
          <p className="text-caption text-faint mb-4">Taxa MDR aplicada ao estabelecimento — calculada a partir do custo + spread.</p>
          <RateTableBody
            table={ativo.custo}
            editavel={false}
            render={(_v, mod, b) => {
              const f = taxaFinal(ativo.custo, ativo.spread, mod, b);
              return f == null ? "—" : <span className="text-ink">{pct(f)}</span>;
            }}
            onEdit={() => {}}
          />
        </Card>
      </div>
    </AppShell>
  );
}

/** Corpo de tabela modalidade × bandeira. Pix mostra valor único (col. 1). */
function RateTableBody({
  table, editavel, render, onEdit,
}: {
  table: RateTable;
  editavel: boolean;
  render: (v: number | undefined, mod: string, b: Bandeira) => React.ReactNode;
  onEdit: (mod: string, b: Bandeira, v: number) => void;
}) {
  return (
    <table className="w-full text-[15px] border-collapse">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left font-medium text-muted py-2 pr-4">Modalidade</th>
          {BANDEIRAS.map((b) => (
            <th key={b.id} className="text-right font-medium text-muted py-2 px-3">{b.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {MODALIDADES.map((m: ModalidadeRow) => (
          <tr key={m.id} className="border-b border-border-soft hover:bg-surface-1">
            <td className="py-[7px] pr-4 text-ink">{m.label}</td>
            {BANDEIRAS.map((b, i) => {
              if (m.pixUnico && i > 0) {
                return <td key={b.id} className="py-[7px] px-3 text-right text-faint">—</td>;
              }
              const v = table[m.id]?.[b.id];
              return (
                <td key={b.id} className="py-[7px] px-3 text-right tabular-nums text-ink">
                  {editavel ? (
                    <TaxaInput value={v ?? 0} onCommit={(nv) => onEdit(m.id, b.id, nv)} />
                  ) : (
                    render(v, m.id, b.id)
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
