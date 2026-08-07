"use client";

import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { Card, Select, Switch, Icon, Button } from "@/components/ui";
import {
  BANDEIRAS,
  GRUPOS,
  PARCELAS,
  MCCS,
  RANGES,
  type Bandeira,
  type Grupo,
  type RateTable,
  type PosConfig,
  loadPosConfig,
  fetchPosConfig,
  persistPosConfig,
  POS_DEFAULT,
  mccCodigo,
  custoTable,
  taxaFinalParcela,
  custoAntecipParceiroMensal,
  antecipEC,
  diasParcela,
} from "@/lib/pos-taxas";

/** % a partir de decimal, pt-BR com sinal — 2 casas (ex.: 2,25% · −0,05%). */
function pct(v: number): string {
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
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
  const [abertos, setAbertos] = React.useState<Record<string, boolean>>({});
  const toggleParcela = (id: string) => setAbertos((o) => ({ ...o, [id]: !o[id] }));

  React.useEffect(() => {
    setCfg(loadPosConfig());           // pintura instantânea (cache)
    fetchPosConfig().then(setCfg);     // hidrata do pos_rates (live)
  }, []);

  const editando = draft !== null;
  const ativo = draft ?? cfg;
  const custo = React.useMemo(() => custoTable(ativo.mccDesc, ativo.range), [ativo.mccDesc, ativo.range]);

  function persistir(next: PosConfig) {
    setCfg(next);
    persistPosConfig(next).catch(() => { /* cache local já gravou */ });
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 2000);
  }
  function mutate(next: PosConfig) {
    if (editando) setDraft(next); else persistir(next);
  }
  const set = <K extends keyof PosConfig>(k: K, v: PosConfig[K]) => mutate({ ...ativo, [k]: v });

  function editSpread(g: Grupo, b: Bandeira, v: number) {
    const spread: RateTable = { ...ativo.spread };
    spread[g] = { ...spread[g], [b]: v };
    mutate({ ...ativo, spread });
  }

  function iniciarEdicao() { setDraft(JSON.parse(JSON.stringify(cfg)) as PosConfig); }
  function salvarEdicoes() { if (draft) persistir(draft); setDraft(null); }
  function cancelarEdicao() { setDraft(null); }
  function restaurarPadrao() { setDraft(null); persistir(POS_DEFAULT); }

  const selicTxt = (ativo.selic * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const antecipTxt = (ativo.taxaAntecipMensal * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const custoParceiroAM = custoAntecipParceiroMensal(ativo.selic, ativo.range);
  const spreadAntecipAM = ativo.taxaAntecipMensal - custoParceiroAM;

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
                Editar spread
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        <div className="text-caption text-faint -mb-1">Simulador visão parceiro · MDR + Antecipação</div>

        {/* Informações de precificação */}
        <Card info={{ titulo: "Informações de precificação", oQue: "Define os parâmetros que alimentam o cálculo das taxas: ramo, range, SELIC e antecipação.", comoCalcula: "O MCC e o range escolhidos determinam a tabela de custo; SELIC e taxa de antecipação entram no custo do parceiro e no spread." }}>
          <div className="text-h3 text-ink mb-4">Informações de precificação</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">Parceiro</span>
              <div className="h-10 flex items-center text-body text-ink">all4pay</div>
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
            <div className="flex flex-col gap-[6px]">
              <span className="text-label font-medium text-muted">Taxa de antecipação a.m.</span>
              <div className="inline-flex items-center gap-2 h-10">
                <input
                  value={antecipTxt}
                  onChange={(e) => set("taxaAntecipMensal", parsePct(e.target.value))}
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
          <p className="text-caption text-faint mt-3">
            Custo de antecipação do parceiro (SELIC + CDI {RANGES.indexOf(ativo.range) >= 0 ? ativo.range : ""}):{" "}
            <span className="text-ink tabular-nums">{pct(custoParceiroAM)} a.m.</span> · spread de antecipação:{" "}
            <span className={spreadAntecipAM < 0 ? "text-negative tabular-nums" : "text-ink tabular-nums"}>{pct(spreadAntecipAM)} a.m.</span>
            {ativo.antecipacao && ativo.online && <> · antecipação + online juntos não combinam → “Não antecipa”.</>}
          </p>
        </Card>

        {/* Taxa de custo MDR — reage a MCC × Range */}
        <Card className="overflow-x-auto" info={{ titulo: "Taxa de custo MDR", oQue: "O que a all4pay paga de custo por grupo e bandeira, antes da margem.", comoCalcula: "Vem da tabela de custo do MCC e do range selecionados, cruzando grupo (débito/crédito/pix) com bandeira." }}>
          <div className="text-h3 text-ink mb-1">Taxa de custo MDR</div>
          <p className="text-caption text-faint mb-4">
            Custo por grupo × bandeira para {mccCodigo(ativo.mccDesc)} · {ativo.range} (o que a all4pay paga).
          </p>
          <GrupoTable
            cell={(g, b) => {
              const v = custo[g]?.[b];
              return v == null ? <span className="text-faint">—</span> : pct(v);
            }}
          />
        </Card>

        {/* Spread — editável em % */}
        <Card className="overflow-x-auto" info={{ titulo: "Spread", oQue: "A margem do parceiro somada ao custo para formar a taxa final.", comoCalcula: "Valor em pontos percentuais por grupo e bandeira. Taxa MDR ao EC = custo mais spread." }}>
          <div className="text-h3 text-ink mb-1">Spread</div>
          <p className="text-caption text-faint mb-4">
            Margem do parceiro em %. Aumentar/diminuir aqui reflete diretamente na taxa final ao EC (Taxa MDR = Custo + Spread).
          </p>
          <GrupoTable
            cell={(g, b) => {
              const v = ativo.spread[g]?.[b];
              if (editando && !(g === "pix" && b !== "master")) {
                return <TaxaInput value={v ?? 0} onCommit={(nv) => editSpread(g, b, nv)} />;
              }
              if (v == null) return <span className="text-faint">—</span>;
              return <span className={v < 0 ? "text-negative" : "text-ink"}>{v > 0 ? "+" : ""}{pct(v)}</span>;
            }}
          />
        </Card>

        {/* Taxa final ao estabelecimento — por parcela, reage aos toggles */}
        <Card className="overflow-x-auto" info={{ titulo: "Taxa final ao estabelecimento", oQue: "A taxa efetiva que o lojista paga, por parcela e bandeira.", comoCalcula: "Custo mais spread, somando a antecipação por parcela quando ativada (e dependente de online ou presencial)." }}>
          <div className="text-h3 text-ink mb-1">Taxa final para o estabelecimento (MDR + antecipação)</div>
          <p className="text-caption text-faint mb-4">
            Taxa efetiva ao EC por parcela.{" "}
            {ativo.antecipacao ? "Com antecipação" : "Sem antecipação"} · {ativo.online ? "online" : "presencial"}.
            {ativo.antecipacao && !ativo.online && " Clique no número da parcela para ver o valor por mês."}
          </p>
          <table className="w-full text-[15px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted py-2 pr-4">Parcela</th>
                {BANDEIRAS.map((b) => (
                  <th key={b.id} className="text-right font-medium text-muted py-2 px-3">{b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PARCELAS.map((row) => {
                const expansivel = ativo.antecipacao && !ativo.online && !row.semAntecip;
                const aberto = expansivel && !!abertos[row.id];
                const meses = diasParcela(row.parcela) / 30;
                const antecip = antecipEC(row.parcela, ativo.taxaAntecipMensal);
                return (
                  <React.Fragment key={row.id}>
                    <tr className={aberto ? "hover:bg-surface-1" : "border-b border-border-soft hover:bg-surface-1"}>
                      <td className="py-[7px] pr-4 text-ink">
                        {expansivel ? (
                          <button
                            onClick={() => toggleParcela(row.id)}
                            className="inline-flex items-center gap-1 hover:text-ink"
                            title="Ver valor por mês"
                          >
                            <Icon name={aberto ? "chevron-down" : "chevron-right"} size={14} color="var(--color-text-tertiary)" />
                            {row.label}
                          </button>
                        ) : (
                          row.label
                        )}
                      </td>
                      {BANDEIRAS.map((b, i) => {
                        if (row.pixUnico && i > 0) {
                          return <td key={b.id} className="py-[7px] px-3 text-right text-faint">—</td>;
                        }
                        const t = taxaFinalParcela(ativo, custo, row, b.id);
                        return (
                          <td key={b.id} className="py-[7px] px-3 text-right tabular-nums text-ink">
                            {t === undefined ? (
                              <span className="text-faint">—</span>
                            ) : t === "NAO_ANTECIPA" ? (
                              <span className="text-faint text-caption">Não antecipa</span>
                            ) : (
                              pct(t)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {aberto && (
                      <tr className="bg-surface-1 border-b border-border-soft">
                        <td colSpan={BANDEIRAS.length + 1} className="px-4 py-3">
                          <div className="text-caption text-muted mb-2">
                            Antecipação aplicada: <span className="text-ink tabular-nums">+{pct(antecip)}</span> ·
                            taxa de antecipação <span className="text-ink tabular-nums">{pct(ativo.taxaAntecipMensal)} a.m.</span> ·
                            prazo médio <span className="text-ink tabular-nums">{diasParcela(row.parcela)} dias</span>
                            {" "}(~{meses.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {meses === 1 ? "mês" : "meses"})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {BANDEIRAS.map((b) => {
                              const t = taxaFinalParcela(ativo, custo, row, b.id);
                              if (typeof t !== "number") {
                                return (
                                  <div key={b.id} className="rounded-md border border-border-soft bg-white px-3 py-2">
                                    <div className="text-caption text-faint">{b.label}</div>
                                    <div className="text-faint">—</div>
                                  </div>
                                );
                              }
                              return (
                                <div key={b.id} className="rounded-md border border-border-soft bg-white px-3 py-2">
                                  <div className="text-caption text-faint">{b.label}</div>
                                  <div className="flex items-baseline justify-between gap-3 mt-1">
                                    <span className="text-caption text-muted">taxa</span>
                                    <span className="text-ink tabular-nums">{pct(t)}</span>
                                  </div>
                                  <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-caption text-muted">por mês</span>
                                    <span className="text-ink tabular-nums">{pct(t / meses)} a.m.</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

/** Tabela genérica grupo × bandeira (custo / spread). Pix = valor único. */
function GrupoTable({ cell }: { cell: (g: Grupo, b: Bandeira) => React.ReactNode }) {
  return (
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
        {GRUPOS.map((g) => (
          <tr key={g.id} className="border-b border-border-soft hover:bg-surface-1">
            <td className="py-[7px] pr-4 text-ink">{g.label}</td>
            {BANDEIRAS.map((b, i) =>
              g.pixUnico && i > 0 ? (
                <td key={b.id} className="py-[7px] px-3 text-right text-faint">—</td>
              ) : (
                <td key={b.id} className="py-[7px] px-3 text-right tabular-nums text-ink">{cell(g.id, b.id)}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
