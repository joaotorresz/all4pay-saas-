"use client";

/**
 * A MENSALIDADE DO QUATTRO — na tela de Assinatura: as faturas que a Quattro
 * gerou para esta empresa e, na fatura aberta, "Gerar Pix" e "Gerar boleto"
 * pela conta Pinbank DA QUATTRO.
 *
 * ⚠️ Some INTEIRO sem fatura nenhuma (demonstração, migration ainda não
 * aplicada, empresa que nunca recebeu fatura). Com fatura e o pagamento ainda
 * desligado, a fatura aparece e diz como pagar — nunca um botão que sempre
 * responde "indisponível".
 *
 * ⚠️ A tela não decide nada: o pedido leva só a fatura e o tipo
 * (`/api/mensalidade/cobranca`). Pagar ainda não renova sozinho: a Quattro
 * confere o recebimento e dá baixa, e a tela diz isso.
 */
import * as React from "react";
import { BRL, Button, Card, StatusBadge } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { dataBR } from "@/lib/format";
import { FRASE_DA_SITUACAO, linhaDigitavelLegivel, type TipoCobranca } from "@/core/pinbank/cobranca";

type SituacaoMens = "reservada" | "emitida" | "falhou" | "incerta" | "cancelada";
type Fatura = {
  id: string; competencia: string; plano: string | null; valor: number; vencimento: string;
  situacao: "aberta" | "paga" | "cancelada"; paga_em: string | null; acesso_ate: string | null;
};
type Cobranca = {
  id: string; fatura_id: string; tipo: TipoCobranca; situacao: SituacaoMens; valor: number;
  texto_qrcode: string | null; linha_digitavel: string | null; motivo: string | null;
};
type Estado = { liberada: boolean; faturas: Fatura[]; cobrancas: Cobranca[] };

const NOME_FATURA: Record<Fatura["situacao"], string> = { aberta: "Em aberto", paga: "Paga", cancelada: "Cancelada" };
const TOM_FATURA: Record<Fatura["situacao"], "warning" | "positive" | "neutral"> = { aberta: "warning", paga: "positive", cancelada: "neutral" };
const VIVAS: SituacaoMens[] = ["reservada", "emitida", "incerta"];

const mesDe = (competencia: string) => {
  const [a, m] = competencia.split("-");
  return `${m}/${a}`;
};

export function MensalidadeCard({ show }: { show: (m: string) => void }) {
  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [gerando, setGerando] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    try {
      const r = await fetch("/api/mensalidade/cobranca", { cache: "no-store" });
      if (!r.ok) return setEstado(null);
      const j = (await r.json()) as Partial<Estado>;
      setEstado({
        liberada: !!j.liberada,
        faturas: Array.isArray(j.faturas) ? j.faturas : [],
        cobrancas: Array.isArray(j.cobrancas) ? j.cobrancas : [],
      });
    } catch {
      setEstado(null);
    }
  }, []);

  React.useEffect(() => {
    if (!isDemo) void carregar();
  }, [carregar]);

  if (isDemo || !estado || estado.faturas.length === 0) return null;

  const gerar = async (faturaId: string, tipo: TipoCobranca) => {
    setGerando(`${faturaId}:${tipo}`);
    try {
      const r = await fetch("/api/mensalidade/cobranca", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ faturaId, tipo }),
      });
      const j = (await r.json().catch(() => ({}))) as { motivo?: string };
      if (r.ok) show(tipo === "pix" ? "Pix gerado. Pague pelo app do seu banco." : "Boleto gerado. Copie a linha e pague no seu banco.");
      else show(j.motivo ?? "Não foi possível gerar a cobrança agora.");
    } catch {
      show("Não foi possível falar com o servidor. Abra a tela de novo para ver se a cobrança saiu.");
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

  const aberta = estado.faturas.find((f) => f.situacao === "aberta") ?? null;
  const viva = (f: Fatura, tipo: TipoCobranca) =>
    estado.cobrancas.find((c) => c.fatura_id === f.id && c.tipo === tipo && VIVAS.includes(c.situacao));
  const recusa = (f: Fatura, tipo: TipoCobranca) => {
    const c = estado.cobrancas.find((x) => x.fatura_id === f.id && x.tipo === tipo);
    return c && c.situacao === "falhou" ? c : null;
  };

  return (
    <Card>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2 m-0">Mensalidade do Quattro</h2>
          <p className="m-0 text-caption text-muted leading-[1.5]">
            A fatura é emitida pela Quattro. Depois do pagamento, a Quattro confere o recebimento e o acesso é renovado por mais um mês.
          </p>
        </div>

        {aberta && (
          <div className="flex flex-col gap-4 rounded-md bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <span className="text-label text-ink">Fatura de <span className="tabular-nums">{mesDe(aberta.competencia)}</span></span>
                <span className="text-caption text-muted">
                  Vence em <span className="tabular-nums">{dataBR(aberta.vencimento)}</span>
                  {aberta.plano ? ` · ${aberta.plano}` : ""}
                </span>
              </div>
              <span className="text-h2 text-ink tabular-nums" data-num><BRL value={aberta.valor} /></span>
            </div>

            {!estado.liberada ? (
              <span className="text-caption text-muted leading-[1.5]">
                O pagamento por Pix e boleto nesta tela ainda não foi liberado. Fale com a Quattro para receber os dados de pagamento.
              </span>
            ) : (
              (["pix", "boleto"] as const).map((tipo) => {
                const c = viva(aberta, tipo);
                const r = !c ? recusa(aberta, tipo) : null;
                const rotulo = tipo === "pix" ? "Pix" : "Boleto";
                return (
                  <div key={tipo} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label text-ink">{rotulo}</span>
                      {c && c.situacao === "emitida" ? null : c ? (
                        <StatusBadge tone="warning">{c.situacao === "reservada" ? "Gerando" : "Não confirmada"}</StatusBadge>
                      ) : (
                        <Button variant="secondary" onClick={() => void gerar(aberta.id, tipo)} disabled={gerando !== null}>
                          {gerando === `${aberta.id}:${tipo}` ? "Gerando…" : `Gerar ${rotulo.toLowerCase()}`}
                        </Button>
                      )}
                    </div>
                    {c && c.situacao === "emitida" && tipo === "pix" && c.texto_qrcode && (
                      <div className="flex flex-col gap-2">
                        <span className="text-caption text-muted">Pix copia e cola</span>
                        <code className="block break-all rounded-sm bg-white p-2 text-caption text-ink">{c.texto_qrcode}</code>
                        <div className="flex justify-end">
                          <Button variant="secondary" onClick={() => void copiar(c.texto_qrcode!, "Pix copia e cola")}>Copiar Pix</Button>
                        </div>
                      </div>
                    )}
                    {c && c.situacao === "emitida" && tipo === "boleto" && c.linha_digitavel && (
                      <div className="flex flex-col gap-2">
                        <span className="text-caption text-muted">Linha digitável</span>
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
                    {r && (
                      <span className="text-caption text-muted leading-[1.5]">Última tentativa: {r.motivo ?? FRASE_DA_SITUACAO.falhou}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="flex flex-col">
          {estado.faturas.filter((f) => f !== aberta).slice(0, 12).map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 py-3 border-t border-border-soft first:border-t-0">
              <div className="flex flex-col gap-[2px]">
                <span className="text-label text-ink tabular-nums">{mesDe(f.competencia)}</span>
                <span className="text-caption text-muted">
                  {f.situacao === "paga" && f.acesso_ate
                    ? <>Acesso até <span className="tabular-nums">{dataBR(f.acesso_ate)}</span></>
                    : <>Venceu em <span className="tabular-nums">{dataBR(f.vencimento)}</span></>}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-label text-ink tabular-nums"><BRL value={f.valor} /></span>
                <StatusBadge tone={TOM_FATURA[f.situacao]}>{NOME_FATURA[f.situacao]}</StatusBadge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
