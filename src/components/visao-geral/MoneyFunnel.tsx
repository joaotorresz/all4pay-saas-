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
      <ExtratoTransacoes direction={direction} />
    </div>
  );
}
