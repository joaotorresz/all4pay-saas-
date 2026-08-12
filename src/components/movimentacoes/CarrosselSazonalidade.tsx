"use client";

/**
 * O CARROSSEL DE SAZONALIDADE — doze períodos com o resultado líquido de cada
 * um, ligados por uma linha.
 *
 * ⚠️ Extraído do extrato para ser PORTADO à tela canônica de títulos (mapa de
 * consolidação, item 2). É a única superfície do produto que responde "como
 * este mês se compara aos onze anteriores" sem abrir um relatório — a tela de
 * títulos mostra estoque e não tem noção de tempo. Aposentar o extrato sem
 * trazer isto perderia a leitura sazonal inteira.
 *
 * Extraído em vez de copiado: duas cópias divergem no dia em que uma delas
 * ganhar um ajuste, e aí o mesmo mês mostra resultados diferentes em duas
 * telas — que é o defeito que a ONDA 1 passou a impedir.
 */
import * as React from "react";
import { Icon } from "@/components/ui";
import { formatBRL } from "@/lib/format";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
// ⚠️ As agregações e os cortes de tempo moram em `core/movimentacoes/periodos`
// — um `.tsx` não pode ser importado pelas guardas (o Node não parseia JSX), e
// uma soma de dinheiro fora do alcance do teste é uma soma sem rede. Aqui fica
// só o DESENHO; a reexportação preserva os pontos de chamada existentes.
export {
  montarPeriodos, periodosComValores, periodosPorVencimento, resultadoDoPeriodo,
  type Granularidade, type PeriodoSazonal,
} from "@/core/movimentacoes/periodos";
import type { Granularidade, PeriodoSazonal } from "@/core/movimentacoes/periodos";

/**
 * A faixa rolável com as setas e o período atual já centralizado.
 *
 * `renderFaixa` recebe os períodos porque o desenho dos cartões e da linha vive
 * na tela que a usa (o extrato tem o seu; a tela de títulos usa o mesmo). O que
 * este componente garante é o COMPORTAMENTO: setas, rolagem e a abertura no
 * período atual.
 */
export function CarrosselSazonalidade({
  periodos,
  gran,
  onGran,
  children,
  recarregarEm,
  titulo,
}: {
  periodos: PeriodoSazonal[];
  gran: Granularidade;
  onGran: (g: Granularidade) => void;
  children: React.ReactNode;
  /**
   * O que a faixa MEDE, dito na tela.
   *
   * ⚠️ Sem ele o cabeçalho tem só o seletor de granularidade, e doze números
   * grandes sem rótulo obrigam quem olha a deduzir a grandeza — dedução que
   * mudou de resposta quando a tela de títulos passou a somar obrigações em vez
   * de resultado. Opcional: o extrato segue sem rótulo, onde o contexto da
   * página já responde.
   */
  titulo?: string;
  /** Muda quando os dados chegam — força a faixa a reabrir no período atual. */
  recarregarEm?: unknown;
}) {
  const faixaRef = React.useRef<HTMLDivElement>(null);

  // ⚠️ A faixa é montada do período mais ANTIGO para o mais novo, então sem
  // isto o carrossel abre doze meses atrás. O rAF é necessário: no efeito
  // síncrono o conteúdo ainda não foi medido e `scrollWidth` sai igual a
  // `clientWidth`.
  React.useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = faixaRef.current;
      if (el) el.scrollLeft = el.scrollWidth;
    });
    return () => cancelAnimationFrame(id);
  }, [gran, periodos.length, recarregarEm]);

  const rolar = (dir: 1 | -1) => faixaRef.current?.scrollBy({ left: dir * 340, behavior: "smooth" });

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3 flex-wrap">
        {/* ⚠️ `text-label text-muted` — o MESMO tratamento da frase de escopo logo
            abaixo ("Valores a pagar aos seus fornecedores…"). O `.a4p-label` é
            mono e faint: ao lado de uma frase em Roobert, os dois textos da
            mesma tela pareciam vir de sistemas diferentes. */}
        {titulo ? <span className="text-label text-muted">{titulo}</span> : <span />}
        <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-pill bg-surface-2 p-[3px]" role="tablist" aria-label="Granularidade">
          {([["mes", "Mês"], ["semana", "Semana"]] as [Granularidade, string][]).map(([id, label]) => (
            <button
              key={id} role="tab" aria-selected={gran === id} onClick={() => onGran(id)}
              className={`rounded-pill px-4 py-[6px] text-caption font-medium transition-colors ${gran === id ? "bg-white text-ink" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        </div>
      </div>
      <div className="relative">
        <button
          onClick={() => rolar(-1)} aria-label="Períodos anteriores"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-pill bg-white border border-border inline-flex items-center justify-center text-muted hover:text-ink"
        >
          <Icon name="chevron-left" size={16} color="currentColor" />
        </button>
        <button
          onClick={() => rolar(1)} aria-label="Próximos períodos"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-pill bg-white border border-border inline-flex items-center justify-center text-muted hover:text-ink"
        >
          <Icon name="chevron-right" size={16} color="currentColor" />
        </button>
        <div ref={faixaRef} className="overflow-x-auto px-12 pb-4">{children}</div>
      </div>
    </>
  );
}

/**
 * Os cartões da faixa, com a linha do resultado por cima.
 *
 * ⚠️ Zero é NEUTRO (nem verde nem vermelho): um mês sem movimento pintado de
 * verde diria que foi um mês bom.
 */
/**
 * A CURVA SUAVE — o equivalente ao `type="monotone"` do Recharts.
 *
 * ⚠️ Esta faixa NÃO é um gráfico Recharts: é um `<path>` desenhado à mão, então
 * "suavizar" não é trocar um prop — é interpolar. O algoritmo é o mesmo que o
 * `monotone` usa (Fritsch–Carlson): tangentes pela média das inclinações
 * vizinhas, LIMITADAS para a curva nunca ultrapassar os próprios pontos.
 *
 * O limite é o ponto inteiro. Uma spline solta (Catmull-Rom sem restrição)
 * produz barrigas que passam abaixo do menor valor — num gráfico de dinheiro
 * isso desenha um mês menor do que ele foi, entre dois meses que existem. A
 * suavização não pode inventar um vale que o dado não tem.
 */
function caminhoSuave(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [], delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    delta.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
  }
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // Mudança de direção ⇒ tangente ZERO: é o que crava o vértice no ponto e
    // impede a curva de "passar direto" por um pico.
    m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / delta[i], b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * delta[i]; m[i + 1] = t * b * delta[i]; }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const t = dx[i] / 3;
    d += ` C${pts[i].x + t},${pts[i].y + m[i] * t} ${pts[i + 1].x - t},${pts[i + 1].y - m[i + 1] * t} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

export function FaixaPeriodos({ periodos, selKey, onSelect, modo = "resultado" }: {
  periodos: PeriodoSazonal[];
  selKey?: string;
  onSelect: (k: string) => void;
  /**
   * O que a cápsula mostra.
   *
   * `resultado` (padrão) — entradas − saídas, com sinal e com cor semântica.
   * `total` — o total do período, sempre positivo, **sem sinal e sem cor**: uma
   * soma de obrigações não é boa nem ruim, e pintar de vermelho o mês que tem
   * mais contas a pagar diria que ter contas é um problema.
   */
  modo?: "resultado" | "total";
}) {
  const LARG = 150, ALT = 74;
  const total = periodos.length * LARG;
  const valorDe = (p: PeriodoSazonal) => (modo === "total" ? (p.total ?? 0) : p.resultado);
  const vals = periodos.map(valorDe);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const y = (v: number) => 12 + (1 - (v - min) / span) * (ALT - 24);
  const pontos = periodos.map((p, i) => ({ x: i * LARG + LARG / 2, y: y(valorDe(p)), key: p.key }));
  const d = caminhoSuave(pontos);

  return (
    <div className="relative" style={{ width: total }}>
      <svg width={total} height={ALT} className="absolute inset-x-0 top-0 pointer-events-none" aria-hidden>
        {/* ⚠️ A linha é NEUTRA ESCURA (`ink-soft`), não a cor de gráfico.
            `--color-chart-line` é o lima da marca, reservado às séries
            temporais de saldo e score; usá-lo aqui gastava o acento numa faixa
            que é contexto, não destaque — e a regra do DS é que o lima fica
            abaixo de ~5% da tela. */}
        <path d={d} fill="none" stroke="var(--color-ink-soft)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        {/* Os marcadores PERFURAM a linha: preenchidos com a superfície em que
            o gráfico está desenhado (o card é branco) e contornados na cor da
            linha. Preencher com o cinza do canvas deixaria discos cinza sobre
            um card branco — que não é o mesmo efeito. */}
        {pontos.map((pt) => (
          <circle key={pt.key} cx={pt.x} cy={pt.y} r={pt.key === selKey ? 4.5 : 3} fill="var(--color-white)" stroke="var(--color-ink-soft)" strokeWidth={1.4} />
        ))}
      </svg>
      <div className="flex" style={{ paddingTop: ALT }}>
        {periodos.map((p) => {
          const on = p.key === selKey;
          const v = valorDe(p);
          // Zero é NEUTRO: pintar de verde um período sem movimento diz que
          // foi bom quando não houve nada. No modo `total` a cor é neutra
          // SEMPRE — a grandeza não tem lado bom.
          const cor = modo === "total"
            ? "var(--color-ink)"
            : v === 0 ? "var(--color-text-tertiary)" : v > 0 ? POSITIVE : NEGATIVE;
          return (
            <button
              key={p.key} onClick={() => onSelect(p.key)} aria-pressed={on}
              className={`shrink-0 flex flex-col items-center gap-1 rounded-[14px] py-3 transition-colors ${on ? "bg-surface-2" : "hover:bg-surface-1"}`}
              style={{ width: LARG }}
            >
              <span className="text-[14px] text-muted truncate max-w-full px-2">{p.label}</span>
              <span className="text-[17px] font-medium tabular-nums" style={{ color: cor }}>
                {v < 0 ? "−" : ""}{formatBRL(v < 0 ? -v : v)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
