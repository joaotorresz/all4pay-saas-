"use client";

import * as React from "react";
import { AcaoDestrutiva, Button, CampoCodigo, Card, Icon, Input, StatusBadge } from "@/components/ui";
import { dataBR } from "@/lib/format";
import { MARCA_IA } from "@/core/marca";
import { DIGITOS_CODIGO_WHATSAPP, celularCanonico, celularLegivel } from "@/core/whatsapp/numero";
import {
  confirmarNumeroAction, pedirCodigoNumeroAction, removerNumeroAction, situacaoNumeroAction,
  type SituacaoNumero,
} from "@/app/configuracoes/seguranca/acoes";

type Msg = { tone: "error" | "ok"; text: string } | null;

/**
 * O CELULAR PARA CONVERSAR COM A QUATTRO AI PELO WHATSAPP (etapa 1).
 *
 * ⚠️ Só aparece com `WHATSAPP_IA=ligado` (a página pergunta ao servidor), e
 * quem decide tudo é o banco: o código chega ao PRÓPRIO celular, e só ele
 * prova que o número é de quem o cadastra.
 */
export function NumeroWhatsappCard() {
  const [sit, setSit] = React.useState<SituacaoNumero | null>(null);
  const [celular, setCelular] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [esperandoCodigo, setEsperandoCodigo] = React.useState(false);
  const [trocando, setTrocando] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);

  const carregar = React.useCallback(async () => {
    const s = await situacaoNumeroAction();
    setSit(s);
    if (s.pendente) setEsperandoCodigo(true);
  }, []);
  React.useEffect(() => { void carregar(); }, [carregar]);

  if (!sit || !sit.ligado) return null;

  async function pedir() {
    if (busy) return;
    if (!celularCanonico(celular)) { setMsg({ tone: "error", text: "Celular inválido — informe DDD e número." }); return; }
    setBusy(true); setMsg(null);
    const r = await pedirCodigoNumeroAction(celular);
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "error", text: r.motivo }); return; }
    setEsperandoCodigo(true); setCodigo("");
    setMsg({ tone: "ok", text: r.mensagem });
  }

  async function confirmar() {
    if (busy) return;
    if (codigo.replace(/\D/g, "").length !== DIGITOS_CODIGO_WHATSAPP) {
      setMsg({ tone: "error", text: `Digite os ${DIGITOS_CODIGO_WHATSAPP} números que chegaram no WhatsApp.` });
      return;
    }
    setBusy(true); setMsg(null);
    const r = await confirmarNumeroAction(codigo);
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "error", text: r.motivo }); return; }
    setEsperandoCodigo(false); setTrocando(false); setCelular(""); setCodigo("");
    setMsg({ tone: "ok", text: r.mensagem });
    await carregar();
  }

  async function remover() {
    const r = await removerNumeroAction();
    setMsg(r.ok ? { tone: "ok", text: r.mensagem } : { tone: "error", text: r.motivo });
    setEsperandoCodigo(false); setTrocando(false);
    await carregar();
  }

  const confirmado = !!sit.telefone;
  const mostraFormulario = sit.podeCadastrar && (!confirmado || trocando) && !esperandoCodigo;

  return (
    <Card
      className="flex flex-col gap-4 max-w-[860px]"
      info={{
        titulo: `${MARCA_IA} no WhatsApp`,
        oQue: `Com o celular confirmado, você pergunta à ${MARCA_IA} pelo WhatsApp ("quanto tenho a pagar essa semana?") e ela responde com os números da sua empresa. Só leitura: nada é lançado pela conversa.`,
        comoCalcula: "O código de 6 dígitos chega por WhatsApp ao próprio celular e vale 10 minutos, com 5 tentativas. É ele que prova que o número é seu: sem isso, alguém cadastraria o seu celular e leria o seu caixa.",
      }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-h3 font-medium text-ink">Celular para a {MARCA_IA}</span>
        {confirmado
          ? <StatusBadge tone="positive">Confirmado</StatusBadge>
          : <StatusBadge tone="warning">Desligado</StatusBadge>}
      </div>

      {!sit.podeCadastrar && !confirmado && (
        <p className="m-0 text-label text-muted max-w-[72ch]">
          Só o titular ou um administrador da empresa pode conversar com a {MARCA_IA} pelo WhatsApp.
        </p>
      )}

      {confirmado && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Icon name="smartphone" size={16} color="var(--color-text-secondary)" />
            <div className="min-w-0">
              <div className="text-label font-medium text-ink" data-num>{celularLegivel(sit.telefone)}</div>
              {sit.confirmadoEm && <span className="a4p-label text-muted">Confirmado em {dataBR(sit.confirmadoEm.slice(0, 10))}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {sit.podeCadastrar && !trocando && !esperandoCodigo && (
              <button type="button" className="text-caption font-medium text-muted hover:text-ink underline"
                onClick={() => { setTrocando(true); setMsg(null); }}>
                Trocar número
              </button>
            )}
            <AcaoDestrutiva
              rotulo="Remover"
              titulo="Remover este celular?"
              descricao={`A ${MARCA_IA} deixa de responder a ${celularLegivel(sit.telefone)} pelo WhatsApp. Para voltar, cadastre e confirme de novo.`}
              confirmarRotulo="Remover"
              desfaz={false}
              onConfirmar={remover}
            />
          </div>
        </div>
      )}

      {mostraFormulario && (
        <div className="flex items-end gap-3 flex-wrap">
          <Input
            label="Celular com DDD"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 99999-0000"
            value={celular}
            onChange={(e) => setCelular(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void pedir(); }}
            containerClassName="w-full max-w-[260px]"
          />
          <Button variant="primary" disabled={busy} aria-busy={busy} onClick={pedir}
            leftIcon={<Icon name="smartphone" size={15} />}>
            Enviar código por WhatsApp
          </Button>
          {trocando && (
            <Button variant="secondary" onClick={() => { setTrocando(false); setMsg(null); }}>Cancelar</Button>
          )}
        </div>
      )}

      {esperandoCodigo && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-label text-muted max-w-[72ch]">
            {sit.pendente ? `Digite o código enviado para ${celularLegivel(sit.pendente)}.` : "Digite o código que chegou no WhatsApp."}
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="w-full max-w-[220px]">
              <CampoCodigo valor={codigo} onMudar={setCodigo} onConfirmar={confirmar} autoFocus disabled={busy} />
            </div>
            <Button variant="primary" disabled={busy} aria-busy={busy} onClick={confirmar}>Confirmar</Button>
            <Button variant="secondary" disabled={busy} onClick={() => { setEsperandoCodigo(false); setMsg(null); }}>
              Pedir outro código
            </Button>
          </div>
        </div>
      )}

      {msg && (
        <p role={msg.tone === "error" ? "alert" : "status"} className={`m-0 text-caption ${msg.tone === "error" ? "text-negative" : "text-positive"}`}>
          {msg.text}
        </p>
      )}
    </Card>
  );
}
