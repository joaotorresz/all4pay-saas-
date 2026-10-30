"use client";

import * as React from "react";
import { Button, CampoCodigo, Icon, Input } from "@/components/ui";
import { MARCA_IA } from "@/core/marca";
import {
  CHAVE_OFERTA_WHATSAPP, DIGITOS_CODIGO_WHATSAPP, celularCanonico, celularLegivel, deveOferecerWhatsapp,
} from "@/core/whatsapp/numero";
import { loadCompany } from "@/lib/company";
import { hojeLocal } from "@/lib/aggregations";
import {
  confirmarNumeroAction, pedirCodigoNumeroAction, situacaoNumeroAction,
} from "@/app/configuracoes/seguranca/acoes";

type Fase = "oferta" | "codigo" | "feito";

function lerDispensa(): string | null {
  try { return localStorage.getItem(CHAVE_OFERTA_WHATSAPP); } catch { return null; }
}
function gravarDispensa(dia: string) {
  try { localStorage.setItem(CHAVE_OFERTA_WHATSAPP, dia); } catch { /* sem armazenamento, a oferta volta: aceitável */ }
}

/**
 * "QUER CONTINUAR ESTA CONVERSA NO WHATSAPP?" — a oferta do vínculo dentro do
 * chat (30/10/2026, pedido do dono). Aparece no alto da conversa, antes da
 * primeira pergunta, só para quem pode cadastrar e ainda não tem celular
 * confirmado. ⚠️ É a MESMA confirmação de Segurança da conta (o código vai
 * ao celular), não um atalho: o número do cadastro vem só como sugestão.
 */
export function OfertaWhatsapp() {
  const [visivel, setVisivel] = React.useState(false);
  const [fase, setFase] = React.useState<Fase>("oferta");
  const [celular, setCelular] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "error" | "ok"; text: string } | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void situacaoNumeroAction().then((s) => {
      if (!vivo) return;
      const ofertar = deveOferecerWhatsapp({
        ligado: s.ligado, podeCadastrar: s.podeCadastrar, confirmado: !!s.telefone,
        dispensadaEm: lerDispensa(), hoje: hojeLocal(),
      });
      if (!ofertar) return;
      const sugerido = s.pendente ?? celularCanonico(String(loadCompany()?.db?.repTelefone ?? ""));
      if (sugerido) setCelular(celularLegivel(sugerido));
      if (s.pendente) setFase("codigo");
      setVisivel(true);
    }).catch(() => { /* sem a situação, não oferece: nada quebra a conversa */ });
    return () => { vivo = false; };
  }, []);

  if (!visivel) return null;

  const agoraNao = () => { gravarDispensa(hojeLocal()); setVisivel(false); };

  async function pedir() {
    if (busy) return;
    if (!celularCanonico(celular)) { setMsg({ tone: "error", text: "Celular inválido — informe DDD e número." }); return; }
    setBusy(true); setMsg(null);
    const r = await pedirCodigoNumeroAction(celular);
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "error", text: r.motivo }); return; }
    setFase("codigo"); setCodigo("");
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
    setFase("feito");
    setMsg(null);
  }

  if (fase === "feito") {
    return (
      <div data-ia="oferta-whatsapp" className="a4p-entra flex items-center gap-2 text-[14px] text-muted" role="status">
        <Icon name="check" size={16} strokeWidth={1.5} />
        <span>Celular conectado. Pode me chamar pelo WhatsApp quando quiser — eu respondo com os números da sua empresa.</span>
      </div>
    );
  }

  return (
    <section data-ia="oferta-whatsapp" aria-label={`${MARCA_IA} no WhatsApp`} className="a4p-entra flex flex-col gap-4 p-5 rounded-card" style={{ background: "var(--color-white)" }}>
      <div className="flex items-start gap-3">
        <Icon name="smartphone" size={18} strokeWidth={1.5} />
        <div className="flex flex-col gap-1 min-w-0">
          <p className="m-0 text-[16px] text-ink">Quer continuar esta conversa no seu WhatsApp?</p>
          <p className="m-0 text-[14px] text-muted">
            Você pergunta pelo celular — “quanto tenho a pagar essa semana?” — e eu respondo com os números da sua empresa. Só leitura: nada é lançado por lá.
          </p>
        </div>
      </div>

      {fase === "oferta" ? (
        <div className="flex items-end gap-3 flex-wrap">
          <Input
            label="Celular com DDD"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 99999-0000"
            value={celular}
            onChange={(e) => setCelular(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void pedir(); }}
            containerClassName="w-full max-w-[240px]"
          />
          <Button variant="primary" disabled={busy} aria-busy={busy} onClick={pedir}>Enviar código</Button>
          <Button variant="secondary" disabled={busy} onClick={agoraNao}>Agora não</Button>
        </div>
      ) : (
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-full max-w-[200px]">
            <CampoCodigo valor={codigo} onMudar={setCodigo} onConfirmar={confirmar} autoFocus disabled={busy} />
          </div>
          <Button variant="primary" disabled={busy} aria-busy={busy} onClick={confirmar}>Confirmar</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setFase("oferta"); setMsg(null); }}>Outro código</Button>
          <Button variant="secondary" disabled={busy} onClick={agoraNao}>Agora não</Button>
        </div>
      )}

      {msg && (
        <p role={msg.tone === "error" ? "alert" : "status"} className={`m-0 text-caption ${msg.tone === "error" ? "text-negative" : "text-muted"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
