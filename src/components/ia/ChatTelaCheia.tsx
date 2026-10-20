"use client";

/**
 * O chat da Quattro AI em TELA CHEIA — a ÚNICA superfície de conversa do
 * sistema (decisão do dono, 14/10/2026). Abre por cima de qualquer tela pelo
 * `ChatGlobal` (menu "Quattro AI", ⌘K e a caixa da Home): logo no alto,
 * "Conversas" e "Fechar chat" à direita, a pergunta num balão à direita, a
 * resposta solta na coluna com os números em cartões e, embaixo, "Veja tudo o
 * que eu faço" com as sugestões, que perguntam na mesma conversa.
 *
 * ⚠️ O botão flutuante "4", o painel lateral e a aba "Conversa" de
 * `/quattro-ai` SAÍRAM — e com eles o histórico, que veio para cá ("Conversas":
 * retomar, apagar, nova conversa). Uma IA (`useChatIA` + `chat-kit`), um lugar.
 *
 * Sobreposto: fecha por Esc e por "Fechar chat", trava a rolagem da página e
 * vai para o `<body>` por portal (um ancestral com `transform` prenderia o
 * `position: fixed`).
 */
import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { BolhaResposta, EtapasAnalise, type Turno } from "./chat-kit";
import { useChatIA } from "./useChatIA";
import { useFala } from "./useFala";
import { OndaDeVoz, TempoDeGravacao } from "./OndaDeVoz";
import { ConfirmarNoChat } from "./ConfirmarNoChat";
import { DigitandoIA, TextoRevelado, duracaoRevelar } from "./conversa";

/** O que vem depois de um texto que surge entra quando ele termina de surgir. */
const depois = (texto: string, extra = 0) =>
  ({ "--a4p-atraso": `${duracaoRevelar(texto) - 200 + extra}ms` } as React.CSSProperties);
import {
  agruparPorRecencia, apagarConversa, getConversa, inscreverConversas, listarConversas, salvarConversa,
  type Conversa,
} from "@/lib/ia-conversas";
import { isDemo } from "@/lib/demo";
import { MARCA_IA } from "@/core/marca";
import { loadCompany } from "@/lib/company";
import { hojeLocal } from "@/lib/aggregations";
import { gravarPreferenciasHome, inscreverPreferenciasHome, lerPreferenciasHome } from "@/lib/home-preferencias";
import { useTipoConta } from "@/components/app/useTipoConta";
import { girarPilulas, pilulaDaPergunta, temaDaPergunta } from "@/core/home/rodizio";
import { CATALOGO_SUGESTOES, type TemaSugestao } from "@/core/home/sugestoes";
import type { PreferenciasHome } from "@/core/home/preferencias";
import type { CaminhoTela } from "@/core/ia/contexto-tela";

/** `texto` é a pergunta que vai para a conversa; `curto` + `icone`, o chip. */
export interface SugestaoChat { id: string; texto: string; curto: string; icone: string; motivo?: string }

/**
 * O MODO AJUSTE ("Ajustar prioridades" da Home, 14/10/2026): a mesma tela de
 * chat, mas a conversa é sobre a HOME. Abre com uma pergunta humanizada, a
 * pessoa responde do jeito dela e a Home se arruma — o chat diz o que mudou e
 * oferece desfazer. Quem decide o que o texto quer dizer é quem abriu
 * (`responder`): o chat só conversa. Estes turnos não vão para o histórico de
 * conversas — não são perguntas sobre os números.
 */
export interface RespostaChatAjuste {
  abertura: string;
  mudancas: string[];
  fecho: string;
  /** Volta a Home a como estava antes deste pedido. Ausente = nada mudou. */
  desfazer?: () => void;
}
export interface AjusteChat {
  /** A pergunta com que a conversa abre. */
  pergunta: string;
  /** Pedidos de exemplo, clicáveis. */
  exemplos: string[];
  responder: (texto: string) => Promise<RespostaChatAjuste>;
}

/**
 * O CONTEXTO DA TELA (botão "Pergunte à Quattro AI" do rodapé, 19/10/2026): a
 * conversa abre no assunto da tela de onde veio, com o que a varredura leu e
 * os caminhos dela (`core/ia/contexto-tela`). Saber e ver falhas perguntam na
 * mesma conversa; adicionar fecha o chat e abre a tela que cria.
 */
export interface TelaChat {
  nome: string;
  abertura: string;
  leitura?: string;
  caminhos: CaminhoTela[];
}

/** Quanto dura a saída (tem de bater com `.a4p-chat-tela[data-saindo]` no CSS). */
const SAIDA_MS = 260;

/**
 * Primeiro nome de quem está logado — a saudação. Vem do perfil salvo no
 * onboarding: o representante (PJ) ou o nome (PF), com o nome fantasia /
 * razão social de reserva. Em `useEffect` porque `localStorage` não existe no
 * servidor.
 */
function usePrimeiroNome(): string | null {
  const [nome, setNome] = React.useState<string | null>(null);
  React.useEffect(() => {
    const c = loadCompany();
    const bruto = c?.pessoal?.nome || c?.db?.repNome || c?.db?.fantasia || c?.db?.razaoSocial || "";
    setNome(String(bruto).trim().split(/\s+/)[0] || null);
  }, []);
  return nome;
}

export function ChatTelaCheia({
  pergunta, sugestoes, aoFechar, aoClicarSugestao, ajuste, tela,
}: {
  /** Aberto pelo botão do rodapé: a conversa começa no assunto da tela. */
  tela?: TelaChat;
  /** Abre no modo ajuste da Home em vez da conversa sobre os números. */
  ajuste?: AjusteChat;
  /** A primeira pergunta — do chip ou do campo da Home. Sem ela, a saudação. */
  pergunta?: string;
  /** "Veja tudo o que eu faço". Sem elas, as sugestões aprendidas da IA. */
  sugestoes?: SugestaoChat[];
  aoFechar: () => void;
  /** Conta o clique (o mesmo peso que o chip da Home soma). */
  aoClicarSugestao?: (id: string) => void;
}) {
  const nome = usePrimeiroNome();
  const conversaRef = React.useRef<string | null>(null);
  const [ativa, setAtiva] = React.useState<string | null>(null);
  const [conversas, setConversas] = React.useState<Conversa[]>([]);
  const [historico, setHistorico] = React.useState(false);
  const recarregar = React.useCallback(() => setConversas(listarConversas()), []);
  // Ouve o histórico: a hidratação do servidor chega DEPOIS da montagem, e sem
  // isto a lista nascia vazia numa máquina nova.
  React.useEffect(() => { recarregar(); return inscreverConversas(recarregar); }, [recarregar]);

  // Cada resposta grava a conversa (cria na primeira, atualiza nas seguintes).
  const aoMudar = React.useCallback((turnos: Turno[]) => {
    const id = salvarConversa(conversaRef.current, turnos);
    if (id !== conversaRef.current) { conversaRef.current = id; setAtiva(id); }
    setConversas(listarConversas());
  }, []);
  const chat = useChatIA({ onMudou: aoMudar });
  // Só a resposta que ACABOU de chegar surge palavra por palavra: uma conversa
  // reaberta do histórico aparece inteira (ninguém espera o texto velho ser
  // "escrito" de novo).
  const [novoId, setNovoId] = React.useState<number | null>(null);
  const esperandoRef = React.useRef(false);
  React.useEffect(() => { if (chat.pergunta) esperandoRef.current = true; }, [chat.pergunta]);
  React.useEffect(() => {
    const ultimo = chat.turnos[chat.turnos.length - 1];
    if (esperandoRef.current && ultimo) { setNovoId(ultimo.id); esperandoRef.current = false; }
  }, [chat.turnos]);
  const [montado, setMontado] = React.useState(false);
  const [saindo, setSaindo] = React.useState(false);
  const rolagemRef = React.useRef<HTMLDivElement>(null);
  const campoRef = React.useRef<HTMLInputElement>(null);
  const arquivoRef = React.useRef<HTMLInputElement>(null);
  // A fala vai ao campo enquanto a pessoa fala e, no fim da frase, à conversa.
  const fala = useFala({
    onParcial: (t) => chat.setTexto(t),
    onFinal: (t) => { if (!chat.pensando) void chat.responder(t); },
  });

  // A primeira pergunta sai sozinha, uma vez (o modo estrito do React monta
  // duas vezes em desenvolvimento) — e só quando os dados chegaram, senão a
  // resposta seria "os dados ainda estão carregando".
  const enviada = React.useRef(false);
  const { pronto, responder, carregar } = chat;
  React.useEffect(() => {
    if (enviada.current || !pronto || !pergunta?.trim()) return;
    enviada.current = true;
    void responder(pergunta);
  }, [pronto, responder, pergunta]);

  const fechar = React.useCallback(() => {
    setSaindo(true);
    window.setTimeout(aoFechar, SAIDA_MS);
  }, [aoFechar]);

  React.useEffect(() => {
    setMontado(true);
    window.setTimeout(() => campoRef.current?.focus(), 50);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", tecla);
    return () => { document.body.style.overflow = antes; window.removeEventListener("keydown", tecla); };
  }, [fechar]);

  // A conversa sobe a ÚLTIMA PERGUNTA para o alto da tela, com a resposta
  // logo abaixo dela — nunca rola até o fim: com "Veja tudo o que eu faço"
  // embaixo, ir ao fim escondia justamente a resposta que acabou de chegar.
  const qtdPerguntas = chat.turnos.length + (chat.pergunta ? 1 : 0);
  React.useEffect(() => {
    const caixa = rolagemRef.current;
    const todas = caixa?.querySelectorAll<HTMLElement>('[data-ia="pergunta"]');
    const ultima = todas?.[todas.length - 1];
    if (!caixa || !ultima || qtdPerguntas < 2) return;
    caixa.scrollTo({ top: ultima.offsetTop - 24, behavior: "smooth" });
  }, [qtdPerguntas]);

  const abrirConversa = (c: Conversa) => {
    conversaRef.current = c.id; setAtiva(c.id);
    // Turnos carregados não são perguntas novas: não giram nem somem pílulas.
    ignorarRef.current = (getConversa(c.id)?.turnos.length ?? 0) > 0;
    carregar(getConversa(c.id)?.turnos ?? []);
    setHistorico(false);
  };
  const novaConversa = () => {
    conversaRef.current = null; setAtiva(null);
    carregar([]);
    setHistorico(false);
    campoRef.current?.focus();
  };
  const apagar = (id: string) => {
    apagarConversa(id);
    if (id === conversaRef.current) { conversaRef.current = null; setAtiva(null); carregar([]); }
    setConversas(listarConversas());
  };
  const grupos = React.useMemo(() => agruparPorRecencia(conversas), [conversas]);

  // "Veja tudo o que eu faço" é um RODÍZIO sobre o catálogo inteiro
  // (`core/home/rodizio`): a pílula respondida some, a lista muda a cada
  // resposta e aprende o assunto que a pessoa mais pergunta. As sugestões de
  // quem abriu (a Home) entram como prioridade do contexto de hoje.
  const { tipo } = useTipoConta();
  const [hoje] = React.useState(hojeLocal);
  const [prefs, setPrefs] = React.useState<PreferenciasHome | null>(null);
  React.useEffect(() => {
    const ler = () => setPrefs(lerPreferenciasHome());
    ler();
    return inscreverPreferenciasHome(ler);
  }, []);
  const [rodada, setRodada] = React.useState(0);
  const [respondidasAgora, setRespondidasAgora] = React.useState<string[]>([]);
  const [anteriores, setAnteriores] = React.useState<string[]>([]);
  const [ultimoTema, setUltimoTema] = React.useState<TemaSugestao | null>(null);
  const prioridade = React.useMemo(() => (sugestoes ?? []).map((s) => s.id), [sugestoes]);
  const chips: SugestaoChat[] = React.useMemo(() => {
    if (!prefs) return [];
    return girarPilulas({
      tipoConta: tipo, hoje, prioridade, rodada, ultimoTema, respondidasAgora, anteriores,
      cliques: prefs.cliques, temas: prefs.temas, interesses: prefs.interesses, respondidas: prefs.respondidas,
    });
    // `prefs` muda a cada resposta gravada; o rodízio só redesenha na rodada,
    // para a lista não trocar de lugar diante de quem está olhando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs === null, tipo, hoje, prioridade, rodada]);
  const chipsRef = React.useRef(chips);
  chipsRef.current = chips;

  // A pílula clicada fica pendente até a RESPOSTA chegar: só então ela some,
  // vai para `respondidas` e o tema conta. Pergunta digitada que é igual à de
  // uma pílula conta como ela; a que não é conta só o tema.
  const clicadaRef = React.useRef<string | null>(null);
  const vistosRef = React.useRef<Set<number>>(new Set());
  const ignorarRef = React.useRef(false);
  React.useEffect(() => {
    const novos = chat.turnos.filter((t) => !vistosRef.current.has(t.id));
    if (!novos.length) return;
    for (const t of novos) vistosRef.current.add(t.id);
    if (ignorarRef.current) { ignorarRef.current = false; return; }
    const t = novos[novos.length - 1];
    if (!t.resposta || t.fonte === "carregando") return;
    const id = clicadaRef.current ?? pilulaDaPergunta(t.q, tipo);
    clicadaRef.current = null;
    const tema = (id && CATALOGO_SUGESTOES.find((c) => c.id === id)?.tema) || temaDaPergunta(t.q);
    const atual = lerPreferenciasHome();
    const novo: PreferenciasHome = {
      ...atual,
      temas: tema ? { ...atual.temas, [tema]: (atual.temas?.[tema] ?? 0) + 1 } : atual.temas,
      respondidas: id ? { ...atual.respondidas, [id]: hoje } : atual.respondidas,
    };
    gravarPreferenciasHome(novo, { adiar: true });
    setPrefs(novo);
    if (id) setRespondidasAgora((r) => (r.includes(id) ? r : [...r, id]));
    setUltimoTema(tema);
    setAnteriores(chipsRef.current.map((c) => c.id));
    setRodada((r) => r + 1);
  }, [chat.turnos, tipo, hoje]);

  if (!montado) return null;

  const perguntar = (q: string, id?: string) => {
    if (!q.trim() || chat.pensando) return;
    if (id) {
      clicadaRef.current = id;
      // A Home soma o clique com o mesmo peso do chip dela; aberto de outro
      // lugar, o próprio chat soma.
      if (aoClicarSugestao) aoClicarSugestao(id);
      else {
        const atual = lerPreferenciasHome();
        gravarPreferenciasHome({ ...atual, cliques: { ...atual.cliques, [id]: (atual.cliques[id] ?? 0) + 1 } }, { adiar: true });
      }
    }
    void chat.responder(q);
  };
  const vazio = chat.turnos.length === 0 && !chat.pergunta && !chat.pensando;
  const perguntadas = new Set([...chat.turnos.map((t) => t.q), ...(chat.pergunta ? [chat.pergunta] : [])]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conversa com a Quattro AI"
      data-saindo={saindo || undefined}
      className="a4p-chat-tela fixed inset-0 z-[90] flex flex-col"
      style={{ background: "var(--color-surface-1)" }}
    >
      <header className="flex-none flex items-center justify-between gap-3 px-6 md:px-10 pt-8 pb-4">
        {/* A logo leva à Home, como a da barra de cima: o chat cobre a tela
            inteira, e sem isto a única saída era "Fechar chat". */}
        <Link href="/" onClick={fechar} aria-label="Ir para a Home" title="Ir para a Home" className="inline-flex">
          <span role="img" aria-label="Quattro" className="a4p-logo-mono w-[125px] h-[24px]" />
        </Link>
        <div className="flex items-center gap-2">
          {!ajuste && <button
            type="button"
            onClick={() => setHistorico((h) => !h)}
            aria-expanded={historico}
            aria-controls="a4p-chat-conversas"
            className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] a4p-pilula"
          >
            <Icon name="menu" size={16} strokeWidth={1.5} />
            Conversas
          </button>}
          <button
            type="button"
            onClick={fechar}
            className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] a4p-pilula"
          >
            <Icon name="x" size={16} strokeWidth={1.5} />
            Fechar chat
          </button>
        </div>
      </header>

      {ajuste ? (
        <ConversaDeAjuste ajuste={ajuste} nome={nome} campoRef={campoRef} aoVerHome={fechar} />
      ) : (<>
      <div className="relative flex-1 min-h-0 flex">
        {historico && (
          <aside
            id="a4p-chat-conversas"
            aria-label="Histórico de conversas"
            data-ia="historico"
            className="a4p-entra absolute md:static inset-y-0 left-0 z-10 w-[min(320px,100%)] flex-none flex flex-col gap-3 ml-0 md:ml-6 mb-6 p-4 rounded-[24px] overflow-y-auto"
            style={{ background: "var(--color-white)" }}
          >
            <button
              type="button"
              onClick={novaConversa}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-pill text-[14px] text-ink"
              style={{ background: "var(--color-surface-1)" }}
            >
              <Icon name="plus" size={15} strokeWidth={1.5} />
              Nova conversa
            </button>
            {grupos.length === 0 ? (
              <p className="m-0 text-[13px] text-muted leading-[1.5] pt-1">
                As conversas que você tiver com a {MARCA_IA} aparecem aqui, agrupadas por data.
              </p>
            ) : (
              grupos.map((g) => (
                <div key={g.label} className="flex flex-col gap-1">
                  <span className="a4p-label text-muted px-1 pt-1">{g.label}</span>
                  {g.conversas.map((c) => (
                    <div
                      key={c.id}
                      className="group flex items-center gap-1 rounded-[12px] px-2 py-[7px]"
                      style={c.id === ativa ? { background: "var(--color-surface-1)" } : undefined}
                    >
                      <button type="button" onClick={() => abrirConversa(c)} className="flex-1 min-w-0 text-left text-[14px] text-ink truncate">
                        {c.titulo}
                      </button>
                      <button
                        type="button"
                        onClick={() => apagar(c.id)}
                        aria-label={`Apagar conversa ${c.titulo}`}
                        className="w-7 h-7 flex-none rounded-pill inline-flex items-center justify-center text-muted hover:text-ink opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <Icon name="trash-2" size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
            {/* ⚠️ O aviso diz a VERDADE do ambiente: em produção o histórico é
                gravado na empresa pelo `store-org`, por pessoa. */}
            <span className="mt-auto pt-2 text-[12px] text-muted leading-[1.4]">
              {isDemo
                ? "Na demonstração, as conversas ficam só neste navegador."
                : "As conversas ficam guardadas na sua conta nesta empresa: acompanham você em outra máquina e não aparecem na lista dos colegas."}
            </span>
          </aside>
        )}

        <div ref={rolagemRef} className="relative flex-1 min-w-0 overflow-y-auto" tabIndex={-1}>
          <div className="mx-auto w-full max-w-[720px] px-5 pt-10 pb-10 flex flex-col gap-8">
            {vazio && !pergunta && (
              <div className="a4p-entra flex flex-col gap-2 pt-6" data-ia="saudacao">
                <h2 className="m-0 text-[28px] text-ink">{nome ? `Olá, ${nome}.` : "Olá."}</h2>
                {tela ? (<>
                  <p className="m-0 text-[18px] text-ink" data-ia="abertura-tela">{tela.abertura}</p>
                  {tela.leitura && <p className="m-0 text-[14px] text-muted">{tela.leitura}</p>}
                </>) : (
                  <p className="m-0 text-[16px] text-muted">Pergunte sobre os seus números, ou escolha um caminho abaixo.</p>
                )}
              </div>
            )}
            {chat.turnos.map((t) => (
              <React.Fragment key={t.id}>
                <Pergunta texto={t.q} />
                <div className="a4p-entra">
                  <BolhaResposta
                    t={t}
                    variante="aberta"
                    animar={t.id === novoId}
                    copia={chat.copia?.id === t.id ? chat.copia.estado : undefined}
                    onCopiar={chat.copiar}
                    onFeedback={chat.darFeedback}
                    onNavegar={fechar}
                  />
                  {t.proposta && (
                    <div className="mt-4">
                      <ConfirmarNoChat
                        pc={t.proposta}
                        onAjustar={(patch) => chat.ajustarProposta(t.id, patch)}
                        onConfirmar={() => void chat.confirmarProposta(t)}
                        onCancelar={() => chat.cancelarProposta(t.id)}
                      />
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}
            {chat.pergunta && <Pergunta texto={chat.pergunta} />}
            {chat.pensando && <EtapasAnalise etapa={chat.etapa} className="self-start" />}

            {tela && <CaminhosDaTela tela={tela} feitas={perguntadas} pensando={chat.pensando} perguntar={perguntar} fechar={fechar} />}

            {chips.length > 0 && (
              <section className="flex flex-col gap-4 pt-6">
                <span className="text-[15px] text-ink">Veja tudo o que eu faço:</span>
                <div className="flex flex-wrap gap-3">
                  {chips.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => perguntar(s.texto, s.id)}
                      disabled={chat.pensando}
                      title={s.motivo ? `${s.texto} · sugerida porque ${s.motivo}` : s.texto}
                      aria-label={s.texto}
                      data-sugestao={s.id}
                      data-ia="chip"
                      className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] a4p-pilula disabled:opacity-50"
                    >
                      <Icon name={s.icone} size={16} strokeWidth={1.5} />
                      {s.curto}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {fala.ouvindo ? (
        <div
          role="group"
          aria-label="Gravando a sua fala"
          className="flex-none mx-auto mb-2 w-[calc(100%-40px)] max-w-[720px] flex flex-col gap-2 px-[10px] pt-3 pb-[10px] rounded-[28px]"
          style={{ background: "var(--color-white)" }}
        >
          <p aria-live="polite" className={`m-0 px-3 text-[15px] leading-[22px] line-clamp-3 ${chat.texto ? "text-ink" : "text-muted"}`}>
            {chat.texto || "Ouvindo… pode falar"}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Cancelar gravação"
              title="Cancelar"
              onClick={fala.cancelar}
              className="w-9 h-9 flex-none rounded-pill flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2"
            >
              <Icon name="x" size={18} strokeWidth={1.5} />
            </button>
            <OndaDeVoz stream={fala.stream} />
            <TempoDeGravacao inicio={fala.inicio} />
            <button
              type="button"
              aria-label="Concluir e enviar"
              title="Concluir e enviar"
              onClick={fala.parar}
              className="w-9 h-9 flex-none rounded-pill flex items-center justify-center"
              style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
            >
              <Icon name="check" size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ) : (
      <form
        onSubmit={(e) => { e.preventDefault(); perguntar(chat.texto); }}
        className="flex-none mx-auto mb-2 w-[calc(100%-40px)] max-w-[720px] h-14 flex items-center gap-3 px-[10px] rounded-[28px]"
        style={{ background: "var(--color-white)" }}
      >
        <input
          ref={arquivoRef}
          type="file"
          accept="image/*,application/pdf,.ofx,.csv,.txt"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && !chat.pensando) void chat.enviarArquivo(f); }}
        />
        <button
          type="button"
          aria-label="Enviar foto ou arquivo (boleto, nota, comprovante)"
          title="Foto ou arquivo: boleto, nota, comprovante"
          disabled={chat.pensando}
          onClick={() => arquivoRef.current?.click()}
          className="w-9 h-9 flex-none rounded-pill flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          <Icon name="paperclip" size={18} strokeWidth={1.5} />
        </button>
        <input
          ref={campoRef}
          value={chat.texto}
          onChange={(e) => chat.setTexto(e.target.value)}
          placeholder="Pergunte à Quattro AI"
          aria-label="Pergunte à Quattro AI"
          className="a4p-ia-campo flex-1 min-w-0 pl-3 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted"
        />
        <button
          type="button"
          aria-label="Falar com a Quattro AI"
          title='Falar: "gastei 100 de gasolina"'
          disabled={chat.pensando}
          onClick={fala.ouvir}
          className="w-9 h-9 flex-none rounded-pill flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          <Icon name="mic" size={18} strokeWidth={1.5} />
        </button>
        <button
          type="submit"
          aria-label="Enviar pergunta"
          disabled={chat.pensando}
          className="w-9 h-9 flex-none rounded-pill flex items-center justify-center disabled:opacity-50"
          style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
        >
          <Icon name="arrow-up" size={18} strokeWidth={1.5} />
        </button>
      </form>
      )}
      {fala.erro && <p role="alert" className="flex-none m-0 mb-1 text-center text-[13px] text-negative">{fala.erro}</p>}
      </>)}
      <p className="flex-none m-0 mb-4 text-center text-[12px] text-muted">{MARCA_IA} pode cometer erros — confira os valores.</p>
    </div>,
    document.body,
  );
}

/** A pergunta de quem usa: balão à direita, como no modelo. */
function Pergunta({ texto }: { texto: string }) {
  return (
    <div
      data-ia="pergunta"
      className="a4p-entra a4p-bolha-usuario self-end max-w-[80%] px-5 py-3 rounded-[24px] text-[15px]"
    >
      {texto}
    </div>
  );
}

interface TurnoAjuste { id: number; q: string; r: RespostaChatAjuste | null; desfeito: boolean }

/**
 * A conversa do modo ajuste. Cada pedido vira um turno com a resposta de quem
 * abriu o chat; só o ÚLTIMO pedido ainda de pé pode ser desfeito — desfazer um
 * do meio devolveria a Home a um arranjo que já não existe.
 */
function ConversaDeAjuste({ ajuste, nome, campoRef, aoVerHome }: {
  ajuste: AjusteChat;
  nome: string | null;
  campoRef: React.RefObject<HTMLInputElement>;
  aoVerHome: () => void;
}) {
  const [turnos, setTurnos] = React.useState<TurnoAjuste[]>([]);
  const [texto, setTexto] = React.useState("");
  const pensando = turnos.some((t) => t.r === null);
  const fimRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turnos]);

  const pedir = async (q: string) => {
    const t = q.trim();
    if (!t || pensando) return;
    setTexto("");
    const id = Date.now();
    setTurnos((ts) => [...ts, { id, q: t, r: null, desfeito: false }]);
    const r = await ajuste.responder(t).catch((): RespostaChatAjuste => ({
      abertura: "Não consegui ajustar a Home agora.", mudancas: [], fecho: "Tente de novo daqui a pouco.",
    }));
    setTurnos((ts) => ts.map((x) => (x.id === id ? { ...x, r } : x)));
  };
  const desfazivel = [...turnos].reverse().find((t) => t.r?.desfazer && !t.desfeito)?.id;
  const desfazer = (t: TurnoAjuste) => {
    t.r?.desfazer?.();
    setTurnos((ts) => ts.map((x) => (x.id === t.id ? { ...x, desfeito: true } : x)));
  };

  return (
    <>
      <div className="relative flex-1 min-h-0 overflow-y-auto" tabIndex={-1}>
        <div className="mx-auto w-full max-w-[720px] px-5 pt-10 pb-10 flex flex-col gap-8">
          <div className="a4p-entra flex flex-col gap-2 pt-6" data-ia="saudacao" data-ajuste="saudacao">
            <h2 className="m-0 text-[28px] text-ink">{nome ? `Oi, ${nome}! Vamos deixar a Home do seu jeito.` : "Oi! Vamos deixar a Home do seu jeito."}</h2>
            <p className="m-0 text-[18px] text-ink">{ajuste.pergunta}</p>
            <p className="m-0 text-[15px] text-muted">Pode responder do seu jeito: eu arrumo a Home enquanto a gente conversa.</p>
          </div>
          {turnos.map((t) => (
            <React.Fragment key={t.id}>
              <Pergunta texto={t.q} />
              {t.r === null ? (
                <DigitandoIA rotulo="Arrumando a sua Home" className="self-start" />
              ) : (
                <div className="a4p-entra self-start flex flex-col gap-3 max-w-[90%]" data-ajuste="resposta">
                  <p className="m-0 text-[16px] text-ink"><TextoRevelado texto={t.desfeito ? "Desfeito: a Home voltou a como estava." : t.r.abertura} /></p>
                  {!t.desfeito && t.r.mudancas.length > 0 && (
                    <ul className="a4p-entra m-0 pl-5 flex flex-col gap-1 text-[15px] text-ink" style={depois(t.r.abertura)}>
                      {t.r.mudancas.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  )}
                  {!t.desfeito && <p className="a4p-entra m-0 text-[15px] text-muted" style={depois(t.r.abertura, 120)}>{t.r.fecho}</p>}
                  {!t.desfeito && t.r.desfazer && (
                    <div className="a4p-entra flex flex-wrap gap-2" style={depois(t.r.abertura, 240)}>
                      <button
                        type="button"
                        onClick={aoVerHome}
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-pill text-[14px]"
                        style={{ background: "var(--color-ink)", color: "var(--color-surface-1)" }}
                      >
                        Ver a Home
                      </button>
                      {t.id === desfazivel && (
                        <button
                          type="button"
                          onClick={() => desfazer(t)}
                          className="inline-flex items-center gap-2 h-10 px-4 rounded-pill text-[14px] a4p-pilula"
                        >
                          <Icon name="rotate-ccw" size={15} strokeWidth={1.5} />
                          Desfazer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
          <section className="flex flex-col gap-4 pt-2">
            <span className="text-[15px] text-ink">{turnos.length ? "Outros pedidos que eu entendo:" : "Por exemplo:"}</span>
            <div className="flex flex-wrap gap-3">
              {ajuste.exemplos.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void pedir(ex)}
                  disabled={pensando}
                  data-ajuste="exemplo"
                  className="inline-flex items-center h-12 px-5 rounded-pill text-[15px] a4p-pilula disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </section>
          <div ref={fimRef} />
        </div>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); void pedir(texto); }}
        className="flex-none mx-auto mb-2 w-[calc(100%-40px)] max-w-[720px] h-14 flex items-center gap-3 px-[10px] rounded-[28px]"
        style={{ background: "var(--color-white)" }}
      >
        <input
          ref={campoRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Diga o que você quer ver primeiro"
          aria-label="O que você quer ver na Home"
          className="a4p-ia-campo flex-1 min-w-0 pl-3 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Enviar pedido"
          disabled={pensando}
          className="w-9 h-9 flex-none rounded-pill flex items-center justify-center disabled:opacity-50"
          style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
        >
          <Icon name="arrow-up" size={18} strokeWidth={1.5} />
        </button>
      </form>
    </>
  );
}

/** Os grupos dos caminhos da tela, na ordem da conversa que o dono descreveu. */
const GRUPOS_TELA: { tipo: CaminhoTela["tipo"]; rotulo: string }[] = [
  { tipo: "saber", rotulo: "Saber" },
  { tipo: "falhas", rotulo: "Ver falhas" },
  { tipo: "adicionar", rotulo: "Adicionar" },
];

/**
 * Os caminhos da tela de onde o chat foi aberto. A pergunta já feita sai da
 * lista (a resposta está logo acima); "Adicionar" é link de verdade, que fecha
 * o chat e abre a tela que cria.
 */
function CaminhosDaTela({ tela, feitas, pensando, perguntar, fechar }: {
  tela: TelaChat;
  feitas: Set<string>;
  pensando: boolean;
  perguntar: (q: string) => void;
  fechar: () => void;
}) {
  const restantes = tela.caminhos.filter((c) => !c.pergunta || !feitas.has(c.pergunta));
  if (!restantes.length) return null;
  return (
    <section className="a4p-entra flex flex-col gap-4 pt-2" data-ia="caminhos-tela" aria-label={`Sobre ${tela.nome}`}>
      {GRUPOS_TELA.map((g) => {
        const itens = restantes.filter((c) => c.tipo === g.tipo);
        if (!itens.length) return null;
        return (
          <div key={g.tipo} className="flex flex-col gap-2">
            <span className="text-[13px] text-muted">{g.rotulo}</span>
            <div className="flex flex-wrap gap-3">
              {itens.map((c) => c.href ? (
                <Link
                  key={c.id}
                  href={c.href}
                  onClick={fechar}
                  data-caminho={c.id}
                  className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] a4p-pilula"
                >
                  <Icon name={c.icone} size={16} strokeWidth={1.5} />
                  {c.curto}
                </Link>
              ) : (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => c.pergunta && perguntar(c.pergunta)}
                  disabled={pensando}
                  title={c.pergunta}
                  aria-label={c.pergunta}
                  data-caminho={c.id}
                  className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] a4p-pilula disabled:opacity-50"
                >
                  <Icon name={c.icone} size={16} strokeWidth={1.5} />
                  {c.curto}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
