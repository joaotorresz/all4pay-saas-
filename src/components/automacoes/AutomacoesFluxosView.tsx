"use client";

/**
 * Automações (`/automacoes`) — os fluxos que a empresa monta: QUANDO roda,
 * O QUE conta e PARA QUEM vai, desenhados como cards ligados.
 *
 * ⚠️ A tela não decide nada sobre o fluxo: quem diz se ele está pronto é
 * `validarFluxo` (core/automacoes/fluxo) e quem escreve a mensagem é
 * `mensagemDoFluxo` — a prévia aqui é o MESMO texto que o envio vai mandar.
 * Um fluxo com problema não liga: o interruptor explica o porquê.
 *
 * Os alertas fixos do sistema (resumo diário, lembrete de pagar, régua de
 * cobrança) continuam em Configurações › Automações, a um clique.
 */
import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { AtalhosTela } from "@/components/app/AtalhosTela";
import { AcaoDestrutiva, Button, Card, Icon, Input, Select, Switch } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { CanvasFluxo, tituloDoNo } from "./CanvasFluxo";
import { ConversaFluxo } from "./ConversaFluxo";
import {
  MODELOS_FLUXO, FONTES_FLUXO, NOME_CANAL, NOME_DIA, descreverGatilho,
  validarFluxo, mensagemDoFluxo, ehMensagem, gatilhoDe, fonteDe,
  type Fluxo, type NoFluxo, type DiaSemana, type FonteFluxo,
} from "@/core/automacoes/fluxo";
import { hojeEm } from "@/core/automacoes/tempo";
import type { CanalEnvio } from "@/core/automacoes/tipos";
import { useFluxos, salvarFluxo, removerFluxo, novoIdFluxo, vendasDeExemplo } from "@/lib/automacao-fluxos";

const DIAS: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0];
const SIGLA: Record<DiaSemana, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };

function fluxoEmBranco(): Fluxo {
  return {
    id: novoIdFluxo(),
    nome: "Novo fluxo",
    ativo: false,
    nos: [
      { id: "gatilho", tipo: "gatilho", gatilho: { tipo: "agenda", dias: [1], hora: "08:00" } },
      { id: "dados", tipo: "dados", fonte: "contas_pagar_semana" },
      { id: "envio-whatsapp", tipo: "envio", canal: "whatsapp", destinos: [] },
    ],
    ligacoes: [{ de: "gatilho", para: "dados" }, { de: "dados", para: "envio-whatsapp" }],
  };
}

export function AutomacoesFluxosView() {
  const fluxos = useFluxos();
  const [abertoId, setAbertoId] = React.useState<string | null>(null);
  const aberto = fluxos.find((f) => f.id === abertoId) ?? null;

  const criar = (f: Fluxo) => { salvarFluxo(f); setAbertoId(f.id); };

  // Chegando do chat geral (`/automacoes?pedido=`): a conversa pergunta uma
  // vez e o endereço fica limpo — recarregar não cria o fluxo de novo.
  const [pedido, setPedido] = React.useState<string | null>(null);
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("pedido")?.trim();
    if (p) {
      setPedido(p.slice(0, 500));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <AppShell
      title="Automações"
      actions={!aberto && (
        <Button leftIcon={<Icon name="plus" size={16} color="currentColor" />} onClick={() => criar(fluxoEmBranco())}>
          Novo fluxo
        </Button>
      )}
    >
      <div className="flex flex-col gap-5 pb-8">
        <AtalhosTela atalhos={[{ label: "Alertas do sistema", href: "/configuracoes?aba=automacoes", icon: "bell" }]} />
        {aberto
          ? <EditorFluxo key={aberto.id} fluxo={aberto} onVoltar={() => setAbertoId(null)} />
          : <ListaFluxos fluxos={fluxos} pedido={pedido} onAbrir={setAbertoId} onModelo={(id) => {
              const m = MODELOS_FLUXO.find((x) => x.id === id);
              if (m) criar(m.montar([], novoIdFluxo()));
            }} />}
      </div>
    </AppShell>
  );
}

/* ---------- a lista ---------- */

function ListaFluxos({ fluxos, pedido, onAbrir, onModelo }: {
  fluxos: Fluxo[]; pedido: string | null; onAbrir: (id: string) => void; onModelo: (id: string) => void;
}) {
  return (
    <>
      <ConversaFluxo key={pedido ?? "conversa"} pedidoInicial={pedido} onAbrir={onAbrir} />
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">Seus fluxos</h2>
        {fluxos.length === 0 ? (
          <Card>
            <p className="text-body text-muted">
              Nenhum fluxo ainda. Comece por um modelo abaixo ou monte um do zero em Novo fluxo.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {fluxos.map((f) => {
              const problemas = validarFluxo(f);
              const g = gatilhoDe(f);
              const fonte = fonteDe(f);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onAbrir(f.id)}
                  className="text-left rounded-card bg-white p-5 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-label font-medium text-ink">{f.nome}</span>
                    <span className={"a4p-label shrink-0 " + (f.ativo ? "text-ink" : "text-faint")}>
                      {f.ativo ? "Ligado" : "Desligado"}
                    </span>
                  </div>
                  <p className="text-caption text-muted mt-1">
                    {g ? descreverGatilho(g) : "Sem horário"} · {fonte ? FONTES_FLUXO[fonte].nome : "Sem dados"}
                  </p>
                  {problemas.length > 0 && (
                    <p className="text-caption text-negative mt-2">{problemas[0].motivo}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">Começar por um modelo</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {MODELOS_FLUXO.map((m) => (
            <Card key={m.id}>
              <div className="flex items-center gap-2 mb-2">
                <Icon name="workflow" size={16} color="var(--color-ink)" />
                <span className="text-label font-medium text-ink">{m.nome}</span>
              </div>
              <p className="text-caption text-muted mb-4">{m.descricao}</p>
              <Button variant="secondary" size="sm" onClick={() => onModelo(m.id)}>Usar este modelo</Button>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------- o editor ---------- */

function EditorFluxo({ fluxo, onVoltar }: { fluxo: Fluxo; onVoltar: () => void }) {
  const [rascunho, setRascunho] = React.useState<Fluxo>(fluxo);
  const [selecionado, setSelecionado] = React.useState<string | null>(fluxo.nos[0]?.id ?? null);
  const problemas = React.useMemo(() => validarFluxo(rascunho), [rascunho]);

  // Toda mudança grava: um editor que pede "salvar" perde trabalho na primeira
  // aba fechada. `salvarFluxo` desliga sozinho o fluxo que deixou de estar pronto.
  const mudar = (f: Fluxo) => setRascunho(salvarFluxo(f));
  const mudarNo = (no: NoFluxo) => mudar({ ...rascunho, nos: rascunho.nos.map((n) => (n.id === no.id ? no : n)) });

  const no = rascunho.nos.find((n) => n.id === selecionado) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Button variant="ghost" size="sm" leftIcon={<Icon name="arrow-left" size={14} color="currentColor" />} onClick={onVoltar}>
          Voltar
        </Button>
        <Input
          label="Nome do fluxo"
          value={rascunho.nome}
          onChange={(e) => mudar({ ...rascunho, nome: e.target.value })}
          containerClassName="flex-1 min-w-[220px]"
        />
        <div className="flex flex-col gap-1">
          <Switch
            id="fluxo-ativo"
            checked={rascunho.ativo}
            disabled={problemas.length > 0}
            onChange={(v) => mudar({ ...rascunho, ativo: v })}
            label={rascunho.ativo ? "Ligado" : "Desligado"}
          />
        </div>
        <AcaoDestrutiva
          rotulo="Excluir"
          titulo="Excluir este fluxo?"
          descricao={`"${rascunho.nome}" para de rodar e sai da lista.`}
          confirmarRotulo="Excluir"
          onConfirmar={() => { const desfazer = removerFluxo(rascunho.id); onVoltar(); return desfazer; }}
        />
      </div>

      {problemas.length > 0 && (
        <Card>
          <p className="text-label font-medium text-ink mb-1">Falta pouco para ligar</p>
          <ul className="list-disc pl-5 text-caption text-muted">
            {problemas.map((p, i) => <li key={i}>{p.motivo}</li>)}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <CanvasFluxo fluxo={rascunho} selecionado={selecionado} problemas={problemas} onSelecionar={setSelecionado} />
        <Card>
          {no ? <PainelNo no={no} onMudar={mudarNo} /> : <p className="text-caption text-muted">Clique num card para editar.</p>}
        </Card>
      </div>

      <PreviaMensagem fluxo={rascunho} />
    </div>
  );
}

/* ---------- o painel de cada card ---------- */

function PainelNo({ no, onMudar }: { no: NoFluxo; onMudar: (n: NoFluxo) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="a4p-label text-faint">
          {no.tipo === "gatilho" ? "Quando" : no.tipo === "dados" ? "O que" : "Para quem"}
        </span>
        <p className="text-label font-medium text-ink mt-1">{tituloDoNo(no)}</p>
      </div>
      {no.tipo === "gatilho" && <PainelGatilho no={no} onMudar={onMudar} />}
      {no.tipo === "dados" && (
        <Select
          label="Fonte"
          value={no.fonte}
          onChange={(v) => onMudar({ ...no, fonte: v as FonteFluxo })}
          options={(Object.keys(FONTES_FLUXO) as FonteFluxo[]).map((f) => ({ value: f, label: FONTES_FLUXO[f].nome }))}
        />
      )}
      {no.tipo === "dados" && <p className="text-caption text-muted">{FONTES_FLUXO[no.fonte].resumo}</p>}
      {no.tipo === "envio" && <PainelEnvio no={no} onMudar={onMudar} />}
    </div>
  );
}

function PainelGatilho({ no, onMudar }: {
  no: Extract<NoFluxo, { tipo: "gatilho" }>; onMudar: (n: NoFluxo) => void;
}) {
  const g = no.gatilho;
  const dias = (d: DiaSemana[]) => onMudar({ ...no, gatilho: { ...g, dias: d } });
  const alternar = (d: DiaSemana) =>
    dias(g.dias.includes(d) ? g.dias.filter((x) => x !== d) : [...g.dias, d]);
  return (
    <>
      <div>
        <span className="text-caption text-muted">Dias</span>
        <div role="group" aria-label="Dias da semana" className="flex flex-wrap gap-1 mt-1">
          {DIAS.map((d) => {
            const on = g.dias.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={NOME_DIA[d]}
                onClick={() => alternar(d)}
                className={
                  "h-8 px-3 rounded-pill text-caption transition-colors " +
                  (on ? "bg-ink text-surface-1 font-medium" : "bg-surface-2 text-muted hover:text-ink")
                }
              >
                {SIGLA[d]}
              </button>
            );
          })}
        </div>
        <div className="flex gap-3 mt-2">
          <button type="button" className="text-caption text-muted underline hover:text-ink" onClick={() => dias([0, 1, 2, 3, 4, 5, 6])}>Todo dia</button>
          <button type="button" className="text-caption text-muted underline hover:text-ink" onClick={() => dias([1, 2, 3, 4, 5])}>Dias úteis</button>
        </div>
      </div>
      <Input
        label="Hora (Brasília)"
        type="time"
        value={g.hora}
        onChange={(e) => onMudar({ ...no, gatilho: { ...g, hora: e.target.value } })}
      />
    </>
  );
}

function PainelEnvio({ no, onMudar }: {
  no: Extract<NoFluxo, { tipo: "envio" }>; onMudar: (n: NoFluxo) => void;
}) {
  const destinos = no.destinos;
  const mudarDestino = (i: number, campo: "nome" | "endereco", v: string) =>
    onMudar({ ...no, destinos: destinos.map((d, j) => (j === i ? { ...d, [campo]: v } : d)) });
  return (
    <>
      <Select
        label="Canal"
        value={no.canal}
        onChange={(v) => onMudar({ ...no, canal: v as CanalEnvio })}
        options={(Object.keys(NOME_CANAL) as CanalEnvio[]).map((c) => ({ value: c, label: NOME_CANAL[c] }))}
      />
      <div className="flex flex-col gap-3">
        {destinos.map((d, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md bg-surface-1 p-3">
            <Input label="Nome" value={d.nome ?? ""} onChange={(e) => mudarDestino(i, "nome", e.target.value)} />
            <Input
              label={no.canal === "email" ? "E-mail" : "WhatsApp com DDD"}
              inputMode={no.canal === "email" ? "email" : "tel"}
              placeholder={no.canal === "email" ? "nome@empresa.com.br" : "(11) 98765-4321"}
              value={d.endereco}
              onChange={(e) => mudarDestino(i, "endereco", e.target.value)}
            />
            <button
              type="button"
              className="self-start text-caption text-muted underline hover:text-ink"
              onClick={() => onMudar({ ...no, destinos: destinos.filter((_, j) => j !== i) })}
            >
              Remover
            </button>
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Icon name="plus" size={14} color="currentColor" />}
          onClick={() => onMudar({ ...no, destinos: [...destinos, { nome: "", endereco: "" }] })}
        >
          Adicionar destinatário
        </Button>
      </div>
    </>
  );
}

/* ---------- a prévia ---------- */

/** O negrito do WhatsApp (*assim*) vira negrito na tela; o resto fica como está. */
function TextoWhatsApp({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
        parte.startsWith("*") && parte.endsWith("*") && parte.length > 2
          ? <strong key={i} className="font-medium text-ink">{parte.slice(1, -1)}</strong>
          : <React.Fragment key={i}>{parte}</React.Fragment>,
      )}
    </>
  );
}

function PreviaMensagem({ fluxo }: { fluxo: Fluxo }) {
  const { data: input, isLoading } = useRiscoInput();
  const fonte = fonteDe(fluxo);
  const hoje = React.useMemo(() => hojeEm(new Date()), []);
  const exemplo = fonte === "maquininha_dia";

  const resultado = React.useMemo(() => {
    if (!input) return null;
    return mensagemDoFluxo(fluxo, { input, vendasMaquininha: vendasDeExemplo(hoje), temMaquininha: true }, hoje);
  }, [fluxo, input, hoje]);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-h3 text-ink">Prévia da mensagem</h2>
        <span className="a4p-label text-faint">{exemplo ? "Vendas de exemplo" : "Se rodasse agora"}</span>
      </div>
      {isLoading && <p className="text-caption text-muted">Montando a prévia…</p>}
      {resultado && ehMensagem(resultado) && (
        <div className="rounded-md bg-surface-1 p-4 whitespace-pre-wrap text-label text-ink tabular-nums max-w-[560px]">
          <TextoWhatsApp texto={resultado.texto} />
        </div>
      )}
      {resultado && !ehMensagem(resultado) && <p className="text-body text-muted">{resultado.motivo}</p>}
      {exemplo && (
        <p className="text-caption text-muted mt-3">
          A prévia usa vendas inventadas para mostrar o formato. No envio, entram as vendas do dia da sua maquininha.
        </p>
      )}
    </Card>
  );
}
