"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CHROME DOS PAINÉIS DE TÍTULOS — usado pelos DOIS lados.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Isto foi EXTRAÍDO do painel de contas a pagar, não copiado para o de
 * receber.**
 *
 * Pagar e receber são o mesmo problema espelhado, e as quatro peças abaixo — o
 * filtro de período, o card que abre a relação, o donut de proporção e a faixa
 * de dias — são idênticas nos dois. Duas cópias divergem no primeiro ajuste, e
 * quando isso acontece com um calendário as duas telas passam a responder "o
 * que cai em cada dia" com desenhos diferentes, obrigando quem opera a
 * reaprender a leitura ao trocar de lado. É a mesma decisão já registrada
 * quando `CarrosselSazonalidade` e `ModalBaixa` saíram do extrato.
 *
 * As peças são NEUTRAS de propósito: recebem cor, rótulo e linhas prontas.
 * Nenhuma delas sabe o que é "pago" ou "recebido" — quem sabe é o motor de
 * cada lado, e é lá que a convenção mora.
 */
import * as React from "react";
import {
  ResponsiveContainer, PieChart, Pie, Sector, Tooltip, Cell,
} from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";
import { Card, BRL, Icon, Select, DateField } from "@/components/ui";
import { formatBRL, dataBR, pct } from "@/lib/format";
import { chartAnim } from "@/lib/chart-anim";
import type { Periodo, TipoPeriodo } from "@/core/contas-pagar";

/* ========================================================================== */
/* As formas neutras                                                           */
/* ========================================================================== */

export interface LinhaDeTitulo {
  id: string;
  /** Cliente ou fornecedor — quem está do outro lado. */
  contraparte: string;
  categoria: string;
  valor: number;
  data: string;
  diasAtraso?: number;
}

export interface CardDeTitulos {
  total: number;
  quantidade: number;
  linhas: LinhaDeTitulo[];
}

export interface FatiaDeSituacao {
  chave: string;
  rotulo: string;
  valor: number;
  quantidade: number;
  fracao: number;
  /** Token semântico do DS — nunca um hex. */
  cor: string;
}

export interface DiaDaFaixa {
  data: string;
  quantidade: number;
  /** A cor da situação mais urgente do dia; `null` = dia vazio. */
  cor: string | null;
  ehHoje: boolean;
}

/* ========================================================================== */
/* Filtros de período                                                          */
/* ========================================================================== */

const PERIODOS: { tipo: TipoPeriodo; rotulo: string }[] = [
  { tipo: "mes", rotulo: "Mês" },
  { tipo: "semana", rotulo: "Essa semana" },
  { tipo: "personalizado", rotulo: "Personalizado" },
];

export interface OpcaoDeFiltro {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: string[];
  /** O que o select diz quando não há nada a escolher. */
  vazio: string;
  todos: string;
}

export function FiltrosPeriodo({
  titulo, tipo, onTipo, custom, onCustom, periodo, invalido, filtros,
}: {
  titulo: string;
  tipo: TipoPeriodo;
  onTipo: (t: TipoPeriodo) => void;
  custom: { de: string; ate: string };
  onCustom: (c: { de: string; ate: string }) => void;
  periodo: Periodo | null;
  invalido: boolean;
  filtros: OpcaoDeFiltro[];
}) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-[6px]">
          <span className="text-h3 text-ink">Período</span>
          <div
            role="group"
            aria-label={titulo}
            className="inline-flex items-center gap-1 p-1 rounded-pill bg-surface-2"
          >
            {PERIODOS.map((p) => (
              <button
                key={p.tipo}
                type="button"
                aria-pressed={tipo === p.tipo}
                onClick={() => onTipo(p.tipo)}
                className={
                  "inline-flex items-center h-9 px-4 rounded-pill text-label transition-colors " +
                  (tipo === p.tipo
                    ? "bg-white text-ink font-medium shadow-pill"
                    : "bg-transparent text-muted hover:text-ink")
                }
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>

        {periodo && !invalido && (
          <p className="m-0 text-caption text-muted">
            Mostrando de <span className="text-ink">{dataBR(periodo.de)}</span> a{" "}
            <span className="text-ink">{dataBR(periodo.ate)}</span>
            {tipo !== "personalizado" && <> · {periodo.rotulo}</>}
          </p>
        )}
      </div>

      {/* ⚠️ Os campos de data só aparecem em "Personalizado": mostrá-los sempre
          sugeriria que dá para ajustar o mês pelas pontas, e o clique nas pontas
          seria descartado no próximo render. */}
      {tipo === "personalizado" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[420px]">
          <DateField label="De" value={custom.de}
            onChange={(v) => onCustom({ ...custom, de: v })} invalid={invalido} />
          <DateField label="Até" value={custom.ate}
            onChange={(v) => onCustom({ ...custom, ate: v })} invalid={invalido} />
        </div>
      )}

      <div className={`grid grid-cols-1 gap-4 ${filtros.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {filtros.map((f) => (
          <Select
            key={f.label}
            label={f.label}
            value={f.valor}
            onChange={f.onChange}
            // ⚠️ Desabilita quando não há o que escolher: um filtro que oferece
            // trinta opções e devolve vazio em vinte e oito ensina a pessoa a
            // não confiar no filtro.
            disabled={f.opcoes.length === 0}
            options={[
              { value: "", label: f.opcoes.length ? f.todos : f.vazio },
              ...f.opcoes.map((o) => ({ value: o, label: o })),
            ]}
          />
        ))}
      </div>
    </Card>
  );
}

/* ========================================================================== */
/* O card que abre a relação                                                   */
/* ========================================================================== */

export function CardExpansivel({
  titulo, dado, cor, rotuloData, info, secundario,
}: {
  titulo: string;
  dado: CardDeTitulos;
  cor: string;
  rotuloData: string;
  info: { oQue: string; comoCalcula: string };
  /**
   * ⚠️ **HIERARQUIA POR MÉTRICA ACIONÁVEL — A4P-034.** Os três cards tinham o
   * mesmo peso e "Total geral pago no período" vinha PRIMEIRO, que na ordem de
   * leitura é o destaque. O que já foi pago não pede ação nenhuma; vencidas e a
   * vencer pedem. Com R$1,54 pago e R$38.626,59 vencidos, a tela dava o lugar
   * nobre ao número que não muda nada.
   *
   * `secundario` não esconde: reduz o corpo do valor. Esconder trocaria um
   * defeito de hierarquia por um de ausência.
   */
  secundario?: boolean;
}) {
  const [aberto, setAberto] = React.useState(false);
  const idLista = React.useId();

  return (
    <Card className="flex flex-col gap-3" info={{ titulo, ...info }}>
      <div className="flex items-center gap-2 pr-8">
        <span aria-hidden className="inline-block w-2 h-2 rounded-pill shrink-0"
          style={{ background: cor }} />
        <span className="text-h3 text-ink">{titulo}</span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className={`a4p-num leading-none ${secundario ? "text-[20px] text-muted" : "text-[28px] text-ink"}`}>
            <BRL value={dado.total} />
          </span>
          <span className="text-caption text-muted">
            {dado.quantidade === 1 ? "1 título" : `${dado.quantidade} títulos`}
          </span>
        </div>

        {/* ⚠️ Desabilitado quando não há o que revelar: uma seta que abre um
            painel vazio ensina que a seta não faz nada. */}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          disabled={dado.quantidade === 0}
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-label={aberto ? `Ocultar a relação de ${titulo}` : `Ver a relação de ${titulo}`}
          className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-surface-2 text-muted hover:text-ink hover:bg-surface-3 transition-colors disabled:opacity-40 disabled:hover:text-muted disabled:hover:bg-surface-2"
        >
          {/* O set não traz `chevron-up`; a seta gira. */}
          <span className={"transition-transform " + (aberto ? "rotate-180" : "")}>
            <Icon name="chevron-down" size={16} color="currentColor" />
          </span>
        </button>
      </div>

      {aberto && (
        <div
          id={idLista} tabIndex={0} role="region" aria-label={`Relação de ${titulo}`}
          className="flex flex-col max-h-[260px] overflow-y-auto border-t border-border-soft pt-3 -mx-1 px-1"
        >
          {dado.linhas.map((c) => (
            <div key={c.id}
              className="flex items-start justify-between gap-3 py-2 border-b border-border-soft last:border-b-0">
              <div className="flex flex-col min-w-0">
                <span className="text-label text-ink truncate">{c.contraparte}</span>
                <span className="text-caption text-faint truncate">
                  {c.categoria} · {rotuloData} {dataBR(c.data)}
                  {typeof c.diasAtraso === "number" && c.diasAtraso > 0 && (
                    <> · <span className="text-negative">{c.diasAtraso}d de atraso</span></>
                  )}
                </span>
              </div>
              <span className="a4p-num text-label text-ink shrink-0">
                <BRL value={c.valor} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ========================================================================== */
/* Distribuição por situação (donut ativo)                                     */
/* ========================================================================== */

const tooltipStyle = {
  background: "var(--color-white)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 12,
} as const;

/**
 * O SETOR ATIVO — o padrão "donut active".
 *
 * ⚠️ Ele não é enfeite de hover: com três fatias de cores semânticas, a fatia
 * apontada precisa se declarar sem depender só do tooltip, que some no toque e
 * cobre o próprio gráfico. O setor cresce para fora e ganha um arco fino
 * destacado — dois sinais de forma, nenhum de cor, porque a cor aqui já carrega
 * o significado e usá-la também para "selecionado" faria a mesma dimensão dizer
 * duas coisas.
 */
function SetorAtivo(props: PieSectorDataItem) {
  const { outerRadius = 0, ...resto } = props;
  return (
    <g>
      <Sector {...resto} outerRadius={outerRadius + 8} />
      <Sector {...resto} outerRadius={outerRadius + 14} innerRadius={outerRadius + 10} />
    </g>
  );
}

export function DistribuicaoDonut({
  titulo, fatias, vazioTexto, info,
}: {
  titulo: string;
  fatias: FatiaDeSituacao[];
  vazioTexto: string;
  info: { titulo: string; oQue: string; comoCalcula: string };
}) {
  // ⚠️ Fatia de valor zero SAI do desenho. O Recharts a renderiza como um traço
  // de espessura nula que o mouse ainda alcança — dá para "selecionar" uma
  // fatia invisível e o centro passa a exibir R$ 0,00 sem que nada tenha
  // acontecido. A legenda continua listando todas, com o zero.
  const dados = fatias.filter((d) => d.valor > 0);
  const vazio = dados.length === 0;

  // A fatia em foco: a maior por padrão — abrir com nada em foco desperdiça o
  // centro do donut, que é o lugar de maior leitura do desenho.
  const [ativo, setAtivo] = React.useState(0);
  const foco = dados[Math.min(ativo, Math.max(0, dados.length - 1))];

  const resumo = fatias
    .map((d) => `${d.rotulo}: ${formatBRL(d.valor)} (${pct(d.fracao)})`)
    .join(" · ");

  return (
    <Card className="flex flex-col gap-3" info={info}>
      <span className="text-h3 text-ink pr-8">{titulo}</span>

      {vazio ? (
        <p className="m-0 text-body text-muted py-10 text-center">{vazioTexto}</p>
      ) : (
        <>
          <div className="h-[230px]" role="img" aria-label={`${titulo}. ${resumo}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dados}
                  dataKey="valor"
                  nameKey="rotulo"
                  innerRadius="55%"
                  outerRadius="72%"
                  paddingAngle={2}
                  stroke="none"
                  activeIndex={Math.min(ativo, dados.length - 1)}
                  activeShape={SetorAtivo}
                  onMouseEnter={(_, k) => setAtivo(k)}
                  {...chartAnim()}
                >
                  {dados.map((d) => <Cell key={d.chave} fill={d.cor} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
            {/* O CENTRO responde pela fatia em foco. Um donut com o buraco
                vazio gasta o ponto de maior leitura do desenho. */}
            <div className="relative -mt-[150px] mb-[110px] flex flex-col items-center pointer-events-none">
              <span className="a4p-num text-[19px] leading-none text-ink">
                <BRL value={foco?.valor ?? 0} showDecimals={false} />
              </span>
              <span className="text-caption text-muted mt-1">{foco?.rotulo}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {fatias.map((d) => {
              const k = dados.findIndex((x) => x.chave === d.chave);
              const emFoco = k >= 0 && k === Math.min(ativo, dados.length - 1);
              return (
                <button
                  key={d.chave}
                  type="button"
                  disabled={k < 0}
                  onMouseEnter={() => k >= 0 && setAtivo(k)}
                  onFocus={() => k >= 0 && setAtivo(k)}
                  onClick={() => k >= 0 && setAtivo(k)}
                  className={`flex items-center gap-2 text-caption text-left rounded-md px-2 py-1 -mx-2 transition-colors ${
                    emFoco ? "bg-surface-2" : ""
                  } ${k < 0 ? "opacity-50" : "hover:bg-surface-2"}`}
                >
                  <span aria-hidden className="inline-block w-2 h-2 rounded-pill shrink-0"
                    style={{ background: d.cor }} />
                  <span className="text-muted flex-1 truncate">
                    {d.rotulo}<span className="text-faint"> · {d.quantidade}</span>
                  </span>
                  <span className="a4p-num text-faint tabular-nums">{pct(d.fracao)}</span>
                  <span className="a4p-num text-ink"><BRL value={d.valor} /></span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

/* ========================================================================== */
/* A faixa de dias                                                             */
/* ========================================================================== */

const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Dia da semana 0=domingo, para o rótulo da cápsula. */
function domingoZero(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export interface ItemDoDia extends LinhaDeTitulo {
  /** O rótulo da situação, escrito pelo lado que chamou. */
  situacao: string;
}

/**
 * A FAIXA DE DIAS — a MESMA linguagem do "Calendário de transações" da Visão
 * geral: cápsulas verticais, o dia escolhido num pill escuro com o número num
 * disco branco, e a agenda daquele dia embaixo.
 *
 * ⚠️ A faixa traz TODOS os dias do período, inclusive os vazios (esmaecidos).
 * Um calendário que pula dia deixa de ser calendário e vira lista ordenada por
 * data: 01, 02, 05, 11, 25 lê como sequência contínua, e dois vencimentos
 * "colados" podem estar a duas semanas um do outro.
 */
export function FaixaDeDias({
  titulo, rotuloPeriodo, dias, hoje, vazioTexto, info, itensDoDia, icone, truncado,
}: {
  titulo: string;
  rotuloPeriodo: string;
  dias: DiaDaFaixa[];
  hoje: string;
  vazioTexto: string;
  info: { titulo: string; oQue: string; comoCalcula: string };
  itensDoDia: (data: string) => ItemDoDia[];
  icone: string;
  truncado: boolean;
}) {
  const [sel, setSel] = React.useState<string | null>(null);
  const semTitulos = dias.every((d) => d.quantidade === 0);

  /**
   * O dia escolhido por padrão: HOJE (quando cai no período), depois o primeiro
   * que tenha algo, e só então o primeiro.
   *
   * ⚠️ Hoje vem primeiro mesmo vazio: "nada vence hoje" é uma resposta, e abrir
   * noutro dia porque hoje está vazio esconde justamente essa resposta.
   */
  const selecionado = React.useMemo(() => {
    if (sel && dias.some((d) => d.data === sel)) return sel;
    if (dias.some((d) => d.data === hoje)) return hoje;
    return dias.find((d) => d.quantidade > 0)?.data ?? dias[0]?.data ?? null;
  }, [sel, dias, hoje]);

  const doDia = React.useMemo(
    () => (selecionado ? itensDoDia(selecionado) : []),
    [selecionado, itensDoDia],
  );

  /**
   * ⚠️ A FAIXA ABRE NO DIA SELECIONADO, não no início. Um mês rende trinta
   * cápsulas e só sete cabem; sem rolar, a peça abre em 01 e o dia de hoje fica
   * fora da vista — e como o pill escuro é o único sinal de seleção, a faixa
   * parece não ter dia nenhum selecionado.
   *
   * `useLayoutEffect` porque o ajuste precisa acontecer ANTES da pintura.
   */
  const faixaRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const alvo = faixaRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    alvo?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selecionado, dias.length]);

  return (
    <Card className="flex flex-col gap-3" info={info}>
      <div className="flex items-baseline justify-between gap-3 pr-8">
        <span className="text-h3 text-ink">{titulo}</span>
        <span className="text-caption text-faint">{rotuloPeriodo}</span>
      </div>

      {semTitulos ? (
        <p className="m-0 py-12 text-center text-body text-muted">{vazioTexto}</p>
      ) : (
        <>
          <div
            ref={faixaRef}
            className="flex items-center gap-1 mt-2 overflow-x-auto a4p-nav-scroll"
            role="tablist" aria-label={titulo} tabIndex={0}
          >
            {dias.map((d, i) => {
              const ativo = d.data === selecionado;
              return (
                <React.Fragment key={d.data}>
                  {i > 0 && <span aria-hidden className="w-px h-8 bg-border-soft shrink-0" />}
                  {/* A MESMA cápsula da Visão geral: 56×86 com o disco a 46px. */}
                  <button
                    role="tab" aria-selected={ativo}
                    onClick={() => setSel(d.data)}
                    className={`w-[56px] h-[86px] shrink-0 rounded-pill flex flex-col items-center justify-center gap-[5px] transition-colors ${
                      ativo ? "bg-ink text-white" : "hover:bg-surface-2"
                    } ${!ativo && d.quantidade === 0 ? "opacity-45" : ""}`}
                  >
                    <span className={`w-[46px] h-[46px] rounded-pill inline-flex items-center justify-center shrink-0 relative ${ativo ? "bg-white" : ""}`}>
                      <span className="a4p-dia-num text-ink">{d.data.slice(8, 10)}</span>
                      {d.cor && (
                        <span aria-hidden
                          className="absolute -bottom-[1px] right-[2px] w-[7px] h-[7px] rounded-pill"
                          style={{ background: d.cor, outline: "2px solid var(--color-white)" }} />
                      )}
                    </span>
                    <span className={`text-caption leading-none ${
                      ativo ? "" : d.ehHoje ? "text-ink font-medium" : "text-muted"
                    }`}>
                      {d.ehHoje && !ativo ? "hoje" : DIAS_CURTOS[domingoZero(d.data)]}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {doDia.length === 0 ? (
              <p className="m-0 py-8 text-center text-caption text-muted">Nada neste dia.</p>
            ) : doDia.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-card bg-surface-2 px-4 py-3">
                <span className="w-9 h-9 rounded-pill bg-white inline-flex items-center justify-center shrink-0">
                  <Icon name={icone} size={15} color="var(--color-ink)" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-label text-ink truncate">{c.contraparte}</span>
                  <span className="block text-caption text-muted truncate">{c.categoria}</span>
                </span>
                <span className="text-caption text-muted shrink-0">{c.situacao}</span>
                <span className="text-label a4p-valor-texto tabular-nums text-ink shrink-0">
                  <BRL value={c.valor} showDecimals={false} />
                </span>
              </div>
            ))}
            {doDia.length > 5 && (
              <span className="text-caption text-faint text-center">
                +{doDia.length - 5} neste dia
              </span>
            )}
          </div>

          {truncado && (
            <p className="m-0 text-caption text-warning">
              O calendário mostra os primeiros {dias.length} dias do período.
              Estreite o intervalo para ver o restante.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
