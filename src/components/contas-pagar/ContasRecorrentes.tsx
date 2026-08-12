"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTAS RECORRENTES — quatro cards sobre o que se repete.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Layout pedido: ① 30% · ② 70% na primeira linha; ③ 50% · ④ 50% na segunda.
 *
 * ⚠️ A tela não soma nada. Tudo vem de `core/contas-pagar/recorrentes` — a
 * mesma regra de teto ZERO do resto do produto. O que ela decide é o que
 * MOSTRAR, e a decisão que carrega peso é a do primeiro card: o total do mês e
 * o custo fixo mensal são números diferentes, e exibi-los juntos, lado a lado,
 * convidaria a lê-los como o mesmo número com dois rótulos. Por isso eles se
 * ALTERNAM no mesmo lugar, um de cada vez, com o que cada um mede escrito
 * embaixo.
 */
import * as React from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, PieChart, Pie, Cell,
} from "recharts";
import { Card, BRL, Icon, Skeleton } from "@/components/ui";
import { useRiscoInput, useRegrasRecorrentes } from "@/components/visao-geral/hooks";
import { formatBRL, pct } from "@/lib/format";
import { chartAnim } from "@/lib/chart-anim";
import {
  montarPainelRecorrentes, rotuloMes, deslocarMes,
  ROTULO_ESPECIE, TOKEN_ESPECIE, JANELA_MESES, MESES_MINIMOS,
  type PainelRecorrentes, type Especie,
} from "@/core/contas-pagar/recorrentes";
import {
  projetarRecorrentes, porMes, janelasDoSeletor, fraseDoCusto, fraseDaProporcao,
  type ResumoProjecao, type JanelaId, type Janela,
} from "@/core/contas-pagar/projecao";

const tooltipStyle = {
  background: "var(--color-white)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 12,
} as const;

export function ContasRecorrentes() {
  const { data: input, isLoading } = useRiscoInput();
  const { data: regras } = useRegrasRecorrentes();
  const [passo, setPasso] = React.useState(0);
  /**
   * ⚠️ A JANELA é da TELA, não de um card. Ela alimenta o resumo do custo E o
   * gráfico — dois controles de tempo na mesma tela, um por card, produziriam
   * um card falando de agosto ao lado de um gráfico dos últimos seis meses, com
   * nada explicando por que os números não se encontram.
   */
  const [janelaId, setJanelaId] = React.useState<JanelaId>("ultimos6");

  const mes = React.useMemo(() => {
    if (!input) return "";
    return deslocarMes(input.hoje.slice(0, 7), passo);
  }, [input, passo]);

  const painel: PainelRecorrentes | null = React.useMemo(
    () => (input && mes ? montarPainelRecorrentes(input, mes) : null),
    [input, mes],
  );

  const janelas = React.useMemo(
    () => (input ? janelasDoSeletor(input.hoje) : []),
    [input],
  );
  const janela = janelas.find((j) => j.id === janelaId) ?? janelas[0];

  /**
   * A projeção — só por REGRA (`recurrences`), nunca pelo padrão inferido.
   *
   * ⚠️ Em demonstração não há tabela de regras e o acessor devolve vazio: a
   * projeção sai zerada e a tela DIZ isso, em vez de inventar uma recorrência
   * para preencher o gráfico.
   */
  const projecao: ResumoProjecao | null = React.useMemo(() => {
    if (!input || !janela) return null;
    return projetarRecorrentes({
      regras: regras ?? [], movimentos: input.movements,
      de: janela.de, ate: janela.ate,
    });
  }, [input, regras, janela]);

  if (isLoading || !painel) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-[30%_1fr] gap-4">
          <Skeleton className="h-[260px]" /><Skeleton className="h-[260px]" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[300px]" /><Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ⚠️ 30% / 70% exatos. `minmax(0,…)` na segunda coluna porque um gráfico
          responsivo dentro de grid sem largura mínima zero empurra a coluna e
          desfaz a proporção pedida. */}
      <div className="grid grid-cols-1 lg:grid-cols-[30%_minmax(0,1fr)] gap-4 items-stretch">
        <CardAlternante
          painel={painel} mes={mes} passo={passo} onPasso={setPasso}
          projecao={projecao} janela={janela} hoje={input?.hoje ?? ""}
        />
        <CardVelas
          painel={painel} projecao={projecao} janelas={janelas}
          janelaId={janelaId} onJanela={setJanelaId}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <CardCategorias painel={painel} />
        <CardEspecies painel={painel} />
      </div>
    </div>
  );
}

/* ========================================================================== */
/* ① O card que alterna                                                       */
/* ========================================================================== */

interface Leitura {
  rotulo: string;
  valor: number;
  detalhe: React.ReactNode;
  aproximado: boolean;
  /** Quando preenchido, o VALOR não aparece — nem cinza, nem pequeno. */
  indisponivel?: { motivo: string; comoResolver: string } | null;
}

function CardAlternante({
  painel, mes, passo, onPasso, projecao, janela, hoje,
}: {
  painel: PainelRecorrentes; mes: string; passo: number; onPasso: (n: number) => void;
  projecao: ResumoProjecao | null; janela: Janela | undefined; hoje: string;
}) {
  const [i, setI] = React.useState(0);

  /**
   * ⚠️ **A LEITURA DO INTERVALO vem primeiro, e o tempo verbal dela sai de
   * `fraseDoCusto`** — uma função só, no motor, e nenhum ternário de conjugação
   * na JSX. "Seu custo recorrente FOI de R$ 40 mil" é um fato contábil; "ESTARÁ
   * em R$ 40 mil" é uma expectativa sobre regras que podem ser canceladas
   * amanhã. Lidas rápido, as duas mandam o dono fazer coisas diferentes, e
   * fixar tudo no futuro faria a tela mentir sobre todo mês já fechado.
   */
  const doIntervalo: Leitura | null = projecao && janela ? {
    rotulo: janela.rotulo,
    valor: projecao.total,
    /**
     * ⚠️ **ZERO NÃO É A AUSÊNCIA DE ZERO** (regra da ONDA 4). Sem nenhuma regra
     * de recorrência cadastrada, o total sai R$ 0,00 corretamente — mas "seu
     * custo recorrente será de R$ 0,00" AFIRMA que a empresa não tem conta que
     * se repita, e a verdade é que o sistema não sabe: ninguém cadastrou
     * recorrência nenhuma. As duas leituras mandam o dono fazer coisas
     * opostas — a primeira o deixa tranquilo, a segunda manda ele cadastrar.
     *
     * Um mês em que as regras existem e nada vence continua valendo R$ 0,00,
     * porque aí o zero é resposta.
     */
    indisponivel: projecao.regrasConsideradas === 0 ? {
      motivo: "Nenhuma regra de recorrência alcança este período.",
      comoResolver: "Cadastre a repetição ao lançar uma conta a pagar — é ela que projeta os meses à frente.",
    } : null,
    // A média é sobre os meses do INTERVALO, não sobre os que têm ocorrência:
    // um mês sem conta recorrente é um mês em que não se pagou nada, e tirá-lo
    // do divisor inflaria a média justamente onde ela deve baixar.
    aproximado: projecao.totalProjetado > 0,
    detalhe: (
      <>
        <span className="block">
          {fraseDoCusto(janela.de, janela.ate, hoje)}{" "}
          <strong className="font-medium text-ink">{formatBRL(projecao.total)}</strong>
          {projecao.meses > 0 && <> — média de {formatBRL(projecao.total / projecao.meses)} por mês.</>}
        </span>
        {projecao.totalProjetado > 0 && (
          <span className="block mt-1">
            {pct(projecao.totalProjetado / (projecao.total || 1))}{" "}
            {fraseDaProporcao(janela.de, janela.ate, hoje)}
            {projecao.totalRealizado > 0 && <> — o resto já tem título lançado.</>}.
          </span>
        )}
        <span className="block mt-1 text-faint">
          {/* ⚠️ O card mede SÓ o que tem regra de recorrência cadastrada — não é
              o total de contas a pagar do período. Sem esta linha ele seria
              lido como "meu gasto do semestre", e a diferença para o total real
              apareceria como um erro de cálculo que não existe. */}
          Considera {projecao.regrasConsideradas === 1 ? "1 regra" : `${projecao.regrasConsideradas} regras`} de
          recorrência{projecao.regrasSemPrazo > 0 && <> · {projecao.regrasSemPrazo} sem data de término</>}.
        </span>
        {projecao.regrasComValorDivergente > 0 && (
          <span className="block mt-1">
            {projecao.regrasComValorDivergente === 1
              ? "1 recorrência usa"
              : `${projecao.regrasComValorDivergente} recorrências usam`}{" "}
            a última cobrança conhecida, e não o valor cadastrado.
          </span>
        )}
      </>
    ),
  } : null;

  const leituras: Leitura[] = [
    ...(doIntervalo ? [doIntervalo] : []),
    {
      rotulo: "Total de contas a pagar",
      valor: painel.totalDoMes,
      aproximado: false,
      detalhe: (
        <>
          {painel.quantidadeDoMes === 1 ? "1 título" : `${painel.quantidadeDoMes} títulos`} em{" "}
          {rotuloMes(mes)} — pagos e a pagar.
        </>
      ),
    },
    {
      rotulo: "Seu custo fixo mensal",
      valor: painel.custoFixoMensal,
      // ⚠️ "Aproximadamente" não é modéstia de escrita: o número é a média de
      // compromissos observados, não a soma de contratos assinados. Chamá-lo de
      // exato seria prometer uma precisão que a base não tem — e é sobre
      // números com ar de exatos que se decide sem conferir.
      aproximado: true,
      indisponivel: painel.custoFixoIndisponivel,
      detalhe: painel.custoFixoIndisponivel ? null : (
        <>
          {painel.compromissosFixos === 1 ? "1 compromisso" : `${painel.compromissosFixos} compromissos`} que
          se repetem com valor estável, observados nos últimos {JANELA_MESES} meses.
        </>
      ),
    },
  ];
  const l = leituras[i % leituras.length];

  return (
    <Card
      className="flex flex-col"
      info={{
        titulo: "As duas leituras do mês",
        oQue: "O que vence neste mês, e quanto do gasto se repete todo mês.",
        comoCalcula:
          `Total do mês: soma das contas a pagar do mês, pela data de pagamento quando já pagas e de vencimento quando não. Custo fixo: soma da média mensal dos compromissos que aparecem em pelo menos ${MESES_MINIMOS} dos últimos ${JANELA_MESES} meses COM valor estável. Compra parcelada fica de fora — ela acaba.`,
      }}
    >
      <div className="flex items-center justify-between gap-2 pr-8">
        <span className="text-h3 text-ink">{l.rotulo}</span>
        <div className="flex items-center gap-1 shrink-0">
          <Seta label="Leitura anterior" icone="chevron-left" onClick={() => setI((v) => (v + leituras.length - 1) % leituras.length)} />
          <span className="text-caption text-faint tabular-nums">{(i % leituras.length) + 1}/{leituras.length}</span>
          <Seta label="Próxima leitura" icone="chevron-right" onClick={() => setI((v) => (v + 1) % leituras.length)} />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 flex-1">
        {/* ⚠️ Sem base, o MOTIVO ocupa o LUGAR do número — não um zero cinza,
            não um zero pequeno. Um R$ 0,00 desbotado continua sendo R$ 0,00
            para quem passa o olho, e é essa leitura que vira decisão. */}
        {l.indisponivel ? (
          <>
            <span className="text-[20px] leading-tight text-muted">Sem dados suficientes</span>
            <p className="m-0 text-caption text-muted">{l.indisponivel.motivo}</p>
            <p className="m-0 text-caption text-faint">{l.indisponivel.comoResolver}</p>
          </>
        ) : (
          <>
            {l.aproximado && (
              // ⚠️ Marcador de ESTIMATIVA, discreto: o número não é uma
              // contagem de títulos, é aritmética sobre uma regra.
              <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                <span className="w-[6px] h-[6px] rounded-pill bg-warning" aria-hidden />
                valor estimado
              </span>
            )}
            <span className="a4p-num text-[30px] leading-none text-ink">
              <BRL value={l.valor} />
            </span>
            <p className="m-0 text-caption text-muted">{l.detalhe}</p>
          </>
        )}
      </div>

      {/* O mês navegável — sem isso o card responde só sobre hoje, e a pergunta
          "quanto eu pagava em maio" exigiria outra tela. */}
      <div className="mt-4 pt-3 border-t border-border-soft flex items-center justify-between gap-2">
        <Seta label="Mês anterior" icone="chevron-left" onClick={() => onPasso(passo - 1)} />
        <span className="text-label text-ink tabular-nums">{rotuloMes(mes)}</span>
        <Seta
          label="Próximo mês"
          icone="chevron-right"
          onClick={() => onPasso(passo + 1)}
          desabilitado={passo >= 0}
        />
      </div>
    </Card>
  );
}

function Seta({
  label, icone, onClick, desabilitado,
}: { label: string; icone: string; onClick: () => void; desabilitado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}

/* ========================================================================== */
/* ② As velas                                                                 */
/* ========================================================================== */

/**
 * A VELA — o mesmo desenho do card "Resumo" da Home.
 *
 * ⚠️ Copiada de propósito na FORMA, não no código: o Recharts empilha os
 * segmentos encostados e só arredonda a ponta exposta, então cada segmento
 * desenha a si mesmo encolhido pela metade do respiro. Sem isso as espécies
 * viram uma coluna contínua com dobras de cor, e a leitura passa a ser "uma
 * barra colorida" em vez de "quatro quantidades".
 *
 * O `Math.max` protege o mês magro: um segmento menor que o respiro sairia com
 * altura negativa e o SVG não desenharia nada — um valor pequeno viraria um
 * valor ausente.
 */
const RESPIRO = 6;
function Vela(props: { x?: number; y?: number; width?: number; height?: number; fill?: string }) {
  const { x = 0, y = 0, width = 0, height = 0, fill } = props;
  if (height <= 0) return null;
  const h = Math.max(2, height - RESPIRO);
  return (
    <rect x={x} y={y + RESPIRO / 2} width={width} height={h}
      rx={Math.min(12, width / 2, h / 2)} fill={fill} />
  );
}

const CAMADAS: Especie[] = ["avulsa", "variavel", "parcelada", "fixa"];

function CardVelas({
  painel, projecao, janelas, janelaId, onJanela,
}: {
  painel: PainelRecorrentes;
  projecao: ResumoProjecao | null;
  janelas: Janela[];
  janelaId: JanelaId;
  onJanela: (id: JanelaId) => void;
}) {
  const olhandoParaFrente = janelaId !== "ultimos6";
  const linhas = React.useMemo(() => (projecao ? porMes(projecao) : []), [projecao]);
  const vazioPassado = painel.meses.every((m) => m.total === 0);
  const vazioFuturo = linhas.every((l) => l.total === 0);

  return (
    <Card
      className="flex flex-col"
      info={{
        titulo: olhandoParaFrente ? "O que ainda vai vencer" : "Os últimos meses",
        oQue: olhandoParaFrente
          ? "Quanto as contas recorrentes vão custar em cada mês à frente."
          : "Como o gasto mensal se divide entre o que se repete e o que não se repete.",
        comoCalcula: olhandoParaFrente
          ? "Cada coluna soma as ocorrências das REGRAS de recorrência cadastradas que vencem no mês. Onde já existe título lançado para a regra naquele mês, vale o título (nunca os dois). O resto é projeção: valor da regra, ou a última cobrança conhecida quando ela discorda."
          : "Cada coluna é o total de contas a pagar do mês, dividido pelas quatro espécies. A classificação é do compromisso inteiro (contraparte + categoria), não de um lançamento isolado.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8 flex-wrap">
        <h2 className="m-0 text-h3">Contas a pagar por mês</h2>
        {/* ⚠️ O seletor SUBSTITUI o rótulo fixo "últimos 6 meses". Um texto que
            descreve a janela sem permitir trocá-la obriga quem quer olhar para
            frente a sair da tela — que é exatamente o que faltava aqui. */}
        <div className="inline-flex rounded-pill bg-surface-2 p-[3px]" role="tablist" aria-label="Período">
          {janelas.map((j) => (
            <button
              key={j.id} role="tab" aria-selected={j.id === janelaId}
              onClick={() => onJanela(j.id)}
              className={`rounded-pill px-3 py-[6px] text-caption font-medium transition-colors ${
                j.id === janelaId ? "bg-white text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {j.rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* ⚠️ A troca de janela TROCA A PERGUNTA, e a tela diz isso. O passado
          mostra TODAS as contas a pagar, classificadas por espécie a partir do
          padrão observado; o futuro mostra SÓ o que as regras de recorrência
          projetam. Desenhá-los no mesmo eixo sem avisar faria a coluna de
          setembro parecer uma queda de gasto, quando ela mede outra coisa. */}
      {olhandoParaFrente && (
        <p className="m-0 mt-2 text-caption text-muted">
          À frente só entram as contas com regra de recorrência cadastrada — não é o total de contas a pagar.
        </p>
      )}

      {olhandoParaFrente ? (
        vazioFuturo ? (
          <p className="m-0 text-body text-muted py-14 text-center">
            {projecao && projecao.regrasConsideradas === 0
              ? "Nenhuma regra de recorrência alcança este período."
              : "Nada a vencer neste período."}
          </p>
        ) : (
          <>
            <div className="h-[230px] mt-4" role="img"
              aria-label={`Contas recorrentes por mês. ${linhas.map((l) => `${rotuloMes(l.mes)}: ${formatBRL(l.total)}${l.temProjecao ? " (estimativa)" : ""}`).join(", ")}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={linhas} margin={{ top: 16, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="mes" axisLine={false} tickLine={false} tickMargin={10}
                    tickFormatter={rotuloMes} tick={{ fill: "var(--color-text-secondary)" }} />
                  <Tooltip content={<ProjecaoTooltip />} cursor={{ fill: "var(--color-surface-2)", radius: 12 }} />
                  {/* Realizado sólido; projetado com opacidade reduzida e
                      contorno tracejado — o corte visual acontece no mês em que
                      um vira o outro, sem precisar de uma linha explicando. */}
                  <Bar dataKey="realizado" stackId="mes" maxBarSize={72}
                    fill={TOKEN_ESPECIE.fixa} shape={<Vela />} {...chartAnim(0)} />
                  <Bar dataKey="projetado" stackId="mes" maxBarSize={72}
                    fill={TOKEN_ESPECIE.fixa} shape={<VelaProjetada />} {...chartAnim(90)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <LegendaProjecao />
          </>
        )
      ) : vazioPassado ? (
        <p className="m-0 text-body text-muted py-14 text-center">
          Nenhuma conta a pagar nos últimos {JANELA_MESES} meses.
        </p>
      ) : (
        <>
          <div className="h-[230px] mt-4" role="img"
            aria-label={`Contas a pagar por mês. ${painel.meses.map((m) => `${m.rotulo}: ${formatBRL(m.total)}`).join(", ")}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={painel.meses} margin={{ top: 16, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="rotulo" axisLine={false} tickLine={false} tickMargin={10}
                  tick={{ fill: "var(--color-text-secondary)" }} />
                <Tooltip content={<VelaTooltip />} cursor={{ fill: "var(--color-surface-2)", radius: 12 }} />
                {CAMADAS.map((e, k) => (
                  <Bar key={e} dataKey={e} stackId="mes" maxBarSize={72}
                    fill={TOKEN_ESPECIE[e]} shape={<Vela />} {...chartAnim(k * 90)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legenda especies={[...CAMADAS].reverse()} />
        </>
      )}
    </Card>
  );
}

/**
 * A vela PROJETADA — mesmo desenho, opacidade reduzida e contorno tracejado.
 *
 * ⚠️ Duas marcas e não uma: só a opacidade some em tela fraca e em impressão, e
 * é justamente numa impressão que alguém leva o número para uma reunião. O
 * tracejado sobrevive aos dois.
 */
function VelaProjetada(props: { x?: number; y?: number; width?: number; height?: number; fill?: string }) {
  const { x = 0, y = 0, width = 0, height = 0, fill } = props;
  if (height <= 0) return null;
  const h = Math.max(2, height - RESPIRO);
  const r = Math.min(12, width / 2, h / 2);
  return (
    <g>
      <rect x={x} y={y + RESPIRO / 2} width={width} height={h} rx={r} fill={fill} opacity={0.38} />
      <rect x={x + 0.75} y={y + RESPIRO / 2 + 0.75} width={Math.max(0, width - 1.5)} height={Math.max(0, h - 1.5)}
        rx={r} fill="none" stroke={fill} strokeWidth={1.5} strokeDasharray="4 3" />
    </g>
  );
}

function LegendaProjecao() {
  return (
    <div className="flex flex-wrap items-center gap-4 mt-1 text-caption text-muted">
      <span className="inline-flex items-center gap-[6px]">
        <span className="w-2 h-2 rounded-pill" style={{ background: TOKEN_ESPECIE.fixa }} />
        Realizado
      </span>
      <span className="inline-flex items-center gap-[6px]">
        <span className="w-2 h-2 rounded-pill border border-dashed"
          style={{ background: TOKEN_ESPECIE.fixa, opacity: 0.38, borderColor: TOKEN_ESPECIE.fixa }} />
        Projetado
      </span>
    </div>
  );
}

function ProjecaoTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const de = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  const realizado = de("realizado");
  const projetado = de("projetado");
  return (
    <div className="rounded-card bg-white shadow-popover px-4 py-3 min-w-[210px]">
      <p className="m-0 text-caption text-muted">{label ? rotuloMes(String(label)) : ""}</p>
      <p className="m-0 mt-1 a4p-num text-[17px] text-ink">
        <BRL value={realizado + projetado} />
      </p>
      {realizado > 0 && (
        <p className="m-0 mt-2 text-caption text-muted flex items-center justify-between gap-4">
          <span>Realizado</span><span className="tabular-nums">{formatBRL(realizado)}</span>
        </p>
      )}
      {projetado > 0 && (
        <>
          <p className="m-0 mt-1 text-caption text-muted flex items-center justify-between gap-4">
            <span>Projetado</span><span className="tabular-nums">{formatBRL(projetado)}</span>
          </p>
          {/* ⚠️ O tooltip DIZ que é estimativa. Sem isso o número de novembro
              tem a mesma cara do de julho, e um deles ainda não aconteceu. */}
          <p className="m-0 mt-2 text-caption text-warning">Estimativa a partir das regras de recorrência.</p>
        </>
      )}
    </div>
  );
}

function Legenda({ especies }: { especies: Especie[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 mt-1 text-caption text-muted">
      {especies.map((e) => (
        <span key={e} className="inline-flex items-center gap-[6px]">
          <span className="w-2 h-2 rounded-pill" style={{ background: TOKEN_ESPECIE[e] }} />
          {ROTULO_ESPECIE[e]}
        </span>
      ))}
    </div>
  );
}

function VelaTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const de = (k: Especie) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  const total = CAMADAS.reduce((s, e) => s + de(e), 0);
  return (
    <div className="rounded-card bg-white shadow-popover px-4 py-3 min-w-[210px]">
      <span className="text-label text-ink">{label}</span>
      <div className="mt-2 flex flex-col gap-[6px]">
        {[...CAMADAS].reverse().filter((e) => de(e) > 0).map((e) => (
          <span key={e} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-caption text-muted">
              <span className="w-2 h-2 rounded-pill" style={{ background: TOKEN_ESPECIE[e] }} />
              {ROTULO_ESPECIE[e]}
            </span>
            <span className="a4p-num text-caption text-ink"><BRL value={de(e)} showDecimals={false} /></span>
          </span>
        ))}
        <span className="border-t border-border-soft pt-[6px] flex items-center justify-between gap-4">
          <span className="text-caption text-muted">Total</span>
          <span className="a4p-num text-caption text-ink"><BRL value={total} showDecimals={false} /></span>
        </span>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* ③ Por categoria                                                            */
/* ========================================================================== */

/**
 * ⚠️ A rampa categórica do DS, e não oito hexes: as categorias se distinguem
 * por INTENSIDADE do mesmo matiz, porque a paleta tem um acento só.
 */
const RAMPA = Array.from({ length: 8 }, (_, k) => `var(--a4p-cat-${k + 1})`);
const TETO_FATIAS = 7;

function CardCategorias({ painel }: { painel: PainelRecorrentes }) {
  // ⚠️ As pequenas viram "Outras" — mas o corte é DITO na legenda, com a
  // contagem. Uma pizza com trinta fatias não se lê, e uma que corta em
  // silêncio faz o total da legenda não bater com o do card.
  const fatias = React.useMemo(() => {
    const c = painel.categorias;
    if (c.length <= TETO_FATIAS) return c.map((x) => ({ ...x, resto: 0 }));
    const principais = c.slice(0, TETO_FATIAS - 1);
    const resto = c.slice(TETO_FATIAS - 1);
    return [
      ...principais.map((x) => ({ ...x, resto: 0 })),
      {
        categoria: `Outras ${resto.length} categorias`,
        valor: Math.round(resto.reduce((s, x) => s + x.valor, 0) * 100) / 100,
        quantidade: resto.reduce((s, x) => s + x.quantidade, 0),
        fracao: resto.reduce((s, x) => s + x.fracao, 0),
        resto: resto.length,
      },
    ];
  }, [painel.categorias]);

  return (
    <Card
      className="flex flex-col"
      info={{
        titulo: "O mês por categoria",
        oQue: "Onde o dinheiro do mês está comprometido.",
        comoCalcula: "As contas a pagar do mês agrupadas pela categoria do lançamento. Pagas e a pagar, juntas — a pergunta aqui é de composição, não de situação.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8">
        <h2 className="m-0 text-h3">Contas a pagar por categoria</h2>
        <span className="text-caption text-faint">{rotuloMes(painel.mes)}</span>
      </div>

      {fatias.length === 0 ? (
        <p className="m-0 text-body text-muted py-14 text-center">Nenhuma conta a pagar neste mês.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-[170px_minmax(0,1fr)] gap-4 items-center">
          <div className="h-[170px]" role="img"
            aria-label={`Por categoria. ${fatias.map((f) => `${f.categoria}: ${formatBRL(f.valor)}`).join(", ")}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={fatias} dataKey="valor" nameKey="categoria"
                  innerRadius="56%" outerRadius="90%" stroke="none" {...chartAnim()}>
                  {fatias.map((_, k) => <Cell key={k} fill={RAMPA[k % RAMPA.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-[6px]">
            {fatias.map((f, k) => (
              <div key={f.categoria} className="flex items-center gap-2 text-caption">
                <span aria-hidden className="w-2 h-2 rounded-pill shrink-0" style={{ background: RAMPA[k % RAMPA.length] }} />
                <span className="text-muted flex-1 truncate">{f.categoria}</span>
                <span className="a4p-num text-faint tabular-nums">{pct(f.fracao)}</span>
                <span className="a4p-num text-ink shrink-0"><BRL value={f.valor} showDecimals={false} /></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ========================================================================== */
/* ④ Fixas × parceladas                                                       */
/* ========================================================================== */

function CardEspecies({ painel }: { painel: PainelRecorrentes }) {
  const comValor = painel.especies.filter((e) => e.valor > 0);
  const fixos = painel.grupos.filter((g) => g.especie === "fixa").slice(0, 5);
  const parceladas = painel.grupos.filter((g) => g.especie === "parcelada").slice(0, 5);

  return (
    <Card
      className="flex flex-col"
      info={{
        titulo: "Fixas e parceladas",
        oQue: "Quanto do mês é compromisso que continua e quanto é compra que acaba.",
        comoCalcula:
          `Fixa: aparece em pelo menos ${MESES_MINIMOS} dos últimos ${JANELA_MESES} meses com valor estável. Parcelada: o lançamento diz quantas parcelas a compra tem. Variável: repete, mas o valor oscila. Avulsa: não repete.`,
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8">
        <h2 className="m-0 text-h3">Fixas × parceladas</h2>
        <span className="text-caption text-faint">{rotuloMes(painel.mes)}</span>
      </div>

      {comValor.length === 0 ? (
        <p className="m-0 text-body text-muted py-14 text-center">Nenhuma conta a pagar neste mês.</p>
      ) : (
        <>
          {/* A barra empilhada: a proporção lida de uma vez, sem comparar áreas. */}
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-pill bg-surface-2">
            {comValor.map((e) => (
              <span
                key={e.especie}
                title={`${e.rotulo}: ${formatBRL(e.valor)}`}
                style={{ width: `${e.fracao * 100}%`, background: TOKEN_ESPECIE[e.especie] }}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {painel.especies.map((e) => (
              <div key={e.especie} className="flex items-center gap-2 text-caption">
                <span aria-hidden className="w-2 h-2 rounded-pill shrink-0" style={{ background: TOKEN_ESPECIE[e.especie] }} />
                <span className="text-muted flex-1 truncate">{e.rotulo}</span>
                <span className="a4p-num text-faint tabular-nums">{pct(e.fracao)}</span>
                <span className="a4p-num text-ink shrink-0"><BRL value={e.valor} showDecimals={false} /></span>
              </div>
            ))}
          </div>

          {/* ⚠️ Os compromissos POR NOME. Um percentual de "fixas" sem dizer
              QUAIS são obriga a pessoa a confiar na classificação sem poder
              conferi-la — e é justamente a classificação que este card afirma. */}
          <div className="mt-5 pt-4 border-t border-border-soft grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Lista titulo="Maiores custos fixos" grupos={fixos} sufixo="/mês" />
            <Lista titulo="Compras parceladas" grupos={parceladas} restantes />
          </div>
        </>
      )}
    </Card>
  );
}

function Lista({
  titulo, grupos, sufixo, restantes,
}: {
  titulo: string;
  grupos: PainelRecorrentes["grupos"];
  sufixo?: string;
  restantes?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-h3 text-ink">{titulo}</span>
      {grupos.length === 0 ? (
        <span className="text-caption text-faint">Nenhuma.</span>
      ) : grupos.map((g) => (
        <div key={g.chave} className="flex items-start justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <span className="text-caption text-ink truncate">{g.contraparte}</span>
            <span className="text-caption text-faint truncate">
              {g.categoria}
              {restantes && g.parcelasRestantes !== null && (
                <> · faltam {g.parcelasRestantes}</>
              )}
            </span>
          </div>
          <span className="a4p-num text-caption text-ink shrink-0">
            <BRL value={g.mediaMensal} showDecimals={false} />{sufixo}
          </span>
        </div>
      ))}
    </div>
  );
}
