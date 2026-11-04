"use client";

/**
 * O CHAT DE UM AGENTE — ele se apresenta, diz o que faz e até onde vai, é
 * configurado conversando e mostra o que espera a aprovação (pedido do dono,
 * 04/11/2026, no estilo dos bots de conversa).
 *
 * ⚠️ A conversa nasce da configuração SALVA toda vez que abre
 * (`core/agentes/conversa`): ela não guarda estado próprio. O que ela grava
 * vai pelo escritor de sempre (`salvarAgente`), e aprovar vai por
 * `decidirProposta` + `executarAprovada`, os mesmos de antes.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BRL, Button, Icon } from "@/components/ui";
import {
  abrirConversaAgente, responderConversaAgente, PERFIS,
  type EstadoConversa, type FalaAgente,
} from "@/core/agentes/conversa";
import { descricaoDe, type ConfigAgente, type PropostaAgente } from "@/core/agentes";
import { decidirProposta, executarAprovada, salvarAgente } from "@/lib/agentes";
import { AvatarAgente } from "./AvatarAgente";

export const CHAVE_AGENTES = ["agentes", "config"] as const;
export const CHAVE_PROPOSTAS = ["agentes", "propostas"] as const;

type Linha = (FalaAgente & { id: number }) | { id: number; de: "fila" };

export function ChatAgente({ config, propostas, nome, aoVoltar }: {
  config: ConfigAgente;
  propostas: PropostaAgente[];
  nome?: string | null;
  aoVoltar?: () => void;
}) {
  const qc = useQueryClient();
  const desc = descricaoDe(config.agente);
  const seq = React.useRef(0);
  const comId = (f: FalaAgente) => ({ ...f, id: ++seq.current });
  const inicio = React.useMemo(() => abrirConversaAgente(config, nome), [config.agente]); // eslint-disable-line react-hooks/exhaustive-deps
  const [linhas, setLinhas] = React.useState<Linha[]>(() => {
    const base: Linha[] = inicio.falas.map(comId);
    return base;
  });
  const [estado, setEstado] = React.useState<EstadoConversa>(inicio.estado);
  const [texto, setTexto] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const rolagem = React.useRef<HTMLDivElement>(null);
  const pendentes = propostas.filter((p) => p.agente === config.agente && p.estado === "pendente");

  React.useEffect(() => {
    rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight, behavior: "smooth" });
  }, [linhas.length]);

  const responder = async (entrada: { opcao?: string; texto?: string }, rotulo: string) => {
    if (ocupado) return;
    const passo = responderConversaAgente(estado, config, entrada);
    setLinhas((ls) => [...ls, comId({ de: "pessoa", texto: rotulo })]);
    setTexto("");
    if (passo.salvar) {
      setOcupado(true);
      try {
        await salvarAgente(passo.salvar);
        await qc.invalidateQueries({ queryKey: CHAVE_AGENTES });
      } catch (e) {
        setLinhas((ls) => [...ls, comId({ de: "agente", texto: `Não consegui salvar: ${(e as Error).message}. Nada mudou.` })]);
        setOcupado(false);
        return;
      }
      setOcupado(false);
    }
    setEstado(passo.estado);
    setLinhas((ls) => [...ls, ...passo.falas.map(comId)]);
  };

  const ultimaPergunta = [...linhas].reverse().find((l): l is FalaAgente & { id: number } => l.de === "agente" && !!(l as FalaAgente).pergunta);

  return (
    <section className="flex flex-col h-full min-h-0" data-chat-agente={config.agente} aria-label={desc.nome}>
      <header className="flex items-center gap-3 px-5 py-4 border-b border-border-soft">
        {aoVoltar && (
          <button type="button" onClick={aoVoltar} aria-label="Voltar à lista" className="md:hidden w-9 h-9 -ml-2 rounded-pill flex items-center justify-center text-ink">
            <Icon name="chevron-left" size={20} />
          </button>
        )}
        <AvatarAgente agente={config.agente} tamanho={36} />
        <div className="min-w-0">
          <h2 className="m-0 text-label text-ink">{desc.nome}</h2>
          <p className="m-0 text-caption text-muted truncate">{desc.missao}</p>
        </div>
      </header>

      <div ref={rolagem} className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] px-5 py-6 flex flex-col gap-3" aria-live="polite">
          {linhas.map((l) => {
            if (l.de === "fila") return null;
            if (l.de === "pessoa") {
              return (
                <div key={l.id} className="a4p-entra self-end a4p-bolha-usuario max-w-[80%] px-5 py-3 rounded-[24px] text-[15px]" data-fala="pessoa">
                  {l.texto}
                </div>
              );
            }
            const ativa = l === ultimaPergunta && !ocupado;
            return (
              <div key={l.id} className="a4p-entra self-start flex flex-col gap-3 w-full max-w-[92%]" data-fala="agente">
                {(l.texto || l.itens) && (
                  <div className="bg-surface-2 rounded-[20px] px-5 py-3 text-[15px] text-ink">
                    {l.texto && <p className="m-0">{l.texto}</p>}
                    {l.itens && (
                      <ul className="m-0 mt-1 pl-5 flex flex-col gap-1 list-disc">
                        {l.itens.map((it) => <li key={it}>{it}</li>)}
                      </ul>
                    )}
                  </div>
                )}
                {l.pergunta && (
                  <CartaoOpcoes pergunta={l.pergunta} ativa={ativa}
                    onEscolher={(o) => void responder({ opcao: o.id }, o.rotulo)} />
                )}
              </div>
            );
          })}

          {pendentes.length > 0 && (
            <div className="self-start flex flex-col gap-3 w-full max-w-[92%]" data-fila-agente>
              <div className="bg-surface-2 rounded-[20px] px-5 py-3 text-[15px] text-ink">
                {pendentes.length === 1 ? "Tenho 1 coisa esperando a sua aprovação." : `Tenho ${pendentes.length} coisas esperando a sua aprovação.`}
              </div>
              {pendentes.map((p) => <CartaoProposta key={p.id} p={p} aoDecidir={(m) => setLinhas((ls) => [...ls, comId({ de: "agente", texto: m })])} />)}
            </div>
          )}
        </div>
      </div>

      <form
        className="px-5 pb-5 pt-2 md:pr-28"
        onSubmit={(e) => { e.preventDefault(); const t = texto.trim(); if (t) void responder({ texto: t }, t); }}
      >
        <div className="mx-auto w-full max-w-[680px] flex items-center gap-2 bg-white rounded-pill pl-5 pr-2 h-[52px] a4p-pilula">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={ultimaPergunta?.pergunta?.livre ?? "Responda ou escreva a letra da opção"}
            aria-label={`Mensagem para o ${desc.nome.toLowerCase()}`}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-ink placeholder:text-placeholder"
            disabled={ocupado}
          />
          <button type="submit" aria-label="Enviar" disabled={!texto.trim() || ocupado}
            className="w-9 h-9 rounded-pill flex items-center justify-center text-white disabled:opacity-40"
            style={{ background: PERFIS[config.agente].cor }}>
            <Icon name="arrow-up" size={18} color="currentColor" />
          </button>
        </div>
      </form>
    </section>
  );
}

/** A pergunta com opções: A, B, C, como um cartão da conversa. */
function CartaoOpcoes({ pergunta, ativa, onEscolher }: {
  pergunta: NonNullable<FalaAgente["pergunta"]>;
  ativa: boolean;
  onEscolher: (o: NonNullable<FalaAgente["pergunta"]>["opcoes"][number]) => void;
}) {
  return (
    <div className="bg-white border border-border-soft rounded-[20px] px-5 py-4 flex flex-col gap-1" data-opcoes>
      <p className="m-0 mb-2 text-label text-ink font-medium">{pergunta.titulo}</p>
      {pergunta.opcoes.map((o, i) => (
        <button key={o.id} type="button" disabled={!ativa} onClick={() => onEscolher(o)} data-opcao={o.id}
          className="flex items-start gap-3 text-left rounded-[12px] px-2 py-2 -mx-2 hover:bg-surface-2 disabled:hover:bg-transparent disabled:opacity-60 transition-colors">
          <span className="w-6 h-6 shrink-0 rounded-[6px] border border-border-soft flex items-center justify-center text-caption text-muted">
            {String.fromCharCode(65 + i)}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] text-ink">{o.rotulo}</span>
            {o.detalhe && <span className="block text-caption text-muted">{o.detalhe}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Uma proposta na conversa: o que ele quer fazer, por quê, quanto, e Aprovar ou Recusar. */
function CartaoProposta({ p, aoDecidir }: { p: PropostaAgente; aoDecidir: (m: string) => void }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const decidir = async (aprovar: boolean) => {
    setOcupado(true); setErro(null);
    try {
      await decidirProposta(p.id, aprovar);
      const m = aprovar && (p.agente === "cobranca" || p.agente === "conciliacao")
        ? `${p.titulo}. ${await executarAprovada(p.id, p.agente)}`
        : `${p.titulo}: ${aprovar ? "aprovada" : "recusada"}.`;
      aoDecidir(m);
      await qc.invalidateQueries({ queryKey: CHAVE_PROPOSTAS });
    } catch (e) {
      setErro((e as Error).message);
    } finally { setOcupado(false); }
  };
  return (
    <div className="bg-white border border-border-soft rounded-[20px] px-5 py-4 flex flex-col gap-3" data-proposta={p.id}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-label text-ink">{p.titulo}</div>
          <p className="m-0 text-caption text-muted">{p.porque}</p>
        </div>
        {p.valor != null && <span className="text-label text-ink shrink-0"><BRL value={p.valor} /></span>}
      </div>
      {erro && <p className="m-0 text-caption text-ink" role="alert">{erro}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={ocupado} onClick={() => decidir(true)}>Aprovar</Button>
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => decidir(false)}>Recusar</Button>
      </div>
    </div>
  );
}
