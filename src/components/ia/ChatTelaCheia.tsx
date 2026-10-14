"use client";

/**
 * O chat da Quattro AI em TELA CHEIA, aberto da caixa da Home (modelo que o
 * dono escolheu em 14/10/2026): clicar numa sugestão ou enviar uma mensagem
 * abre, com animação, a conversa já com aquela pergunta — logo no alto,
 * "Fechar chat" à direita, a pergunta num balão à direita, a resposta solta na
 * coluna com os números em cartões e, embaixo, "Veja tudo o que eu faço" com
 * as sugestões, que perguntam na mesma conversa.
 *
 * ⚠️ É a MESMA IA do painel e da página (`useChatIA` + `chat-kit`): nada de um
 * terceiro chat divergindo. A conversa entra no histórico (`ia-conversas`) e
 * continua em `/quattro-ai`.
 *
 * Sobreposto: fecha por Esc e por "Fechar chat", trava a rolagem da página e
 * vai para o `<body>` por portal (um ancestral com `transform` prenderia o
 * `position: fixed`).
 */
import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { BolhaResposta, EtapasAnalise, type Turno } from "./chat-kit";
import { useChatIA } from "./useChatIA";
import { salvarConversa } from "@/lib/ia-conversas";

/** `texto` é a pergunta que vai para a conversa; `curto` + `icone`, o chip. */
export interface SugestaoChat { id: string; texto: string; curto: string; icone: string; motivo?: string }

/** Quanto dura a saída (tem de bater com `.a4p-chat-tela[data-saindo]` no CSS). */
const SAIDA_MS = 260;

export function ChatTelaCheia({
  pergunta, sugestoes, aoFechar, aoClicarSugestao,
}: {
  /** A primeira pergunta — do chip ou do campo da Home. */
  pergunta: string;
  /** "Veja tudo o que eu faço": as sugestões da Home e as candidatas seguintes. */
  sugestoes: SugestaoChat[];
  aoFechar: () => void;
  /** Conta o clique (o mesmo peso que o chip da Home soma). */
  aoClicarSugestao?: (id: string) => void;
}) {
  const conversaRef = React.useRef<string | null>(null);
  const aoMudar = React.useCallback((turnos: Turno[]) => {
    conversaRef.current = salvarConversa(conversaRef.current, turnos);
  }, []);
  const chat = useChatIA({ onMudou: aoMudar });
  const [montado, setMontado] = React.useState(false);
  const [saindo, setSaindo] = React.useState(false);
  const rolagemRef = React.useRef<HTMLDivElement>(null);
  const campoRef = React.useRef<HTMLInputElement>(null);

  // A primeira pergunta sai sozinha, uma vez (o modo estrito do React monta
  // duas vezes em desenvolvimento) — e só quando os dados chegaram, senão a
  // resposta seria "os dados ainda estão carregando".
  const enviada = React.useRef(false);
  const { pronto, responder } = chat;
  React.useEffect(() => {
    if (enviada.current || !pronto) return;
    enviada.current = true;
    void responder(pergunta);
  }, [pronto, responder, pergunta]);

  const fechar = React.useCallback(() => {
    setSaindo(true);
    window.setTimeout(aoFechar, SAIDA_MS);
  }, [aoFechar]);

  React.useEffect(() => {
    setMontado(true);
    window.setTimeout(() => campoRef.current?.focus(), 50);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", tecla);
    return () => { document.body.style.overflow = antes; window.removeEventListener("keydown", tecla); };
  }, [fechar]);

  // A conversa sobe a ÚLTIMA PERGUNTA para o alto da tela, com a resposta
  // logo abaixo dela — nunca rola até o fim: com "Veja tudo o que eu faço"
  // embaixo, ir ao fim escondia justamente a resposta que acabou de chegar.
  const qtdPerguntas = chat.turnos.length + (chat.pergunta ? 1 : 0);
  React.useEffect(() => {
    const caixa = rolagemRef.current;
    const todas = caixa?.querySelectorAll<HTMLElement>('[data-ia="pergunta"]');
    const ultima = todas?.[todas.length - 1];
    if (!caixa || !ultima || qtdPerguntas < 2) return;
    caixa.scrollTo({ top: ultima.offsetTop - 24, behavior: "smooth" });
  }, [qtdPerguntas]);

  if (!montado) return null;

  const perguntar = (q: string, id?: string) => {
    if (!q.trim() || chat.pensando) return;
    if (id) aoClicarSugestao?.(id);
    void chat.responder(q);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conversa com a Quattro AI"
      data-saindo={saindo || undefined}
      className="a4p-chat-tela fixed inset-0 z-[90] flex flex-col"
      style={{ background: "var(--color-surface-1)" }}
    >
      <header className="flex-none flex items-center justify-between px-6 md:px-10 pt-8 pb-4">
        <span role="img" aria-label="Quattro" className="a4p-logo-mono w-[92px] h-[25px]" />
        <button
          type="button"
          onClick={fechar}
          className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] text-ink"
          style={{ background: "var(--color-white)" }}
        >
          <Icon name="x" size={16} strokeWidth={1.5} />
          Fechar chat
        </button>
      </header>

      <div ref={rolagemRef} className="relative flex-1 min-h-0 overflow-y-auto" tabIndex={-1}>
        <div className="mx-auto w-full max-w-[720px] px-5 pt-10 pb-10 flex flex-col gap-8">
          {chat.turnos.map((t) => (
            <React.Fragment key={t.id}>
              <Pergunta texto={t.q} />
              <div className="a4p-entra">
                <BolhaResposta
                  t={t}
                  variante="aberta"
                  copia={chat.copia?.id === t.id ? chat.copia.estado : undefined}
                  onCopiar={chat.copiar}
                  onFeedback={chat.darFeedback}
                  onNavegar={fechar}
                />
              </div>
            </React.Fragment>
          ))}
          {chat.pergunta && <Pergunta texto={chat.pergunta} />}
          {chat.pensando && <EtapasAnalise etapa={chat.etapa} className="self-start w-full max-w-[420px]" />}

          {sugestoes.length > 0 && (
            <section className="flex flex-col gap-4 pt-6">
              <span className="text-[15px] text-ink">Veja tudo o que eu faço:</span>
              <div className="flex flex-wrap gap-3">
                {sugestoes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => perguntar(s.texto, s.id)}
                    disabled={chat.pensando}
                    title={s.motivo ? `${s.texto} · sugerida porque ${s.motivo}` : s.texto}
                    aria-label={s.texto}
                    data-sugestao={s.id}
                    className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] text-ink disabled:opacity-50"
                    style={{ background: "var(--color-white)" }}
                  >
                    <Icon name={s.icone} size={16} strokeWidth={1.5} />
                    {s.curto}
                  </button>
                ))}
              </div>
            </section>
          )}
          <Link href="/quattro-ai" onClick={fechar} className="self-start text-[13px] text-muted hover:text-ink">
            Abrir o histórico de conversas
          </Link>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); perguntar(chat.texto); }}
        className="flex-none mx-auto mb-6 w-[calc(100%-40px)] max-w-[720px] h-14 flex items-center gap-3 px-[10px] rounded-[28px]"
        style={{ background: "var(--color-white)" }}
      >
        <input
          ref={campoRef}
          value={chat.texto}
          onChange={(e) => chat.setTexto(e.target.value)}
          placeholder="Pergunte à Quattro AI"
          aria-label="Pergunte à Quattro AI"
          className="a4p-ia-campo flex-1 min-w-0 pl-3 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Enviar pergunta"
          disabled={chat.pensando}
          className="w-9 h-9 flex-none rounded-pill flex items-center justify-center disabled:opacity-50"
          style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
        >
          <Icon name="arrow-up" size={18} strokeWidth={1.5} />
        </button>
      </form>
    </div>,
    document.body,
  );
}

/** A pergunta de quem usa: balão à direita, como no modelo. */
function Pergunta({ texto }: { texto: string }) {
  return (
    <div
      data-ia="pergunta"
      className="a4p-entra self-end max-w-[80%] px-5 py-3 rounded-[24px] text-[15px] text-ink"
      style={{ background: "var(--color-white)" }}
    >
      {texto}
    </div>
  );
}
