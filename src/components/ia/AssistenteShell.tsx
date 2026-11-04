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
 * Esta página é a TELA DA QUATTRO AI (04/11/2026): a IA no alto e os agentes
 * embaixo, cada um com o próprio chat (`QuattroAIHub`). Perguntar à Quattro AI
 * abre o MESMO chat em tela cheia de sempre, e a chegada com `?q=` (ou o
 * motor de `?widget=`) abre o chat direto, uma vez, limpando o endereço.
 */
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ChatTelaCheia } from "./ChatTelaCheia";
import { widgetValido, widgetDoCatalogo } from "@/core/assistant/widgets";
import { QuattroAIHub } from "./QuattroAIHub";

export function AssistenteShell() {
  const sp = useSearchParams();
  const [chat, setChat] = React.useState<{ q?: string; n: number } | null>(null);

  // A chegada com uma pergunta (`?q=`, ou o motor de `?widget=`, inclusive
  // `/copiloto` e a antiga `aba=conversa`) abre o chat. Sem pergunta, a tela
  // mostra a Quattro AI e os agentes (04/11/2026).
  React.useEffect(() => {
    const w = widgetValido(sp.get("widget"));
    const q = sp.get("q")?.trim() || (w ? widgetDoCatalogo(w).pergunta : undefined);
    if (!q) return;
    window.history.replaceState(null, "", window.location.pathname);
    setChat((c) => ({ q, n: (c?.n ?? 0) + 1 }));
  }, [sp]);

  return (
    <div className="flex flex-col gap-5">
      <QuattroAIHub aoPerguntar={(q) => setChat((c) => ({ q, n: (c?.n ?? 0) + 1 }))} />
      {chat && <ChatTelaCheia key={chat.n} pergunta={chat.q} aoFechar={() => setChat(null)} />}
    </div>
  );
}
