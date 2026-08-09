"use client";

/**
 * All 4 Pay AI — a PÁGINA inteira (`/all4pay-ai`).
 *
 * A mesma IA do painel flutuante (`useChatIA` + `chat-kit`), num layout de
 * chat completo: coluna de **histórico de conversas** à esquerda (agrupado por
 * recência) e a conversa ao centro, com saudação, sugestões e o campo grande
 * embaixo. Retomar uma conversa recarrega os turnos; "Nova conversa" zera.
 *
 * O histórico vive em `localStorage` (`lib/ia-conversas`) — síncrono e
 * demo-safe: a conversa entra na lista assim que a primeira resposta chega.
 */
import * as React from "react";
import { Icon } from "@/components/ui";
import { MarcaIA, EtapasAnalise, BolhaResposta, type Turno } from "./chat-kit";
import { useChatIA } from "./useChatIA";
import {
  listarConversas, getConversa, salvarConversa, apagarConversa,
  agruparPorRecencia, type Conversa,
} from "@/lib/ia-conversas";
import { loadCompany } from "@/lib/company";

/**
 * Primeiro nome de quem está logado — a saudação do chat. Vem do perfil salvo
 * no onboarding: o representante (PJ) ou o nome (PF), com o nome fantasia /
 * razão social de reserva. Resolvido em `useEffect` porque `localStorage` não
 * existe no servidor (sem isso, hidratação divergente).
 */
function usePrimeiroNome(): string | null {
  const [nome, setNome] = React.useState<string | null>(null);
  React.useEffect(() => {
    const c = loadCompany();
    const bruto = c?.pessoal?.nome || c?.db?.repNome || c?.db?.fantasia || c?.db?.razaoSocial || "";
    const primeiro = String(bruto).trim().split(/\s+/)[0];
    setNome(primeiro || null);
  }, []);
  return nome;
}

export function IAView() {
  const nome = usePrimeiroNome();
  const [conversas, setConversas] = React.useState<Conversa[]>([]);
  const [ativa, setAtiva] = React.useState<string | null>(null);
  const [historicoAberto, setHistoricoAberto] = React.useState(true);
  const ativaRef = React.useRef<string | null>(null);
  ativaRef.current = ativa;

  const recarregar = React.useCallback(() => setConversas(listarConversas()), []);
  React.useEffect(() => { recarregar(); }, [recarregar]);

  // Cada resposta grava a conversa (cria na primeira, atualiza nas seguintes).
  const aoMudar = React.useCallback((turnos: Turno[]) => {
    const id = salvarConversa(ativaRef.current, turnos);
    if (id && id !== ativaRef.current) { ativaRef.current = id; setAtiva(id); }
    setConversas(listarConversas());
  }, []);

  const chat = useChatIA({ onMudou: aoMudar });
  const { texto, setTexto, turnos, pensando, etapa, pergunta, copiedId, copiar, darFeedback, responder, carregar, sugeridas } = chat;

  const fimRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turnos, pensando]);

  const abrir = (c: Conversa) => { setAtiva(c.id); ativaRef.current = c.id; carregar(getConversa(c.id)?.turnos ?? []); };
  const nova = () => { setAtiva(null); ativaRef.current = null; carregar([]); };
  const apagar = (id: string) => {
    apagarConversa(id);
    if (id === ativaRef.current) nova();
    setConversas(listarConversas());
  };

  const grupos = React.useMemo(() => agruparPorRecencia(conversas), [conversas]);
  const vazio = turnos.length === 0 && !pergunta && !pensando;

  return (
    // `a4p-ia` é a MESMA âncora do painel flutuante: tipografia do chat e
    // alvos do Laboratório valem igual nas duas superfícies.
    <div className="a4p-ia flex flex-col md:flex-row gap-5 h-[calc(100vh-140px)] min-h-[520px]">
      {/* ---------- Histórico de conversas ----------
          Em telas pequenas vira uma faixa recolhível no TOPO (não um drawer):
          com `hidden md:flex` o histórico ficava inalcançável no mobile. */}
      {historicoAberto && (
        <aside className="flex w-full md:w-[260px] shrink-0 flex-col gap-3 rounded-card bg-white p-4 overflow-y-auto max-h-[240px] md:max-h-none">
          <div className="flex items-center gap-2">
            <button onClick={nova}
              className="flex-1 inline-flex items-center gap-2 rounded-pill bg-surface-2 hover:bg-surface-3 px-3 py-2 text-[14px] text-ink transition-colors">
              <Icon name="plus" size={15} color="currentColor" />
              Nova conversa
            </button>
            <button onClick={() => setHistoricoAberto(false)} aria-label="Recolher histórico" title="Recolher histórico"
              className="w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2 transition-colors shrink-0">
              <Icon name="chevron-left" size={16} color="currentColor" />
            </button>
          </div>

          {grupos.length === 0 ? (
            <p className="m-0 text-caption text-faint leading-[1.5] pt-2">
              As conversas que você tiver com a IA aparecem aqui, agrupadas por data.
            </p>
          ) : (
            grupos.map((g) => (
              <div key={g.label} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint px-1 pt-1">{g.label}</span>
                {g.conversas.map((c) => (
                  <div key={c.id}
                    className={`group flex items-center gap-1 rounded-md px-2 py-[7px] transition-colors ${c.id === ativa ? "bg-surface-2" : "hover:bg-surface-1"}`}>
                    <button onClick={() => abrir(c)} className="flex-1 min-w-0 text-left text-[14px] text-ink truncate">{c.titulo}</button>
                    <button onClick={() => apagar(c.id)} aria-label={`Apagar conversa ${c.titulo}`}
                      className="w-6 h-6 rounded-sm inline-flex items-center justify-center text-faint hover:text-negative opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                      <Icon name="trash" size={13} color="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
          {/* ⚠️ O aviso diz o que ISSO SIGNIFICA, não só onde o dado está. "Fica neste
              navegador" é uma descrição técnica; o que a pessoa precisa saber é
              que a conversa não a acompanha para outra máquina. */}
          <span className="text-[11px] text-faint mt-auto pt-2 leading-[1.4]">
            As conversas ficam neste navegador — não acompanham você em outra máquina
            nem aparecem para os outros usuários da empresa.
          </span>
        </aside>
      )}

      {/* ---------- Conversa ---------- */}
      <section className="flex-1 min-w-0 flex flex-col rounded-card bg-white overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col gap-4">
          {!historicoAberto && (
            <button onClick={() => setHistoricoAberto(true)}
              className="self-start inline-flex items-center gap-2 rounded-pill bg-surface-2 hover:bg-surface-3 px-3 py-[6px] text-caption text-ink transition-colors">
              <Icon name="clock" size={13} color="currentColor" />
              Histórico
            </button>
          )}

          {vazio ? (
            <div className="a4p-entra flex-1 flex flex-col items-center justify-center text-center gap-4">
              <MarcaIA size={64} radius={16} />
              <div>
                <h2 className="m-0 text-[28px] font-semibold text-ink">
                  {nome ? `Olá, ${nome}` : "Olá"}
                </h2>
                <p className="m-0 mt-1 text-[16px] text-muted">Como posso ajudar hoje?</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-[640px] pt-2">
                {sugeridas.map((q, i) => (
                  <button key={q} data-ia="chip" onClick={() => responder(q)} disabled={pensando}
                    className="a4p-entra text-[14px] text-ink bg-white border border-border hover:bg-surface-1 rounded-pill px-4 py-[10px] transition-colors disabled:opacity-50"
                    style={{ ["--a4p-atraso" as string]: `${120 + i * 70}ms` }}>{q}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[760px] mx-auto flex flex-col gap-4">
              {turnos.map((t, i) => (
                <div key={t.id} className="a4p-entra flex flex-col gap-2" style={{ ["--a4p-atraso" as string]: `${Math.min(i, 3) * 60}ms` }}>
                  <div data-ia="pergunta" className="self-end max-w-[85%] rounded-card rounded-br-sm bg-ink text-white px-3 py-2 text-[15px]">{t.q}</div>
                  <BolhaResposta t={t} copiado={copiedId === t.id} onCopiar={copiar} onFeedback={darFeedback} />
                </div>
              ))}
              {pergunta && (
                <div className="a4p-entra flex flex-col gap-2">
                  <div data-ia="pergunta" className="self-end max-w-[85%] rounded-card rounded-br-sm bg-ink text-white px-3 py-2 text-[15px]">{pergunta}</div>
                </div>
              )}
              {pensando && <EtapasAnalise etapa={etapa} className="self-start w-full max-w-[420px]" />}
            </div>
          )}
          <div ref={fimRef} />
        </div>

        {/* ---------- Campo ---------- */}
        <div className="px-4 sm:px-8 pb-6 pt-2">
          <div className="w-full max-w-[760px] mx-auto">
            <div className="flex items-end gap-2 rounded-card border border-border bg-white px-4 py-3 focus-within:border-ink transition-colors">
              <textarea
                value={texto}
                rows={1}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); responder(texto); } }}
                placeholder="Envie uma mensagem…"
                className="flex-1 bg-transparent outline-none resize-none text-[16px] text-ink placeholder:text-placeholder max-h-[140px] py-1"
              />
              <button onClick={() => responder(texto)} disabled={pensando || !texto.trim()} aria-label="Enviar"
                className="w-9 h-9 rounded-pill inline-flex items-center justify-center bg-ink text-white disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0">
                <Icon name="arrow-up" size={16} color="var(--color-on-lime)" />
              </button>
            </div>
            <p className="m-0 mt-2 text-center text-[11px] text-faint">A all4pay IA pode cometer erros — confira os valores.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
