"use client";

/**
 * O avatar de cada agente (e o da Quattro AI): o boneco de tricô de cada um
 * (pedido do dono, 04/11/2026), em `public/agentes/<id>.png`, 512px com
 * fundo transparente — nítido em tela retina até 170px.
 *
 * ⚠️ A cor de cada agente continua no DS (`--color-agente-*`, usada no chat);
 * o boneco já nasce nela.
 */
import type { IdAgente } from "@/core/agentes";

export const IMAGEM_AGENTE: Record<IdAgente | "quattro-ai", string> = {
  "quattro-ai": "/agentes/quattro-ai.png",
  cobranca: "/agentes/cobranca.png",
  conciliacao: "/agentes/conciliacao.png",
  contas_pagar: "/agentes/contas-pagar.png",
  caixa: "/agentes/caixa.png",
  fechamento: "/agentes/fechamento.png",
};

export function AvatarAgente({ agente, tamanho = 40 }: { agente: IdAgente | "quattro-ai"; tamanho?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={IMAGEM_AGENTE[agente]}
      alt=""
      aria-hidden
      data-avatar={agente}
      width={tamanho}
      height={tamanho}
      decoding="async"
      draggable={false}
      className="shrink-0 select-none object-contain"
      style={{ width: tamanho, height: tamanho }}
    />
  );
}
