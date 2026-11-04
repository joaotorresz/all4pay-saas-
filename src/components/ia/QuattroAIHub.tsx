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
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui";
import { IDS_AGENTE, NIVEIS, descricaoDe, type IdAgente } from "@/core/agentes";
import { listarAgentes, listarPropostas } from "@/lib/agentes";
import { loadCompany } from "@/lib/company";
import { AvatarAgente } from "./AvatarAgente";
import { ChatAgente, CHAVE_AGENTES, CHAVE_PROPOSTAS } from "./ChatAgente";

type Selecao = IdAgente | "quattro-ai";

function usePrimeiroNome(): string | null {
  const [nome, setNome] = React.useState<string | null>(null);
  React.useEffect(() => {
    const c = loadCompany();
    const bruto = c?.pessoal?.nome || c?.db?.repNome || c?.db?.fantasia || "";
    setNome(String(bruto).trim().split(/\s+/)[0] || null);
  }, []);
  return nome;
}

export function QuattroAIHub({ aoPerguntar }: { aoPerguntar: (pergunta?: string) => void }) {
  const sp = useSearchParams();
  const router = useRouter();
  const nome = usePrimeiroNome();
  const configs = useQuery({ queryKey: CHAVE_AGENTES, queryFn: listarAgentes });
  const propostas = useQuery({ queryKey: CHAVE_PROPOSTAS, queryFn: listarPropostas });
  const pedida = sp.get("agente");
  const selecao: Selecao | null = pedida && (IDS_AGENTE as readonly string[]).includes(pedida) ? (pedida as IdAgente) : pedida === "quattro-ai" ? "quattro-ai" : null;
  const ativa: Selecao = selecao ?? "quattro-ai";
  const ir = (s: Selecao | null) => router.replace(s ? `/quattro-ai?agente=${s}` : "/quattro-ai", { scroll: false });

  const pendentes = (propostas.data ?? []).filter((p) => p.estado === "pendente");
  const porAgente = (id: IdAgente) => pendentes.filter((p) => p.agente === id).length;
  const configDe = (id: IdAgente) => configs.data?.find((c) => c.agente === id);

  const estadoDe = (id: IdAgente) => {
    const d = descricaoDe(id);
    const c = configDe(id);
    if (!d.pronto) return "Em construção";
    if (!c?.ativo) return "Desligado";
    return NIVEIS[Math.min(c.nivel, d.nivelMaximo)].nome;
  };

  const lista = (
    <nav aria-label="Quattro AI e agentes" className="flex flex-col gap-1 p-3" data-lista-agentes>
      <ItemLista ativo={ativa === "quattro-ai"} onClick={() => ir("quattro-ai")}
        avatar={<AvatarAgente agente="quattro-ai" />} titulo="Quattro AI"
        sub={pendentes.length ? `${pendentes.length} ${pendentes.length === 1 ? "coisa espera" : "coisas esperam"} você` : "Pergunte sobre os seus números"}
        destaque={pendentes.length} id="quattro-ai" />
      <p className="m-0 mt-3 mb-1 px-3 text-caption text-faint">Agentes</p>
      {IDS_AGENTE.map((id) => (
        <ItemLista key={id} ativo={ativa === id} onClick={() => ir(id)}
          avatar={<AvatarAgente agente={id} />} titulo={descricaoDe(id).nome} sub={estadoDe(id)} destaque={porAgente(id)} id={id} />
      ))}
    </nav>
  );

  const painel = ativa === "quattro-ai" ? (
    <PainelQuattroAI nome={nome} aoPerguntar={aoPerguntar} pendentes={IDS_AGENTE.map((id) => ({ id, n: porAgente(id) })).filter((x) => x.n > 0)}
      abrirAgente={(id) => ir(id)} aoVoltar={() => ir(null)} />
  ) : configs.isLoading || propostas.isLoading ? (
    <div className="p-6 text-caption text-muted">Carregando…</div>
  ) : configs.error ? (
    <div className="p-6 text-caption text-ink" role="alert">Não foi possível ler os agentes: {(configs.error as Error).message}</div>
  ) : (
    <ChatAgente key={ativa} config={configDe(ativa)!} propostas={propostas.data ?? []} nome={nome} aoVoltar={() => ir(null)} />
  );

  return (
    <div className="grid md:grid-cols-[300px_1fr] gap-4 h-[calc(100dvh-300px)] md:h-[calc(100dvh-180px)] min-h-[480px]" data-tela="quattro-ai">
      <div className={`bg-white rounded-[24px] overflow-y-auto ${selecao ? "hidden md:block" : ""}`}>{lista}</div>
      <div className={`bg-white rounded-[24px] min-h-0 overflow-hidden ${selecao ? "" : "hidden md:block"}`}>{painel}</div>
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

function PainelQuattroAI({ nome, aoPerguntar, pendentes, abrirAgente, aoVoltar }: {
  nome: string | null;
  aoPerguntar: (pergunta?: string) => void;
  pendentes: { id: IdAgente; n: number }[];
  abrirAgente: (id: IdAgente) => void;
  aoVoltar: () => void;
}) {
  const [texto, setTexto] = React.useState("");
  return (
    <section className="flex flex-col h-full min-h-0" aria-label="Quattro AI" data-painel="quattro-ai">
      <header className="flex items-center gap-3 px-5 py-4 border-b border-border-soft">
        <button type="button" onClick={aoVoltar} aria-label="Voltar à lista" className="md:hidden w-9 h-9 -ml-2 rounded-pill flex items-center justify-center text-ink">
          <Icon name="chevron-left" size={20} />
        </button>
        <AvatarAgente agente="quattro-ai" tamanho={36} />
        <div className="min-w-0">
          <h2 className="m-0 text-label text-ink">Quattro AI</h2>
          <p className="m-0 text-caption text-muted truncate">Responde sobre os seus números e passa cada tarefa ao agente certo</p>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] px-5 py-6 flex flex-col gap-3">
          <div className="self-start bg-surface-2 rounded-[20px] px-5 py-3 text-[15px] text-ink max-w-[92%]">
            Oi{nome ? `, ${nome}` : ""}! Eu respondo sobre o caixa, o resultado e os vencimentos. Cada tarefa tem um agente,
            e cada um tem o próprio chat aqui do lado.
          </div>
          {pendentes.length > 0 ? (
            <div className="self-start bg-white border border-border-soft rounded-[20px] px-5 py-4 flex flex-col gap-1 w-full max-w-[92%]" data-esperando>
              <p className="m-0 mb-2 text-label text-ink font-medium">Esperando você</p>
              {pendentes.map(({ id, n }) => (
                <button key={id} type="button" onClick={() => abrirAgente(id)}
                  className="flex items-center gap-3 text-left rounded-[12px] px-2 py-2 -mx-2 hover:bg-surface-2 transition-colors">
                  <AvatarAgente agente={id} tamanho={28} />
                  <span className="flex-1 text-[15px] text-ink">{descricaoDe(id).nome}</span>
                  <span className="text-caption text-muted tabular-nums">{n} para aprovar</span>
                  <Icon name="chevron-right" size={16} className="text-faint" />
                </button>
              ))}
            </div>
          ) : (
            <div className="self-start bg-surface-2 rounded-[20px] px-5 py-3 text-[15px] text-ink max-w-[92%]">
              Nada esperando a sua aprovação agora.
            </div>
          )}
        </div>
      </div>
      <form className="px-5 pb-5 pt-2 md:pr-28" onSubmit={(e) => { e.preventDefault(); aoPerguntar(texto.trim() || undefined); setTexto(""); }}>
        <div className="mx-auto w-full max-w-[680px] flex items-center gap-2 bg-white rounded-pill pl-5 pr-2 h-[52px] a4p-pilula">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pergunte à Quattro AI"
            aria-label="Pergunte à Quattro AI"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-ink placeholder:text-placeholder" />
          <button type="submit" aria-label="Perguntar" className="w-9 h-9 rounded-pill flex items-center justify-center bg-ink text-white">
            <Icon name="arrow-up" size={18} color="currentColor" />
          </button>
        </div>
      </form>
    </section>
  );
}
