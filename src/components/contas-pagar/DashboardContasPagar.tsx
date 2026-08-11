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
  ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, Tooltip, Cell,
} from "recharts";
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
          <span className="a4p-label text-faint">Período</span>
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
        <span className="a4p-label text-faint">{titulo}</span>
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
/* Distribuição por situação (radial)                                          */
/* ========================================================================== */

const tooltipStyle = {
  background: "var(--color-white)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 12,
} as const;

function Distribuicao({ painel }: { painel: PainelContasPagar }) {
  // O RadialBarChart empilha de fora para dentro; a ordem aqui é a ordem dos
  // anéis, do mais externo ao mais interno.
  const dados = painel.distribuicao.map((d) => ({
    nome: d.rotulo,
    valor: d.valor,
    quantidade: d.quantidade,
    // ⚠️ O anel é desenhado sobre a FRAÇÃO (0–100), não sobre o valor: num eixo
    // absoluto o anel maior encostaria na borda e os outros dois ficariam
    // indistinguíveis entre si.
    fracao: Math.round(d.fracao * 1000) / 10,
    cor: TOKEN_SITUACAO[d.situacao],
  }));
  const vazio = painel.distribuicao.every((d) => d.valor === 0);

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
          "Cada anel é a fatia do total das três situações somadas. É a única leitura em que somá-las faz sentido, porque a pergunta aqui é de proporção — os três cards acima nunca devem ser somados num total.",
      }}
    >
      <h2 className="m-0 text-h3 pr-8">Distribuição por status</h2>

      {vazio ? (
        <p className="m-0 text-body text-muted py-10 text-center">
          Nenhuma conta a pagar no período selecionado.
        </p>
      ) : (
        <>
          <div className="h-[220px]" role="img" aria-label={`Distribuição por status. ${resumo}`}>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={dados}
                innerRadius="34%"
                outerRadius="96%"
                startAngle={90}
                endAngle={-270}
                barCategoryGap={6}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
                <RadialBar dataKey="fracao" background cornerRadius={999} {...chartAnim()}>
                  {dados.map((d) => <Cell key={d.nome} fill={d.cor} />)}
                </RadialBar>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(_v: number, _n: string, item: { payload?: { valor: number } }) =>
                    formatBRL(item?.payload?.valor ?? 0)
                  }
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col gap-2">
            {painel.distribuicao.map((d) => (
              <div key={d.situacao} className="flex items-center gap-2 text-caption">
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
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/* ========================================================================== */
/* Calendário                                                                  */
/* ========================================================================== */

const DIAS_DA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** Soma dias a uma data-só, sempre em UTC (nunca `new Date("YYYY-MM-DD")` local). */
function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Dia da semana com SEGUNDA em 0 — a mesma origem de `periodoSemana`. */
function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

function Calendario({
  painel, periodo, hoje,
}: { painel: PainelContasPagar; periodo: Periodo; hoje: string }) {
  const porDia = React.useMemo(
    () => new Map(painel.dias.map((d) => [d.data, d])),
    [painel.dias],
  );

  /**
   * ⚠️ A grade começa na SEGUNDA da semana do primeiro dia e termina no DOMINGO
   * da semana do último — mesmo que o período seja um intervalo qualquer. Um
   * calendário que começa no meio de uma linha faz a coluna "quarta" mudar de
   * lugar entre um período e outro, e ninguém consegue ler o dia da semana.
   * O que está FORA do período fica esmaecido, não escondido: sumir com ele
   * criaria buracos na grade.
   */
  const celulas = React.useMemo(() => {
    const inicio = somarDias(periodo.de, -diaDaSemana(periodo.de));
    const fim = somarDias(periodo.ate, 6 - diaDaSemana(periodo.ate));
    const out: string[] = [];
    // Teto de 6 semanas de segurança: um intervalo personalizado de dois anos
    // renderizaria 730 células e travaria a tela.
    for (let d = inicio; d <= fim && out.length < 42; d = somarDias(d, 1)) out.push(d);
    const ultimo = out[out.length - 1];
    return { dias: out, truncado: !!ultimo && ultimo < fim };
  }, [periodo]);

  return (
    <Card
      className="flex flex-col gap-3"
      info={{
        titulo: "Calendário de contas a pagar",
        oQue: "Onde cada obrigação cai no calendário do período selecionado.",
        comoCalcula:
          "Cada dia mostra o total de títulos em aberto que VENCEM nele e o total PAGO nele. A cor do dia é a situação mais urgente que ele contém — um dia com nove pagas e uma vencida aparece como vencida.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8">
        <h2 className="m-0 text-h3">Calendário de contas a pagar</h2>
        <span className="text-caption text-faint">{periodo.rotulo}</span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS_DA_SEMANA.map((d) => (
          <div key={d} className="a4p-label text-faint text-center py-1">{d}</div>
        ))}

        {celulas.dias.map((data) => {
          const dentro = data >= periodo.de && data <= periodo.ate;
          const dia = porDia.get(data);
          const ehHoje = data === hoje;
          const total = (dia?.aPagar ?? 0) + (dia?.pago ?? 0);
          return (
            <div
              key={data}
              className={
                "min-h-[68px] rounded-md p-[6px] flex flex-col gap-1 transition-colors " +
                (dentro ? "bg-surface-2" : "bg-transparent opacity-40")
              }
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={
                    "a4p-num text-caption " +
                    (ehHoje ? "text-ink font-semibold" : "text-muted")
                  }
                >
                  {data.slice(8, 10)}
                </span>
                {dia?.situacao && (
                  <span
                    aria-hidden
                    className="inline-block w-[6px] h-[6px] rounded-pill shrink-0"
                    style={{ background: TOKEN_SITUACAO[dia.situacao] }}
                  />
                )}
              </div>
              {dia && total > 0 && (
                <span
                  className="a4p-num text-[11px] leading-tight text-ink"
                  title={`${dia.quantidade} título(s) · a pagar ${formatBRL(dia.aPagar)} · pago ${formatBRL(dia.pago)}`}
                >
                  <BRL value={total} showDecimals={false} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {celulas.truncado && (
        <p className="m-0 text-caption text-warning">
          O calendário mostra as primeiras seis semanas do período. Estreite o
          intervalo para ver o restante.
        </p>
      )}
    </Card>
  );
}
