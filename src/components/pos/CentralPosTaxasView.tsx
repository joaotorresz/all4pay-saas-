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
  spreadBips,
} from "@/lib/pos-taxas";

/** % a partir de decimal, pt-BR (ex.: 2,25%). */
function pct(v: number): string {
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + "%";
}
function parsePct(s: string): number {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n / 100 : 0;
}

/** Célula editável de taxa (input inline em %). */
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
        className="w-[70px] h-8 px-2 text-right rounded-sm bg-white border border-border text-[15px] text-ink tabular-nums outline-none focus:border-faint"
      />
      <span className="text-faint text-[13px]">%</span>
    </span>
  );
}

/** Tabela modalidade × bandeira (custo ou taxa). Pix mostra valor único. */
function RateGrid({
  titulo, subtitulo, table, editavel, onEdit,
}: {
  titulo: string; subtitulo: string; table: RateTable;
  editavel: boolean; onEdit: (mod: string, b: Bandeira, v: number) => void;
}) {
  return (
    <Card className="overflow-x-auto">
      <div className="text-h3 text-ink mb-1">{titulo}</div>
      <p className="text-caption text-faint mb-4">{subtitulo}</p>
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
                // Pix: valor único (só a 1ª coluna), demais traço.
                if (m.pixUnico && i > 0) {
                  return <td key={b.id} className="py-[7px] px-3 text-right text-faint">—</td>;
                }
                const v = table[m.id]?.[b.id];
                return (
                  <td key={b.id} className="py-[7px] px-3 text-right tabular-nums text-ink">
                    {editavel ? (
                      <TaxaInput value={v ?? 0} onCommit={(nv) => onEdit(m.id, b.id, nv)} />
                    ) : v == null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      pct(v)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function CentralPosTaxasView() {
  const [cfg, setCfg] = React.useState<PosConfig>(POS_DEFAULT);
  const [editando, setEditando] = React.useState(false);
  const [salvo, setSalvo] = React.useState(false);

  React.useEffect(() => { setCfg(loadPosConfig()); }, []);

  function persistir(next: PosConfig) {
    setCfg(next);
    savePosConfig(next);
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 1600);
  }
  const set = <K extends keyof PosConfig>(k: K, v: PosConfig[K]) => persistir({ ...cfg, [k]: v });

  function editTabela(qual: "custo" | "taxa", mod: string, b: Bandeira, v: number) {
    const table = { ...cfg[qual] };
    table[mod] = { ...table[mod], [b]: v };
    persistir({ ...cfg, [qual]: table });
  }

  const selicTxt = (cfg.selic * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <AppShell
      title="Taxa padrão"
      crumb="Central POS · simulador visão parceiro"
      actions={
        <div className="flex items-center gap-2">
          {salvo && <span className="text-caption text-positive">Salvo</span>}
          <Button variant="ghost" onClick={() => persistir(POS_DEFAULT)}>Restaurar padrão</Button>
          <Button
            variant={editando ? "primary" : "secondary"}
            leftIcon={<Icon name="settings" size={15} />}
            onClick={() => setEditando((e) => !e)}
          >
            {editando ? "Concluir edição" : "Editar taxas"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        <div className="text-caption text-faint -mb-1">
          Simulador visão parceiro · MDR + Antecipação
        </div>

        {/* Dados cadastrais / informações de precificação */}
        <Card>
          <div className="text-h3 text-ink mb-4">Informações de precificação</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">Parceiro</span>
              <div className="h-10 flex items-center text-body text-ink">ALL4PAY</div>
            </div>
            <Select
              label="Descrição MCC"
              value={cfg.mccDesc}
              onChange={(v) => set("mccDesc", v)}
              options={MCCS.map((m) => ({ value: m.descricao, label: m.descricao }))}
            />
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">MCC</span>
              <div className="h-10 flex items-center text-body text-ink tabular-nums">{mccCodigo(cfg.mccDesc)}</div>
            </div>
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">Valor transação (TPV)</span>
              <div className="inline-flex items-center gap-2 h-10">
                <span className="text-faint text-label">R$</span>
                <input
                  value={cfg.tpv.toLocaleString("pt-BR")}
                  onChange={(e) => set("tpv", Number(e.target.value.replace(/\D/g, "")) || 0)}
                  inputMode="numeric"
                  className="w-[140px] h-10 px-3 text-right rounded-md bg-white border border-border text-body text-ink tabular-nums outline-none focus:border-faint"
                />
              </div>
            </div>
            <Select
              label="Range"
              value={cfg.range}
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
            <div className="flex items-center h-10 mt-5">
              <Switch checked={cfg.antecipacao} onChange={(v) => set("antecipacao", v)} label="Terá antecipação?" />
            </div>
            <div className="flex items-center h-10 mt-5">
              <Switch checked={cfg.online} onChange={(v) => set("online", v)} label="Online" />
            </div>
          </div>
        </Card>

        {/* Taxa de custo MDR */}
        <RateGrid
          titulo="Taxa de custo MDR"
          subtitulo="Custo MDR por modalidade × bandeira (o que a all4pay paga)."
          table={cfg.custo}
          editavel={editando}
          onEdit={(mod, b, v) => editTabela("custo", mod, b, v)}
        />

        {/* Taxa final para o estabelecimento */}
        <RateGrid
          titulo="Taxa final para o estabelecimento"
          subtitulo="Taxa MDR efetivamente aplicada ao estabelecimento."
          table={cfg.taxa}
          editavel={editando}
          onEdit={(mod, b, v) => editTabela("taxa", mod, b, v)}
        />

        {/* Spread em bips */}
        <Card className="overflow-x-auto">
          <div className="text-h3 text-ink mb-1">Spread em bips</div>
          <p className="text-caption text-faint mb-4">Margem do parceiro = Taxa MDR − Custo MDR (em pontos-base).</p>
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
              {MODALIDADES.map((m) => (
                <tr key={m.id} className="border-b border-border-soft hover:bg-surface-1">
                  <td className="py-[7px] pr-4 text-ink">{m.label}</td>
                  {BANDEIRAS.map((b, i) => {
                    if (m.pixUnico && i > 0) {
                      return <td key={b.id} className="py-[7px] px-3 text-right text-faint">—</td>;
                    }
                    const bips = spreadBips(cfg.taxa[m.id]?.[b.id], cfg.custo[m.id]?.[b.id]);
                    return (
                      <td key={b.id} className="py-[7px] px-3 text-right tabular-nums">
                        {bips == null ? (
                          <span className="text-faint">—</span>
                        ) : (
                          <span className={bips < 0 ? "text-negative" : "text-ink"}>
                            {bips > 0 ? "+" : ""}{bips.toLocaleString("pt-BR")} bps
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
