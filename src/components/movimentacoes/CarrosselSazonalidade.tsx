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
import { dataDe, magnitude, assinado } from "@/core/indicadores";
import type { RiskInput } from "@/core/risk-engine/types";

export type Granularidade = "mes" | "semana";

export interface PeriodoSazonal {
  key: string;
  label: string;
  de: string;
  ate: string;
  entradas: number;
  saidas: number;
  resultado: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Os doze períodos terminando no de hoje, do mais antigo ao atual. */
export function montarPeriodos(hojeISO: string, gran: Granularidade): PeriodoSazonal[] {
  const hoje = parse(hojeISO);
  const out: PeriodoSazonal[] = [];
  for (let i = 11; i >= 0; i--) {
    if (gran === "mes") {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      out.push({
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: `${MESES[d.getMonth()]}${d.getFullYear() !== hoje.getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : ""}`,
        de: iso(d), ate: iso(fim), entradas: 0, saidas: 0, resultado: 0,
      });
    } else {
      const dom = new Date(hoje); dom.setDate(hoje.getDate() - hoje.getDay() - i * 7);
      const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
      out.push({
        key: `w-${iso(dom)}`,
        label: `${dom.getDate()}/${MES_ABBR[dom.getMonth()]} – ${sab.getDate()}/${MES_ABBR[sab.getMonth()]}`,
        de: iso(dom), ate: iso(sab), entradas: 0, saidas: 0, resultado: 0,
      });
    }
  }
  return out;
}

/**
 * Preenche os períodos com os movimentos.
 *
 * ⚠️ A data de caixa vem de `core/indicadores` (`dataDe`), e o pendente entra
 * pelo VENCIMENTO — a faixa mostra o que já aconteceu E o que está previsto,
 * porque a pergunta sazonal é sobre o mês, não sobre o extrato bancário.
 */
export function periodosComValores(
  input: RiskInput | undefined,
  hojeISO: string,
  gran: Granularidade,
): PeriodoSazonal[] {
  const ps = montarPeriodos(hojeISO, gran);
  if (!input) return ps;
  for (const m of input.movements) {
    if (m.status === "cancelado") continue;
    const d = dataDe(m, "caixa") ?? m.due_date?.slice(0, 10);
    if (!d) continue;
    const p = ps.find((x) => d >= x.de && d <= x.ate);
    if (!p) continue;
    if (m.type === "entrada") p.entradas += magnitude(m);
    else p.saidas += magnitude(m);
  }
  for (const p of ps) p.resultado = p.entradas - p.saidas;
  return ps;
}

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
}: {
  periodos: PeriodoSazonal[];
  gran: Granularidade;
  onGran: (g: Granularidade) => void;
  children: React.ReactNode;
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
      <div className="flex items-center justify-end gap-2 px-5 pt-5 pb-3 flex-wrap">
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

/** Soma assinada dos movimentos de um período — usada pelas guardas. */
export const resultadoDoPeriodo = (input: RiskInput, p: PeriodoSazonal): number =>
  input.movements
    .filter((m) => m.status !== "cancelado")
    .filter((m) => {
      const d = dataDe(m, "caixa") ?? m.due_date?.slice(0, 10);
      return !!d && d >= p.de && d <= p.ate;
    })
    .reduce((s, m) => s + assinado(m), 0);

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

export function FaixaPeriodos({ periodos, selKey, onSelect }: { periodos: PeriodoSazonal[]; selKey?: string; onSelect: (k: string) => void }) {
  const LARG = 150, ALT = 74;
  const total = periodos.length * LARG;
  const vals = periodos.map((p) => p.resultado);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const y = (v: number) => 12 + (1 - (v - min) / span) * (ALT - 24);
  const pontos = periodos.map((p, i) => ({ x: i * LARG + LARG / 2, y: y(p.resultado), key: p.key }));
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
          // Zero é NEUTRO: pintar de verde um período sem movimento diz que
          // foi bom quando não houve nada.
          const cor = p.resultado === 0 ? "var(--color-text-tertiary)" : p.resultado > 0 ? POSITIVE : NEGATIVE;
          return (
            <button
              key={p.key} onClick={() => onSelect(p.key)} aria-pressed={on}
              className={`shrink-0 flex flex-col items-center gap-1 rounded-[14px] py-3 transition-colors ${on ? "bg-surface-2" : "hover:bg-surface-1"}`}
              style={{ width: LARG }}
            >
              <span className="text-[14px] text-muted truncate max-w-full px-2">{p.label}</span>
              <span className="text-[17px] font-medium tabular-nums" style={{ color: cor }}>
                {p.resultado < 0 ? "−" : ""}{formatBRL(Math.abs(p.resultado))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
