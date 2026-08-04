"use client";

/**
 * O chrome comum dos relatórios (DRE, DFC e as versões multiempresa).
 *
 * As quatro telas repetem a mesma anatomia: filtros de período/tipo/recorte,
 * um painel de layout da tabela (nível, tema, zeradas, cifrão, gráfico), a
 * tabela em cascata com célula clicável, e as exportações. Centralizar isso é
 * o que impede as quatro de divergirem.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Card, Button, Icon, Select, DateField, Checkbox } from "@/components/ui";
import { useRiscoInput, useAccounts } from "@/components/visao-geral/hooks";
import { baixarXLSX } from "@/lib/xlsx";
import {
  intervaloDoPreset, rotuloColuna,
  type Intervalo, type PresetPeriodo, type TipoAnalise, type Relatorio, type LinhaRelatorio,
  type CelulaOrcamento, type SinalLinha,
} from "@/core/relatorios";
import { pctDeInteiro } from "@/lib/format";

/* ================================== temas ================================== */

/**
 * Os 10 temas do relatório.
 *
 * Isto é uma **extensão sancionada** do design system, e vale dizer por quê: o
 * DS tem um acento só (lime) porque a interface precisa de disciplina. Um
 * relatório exportado é outra coisa — vai para fora, com a marca de quem
 * assina, e a escolha do tema é do usuário, não do produto. O tema pinta
 * APENAS o cabeçalho e a faixa das linhas de total; texto, números e o resto
 * da tela seguem nos tokens de sempre.
 */
export interface TemaRelatorio { id: string; nome: string; base: string; suave: string; texto: string }

export const TEMAS: TemaRelatorio[] = [
  { id: "moss", nome: "Padrão (Moss)", base: "#2F6B3A", suave: "#E7F0E7", texto: "#FFFFFF" },
  { id: "lime", nome: "Luminous Lime", base: "#DCFF00", suave: "#F8FFCB", texto: "#11190C" },
  { id: "grafite", nome: "Grafite", base: "#3A3A3A", suave: "#EDEDED", texto: "#FFFFFF" },
  { id: "marinho", nome: "Marinho", base: "#1E3A5F", suave: "#E4EAF2", texto: "#FFFFFF" },
  { id: "ardosia", nome: "Ardósia", base: "#4A5568", suave: "#EDF0F4", texto: "#FFFFFF" },
  { id: "porsol", nome: "Pôr do Sol", base: "#B4531E", suave: "#F7E9E0", texto: "#FFFFFF" },
  { id: "oceano", nome: "Oceano", base: "#186C7A", suave: "#E1F0F2", texto: "#FFFFFF" },
  { id: "floresta", nome: "Floresta", base: "#1F4D2E", suave: "#E3EDE6", texto: "#FFFFFF" },
  { id: "vinho", nome: "Vinho", base: "#6B1F35", suave: "#F3E4E8", texto: "#FFFFFF" },
  { id: "mono", nome: "Monocromático", base: "#11190C", suave: "#F0F0EE", texto: "#FFFFFF" },
];

export const temaPorId = (id: string) => TEMAS.find((t) => t.id === id) ?? TEMAS[0];

/* ================================= layout ================================= */

export interface LayoutTabela {
  nivel: 1 | 2 | 3;
  tema: string;
  ocultarZeradas: boolean;
  mostrarCifrao: boolean;
  mostrarGrafico: boolean;
}

export const LAYOUT_PADRAO: LayoutTabela = {
  nivel: 3, tema: "moss", ocultarZeradas: false, mostrarCifrao: true, mostrarGrafico: false,
};

export function PainelLayout({ layout, onChange }: { layout: LayoutTabela; onChange: (l: LayoutTabela) => void }) {
  const t = temaPorId(layout.tema);
  return (
    <Card>
      <span className="text-h3 font-semibold text-ink">Layout da tabela</span>
      <div className="flex items-end gap-6 flex-wrap mt-3">
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Abrir até</label>
          <Select
            value={String(layout.nivel)}
            onChange={(v) => onChange({ ...layout, nivel: Number(v) as 1 | 2 | 3 })}
            options={[
              { value: "1", label: "Nível 1" },
              { value: "2", label: "Nível 2" },
              { value: "3", label: "Nível 3" },
            ]}
            containerClassName="w-[130px]"
          />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Tema</label>
          <div className="flex items-center gap-2">
            <Select
              value={layout.tema}
              onChange={(v) => onChange({ ...layout, tema: v })}
              options={TEMAS.map((x) => ({ value: x.id, label: x.nome }))}
              containerClassName="w-[190px]"
            />
            <span className="w-6 h-6 rounded-sm shrink-0" style={{ background: t.base }} aria-hidden />
          </div>
        </div>
        <Checkbox
          checked={layout.ocultarZeradas}
          onChange={(e) => onChange({ ...layout, ocultarZeradas: e.target.checked })}
          label="Ocultar categorias zeradas"
        />
        <Checkbox
          checked={layout.mostrarCifrao}
          onChange={(e) => onChange({ ...layout, mostrarCifrao: e.target.checked })}
          label="Mostrar cifrão"
        />
        <Checkbox
          checked={layout.mostrarGrafico}
          onChange={(e) => onChange({ ...layout, mostrarGrafico: e.target.checked })}
          label="Mostrar gráfico"
        />
      </div>
    </Card>
  );
}

/* ================================= filtros ================================= */

export interface FiltrosRelatorioValor {
  preset: PresetPeriodo;
  intervalo: Intervalo;
  tipo: TipoAnalise;
  conta: string | null;
  projeto: string | null;
  centro: string | null;
}

const hoje = () => new Date();
export const filtroPadrao = (): FiltrosRelatorioValor => {
  const d = hoje();
  const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return {
    // ⚠️ Doze meses por PADRÃO (mapa, item 3): abrir no mês corrente mostra um
    // DRE quase vazio no dia 2, e o usuário conclui que não há dados.
    preset: "doze_meses",
    intervalo: intervaloDoPreset("doze_meses", mes),
    tipo: "vertical", conta: null, projeto: null, centro: null,
  };
};

const PRESETS: { id: PresetPeriodo; label: string }[] = [
  { id: "doze_meses", label: "12 meses" },
  { id: "personalizado", label: "Personalizado" },
  { id: "trimestre", label: "Trimestre" },
  { id: "semestre", label: "Semestre" },
  { id: "ano", label: "Ano" },
];

export function FiltrosRelatorio({
  valor, onChange, onAtualizar, extra,
}: {
  valor: FiltrosRelatorioValor;
  onChange: (v: FiltrosRelatorioValor) => void;
  onAtualizar: () => void;
  extra?: React.ReactNode;
}) {
  const { data: contas } = useAccounts();
  const { data: input } = useRiscoInput();

  const listaDe = (campo: "projeto" | "costCenter") => {
    const s = new Set<string>();
    for (const m of input?.movements ?? []) {
      const v = campo === "projeto" ? m.projeto : m.costCenter;
      if (v) s.add(v);
    }
    return Array.from(s).sort();
  };
  const projetos = React.useMemo(() => listaDe("projeto"), [input]); // eslint-disable-line react-hooks/exhaustive-deps
  const centros = React.useMemo(() => listaDe("costCenter"), [input]); // eslint-disable-line react-hooks/exhaustive-deps

  const mesRef = valor.intervalo.ate.slice(0, 7);

  return (
    <Card>
      <span className="text-h3 font-semibold text-ink">Filtros</span>

      <div className="flex flex-col gap-[6px] mt-3">
        <label className="text-caption font-medium text-muted">
          Período<span className="text-negative"> *</span>
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESETS.map((p) => {
            const on = valor.preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onChange({
                  ...valor, preset: p.id,
                  intervalo: intervaloDoPreset(p.id, mesRef, valor.intervalo),
                })}
                className={`rounded-pill px-4 py-[7px] text-caption transition-colors ${
                  on ? "bg-surface-3 text-ink font-semibold" : "text-muted hover:text-ink hover:bg-surface-2"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <DateField
            value={valor.intervalo.de}
            onChange={(v) => onChange({ ...valor, preset: "personalizado", intervalo: { ...valor.intervalo, de: v } })}
          />
          <Icon name="arrow-up-right" size={14} color="var(--color-text-tertiary)" />
          <DateField
            value={valor.intervalo.ate}
            onChange={(v) => onChange({ ...valor, preset: "personalizado", intervalo: { ...valor.intervalo, ate: v } })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">
            Tipo<span className="text-negative"> *</span>
          </label>
          <Select
            value={valor.tipo}
            onChange={(v) => onChange({ ...valor, tipo: v as TipoAnalise })}
            options={[
              { value: "vertical", label: "Análise Vertical" },
              { value: "horizontal", label: "Análise Horizontal" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Contas bancárias</label>
          <Select
            value={valor.conta ?? ""}
            onChange={(v) => onChange({ ...valor, conta: v || null })}
            options={[
              { value: "", label: "Todas as contas bancárias" },
              ...(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Projeto</label>
          <Select
            value={valor.projeto ?? ""}
            onChange={(v) => onChange({ ...valor, projeto: v || null })}
            options={[
              { value: "", label: projetos.length ? "Todos os projetos" : "Nenhum lançamento com projeto" },
              ...projetos.map((p) => ({ value: p, label: p })),
            ]}
            disabled={projetos.length === 0}
          />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Centro de custo</label>
          <Select
            value={valor.centro ?? ""}
            onChange={(v) => onChange({ ...valor, centro: v || null })}
            options={[
              { value: "", label: centros.length ? "Todos os centros de custo" : "Nenhum lançamento com centro" },
              ...centros.map((c) => ({ value: c, label: c })),
            ]}
            disabled={centros.length === 0}
          />
        </div>
      </div>

      {extra}

      <div className="flex justify-end mt-4 pt-4 border-t border-border-soft">
        <Button variant="primary" onClick={onAtualizar}>
          <Icon name="rotate-ccw" size={15} color="currentColor" />
          Atualizar
        </Button>
      </div>
    </Card>
  );
}

/* ================================= tabela ================================= */

const fmt = (n: number, cifrao: boolean) => {
  const s = Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}${cifrao ? "R$ " : ""}${s}`;
};

export interface CelulaClicada { linha: string; coluna: string; movimentos: string[] }

export function TabelaRelatorio({
  relatorio, layout, onCelula, orcamento,
}: {
  relatorio: Relatorio;
  layout: LayoutTabela;
  onCelula: (c: CelulaClicada) => void;
  /** Comparação com orçamento por linha — acrescenta Orçado/Diferença/% por período. */
  orcamento?: Map<string, CelulaOrcamento[]>;
}) {
  const t = temaPorId(layout.tema);
  const [abertas, setAbertas] = React.useState<Set<string>>(new Set());

  // "Abrir até nível N" define o padrão; o clique na seta ajusta linha a linha.
  const expandida = (id: string) => (layout.nivel >= 3 ? !abertas.has(id) : abertas.has(id));

  const alternar = (id: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const visiveis = (l: LinhaRelatorio) =>
    layout.ocultarZeradas ? l.filhos.filter((f) => f.total.valor !== 0) : l.filhos;

  const pct = (v: number | null) => (v == null ? "-" : `${pctDeInteiro(v)}`);
  const mostrarPct = layout.nivel >= 1;
  // Com orçamento cada período ganha 3 colunas extras (Orçado · Dif. · %).
  const comOrc = !!orcamento;
  const colsPorPeriodo = (mostrarPct ? 2 : 1) + (comOrc ? 3 : 0);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-label">
          <thead>
            <tr style={{ background: t.base, color: t.texto }}>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] sticky left-0 z-[1] min-w-[260px]" style={{ background: t.base }}>
                Categoria
              </th>
              {relatorio.colunas.map((c) => (
                <th key={c} colSpan={colsPorPeriodo} className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em]">
                  {rotuloColuna(c)}{comOrc && <span className="font-normal opacity-70"> · realizado / orçado / dif. / %</span>}
                </th>
              ))}
              <th colSpan={mostrarPct ? 2 : 1} className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em]">Total</th>
              <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em]">Média</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.linhas.map((l) => {
              const total = l.tipo === "total";
              const filhos = visiveis(l);
              const aberta = expandida(l.id);
              return (
                <React.Fragment key={l.id}>
                  <tr
                    className="border-b border-border-soft"
                    style={total ? { background: t.suave } : undefined}
                  >
                    <td className={`px-4 py-[10px] sticky left-0 min-w-[260px] ${total ? "" : "bg-white"}`} style={total ? { background: t.suave } : undefined}>
                      <div className="flex items-center gap-2">
                        {filhos.length > 0 && layout.nivel > 1 ? (
                          <button onClick={() => alternar(l.id)} aria-label="Expandir" className="text-muted hover:text-ink">
                            <Icon name={aberta ? "chevron-down" : "chevron-right"} size={13} color="currentColor" />
                          </button>
                        ) : <span className="w-[13px]" />}
                        <span className={`text-faint text-caption w-[26px] shrink-0`}>{l.sinal}</span>
                        <span className={total ? "font-semibold text-ink" : "text-ink"}>{l.label}</span>
                      </div>
                    </td>
                    {l.celulas.map((c, k) => (
                      <React.Fragment key={k}>
                        <Valor
                          valor={c.valor} cifrao={layout.mostrarCifrao} forte={total}
                          onClick={c.movimentos.length ? () => onCelula({ linha: l.label, coluna: rotuloColuna(relatorio.colunas[k]), movimentos: c.movimentos }) : undefined}
                        />
                        {mostrarPct && <td className="px-2 py-[10px] text-right text-caption text-faint tabular-nums">{pct(c.av ?? c.ah)}</td>}
                        {comOrc && <CelulasOrcamento o={orcamento!.get(l.id)?.[k]} cifrao={layout.mostrarCifrao} sinalLinha={l.sinal} />}
                      </React.Fragment>
                    ))}
                    <Valor valor={l.total.valor} cifrao={layout.mostrarCifrao} forte
                      onClick={l.total.movimentos.length ? () => onCelula({ linha: l.label, coluna: "Total", movimentos: l.total.movimentos }) : undefined} />
                    {mostrarPct && <td className="px-2 py-[10px] text-right text-caption text-faint tabular-nums">{pct(l.total.av)}</td>}
                    <Valor valor={l.media.valor} cifrao={layout.mostrarCifrao} />
                  </tr>

                  {aberta && layout.nivel > 1 && filhos.map((f) => (
                    <tr key={f.id} className="border-b border-border-soft">
                      <td className="px-4 py-2 sticky left-0 bg-white min-w-[260px]">
                        <span className="pl-[54px] text-muted">{f.label}</span>
                      </td>
                      {f.celulas.map((c, k) => (
                        <React.Fragment key={k}>
                          <Valor
                            valor={c.valor} cifrao={layout.mostrarCifrao} miudo
                            onClick={c.movimentos.length ? () => onCelula({ linha: f.label, coluna: rotuloColuna(relatorio.colunas[k]), movimentos: c.movimentos }) : undefined}
                          />
                          {mostrarPct && <td className="px-2 py-2 text-right text-caption text-faint tabular-nums">{pct(c.av ?? c.ah)}</td>}
                          {/* O orçamento é por LINHA da cascata, não por categoria:
                              a categoria deixa as três colunas vazias para a
                              tabela não desalinhar. */}
                          {comOrc && <CelulasOrcamento cifrao={layout.mostrarCifrao} />}
                        </React.Fragment>
                      ))}
                      <Valor valor={f.total.valor} cifrao={layout.mostrarCifrao} miudo
                        onClick={f.total.movimentos.length ? () => onCelula({ linha: f.label, coluna: "Total", movimentos: f.total.movimentos }) : undefined} />
                      {mostrarPct && <td className="px-2 py-2 text-right text-caption text-faint tabular-nums">{pct(f.total.av)}</td>}
                      <Valor valor={f.media.valor} cifrao={layout.mostrarCifrao} miudo />
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Orçado · Diferença · % de um período.
 *
 * ⚠️ A cor NÃO pode vir do sinal da diferença: numa linha de despesa, gastar
 * MAIS que o orçado é diferença positiva e é ruim; numa linha de receita é
 * positiva e é boa. Pintar as duas de verde diria ao operador que estourar o
 * orçamento foi um bom resultado. Quem decide é o sinal da LINHA.
 */
function CelulasOrcamento({
  o, cifrao, sinalLinha,
}: { o?: CelulaOrcamento; cifrao?: boolean; sinalLinha?: SinalLinha }) {
  if (!o) {
    return (
      <>
        <td className="px-3 py-[10px] text-right text-caption text-faint">—</td>
        <td className="px-3 py-[10px] text-right text-caption text-faint">—</td>
        <td className="px-2 py-[10px] text-right text-caption text-faint">—</td>
      </>
    );
  }
  return (
    <>
      <td className="px-3 py-[10px] text-right text-caption text-muted tabular-nums">{fmt(o.orcado, !!cifrao)}</td>
      <td className={`px-3 py-[10px] text-right text-caption tabular-nums ${corDaDiferenca(o.diferenca, sinalLinha)}`}>
        {o.diferenca > 0 ? "+" : ""}{fmt(o.diferenca, !!cifrao)}
      </td>
      <td className="px-2 py-[10px] text-right text-caption text-faint tabular-nums">
        {o.pct == null ? "—" : `${o.pct > 0 ? "+" : ""}${pctDeInteiro(o.pct)}`}
      </td>
    </>
  );
}

/** Linha de saída ("-"): acima do orçado é ruim. Linha de entrada/total: o
 *  contrário. Zero é neutro — não variou não é bom nem ruim. */
function corDaDiferenca(dif: number, sinal?: SinalLinha): string {
  if (dif === 0) return "text-faint";
  const custo = sinal === "-";
  const bom = custo ? dif < 0 : dif > 0;
  return bom ? "text-positive" : "text-negative";
}

function Valor({
  valor, cifrao, forte, miudo, onClick,
}: { valor: number; cifrao: boolean; forte?: boolean; miudo?: boolean; onClick?: () => void }) {
  const conteudo = fmt(valor, cifrao);
  return (
    <td className={`px-4 ${miudo ? "py-2" : "py-[10px]"} text-right tabular-nums ${forte ? "font-semibold text-ink" : miudo ? "text-muted" : "text-ink"}`}>
      {onClick ? (
        <button onClick={onClick} className="hover:underline decoration-dotted underline-offset-4" title="Ver as transações">
          {conteudo}
        </button>
      ) : conteudo}
    </td>
  );
}

/* ============================== drill-down ============================== */

/** Gaveta com as transações que formaram a célula clicada. */
export function GavetaTransacoes({
  celula, onFechar,
}: { celula: CelulaClicada; onFechar: () => void }) {
  const { data: input } = useRiscoInput();
  const movs = React.useMemo(() => {
    const set = new Set(celula.movimentos);
    return (input?.movements ?? []).filter((m) => set.has(m.id))
      .sort((a, b) => (b.paid_date || b.due_date || "").localeCompare(a.paid_date || a.due_date || ""));
  }, [input, celula]);

  const total = movs.reduce((s, m) => s + Math.abs(m.amount), 0);

  if (typeof document === "undefined") return null;
  // Portal: o Card do DS tem transform e prenderia o `position: fixed`.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button aria-label="Fechar" onClick={onFechar} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-[560px] h-full bg-white overflow-y-auto flex flex-col">
        <div className="sticky top-0 bg-white border-b border-border-soft px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-h3 font-semibold text-ink truncate">{celula.linha}</div>
            <div className="text-caption text-faint">
              {celula.coluna} · {movs.length} {movs.length === 1 ? "transação" : "transações"} ·{" "}
              <span className="tabular-nums">{fmt(total, true)}</span>
            </div>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-2">
            <Icon name="x" size={18} color="currentColor" />
          </button>
        </div>
        <div className="flex flex-col px-6 py-2">
          {movs.map((m) => (
            <button
              key={m.id}
              onClick={() => m.party_id && window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: m.party_id } }))}
              className="flex items-baseline justify-between gap-3 py-[10px] border-b border-border-soft last:border-0 text-left hover:bg-surface-2/60 -mx-2 px-2 rounded-md"
            >
              <div className="min-w-0">
                <div className="text-label text-ink truncate">
                  {(m.party_id && input?.partyNames?.[m.party_id]) || m.category || "Sem contraparte"}
                </div>
                <div className="text-caption text-faint tabular-nums">
                  {(m.paid_date || m.due_date || "").slice(0, 10).split("-").reverse().join("/")}
                  {m.category && ` · ${m.category}`}
                  {m.status !== "pago" && " · pendente"}
                </div>
              </div>
              <span className={`text-label tabular-nums shrink-0 ${m.type === "entrada" ? "text-positive" : "text-ink"}`}>
                {m.type === "entrada" ? "+" : "−"}{fmt(Math.abs(m.amount), true)}
              </span>
            </button>
          ))}
          {movs.length === 0 && (
            <p className="m-0 py-10 text-center text-label text-muted">Nenhuma transação nesta célula.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ============================== exportações ============================== */

/** Linhas do relatório em forma de planilha — usada pelo XLSX e pelo DOCX. */
export function linhasParaPlanilha(r: Relatorio, layout: LayoutTabela): (string | number)[][] {
  const cab = ["Categoria", ...r.colunas.map(rotuloColuna), "Total", "Média"];
  const linhas: (string | number)[][] = [cab];
  for (const l of r.linhas) {
    linhas.push([`${l.sinal} ${l.label}`, ...l.celulas.map((c) => c.valor), l.total.valor, l.media.valor]);
    if (layout.nivel > 1) {
      const filhos = layout.ocultarZeradas ? l.filhos.filter((f) => f.total.valor !== 0) : l.filhos;
      for (const f of filhos) {
        linhas.push([`    ${f.label}`, ...f.celulas.map((c) => c.valor), f.total.valor, f.media.valor]);
      }
    }
  }
  return linhas;
}

export function BotoesExportar({
  nome, relatorio, layout,
}: { nome: string; relatorio: Relatorio; layout: LayoutTabela }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {/*
        PDF pela impressão do navegador ("Salvar como PDF"): é o gerador de PDF
        que já está na máquina, respeita a fonte e a paginação, e não custa uma
        dependência de renderização no bundle.
      */}
      <Button variant="ghost" onClick={() => window.print()}>
        <Icon name="file-text" size={15} color="currentColor" />
        Exportar PDF
      </Button>
      <Button
        variant="primary"
        onClick={() => baixarXLSX(nome, [{ nome: nome.slice(0, 31), linhas: linhasParaPlanilha(relatorio, layout) }])}
      >
        <Icon name="arrow-down-to-line" size={15} color="currentColor" />
        Exportar XLSX
      </Button>
    </div>
  );
}
