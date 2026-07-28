"use client";

/**
 * Funil de dinheiro (Receber / Pagar) — hoje é UMA tela só: o **extrato de
 * transações** (`ExtratoTransacoes`), onde a baixa acontece na própria linha
 * (clicar → confirmar pagamento/recebimento → anexar comprovante).
 *
 * As abas "Pagar"/"Receber" (execução em lote) e "Títulos" saíram: eram três
 * lugares para a MESMA operação, e a baixa na linha cobre o caso. As rotas
 * antigas (`/recebiveis`, `/pagaveis`) e os deep-links `?aba=` caem nesta tela
 * — o parâmetro é simplesmente ignorado.
 */
import { ExtratoTransacoes } from "./ExtratoTransacoes";

export function MoneyFunnel({ direction }: { direction: "entrada" | "saida" }) {
  return <ExtratoTransacoes direction={direction} />;
}
