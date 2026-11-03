"use client";

/**
 * O ASSISTENTE ÚNICO — a conversa e os motores, num destino só.
 *
 * ⚠️ Os quatro motores (Risco, Decisão, Saúde, Sugestões) foram abas daqui,
 * depois páginas soltas no menu (27/10/2026), e desde 03/11/2026 são CARTÕES
 * da conversa (`core/assistant/widgets`): a pergunta que pede o motor traz o
 * cartão na resposta. A tela completa de cada um segue no endereço dela, Pro
 * pelo servidor, e o cartão leva até lá.
 *
 * Esta página ABRE o chat (com a pergunta de `?q=`, ou a do motor de
 * `?widget=`, uma vez, limpando o endereço) e, atrás dele, mostra o botão que
 * o reabre e os atalhos dos motores, que perguntam por quem clica.
 */
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ChatTelaCheia } from "./ChatTelaCheia";
import { Icon } from "@/components/ui";
import { WIDGETS_IA, widgetValido, widgetDoCatalogo } from "@/core/assistant/widgets";

export function AssistenteShell() {
  const sp = useSearchParams();
  const [chat, setChat] = React.useState<{ q?: string; n: number } | null>(null);

  // Toda chegada abre o chat — inclusive `/copiloto` e a antiga
  // `aba=conversa`, que caem aqui.
  React.useEffect(() => {
    const w = widgetValido(sp.get("widget"));
    const q = sp.get("q")?.trim() || (w ? widgetDoCatalogo(w).pergunta : undefined);
    if (q) window.history.replaceState(null, "", window.location.pathname);
    // Limpar o endereço muda os parâmetros e roda este efeito de novo, já sem
    // a pergunta: com o chat aberto, essa segunda volta não o reabre vazio.
    setChat((c) => (!q && c ? c : { q, n: (c?.n ?? 0) + 1 }));
  }, [sp]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-3 py-6">
        <p className="text-body text-muted">
          Pergunte sobre o caixa, o resultado e os vencimentos da empresa. A conversa abre por cima de
          qualquer tela.
        </p>
        <button
          type="button"
          onClick={() => setChat((c) => ({ n: (c?.n ?? 0) + 1 }))}
          className="inline-flex items-center gap-2 h-[42px] px-9 min-w-[104px] rounded-pill text-[15px] bg-lime text-on-lime"
        >
          <Icon name="sparkles" size={16} strokeWidth={1.5} />
          Abrir conversa
        </button>
        <nav aria-label="Motores da Quattro AI" className="flex flex-wrap gap-2 pt-2">
          {WIDGETS_IA.map((m) => (
            <button key={m.id} type="button" data-widget={m.id}
              onClick={() => setChat((c) => ({ q: m.pergunta, n: (c?.n ?? 0) + 1 }))}
              className="text-caption font-medium text-ink bg-surface-2 hover:bg-surface-3 rounded-pill px-3 py-[6px] transition-colors">
              {m.titulo}
            </button>
          ))}
        </nav>
      </div>
      {chat && <ChatTelaCheia key={chat.n} pergunta={chat.q} aoFechar={() => setChat(null)} />}
    </div>
  );
}
