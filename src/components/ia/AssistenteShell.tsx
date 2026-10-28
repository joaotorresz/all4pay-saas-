"use client";

/**
 * O ASSISTENTE ÚNICO — a conversa e os painéis dos motores, num destino só.
 *
 * ⚠️ Os quatro motores (Risco, Decisão, Saúde, Sugestões) eram abas daqui e
 * viraram PÁGINAS de Inteligência em 27/10/2026 (`/risco`, `/decisao`,
 * `/inteligencia`, `/autonomo`), Pro pelo servidor. Os `?aba=` antigos desta
 * rota respondem 308 para elas (`ALIASES_DE_ABA`).
 *
 * Esta página ABRE o chat (com a pergunta de `?q=`, uma vez, limpando o
 * endereço) e, atrás dele, mostra o botão que o reabre e as portas dos motores.
 */
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ChatTelaCheia } from "./ChatTelaCheia";
import Link from "next/link";
import { Icon } from "@/components/ui";

// Os motores que eram abas daqui: quem chega procurando por eles acha a porta.
const MOTORES = [
  { href: "/risco", rotulo: "Risco de caixa" },
  { href: "/decisao", rotulo: "Decisão" },
  { href: "/inteligencia", rotulo: "Saúde financeira" },
  { href: "/autonomo", rotulo: "Sugestões da IA" },
];

export function AssistenteShell() {
  const sp = useSearchParams();
  const [chat, setChat] = React.useState<{ q?: string; n: number } | null>(null);

  // Toda chegada abre o chat — inclusive `/copiloto` e a antiga
  // `aba=conversa`, que caem aqui.
  React.useEffect(() => {
    const q = sp.get("q")?.trim() || undefined;
    if (q) window.history.replaceState(null, "", window.location.pathname);
    setChat((c) => ({ q, n: (c?.n ?? 0) + 1 }));
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
        <nav aria-label="Motores da Quattro AI" className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-label">
          {MOTORES.map((m) => (
            <Link key={m.href} href={m.href} className="text-muted hover:text-ink">
              {m.rotulo} ↗
            </Link>
          ))}
        </nav>
      </div>
      {chat && <ChatTelaCheia key={chat.n} pergunta={chat.q} aoFechar={() => setChat(null)} />}
    </div>
  );
}
