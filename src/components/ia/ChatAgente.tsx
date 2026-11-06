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
import { useRouter } from "next/navigation";
import { BRL, Button, Icon } from "@/components/ui";
import {
  abrirConversaAgente, responderConversaAgente, PERFIS,
  type EstadoConversa, type FalaAgente,
} from "@/core/agentes/conversa";
import { descricaoDe, type ConfigAgente, type PropostaAgente } from "@/core/agentes";
import { concluirContaPagar, decidirProposta, executarAprovada, salvarAgente } from "@/lib/agentes";
import { abrirCriacao } from "@/components/app/criacao";
import { AvatarAgente } from "./AvatarAgente";
import { useAgenteTrabalhando } from "./estado-agente";
import { DigitandoIA } from "./conversa";
import { useFala } from "./useFala";
import { useAgentesDoHub } from "./useAgentesDoHub";

/** Quanto o agente "digita" antes de cada fala entrar (a pessoa lê no ritmo). */
const tempoDigitando = (f: FalaAgente) =>
  Math.min(1600, 450 + ((f.texto?.length ?? 0) + (f.itens?.join(" ").length ?? 0)) * 6 + (f.pergunta ? 350 : 0));

import { CHAVE_AGENTES, CHAVE_PROPOSTAS } from "./useAgentesDoHub";
export { CHAVE_AGENTES, CHAVE_PROPOSTAS };

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
  // As falas entram UMA A UMA, com o agente "digitando" antes de cada uma
  // (pedido do dono, 04/11/2026): a fila guarda o que ainda vai entrar.
  const [linhas, setLinhas] = React.useState<Linha[]>([]);
  // A conversa abre VAZIA, com a chamada e os cartões de começo (06/11/2026,
  // no modelo de chat com cartões): as falas só entram depois da escolha.
  const [fila, setFila] = React.useState<FalaAgente[]>([]);
  const [aberta] = React.useState(() => new Date());
  React.useEffect(() => {
    if (!fila.length) return;
    const t = window.setTimeout(() => {
      setLinhas((ls) => [...ls, comId(fila[0])]);
      setFila((f) => f.slice(1));
    }, tempoDigitando(fila[0]));
    return () => window.clearTimeout(t);
  }, [fila]); // eslint-disable-line react-hooks/exhaustive-deps
  const digitando = fila.length > 0;
  const fala = useFala({
    onParcial: (t) => setTexto(t),
    onFinal: (t) => { if (t.trim()) void responder({ texto: t.trim() }, t.trim()); },
  });
  const [estado, setEstado] = React.useState<EstadoConversa>(inicio.estado);
  const [texto, setTexto] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  // Digitando ou salvando: o boneco do agente trabalha (menu, lista e chat).
  useAgenteTrabalhando(config.agente, digitando || ocupado);
  const rolagem = React.useRef<HTMLDivElement>(null);
  const pendentes = propostas.filter((p) => p.agente === config.agente && p.estado === "pendente");
  // Contas a pagar: a aprovada só termina quando o cadastro é salvo. Enquanto
  // não for, ela continua na conversa, com o botão para abrir o cadastro.
  const semCadastro = config.agente === "contas_pagar"
    ? propostas.filter((p) => p.agente === "contas_pagar" && p.estado === "aprovada") : [];

  React.useEffect(() => {
    // Vazio, a chamada fica no alto: só rola quando a conversa começa.
    if (linhas.length === 0 && !digitando) return;
    rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight, behavior: "smooth" });
  }, [linhas.length, digitando]);

  const responder = async (entrada: { opcao?: string; texto?: string }, rotulo: string) => {
    if (ocupado || digitando) return;
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
    setFila((f) => [...f, ...passo.falas]);
  };

  /** Um cartão de começo: a escolha vira a fala da pessoa, e o agente responde. */
  const comecar = (c: CartaoComeco) => {
    setLinhas((ls) => [...ls, comId({ de: "pessoa", texto: c.titulo })]);
    setFila(c.falas);
  };
  const vazio = linhas.length === 0 && !digitando;
  const { estadoDe } = useAgentesDoHub();
  const cartoes = cartoesDeComeco(config, inicio.falas, estadoDe(config.agente));

  const ultimaPergunta = [...linhas].reverse().find((l): l is FalaAgente & { id: number } => l.de === "agente" && !!(l as FalaAgente).pergunta);

  return (
    <section className="flex flex-col h-full min-h-0" data-chat-agente={config.agente} aria-label={desc.nome}>
      {/* No alto: o agente à esquerda e o estado dele numa pílula à direita
          (06/11/2026, no modelo de chat com cartões). */}
      <header className="relative flex items-center gap-3 px-5 md:px-6 pt-5 pb-3" data-cabecalho-agente>
        {aoVoltar && (
          <button type="button" onClick={aoVoltar} aria-label="Voltar à lista" className="md:hidden -ml-2 w-9 h-9 rounded-pill flex items-center justify-center text-ink">
            <Icon name="chevron-left" size={20} />
          </button>
        )}
        <AvatarAgente agente={config.agente} tamanho={36} />
        <span className="flex-1 min-w-0" title={desc.missao}>
          <h2 className="a4p-menu-grupo m-0 text-[15px] leading-tight text-ink truncate">{desc.nome}</h2>
          <span className="hidden sm:block text-caption text-muted truncate">Agente da Quattro AI</span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-2 h-9 px-3 sm:px-4 rounded-pill bg-white text-caption text-ink" data-estado-agente>
          <span aria-hidden className="w-2 h-2 rounded-pill" style={{ background: config.ativo && desc.pronto ? PERFIS[config.agente].cor : "var(--color-border)" }} />
          {estadoDe(config.agente)}
          {pendentes.length > 0 && <span className="text-muted tabular-nums">· {pendentes.length} para aprovar</span>}
        </span>
      </header>

      <div ref={rolagem} className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] px-5 pt-6 pb-12 flex flex-col gap-3" aria-live="polite">
          {vazio ? (
            <div className="a4p-entra flex flex-col gap-3 pt-2 md:pt-[14vh]" data-chamada-agente>
              <AvatarAgente agente={config.agente} tamanho={56} />
              <h3 className="a4p-menu-grupo m-0 mt-3 text-[26px] leading-tight sm:text-h1 text-ink">{PERFIS[config.agente].chamada}</h3>
              <p className="m-0 max-w-[460px] text-[15px] text-muted">
                {desc.missao} {desc.nivelMaximo < 3 ? "Nada sai sem a sua aprovação." : "Só faço sozinho até onde você deixar."}
              </p>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3" data-cartoes-comeco>
                {cartoes.map((c) => (
                  <button key={c.id} type="button" onClick={() => comecar(c)} data-comeco={c.id}
                    className="group relative flex flex-col items-start gap-1 text-left bg-white rounded-[20px] p-4 sm:min-h-[128px] transition-transform hover:-translate-y-px">
                    <span className="w-9 h-9 rounded-pill bg-surface-2 flex items-center justify-center text-ink">
                      <Icon name={c.icone} size={16} color="currentColor" />
                    </span>
                    <span className="absolute top-4 right-4 text-muted group-hover:text-ink">
                      <Icon name="arrow-up-right" size={16} color="currentColor" />
                    </span>
                    <span className="mt-2 sm:mt-auto block text-[15px] font-medium text-ink">{c.titulo}</span>
                    <span className="block text-caption text-muted">{c.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="m-0 self-end text-[12px] text-muted" data-hora>
              Hoje {aberta.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {linhas.map((l) => {
            if (l.de === "fila") return null;
            if (l.de === "pessoa") {
              return (
                <div key={l.id} className="a4p-entra self-end a4p-bolha-usuario max-w-[80%] px-5 py-3 rounded-[24px] text-[15px]" data-fala="pessoa">
                  {l.texto}
                </div>
              );
            }
            const ativa = l === ultimaPergunta && !ocupado && !digitando;
            return (
              <div key={l.id} className="a4p-entra self-start flex flex-col gap-3 w-full max-w-[92%]" data-fala="agente">
                {(l.texto || l.itens) && (
                  <div className="bg-white rounded-[20px] px-5 py-3 text-[15px] text-ink">
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

          {digitando && <DigitandoIA rotulo="Digitando" agente={config.agente} className="self-start mt-3" />}

          {!digitando && pendentes.length + semCadastro.length > 0 && (
            <div className="self-start flex flex-col gap-3 w-full max-w-[92%]" data-fila-agente>
              <div className="bg-white rounded-[20px] px-5 py-3 text-[15px] text-ink">
                {pendentes.length === 0
                  ? (semCadastro.length === 1 ? "Falta salvar 1 cadastro que você aprovou." : `Faltam salvar ${semCadastro.length} cadastros que você aprovou.`)
                  : pendentes.length === 1 ? "Tenho 1 coisa esperando a sua aprovação." : `Tenho ${pendentes.length} coisas esperando a sua aprovação.`}
              </div>
              {[...pendentes, ...semCadastro].map((p) => <CartaoProposta key={p.id} p={p} aoDecidir={(m) => setLinhas((ls) => [...ls, comId({ de: "agente", texto: m })])} />)}
            </div>
          )}
        </div>
      </div>

      <form
        className="px-5 pb-5 pt-2 md:pr-28"
        onSubmit={(e) => { e.preventDefault(); const t = texto.trim(); if (t) void responder({ texto: t }, t); }}
      >
        <div className="mx-auto w-full max-w-[680px] flex items-center gap-2 bg-white rounded-pill pl-5 pr-2 h-[52px]">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={ultimaPergunta?.pergunta?.livre ?? (vazio ? `Fale com o ${desc.nome.toLowerCase()}` : "Digite sua resposta ou fale sobre outra coisa")}
            aria-label={`Mensagem para o ${desc.nome.toLowerCase()}`}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-ink placeholder:text-placeholder"
            disabled={ocupado}
          />
          <button type="button" aria-label={fala.ouvindo ? "Parar de ouvir" : "Falar"} aria-pressed={fala.ouvindo}
            onClick={() => (fala.ouvindo ? fala.parar() : fala.ouvir())}
            className="w-9 h-9 rounded-pill flex items-center justify-center text-muted hover:text-ink">
            <Icon name="mic" size={18} color="currentColor" />
          </button>
          <button type="submit" aria-label="Enviar" disabled={!texto.trim() || ocupado || digitando}
            className="w-9 h-9 rounded-pill flex items-center justify-center text-white disabled:opacity-40"
            style={{ background: PERFIS[config.agente].cor }}>
            <Icon name="arrow-up" size={18} color="currentColor" />
          </button>
        </div>
        {fala.erro && <p role="alert" className="m-0 mt-1 text-center text-[13px] text-negative">{fala.erro}</p>}
      </form>
    </section>
  );
}

/** Os três cartões de começo: cada um puxa uma parte da apresentação e termina
 *  na pergunta de configuração (as falas vêm de `abrirConversaAgente`, um
 *  lugar só: 0 oi · 1 o que faço · 2 até onde vou · 3+ estado e pergunta). */
interface CartaoComeco { id: string; icone: string; titulo: string; sub: string; falas: FalaAgente[] }
function cartoesDeComeco(config: ConfigAgente, falas: FalaAgente[], estado: string): CartaoComeco[] {
  const d = descricaoDe(config.agente);
  const resto = falas.slice(3);
  return [
    { id: "faz", icone: PERFIS[config.agente].icone, titulo: "O que eu faço", sub: "Como eu trabalho, passo a passo", falas: [falas[1], ...resto] },
    { id: "limites", icone: "shield-check", titulo: "Até onde eu vou", sub: "O que eu nunca faço sem você", falas: [falas[2], ...resto] },
    { id: "config", icone: "sliders-horizontal", titulo: d.pronto ? "O que eu faço sozinho" : "Quando eu chego",
      sub: d.pronto ? `Hoje: ${estado.toLowerCase()}` : "Ainda estou em construção", falas: resto },
  ];
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
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  // Executando a proposta: o boneco do agente trabalha até ela terminar.
  useAgenteTrabalhando(p.agente, ocupado);
  /**
   * Contas a pagar: aprovar é abrir o cadastro JÁ preenchido, pela porta única
   * (decisão do dono, 04/11/2026). Quem grava a conta é o formulário de
   * sempre; depois de salvo, o banco confere a caixa e fecha a proposta.
   */
  const abrirCadastro = () => {
    const campos = (p.dados?.campos ?? {}) as Record<string, string>;
    abrirCriacao("pagar", {
      parametros: campos,
      aoCriar: () => {
        void concluirContaPagar(p.id)
          .then((m) => aoDecidir(`${p.titulo.replace(/\.$/, "")}. ${m}`))
          .finally(() => void qc.invalidateQueries({ queryKey: CHAVE_PROPOSTAS }));
      },
    });
  };
  const decidir = async (aprovar: boolean) => {
    setOcupado(true); setErro(null);
    try {
      if (p.estado === "aprovada") { abrirCadastro(); return; }
      await decidirProposta(p.id, aprovar);
      if (aprovar && p.agente === "contas_pagar") {
        abrirCadastro();
        aoDecidir(`${p.titulo}: aprovada. Abri o cadastro preenchido para você conferir e salvar.`);
        await qc.invalidateQueries({ queryKey: CHAVE_PROPOSTAS });
        return;
      }
      // Caixa: aprovar é abrir a conta sugerida, na tela de sempre (decisão do
      // dono). O agente não muda nada; o servidor só registra que foi aberta.
      // Fechamento: o mesmo, com a tarefa do checklist no lugar da conta.
      if (aprovar && (p.agente === "caixa" || p.agente === "fechamento")) {
        const href = typeof p.dados?.href === "string" ? p.dados.href : null;
        // Se o registro falhar, a execução diária fecha a aprovada: a conta abre igual.
        await executarAprovada(p.id, p.agente).catch(() => undefined);
        aoDecidir(`${p.titulo.replace(/\.$/, "")}: ${p.agente === "caixa" ? "abri a conta" : "abri a tarefa"} para você.`);
        await qc.invalidateQueries({ queryKey: CHAVE_PROPOSTAS });
        if (href) router.push(href);
        return;
      }
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
        {p.estado === "aprovada" ? (
          <Button size="sm" variant="primary" disabled={ocupado} onClick={() => decidir(true)}>Abrir cadastro</Button>
        ) : (
          <>
            <Button size="sm" variant="primary" disabled={ocupado} onClick={() => decidir(true)}>Aprovar</Button>
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => decidir(false)}>Recusar</Button>
          </>
        )}
      </div>
    </div>
  );
}
