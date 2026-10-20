"use client";

/**
 * O ASSISTENTE ÚNICO — a conversa e os painéis dos motores, num destino só.
 *
 * ⚠️ Item 6 do mapa de consolidação. Havia TRÊS superfícies de IA: o chat de
 * `/quattro-ai`, as quatro abas do `/copiloto` e o botão flutuante. Não existia
 * resposta para "onde eu falo com a IA".
 *
 * A decisão: a **conversa é a porta** — é o que as pessoas procuram. As quatro
 * abas (Quant, Decisão, Risco, Sugestões) são RELATÓRIOS que a conversa deve
 * saber abrir, não um segundo lugar para conversar. Então elas viram painéis
 * AQUI, e `/copiloto` é aposentado.
 *
 * ⚠️ Só a aba ativa monta — os motores são caros e montar os cinco de uma vez
 * faria a tela abrir lenta justamente na porta mais usada.
 *
 * ⚠️ A CONVERSA SAIU DAS ABAS (14/10/2026): ela é o chat em tela cheia, o
 * mesmo de qualquer tela (`ChatGlobal`). Sem `?aba=`, esta página ABRE o chat
 * (com a pergunta de `?q=`, uma vez, limpando o endereço) e, atrás dele, mostra
 * a porta para os relatórios dos motores — nunca um motor Pro sem aba pedida,
 * senão quem é Simples cairia num relatório que o plano não abre.
 */
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ChatTelaCheia } from "./ChatTelaCheia";
import { Icon } from "@/components/ui";
import { QuantView } from "@/components/quant/QuantView";
import { DecisaoView } from "@/components/decisao/DecisaoView";
import { RiscoView } from "@/components/risco/RiscoView";
import { AutonomoView } from "@/components/autonomo/AutonomoView";

type Aba = "quant" | "decisao" | "risco" | "autonomo";

// Ordem e nome do menu "Análises da IA" (19/10/2026): risco primeiro;
// "Quant" era o nome do motor, a pessoa lê "Saúde".
const ABAS: { id: Aba; label: string; descricao: string }[] = [
  { id: "risco", label: "Risco", descricao: "runway, ruptura e stress de caixa" },
  { id: "decisao", label: "Decisão", descricao: "Monte Carlo e recomendações com impacto" },
  { id: "quant", label: "Saúde", descricao: "score de saúde, radar e cenários" },
  // ⚠️ Chamava-se "Autônomo" e prometia autonomia que não existe: a aba
  // PROPÕE, e quem age é uma pessoa no card de sugestões. O identificador
  // (`autonomo`) fica — ele é endereço, e mudá-lo quebraria o link antigo e o
  // gate de plano que fecha esta aba pelo par rota+aba.
  { id: "autonomo", label: "Sugestões", descricao: "o que o motor recomenda fazer agora" },
];

const ehAba = (s: string | null): s is Aba => ABAS.some((a) => a.id === s);

export function AssistenteShell() {
  const sp = useSearchParams();
  const [aba, setAba] = React.useState<Aba | null>(null);
  const [chat, setChat] = React.useState<{ q?: string; n: number } | null>(null);

  // Deep-link reativo — os aliases de `/copiloto?aba=…` e de `/risco`,
  // `/decisao`, `/autonomo`, `/inteligencia` chegam por aqui. Sem aba (ou com
  // a antiga `aba=conversa`), abre o chat.
  React.useEffect(() => {
    const p = sp.get("aba");
    if (ehAba(p)) { setAba(p); return; }
    setAba(null);
    const q = sp.get("q")?.trim() || undefined;
    if (q) window.history.replaceState(null, "", window.location.pathname);
    setChat((c) => ({ q, n: (c?.n ?? 0) + 1 }));
  }, [sp]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 border-b border-border-soft -mt-1 overflow-x-auto">
        {ABAS.map((a) => {
          const on = aba === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              aria-current={on ? "page" : undefined}
              title={a.descricao}
              className={`relative px-3 py-2 text-label whitespace-nowrap transition-colors ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
            >
              {a.label}
              {on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
            </button>
          );
        })}
      </div>

      {aba === null && (
        <div className="flex flex-col items-start gap-3 py-6">

          <button
            type="button"
            onClick={() => setChat((c) => ({ n: (c?.n ?? 0) + 1 }))}
            className="inline-flex items-center gap-2 h-[42px] px-9 min-w-[104px] rounded-pill text-[15px] bg-lime text-on-lime"
          >
            <Icon name="sparkles" size={16} strokeWidth={1.5} />
            Abrir conversa
          </button>
        </div>
      )}
      {aba === "quant" && <QuantView />}
      {aba === "decisao" && <DecisaoView />}
      {aba === "risco" && <RiscoView />}
      {aba === "autonomo" && <AutonomoView />}
      {chat && <ChatTelaCheia key={chat.n} pergunta={chat.q} aoFechar={() => setChat(null)} />}
    </div>
  );
}
