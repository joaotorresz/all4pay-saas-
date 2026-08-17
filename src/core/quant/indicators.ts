/**
 * calcularIndicadores() — o motor quantitativo. Pega caixa, a pagar, a
 * receber, recorrência, margem, crescimento, inadimplência e runway e
 * transforma em KPIs institucionais. Reaproveita os motores de
 * burn/runway/concentração/sazonalidade/inadimplência.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { calcularBurnRate } from "@/core/risk-engine/burn.engine";
import { calcularRunway } from "@/core/risk-engine/liquidez.engine";
import { calcularConcentracao } from "@/core/risk-engine/concentracao.engine";
import { calcularRiscoInadimplencia } from "@/core/risk-engine/inadimplencia.engine";
import { calcularSazonalidade } from "@/core/risk-engine/sazonalidade.engine";
import { runwayMeses as runwayMesesCanonico } from "@/core/indicadores";
import type { IndicadoresFinanceiros, VolatilidadeNivel } from "./types";
import { serieMensal, receitaRecorrente } from "./series";
import { clamp01, media, coefVariacao } from "./stat";

export function calcularIndicadores(input: RiskInput): IndicadoresFinanceiros {
  const burn = calcularBurnRate(input);
  const runway = calcularRunway(input.saldoAtual, burn);
  const conc = calcularConcentracao(input);
  const inad = calcularRiscoInadimplencia(input);
  const saz = calcularSazonalidade(input);
  const serie = serieMensal(input);

  // Balanço de curto prazo (proxy): caixa + a receber em aberto vs a pagar.
  const aReceberAberto = input.movements
    .filter((m) => m.type === "entrada" && m.status === "pendente")
    .reduce((s, m) => s + m.amount, 0);
  const aPagarAberto = input.movements
    .filter((m) => m.type === "saida" && m.status === "pendente")
    .reduce((s, m) => s + m.amount, 0);
  const ativoCirculante = input.saldoAtual + aReceberAberto;
  const liquidezCorrente = aPagarAberto > 0 ? ativoCirculante / aPagarAberto : ativoCirculante > 0 ? 3 : 0;

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * ⚠️ ESTAS SÃO MARGENS DE CAIXA, E O NOME PASSOU A DIZER ISSO.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Elas saem do `burn` de 90 dias — entradas e saídas LIQUIDADAS, pela data de
   * pagamento. Não são a margem operacional nem a margem líquida do DRE, que
   * são competência e passam por deduções, custo e resultado financeiro.
   *
   * ⚠️ **Este módulo NÃO migra para a cascata, de propósito** (`docs/auditoria.md`,
   * #8). O score de saúde pergunta "o caixa aguenta?", e para essa pergunta o
   * regime de caixa é a resposta CERTA — trocá-lo por competência tornaria o
   * score cego para o mês em que a receita existe e o dinheiro não entrou.
   *
   * O que estava errado não era a fonte: era o NOME. Duas coisas diferentes
   * chamadas "margem líquida" em telas diferentes é a mesma doença que a
   * cascata veio curar, só que pela via do rótulo. **Nenhum número muda de
   * significado sem mudar de nome** — então eles mudaram de nome, e a tela diz
   * o regime ao lado.
   */
  const margemCaixa90d = burn.receitaMensal > 0 ? burn.liquidoMensal / burn.receitaMensal : 0;
  const perdaInadimplencia = burn.receitaMensal * inad.overdueRatio;
  const eficienciaDeCaixa =
    burn.receitaMensal > 0 ? (burn.liquidoMensal - perdaInadimplencia) / burn.receitaMensal : 0;

  // Crescimento MoM (últimos dois meses com receita).
  const comReceita = serie.filter((p) => p.receita > 0);
  const ult = comReceita[comReceita.length - 1];
  const penult = comReceita[comReceita.length - 2];
  const crescimentoMensal = penult && penult.receita > 0 ? (ult.receita - penult.receita) / penult.receita : 0;

  // Burn multiple = queima / nova receita líquida.
  const novaReceita = ult && penult ? Math.max(0, ult.receita - penult.receita) : 0;
  const burnMultiple = burn.burnMensal <= 0 ? 0 : novaReceita > 0 ? burn.burnMensal / novaReceita : 99;

  // Eficiência operacional (0..10): receita / (despesa + perda).
  const custos = burn.despesaMensal + perdaInadimplencia;
  const ratioEfic = custos > 0 ? burn.receitaMensal / custos : burn.receitaMensal > 0 ? 2 : 0;
  const eficienciaOperacional = Math.round(clamp01(ratioEfic / 2) * 100) / 10;

  // ROIC (proxy): NOPAT anualizado / capital empregado.
  const nopat = burn.liquidoMensal * 12;
  const capital = input.saldoAtual + aReceberAberto;
  const roic = capital > 0 ? nopat / capital : 0;

  // Ticket médio (entradas realizadas).
  const entradas = input.movements.filter((m) => m.type === "entrada" && m.status === "pago");
  const ticketMedio = media(entradas.map((m) => m.amount));

  // Volatilidade do fluxo (CV do líquido mensal nos meses ativos).
  const liquidos = serie.filter((p) => p.receita > 0 || p.despesa > 0).map((p) => p.liquido);
  const volatilidadeFluxo = clamp01(coefVariacao(liquidos));
  const volatilidadeNivel: VolatilidadeNivel =
    volatilidadeFluxo < 0.3 ? "alta_previsibilidade" : volatilidadeFluxo < 0.7 ? "moderada" : "alta_volatilidade";

  // Sazonalidade (amplitude do índice mensal ativo).
  const indices = saz.indicePorMes.map((m) => m.indice).filter((v) => v > 0);
  const sazonalidade = indices.length ? clamp01((Math.max(...indices) - Math.min(...indices)) / 2) : 0;

  // Concentração / dependência.
  const concentracaoReceita = conc.topShare;
  const dependenciaCliente = conc.top.slice(0, 2).reduce((s, c) => s + c.share, 0);

  // Recorrência e qualidade de receita.
  const receitaRecorrentePct = receitaRecorrente(input);
  const qualidadeReceita = Math.round(
    clamp01(
      0.35 * receitaRecorrentePct +
        0.25 * (1 - volatilidadeFluxo) +
        0.2 * (1 - clamp01(inad.overdueRatio)) +
        0.2 * (1 - clamp01(concentracaoReceita)),
    ) * 100,
  );

  return {
    liquidezCorrente,
    // ⚠️ A conversão é UMA: dias ÷ 30, do canônico. O `>= 999 ? 24` daqui fazia
    // o quant dizer "24 meses" enquanto o motor de risco dizia 999 dias (33,3
    // meses) sobre a MESMA empresa — dois tetos diferentes para o mesmo "não
    // queima". O teto agora é só um, e mora em `core/indicadores`.
    runwayMeses: runwayMesesCanonico(input).valor,
    burnRate: burn.burnMensal,
    burnMultiple: Math.round(burnMultiple * 100) / 100,
    margemCaixa90d,
    eficienciaDeCaixa,
    receitaRecorrente: receitaRecorrentePct,
    crescimentoMensal,
    eficienciaOperacional,
    roic,
    ticketMedio,
    inadimplencia: inad.overdueRatio,
    concentracaoReceita,
    dependenciaCliente,
    volatilidadeFluxo,
    volatilidadeNivel,
    sazonalidade,
    qualidadeReceita,
    receitaMensal: burn.receitaMensal,
    despesaMensal: burn.despesaMensal,
  };
}
