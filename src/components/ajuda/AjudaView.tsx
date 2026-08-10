"use client";

/**
 * Central de Ajuda — Chat online · Tours guiados · Anúncios.
 *
 * O chat responde "como se usa", não "quanto tenho": quem responde número é o
 * All 4 Pay AI, e misturar as duas portas faria a pessoa perguntar o saldo aqui
 * e receber um artigo. Por isso ele consulta a MESMA base de conhecimento
 * (`assistant-kb`) e, quando não sabe, oferece o chamado.
 *
 * ⚠️ O aviso "não compartilhe senhas" não é decoração: a mensagem passa por
 * `detectarSegredos` ANTES de sair, e o que vai para o chamado é o texto
 * redigido. Ver `core/ajuda/segredos`.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Button, Icon, Input, Select, Textarea, Switch } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { buscarKB } from "@/lib/assistant-kb";
import {
  detectarSegredos, redigirSegredos, filtrarTours, contarTours, agruparTours,
  statusTour, validarChamado, filtrarAnuncios, naoLidos,
  SUGESTOES, TIPOS_CHAMADO, STATUS_CHAMADO,
  type Tour, type ProgressoTour, type StatusTour, type Chamado,
  type TipoChamado, type MensagemChat, type Anuncio,
  type VisualizacaoAnuncio, type AchadoSegredo,
} from "@/core/ajuda";
import {
  catalogoTours, lerProgressoTours, salvarProgressoTour, reiniciarTours,
  autoTourLigado, setAutoTour, listarChamados, salvarChamado, removerChamado,
  lerConversa, salvarConversa, limparConversa, listarAnuncios, marcarAnuncioLido,
  responderComoFazer, novoIdAjuda,
} from "@/lib/ajuda-store";
import { glossarioPublicado, REGRAS_DE_FORMATO } from "@/core/glossario";
import { JornadaView } from "@/components/comece/Jornada";

const agora = () => new Date().toISOString();
const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtDia = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

type Aba = "chat" | "tours" | "anuncios" | "glossario" | "passos";

export function AjudaView() {
  const params = useSearchParams();
  const inicial = (params.get("aba") as Aba) || "chat";
  const [aba, setAba] = React.useState<Aba>(inicial);
  const [anuncios, setAnuncios] = React.useState<Anuncio[]>([]);
  React.useEffect(() => { setAnuncios(listarAnuncios()); }, []);

  const naoLidas = naoLidos(anuncios);

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-label text-muted max-w-[80ch]">
        Aprenda com tours guiados, tire dúvidas com a IA ou abra um chamado para o suporte.
      </p>

      <div className="flex items-center gap-1 border-b border-border-soft overflow-x-auto">
        {([
          ["chat", "Chat online", "help-circle"],
          ["tours", "Tours guiados", "layers"],
          ["anuncios", "Anúncios", "mail"],
          ["glossario", "Glossário", "file-text"],
          // ⚠️ "Primeiros passos" precisa de uma porta AQUI. A jornada tinha
          // duas moradas declaradas — o menu ⋮ e um cartão na Home —, e o
          // cartão deixou de existir quando a Home virou quatro cards: o
          // `JornadaCard` só era montado no `OverviewGrid`, que ficou órfão.
          // A declaração continuou prometendo uma porta que não abria mais.
          ["passos", "Primeiros passos", "target"],
        ] as const).map(([id, label, icone]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`inline-flex items-center gap-2 px-4 py-3 text-label whitespace-nowrap transition-colors border-b-2 -mb-px ${
              aba === id ? "text-ink border-ink font-medium" : "text-muted border-transparent hover:text-ink"
            }`}
          >
            <Icon name={icone} size={15} color="currentColor" />
            {label}
            {id === "anuncios" && naoLidas > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-pill bg-lime text-on-lime text-caption tabular-nums">
                {naoLidas}
              </span>
            )}
          </button>
        ))}
      </div>

      {aba === "chat" && <ChatAjuda />}
      {aba === "tours" && <ToursGuiados />}
      {aba === "anuncios" && <Anuncios lista={anuncios} setLista={setAnuncios} />}
      {aba === "glossario" && <Glossario />}
      {/* A jornada inteira, aninhada: o `ShellGate` corta o chrome duplicado. */}
      {aba === "passos" && <JornadaView />}
    </div>
  );
}

/* ================================== chat ================================== */

function ChatAjuda() {
  const router = useRouter();
  const { show: toast, node } = useToast();
  const [msgs, setMsgs] = React.useState<MensagemChat[]>([]);
  const [chamados, setChamados] = React.useState<Chamado[]>([]);
  const [texto, setTexto] = React.useState("");
  const [abrindo, setAbrindo] = React.useState(false);
  const fim = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMsgs(lerConversa());
    setChamados(listarChamados());
  }, []);
  React.useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  // Detecção ao VIVO: o aviso aparece enquanto a pessoa digita, não depois de
  // enviar — depois de enviar já é tarde.
  const achados: AchadoSegredo[] = React.useMemo(() => detectarSegredos(texto), [texto]);

  function enviar(pergunta?: string) {
    const cru = (pergunta ?? texto).trim();
    if (!cru) return;
    const encontrados = detectarSegredos(cru);
    const limpo = redigirSegredos(cru, encontrados);

    const doUsuario: MensagemChat = {
      id: novoIdAjuda("m"), autor: "usuario", texto: limpo, quando: agora(),
      redigidos: encontrados.length,
    };
    // Duas camadas, nesta ordem: CONCEITO ("o que é DRE") vem da base de
    // conhecimento; USO ("como emitir uma nota") vem do guia da tela, que é
    // onde o passo a passo já mora. Sem a segunda, quase toda pergunta sugerida
    // caía em "não encontrei".
    const kb = buscarKB(cru);
    const guia = kb ? null : responderComoFazer(cru);
    const resposta: MensagemChat = kb
      ? { id: novoIdAjuda("m"), autor: "ajuda", texto: `${kb.titulo} — ${kb.texto}`, quando: agora(), rota: kb.rota ?? null }
      : guia
      ? { id: novoIdAjuda("m"), autor: "ajuda", texto: guia.texto, quando: agora(), rota: guia.rota }
      : {
          id: novoIdAjuda("m"), autor: "ajuda", quando: agora(), rota: null,
          texto: "Não encontrei isso na base de ajuda. Se for um erro ou uma sugestão, abra um chamado abaixo — assim alguém do suporte olha o caso com o contexto certo.",
        };

    const novas = salvarConversa([...msgs, doUsuario, resposta]);
    setMsgs(novas);
    setTexto("");
    if (encontrados.length > 0) {
      toast(`${encontrados.length} dado sensível removido antes do envio.`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] font-medium tracking-[0.08em] text-faint">
              Chamados e conversas recentes
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => { setMsgs(limparConversa()); toast("Nova conversa."); }}>
                <Icon name="plus" size={15} color="currentColor" />
                Nova conversa
              </Button>
            </div>
          </div>
          {chamados.length === 0 ? (
            <p className="m-0 text-label text-muted">
              Você ainda não tem chamados abertos para esta empresa.
            </p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col">
              {chamados.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3 border-b border-border-soft last:border-0">
                  <span className="flex flex-col min-w-0">
                    <span className="text-label text-ink truncate">{c.assunto}</span>
                    <span className="text-caption text-faint">
                      {TIPOS_CHAMADO.find((t) => t.id === c.tipo)?.label} · aberto em {fmtDia(c.abertoEm)}
                      {c.segredosRemovidos > 0 && ` · ${c.segredosRemovidos} dado sensível removido`}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-caption text-muted">
                      {STATUS_CHAMADO.find((s) => s.id === c.status)?.label}
                    </span>
                    <button
                      onClick={() => { setChamados(removerChamado(c.id)); toast("Chamado removido."); }}
                      aria-label="Remover" title="Remover"
                      className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2 transition-colors"
                    >
                      <Icon name="trash-2" size={14} color="currentColor" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          {msgs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Icon name="sparkles" size={24} color="var(--color-text-tertiary)" />
              <span className="text-h3 font-semibold text-ink">Olá! Em que posso ajudar?</span>
              <span className="text-label text-muted max-w-[60ch]">
                Pergunte sobre como usar o sistema. Se for um bug ou sugestão, abra um chamado.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[440px] overflow-y-auto">
              {msgs.map((m) => (
                <div key={m.id} className={m.autor === "usuario" ? "self-end max-w-[80%]" : "self-start max-w-[80%]"}>
                  <div className={`rounded-md px-4 py-3 ${m.autor === "usuario" ? "bg-ink text-white" : "bg-surface-2 text-ink"}`}>
                    <span className="text-label">{m.texto}</span>
                  </div>
                  {m.redigidos ? (
                    <span className="block mt-1 text-caption text-warning">
                      {m.redigidos} dado sensível removido antes do envio.
                    </span>
                  ) : null}
                  {m.rota && (
                    <button
                      onClick={() => router.push(m.rota!)}
                      className="mt-1 text-caption text-muted hover:text-ink transition-colors"
                    >
                      Abrir tela ↗
                    </button>
                  )}
                </div>
              ))}
              <div ref={fim} />
            </div>
          )}

          {msgs.length === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SUGESTOES.map((s) => (
                <div key={s.categoria} className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium tracking-[0.08em] text-faint">{s.categoria}</span>
                  {s.perguntas.map((q) => (
                    <button
                      key={q} onClick={() => enviar(q)}
                      className="text-left px-4 py-3 rounded-md bg-surface-2/60 hover:bg-surface-2 text-label text-ink transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-3 border-t border-border-soft">
            {achados.length > 0 && (
              <div className="rounded-md px-4 py-3 flex items-start gap-3" style={{ background: "var(--color-surface-2)" }}>
                <Icon name="triangle-alert" size={16} color="var(--color-warning)" />
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="text-label text-ink">
                    {achados.length === 1 ? "Detectamos 1 dado sensível" : `Detectamos ${achados.length} dados sensíveis`} na sua mensagem
                  </span>
                  <span className="text-caption text-muted">
                    {Array.from(new Set(achados.map((a) => a.rotulo))).join(" · ")} — vai ser removido antes do envio.
                    O suporte recebe a dúvida, não o segredo.
                  </span>
                </span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={2}
                placeholder="Escreva sua dúvida…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
                }}
              />
              <Button variant="primary" disabled={!texto.trim()} onClick={() => enviar()}>
                <Icon name="arrow-up-right" size={15} color="currentColor" />
                Enviar
              </Button>
            </div>
            <span className="text-caption text-faint">
              Não compartilhe senhas, tokens ou dados sensíveis no chat — o sistema remove o que
              reconhecer, mas o cuidado é seu.
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-h3 font-semibold text-ink">Abrir um chamado</span>
            <Button variant="ghost" onClick={() => setAbrindo((v) => !v)}>
              {abrindo ? "Cancelar" : "Novo chamado"}
            </Button>
          </div>
          {abrindo && (
            <FormChamado
              onCriar={(c) => { setChamados(salvarChamado(c)); setAbrindo(false); toast("Chamado aberto."); }}
              onCancelar={() => setAbrindo(false)}
            />
          )}
        </div>
      </Card>
      {node}
    </div>
  );
}

function FormChamado({
  onCriar, onCancelar,
}: { onCriar: (c: Chamado) => void; onCancelar: () => void }) {
  const [assunto, setAssunto] = React.useState("");
  const [tipo, setTipo] = React.useState<TipoChamado>("duvida");
  const [descricao, setDescricao] = React.useState("");
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const achados = React.useMemo(() => detectarSegredos(`${assunto} ${descricao}`), [assunto, descricao]);

  function criar() {
    const e = validarChamado({ assunto, descricao });
    setErros(e);
    if (Object.keys(e).length > 0) return;
    // ⚠️ O que é gravado é o texto REDIGIDO — o cru nunca chega ao chamado.
    const nosAssunto = detectarSegredos(assunto);
    const nosCorpo = detectarSegredos(descricao);
    onCriar({
      id: novoIdAjuda("ch"),
      assunto: redigirSegredos(assunto, nosAssunto),
      tipo,
      descricao: redigirSegredos(descricao, nosCorpo),
      status: "aberto",
      abertoEm: hojeISO(),
      segredosRemovidos: nosAssunto.length + nosCorpo.length,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <div className="flex flex-col gap-[6px]">
          <label className="text-label font-medium text-muted">Assunto</label>
          <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} invalid={!!erros.assunto}
            placeholder="Ex.: o extrato importado ficou sem categoria" />
          {erros.assunto && <span className="text-caption text-negative">{erros.assunto}</span>}
        </div>
        <Select label="Tipo" value={tipo} onChange={(v) => setTipo(v as TipoChamado)}
          options={TIPOS_CHAMADO.map((t) => ({ value: t.id, label: t.label }))} />
      </div>
      <div className="flex flex-col gap-[6px]">
        <label className="text-label font-medium text-muted">O que aconteceu</label>
        <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4}
          placeholder="Descreva o passo a passo, o que você esperava e o que apareceu." />
        {erros.descricao
          ? <span className="text-caption text-negative">{erros.descricao}</span>
          : <span className="text-caption text-faint">Quanto mais concreto, menos ida e volta.</span>}
      </div>
      {achados.length > 0 && (
        <span className="text-caption text-warning">
          {achados.length} dado(s) sensível(is) serão removidos antes de gravar:{" "}
          {Array.from(new Set(achados.map((a) => a.rotulo))).join(", ")}.
        </span>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button variant="primary" onClick={criar}>Abrir chamado</Button>
      </div>
    </div>
  );
}

/* ================================== tours ================================== */

const ROTULO_STATUS: Record<StatusTour, string> = {
  nao_iniciado: "Não iniciado", em_andamento: "Em andamento", concluido: "Concluído",
};

function ToursGuiados() {
  const router = useRouter();
  const { show: toast, node } = useToast();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<StatusTour | "todos">("todos");
  const [progresso, setProgresso] = React.useState<Record<string, ProgressoTour>>({});
  const [auto, setAuto] = React.useState(true);
  const [tours, setTours] = React.useState<Tour[]>([]);

  React.useEffect(() => {
    setTours(catalogoTours());
    setProgresso(lerProgressoTours());
    setAuto(autoTourLigado());
  }, []);

  const contagem = contarTours(tours, progresso);
  const lista = filtrarTours(tours, busca, status, progresso);
  const grupos = agruparTours(lista);

  function iniciar(t: Tour) {
    setProgresso(salvarProgressoTour(t.id, { passo: 1, concluido: false }));
    // O tour roda NA TELA — abrir a rota com ?tour=1 faz o PageGuide assumir.
    router.push(t.rota.includes("?") ? `${t.rota}&tour=1` : `${t.rota}?tour=1`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-4">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar tour por nome ou descrição (ex.: conciliação, contas a pagar)…" />
          <div className="flex items-center gap-2 flex-wrap">
            {([
              ["todos", "Todos", contagem.todos],
              ["nao_iniciado", "Não iniciados", contagem.nao_iniciado],
              ["em_andamento", "Em andamento", contagem.em_andamento],
              ["concluido", "Concluídos", contagem.concluido],
            ] as const).map(([id, label, n]) => (
              <button
                key={id} onClick={() => setStatus(id as StatusTour | "todos")}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-pill text-label transition-colors ${
                  status === id ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"
                }`}
              >
                {label}
                <span className="text-caption tabular-nums opacity-70">{n}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-border-soft">
            <span className="flex flex-col">
              <span className="text-label text-ink">Convidar para o tour ao abrir uma tela nova</span>
              <span className="text-caption text-faint max-w-[76ch]">
                Aparece uma vez por tela e no máximo um por sessão — um tour que reaparece deixa de
                ser ajuda e vira obstáculo. É um convite discreto, não um modal por cima do seu clique.
              </span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <Switch checked={auto} onChange={(v) => { setAuto(v); setAutoTour(v); }} label="" />
              <Button variant="ghost" onClick={() => { setProgresso(reiniciarTours()); toast("Progresso dos tours reiniciado."); }}>
                Reiniciar progresso
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {lista.length === 0 ? (
        <Card><p className="m-0 py-10 text-center text-label text-muted">Nenhum tour encontrado.</p></Card>
      ) : (
        grupos.map((g) => (
          <div key={g.secao} className="flex flex-col gap-3">
            <span className="text-[11px] font-medium tracking-[0.08em] text-faint">{g.secao}</span>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {g.tours.map((t) => {
                const st = statusTour(progresso[t.id]);
                return (
                  <Card key={t.id}>
                    <div className="flex flex-col gap-3 h-full">
                      <div className="flex items-start justify-between gap-3">
                        <span className="inline-flex items-center gap-[6px] text-caption text-muted px-2 py-1 rounded-pill bg-surface-2">
                          <span className="w-[7px] h-[7px] rounded-pill" style={{
                            background: st === "concluido" ? "var(--color-positive)"
                              : st === "em_andamento" ? "var(--color-warning)" : "var(--color-placeholder)",
                          }} />
                          {ROTULO_STATUS[st]}
                        </span>
                        <span className="text-caption text-faint tabular-nums shrink-0">{t.passos} passos</span>
                      </div>
                      <span className="text-label font-medium text-ink">{t.titulo}</span>
                      <span className="text-caption text-muted flex-1">{t.descricao}</span>
                      <Button variant="secondary" onClick={() => iniciar(t)}>
                        <Icon name="chevron-right" size={14} color="currentColor" />
                        {st === "nao_iniciado" ? "Iniciar" : st === "em_andamento" ? "Continuar" : "Rever"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
      {node}
    </div>
  );
}

/* ================================ anúncios ================================ */

function Anuncios({
  lista, setLista,
}: { lista: Anuncio[]; setLista: (a: Anuncio[]) => void }) {
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");
  const [visualizacao, setVisualizacao] = React.useState<VisualizacaoAnuncio>("todas");
  const [busca, setBusca] = React.useState("");

  const filtrada = filtrarAnuncios(lista, { de: de || null, ate: ate || null, visualizacao, busca });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Período</label>
            <div className="flex items-center gap-2">
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              <Icon name="chevron-right" size={14} color="var(--color-text-tertiary)" />
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
          </div>
          <Select label="Visualização" value={visualizacao}
            onChange={(v) => setVisualizacao(v as VisualizacaoAnuncio)}
            options={[
              { value: "todas", label: "Todas" },
              { value: "nao_lidas", label: "Não lidas" },
              { value: "lidas", label: "Lidas" },
            ]} />
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Buscar</label>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo título ou conteúdo…" />
          </div>
        </div>
      </Card>

      {filtrada.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="inbox" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted">
              {lista.length === 0 ? "Você ainda não recebeu mensagens." : "Nenhum anúncio no filtro."}
            </p>
          </div>
        </Card>
      ) : (
        filtrada.map((a) => (
          <Card key={a.id}>
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <span className="flex items-center gap-2">
                  {!a.lido && <span className="w-[7px] h-[7px] rounded-pill bg-lime" />}
                  <span className="text-h3 font-semibold text-ink">{a.titulo}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-caption text-faint tabular-nums">{fmtDia(a.publicadoEm)}</span>
                  <span className="text-caption text-muted px-2 py-[2px] rounded-pill bg-surface-2">{a.categoria}</span>
                </span>
              </div>
              <p className="m-0 text-label text-muted max-w-[92ch]">{a.corpo}</p>
              <button
                onClick={() => setLista(marcarAnuncioLido(a.id, !a.lido))}
                className="self-start text-caption text-muted hover:text-ink transition-colors"
              >
                {a.lido ? "Marcar como não lida" : "Marcar como lida"}
              </button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

/**
 * O GLOSSÁRIO PUBLICADO.
 *
 * ⚠️ Um glossário que só existe no código é meia decisão: ele alinha quem
 * escreve a tela e não alinha quem a lê. Publicá-lo aqui faz a escolha ficar
 * conferível — e a coluna "em vez de" é a parte útil, porque a dúvida real do
 * usuário não é "o que é a receber", é "isto é a mesma coisa que recebíveis?".
 */
function Glossario() {
  const termos = glossarioPublicado();
  return (
    <div className="flex flex-col gap-4 max-w-[860px]">
      <Card className="flex flex-col gap-2">
        <span className="text-h3 text-ink">Como chamamos cada coisa</span>
        <p className="m-0 text-caption text-faint max-w-[70ch]">
          Uma palavra por coisa, e a mesma palavra em todas as telas. Quando existir outro
          nome comum para o mesmo conceito, ele está na coluna da direita — é o mesmo objeto,
          com o nome que usamos e o que você talvez conheça de outro sistema.
        </p>
      </Card>
      <Card padded={false}>
        {termos.map((t, i) => (
          <div key={t.termo} className={`flex flex-col gap-1 px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[15px] font-medium text-ink">{t.termo}</span>
              {t.emVezDe.length > 0 && (
                <span className="text-caption text-faint">em vez de: {t.emVezDe.join(", ")}</span>
              )}
            </div>
            <span className="text-caption text-muted">{t.significa}</span>
          </div>
        ))}
      </Card>
      <Card className="flex flex-col gap-2">
        <span className="text-label font-medium text-muted">Como escrevemos os números</span>
        {Object.entries(REGRAS_DE_FORMATO).map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <span className="text-caption text-ink">{v.regra}</span>
            <span className="text-caption text-faint">{v.porque}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
