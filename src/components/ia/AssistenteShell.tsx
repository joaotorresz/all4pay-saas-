"use client";

/**
 * O ASSISTENTE ÚNICO — a conversa e os painéis dos motores, num destino só.
 *
 * ⚠️ Item 6 do mapa de consolidação. Havia TRÊS superfícies de IA: o chat de
 * `/all4pay-ai`, as quatro abas do `/copiloto` e o botão flutuante. Não existia
 * resposta para "onde eu falo com a IA".
 *
 * A decisão: a **conversa é a porta** — é o que as pessoas procuram. As quatro
 * abas (Quant, Decisão, Risco, Sugestões) são RELATÓRIOS que a conversa deve
 * saber abrir, não um segundo lugar para conversar. Então elas viram painéis
 * AQUI, e `/copiloto` é aposentado.
 *
 * ⚠️ Só a aba ativa monta — os motores são caros e montar os cinco de uma vez
 * faria a tela abrir lenta justamente na porta mais usada.
 */
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { IAView } from "./IAView";
import { QuantView } from "@/components/quant/QuantView";
import { DecisaoView } from "@/components/decisao/DecisaoView";
import { RiscoView } from "@/components/risco/RiscoView";
import { AutonomoView } from "@/components/autonomo/AutonomoView";

type Aba = "conversa" | "quant" | "decisao" | "risco" | "autonomo";

const ABAS: { id: Aba; label: string; descricao: string }[] = [
  { id: "conversa", label: "Conversa", descricao: "pergunte sobre os seus números" },
  { id: "quant", label: "Quant", descricao: "score de saúde, radar e cenários" },
  { id: "decisao", label: "Decisão", descricao: "Monte Carlo e recomendações com impacto" },
  { id: "risco", label: "Risco", descricao: "runway, ruptura e stress de caixa" },
  // ⚠️ Chamava-se "Autônomo" e prometia autonomia que não existe: a aba
  // PROPÕE, e quem age é uma pessoa no card de sugestões. O identificador
  // (`autonomo`) fica — ele é endereço, e mudá-lo quebraria o link antigo e o
  // gate de plano que fecha esta aba pelo par rota+aba.
  { id: "autonomo", label: "Sugestões", descricao: "o que o motor recomenda fazer agora" },
];

const ehAba = (s: string | null): s is Aba => ABAS.some((a) => a.id === s);

export function AssistenteShell() {
  const sp = useSearchParams();
  const [aba, setAba] = React.useState<Aba>("conversa");

  // Deep-link reativo — os aliases de `/copiloto?aba=…` e de `/risco`,
  // `/decisao`, `/autonomo`, `/inteligencia` chegam por aqui.
  React.useEffect(() => {
    const p = sp.get("aba");
    if (ehAba(p)) setAba(p);
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

      {aba === "conversa" && <IAView />}
      {aba === "quant" && <QuantView />}
      {aba === "decisao" && <DecisaoView />}
      {aba === "risco" && <RiscoView />}
      {aba === "autonomo" && <AutonomoView />}
    </div>
  );
}
