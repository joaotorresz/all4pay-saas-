"use client";

/**
 * A TELA DA QUATTRO AI — a IA no alto e, embaixo dela, os agentes, cada um
 * com o próprio chat (pedido do dono, 04/11/2026, no estilo dos bots de
 * conversa). Os agentes já vêm criados: cor, ícone e conversa são do sistema.
 *
 * ⚠️ A conversa sobre os números continua num lugar só: "Quattro AI" abre o
 * MESMO chat em tela cheia de sempre (`ChatTelaCheia`). Aqui ela mostra o que
 * espera a pessoa, de todos os agentes, para ninguém precisar abrir chat por
 * chat.
 *
 * ⚠️ Os agentes saíram de Automações: a configuração acontece conversando,
 * no chat de cada um (`ChatAgente`).
 *
 * ⚠️ No computador a lista mora no MENU LATERAL, na seção Conversas (pedido
 * do dono, 04/11/2026): a tela fica só com o chat. No telefone o menu é uma
 * gaveta, então a lista aparece aqui mesmo. As duas leem `useAgentesDoHub`.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui";
import { IDS_AGENTE, descricaoDe, type IdAgente } from "@/core/agentes";
import { loadCompany } from "@/lib/company";
import { AvatarAgente } from "./AvatarAgente";
import { ChatAgente } from "./ChatAgente";
import { ChatTelaCheia } from "./ChatTelaCheia";
import { hrefDoHub, useAgentesDoHub, type SelecaoHub as Selecao } from "./useAgentesDoHub";

function usePrimeiroNome(): string | null {
  const [nome, setNome] = React.useState<string | null>(null);
  React.useEffect(() => {
    const c = loadCompany();
    const bruto = c?.pessoal?.nome || c?.db?.repNome || c?.db?.fantasia || "";
    setNome(String(bruto).trim().split(/\s+/)[0] || null);
  }, []);
  return nome;
}

export function QuattroAIHub({ chegada }: {
  /** Pergunta que chegou pelo endereço (`?q=`/`?widget=`): abre a conversa já com ela. */
  chegada?: { q?: string; n: number } | null;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const nome = usePrimeiroNome();
  const { configs, propostas, pendentes, porAgente, configDe, estadoDe, resumoIA } = useAgentesDoHub();
  const pedida = sp.get("agente");
  const selecao: Selecao | null = pedida && (IDS_AGENTE as readonly string[]).includes(pedida) ? (pedida as IdAgente) : pedida === "quattro-ai" || chegada ? "quattro-ai" : null;
  const ativa: Selecao = selecao ?? "quattro-ai";
  const ir = (s: Selecao | null) => router.replace(hrefDoHub(s), { scroll: false });

  const lista = (
    <nav aria-label="Quattro AI e agentes" className="flex flex-col gap-1 p-3" data-lista-agentes>
      <ItemLista ativo={ativa === "quattro-ai"} onClick={() => ir("quattro-ai")}
        avatar={<AvatarAgente agente="quattro-ai" />} titulo="Quattro AI"
        sub={resumoIA}
        destaque={pendentes.length} id="quattro-ai" />
      <p className="m-0 mt-3 mb-1 px-3 text-caption text-faint">Agentes</p>
      {IDS_AGENTE.map((id) => (
        <ItemLista key={id} ativo={ativa === id} onClick={() => ir(id)}
          avatar={<AvatarAgente agente={id} />} titulo={descricaoDe(id).nome} sub={estadoDe(id)} destaque={porAgente(id)} id={id} />
      ))}
    </nav>
  );

  // A Quattro AI abre JÁ como conversa (04/11/2026): o mesmo chat de sempre,
  // embutido na tela, sem cobrir o menu.
  const painel = ativa === "quattro-ai" ? (
    <ChatTelaCheia key={chegada?.n ?? 0} embutido pergunta={chegada?.q} aoFechar={() => ir(null)} />
  ) : configs.isLoading || propostas.isLoading ? (
    <div className="p-6 text-caption text-muted">Carregando…</div>
  ) : configs.error ? (
    <div className="p-6 text-caption text-ink" role="alert">Não foi possível ler os agentes: {(configs.error as Error).message}</div>
  ) : (
    <ChatAgente key={ativa} config={configDe(ativa)!} propostas={propostas.data ?? []} nome={nome} aoVoltar={() => ir(null)} />
  );

  return (
    // O chat ocupa a página inteira, no cinza do sistema, sem cartão por cima
    // (pedido do dono, 04/11/2026): só as pílulas e a caixa de texto são brancas.
    <div className="grid -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 -mb-[calc(96px+var(--a4p-barra-baixo,0px))] h-[calc(100dvh-72px)] lg:h-[calc(100dvh-16px)] min-h-[480px]" data-tela="quattro-ai">
      <div className={`md:hidden overflow-y-auto ${selecao ? "hidden" : ""}`}>{lista}</div>
      <div className={`min-h-0 overflow-hidden ${selecao ? "" : "hidden md:block"}`}>{painel}</div>
    </div>
  );
}

function ItemLista({ ativo, onClick, avatar, titulo, sub, destaque, id }: {
  ativo: boolean; onClick: () => void; avatar: React.ReactNode; titulo: string; sub: string; destaque: number; id: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-current={ativo ? "page" : undefined} data-item={id}
      className={`w-full flex items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors ${ativo ? "bg-surface-2" : "hover:bg-surface-2"}`}>
      {avatar}
      <span className="flex-1 min-w-0">
        <span className="block text-label text-ink truncate">{titulo}</span>
        <span className="block text-caption text-muted truncate">{sub}</span>
      </span>
      {destaque > 0 && (
        <span className="shrink-0 min-w-[22px] h-[22px] px-[6px] rounded-pill bg-ink text-white text-caption flex items-center justify-center tabular-nums" aria-label={`${destaque} para aprovar`}>
          {destaque}
        </span>
      )}
    </button>
  );
}
