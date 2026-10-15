"use client";

/**
 * Kit do chat da Quattro AI — as peças do chat em tela cheia
 * (`ChatTelaCheia`, aberto de qualquer tela pelo `ChatGlobal`).
 *
 * Tipos, marca, etapas de análise, bolha de resposta e gráfico moram aqui; a
 * superfície só decide o LAYOUT em volta. (Até 14/10/2026 havia também o
 * painel flutuante e a aba Conversa de `/quattro-ai`, que usavam estas mesmas
 * peças.)
 */
import * as React from "react";
import Link from "next/link";
import { valorDoTexto, type NumeroResposta } from "@/core/assistant/numero";
import { GavetaTransacoes, type CelulaClicada } from "@/components/relatorios/kit";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Icon, DegradeArea } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { chartAnim } from "@/lib/chart-anim";
import type { GraficoResposta } from "@/core/assistant/engine";
import { RAIO_DIREITA } from "@/lib/grafico";

/**
 * Copia um texto e diz se COPIOU.
 *
 * ⚠️ O botão dizia "Copiado" sempre: `navigator.clipboard?.writeText(txt)` não
 * era aguardado, então a promessa recusada (permissão negada, página fora de
 * contexto seguro) escapava do `try` — e com `navigator.clipboard` ausente o
 * `?.` não fazia nada e o rótulo mentia do mesmo jeito. Agora a confirmação só
 * aparece quando o texto chegou à área de transferência; senão, a tela diz que
 * não copiou.
 */
export async function copiarTexto(txt: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(txt);
      return true;
    }
  } catch { /* cai no caminho antigo abaixo */ }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** O resultado da última cópia pedida num turno. */
export type EstadoCopia = "ok" | "falhou";

/** Um turno da conversa: a pergunta e o que a IA respondeu. */
export interface Turno {
  id: number;
  q: string;
  resposta?: string;
  numeros?: NumeroResposta[];
  fontes?: string[];
  acao?: string | null;
  fonte: "kb" | "ia" | "motor" | "carregando";
  feedback?: "up" | "down";
  rota?: string;
  rotaLabel?: string;
  contatoId?: string;
  grafico?: GraficoResposta;
}

/* ============================== MARCA ============================== */

/**
 * O "4" da marca — o raio do wordmark Quattro, vetorizado do próprio
 * `public/all4pay-dark.png`; o mesmo path vive em `public/all4pay-4.svg`.
 */
export const PATH_4 = "M39.3 0L64.32 0.29L34.06 53.95L61.56 54.61L74.5 31.49L98.95 31.97L60.99 99.81L36.06 100L53.38 68.98L1.05 68.6Z";

export const GRAD_MARCA = "var(--gradient-marca)";
/** Faixa larga do mesmo degradê + `a4p-onda` = a onda entre as cores. */
export const GRAD_ONDA = "var(--gradient-marca-onda)";

/** O "4" em degradê lime→verde (tile do FAB). Id único por instância. */
export function Marca4({ size = 18 }: { size?: number }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-lime)" />
          <stop offset="1" stopColor="var(--a4p-cat-3)" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d={PATH_4} />
    </svg>
  );
}

/**
 * A logo da IA — o MESMO "4" da marca girado 90°, em branco sobre o degradê
 * lima. É a marca que identifica o assistente (cabeçalho, estado vazio,
 * cada análise).
 */
export function MarcaIA({ size = 28, radius = 8 }: { size?: number; radius?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: radius, backgroundImage: GRAD_MARCA }}
      aria-hidden
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 100 100">
        <g transform="rotate(90 50 50)">
          <path fill="var(--color-white)" d={PATH_4} />
        </g>
      </svg>
    </span>
  );
}

/* ============================= GRÁFICO ============================= */

/**
 * O gráfico da resposta. O motor devolve só os dados (`GraficoResposta`); a
 * escolha visual mora aqui, seguindo o DS: **linha na cor da marca** com glow
 * em degradê (séries temporais) e **barras neutras** (entrada em ink · saída
 * em areia), a 70%. Número não tem cor por sinal (decisão de 30/09/2026): a
 * entrada e a saída se distinguem por intensidade, não por verde × vermelho.
 * Entra animado via `chartAnim()`.
 */
export function GraficoDaResposta({ g }: { g: GraficoResposta }) {
  const id = React.useId();
  const base = g.tom === "entrada" ? "var(--color-ink)" : g.tom === "saida" ? "var(--color-areia)" : "var(--color-lime)";
  const cor = `color-mix(in srgb, ${base} 70%, transparent)`;
  const resumo = g.dados.map((d) => `${d.nome}: ${formatBRL(d.valor)}`).join(", ");
  return (
    <figure className="m-0 flex flex-col gap-1 pt-1" role="img" aria-label={`${g.titulo}. ${resumo}`}>
      <figcaption className="text-[11px] text-faint">{g.titulo}</figcaption>
      <div style={{ height: g.tipo === "linha" ? 108 : Math.max(72, g.dados.length * 26) }}>
        <ResponsiveContainer width="100%" height="100%">
          {g.tipo === "linha" ? (
            <AreaChart data={g.dados} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <defs>
                <DegradeArea id={`${id}-glow`} />
              </defs>
              <XAxis dataKey="nome" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
              <YAxis hide />
              <Tooltip
                cursor={{ stroke: "var(--color-border)" }}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--color-border)" }}
                formatter={(v: number | string) => formatBRL(Number(v))}
              />
              <Area type="monotone" dataKey="valor" stroke="var(--color-lime)" strokeWidth={1.4}
                fill={`url(#${id}-glow)`} activeDot={{ r: 3 }} {...chartAnim()} />
            </AreaChart>
          ) : (
            <BarChart data={g.dados} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              {/* `interval={0}` é obrigatório: por padrão o Recharts OMITE ticks
                  que julga colidir, e some com o rótulo do meio. Nomes longos
                  são reticenciados aqui em vez de vazar da faixa. */}
              <YAxis type="category" dataKey="nome" width={96} interval={0} tickLine={false} axisLine={false}
                tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                tickFormatter={(v: string) => (v.length > 13 ? `${v.slice(0, 12)}…` : v)} />
              <Tooltip
                cursor={{ fill: "var(--color-surface-2)" }}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--color-border)" }}
                formatter={(v: number | string) => formatBRL(Number(v))}
              />
              <Bar dataKey="valor" fill={cor} radius={RAIO_DIREITA} barSize={10} {...chartAnim()} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/* ========================= ETAPAS DA ANÁLISE ========================= */

/**
 * As etapas visíveis da análise. Nenhuma resposta é instantânea — mesmo as que
 * o motor nativo calcula em microssegundos passam por aqui, porque ver o
 * trabalho acontecendo é o que faz a resposta parecer (e ser) apurada.
 */
export const ETAPAS = [
  "Lendo seus lançamentos",
  "Cruzando com o histórico",
  "Conferindo os números",
  "Redigindo a resposta",
];
/** Ritmo de cada etapa (ms). Soma ~2,1s — o tempo de uma consulta real. */
export const RITMO = [560, 640, 540, 400];

export const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * O "digitando" da IA: três pontos que pulam em sequência enquanto a análise
 * roda (decisão do dono, 15/10/2026 — saiu a lista de etapas com barra). O
 * ritmo de `RITMO` continua valendo; só a encenação mudou. `etapa` segue no
 * rótulo acessível, para quem usa leitor de tela saber o que está acontecendo.
 */
export function EtapasAnalise({ etapa, className = "" }: { etapa: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label={`${ETAPAS[etapa] ?? "Analisando"}…`}
      className={`a4p-entra a4p-digitando inline-flex w-fit items-center gap-[6px] rounded-card rounded-bl-sm bg-surface-1 px-4 py-[14px] ${className}`}
    >
      <span className="block w-[7px] h-[7px] rounded-pill bg-muted" />
      <span className="block w-[7px] h-[7px] rounded-pill bg-muted" />
      <span className="block w-[7px] h-[7px] rounded-pill bg-muted" />
    </div>
  );
}

/* =========================== BOLHA DE RESPOSTA =========================== */

/**
 * A resposta da IA: texto, gráfico (quando o motor devolve), números, ação
 * sugerida, atalhos (rota / ficha do contato) e o rodapé de fontes + feedback.
 * `onNavegar` deixa o painel flutuante fechar ao navegar; a página inteira não
 * precisa fazer nada.
 */
export function BolhaResposta({
  t, copia, onCopiar, onFeedback, onNavegar, variante = "bolha",
}: {
  t: Turno;
  /**
   * "bolha" = o balão do painel e da página; "aberta" = o chat em tela cheia
   * da Home: texto solto na coluna e o gráfico e os números em CARTÕES, como
   * no modelo que o dono escolheu. O conteúdo é o mesmo nos dois.
   */
  variante?: "bolha" | "aberta";
  /** `undefined` = nada pedido; "ok" = copiou; "falhou" = o navegador recusou. */
  copia?: EstadoCopia;
  onCopiar: (t: Turno) => void;
  onFeedback: (t: Turno, dir: "up" | "down") => void;
  onNavegar?: () => void;
}) {
  const aberta = variante === "aberta";
  return (
    <div data-ia="resposta" className={aberta
      ? "self-stretch flex flex-col gap-4"
      : "self-start max-w-[92%] rounded-card rounded-bl-sm bg-surface-1 px-3 py-[10px] flex flex-col gap-2"}>
      <p className={`m-0 text-ink whitespace-pre-wrap ${aberta ? "text-[16px] leading-[1.55]" : "text-[15px] leading-[1.5]"}`}>{t.resposta}</p>
      {(t.grafico || (t.numeros && t.numeros.length > 0)) && (aberta ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {t.grafico && <div data-ia="cartao" className="rounded-[20px] p-6 md:col-span-2" style={{ background: "var(--color-white)" }}><GraficoDaResposta g={t.grafico} /></div>}
          {t.numeros && t.numeros.length > 0 && <div data-ia="cartao" className="rounded-[20px] p-6 md:col-span-2" style={{ background: "var(--color-white)" }}><NumerosDaResposta numeros={t.numeros} onNavegar={onNavegar} /></div>}
        </div>
      ) : (
        <>
          {t.grafico && <GraficoDaResposta g={t.grafico} />}
          {t.numeros && t.numeros.length > 0 && <NumerosDaResposta numeros={t.numeros} onNavegar={onNavegar} />}
        </>
      ))}
      {/* ⚠️ A IA SUGERE, NÃO EXECUTA (Rodada 9). O rótulo era "Ação:", e quem
          lê "Ação: antecipar o recebível da Alpha" conclui que algo foi feito.
          Nada foi: o chat não tem caminho de escrita nenhum (a guarda
          `ia-executa` cobra isso). A sugestão diz que é sugestão e onde agir. */}
      {t.acao && (
        <div data-ia="sugestao" className="flex items-start gap-2 rounded-md bg-white border border-border-soft p-2">
          <Icon name="sparkles" size={13} color="var(--color-lime)" />
          <span className="text-caption text-ink">
            <b className="font-medium">Sugestão</b> {t.acao}
            <span className="block text-faint">A IA não executa nada: quem decide e age é você, na tela correspondente.</span>
          </span>
        </div>
      )}
      {t.rota && (
        <Link href={t.rota} onClick={onNavegar} className="inline-flex items-center gap-1 self-start text-caption font-medium text-ink bg-surface-2 hover:bg-surface-3 rounded-pill px-3 py-[6px] transition-colors">
          Abrir {t.rotaLabel || "no sistema"}
          <Icon name="arrow-up-right" size={13} color="currentColor" />
        </Link>
      )}
      {t.contatoId && (
        <button onClick={() => { window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: t.contatoId } })); onNavegar?.(); }}
          className="inline-flex items-center gap-1 self-start text-caption font-medium text-ink bg-surface-2 hover:bg-surface-3 rounded-pill px-3 py-[6px] transition-colors">
          Abrir ficha do contato
          <Icon name="arrow-up-right" size={13} color="currentColor" />
        </button>
      )}
      {(t.fontes?.length || t.fonte !== "carregando") && (
        <div className="flex items-center gap-2 text-[11px] text-faint">
          {t.fontes && t.fontes.length > 0 && <span className="truncate">Fontes: {t.fontes.join(" · ")}{t.fonte === "ia" ? " · Claude" : ""}</span>}
          {t.fonte !== "carregando" && (
            <span className="ml-auto inline-flex items-center gap-1 shrink-0">
              <button onClick={() => onCopiar(t)} aria-label="Copiar resposta" className={`h-6 px-2 rounded-sm inline-flex items-center hover:bg-surface-2 hover:text-ink transition-colors ${copia === "falhou" ? "text-negative" : "text-faint"}`}>
                {copia === "ok" ? "Copiado" : copia === "falhou" ? "Não copiou — selecione o texto" : "Copiar"}
              </button>
              <span className="sr-only" aria-live="polite">{copia === "ok" ? "Resposta copiada." : copia === "falhou" ? "O navegador não permitiu copiar." : ""}</span>
              {t.fonte !== "kb" && <>
                <button onClick={() => onFeedback(t, "up")} aria-label="Resposta útil" aria-pressed={t.feedback === "up"} className={`w-6 h-6 rounded-sm inline-flex items-center justify-center hover:bg-surface-2 ${t.feedback === "up" ? "text-positive" : "text-faint"}`}><Icon name="check" size={13} color="currentColor" /></button>
                <button onClick={() => onFeedback(t, "down")} aria-label="Resposta ruim" aria-pressed={t.feedback === "down"} className={`w-6 h-6 rounded-sm inline-flex items-center justify-center hover:bg-surface-2 ${t.feedback === "down" ? "text-negative" : "text-faint"}`}><Icon name="minus" size={13} color="currentColor" /></button>
              </>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ======================== NÚMEROS DA RESPOSTA ======================== */

/**
 * Os números da resposta, cada um com o caminho até a sua origem (Rodada 9):
 *
 *  · soma de lançamentos → abre a GAVETA com as linhas, e o total dela é o
 *    próprio número (o mesmo `GavetaTransacoes` do drill-down do DRE);
 *  · base de cálculo (média, razão, contagem) → abre a gaveta com a base, e o
 *    total que aparece é o DELA, não o do número;
 *  · número de tela (índice, linha "=" do DRE) → leva à tela;
 *  · simulação → marcada, sem link: o número nasceu da pergunta.
 */
function NumerosDaResposta({ numeros, onNavegar }: { numeros: NumeroResposta[]; onNavegar?: () => void }) {
  const [aberto, setAberto] = React.useState<{ celula: CelulaClicada; tela: { rota: string; nome: string } } | null>(null);
  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
        {numeros.map((n, i) => {
          const corpo = (
            <>
              <div className="text-[11px] text-faint">{n.label}</div>
              <div className="text-[16px] font-semibold tabular-nums text-ink">{n.valor}</div>
            </>
          );
          const o = n.origem;
          if (o?.movimentos) {
            const abrir = () => setAberto({
              celula: {
                linha: n.label,
                coluna: o.soma ? `${n.valor} · ${o.tela}` : `base de cálculo de ${n.valor} · ${o.tela}`,
                movimentos: o.movimentos!,
                // Soma: o total da gaveta É o número. Base: a gaveta soma as
                // próprias linhas — o número ao lado é uma média ou uma razão.
                valor: o.soma ? (valorDoTexto(n.valor) ?? undefined) : undefined,
              },
              tela: { rota: o.rota, nome: o.tela },
            });
            return (
              <button key={i} type="button" onClick={abrir} data-ia-numero={o.soma ? "soma" : "base"}
                title={o.soma ? "Ver os lançamentos que somam este número" : "Ver os lançamentos usados no cálculo"}
                className="block text-left rounded-sm hover:bg-surface-2 -mx-1 px-1 transition-colors">
                {corpo}
              </button>
            );
          }
          if (o) {
            return (
              <Link key={i} href={o.rota} onClick={onNavegar} data-ia-numero="tela"
                title={`Ver em ${o.tela}`} className="block rounded-sm hover:bg-surface-2 -mx-1 px-1 transition-colors">
                {corpo}
              </Link>
            );
          }
          return (
            <div key={i} data-ia-numero={n.simulacao ? "simulacao" : "sem-origem"}>
              {corpo}
              {n.simulacao && <div className="text-[11px] text-faint">simulação</div>}
            </div>
          );
        })}
      </div>
      {aberto && (
        <GavetaTransacoes celula={aberto.celula} tela={aberto.tela} onNavegar={onNavegar} onFechar={() => setAberto(null)} />
      )}
    </>
  );
}

/** Perguntas curadas — o ponto de partida quando não há aprendizado ainda. */
export const CURADAS = [
  "Me dá um resumo do dia",
  "Quanto gastei esse mês?",
  "Onde posso economizar?",
  "Quanto vai sobrar esse mês?",
  "Quem está me devendo?",
  "Posso gastar R$5.000?",
  "Quais meus maiores fornecedores?",
  "Qual minha margem esse mês?",
  "Estou crescendo?",
  "Qual meu ponto de equilíbrio?",
  "Meus clientes pagam em dia?",
  "Quando vou ficar sem dinheiro?",
  "Qual foi meu melhor mês?",
  "O que é margem de contribuição?",
  "Quanto pago de Simples faturando 500 mil por ano?",
  "Quanto cobrar de um boleto de 1.000 vencido há 30 dias?",
];
