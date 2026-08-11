"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TABELAS LEGAIS — onde o contador entra a portaria de janeiro.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Esta tela existe porque o produto NÃO PODE saber a tabela do ano que
 * vem.** As faixas do INSS saem de uma portaria interministerial de janeiro,
 * reajustadas pelo INPC; deduzi-las é impossível e chutá-las é o defeito que
 * `core/folha/tabelas` foi escrito para impedir — um número bem formatado, com
 * ar de exato, que só aparece numa autuação.
 *
 * O que o sistema garante é a ARITMÉTICA (progressividade por faixa, teto, os
 * dois critérios do IRRF, o redutor) e a VIGÊNCIA. A alíquota é do contador,
 * como o ISS do município já é na tela de impostos sobre vendas.
 *
 * A tela mostra PRIMEIRO qual tabela está valendo na competência aberta —
 * porque a pergunta que traz alguém aqui é "com que números este cálculo foi
 * feito", e ela precisa ser respondida antes de qualquer campo de digitação.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Button, Icon, Input } from "@/components/ui";
import { formatBRL, pct } from "@/lib/format";
import {
  tabelasDaEmpresa, tabelasDigitadas, salvarTabelaINSS, removerVigencia, problemasINSS,
} from "@/lib/folha-tabelas";
import { inssDe, irrfDe, type TabelaINSS, type FaixaINSS } from "@/core/folha";

const mesAtual = () => new Date().toISOString().slice(0, 7);

/**
 * ⚠️ Aceita vírgula: o contador digita "8.157,41" e "0,14", não "8157.41".
 * O ponto de milhar sai antes, senão `Number("8.157,41")` vira NaN e a faixa
 * nasce zerada — uma tabela que parece salva e desconta errado.
 */
const numero = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;

/** Uma faixa em branco herda o formato da anterior — 4 é o desenho da lei. */
const FAIXAS_EM_BRANCO: FaixaINSS[] = [
  { ate: 0, aliquota: 0.075 },
  { ate: 0, aliquota: 0.09 },
  { ate: 0, aliquota: 0.12 },
  { ate: 0, aliquota: 0.14 },
];

export function ModalTabelas({
  competencia, onFechar, onMudou,
}: {
  competencia: string;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [montado, setMontado] = React.useState(false);
  const [versao, setVersao] = React.useState(0);
  const [editando, setEditando] = React.useState(false);
  const [erros, setErros] = React.useState<string[]>([]);
  const [nova, setNova] = React.useState<TabelaINSS>(() => ({
    desde: `${new Date().getFullYear()}-01`,
    fonte: "",
    salarioMinimo: 0,
    faixas: FAIXAS_EM_BRANCO.map((f) => ({ ...f })),
  }));

  React.useEffect(() => { setMontado(true); }, []);
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);

  // `versao` força a releitura depois de gravar — o store é síncrono.
  const tabelas = React.useMemo(() => { void versao; return tabelasDaEmpresa(); }, [versao]);
  const digitadas = React.useMemo(() => { void versao; return tabelasDigitadas(); }, [versao]);
  const emUso = React.useMemo(() => ({
    inss: inssDe(competencia || mesAtual(), tabelas),
    irrf: irrfDe(competencia || mesAtual(), tabelas),
  }), [competencia, tabelas]);

  if (!montado) return null;

  const salvar = () => {
    const p = problemasINSS(nova);
    setErros(p);
    if (p.length > 0) return;
    salvarTabelaINSS(nova);
    setVersao((v) => v + 1);
    setEditando(false);
    onMudou();
  };

  const setFaixa = (i: number, patch: Partial<FaixaINSS>) =>
    setNova((t) => ({ ...t, faixas: t.faixas.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
      <div role="dialog" aria-modal="true" aria-label="Tabelas legais"
        className="w-full max-w-[820px] rounded-card bg-white shadow-popover">
        <div className="flex items-start justify-between gap-3 p-6 border-b border-border-soft">
          <div className="min-w-0">
            <span className="block text-h3 text-ink">Tabelas legais</span>
            <span className="block text-caption text-muted mt-1">
              Com que números a folha desta competência foi calculada.
            </span>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-ink hover:bg-surface-2 shrink-0">
            <Icon name="x" size={16} color="currentColor" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* ------------------------ o que está valendo ------------------------ */}
          <div className="rounded-card bg-surface-2 p-4 flex flex-col gap-4">
            <Bloco
              titulo="INSS do empregado"
              vigencia={emUso.inss.tabela.desde}
              fonte={emUso.inss.tabela.fonte}
              atrasada={emUso.inss.desatualizada}
            >
              <div className="flex flex-col gap-1">
                {emUso.inss.tabela.faixas.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-caption">
                    <span className="text-muted">
                      {i === 0 ? "até" : "de"} {i === 0 ? "" : `${formatBRL(emUso.inss.tabela.faixas[i - 1].ate)} a `}
                      {formatBRL(f.ate)}
                    </span>
                    <span className="a4p-num text-ink">{pct(f.aliquota)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 text-caption pt-1 border-t border-border-soft">
                  <span className="text-muted">Salário mínimo da vigência</span>
                  <span className="a4p-num text-ink">{formatBRL(emUso.inss.tabela.salarioMinimo)}</span>
                </div>
              </div>
            </Bloco>

            <Bloco
              titulo="IRRF"
              vigencia={emUso.irrf.tabela.desde}
              fonte={emUso.irrf.tabela.fonte}
              atrasada={emUso.irrf.desatualizada}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3 text-caption">
                  <span className="text-muted">Isento até</span>
                  <span className="a4p-num text-ink">{formatBRL(emUso.irrf.tabela.faixas[0].ate)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-caption">
                  <span className="text-muted">Desconto simplificado</span>
                  <span className="a4p-num text-ink">{formatBRL(emUso.irrf.tabela.descontoSimplificado)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-caption">
                  <span className="text-muted">Por dependente</span>
                  <span className="a4p-num text-ink">{formatBRL(emUso.irrf.tabela.porDependente)}</span>
                </div>
                {/* ⚠️ O redutor precisa aparecer NOMEADO: é ele que faz um
                    salário de 5 mil reter zero, e um zero sem explicação ao
                    lado de um desconto do ano passado lê como defeito. */}
                {emUso.irrf.tabela.redutor && (
                  <div className="mt-1 pt-2 border-t border-border-soft">
                    <span className="block text-caption text-ink">
                      Isenção efetiva até {formatBRL(5000)} · {emUso.irrf.tabela.redutor.fonte}
                    </span>
                    <span className="block text-caption text-muted mt-1">
                      O abatimento cobre o imposto inteiro até {formatBRL(5000)} e se dissolve até{" "}
                      {formatBRL(emUso.irrf.tabela.redutor.ate)}. As faixas não mudaram — a lei abate o
                      imposto apurado.
                    </span>
                  </div>
                )}
              </div>
            </Bloco>
          </div>

          {/* --------------------- a portaria que falta --------------------- */}
          {!editando && (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-caption text-muted">
                As faixas do INSS mudam por portaria todo janeiro, e o valor só existe quando ela sai —
                o sistema não tem como deduzi-lo. Quando o seu contador mandar a tabela do ano, entre
                com ela aqui: a aritmética (faixa a faixa, com teto) e a vigência continuam por nossa
                conta.
              </p>
              <div>
                <Button variant="secondary" onClick={() => setEditando(true)}>
                  <Icon name="plus" size={14} color="currentColor" />
                  Entrar com uma tabela de INSS
                </Button>
              </div>
            </div>
          )}

          {editando && (
            <div className="flex flex-col gap-4 rounded-card border border-border p-4">
              <span className="text-label text-ink">Nova vigência do INSS</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input label="Vigência (AAAA-MM)" value={nova.desde}
                  onChange={(ev) => setNova((t) => ({ ...t, desde: ev.target.value }))} placeholder="2026-01" />
                <Input label="Salário mínimo" value={nova.salarioMinimo ? String(nova.salarioMinimo) : ""}
                  onChange={(ev) => setNova((t) => ({ ...t, salarioMinimo: numero(ev.target.value) }))} />
                <Input label="Fonte" value={nova.fonte}
                  onChange={(ev) => setNova((t) => ({ ...t, fonte: ev.target.value }))}
                  placeholder="Portaria MPS/MF nº …" />
              </div>
              <div className="flex flex-col gap-2">
                {nova.faixas.map((f, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3">
                    <Input label={`Faixa ${i + 1} — até`} value={f.ate ? String(f.ate) : ""}
                      onChange={(ev) => setFaixa(i, { ate: numero(ev.target.value) })} />
                    <Input label="Alíquota (0,075 = 7,5%)" value={String(f.aliquota)}
                      onChange={(ev) => setFaixa(i, { aliquota: numero(ev.target.value) })} />
                  </div>
                ))}
              </div>
              {erros.length > 0 && (
                <div className="flex flex-col gap-1">
                  {erros.map((e) => (
                    <span key={e} className="text-caption text-negative">{e}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={salvar}>Salvar vigência</Button>
                <Button variant="ghost" onClick={() => { setEditando(false); setErros([]); }}>Cancelar</Button>
              </div>
            </div>
          )}

          {digitadas.inss.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-label text-ink">Vigências que você entrou</span>
              {digitadas.inss.map((t) => (
                <div key={t.desde} className="flex items-center justify-between gap-3 text-caption">
                  <span className="text-muted truncate">{t.desde} · {t.fonte}</span>
                  <Button variant="ghost" onClick={() => { removerVigencia("inss", t.desde); setVersao((v) => v + 1); onMudou(); }}>
                    Remover
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border-soft flex items-center justify-end">
          <Button variant="secondary" onClick={onFechar}>Fechar</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Bloco({
  titulo, vigencia, fonte, atrasada, children,
}: {
  titulo: string; vigencia: string; fonte: string; atrasada: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-label text-ink">{titulo}</span>
        <span className="text-caption text-faint">
          vigência {vigencia}
          {/* ⚠️ "Desatualizada" é dito ao lado da tabela, não só num aviso no
              topo: quem abre esta janela quer saber se ESTE número é o de hoje. */}
          {atrasada && <span className="text-warning"> · não é a mais recente</span>}
        </span>
      </div>
      <span className="block text-caption text-muted">{fonte}</span>
      {children}
    </div>
  );
}
