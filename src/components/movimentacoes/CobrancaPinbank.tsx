"use client";

/**
 * COBRAR PELA CONTA PINBANK — dentro do modal da baixa, num título A RECEBER
 * em aberto: "Gerar Pix" e "Gerar boleto", e o copia-e-cola ou a linha
 * digitável para mandar ao cliente.
 *
 * ⚠️ Some INTEIRO quando a cobrança não está liberada (interruptor do servidor,
 * demonstração) ou a empresa não a ligou na maquininha: um botão que sempre
 * responde "indisponível" ensina a não clicar nele.
 *
 * ⚠️ Esta tela não decide nada: o pedido leva só o título e o tipo. Valor,
 * vencimento, pagador e quem recebe saem do banco (`/api/pinbank/cobranca`).
 */
import * as React from "react";
import { Button, StatusBadge } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { formatBRL } from "@/lib/format";
import { FRASE_DA_SITUACAO, linhaDigitavelLegivel, type SituacaoCobranca, type TipoCobranca } from "@/core/pinbank/cobranca";

type Cobranca = {
  id: string;
  tipo: TipoCobranca;
  situacao: SituacaoCobranca;
  valor: number;
  vencimento: string;
  texto_qrcode: string | null;
  qrcode_url: string | null;
  linha_digitavel: string | null;
  motivo: string | null;
};

type Estado = { liberada: boolean; ligada: boolean; cobrancas: Cobranca[]; link: string | null };

const TOM: Record<SituacaoCobranca, "warning" | "neutral" | "positive" | "ink"> = {
  reservada: "neutral",
  emitida: "positive",
  falhou: "warning",
  incerta: "warning",
  a_cancelar: "warning",
  paga: "positive",
  cancelada: "neutral",
};
const NOME: Record<SituacaoCobranca, string> = {
  reservada: "Gerando",
  emitida: "Emitida",
  falhou: "Recusada",
  incerta: "Não confirmada",
  a_cancelar: "A cancelar",
  paga: "Paga",
  cancelada: "Cancelada",
};
const VIVAS: SituacaoCobranca[] = ["reservada", "emitida", "incerta", "a_cancelar"];

export function CobrancaPinbank({ movementId, show }: { movementId: string; show: (m: string) => void }) {
  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [gerando, setGerando] = React.useState<TipoCobranca | null>(null);
  const [criandoLink, setCriandoLink] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/pinbank/cobranca?movementId=${encodeURIComponent(movementId)}`, { cache: "no-store" });
      if (!r.ok) return setEstado(null);
      const j = (await r.json()) as Partial<Estado>;
      setEstado({
        liberada: !!j.liberada,
        ligada: !!j.ligada,
        cobrancas: Array.isArray(j.cobrancas) ? j.cobrancas : [],
        link: typeof j.link === "string" ? j.link : null,
      });
    } catch {
      setEstado(null);
    }
  }, [movementId]);

  React.useEffect(() => {
    if (!isDemo) void carregar();
  }, [carregar]);

  if (isDemo || !estado || !estado.liberada || !estado.ligada) return null;

  const gerar = async (tipo: TipoCobranca) => {
    setGerando(tipo);
    try {
      const r = await fetch("/api/pinbank/cobranca", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ movementId, tipo }),
      });
      const j = (await r.json().catch(() => ({}))) as { motivo?: string };
      if (r.ok) show(tipo === "pix" ? "Pix gerado. Copie e mande ao cliente." : "Boleto gerado. Copie a linha e mande ao cliente.");
      else show(j.motivo ?? "Não foi possível gerar a cobrança agora.");
    } catch {
      show("Não foi possível falar com o servidor. Abra o título de novo para ver se a cobrança saiu.");
    } finally {
      setGerando(null);
      await carregar();
    }
  };

  const copiar = async (t: string, o_que: string) => {
    try {
      await navigator.clipboard.writeText(t);
      show(`${o_que} copiado.`);
    } catch {
      show("Não foi possível copiar. Selecione o texto e copie à mão.");
    }
  };

  const urlDoLink = (token: string) => `${window.location.origin}/pagar?t=${token}`;

  // O link de pagamento: uma página pública com o Pix e o boleto já emitidos.
  const criarLink = async () => {
    setCriandoLink(true);
    try {
      const r = await fetch("/api/pinbank/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ movementId }),
      });
      const j = (await r.json().catch(() => ({}))) as { token?: string; motivo?: string };
      if (r.ok && j.token) await copiar(urlDoLink(j.token), "Link de pagamento");
      else show(j.motivo ?? "Não foi possível criar o link agora.");
    } catch {
      show("Não foi possível falar com o servidor.");
    } finally {
      setCriandoLink(false);
      await carregar();
    }
  };

  const viva = (tipo: TipoCobranca) => estado.cobrancas.find((c) => c.tipo === tipo && VIVAS.includes(c.situacao));
  const ultimaRecusa = (tipo: TipoCobranca) => {
    const c = estado.cobrancas.find((x) => x.tipo === tipo);
    return c && c.situacao === "falhou" ? c : null;
  };

  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-1 p-4">
      <div className="flex flex-col gap-[2px]">
        <span className="text-label text-ink">Cobrar pela conta Pinbank</span>
        <span className="text-caption text-muted leading-[1.5]">
          O valor e o vencimento são os do título. O dinheiro cai na conta Pinbank da empresa.
        </span>
      </div>

      {(["pix", "boleto"] as const).map((tipo) => {
        const c = viva(tipo);
        const recusa = !c ? ultimaRecusa(tipo) : null;
        const rotulo = tipo === "pix" ? "Pix" : "Boleto";
        return (
          <div key={tipo} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label text-ink">{rotulo}</span>
              {c ? (
                <StatusBadge tone={TOM[c.situacao]}>{NOME[c.situacao]}</StatusBadge>
              ) : (
                <Button variant="secondary" onClick={() => void gerar(tipo)} disabled={gerando !== null}>
                  {gerando === tipo ? "Gerando…" : `Gerar ${rotulo.toLowerCase()}`}
                </Button>
              )}
            </div>

            {c && c.situacao === "emitida" && tipo === "pix" && c.texto_qrcode && (
              <div className="flex flex-col gap-2">
                <span className="text-caption text-muted">
                  Pix copia e cola · <span className="tabular-nums">{formatBRL(c.valor)}</span>
                </span>
                <code className="block break-all rounded-sm bg-white p-2 text-caption text-ink">{c.texto_qrcode}</code>
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => void copiar(c.texto_qrcode!, "Pix copia e cola")}>Copiar Pix</Button>
                </div>
              </div>
            )}
            {c && c.situacao === "emitida" && tipo === "boleto" && c.linha_digitavel && (
              <div className="flex flex-col gap-2">
                <span className="text-caption text-muted">
                  Linha digitável · <span className="tabular-nums">{formatBRL(c.valor)}</span>
                </span>
                <code className="block break-all rounded-sm bg-white p-2 text-caption text-ink tabular-nums">
                  {linhaDigitavelLegivel(c.linha_digitavel)}
                </code>
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => void copiar(c.linha_digitavel!, "Linha digitável")}>Copiar linha</Button>
                </div>
              </div>
            )}
            {c && c.situacao !== "emitida" && (
              <span className="text-caption text-muted leading-[1.5]">{c.motivo ?? FRASE_DA_SITUACAO[c.situacao]}</span>
            )}
            {recusa && (
              <span className="text-caption text-muted leading-[1.5]">Última tentativa: {recusa.motivo ?? FRASE_DA_SITUACAO.falhou}</span>
            )}
          </div>
        );
      })}

      {estado.cobrancas.some((c) => c.situacao === "emitida") && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label text-ink">Link de pagamento</span>
            <Button
              variant="secondary"
              onClick={() => void (estado.link ? copiar(urlDoLink(estado.link), "Link de pagamento") : criarLink())}
              disabled={criandoLink}
            >
              {criandoLink ? "Criando…" : estado.link ? "Copiar link" : "Criar link"}
            </Button>
          </div>
          <span className="text-caption text-muted leading-[1.5]">
            Uma página para o cliente pagar pelo Pix ou pelo boleto, sem entrar no sistema. A baixa ainda é feita aqui quando o dinheiro cair.
          </span>
        </div>
      )}
    </div>
  );
}
