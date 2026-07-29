"use client";

/**
 * all4pay IA — assistente FLUTUANTE global (não fica no menu). Um FAB no canto
 * inferior direito ("Pergunte à IA") abre um painel de chat à direita (estilo
 * Visor) que entende e analisa os dados do cliente:
 *  • Perguntas conceituais ("o que é runway?", "como calcula o EBITDA?") →
 *    respondidas na hora pela base de conhecimento do sistema (assistant-kb).
 *  • Perguntas sobre os números → ancoradas no contexto executivo real
 *    (centroInteligencia) via Claude (/api/ai/copiloto), com o motor
 *    determinístico `copilotoFinanceiro` como fallback (funciona sem chave).
 *  • APRENDE com o uso: cada pergunta e cada 👍/👎 alimentam a memória
 *    adaptativa (assistant-memory) que reordena as sugestões.
 * Montado uma vez no AppShell → presente em todas as telas.
 */
import * as React from "react";
import Link from "next/link";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Icon } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { chartAnim } from "@/lib/chart-anim";
import { copilotoFinanceiro, centroInteligencia } from "@/core/executive";
import type { RespostaCopiloto } from "@/core/executive/types";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { responderLocal, type GraficoResposta } from "@/core/assistant/engine";
import { buscarKB } from "@/lib/assistant-kb";
import { registrarPergunta, registrarFeedback, sugestoes as mesclarSugestoes, hidratarAprendizado } from "@/lib/assistant-memory";
import { logAcaoIA } from "@/lib/ai-copilot";

type Ctx = Parameters<typeof copilotoFinanceiro>[1];

/* Identidade do botão de IA. O FAB usa o DEGRADÊ OFICIAL da marca — os cinco
   stops do guia (#D0FF00 topo → #F5FF00 base, de cima para baixo). Sobre lima,
   texto e glifo entram em `on-lime` (#11190C): claro sobre lima é ilegível.
   O tile do sparkle segue escuro (contraste dentro do botão) e o restante da
   UI do painel continua na versão flat/escura. */
const GRAD_MARCA = "var(--gradient-marca)";
/** Faixa larga do mesmo degradê + `a4p-onda` = a onda entre as cores. */
const GRAD_ONDA = "var(--gradient-marca-onda)";

/**
 * O "4" da marca — o raio do wordmark all4pay, vetorizado do próprio
 * `public/all4pay-dark.png` (flood fill do glifo + contorno simplificado);
 * o mesmo path vive em `public/all4pay-4.svg`. SVG inline, sem fetch.
 */
const PATH_4 = "M39.3 0L64.32 0.29L34.06 53.95L61.56 54.61L74.5 31.49L98.95 31.97L60.99 99.81L36.06 100L53.38 68.98L1.05 68.6Z";

/**
 * O "4" em degradê lime→verde (tile do FAB). O id do gradiente é único por
 * instância (`useId`) para não colidir com outro `<defs>` na página.
 */
function Marca4({ size = 18 }: { size?: number }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#CFEA00" />
          <stop offset="1" stopColor="#8CC000" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d={PATH_4} />
    </svg>
  );
}

/**
 * A logo da IA — o MESMO "4" da marca girado 90°, em branco sobre o degradê
 * lima. É a marca que identifica o assistente dentro do chat (avatar do
 * cabeçalho, estado vazio e cada resposta).
 */
function MarcaIA({ size = 28, radius = 8 }: { size?: number; radius?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: radius, backgroundImage: GRAD_MARCA }}
      aria-hidden
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 100 100">
        <g transform="rotate(90 50 50)">
          <path fill="#fff" d={PATH_4} />
        </g>
      </svg>
    </span>
  );
}

/**
 * O gráfico da resposta. O motor devolve só os dados (`GraficoResposta`); a
 * escolha visual mora aqui, seguindo o DS: **linha na cor da marca** com glow
 * em degradê (séries temporais) e **barras nas cores semânticas** (entrada
 * verde · saída vermelha). Entra animado via `chartAnim()`.
 */
function GraficoDaResposta({ g }: { g: GraficoResposta }) {
  const id = React.useId();
  // Semântica, mas a 70%: a cor de status é um SINAL no DS, e uma barra cheia
  // saturada dentro de uma bolha pequena vira preenchimento grande.
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

/**
 * As etapas visíveis da análise. Nenhuma resposta é instantânea — mesmo as que
 * o motor nativo calcula em microssegundos passam por aqui, porque ver o
 * trabalho acontecendo é o que faz a resposta parecer (e ser) apurada.
 */
const ETAPAS = [
  "Lendo seus lançamentos",
  "Cruzando com o histórico",
  "Conferindo os números",
  "Redigindo a resposta",
];
/** Ritmo de cada etapa (ms). Soma ~2,1s — o tempo de uma consulta real. */
const RITMO = [560, 640, 540, 400];

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const CURADAS = [
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

interface Turno {
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

export function AssistantWidget() {
  const [open, setOpen] = React.useState(false);
  const [everOpen, setEverOpen] = React.useState(false);
  const abrir = React.useCallback(() => { setOpen(true); setEverOpen(true); }, []);

  React.useEffect(() => {
    const h = () => abrir();
    window.addEventListener("a4p:open-ia", h);
    return () => window.removeEventListener("a4p:open-ia", h);
  }, [abrir]);

  return (
    <>
      {/* FAB — canto inferior direito (sai do menu, vira flutuante) */}
      <button
        onClick={abrir}
        aria-label="Abrir o All 4 Pay AI"
        style={{ backgroundImage: GRAD_ONDA, color: "var(--color-on-lime)" }}
        className={`a4p-ia-fab a4p-onda fixed bottom-5 left-1/2 -translate-x-1/2 z-[75] inline-flex items-center gap-[10px] rounded-pill pl-[12px] pr-[20px] py-[9px] transition-all duration-200 hover:-translate-y-[1px] ${open ? "opacity-0 pointer-events-none translate-y-2" : "opacity-100"}`}
      >
        {/* Tile BRANCO com o "4" da marca — o glifo é a assinatura; o branco
            recorta o botão lima e devolve contraste ao logo. */}
        <span className="w-[30px] h-[30px] rounded-md inline-flex items-center justify-center bg-white">
          <Marca4 size={17} />
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.01em]">All 4 Pay AI</span>
      </button>

      {everOpen && <AssistantPanel open={open} onClose={() => setOpen(false)} />}
    </>
  );
}

function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: input } = useRiscoInput();
  // memoizado pelo input (estável no cache do RQ) — não recomputa a cada tecla.
  const intel = React.useMemo(() => (input ? centroInteligencia(input) : undefined), [input]);
  const ctx = intel?.context as Ctx | undefined;
  const anomalias = intel?.anomalias;
  const insights = intel?.insights;

  const [texto, setTexto] = React.useState("");
  const [turnos, setTurnos] = React.useState<Turno[]>([]);
  const [pensando, setPensando] = React.useState(false);
  const [etapa, setEtapa] = React.useState(0);
  /** A pergunta em voo — aparece na conversa antes da resposta existir. */
  const [pergunta, setPergunta] = React.useState<string | null>(null);

  /**
   * Encena a análise enquanto o trabalho roda: avança as etapas no ritmo de
   * `RITMO` e só entrega quando AMBOS terminam. Para o motor nativo (resposta
   * em microssegundos) manda o ritmo; para o Claude, quem manda é a rede.
   */
  const analisar = React.useCallback(async <T,>(trabalho: Promise<T> | T): Promise<T> => {
    setPensando(true);
    setEtapa(0);
    const cena = (async () => {
      for (let i = 1; i < ETAPAS.length; i++) { await espera(RITMO[i - 1]); setEtapa(i); }
      await espera(RITMO[RITMO.length - 1]);
    })();
    try {
      const [r] = await Promise.all([Promise.resolve(trabalho), cena]);
      return r;
    } finally { setPensando(false); }
  }, []);
  const [copiedId, setCopiedId] = React.useState<number | null>(null);
  const copiar = (t: Turno) => {
    const txt = [t.resposta, ...(t.numeros?.map((n) => `${n.label}: ${n.valor}`) ?? [])].filter(Boolean).join("\n");
    try { navigator.clipboard?.writeText(txt); setCopiedId(t.id); setTimeout(() => setCopiedId((c) => (c === t.id ? null : c)), 1500); } catch { /* ignore */ }
  };
  const fimRef = React.useRef<HTMLDivElement>(null);
  const idRef = React.useRef(0);
  const [, force] = React.useReducer((x) => x + 1, 0); // re-render p/ sugestões aprendidas
  React.useEffect(() => { void hidratarAprendizado().then(() => force()); }, []); // mescla aprendizado da org (best-effort)

  React.useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turnos, pensando]);

  const sugeridas = mesclarSugestoes(CURADAS, 4);

  const responder = async (qRaw: string) => {
    const q = qRaw.trim();
    if (!q || pensando) return;
    setTexto("");
    registrarPergunta(q);
    const id = ++idRef.current;

    // A pergunta entra na conversa na hora; a resposta vem depois das etapas.
    setPergunta(q);

    // 1) Conceitual → base de conhecimento (sem chave)
    const kb = buscarKB(q);
    if (kb) {
      const turno: Turno = { id, q, resposta: kb.texto, fontes: [`Base: ${kb.titulo}`], fonte: "kb", rota: kb.rota, rotaLabel: kb.titulo };
      await analisar(null);
      setPergunta(null);
      setTurnos((t) => [...t, turno]);
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: kb.texto, status: "lida" });
      force();
      return;
    }

    if (!input) {
      setPergunta(null);
      setTurnos((t) => [...t, { id, q, resposta: "Os dados financeiros ainda estão carregando. Repita a pergunta em instantes.", fonte: "carregando" }]);
      return;
    }

    // 2) Sobre os NÚMEROS → motor NATIVO (resposta factual, offline)
    const local = responderLocal(q, input, ctx);
    if (local) {
      await analisar(null);
      setPergunta(null);
      setTurnos((t) => [...t, { id, q, resposta: local.resposta, numeros: local.numeros, fontes: local.fontes, fonte: "motor", contatoId: local.contatoId, grafico: local.grafico }]);
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: local.resposta, status: "lida" });
      force();
      return;
    }

    // 3) Consultivo/aberto → Claude ancorado (com chave) e fallback determinístico.
    // Os últimos turnos vão junto (memória de conversa → follow-ups funcionam).
    const historico = turnos
      .filter((t) => t.resposta && t.fonte !== "carregando")
      .slice(-4)
      .map((t) => ({ q: t.q, a: t.resposta as string }));
    try {
      const j = await analisar(
        fetch("/api/ai/copiloto", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ pergunta: q, contexto: ctx, anomalias, insights, historico }),
        }).then((r) => r.json()).catch(() => null),
      );
      setPergunta(null);

      let turno: Turno;
      if (j?.ok) {
        turno = { id, q, resposta: j.resposta ?? "(sem resposta)", numeros: Array.isArray(j.numeros) ? j.numeros : [], fontes: Array.isArray(j.fontes) ? j.fontes : [], acao: j.acao ?? null, fonte: "ia" };
      } else if (ctx) {
        const exec: RespostaCopiloto = copilotoFinanceiro(q, ctx);
        turno = { id, q, resposta: exec.resposta, numeros: exec.numeros, fontes: exec.fontes, fonte: "motor" };
      } else {
        turno = { id, q, resposta: "Esta consulta cobre saldo, gastos, receita, contas a receber e a pagar, vencimentos, inadimplência, clientes, runway e saúde financeira. Reformule a pergunta nesses termos.", fonte: "motor" };
      }
      setTurnos((t) => [...t, turno]);
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: turno.resposta ?? "", status: "lida" });
      force();
    } catch {
      setPergunta(null);
      if (ctx) { const exec = copilotoFinanceiro(q, ctx); setTurnos((t) => [...t, { id, q, resposta: exec.resposta, numeros: exec.numeros, fontes: exec.fontes, fonte: "motor" }]); }
      else { setTurnos((t) => [...t, { id, q, resposta: "Não foi possível processar a consulta. Tente novamente.", fonte: "motor" }]); }
    } finally { setPensando(false); setPergunta(null); }
  };

  const darFeedback = (t: Turno, dir: "up" | "down") => {
    registrarFeedback(t.q, dir);
    setTurnos((arr) => arr.map((x) => (x.id === t.id ? { ...x, feedback: dir } : x)));
    force();
  };

  return (
    <>
      {/* backdrop (mobile) */}
      <div onClick={onClose} className={`fixed inset-0 z-[78] bg-black/30 sm:hidden transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`} aria-hidden />

      <aside
        role="dialog" aria-label="all4pay IA"
        data-aberto={open ? "1" : "0"}
        className="a4p-ia a4p-glass fixed top-0 right-0 z-[80] h-full w-full sm:w-[420px] bg-white border-l border-border flex flex-col"
        style={{ boxShadow: "-12px 0 40px rgba(14,19,30,0.12)" }}
      >
        {/* header */}
        <header className="flex items-center gap-2 px-4 h-[60px] border-b border-border-soft shrink-0">
          <MarcaIA size={28} radius={8} />
          <span className="text-[16px] font-semibold text-ink">All 4 Pay AI</span>
          <span className="text-[10px] font-semibold tracking-wide uppercase text-muted bg-surface-2 rounded-pill px-2 py-[2px]">beta</span>
          {turnos.length > 0 && (
            <button onClick={() => setTurnos([])} aria-label="Nova conversa" title="Nova conversa" className="ml-auto w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2 transition-colors">
              <Icon name="edit" size={16} color="currentColor" />
            </button>
          )}
          <button onClick={onClose} aria-label="Fechar" className={`${turnos.length > 0 ? "" : "ml-auto"} w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2 transition-colors`}>
            <Icon name="x" size={18} color="currentColor" />
          </button>
        </header>

        {/* corpo */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {turnos.length === 0 ? (
            <div className="a4p-entra flex-1 flex flex-col items-center justify-center text-center gap-3 py-6">
              <MarcaIA size={56} radius={14} />
              <div>
                <div className="text-[18px] font-semibold text-ink">Pergunte sobre suas finanças</div>
                <div className="text-caption text-muted mt-1">Consulto seus números e as funcionalidades do all4pay — e aprendo com o que você pergunta.</div>
              </div>
            </div>
          ) : (
            turnos.map((t, i) => (
              // Entrada escalonada: cada turno sobe com um atraso próprio, e os
              // últimos não esperam a lista inteira (o teto de 3 evita fila).
              <div key={t.id} className="a4p-entra flex flex-col gap-2" style={{ ["--a4p-atraso" as string]: `${Math.min(i, 3) * 60}ms` }}>
                {/* pergunta (bolha do usuário) */}
                <div data-ia="pergunta" className="self-end max-w-[85%] rounded-card rounded-br-sm bg-ink text-white px-3 py-2 text-[15px]">{t.q}</div>
                {/* resposta */}
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
                    <Link href={t.rota} onClick={onClose} className="inline-flex items-center gap-1 self-start text-caption font-medium text-ink bg-surface-2 hover:bg-surface-3 rounded-pill px-3 py-[6px] transition-colors">
                      Abrir {t.rotaLabel || "no sistema"}
                      <Icon name="arrow-up-right" size={13} color="currentColor" />
                    </Link>
                  )}
                  {t.contatoId && (
                    <button onClick={() => { window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: t.contatoId } })); onClose(); }}
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
                          <button onClick={() => copiar(t)} aria-label="Copiar resposta" className="h-6 px-2 rounded-sm inline-flex items-center hover:bg-surface-2 text-faint hover:text-ink transition-colors">{copiedId === t.id ? "Copiado" : "Copiar"}</button>
                          {t.fonte !== "kb" && <>
                            <button onClick={() => darFeedback(t, "up")} aria-label="Resposta útil" className={`w-6 h-6 rounded-sm inline-flex items-center justify-center hover:bg-surface-2 ${t.feedback === "up" ? "text-positive" : "text-faint"}`}><Icon name="check" size={13} color="currentColor" /></button>
                            <button onClick={() => darFeedback(t, "down")} aria-label="Resposta ruim" className={`w-6 h-6 rounded-sm inline-flex items-center justify-center hover:bg-surface-2 ${t.feedback === "down" ? "text-negative" : "text-faint"}`}><Icon name="minus" size={13} color="currentColor" /></button>
                          </>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* A pergunta em voo entra na conversa antes da resposta existir. */}
          {pergunta && (
            <div className="a4p-entra flex flex-col gap-2">
              <div data-ia="pergunta" className="self-end max-w-[85%] rounded-card rounded-br-sm bg-ink text-white px-3 py-2 text-[15px]">{pergunta}</div>
            </div>
          )}

          {/* Etapas da análise — o trabalho acontecendo, não um spinner mudo. */}
          {pensando && (
            <div className="a4p-entra self-start w-[92%] rounded-card rounded-bl-sm bg-surface-1 px-3 py-[10px] flex flex-col gap-[10px]">
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
                    backgroundImage: "linear-gradient(90deg,var(--color-lime),#8CC000,var(--color-lime))",
                  }}
                />
              </div>
            </div>
          )}

          {/* sugestões (chips) — aprendidas + curadas */}
          <div className="flex flex-col gap-2 mt-auto pt-2">
            {turnos.length === 0 && <span className="text-[11px] font-medium text-faint uppercase tracking-wide">Sugestões</span>}
            <div className="flex flex-wrap gap-2">
              {sugeridas.map((q, i) => (
                <button key={q} data-ia="chip" onClick={() => responder(q)} disabled={pensando}
                  className="a4p-entra text-caption text-ink bg-surface-2 hover:bg-surface-3 rounded-pill px-3 py-[7px] transition-colors text-left disabled:opacity-50"
                  style={{ ["--a4p-atraso" as string]: `${120 + i * 70}ms` }}>{q}</button>
              ))}
            </div>
          </div>
          <div ref={fimRef} />
        </div>

        {/* input */}
        <div className="border-t border-border-soft p-3 shrink-0">
          <div className="flex items-center gap-2 rounded-pill border border-border bg-white pl-4 pr-1 py-1 focus-within:border-ink transition-colors">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") responder(texto); }}
              placeholder="Pergunte sobre suas finanças…"
              className="flex-1 bg-transparent outline-none text-[15px] text-ink placeholder:text-placeholder py-[6px]"
            />
            <button onClick={() => responder(texto)} disabled={pensando || !texto.trim()} aria-label="Enviar"
              className="w-9 h-9 rounded-pill inline-flex items-center justify-center bg-ink text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
              <Icon name="arrow-up" size={16} color="#fff" />
            </button>
          </div>
          <p className="m-0 mt-2 text-center text-[11px] text-faint">A all4pay IA pode cometer erros — confira os valores.</p>
        </div>
      </aside>
    </>
  );
}
