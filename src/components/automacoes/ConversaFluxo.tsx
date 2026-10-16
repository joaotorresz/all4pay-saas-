"use client";

/**
 * "Descreva a automação" — a Quattro AI monta o fluxo pela conversa.
 *
 * A pessoa escreve ("toda segunda às 8h me manda no WhatsApp o que tenho a
 * pagar na semana"); a conversa preenche a PROPOSTA (`core/automacoes/pedido`)
 * e, quando há fonte e horário, grava o MESMO `Fluxo` que o editor de cards
 * edita — desligado. Faltando algo, ela pergunta uma coisa por vez.
 *
 * ⚠️ Duas leituras, uma regra: a IA (`/api/ai/automacao`) completa a proposta
 * e as REGRAS (`interpretarPedidoFluxo`) leem o texto original por cima — são
 * elas que acham telefone e e-mail, que nunca vêm da IA. Sem chave, sem sessão
 * ou com erro, só as regras, sem aviso na tela. A frase mostrada sai de
 * `respostaDaProposta`, sobre o que de fato foi entendido.
 *
 * "Eu" é o representante do cadastro da empresa: "me manda" vai para o
 * WhatsApp que está lá, e a resposta diz qual é.
 */
import * as React from "react";
import { Button, Card, Icon } from "@/components/ui";
import { MarcaIA } from "@/components/ia/chat-kit";
import { DigitandoIA, TextoRevelado } from "@/components/ia/conversa";
import { CanvasFluxo } from "./CanvasFluxo";
import { validarFluxo, type Fluxo } from "@/core/automacoes/fluxo";
import {
  interpretarPedidoFluxo, mesclarProposta, normalizarProposta, fluxoDaProposta, respostaDaProposta,
  PROPOSTA_VAZIA, type PropostaFluxo, type QuemConversa,
} from "@/core/automacoes/pedido";
import { salvarFluxo, novoIdFluxo } from "@/lib/automacao-fluxos";
import { loadCompany } from "@/lib/company";

interface Fala { de: "pessoa" | "ia"; texto: string }

function quemConversa(): QuemConversa {
  const db = loadCompany()?.db ?? {};
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { nome: s(db.repNome), telefone: s(db.repTelefone), email: s(db.repEmail) };
}

async function propostaDaIA(pedido: string, atual: PropostaFluxo): Promise<PropostaFluxo | null> {
  try {
    const r = await fetch("/api/ai/automacao", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pedido, proposta: atual }),
    });
    const j = await r.json();
    return j?.ok ? normalizarProposta(j.proposta) : null;
  } catch {
    return null;
  }
}

export const EXEMPLOS_PEDIDO = [
  "Toda segunda às 8h me manda no WhatsApp as contas a pagar da semana",
  "Todo dia às 19h me manda o resumo da maquininha",
];

export function ConversaFluxo({ pedidoInicial, onAbrir }: { pedidoInicial?: string | null; onAbrir: (id: string) => void }) {
  const [falas, setFalas] = React.useState<Fala[]>([]);
  const [proposta, setProposta] = React.useState<PropostaFluxo>(PROPOSTA_VAZIA);
  const [fluxo, setFluxo] = React.useState<Fluxo | null>(null);
  const [texto, setTexto] = React.useState("");
  const [pensando, setPensando] = React.useState(false);
  const idRef = React.useRef<string | null>(null);
  const inicialRef = React.useRef(false);

  const enviar = React.useCallback(async (bruto: string) => {
    const t = bruto.trim();
    if (!t || pensando) return;
    setTexto("");
    setFalas((f) => [...f, { de: "pessoa", texto: t }]);
    setPensando(true);
    const ia = await propostaDaIA(t, proposta);
    // As regras leem o texto original POR CIMA da IA: telefone, e-mail, e a
    // hora e o dia quando escritos de forma reconhecível.
    const nova = mesclarProposta(proposta, mesclarProposta(ia ?? PROPOSTA_VAZIA, interpretarPedidoFluxo(t)));
    const eu = quemConversa();
    const montado = fluxoDaProposta(nova, idRef.current ?? novoIdFluxo(), eu);
    let gravado: Fluxo | null = null;
    if (montado) {
      idRef.current = montado.id;
      gravado = salvarFluxo(montado);
    }
    setProposta(nova);
    setFluxo(gravado);
    setFalas((f) => [...f, { de: "ia", texto: respostaDaProposta(nova, eu) }]);
    setPensando(false);
  }, [pensando, proposta]);

  // Chegando do chat geral (`/automacoes?pedido=`): pergunta uma vez.
  React.useEffect(() => {
    if (inicialRef.current || !pedidoInicial) return;
    inicialRef.current = true;
    void enviar(pedidoInicial);
  }, [pedidoInicial, enviar]);

  const recomecar = () => {
    setFalas([]); setProposta(PROPOSTA_VAZIA); setFluxo(null); idRef.current = null;
  };

  const problemas = fluxo ? validarFluxo(fluxo) : [];

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <MarcaIA size={28} />
          <div>
            <p className="text-label font-medium text-ink">Criar pela conversa</p>
            <p className="text-caption text-muted">Diga quando, o que e para quem. A Quattro AI monta o fluxo.</p>
          </div>
        </div>
        {falas.length > 0 && (
          <Button variant="ghost" size="sm" leftIcon={<Icon name="rotate-ccw" size={14} color="currentColor" />} onClick={recomecar}>
            Recomeçar
          </Button>
        )}
      </div>

      {falas.length > 0 && (
        <div className="flex flex-col gap-2 mb-3" aria-live="polite" data-conversa-fluxo>
          {falas.map((f, i) => (
            <p
              key={i}
              className={
                f.de === "pessoa"
                  ? "self-end max-w-[85%] rounded-card bg-surface-2 px-4 py-2 text-body text-ink"
                  : "self-start max-w-[85%] text-body text-ink"
              }
              data-fala={f.de}
            >
              {f.de === "ia" ? <TextoRevelado texto={f.texto} /> : f.texto}
            </p>
          ))}
          {pensando && <DigitandoIA rotulo="Montando o fluxo" className="self-start" />}
        </div>
      )}

      {fluxo && (
        <div className="flex flex-col gap-3 mb-3">
          <CanvasFluxo key={fluxo.id + JSON.stringify(fluxo.nos)} fluxo={fluxo} selecionado={null} problemas={problemas} onSelecionar={() => onAbrir(fluxo.id)} />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => onAbrir(fluxo.id)}>Abrir e revisar</Button>
            <span className="text-caption text-muted">
              {problemas.length ? problemas[0].motivo : "Pronto para ligar. A mensagem só sai depois que você ligar o fluxo."}
            </span>
          </div>
        </div>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}
      >
        <label htmlFor="pedido-fluxo" className="sr-only">Descreva a automação</label>
        <textarea
          id="pedido-fluxo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }}
          rows={2}
          placeholder={falas.length ? "Responda aqui" : EXEMPLOS_PEDIDO[0]}
          className="flex-1 resize-none rounded-md border border-border bg-white px-4 py-3 text-body text-ink placeholder:text-placeholder focus:outline-none focus:border-ink"
        />
        <Button type="submit" disabled={!texto.trim() || pensando} aria-label="Enviar" leftIcon={<Icon name="arrow-up" size={16} color="currentColor" />}>
          Enviar
        </Button>
      </form>
      {falas.length === 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {EXEMPLOS_PEDIDO.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => void enviar(ex)}
              className="rounded-pill bg-surface-2 hover:bg-surface-3 px-3 py-[6px] text-caption text-ink transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
