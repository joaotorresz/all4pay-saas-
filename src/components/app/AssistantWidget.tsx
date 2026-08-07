"use client";

/**
 * all4pay IA — assistente FLUTUANTE global. Um FAB centralizado no rodapé abre
 * um painel de chat à direita, em toda tela.
 *
 * O CÉREBRO e as PEÇAS vivem em `@/components/ia` (`useChatIA` + `chat-kit`) —
 * os mesmos da página inteira `/all4pay-ai`, para as duas superfícies rodarem
 * a MESMA IA. Aqui fica só o que é do painel: o FAB, o drawer e o layout.
 *
 * Junto vai a **ficha de contato 360º** (`ContatoDrawer`), aberta pelo evento
 * `a4p:open-contato` que as respostas disparam.
 */
import * as React from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import {
  Marca4, MarcaIA, EtapasAnalise, BolhaResposta, GRAD_ONDA,
} from "@/components/ia/chat-kit";
import { useChatIA } from "@/components/ia/useChatIA";

export function AssistantWidget() {
  const [open, setOpen] = React.useState(false);
  const [everOpen, setEverOpen] = React.useState(false);
  const abrir = React.useCallback(() => { setOpen(true); setEverOpen(true); }, []);
  // Na tela cheia da IA o FAB é redundante — e ficava por cima do campo de
  // mensagem. O painel segue disponível por evento (⌘K → "Perguntar à IA").
  // ⚠️ O FAB some onde a IA JÁ ESTÁ na tela. Havia TRÊS superfícies de IA
  // disputando o mesmo espaço — o chat de `/all4pay-ai`, as abas do
  // `/copiloto` e este botão flutuante sobreposto a quase todo conteúdo —,
  // e nenhuma resposta para "onde eu falo com a IA". O botão é o atalho de
  // QUALQUER OUTRA tela; dentro das duas casas da IA ele é redundante e
  // ainda cobre o campo de mensagem.
  const rota = usePathname();
  const naTelaDaIA = rota === "/all4pay-ai" || rota.startsWith("/copiloto");

  React.useEffect(() => {
    const h = () => abrir();
    window.addEventListener("a4p:open-ia", h);
    return () => window.removeEventListener("a4p:open-ia", h);
  }, [abrir]);

  if (naTelaDaIA) return null;

  return (
    <>
      {/* FAB — centralizado no rodapé, com o degradê da marca em onda */}
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
  const {
    texto, setTexto, turnos, pensando, etapa, pergunta,
    copiedId, copiar, darFeedback, responder, carregar, sugeridas,
  } = useChatIA();

  const fimRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turnos, pensando]);

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
            <button onClick={() => carregar([])} aria-label="Nova conversa" title="Nova conversa" className="ml-auto w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2 transition-colors">
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
            // Entrada escalonada: cada turno sobe com um atraso próprio, e os
            // últimos não esperam a lista inteira (o teto de 3 evita fila).
            turnos.map((t, i) => (
              <div key={t.id} className="a4p-entra flex flex-col gap-2" style={{ ["--a4p-atraso" as string]: `${Math.min(i, 3) * 60}ms` }}>
                <div data-ia="pergunta" className="self-end max-w-[85%] rounded-card rounded-br-sm bg-ink text-white px-3 py-2 text-[15px]">{t.q}</div>
                <BolhaResposta t={t} copiado={copiedId === t.id} onCopiar={copiar} onFeedback={darFeedback} onNavegar={onClose} />
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
          {pensando && <EtapasAnalise etapa={etapa} className="self-start w-[92%]" />}

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
