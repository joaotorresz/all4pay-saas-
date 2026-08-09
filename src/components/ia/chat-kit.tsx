"use client";

/**
 * Kit do chat da All 4 Pay AI — as peças COMPARTILHADAS entre o painel
 * flutuante (`AssistantWidget`, em toda tela) e a página inteira
 * (`/all4pay-ai`, com histórico de conversas).
 *
 * A regra é uma só: **a IA é a mesma nos dois lugares**. Tipos, marca,
 * etapas de análise, bolha de resposta e gráfico moram aqui; cada superfície
 * só decide o LAYOUT em volta.
 */
import * as React from "react";
import Link from "next/link";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Icon } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { chartAnim } from "@/lib/chart-anim";
import type { GraficoResposta } from "@/core/assistant/engine";

/** Um turno da conversa: a pergunta e o que a IA respondeu. */
export interface Turno {
  id: number;
  q: string;
  resposta?: string;
  numeros?: { label: string; valor: string }[];
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
 * O "4" da marca — o raio do wordmark all4pay, vetorizado do próprio
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
 * em degradê (séries temporais) e **barras nas cores semânticas** (entrada
 * verde · saída vermelha), a 70% — cor de status é sinal, não preenchimento
 * grande. Entra animado via `chartAnim()`.
 */
export function GraficoDaResposta({ g }: { g: GraficoResposta }) {
  const id = React.useId();
  const base = g.tom === "entrada" ? "var(--color-positive)" : g.tom === "saida" ? "var(--color-negative)" : "var(--color-lime)";
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
                <linearGradient id={`${id}-glow`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-lime)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-lime)" stopOpacity={0} />
                </linearGradient>
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
              <Bar dataKey="valor" fill={cor} radius={[0, 4, 4, 0]} barSize={10} {...chartAnim()} />
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

export function EtapasAnalise({ etapa, className = "" }: { etapa: number; className?: string }) {
  return (
    <div className={`a4p-entra rounded-card rounded-bl-sm bg-surface-1 px-3 py-[10px] flex flex-col gap-[10px] ${className}`}>
      <div className="flex items-center gap-2">
        <MarcaIA size={20} radius={6} />
        <span className="a4p-pulso text-[13px] text-muted">{ETAPAS[etapa]}…</span>
      </div>
      <div className="flex flex-col gap-[6px]">
        {ETAPAS.map((e, i) => (
          <div key={e} className="flex items-center gap-2 text-[12px]">
            <span
              className={`w-[6px] h-[6px] rounded-pill shrink-0 ${i === etapa ? "a4p-pulso" : ""}`}
              style={{ background: i < etapa ? "var(--color-positive)" : i === etapa ? "var(--color-lime)" : "var(--color-border)" }}
            />
            <span className={i <= etapa ? "text-muted" : "text-faint"}>{e}</span>
            {i < etapa && <Icon name="check" size={11} color="var(--color-positive)" />}
          </div>
        ))}
      </div>
      {/* Barra varrida: progresso real (etapa) + brilho em movimento. */}
      <div className="h-[3px] rounded-pill bg-surface-2 overflow-hidden">
        <div
          className="a4p-varre h-full rounded-pill transition-[width] duration-500"
          style={{
            width: `${((etapa + 1) / ETAPAS.length) * 100}%`,
            backgroundImage: "linear-gradient(90deg,var(--color-lime),var(--a4p-cat-3),var(--color-lime))",
          }}
        />
      </div>
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
  t, copiado, onCopiar, onFeedback, onNavegar,
}: {
  t: Turno;
  copiado: boolean;
  onCopiar: (t: Turno) => void;
  onFeedback: (t: Turno, dir: "up" | "down") => void;
  onNavegar?: () => void;
}) {
  return (
    <div data-ia="resposta" className="self-start max-w-[92%] rounded-card rounded-bl-sm bg-surface-1 px-3 py-[10px] flex flex-col gap-2">
      <p className="m-0 text-[15px] leading-[1.5] text-ink whitespace-pre-wrap">{t.resposta}</p>
      {t.grafico && <GraficoDaResposta g={t.grafico} />}
      {t.numeros && t.numeros.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          {t.numeros.map((n, i) => (
            <div key={i}>
              <div className="text-[11px] text-faint">{n.label}</div>
              <div className="text-[16px] font-semibold tabular-nums text-ink">{n.valor}</div>
            </div>
          ))}
        </div>
      )}
      {t.acao && (
        <div className="flex items-start gap-2 rounded-md bg-white border border-border-soft p-2">
          <Icon name="sparkles" size={13} color="var(--color-lime)" />
          <span className="text-caption text-ink"><b className="font-medium">Ação:</b> {t.acao}</span>
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
              <button onClick={() => onCopiar(t)} aria-label="Copiar resposta" className="h-6 px-2 rounded-sm inline-flex items-center hover:bg-surface-2 text-faint hover:text-ink transition-colors">{copiado ? "Copiado" : "Copiar"}</button>
              {t.fonte !== "kb" && <>
                <button onClick={() => onFeedback(t, "up")} aria-label="Resposta útil" className={`w-6 h-6 rounded-sm inline-flex items-center justify-center hover:bg-surface-2 ${t.feedback === "up" ? "text-positive" : "text-faint"}`}><Icon name="check" size={13} color="currentColor" /></button>
                <button onClick={() => onFeedback(t, "down")} aria-label="Resposta ruim" className={`w-6 h-6 rounded-sm inline-flex items-center justify-center hover:bg-surface-2 ${t.feedback === "down" ? "text-negative" : "text-faint"}`}><Icon name="minus" size={13} color="currentColor" /></button>
              </>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Perguntas curadas — o ponto de partida quando não há aprendizado ainda. */
export const CURADAS = [
  "Me dá um resumo do dia",
  "Quanto gastei esse mês?",
  "Onde posso economizar?",
  "Quanto vai sobrar esse mês?",
  "Quem está me devendo?",
  "Posso gastar R$ 5.000?",
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
