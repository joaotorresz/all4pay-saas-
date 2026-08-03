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
import { EscopoDaTela } from "@/components/movimentacoes/EscopoDaTela";
import { janelaDoMesDe } from "@/core/indicadores";
import { BaseDoSaldo } from "@/components/movimentacoes/BaseDoSaldo";
import { useRiscoInput } from "./hooks";

export function MoneyFunnel({ direction }: { direction: "entrada" | "saida" }) {
  const { data: inp } = useRiscoInput();
  return (
    <div className="flex flex-col gap-5">
      {/* Esta tela é a leitura de FLUXO (resultado do período). A faixa declara
          isso e mostra ao lado o estoque de títulos, porque as duas telas
          respondem "quanto tenho a receber" com números diferentes — e as duas
          estão certas. Ver `EscopoDaTela`. */}
      <EscopoDaTela
        leitura="fluxo"
        janela={janelaDoMesDe(inp?.hoje ?? new Date().toISOString().slice(0, 10))}
        direcao={direction}
      />
      {/* ⚠️ Item 4 do mapa de consolidação: esta tela mostra a VARIAÇÃO do
          período, que não é um saldo — pode ser negativa. Declarar a base é o
          que impede a comparação com o fluxo de caixa de parecer divergência. */}
      <BaseDoSaldo
        base="variacao_janela"
        janela={janelaDoMesDe(inp?.hoje ?? new Date().toISOString().slice(0, 10))}
      />
      <ExtratoTransacoes direction={direction} />
    </div>
  );
}
