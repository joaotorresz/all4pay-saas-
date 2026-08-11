"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DASHBOARD DE CONTAS A PAGAR — os filtros, os três cards, a distribuição e o
 * calendário.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **A tela não soma nada.** Todo número sai de `montarPainelContasPagar`
 * (`core/contas-pagar`) — regra de teto ZERO da ONDA 10. O componente escolhe
 * o recorte e desenha; a aritmética mora no motor, junto com as convenções de
 * sinal, de liquidação e de data que o resto do sistema já usa.
 *
 * ⚠️ **Os três cards NÃO somam entre si**, e é por isso que não existe um
 * "total geral" acima deles: pago olha a data de pagamento (caixa que saiu), a
 * vencer e vencidas olham a data de vencimento (caixa que vai sair). O gráfico
 * de distribuição existe para dar a PROPORÇÃO sem sugerir a soma.
 */
import * as React from "react";
import {
  ResponsiveContainer, PieChart, Pie, Sector, Tooltip, Cell,
} from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";
import { Card, BRL, Icon, Select, DateField, Skeleton } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { formatBRL, dataBR, pct } from "@/lib/format";
import {
  montarPainelContasPagar, opcoesDeFiltro,
  periodoMes, periodoSemana, periodoPersonalizado, periodoInvalido,
  ROTULO_SITUACAO, TOKEN_SITUACAO,
  type Periodo, type TipoPeriodo, type CardContasPagar, type Situacao,
  type PainelContasPagar,
} from "@/core/contas-pagar";
import { chartAnim } from "@/lib/chart-anim";

/* ========================================================================== */
/* A tela                                                                      */
/* ========================================================================== */

export function DashboardContasPagar() {
  const { data: input, isLoading } = useRiscoInput();

  /**
   * ⚠️ O "hoje" vem do `RiskInput`, nunca de `new Date()` dentro do componente.
   * O motor inteiro é sem relógio de propósito (ONDA 1) — ler a data aqui faria
   * a tela e o motor discordarem sobre o que está vencido no exato minuto da
   * virada do dia, e é o servidor que decide qual é o dia.
   */
  const hoje = input?.hoje?.slice(0, 10) ?? "";

  const [tipo, setTipo] = React.useState<TipoPeriodo>("mes");
  const [custom, setCustom] = React.useState<{ de: string; ate: string }>({ de: "", ate: "" });
  const [projeto, setProjeto] = React.useState("");
  const [centro, setCentro] = React.useState("");

  // Quando o dado chega, o intervalo personalizado nasce no mês corrente — um
  // campo de data vazio abriria o seletor em 1970 na primeira vez.
  React.useEffect(() => {
    if (!hoje || custom.de) return;
    const m = periodoMes(hoje);
    setCustom({ de: m.de, ate: m.ate });
  }, [hoje, custom.de]);

  const periodo: Periodo | null = React.useMemo(() => {
    if (!hoje) return null;
    if (tipo === "mes") return periodoMes(hoje);
    if (tipo === "semana") return periodoSemana(hoje);
    if (!custom.de || !custom.ate) return null;
    return periodoPersonalizado(custom.de, custom.ate);
  }, [tipo, custom, hoje]);

  const invalido = !!periodo && periodoInvalido(periodo);

  const opcoes = React.useMemo(
    () => (input ? opcoesDeFiltro(input) : { projetos: [], centros: [] }),
    [input],
  );

  const painel: PainelContasPagar | null = React.useMemo(() => {
    if (!input || !periodo || invalido) return null;
    return montarPainelContasPagar(input, {
      de: periodo.de, ate: periodo.ate,
      projeto: projeto || null, centro: centro || null,
    });
  }, [input, periodo, invalido, projeto, centro]);

  return (
    <div className="flex flex-col gap-6">
      <Filtros
        tipo={tipo} onTipo={setTipo}
        custom={custom} onCustom={setCustom}
        periodo={periodo} invalido={invalido}
        projeto={projeto} onProjeto={setProjeto}
        centro={centro} onCentro={setCentro}
        opcoes={opcoes}
      />

      {invalido && (
        <Card className="border border-warning/40">
          <p className="m-0 text-body text-ink">
            A data inicial é posterior à final. Corrija o intervalo — nenhum
            período existe entre {dataBR(periodo!.de)} e {dataBR(periodo!.ate)}.
          </p>
        </Card>
      )}

      {isLoading || (!painel && !invalido) ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((k) => <Skeleton key={k} className="h-[136px]" />)}
        </div>
      ) : painel ? (
        <>
          {/* ⚠️ `items-start`: sem isso, abrir a relação de UM card estica os
              outros dois até a mesma altura e a tela ganha dois retângulos
              brancos vazios do tamanho da lista aberta. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <CardExpansivel
              titulo="Total geral pago no período"
              dado={painel.pagoNoPeriodo}
              situacao="pago"
              rotuloData="Pago em"
              info={{
                oQue: "O que já saiu da conta dentro do período escolhido.",
                comoCalcula:
                  "Soma das saídas com situação 'pago' cuja DATA DE PAGAMENTO cai no período. Canceladas ficam de fora.",
              }}
            />
            <CardExpansivel
              titulo="Contas a vencer"
              dado={painel.aVencer}
              situacao="a_vencer"
              rotuloData="Vence em"
              info={{
                oQue: "O que ainda vai sair: títulos em aberto com vencimento no período, de hoje em diante.",
                comoCalcula:
                  "Soma das saídas em aberto com VENCIMENTO dentro do período e maior ou igual a hoje. O que vence hoje conta aqui, não em vencidas.",
              }}
            />
            <CardExpansivel
              titulo="Contas atrasadas"
              dado={painel.atrasadas}
              situacao="atrasado"
              rotuloData="Venceu em"
              info={{
                oQue: "O que já venceu e continua em aberto dentro do período escolhido.",
                comoCalcula:
                  "Soma das saídas em aberto com VENCIMENTO dentro do período e anterior a hoje.",
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 items-start">
            <Distribuicao painel={painel} />
            <Calendario painel={painel} periodo={periodo!} hoje={hoje} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ========================================================================== */
/* Filtros                                                                     */
/* ========================================================================== */

const PERIODOS: { tipo: TipoPeriodo; rotulo: string }[] = [
  { tipo: "mes", rotulo: "Mês" },
  { tipo: "semana", rotulo: "Essa semana" },
  { tipo: "personalizado", rotulo: "Personalizado" },
];

function Filtros({
  tipo, onTipo, custom, onCustom, periodo, invalido,
  projeto, onProjeto, centro, onCentro, opcoes,
}: {
  tipo: TipoPeriodo;
  onTipo: (t: TipoPeriodo) => void;
  custom: { de: string; ate: string };
  onCustom: (c: { de: string; ate: string }) => void;
  periodo: Periodo | null;
  invalido: boolean;
  projeto: string;
  onProjeto: (v: string) => void;
  centro: string;
  onCentro: (v: string) => void;
  opcoes: { projetos: string[]; centros: string[] };
}) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-[6px]">
          <span className="text-h3 text-ink">Período</span>
          <div
            role="group"
            aria-label="Período das contas a pagar"
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
          <DateField
            label="De"
            value={custom.de}
            onChange={(v) => onCustom({ ...custom, de: v })}
            invalid={invalido}
          />
          <DateField
            label="Até"
            value={custom.ate}
            onChange={(v) => onCustom({ ...custom, ate: v })}
            invalid={invalido}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Projeto"
          value={projeto}
          onChange={onProjeto}
          disabled={opcoes.projetos.length === 0}
          options={[
            { value: "", label: opcoes.projetos.length ? "Todos os projetos" : "Nenhum projeto nos títulos" },
            ...opcoes.projetos.map((p) => ({ value: p, label: p })),
          ]}
        />
        <Select
          label="Centro de custo"
          value={centro}
          onChange={onCentro}
          disabled={opcoes.centros.length === 0}
          options={[
            { value: "", label: opcoes.centros.length ? "Todos os centros de custo" : "Nenhum centro nos títulos" },
            ...opcoes.centros.map((c) => ({ value: c, label: c })),
          ]}
        />
      </div>
    </Card>
  );
}

/* ========================================================================== */
/* Os três cards                                                               */
/* ========================================================================== */

function CardExpansivel({
  titulo, dado, situacao, rotuloData, info,
}: {
  titulo: string;
  dado: CardContasPagar;
  situacao: Situacao;
  rotuloData: string;
  info: { oQue: string; comoCalcula: string };
}) {
  const [aberto, setAberto] = React.useState(false);
  const idLista = React.useId();

  return (
    <Card className="flex flex-col gap-3" info={{ titulo, ...info }}>
      <div className="flex items-center gap-2 pr-8">
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-pill shrink-0"
          style={{ background: TOKEN_SITUACAO[situacao] }}
        />
        <span className="text-h3 text-ink">{titulo}</span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="a4p-num text-[28px] leading-none text-ink">
            <BRL value={dado.total} />
          </span>
          <span className="text-caption text-muted">
            {dado.quantidade === 1 ? "1 título" : `${dado.quantidade} títulos`}
          </span>
        </div>

        {/* ⚠️ O botão fica DESABILITADO quando não há o que revelar: uma seta
            que abre um painel vazio ensina que a seta não faz nada. */}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          disabled={dado.quantidade === 0}
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-label={aberto ? `Ocultar a relação de ${titulo}` : `Ver a relação de ${titulo}`}
          className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-surface-2 text-muted hover:text-ink hover:bg-surface-3 transition-colors disabled:opacity-40 disabled:hover:text-muted disabled:hover:bg-surface-2"
        >
          {/* ⚠️ O set não traz `chevron-up`; a seta gira. Inventar um glifo
              novo para isto sairia do conjunto Hugeicons que o DS fixa. */}
          <span className={"transition-transform " + (aberto ? "rotate-180" : "")}>
            <Icon name="chevron-down" size={16} color="currentColor" />
          </span>
        </button>
      </div>

      {aberto && (
        <div
          id={idLista}
          tabIndex={0}
          role="region"
          aria-label={`Relação de ${titulo}`}
          className="flex flex-col max-h-[260px] overflow-y-auto border-t border-border-soft pt-3 -mx-1 px-1"
        >
          {dado.contas.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-3 py-2 border-b border-border-soft last:border-b-0"
            >
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
 * o significado (pago · a vencer · vencido) e usá-la também para "selecionado"
 * faria a mesma dimensão dizer duas coisas.
 */
function SetorAtivo(props: PieSectorDataItem) {
  const { outerRadius = 0, ...resto } = props;
  return (
    <g>
      <Sector {...resto} outerRadius={outerRadius + 8} />
      <Sector
        {...resto}
        outerRadius={outerRadius + 14}
        innerRadius={outerRadius + 10}
      />
    </g>
  );
}

function Distribuicao({ painel }: { painel: PainelContasPagar }) {
  const dados = painel.distribuicao
    // ⚠️ Fatia de valor zero SAI do desenho. O Recharts a renderiza como um
    // traço de espessura nula que o mouse ainda alcança — dá para "selecionar"
    // uma fatia invisível e o centro passa a exibir R$ 0,00 sem que nada tenha
    // acontecido na tela. A legenda continua listando as três, com o zero.
    .filter((d) => d.valor > 0)
    .map((d) => ({
      nome: d.rotulo,
      valor: d.valor,
      quantidade: d.quantidade,
      fracao: d.fracao,
      cor: TOKEN_SITUACAO[d.situacao],
    }));
  const vazio = dados.length === 0;

  // A fatia em foco: a maior por padrão — abrir com nada em foco desperdiça o
  // centro do donut, que é o lugar de maior leitura do desenho.
  const [ativo, setAtivo] = React.useState(0);
  const foco = dados[Math.min(ativo, Math.max(0, dados.length - 1))];

  const resumo = painel.distribuicao
    .map((d) => `${d.rotulo}: ${formatBRL(d.valor)} (${pct(d.fracao)})`)
    .join(" · ");

  return (
    <Card
      className="flex flex-col gap-3"
      info={{
        titulo: "Distribuição por situação",
        oQue: "A proporção entre o que já foi pago, o que ainda vai vencer e o que está vencido no período.",
        comoCalcula:
          "Cada fatia é a parte do total das três situações somadas. É a única leitura em que somá-las faz sentido, porque a pergunta aqui é de proporção — os três cards acima nunca devem ser somados num total.",
      }}
    >
      <span className="text-h3 text-ink pr-8">Distribuição por status</span>

      {vazio ? (
        <p className="m-0 text-body text-muted py-10 text-center">
          Nenhuma conta a pagar no período selecionado.
        </p>
      ) : (
        <>
          <div className="h-[230px]" role="img" aria-label={`Distribuição por status. ${resumo}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dados}
                  dataKey="valor"
                  nameKey="nome"
                  innerRadius="55%"
                  outerRadius="72%"
                  paddingAngle={2}
                  stroke="none"
                  activeIndex={Math.min(ativo, dados.length - 1)}
                  activeShape={SetorAtivo}
                  onMouseEnter={(_, k) => setAtivo(k)}
                  {...chartAnim()}
                >
                  {dados.map((d) => <Cell key={d.nome} fill={d.cor} />)}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => formatBRL(v)}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* O CENTRO responde pela fatia em foco. Um donut com o buraco
                vazio gasta o ponto de maior leitura do desenho, e obriga a
                percorrer a legenda para saber quanto vale o que se está
                olhando. */}
            <div className="relative -mt-[150px] mb-[110px] flex flex-col items-center pointer-events-none">
              <span className="a4p-num text-[19px] leading-none text-ink">
                <BRL value={foco?.valor ?? 0} showDecimals={false} />
              </span>
              <span className="text-caption text-muted mt-1">{foco?.nome}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {painel.distribuicao.map((d) => {
              const k = dados.findIndex((x) => x.nome === d.rotulo);
              const emFoco = k >= 0 && k === Math.min(ativo, dados.length - 1);
              return (
                <button
                  key={d.situacao}
                  type="button"
                  disabled={k < 0}
                  onMouseEnter={() => k >= 0 && setAtivo(k)}
                  onFocus={() => k >= 0 && setAtivo(k)}
                  onClick={() => k >= 0 && setAtivo(k)}
                  className={`flex items-center gap-2 text-caption text-left rounded-md px-2 py-1 -mx-2 transition-colors ${
                    emFoco ? "bg-surface-2" : ""
                  } ${k < 0 ? "opacity-50" : "hover:bg-surface-2"}`}
                >
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-pill shrink-0"
                    style={{ background: TOKEN_SITUACAO[d.situacao] }}
                  />
                  <span className="text-muted flex-1 truncate">
                    {ROTULO_SITUACAO[d.situacao]}
                    <span className="text-faint"> · {d.quantidade}</span>
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
/* Calendário                                                                  */
/* ========================================================================== */

const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Dia da semana 0=domingo, para o rótulo da cápsula. */
function domingoZero(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * O CALENDÁRIO — a MESMA linguagem do "Calendário de transações" da Visão
 * geral: faixa horizontal de cápsulas verticais, o dia escolhido num pill
 * escuro com o número num disco branco, e a agenda daquele dia embaixo.
 *
 * ⚠️ Era uma grade mensal. Duas telas do mesmo produto respondendo "o que cai
 * em cada dia" com desenhos diferentes obrigam quem opera a reaprender a
 * leitura ao trocar de tela — e nenhuma das duas fica sendo "a" forma de
 * mostrar dia no all4pay. A grade também não cabia no recorte: o período aqui
 * pode ser uma semana ou um intervalo qualquer, e uma grade de mês desenha
 * sempre 42 células, esmaecendo o que ficou de fora.
 *
 * A faixa mostra os dias QUE TÊM ALGO, na ordem. Um calendário de contas a
 * pagar cheio de dias vazios gasta a largura com o que não exige ação.
 */
function Calendario({
  painel, periodo, hoje,
}: { painel: PainelContasPagar; periodo: Periodo; hoje: string }) {
  const dias = painel.dias;
  const [sel, setSel] = React.useState<string | null>(null);

  // ⚠️ O estado vazio passou a ser a ausência de TÍTULOS, não de dias: agora a
  // faixa sempre tem dias (o período inteiro), então `dias.length === 0` só
  // aconteceria num intervalo degenerado e deixaria a tela desenhar trinta
  // cápsulas vazias em vez de dizer que não há nada.
  const semTitulos = dias.every((d) => d.quantidade === 0);

  /**
   * O dia escolhido por padrão, em ordem de preferência: HOJE (quando cai no
   * período), depois o primeiro dia que tenha algo, e só então o primeiro dia.
   *
   * ⚠️ Hoje vem primeiro mesmo quando está vazio: quem abre a tela quer saber
   * o que tem HOJE, e "nada vence hoje" é uma resposta — abrir num outro dia
   * porque hoje está vazio esconde justamente essa resposta.
   */
  const selecionado = React.useMemo(() => {
    if (sel && dias.some((d) => d.data === sel)) return sel;
    if (dias.some((d) => d.data === hoje)) return hoje;
    return dias.find((d) => d.quantidade > 0)?.data ?? dias[0]?.data ?? null;
  }, [sel, dias, hoje]);

  const doDia = React.useMemo(() => {
    if (!selecionado) return [];
    const todas = [
      ...painel.pagoNoPeriodo.contas.map((c) => ({ ...c, situacao: "pago" as Situacao })),
      ...painel.aVencer.contas.map((c) => ({ ...c, situacao: "a_vencer" as Situacao })),
      ...painel.atrasadas.contas.map((c) => ({ ...c, situacao: "atrasado" as Situacao })),
    ];
    return todas.filter((c) => c.data === selecionado).sort((a, b) => b.valor - a.valor);
  }, [painel, selecionado]);

  /**
   * ⚠️ A FAIXA ABRE NO DIA SELECIONADO, não no início.
   *
   * Um período de um mês rende trinta cápsulas e só sete cabem; sem rolar, a
   * peça abre em 01 e o dia escolhido — que é o de hoje — fica fora da vista.
   * Pior: como o pill escuro é o ÚNICO sinal de seleção, a faixa parecia não
   * ter dia nenhum selecionado, e a agenda embaixo falava de um dia que não
   * estava na tela.
   *
   * `useLayoutEffect` porque o ajuste precisa acontecer ANTES da pintura: num
   * `useEffect` a faixa aparece no 01 e salta.
   */
  const faixaRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const alvo = faixaRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    alvo?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selecionado, dias.length]);

  return (
    <Card
      className="flex flex-col gap-3"
      info={{
        titulo: "Calendário de contas a pagar",
        oQue: "Em que dia cada obrigação do período cai.",
        comoCalcula:
          "Cada dia soma o que VENCE nele (em aberto) e o que foi PAGO nele. A cor do dia é a situação mais urgente que ele contém — um dia com nove pagas e uma vencida aparece como vencida.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8">
        <span className="text-h3 text-ink">Calendário de contas a pagar</span>
        <span className="text-caption text-faint">{periodo.rotulo}</span>
      </div>

      {semTitulos ? (
        <p className="m-0 py-12 text-center text-body text-muted">
          Nenhuma conta a pagar no período selecionado.
        </p>
      ) : (
        <>
          <div
            ref={faixaRef}
            className="flex items-center gap-1 mt-2 overflow-x-auto a4p-nav-scroll"
            role="tablist" aria-label="Dias com contas a pagar"
            tabIndex={0}
          >
            {dias.map((d, i) => {
              const ativo = d.data === selecionado;
              return (
                <React.Fragment key={d.data}>
                  {i > 0 && <span aria-hidden className="w-px h-8 bg-border-soft shrink-0" />}
                  {/* A MESMA cápsula da Visão geral: 56×86 com o disco a 46px
                      — 82% da largura. A razão disco/cápsula é o que faz a
                      forma; um disco pequeno num campo preto lê como círculo
                      dentro de retângulo. */}
                  <button
                    role="tab" aria-selected={ativo}
                    onClick={() => setSel(d.data)}
                    className={`w-[56px] h-[86px] shrink-0 rounded-pill flex flex-col items-center justify-center gap-[5px] transition-colors ${
                      ativo ? "bg-ink text-white" : "hover:bg-surface-2"
                    } ${!ativo && d.quantidade === 0 ? "opacity-45" : ""}`}
                  >
                    <span className={`w-[46px] h-[46px] rounded-pill inline-flex items-center justify-center shrink-0 relative ${ativo ? "bg-white" : ""}`}>
                      <span className="a4p-dia-num text-ink">{d.data.slice(8, 10)}</span>
                      {/* O marcador da situação fica NA cápsula, não numa
                          célula de grade: é o que sobrou da leitura de cor da
                          versão anterior, e ele continua sendo a única coisa
                          que diz "aqui tem vencido" sem abrir o dia. */}
                      {d.situacao && (
                        <span
                          aria-hidden
                          className="absolute -bottom-[1px] right-[2px] w-[7px] h-[7px] rounded-pill"
                          style={{ background: TOKEN_SITUACAO[d.situacao], outline: "2px solid var(--color-white)" }}
                        />
                      )}
                    </span>
                    {/* ⚠️ HOJE é marcado mesmo sem estar selecionado. Com o
                        período inteiro na faixa, o dia corrente vira mais uma
                        cápsula entre trinta — e é dele que se parte para ler
                        "o que já venceu" e "o que ainda vem". */}
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
                  <Icon name="arrow-down" size={15} color="var(--color-ink)" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-label text-ink truncate">{c.contraparte}</span>
                  <span className="block text-caption text-muted truncate">{c.categoria}</span>
                </span>
                <span className="text-caption text-muted shrink-0">{ROTULO_SITUACAO[c.situacao]}</span>
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

          {painel.diasTruncados && (
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
