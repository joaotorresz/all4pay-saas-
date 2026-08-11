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
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { formatBRL, pct } from "@/lib/format";
import { chartAnim } from "@/lib/chart-anim";
import {
  montarPainelRecorrentes, rotuloMes, deslocarMes,
  ROTULO_ESPECIE, TOKEN_ESPECIE, JANELA_MESES, MESES_MINIMOS,
  type PainelRecorrentes, type Especie,
} from "@/core/contas-pagar/recorrentes";

const tooltipStyle = {
  background: "var(--color-white)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 12,
} as const;

export function ContasRecorrentes() {
  const { data: input, isLoading } = useRiscoInput();
  const [passo, setPasso] = React.useState(0);

  const mes = React.useMemo(() => {
    if (!input) return "";
    return deslocarMes(input.hoje.slice(0, 7), passo);
  }, [input, passo]);

  const painel: PainelRecorrentes | null = React.useMemo(
    () => (input && mes ? montarPainelRecorrentes(input, mes) : null),
    [input, mes],
  );

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
        <CardAlternante painel={painel} mes={mes} passo={passo} onPasso={setPasso} />
        <CardVelas painel={painel} />
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
  painel, mes, passo, onPasso,
}: { painel: PainelRecorrentes; mes: string; passo: number; onPasso: (n: number) => void }) {
  const [i, setI] = React.useState(0);

  const leituras: Leitura[] = [
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
        <span className="a4p-label text-faint">{l.rotulo}</span>
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
            {l.aproximado && <span className="text-caption text-muted">está em aproximadamente</span>}
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

function CardVelas({ painel }: { painel: PainelRecorrentes }) {
  const vazio = painel.meses.every((m) => m.total === 0);
  return (
    <Card
      className="flex flex-col"
      info={{
        titulo: "Os últimos meses",
        oQue: "Como o gasto mensal se divide entre o que se repete e o que não se repete.",
        comoCalcula:
          "Cada coluna é o total de contas a pagar do mês, dividido pelas quatro espécies. A classificação é do compromisso inteiro (contraparte + categoria), não de um lançamento isolado.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8">
        <h2 className="m-0 text-h3">Contas a pagar por mês</h2>
        <span className="text-caption text-faint">últimos {JANELA_MESES} meses</span>
      </div>

      {vazio ? (
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
      <span className="a4p-label text-muted">{label}</span>
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
      <span className="a4p-label text-faint">{titulo}</span>
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
