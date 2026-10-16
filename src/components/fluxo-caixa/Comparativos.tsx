"use client";

/**
 * Cards comparativos do Fluxo de Caixa — Resultado líquido · Gastos · Receitas
 * — e o Sankey "Para onde foi", no modelo da referência enviada.
 *
 * Os três primeiros cards seguem os modelos que o dono escolheu nas pranchetas
 * de TROCAS do canvas "Quattro ERP · Gráficos e tabelas" (15/10/2026), sobre a
 * moldura `CartaoBiblioteca`: Resultado líquido → "Análises 3", Gastos →
 * "Entradas", Receitas → "Receita 2". O Sankey não foi trocado.
 *
 * Cor: o NÚMERO não tem cor por sinal (30/09/2026). Entradas e saídas nos
 * gráficos levam a cor da SÉRIE (`--erp-graf-entrada`/`--erp-graf-saida`),
 * porque o dono ligou "Positivo e negativo" nesses modelos; o Sankey segue em
 * tons do mesmo matiz.
 */
import * as React from "react";
import { ResponsiveContainer, Tooltip, Sankey, Layer, Rectangle } from "recharts";
import { Card, Icon, BRL, Skeleton, CartaoBiblioteca, BarrasEntradaSaida, LinhaEntradaSaida, BarrasDestaque, type PontoEntradaSaida } from "@/components/ui";
import { formatBRL, pct } from "@/lib/format";
import { rotuloData, type SerieComparada, type ComparativoFluxo, type SankeyDados, type SankeyLigacao } from "@/core/cashflow/comparativo";
import { pctDeInteiro } from "@/lib/format";

const ENTRADA = "var(--color-ink)";
const SAIDA = "var(--color-areia)";
const FAINT = "var(--color-text-tertiary)";

/** Tons do MESMO matiz para as categorias (o DS não tem paleta categórica). */
const TONS = [100, 76, 56, 40, 28, 19, 13, 9];
const tomDe = (cor: string, i: number) =>
  `color-mix(in srgb, ${cor} ${TONS[Math.min(i, TONS.length - 1)]}%, transparent)`;

/* ============================ pílula de variação ============================ */
/** A direção vem do "+"/"−" e da seta, nunca da cor: a pílula é neutra. */
function PilulaVariacao({ s }: { s: SerieComparada }) {
  if (s.variacao === null) {
    return (
      <span className="text-[13px] text-faint">
        sem período anterior para comparar
      </span>
    );
  }
  const sobe = s.variacao >= 0;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-[13px] font-semibold tabular-nums"
        style={{ background: "var(--color-surface-2)", color: "var(--color-ink)" }}
      >
        <span className="inline-flex" style={sobe ? undefined : { transform: "scaleY(-1)" }}>
          <Icon name="trending-up" size={13} color="currentColor" />
        </span>
        {sobe ? "+" : "−"}{pctDeInteiro(Math.abs(s.variacao * 100))}
      </span>
      <span className="text-[13px] text-faint">
        vs <BRL value={s.totalAnterior} />
      </span>
    </div>
  );
}

/* ===================== janela + pílula (subtítulo comum) ===================== */
function Subtitulo({ c, s }: { c: ComparativoFluxo; s: SerieComparada }) {
  return (
    <span className="flex items-center gap-2 flex-wrap">
      <span>{rotuloData(c.janela.de)} – {rotuloData(c.janela.ate)}</span>
      <PilulaVariacao s={s} />
    </span>
  );
}

/** Entradas × saídas do mesmo balde, lado a lado (as duas séries já vêm alinhadas). */
function entradasSaidas(c: ComparativoFluxo): PontoEntradaSaida[] {
  return c.receitas.pontos.map((p, i) => ({ label: p.label, entrada: p.valor, saida: c.gastos.pontos[i]?.valor ?? 0 }));
}

/* ======================== 1) Resultado líquido ======================== */
/** Troca do canvas (15/10/2026): "Análises 3" — entradas em linha reta com área, saídas tracejadas. */
export function ResultadoLiquidoCard({ c }: { c: ComparativoFluxo }) {
  const s = c.resultado;
  return (
    <CartaoBiblioteca
      titulo="Resultado líquido"
      href="/dashboard/reports/dre"
      valor={<>{s.total < 0 ? "−" : ""}<BRL value={Math.abs(s.total)} /></>}
      subtitulo={<Subtitulo c={c} s={s} />}
      info={{
        oQue: "O que sobrou (ou faltou) no período: tudo que entrou menos tudo que saiu, comparado com o período anterior de mesmo tamanho.",
        comoCalcula: "O valor é entradas − saídas da janela. No gráfico, as entradas de cada balde em linha e as saídas tracejadas; a dica mostra a margem do balde, (entradas − saídas) ÷ entradas. A variação compara o total com a janela anterior.",
      }}
    >
      <LinhaEntradaSaida id="resultado" dados={entradasSaidas(c)} altura={240} ariaLabel="Entradas e saídas de cada balde do período" />
    </CartaoBiblioteca>
  );
}

/* ============================== 2) Gastos ============================== */
/** Troca do canvas (15/10/2026): "Entradas" — entradas para cima, saídas para baixo. */
export function GastosCard({ c }: { c: ComparativoFluxo }) {
  const s = c.gastos;
  return (
    <CartaoBiblioteca
      titulo="Gastos"
      href="/contas-a-pagar/titulos"
      valor={<BRL value={s.total} />}
      pesoValor={600}
      subtitulo={<Subtitulo c={c} s={s} />}
      info={{
        oQue: "Tudo que saiu no período, contra o que entrou no mesmo balde, e a variação contra o período anterior.",
        comoCalcula: "O valor soma as saídas da janela. No gráfico, as entradas de cada balde sobem e as saídas descem; a variação compara o total de saídas com a janela anterior de mesmo tamanho.",
      }}
    >
      <BarrasEntradaSaida dados={entradasSaidas(c)} altura={240} ariaLabel="Entradas e saídas de cada balde do período" />
    </CartaoBiblioteca>
  );
}

/* ============================= 3) Receitas ============================= */
/** Troca do canvas (15/10/2026): "Receita 2" — barras com o balde atual em destaque. */
export function ReceitasCard({ c }: { c: ComparativoFluxo }) {
  const s = c.receitas;
  return (
    <CartaoBiblioteca
      titulo="Receitas"
      href="/contas-a-receber/titulos"
      valor={<BRL value={s.total} />}
      subtitulo={<Subtitulo c={c} s={s} />}
      info={{
        oQue: "Tudo que entrou no período, balde a balde, contra o período anterior de mesmo tamanho.",
        comoCalcula: "Soma as entradas de cada balde da janela; a barra escura é o balde mais recente. A variação compara o total com a janela anterior.",
      }}
    >
      <BarrasDestaque dados={s.pontos.map((p) => ({ label: p.label, valor: p.valor }))} altura={240} rotuloSerie="Receitas" ariaLabel="Receitas de cada balde do período" />
    </CartaoBiblioteca>
  );
}

/* ========================= 4) Sankey "Para onde foi" ========================= */
/**
 * Cor de CADA nó — e, por tabela, do rastro que sai dele:
 *   · Receita        → ink (é entrada)
 *   · Despesas       → areia (é saída)
 *   · categorias     → tons da areia, um por categoria
 *   · contrapartes   → HERDAM o tom da categoria que mais lhes manda dinheiro,
 *                      então a subárvore inteira fica na mesma família de cor.
 */
function coresDosNos(s: SankeyDados): string[] {
  const cores: string[] = new Array(s.nodes.length).fill(SAIDA);
  let iCat = 0;
  s.nodes.forEach((n, i) => {
    if (n.nivel === 0) cores[i] = ENTRADA;
    else if (n.nivel === 1) cores[i] = SAIDA;
    else if (n.nivel === 2) cores[i] = tomDe(SAIDA, iCat++);
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
      <Rectangle x={x} y={y} width={width} height={height} fill={cores[index] ?? SAIDA} radius={[3, 3, 3, 3]} />
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
 * "segue a cor referente". No primeiro elo isso desenha a leitura toda: o ink
 * da receita virando a areia da despesa ao longo do caminho.
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
  const corDe = cores[l?.source ?? 0] ?? SAIDA;
  const corPara = cores[l?.target ?? 0] ?? SAIDA;
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
        <span className="text-[13px] font-medium tracking-[0.06em] text-faint">Para onde foi</span>
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
        <span className="text-[13px] font-medium tracking-[0.06em] text-faint">Para onde foi</span>
        <span className="text-[13px] text-muted tabular-nums"><BRL value={total} /></span>
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
                    <span className="text-ink tabular-nums"><BRL value={valor} /></span>
                  </div>
                  <div className="flex items-center justify-between gap-4 mt-1">
                    <span className="text-muted">Percentual</span>
                    <span className="text-ink tabular-nums">{total ? pct(valor / total) : "—"}</span>
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
