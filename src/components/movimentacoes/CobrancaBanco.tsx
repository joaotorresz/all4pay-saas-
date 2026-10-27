"use client";

/**
 * COBRAR PELA CONTA BANCÁRIA CONECTADA — dentro do modal da baixa, num título
 * A RECEBER em aberto: "Gerar boleto com Pix" e, emitido, a linha digitável e
 * o Pix copia e cola para mandar ao cliente.
 *
 * ⚠️ Some INTEIRO sem o interruptor do servidor, na demonstração ou sem conta
 * conectada: um botão que sempre responde "indisponível" ensina a não clicar.
 *
 * ⚠️ Com a cobrança "processando" ou "não confirmada" o botão vira "Conferir
 * no banco" — o mesmo pedido, que a rota resolve CONSULTANDO, nunca emitindo
 * outra. Pedir de novo uma incerta cobraria o cliente duas vezes.
 */
import * as React from "react";
import { Button, StatusBadge } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { formatBRL } from "@/lib/format";
import { linhaDigitavelLegivel } from "@/core/pinbank/cobranca";

type Situacao = "reservada" | "processando" | "emitida" | "falhou" | "incerta" | "a_cancelar" | "paga" | "cancelada";

type Cobranca = {
  id: string;
  situacao: Situacao;
  valor: number;
  vencimento: string;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  motivo: string | null;
};

type Estado = { ligada: boolean; conectada: boolean; ambiente: string | null; cobrancas: Cobranca[] };

const TOM: Record<Situacao, "warning" | "neutral" | "positive"> = {
  reservada: "neutral",
  processando: "neutral",
  emitida: "positive",
  falhou: "warning",
  incerta: "warning",
  a_cancelar: "warning",
  paga: "positive",
  cancelada: "neutral",
};
const NOME: Record<Situacao, string> = {
  reservada: "Gerando",
  processando: "Banco montando",
  emitida: "Emitida",
  falhou: "Recusada",
  incerta: "Não confirmada",
  a_cancelar: "A cancelar",
  paga: "Paga",
  cancelada: "Cancelada",
};
const FRASE: Record<Situacao, string> = {
  reservada: "A cobrança está sendo gerada.",
  processando: "O banco aceitou e está montando a cobrança. Confira em instantes.",
  emitida: "",
  falhou: "O banco recusou a cobrança.",
  incerta: "O pedido saiu e a resposta não voltou. Confira no banco antes de qualquer outra coisa.",
  a_cancelar: "O título mudou depois da cobrança. Cancele a cobrança no banco antes de gerar outra.",
  paga: "O cliente pagou esta cobrança.",
  cancelada: "Cobrança cancelada.",
};
const VIVAS: Situacao[] = ["reservada", "processando", "emitida", "incerta", "a_cancelar", "paga"];
const A_CONFERIR: Situacao[] = ["processando", "incerta"];

export function CobrancaBanco({ movementId, show }: { movementId: string; show: (m: string) => void }) {
  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [pedindo, setPedindo] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/cobranca-banco/emitir?movementId=${encodeURIComponent(movementId)}`, { cache: "no-store" });
      if (!r.ok) return setEstado(null);
      const j = (await r.json()) as Partial<Estado>;
      setEstado({
        ligada: !!j.ligada,
        conectada: !!j.conectada,
        ambiente: typeof j.ambiente === "string" ? j.ambiente : null,
        cobrancas: Array.isArray(j.cobrancas) ? j.cobrancas : [],
      });
    } catch {
      setEstado(null);
    }
  }, [movementId]);

  React.useEffect(() => {
    if (!isDemo) void carregar();
  }, [carregar]);

  if (isDemo || !estado || !estado.ligada || !estado.conectada) return null;

  const pedir = async (conferir: boolean) => {
    setPedindo(true);
    try {
      const r = await fetch("/api/cobranca-banco/emitir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ movementId }),
      });
      const j = (await r.json().catch(() => ({}))) as { motivo?: string };
      if (r.status === 200 || r.status === 201) show(conferir ? "Cobrança conferida no banco." : "Boleto com Pix gerado. Copie e mande ao cliente.");
      else show(j.motivo ?? "Não foi possível gerar a cobrança agora.");
    } catch {
      show("Não foi possível falar com o servidor. Abra o título de novo para ver se a cobrança saiu.");
    } finally {
      setPedindo(false);
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

  const c = estado.cobrancas.find((x) => VIVAS.includes(x.situacao)) ?? null;
  const recusa = !c ? estado.cobrancas.find((x) => x.situacao === "falhou") ?? null : null;
  const conferir = !!c && A_CONFERIR.includes(c.situacao);

  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-1 p-4">
      <div className="flex flex-col gap-[2px]">
        <span className="text-label text-ink">
          Cobrar pela conta Inter{estado.ambiente === "sandbox" ? " · teste" : ""}
        </span>
        <span className="text-caption text-muted leading-[1.5]">
          O valor e o vencimento são os do título. O dinheiro cai na conta da empresa no Inter.
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-ink">Boleto com Pix</span>
        {c && !conferir ? (
          <StatusBadge tone={TOM[c.situacao]}>{NOME[c.situacao]}</StatusBadge>
        ) : (
          <Button variant="secondary" onClick={() => void pedir(conferir)} disabled={pedindo}>
            {pedindo ? (conferir ? "Conferindo…" : "Gerando…") : conferir ? "Conferir no banco" : "Gerar boleto com Pix"}
          </Button>
        )}
      </div>

      {c && conferir && <StatusBadge tone={TOM[c.situacao]}>{NOME[c.situacao]}</StatusBadge>}

      {c && c.situacao === "emitida" && c.pix_copia_cola && (
        <div className="flex flex-col gap-2">
          <span className="text-caption text-muted">
            Pix copia e cola · <span className="tabular-nums">{formatBRL(c.valor)}</span>
          </span>
          <code className="block break-all rounded-sm bg-white p-2 text-caption text-ink">{c.pix_copia_cola}</code>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => void copiar(c.pix_copia_cola!, "Pix copia e cola")}>Copiar Pix</Button>
          </div>
        </div>
      )}
      {c && c.situacao === "emitida" && c.linha_digitavel && (
        <div className="flex flex-col gap-2">
          <span className="text-caption text-muted">
            Linha digitável · vence {c.vencimento.split("-").reverse().join("/")}
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
        <span className="text-caption text-muted leading-[1.5]">{c.motivo ?? FRASE[c.situacao]}</span>
      )}
      {recusa && (
        <span className="text-caption text-muted leading-[1.5]">Última tentativa: {recusa.motivo ?? FRASE.falhou}</span>
      )}
    </div>
  );
}
