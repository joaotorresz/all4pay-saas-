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
  type Grupo,
  type Modalidade,
  type PosConfig,
  type Cenario,
  loadPosConfig,
  savePosConfig,
  POS_DEFAULT,
  mdrTable,
  mdrKey,
  taxaFinal,
} from "@/lib/pos-taxas";

/** % a partir de decimal, pt-BR, sempre tabular (ex.: 2,2500%). */
function pct(v: number, casas = 4): string {
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
}
/** decimal a partir de string "2,25" (em %) → 0.0225. */
function parsePct(s: string): number {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n / 100 : 0;
}

const GRUPOS_MDR: { grupo: Grupo; label: string }[] = [
  { grupo: "pix", label: "Pix" },
  { grupo: "debito", label: "Débito" },
  { grupo: "credito_vista", label: "Crédito à vista" },
  { grupo: "parc_2_6", label: "Parcelado 2–6x" },
  { grupo: "parc_7_12", label: "Parcelado 7–12x" },
  { grupo: "parc_13_18", label: "Parcelado 13–18x" },
  { grupo: "parc_19_21", label: "Parcelado 19–21x" },
];

/** Célula editável de taxa (input inline % com edição local). */
function TaxaInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [txt, setTxt] = React.useState(() => (value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 6 }));
  React.useEffect(() => {
    setTxt((value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 6 }));
  }, [value]);
  return (
    <div className="inline-flex items-center gap-1">
      <input
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => onCommit(parsePct(txt))}
        inputMode="decimal"
        className="w-[72px] h-8 px-2 text-right rounded-sm bg-white border border-border text-[15px] text-ink tabular-nums outline-none focus:border-faint"
      />
      <span className="text-faint text-[13px]">%</span>
    </div>
  );
}

export function CentralPosTaxasView() {
  const [cfg, setCfg] = React.useState<PosConfig>(POS_DEFAULT);
  const [mcc, setMcc] = React.useState(MCCS[0].mcc);
  const [range, setRange] = React.useState(RANGES[0]);
  const [cen, setCen] = React.useState<Cenario>({ antecipacao: true, online: false });
  const [editando, setEditando] = React.useState(false);
  const [salvo, setSalvo] = React.useState(false);

  React.useEffect(() => { setCfg(loadPosConfig()); }, []);

  const mdrT = React.useMemo(() => mdrTable(cfg, mcc, range), [cfg, mcc, range]);
  const selicTxt = (cfg.selic * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  function persistir(next: PosConfig) {
    setCfg(next);
    savePosConfig(next);
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 1600);
  }

  function editMdr(b: Bandeira, grupo: Grupo, v: number) {
    const key = mdrKey(mcc, range);
    const tabela = { ...mdrTable(cfg, mcc, range) };
    tabela[b] = { ...tabela[b], [grupo]: v };
    persistir({ ...cfg, mdrByKey: { ...cfg.mdrByKey, [key]: tabela } });
  }
  function editOnline(b: Bandeira, grupo: Grupo, v: number) {
    persistir({ ...cfg, online: { ...cfg.online, [b]: { ...cfg.online[b], [grupo]: v } } });
  }
  function editAntecip(parcela: number, v: number) {
    const antecip = [...cfg.antecip];
    antecip[parcela] = v;
    persistir({ ...cfg, antecip });
  }
  function editSelic(v: number) { persistir({ ...cfg, selic: v }); }
  function restaurar() { persistir(POS_DEFAULT); }

  const mccDesc = MCCS.find((m) => m.mcc === mcc)?.descricao ?? "";

  return (
    <AppShell
      title="Configuração de taxas all4pay"
      crumb="Central POS · simulador de taxas"
      actions={
        <div className="flex items-center gap-2">
          {salvo && <span className="text-caption text-positive">Salvo</span>}
          <Button variant="ghost" onClick={restaurar}>Restaurar padrão</Button>
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
        {/* Inputs do simulador */}
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select
              label="MCC (ramo)"
              value={mcc}
              onChange={setMcc}
              options={MCCS.map((m) => ({ value: m.mcc, label: `${m.mcc} · ${m.descricao}` }))}
            />
            <Select
              label="Range de faturamento"
              value={range}
              onChange={setRange}
              options={RANGES.map((r) => ({ value: r, label: r }))}
            />
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">SELIC / CDI a.a.</span>
              <div className="inline-flex items-center gap-2 h-10">
                <input
                  value={selicTxt}
                  onChange={(e) => editSelic(parsePct(e.target.value))}
                  inputMode="decimal"
                  className="w-[96px] h-10 px-3 text-right rounded-md bg-white border border-border text-body text-ink tabular-nums outline-none focus:border-faint"
                />
                <span className="text-faint text-label">%</span>
              </div>
            </div>
            <div className="flex flex-col gap-[10px] justify-center">
              <Switch
                checked={cen.antecipacao}
                onChange={(v) => setCen((c) => ({ ...c, antecipacao: v }))}
                label="Terá antecipação?"
              />
              <Switch
                checked={cen.online}
                onChange={(v) => setCen((c) => ({ ...c, online: v }))}
                label="Online (e-commerce)?"
              />
            </div>
          </div>
          <p className="text-caption text-faint mt-3">
            {mccDesc} · {range} · {cen.antecipacao ? "com antecipação" : "sem antecipação"} ·{" "}
            {cen.online ? "online" : "presencial"}. Antecipação e online juntos não combinam (a célula exibe “Não antecipa”).
          </p>
        </Card>

        {/* Matriz de taxa final */}
        <Card className="overflow-x-auto">
          <div className="text-h3 text-ink mb-1">Taxa final ao EC</div>
          <p className="text-caption text-faint mb-4">
            Modalidade × bandeira — taxa efetiva aplicada ao estabelecimento no cenário selecionado.
          </p>
          <table className="w-full text-[15px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted py-2 pr-4">Modalidade</th>
                {BANDEIRAS.map((b) => (
                  <th key={b.id} className="text-right font-medium text-muted py-2 px-3 tabular-nums">{b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODALIDADES.map((m: Modalidade) => (
                <tr key={m.id} className="border-b border-border-soft hover:bg-surface-1">
                  <td className="py-[7px] pr-4 text-ink">{m.label}</td>
                  {BANDEIRAS.map((b) => {
                    const t = taxaFinal(mdrT, cfg, m, b.id, cen);
                    return (
                      <td key={b.id} className="py-[7px] px-3 text-right tabular-nums text-ink">
                        {t === "NAO_ANTECIPA" ? (
                          <span className="text-faint text-caption">Não antecipa</span>
                        ) : (
                          pct(t)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Tabelas editáveis */}
        {editando && (
          <>
            <Card className="overflow-x-auto">
              <div className="text-h3 text-ink mb-1">MDR base · {mcc} · {range}</div>
              <p className="text-caption text-faint mb-4">Taxa base por bandeira × grupo de modalidade (sem antecipação/online).</p>
              <table className="w-full text-[15px] border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-medium text-muted py-2 pr-4">Grupo</th>
                    {BANDEIRAS.map((b) => (
                      <th key={b.id} className="text-right font-medium text-muted py-2 px-3">{b.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRUPOS_MDR.map(({ grupo, label }) => (
                    <tr key={grupo} className="border-b border-border-soft">
                      <td className="py-[7px] pr-4 text-ink">{label}</td>
                      {BANDEIRAS.map((b) => (
                        <td key={b.id} className="py-[7px] px-3 text-right">
                          <TaxaInput value={mdrT[b.id]?.[grupo] ?? 0} onCommit={(v) => editMdr(b.id, grupo, v)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-x-auto">
              <div className="text-h3 text-ink mb-1">Acréscimo online (e-commerce)</div>
              <p className="text-caption text-faint mb-4">Somado ao MDR quando a venda é online (e não há antecipação).</p>
              <table className="w-full text-[15px] border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-medium text-muted py-2 pr-4">Grupo</th>
                    {BANDEIRAS.map((b) => (
                      <th key={b.id} className="text-right font-medium text-muted py-2 px-3">{b.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRUPOS_MDR.filter((g) => g.grupo !== "pix" && g.grupo !== "debito").map(({ grupo, label }) => (
                    <tr key={grupo} className="border-b border-border-soft">
                      <td className="py-[7px] pr-4 text-ink">{label}</td>
                      {BANDEIRAS.map((b) => (
                        <td key={b.id} className="py-[7px] px-3 text-right">
                          <TaxaInput value={cfg.online[b.id]?.[grupo] ?? 0} onCommit={(v) => editOnline(b.id, grupo, v)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-x-auto">
              <div className="text-h3 text-ink mb-1">Antecipação por parcela (CDI+)</div>
              <p className="text-caption text-faint mb-4">Custo de antecipação somado ao MDR por número de parcelas (crédito).</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
                {cfg.antecip.map((v, i) =>
                  i === 0 ? null : (
                    <div key={i} className="flex items-center justify-between gap-2 py-1 border-b border-border-soft">
                      <span className="text-muted text-[15px]">{i === 1 ? "Crédito à vista" : `${i}x`}</span>
                      <TaxaInput value={v} onCommit={(nv) => editAntecip(i, nv)} />
                    </div>
                  ),
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
