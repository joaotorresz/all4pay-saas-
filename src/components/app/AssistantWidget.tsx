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
import { Icon } from "@/components/ui";
import { copilotoFinanceiro, centroInteligencia } from "@/core/executive";
import type { RespostaCopiloto } from "@/core/executive/types";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { buscarKB } from "@/lib/assistant-kb";
import { registrarPergunta, registrarFeedback, sugestoes as mesclarSugestoes } from "@/lib/assistant-memory";
import { logAcaoIA } from "@/lib/ai-copilot";

type Ctx = Parameters<typeof copilotoFinanceiro>[1];

const CURADAS = [
  "Quanto gastei esse mês?",
  "Qual meu saldo disponível?",
  "Tenho clientes em risco de inadimplência?",
  "Como está meu runway de caixa?",
  "Quais são meus maiores gastos?",
  "O que é margem de contribuição?",
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
        aria-label="Abrir a all4pay IA"
        className={`fixed bottom-5 right-5 z-[75] inline-flex items-center gap-2 rounded-pill bg-ink text-white shadow-popover pl-[14px] pr-[18px] py-[11px] hover:opacity-90 transition-all ${open ? "opacity-0 pointer-events-none translate-y-2" : "opacity-100"}`}
      >
        <span className="w-6 h-6 rounded-pill inline-flex items-center justify-center" style={{ background: "var(--color-lime)" }}>
          <Icon name="sparkles" size={14} color="var(--color-on-lime)" />
        </span>
        <span className="text-label font-medium">Pergunte à IA</span>
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
  const fimRef = React.useRef<HTMLDivElement>(null);
  const idRef = React.useRef(0);
  const [, force] = React.useReducer((x) => x + 1, 0); // re-render p/ sugestões aprendidas

  React.useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turnos, pensando]);

  const sugeridas = mesclarSugestoes(CURADAS, 4);

  const responder = async (qRaw: string) => {
    const q = qRaw.trim();
    if (!q || pensando) return;
    setTexto("");
    registrarPergunta(q);
    const id = ++idRef.current;

    // 1) Conceitual → base de conhecimento (instantâneo, sem chave)
    const kb = buscarKB(q);
    if (kb) {
      const turno: Turno = { id, q, resposta: kb.texto, fontes: [`Base: ${kb.titulo}`], fonte: "kb" };
      setTurnos((t) => [...t, turno]);
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: kb.texto, status: "lida" });
      force();
      return;
    }

    // 2) Sobre os números → IA ancorada (Claude) com fallback determinístico
    if (!ctx) {
      setTurnos((t) => [...t, { id, q, resposta: "Estou carregando seus dados financeiros — tente de novo em 1 segundo.", fonte: "carregando" }]);
      return;
    }
    setPensando(true);
    try {
      const j = await fetch("/api/ai/copiloto", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ pergunta: q, contexto: ctx, anomalias, insights }),
      }).then((r) => r.json()).catch(() => null);

      let turno: Turno;
      if (j?.ok) {
        turno = { id, q, resposta: j.resposta ?? "(sem resposta)", numeros: Array.isArray(j.numeros) ? j.numeros : [], fontes: Array.isArray(j.fontes) ? j.fontes : [], acao: j.acao ?? null, fonte: "ia" };
      } else {
        const exec: RespostaCopiloto = copilotoFinanceiro(q, ctx);
        turno = { id, q, resposta: exec.resposta, numeros: exec.numeros, fontes: exec.fontes, fonte: "motor" };
      }
      setTurnos((t) => [...t, turno]);
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: turno.resposta ?? "", status: "lida" });
      force();
    } catch {
      const exec = copilotoFinanceiro(q, ctx);
      setTurnos((t) => [...t, { id, q, resposta: exec.resposta, numeros: exec.numeros, fontes: exec.fontes, fonte: "motor" }]);
    } finally { setPensando(false); }
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
        className={`fixed top-0 right-0 z-[80] h-full w-full sm:w-[420px] bg-white border-l border-border flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ boxShadow: "-12px 0 40px rgba(14,19,30,0.12)" }}
      >
        {/* header */}
        <header className="flex items-center gap-2 px-4 h-[60px] border-b border-border-soft shrink-0">
          <span className="w-7 h-7 rounded-md inline-flex items-center justify-center" style={{ background: "var(--color-lime)" }}>
            <Icon name="sparkles" size={15} color="var(--color-on-lime)" />
          </span>
          <span className="text-[16px] font-semibold text-ink">all4pay IA</span>
          <span className="text-[10px] font-semibold tracking-wide uppercase text-muted bg-surface-2 rounded-pill px-2 py-[2px]">beta</span>
          <button onClick={onClose} aria-label="Fechar" className="ml-auto w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2 transition-colors">
            <Icon name="x" size={18} color="currentColor" />
          </button>
        </header>

        {/* corpo */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {turnos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-6">
              <span className="w-14 h-14 rounded-card inline-flex items-center justify-center" style={{ background: "var(--color-lime-tint)" }}>
                <Icon name="sparkles" size={26} color="var(--color-positive)" />
              </span>
              <div>
                <div className="text-[18px] font-semibold text-ink">Pergunte sobre suas finanças</div>
                <div className="text-caption text-muted mt-1">Eu entendo seus números e as funcionalidades do all4pay — e aprendo com o que você pergunta.</div>
              </div>
            </div>
          ) : (
            turnos.map((t) => (
              <div key={t.id} className="flex flex-col gap-2">
                {/* pergunta (bolha do usuário) */}
                <div className="self-end max-w-[85%] rounded-card rounded-br-sm bg-ink text-white px-3 py-2 text-[15px]">{t.q}</div>
                {/* resposta */}
                <div className="self-start max-w-[92%] rounded-card rounded-bl-sm bg-surface-1 px-3 py-[10px] flex flex-col gap-2">
                  <p className="m-0 text-[15px] leading-[1.5] text-ink whitespace-pre-wrap">{t.resposta}</p>
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
                  {(t.fontes?.length || t.fonte !== "carregando") && (
                    <div className="flex items-center gap-2 text-[11px] text-faint">
                      {t.fontes && t.fontes.length > 0 && <span className="truncate">Fontes: {t.fontes.join(" · ")}{t.fonte === "ia" ? " · Claude" : ""}</span>}
                      {t.fonte !== "carregando" && t.fonte !== "kb" && (
                        <span className="ml-auto inline-flex items-center gap-1 shrink-0">
                          <button onClick={() => darFeedback(t, "up")} aria-label="Resposta útil" className={`w-6 h-6 rounded-sm inline-flex items-center justify-center hover:bg-surface-2 ${t.feedback === "up" ? "text-positive" : "text-faint"}`}><Icon name="check" size={13} color="currentColor" /></button>
                          <button onClick={() => darFeedback(t, "down")} aria-label="Resposta ruim" className={`w-6 h-6 rounded-sm inline-flex items-center justify-center hover:bg-surface-2 ${t.feedback === "down" ? "text-negative" : "text-faint"}`}><Icon name="minus" size={13} color="currentColor" /></button>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {pensando && <div className="self-start rounded-card bg-surface-1 px-3 py-2 text-caption text-muted">analisando seus dados…</div>}

          {/* sugestões (chips) — aprendidas + curadas */}
          <div className="flex flex-col gap-2 mt-auto pt-2">
            {turnos.length === 0 && <span className="text-[11px] font-medium text-faint uppercase tracking-wide">Sugestões</span>}
            <div className="flex flex-wrap gap-2">
              {sugeridas.map((q) => (
                <button key={q} onClick={() => responder(q)} disabled={pensando} className="text-caption text-ink bg-surface-2 hover:bg-surface-3 rounded-pill px-3 py-[7px] transition-colors text-left">{q}</button>
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
