"use client";

/**
 * Cards comparativos do Fluxo de Caixa — Resultado líquido · Gastos · Receitas
 * — e o Sankey "Para onde foi", no modelo da referência enviada.
 *
 * Todos compartilham a MESMA anatomia (`CardComparativo`): micro-label +
 * "Ver mais ↗" · a janela em datas · o valor-herói · a pílula de variação
 * ("vs <valor> em <janela anterior>") · o gráfico, sempre com a **linha
 * tracejada do período anterior** por cima das barras.
 *
 * Cor: barras e stacks saem dos TOKENS de status do DS (positivo/negativo), em
 * tons do MESMO matiz — o DS tem um acento só, então categorias se distinguem
 * por intensidade + legenda, não por matizes avulsos.
 */
import * as React from "react";
import Link from "next/link";
import {
  ResponsiveContainer, ComposedChart, Bar, Cell, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Sankey, Layer, Rectangle,
} from "recharts";
import { Card, Icon, BRL, Skeleton } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { chartAnim } from "@/lib/chart-anim";
import { rotuloData, type SerieComparada, type ComparativoFluxo, type SankeyDados, type SankeyLigacao } from "@/core/cashflow/comparativo";
import { pctDeInteiro } from "@/lib/format";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const GRID = "var(--color-border-soft)";
const FAINT = "var(--color-text-tertiary)";
const PREV = "#9aa0a6"; // cinza da linha tracejada de comparação (neutro, dos dois lados)

/** Tons do MESMO matiz para as categorias (o DS não tem paleta categórica). */
const TONS = [100, 76, 56, 40, 28, 19, 13, 9];
const tomDe = (cor: string, i: number) =>
  `color-mix(in srgb, ${cor} ${TONS[Math.min(i, TONS.length - 1)]}%, transparent)`;

/** Eixo Y curto: R$ 6.000 · R$ 40k — sem estourar a largura do card. */
function tickBRL(v: number): string {
  const abs = Math.abs(v);
  const s = abs >= 1000 ? `${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: abs >= 10000 ? 0 : 1 })}k` : String(abs);
  return `${v < 0 ? "−" : ""}R$ ${s}`;
}

/* ============================ pílula de variação ============================ */
/** Segue o SINAL da variação (como a referência): sobe verde, desce vermelho. */
function PilulaVariacao({ s }: { s: SerieComparada }) {
  if (s.variacao === null) {
    return (
      <span className="text-[13px] text-faint">
        sem período anterior para comparar
      </span>
    );
  }
  const sobe = s.variacao >= 0;
  const cor = sobe ? POSITIVE : NEGATIVE;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-[13px] font-semibold tabular-nums"
        style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}
      >
        <span className="inline-flex" style={sobe ? undefined : { transform: "scaleY(-1)" }}>
          <Icon name="trending-up" size={13} color="currentColor" />
        </span>
        {sobe ? "+" : "−"}{pctDeInteiro(Math.abs(s.variacao * 100))}
      </span>
      <span className="text-[13px] text-faint">
        vs {s.totalAnterior < 0 ? "−" : ""}{formatBRL(Math.abs(s.totalAnterior))}
      </span>
    </div>
  );
}

/* ============================ casca do card ============================ */
function CardComparativo({
  titulo, href, janela, valor, corValor, serie, info, children,
}: {
  titulo: string;
  href: string;
  janela: { de: string; ate: string };
  valor: number;
  corValor?: string;
  serie: SerieComparada;
  info: { oQue: string; comoCalcula: string };
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3" info={{ titulo, ...info }}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium uppercase tracking-[0.06em] text-faint">{titulo}</span>
        <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink shrink-0">
          Ver mais ↗
        </Link>
      </div>

      <span className="text-[13px] text-muted">
        {rotuloData(janela.de)} – {rotuloData(janela.ate)}
      </span>

      <span className="a4p-heroi text-[32px] font-bold leading-none tabular-nums" style={{ color: corValor ?? "var(--color-ink)" }}>
        {valor < 0 ? "−" : ""}<BRL value={Math.abs(valor)} />
      </span>

      <PilulaVariacao s={serie} />
      <div className="mt-1">{children}</div>
    </Card>
  );
}

/* ============================ tooltip comum ============================ */
interface TipItem { nome: string; valor: number; cor: string }
function TooltipBox({ titulo, itens }: { titulo: string; itens: TipItem[] }) {
  return (
    <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption min-w-[180px]">
      <div className="font-medium text-ink mb-[6px]">{titulo}</div>
      {itens.map((i) => (
        <div key={i.nome} className="flex items-center justify-between gap-4 tabular-nums">
          <span className="inline-flex items-center gap-[6px] text-muted truncate">
            <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: i.cor }} />
            {i.nome}
          </span>
          <span className="text-ink shrink-0">{i.valor < 0 ? "−" : ""}{formatBRL(Math.abs(i.valor))}</span>
        </div>
      ))}
    </div>
  );
}

/* ======================== 1) Resultado líquido ======================== */
export function ResultadoLiquidoCard({ c }: { c: ComparativoFluxo }) {
  const s = c.resultado;
  return (
    <CardComparativo
      titulo="Resultado líquido"
      href="/dre"
      janela={c.janela}
      valor={s.total}
      corValor={s.total < 0 ? NEGATIVE : "var(--color-ink)"}
      serie={s}
      info={{
        oQue: "O que sobrou (ou faltou) no período: tudo que entrou menos tudo que saiu, comparado com o período anterior de mesmo tamanho.",
        comoCalcula: "Soma entradas − saídas de cada mês da janela. A linha tracejada é o mesmo cálculo na janela imediatamente anterior; a variação compara os dois totais.",
      }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={s.pontos} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: FAINT }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: FAINT }} tickLine={false} axisLine={false} width={72} tickFormatter={tickBRL} />
          <ReferenceLine y={0} stroke="var(--color-ink)" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: "rgba(127,127,127,0.08)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof s.pontos)[number];
              return <TooltipBox titulo={String(label)} itens={[
                { nome: "Resultado", valor: p.valor, cor: p.valor < 0 ? NEGATIVE : POSITIVE },
                { nome: "Período anterior", valor: p.anterior, cor: PREV },
              ]} />;
            }}
          />
          <Bar dataKey="valor" radius={[6, 6, 6, 6]} maxBarSize={54} {...chartAnim()}>
            {s.pontos.map((p) => <Cell key={p.key} fill={p.valor < 0 ? NEGATIVE : POSITIVE} />)}
          </Bar>
          <Line
            type="monotone" dataKey="anterior" stroke={PREV} strokeWidth={1.4}
            strokeDasharray="6 5" dot={false} activeDot={{ r: 4 }} connectNulls {...chartAnim(160)}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </CardComparativo>
  );
}

/* ============================== 2) Gastos ============================== */
export function GastosCard({ c }: { c: ComparativoFluxo }) {
  const s = c.gastos;
  // Até 5 categorias empilhadas; o resto vira "Outras" (senão a legenda estoura).
  const cats = c.categorias.slice(0, 5);
  const temOutras = c.categorias.length > cats.length;
  const dados = React.useMemo(
    () => s.pontos.map((p) => {
      const linha: Record<string, string | number> = { label: p.label, anterior: p.anterior, total: p.valor };
      let somaCats = 0;
      for (const cat of cats) { const v = p.porCategoria[cat] ?? 0; linha[cat] = v; somaCats += v; }
      if (temOutras) linha["Outras"] = Math.max(0, p.valor - somaCats);
      return linha;
    }),
    [s.pontos, cats, temOutras],
  );
  const pilha = temOutras ? [...cats, "Outras"] : cats;

  return (
    <CardComparativo
      titulo="Gastos"
      href="/pagamentos"
      janela={c.janela}
      valor={s.total}
      serie={s}
      info={{
        oQue: "Tudo que saiu no período, quebrado pelas categorias que mais pesam, contra o período anterior.",
        comoCalcula: "Soma as saídas de cada mês e empilha por categoria do lançamento (as 5 maiores; o resto vira “Outras”). A linha tracejada é o total de saídas da janela anterior.",
      }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: FAINT }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: FAINT }} tickLine={false} axisLine={false} width={68} tickFormatter={tickBRL} />
          <Tooltip
            cursor={{ fill: "rgba(127,127,127,0.08)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Record<string, number>;
              return <TooltipBox titulo={String(label)} itens={[
                ...pilha.map((cat, i) => ({ nome: cat, valor: Number(p[cat] ?? 0), cor: tomDe(NEGATIVE, i) })),
                { nome: "Período anterior", valor: Number(p.anterior ?? 0), cor: PREV },
              ]} />;
            }}
          />
          {pilha.map((cat, i) => (
            <Bar
              key={cat} dataKey={cat} stackId="g" fill={tomDe(NEGATIVE, i)} maxBarSize={54}
              radius={i === pilha.length - 1 ? [6, 6, 0, 0] : undefined}
              {...chartAnim(i * 60)}
            />
          ))}
          <Line
            type="monotone" dataKey="anterior" stroke={PREV} strokeWidth={1.4}
            strokeDasharray="6 5" dot={false} activeDot={{ r: 4 }} connectNulls {...chartAnim(200)}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2">
        {pilha.map((cat, i) => (
          <span key={cat} className="inline-flex items-center gap-[6px] text-[13px] text-muted">
            <span className="w-[9px] h-[9px] rounded-sm" style={{ background: tomDe(NEGATIVE, i) }} />
            {cat}
          </span>
        ))}
      </div>
    </CardComparativo>
  );
}

/* ============================= 3) Receitas ============================= */
export function ReceitasCard({ c }: { c: ComparativoFluxo }) {
  const s = c.receitas;
  return (
    <CardComparativo
      titulo="Receitas"
      href="/recebimentos"
      janela={c.janela}
      valor={s.total}
      corValor={POSITIVE}
      serie={s}
      info={{
        oQue: "Tudo que entrou no período, mês a mês, contra o período anterior de mesmo tamanho.",
        comoCalcula: "Soma as entradas de cada mês da janela. A linha tracejada repete o cálculo na janela anterior; a variação compara os totais.",
      }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={s.pontos} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: FAINT }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: FAINT }} tickLine={false} axisLine={false} width={72} tickFormatter={tickBRL} />
          <Tooltip
            cursor={{ fill: "rgba(127,127,127,0.08)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof s.pontos)[number];
              return <TooltipBox titulo={String(label)} itens={[
                { nome: "Receitas", valor: p.valor, cor: POSITIVE },
                { nome: "Período anterior", valor: p.anterior, cor: PREV },
              ]} />;
            }}
          />
          <Bar dataKey="valor" fill={POSITIVE} radius={[6, 6, 0, 0]} maxBarSize={54} {...chartAnim()} />
          <Line
            type="monotone" dataKey="anterior" stroke={PREV} strokeWidth={1.4}
            strokeDasharray="6 5" dot={false} activeDot={{ r: 4 }} connectNulls {...chartAnim(160)}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </CardComparativo>
  );
}

/* ========================= 4) Sankey "Para onde foi" ========================= */
/**
 * Cor de CADA nó — e, por tabela, do rastro que sai dele:
 *   · Receita        → verde (é entrada)
 *   · Despesas       → vermelho
 *   · categorias     → tons do vermelho, um por categoria
 *   · contrapartes   → HERDAM o tom da categoria que mais lhes manda dinheiro,
 *                      então a subárvore inteira fica na mesma família de cor.
 */
function coresDosNos(s: SankeyDados): string[] {
  const cores: string[] = new Array(s.nodes.length).fill(NEGATIVE);
  let iCat = 0;
  s.nodes.forEach((n, i) => {
    if (n.nivel === 0) cores[i] = POSITIVE;
    else if (n.nivel === 1) cores[i] = NEGATIVE;
    else if (n.nivel === 2) cores[i] = tomDe(NEGATIVE, iCat++);
  });
  // Folhas: herdam a cor do maior pai (a contraparte pode receber de várias).
  const maiorPai = new Map<number, { valor: number; source: number }>();
  for (const l of s.links) {
    if (s.nodes[l.target]?.nivel !== 3) continue;
    const atual = maiorPai.get(l.target);
    if (!atual || l.value > atual.valor) maiorPai.set(l.target, { valor: l.value, source: l.source });
  }
  for (const [alvo, { source }] of Array.from(maiorPai.entries())) cores[alvo] = cores[source];
  return cores;
}

/**
 * Nó com rótulo + valor ao lado, como na referência: os dois primeiros níveis
 * (Receita/Despesas) rotulam à DIREITA e os demais à esquerda. O lado sai do
 * `nivel` do próprio dado — `containerWidth` não é confiável aqui (o Recharts
 * nem sempre o passa, e o rótulo do primeiro nó saía cortado fora do card).
 */
function SankeyNode(props: {
  x?: number; y?: number; width?: number; height?: number; index?: number;
  payload?: { name?: string; value?: number; nivel?: number };
  cores?: string[];
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload, index = 0, cores = [] } = props;
  const nome = payload?.name ?? "";
  const valor = payload?.value ?? 0;
  const aDireita = (payload?.nivel ?? 0) >= 2;
  const tx = aDireita ? x - 8 : x + width + 8;
  const anchor = aDireita ? "end" : "start";
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={cores[index] ?? NEGATIVE} radius={[3, 3, 3, 3]} />
      {height > 12 && (
        <>
          <text x={tx} y={y + height / 2 - 5} textAnchor={anchor} fontSize={12} fill="var(--color-ink)" fontWeight={500}>{nome}</text>
          <text x={tx} y={y + height / 2 + 10} textAnchor={anchor} fontSize={11} fill={FAINT} className="tabular-nums">{formatBRL(valor)}</text>
        </>
      )}
    </Layer>
  );
}

/**
 * Faixa em GRADIENTE da cor do nó de origem para a do nó de destino — o rastro
 * "segue a cor referente". No primeiro elo isso desenha a leitura toda: o verde
 * da receita virando o vermelho da despesa ao longo do caminho.
 */
function SankeyLink(props: {
  sourceX?: number; targetX?: number; sourceY?: number; targetY?: number;
  sourceControlX?: number; targetControlX?: number; linkWidth?: number; index?: number;
  cores?: string[]; ligacoes?: SankeyLigacao[];
}) {
  const {
    sourceX = 0, targetX = 0, sourceY = 0, targetY = 0,
    sourceControlX = 0, targetControlX = 0, linkWidth = 0, index = 0,
    cores = [], ligacoes = [],
  } = props;
  // Os índices vêm da NOSSA lista de ligações, pela posição: o `payload` que o
  // Recharts entrega aqui não traz o índice dos nós (source/target chegam já
  // resolvidos em objetos), e ler dele pintava todo rastro da cor do nó 0.
  const l = ligacoes[index];
  const corDe = cores[l?.source ?? 0] ?? NEGATIVE;
  const corPara = cores[l?.target ?? 0] ?? NEGATIVE;
  const gid = `a4pSankey${index}`;
  return (
    <Layer>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={sourceX} y1={0} x2={targetX} y2={0}>
          <stop offset="0%" stopColor={corDe} />
          <stop offset="100%" stopColor={corPara} />
        </linearGradient>
      </defs>
      <path
        d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth={Math.max(1, linkWidth)}
        strokeOpacity={0.34}
      />
    </Layer>
  );
}

export function ParaOndeFoiCard({ s, total }: { s: SankeyDados; total: number }) {
  if (!s.nodes.length) {
    return (
      <Card className="flex flex-col gap-3" info={{
        titulo: "Para onde foi",
        oQue: "O caminho do dinheiro no período: da receita às despesas, e delas às categorias e contrapartes.",
        comoCalcula: "Cada fluxo é a soma das saídas do período; a largura da faixa é o valor. Abre até 8 categorias e, dentro de cada uma, as 4 maiores contrapartes.",
      }}>
        <span className="text-[13px] font-medium uppercase tracking-[0.06em] text-faint">Para onde foi</span>
        <span className="text-caption text-faint">Sem saídas no período selecionado.</span>
      </Card>
    );
  }
  // A altura acompanha o número de nós — senão as faixas finas viram fio de cabelo.
  const altura = Math.max(320, Math.min(760, s.nodes.length * 46));
  const cores = coresDosNos(s);
  return (
    <Card className="flex flex-col gap-3" info={{
      titulo: "Para onde foi",
      oQue: "O caminho do dinheiro no período: da receita às despesas, e delas às categorias e contrapartes.",
      comoCalcula: "Cada fluxo é a soma das saídas do período; a largura da faixa é o valor. Abre até 8 categorias e, dentro de cada uma, as 4 maiores contrapartes.",
    }}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium uppercase tracking-[0.06em] text-faint">Para onde foi</span>
        <span className="text-[13px] text-muted tabular-nums">{formatBRL(total)}</span>
      </div>
      <ResponsiveContainer width="100%" height={altura}>
        <Sankey
          data={{ nodes: s.nodes.map((n) => ({ name: n.name, nivel: n.nivel })), links: s.links }}
          node={<SankeyNode cores={cores} />}
          nodePadding={22}
          nodeWidth={10}
          margin={{ top: 12, right: 170, bottom: 12, left: 24 }}
          link={<SankeyLink cores={cores} ligacoes={s.links} />}
        >
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { name?: string; value?: number; payload?: { value?: number } };
              const valor = p.value ?? p.payload?.value ?? 0;
              const nome = p.name ?? "Fluxo";
              return (
                <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption min-w-[180px]">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-ink">{nome}</span>
                    <span className="text-ink tabular-nums">{formatBRL(valor)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 mt-1">
                    <span className="text-muted">Percentual</span>
                    <span className="text-ink tabular-nums">{total ? ((valor / total) * 100).toFixed(1) : "0,0"}%</span>
                  </div>
                </div>
              );
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </Card>
  );
}

/* ============================ bloco montado ============================ */
export function Comparativos({ c, isLoading }: { c: ComparativoFluxo | undefined; isLoading: boolean }) {
  if (isLoading || !c) return <Skeleton className="h-[320px]" />;
  return (
    <div className="flex flex-col gap-5">
      <ResultadoLiquidoCard c={c} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <GastosCard c={c} />
        <ReceitasCard c={c} />
      </div>
      <ParaOndeFoiCard s={c.sankey} total={c.sankey.total} />
    </div>
  );
}
