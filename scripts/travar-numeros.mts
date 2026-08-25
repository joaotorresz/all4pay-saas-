/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVAR OS NÚMEROS — valor LITERAL, nunca calculado pela função auditada
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run travar
 *
 * ⚠️ **A regra que dá valor a este arquivo:** todo número esperado foi
 * calculado À MÃO a partir de `scripts/fixture-org.mts` e está escrito lá como
 * literal. Nenhum sai de uma execução do motor. Um teste que usa a função para
 * prever a função não pode discordar dela — é a tautologia do `resíduo = x − x`,
 * que este repositório já matou três vezes.
 *
 * ⚠️ E ele trava a LINHA, não só o total: se a receita fosse classificada como
 * custo, o resultado líquido continuaria certo e o DRE estaria errado. Por isso
 * cada nível da cascata tem seu literal.
 */
import { montarRelatorio, ESTRUTURA_DRE, ESTRUTURA_DFC } from "@/core/relatorios";
import {
  painelIndicadores, burn, runway, runwayMeses, geracaoCaixaMensal,
} from "@/core/indicadores";
import { saldoEm } from "@/core/indicadores/convencoes";
import { montarPainelContasReceber } from "@/core/contas-receber";
import { periodoMes } from "@/core/contas-pagar";
import { calcularCLT } from "@/core/folha";
import {
  INPUT_ORG, ESPERADO_JULHO, ESPERADO_MAIO, ESPERADO_JUNHO, ESPERADO_AGING, HOJE_ORG,
} from "./fixture-org.mts";

let fails = 0;
const eq = (nome: string, obtido: number | null | undefined, esperado: number, tol = 0.005) => {
  const ok = typeof obtido === "number" && Math.abs(obtido - esperado) <= tol;
  if (!ok) { fails++; console.log(`✗ FAIL ${nome}\n    esperado ${esperado}  ·  obtido ${obtido}`); }
};
const ok = (nome: string, cond: boolean, detalhe = "") => {
  if (!cond) { fails++; console.log(`✗ FAIL ${nome} ${detalhe}`); }
};

/** O valor de uma linha do relatório, na coluna do mês pedido. */
function linha(rel: ReturnType<typeof montarRelatorio>, id: string, mes: string): number | null {
  const l = rel.linhas.find((x) => x.id === id);
  if (!l) return null;
  const k = rel.colunas.indexOf(mes);
  return k < 0 ? null : l.celulas[k]?.valor ?? null;
}

console.log("\nTRAVAR OS NÚMEROS — literais conferidos à mão\n");

/* ── DRE, linha a linha, no mês CHEIO ─────────────────────────────────────── */
{
  const rel = montarRelatorio(INPUT_ORG, ESTRUTURA_DRE, {
    intervalo: { de: "2026-05-01", ate: "2026-07-31" }, regime: "competencia",
  } as never);

  for (const [id, esperado] of Object.entries(ESPERADO_JULHO)) {
    eq(`dre julho · ${id}`, linha(rel, id, "2026-07"), esperado);
  }
  // ⚠️ O mês NEGATIVO: o sinal tem de sobreviver à cascata. Um `Math.abs`
  // distraído em qualquer nível transforma prejuízo em lucro.
  for (const [id, esperado] of Object.entries(ESPERADO_MAIO)) {
    eq(`dre maio (negativo) · ${id}`, linha(rel, id, "2026-05"), esperado);
  }
  // ⚠️ O mês VAZIO: zero aqui é RESPOSTA (não houve movimento), e a coluna tem
  // de existir — pular o mês faria o relatório ligar maio a julho como se
  // junho não existisse.
  ok("dre: o mês sem movimento TEM coluna (não é pulado)",
     rel.colunas.includes("2026-06"), rel.colunas.join(","));
  for (const [id, esperado] of Object.entries(ESPERADO_JUNHO)) {
    eq(`dre junho (vazio) · ${id}`, linha(rel, id, "2026-06"), esperado);
  }

  // ⚠️ A CASCATA TEM DE FECHAR — e é conferida contra os literais, não contra
  // ela mesma: receita líquida = bruta − deduções, com os três números fixos.
  eq("dre: a cascata fecha (145.000 = 150.000 − 5.000)",
     (linha(rel, "receita_bruta", "2026-07") ?? 0) - (linha(rel, "deducoes", "2026-07") ?? 0),
     ESPERADO_JULHO.receita_liquida);
  eq("dre: EBITDA fecha (62.500 = 107.500 − 45.000)",
     (linha(rel, "margem_contribuicao", "2026-07") ?? 0) - (linha(rel, "despesas_operacionais", "2026-07") ?? 0),
     ESPERADO_JULHO.ebitda);

  // ⚠️ OS CENTAVOS: 52.265,44 e não 52.265,43 nem 52.265. É o único literal da
  // fixture que não é redondo, e existe para encostar no arredondamento.
  eq("dre: o resultado líquido carrega os CENTAVOS (52.265,44)",
     linha(rel, "resultado_liquido", "2026-07"), 52_265.44);
}

/* ── DFC: o mesmo dinheiro, pela data de CAIXA ────────────────────────────── */
{
  const dfc = montarRelatorio(INPUT_ORG, ESTRUTURA_DFC, {
    intervalo: { de: "2026-07-01", ate: "2026-07-31" }, regime: "caixa",
  } as never);
  // Em julho tudo que entrou/saiu foi liquidado no próprio mês, então as
  // entradas do DFC batem com a receita bruta do DRE — e os pendentes (que
  // vencem em julho mas não foram pagos) NÃO entram.
  eq("dfc julho · entradas de caixa = 150.000 (o pendente de 01/07 NÃO entra)",
     linha(dfc, "entradas_operacionais", "2026-07"), 150_000);
}

/* ── INDICADORES: burn, runway e resultado, com literais ──────────────────── */
{
  const p = painelIndicadores(INPUT_ORG, { de: "2026-07-01", ate: "2026-07-31" } as never);
  eq("indicadores · entradas de julho = 150.000", p.entradas?.valor, 150_000);
  // saídas de julho: 5.000 + 30.000 + 7.500 + 20.000 + 25.000 + 1.234,56 + 9.000
  eq("indicadores · saídas de julho = 97.734,56", p.saidas?.valor, 97_734.56);
  eq("indicadores · resultado = 52.265,44", p.resultado?.valor, 52_265.44);
}

/* ── FOLHA: faixa a faixa do INSS e do IRRF ───────────────────────────────── */
{
  // ⚠️ Literais conferidos à mão contra a tabela de 2025, faixa a faixa — os
  // mesmos três que o engine-audit já fixa, repetidos aqui de propósito: se
  // alguém "atualizar" a tabela sem querer, os dois arquivos reprovam.
  const piso = calcularCLT({ valor: 1_518 } as never, "2025-06", "simples" as never, "III" as never);
  eq("folha · INSS no piso (1.518) = 113,85", piso.inss, 113.85);

  const meio = calcularCLT({ valor: 5_000 } as never, "2025-06", "simples" as never, "III" as never);
  eq("folha · INSS progressivo em 5.000 = 509,60", meio.inss, 509.60);
  ok("folha · o INSS de 5.000 NÃO é 14% do salário (700) — é progressivo",
     Math.abs((meio.inss ?? 0) - 700) > 1, String(meio.inss));

  const teto = calcularCLT({ valor: 20_000 } as never, "2025-06", "simples" as never, "III" as never);
  eq("folha · INSS bate no TETO (951,63) e não cresce", teto.inss, 951.63);
}

/* ── DFC LINHA A LINHA — o mesmo julho, pela data de CAIXA ────────────────── */
/**
 * ⚠️ **Aqui o DFC deixa de ser conferido por um número só.** A trava antiga
 * checava apenas as entradas; com isso, uma saída classificada como
 * financiamento em vez de operacional deixaria o fluxo líquido certo e as duas
 * linhas do meio erradas — que é justamente o defeito que separa "a operação se
 * paga" de "a operação queima e o empréstimo tapa".
 *
 * Conferido à mão, sobre a fixture (todas as 9 linhas de julho liquidadas no
 * próprio mês):
 *   entradas operacionais ...  100.000,00 + 50.000,00 .......... 150.000,00
 *   saídas operacionais .....  5.000 + 30.000 + 7.500 + 20.000
 *                              + 25.000 + 9.000 ................  96.500,00
 *   fluxo operacional .......  150.000,00 − 96.500,00 ..........  53.500,00
 *   fluxo de investimentos ..  nada não operacional ............       0,00
 *   fluxo de financiamentos .  juros de empréstimo (saída) .....  −1.234,56
 *   fluxo líquido ...........  53.500,00 − 1.234,56 ............  52.265,44
 *
 * ⚠️ O `−1.234,56` é o caso que DISCRIMINA: os juros são a única linha que sai
 * do operacional, e é a presença dela que prova que `ehFinanceiro` foi
 * aplicado. Sem os juros, operacional e líquido seriam o mesmo número e a
 * separação não estaria sendo testada.
 */
{
  const dfc = montarRelatorio(INPUT_ORG, ESTRUTURA_DFC, {
    intervalo: { de: "2026-07-01", ate: "2026-07-31" }, regime: "caixa",
  } as never);
  eq("dfc julho · saídas operacionais = 96.500 (os juros NÃO estão aqui)",
     linha(dfc, "saidas_operacionais", "2026-07"), 96_500);
  eq("dfc julho · fluxo operacional = 53.500", linha(dfc, "fluxo_operacional", "2026-07"), 53_500);
  eq("dfc julho · fluxo de investimentos = 0", linha(dfc, "fluxo_investimento", "2026-07"), 0);
  eq("dfc julho · fluxo de financiamentos = −1.234,56 (com SINAL)",
     linha(dfc, "fluxo_financiamento", "2026-07"), -1_234.56);
  eq("dfc julho · fluxo líquido = 52.265,44", linha(dfc, "fluxo_liquido", "2026-07"), 52_265.44);

  // ⚠️ A separação tem de ser REAL: operacional ≠ líquido. Se alguém apagar o
  // classificador financeiro, os dois colam e este caso é o que denuncia.
  ok("dfc: operacional e líquido são DIFERENTES (a separação financeira existe)",
     Math.abs((linha(dfc, "fluxo_operacional", "2026-07") ?? 0) - (linha(dfc, "fluxo_liquido", "2026-07") ?? 0)) > 1_000);
}

/* ── EXTRATO: abertura e fechamento ───────────────────────────────────────── */
/**
 * ⚠️ **O saldo é reconstruído do saldo de HOJE para trás**, e é essa ponta que
 * faz o gráfico acumulado terminar no número do banco. Conferido à mão, com
 * hoje = 15/09/2026 e saldo atual de 80.000,00:
 *
 *   variação de julho (tudo liquidado no mês) ......  +52.265,44
 *   variação de maio (10.000 − 18.000) .............   −8.000,00
 *
 *   abertura de julho  (30/06) = 80.000,00 − 52.265,44 = 27.734,56
 *   fechamento de julho (31/07) = 80.000,00 − 0        = 80.000,00
 *   antes de maio      (30/04) = 80.000,00 − 44.265,44 = 35.734,56
 *
 * ⚠️ **E a identidade que amarra os dois motores:** abertura + fluxo líquido do
 * DFC = fechamento. Os dois lados saem de arquivos diferentes (`convencoes` e
 * `relatorios`), então esta igualdade é uma reconciliação de verdade, não uma
 * tautologia — se um dos dois mudar de convenção, ela reprova.
 */
{
  eq("extrato · abertura de julho (30/06) = 27.734,56", saldoEm(INPUT_ORG, "2026-06-30"), 27_734.56);
  eq("extrato · fechamento de julho (31/07) = 80.000", saldoEm(INPUT_ORG, "2026-07-31"), 80_000);
  eq("extrato · antes de maio (30/04) = 35.734,56", saldoEm(INPUT_ORG, "2026-04-30"), 35_734.56);

  const dfc = montarRelatorio(INPUT_ORG, ESTRUTURA_DFC, {
    intervalo: { de: "2026-07-01", ate: "2026-07-31" }, regime: "caixa",
  } as never);
  eq("extrato · abertura + fluxo líquido = fechamento (dois motores concordam)",
     saldoEm(INPUT_ORG, "2026-06-30") + (linha(dfc, "fluxo_liquido", "2026-07") ?? 0), 80_000);

  /**
   * ⚠️ **O FUTURO SÓ CONTA O QUE AINDA VAI VENCER.** Em 30/09 entram o
   * recebível de 30/09 (+4.000) e a conta de 25/09 (−1.500); os pendentes
   * VENCIDOS de agosto (3.000 e 2.000) ficam de fora, porque a regra é
   * `vencimento >= hoje`. É uma escolha, não um esquecimento — e travá-la aqui
   * impede que alguém a inverta achando que "vencido também vai entrar".
   */
  eq("extrato · projeção até 30/09 = 82.500 (o vencido de agosto NÃO entra)",
     saldoEm(INPUT_ORG, "2026-09-30"), 82_500);
}

/* ── BURN, GERAÇÃO DE CAIXA E RUNWAY ──────────────────────────────────────── */
/**
 * ⚠️ **As janelas têm 30 dias EXATOS de propósito.** `burn` divide por
 * `diasDe(janela)/30`; com um mês de 31 dias o resultado vira 7.741,935…, e um
 * literal com reticências não é um literal — ou se arredonda (e o teste passa a
 * tolerar o que deveria travar) ou se escreve errado. Trinta dias fazem o
 * divisor valer 1 e a conta caber numa linha.
 *
 *   maio (01/05→30/05): 10.000,00 − 18.000,00 = −8.000,00
 *     burn ....... 8.000,00/mês        (o sinal vira, com piso em zero)
 *     geração .... −8.000,00/mês       (o mesmo número, COM sinal)
 *     runway ..... 80.000,00 ÷ (8.000,00 ÷ 30) = 300 dias = 10 meses
 *
 *   julho (01/07→30/07): +52.265,44
 *     burn ....... 0,00                (piso: quem gera caixa não queima)
 *     runway ..... INDISPONÍVEL, código `sem_queima`
 */
{
  const jMaio = { de: "2026-05-01", ate: "2026-05-30", label: "maio", vazia: false } as never;
  eq("burn · maio = 8.000,00/mês", burn(INPUT_ORG, jMaio).valor, 8_000);
  eq("geração de caixa · maio = −8.000,00/mês (o MESMO número, com sinal)",
     geracaoCaixaMensal(INPUT_ORG, jMaio).valor, -8_000);
  eq("runway · maio = 300 dias", runway(INPUT_ORG, jMaio).valor, 300);
  eq("runway · maio = 10 meses", runwayMeses(INPUT_ORG, jMaio).valor, 10);

  const jJulho = { de: "2026-07-01", ate: "2026-07-30", label: "julho", vazia: false } as never;
  eq("burn · julho = 0 (piso — quem gera caixa não queima)", burn(INPUT_ORG, jJulho).valor, 0);
  eq("geração de caixa · julho = +52.265,44", geracaoCaixaMensal(INPUT_ORG, jJulho).valor, 52_265.44);

  /**
   * ⚠️ **O caso que a ONDA 4 existe para proteger.** Sem queima, o runway não é
   * um número grande: ele é INDISPONÍVEL, com código. Um teto devolvido aqui
   * foi o "33 meses de fôlego" ao lado de burn zero. E o código importa mais
   * que a frase — `sem_queima` e `caixa_negativo` produzem ambos ausência e são
   * o oposto um do outro.
   */
  const rJulho = runway(INPUT_ORG, jJulho);
  ok("runway · julho é INDISPONÍVEL, não um teto", rJulho.indisponivel != null, String(rJulho.valor));
  ok("runway · o código é `sem_queima` (não `caixa_negativo`)",
     rJulho.indisponivel?.codigo === "sem_queima", rJulho.indisponivel?.codigo);
  ok("runway · maio e julho dão respostas DIFERENTES (o caso discrimina)",
     runway(INPUT_ORG, jMaio).indisponivel == null && rJulho.indisponivel != null);
}

/* ── AGING DE RECEBÍVEIS ──────────────────────────────────────────────────── */
/**
 * ⚠️ **A idade do atraso, faixa a faixa, em 15/09/2026** — conferida à mão:
 *   vence 01/08 → 45 dias de atraso → faixa 31–60 ......... 3.000,00
 *   vence 31/08 → 15 dias de atraso → faixa até 30 ........ 2.000,00
 *   vence 30/09 → ainda a vencer ......................... (fora do atraso)
 *
 * ⚠️ E o caso que separa as faixas: os dois vencidos têm VALORES DIFERENTES de
 * propósito. Se ambos valessem 2.500, uma troca de faixa manteria o total e o
 * teste ficaria verde sobre a classificação errada.
 */
{
  const painel = montarPainelContasReceber(INPUT_ORG, { periodo: periodoMes("2026-09", HOJE_ORG) } as never);
  const faixa = (id: string) => painel.envelhecimento.find((f) => f.faixa === id)?.valor ?? null;
  eq("aging · até 30 dias = 2.000 (o de 31/08, 15 dias de atraso)", faixa("ate_30"), ESPERADO_AGING.ate30);
  eq("aging · 31 a 60 dias = 3.000 (o de 01/08, 45 dias de atraso)", faixa("de_31_a_60"), ESPERADO_AGING.de31a60);
  eq("aging · 61 a 90 dias = 0", faixa("de_61_a_90"), 0);
  eq("aging · mais de 90 dias = 0", faixa("acima_90"), 0);
  ok("aging · as duas faixas ocupadas têm valores DIFERENTES (o caso discrimina)",
     faixa("ate_30") !== faixa("de_31_a_60"));
  eq("aging · vencido total = 5.000 (2.000 + 3.000)",
     (faixa("ate_30") ?? 0) + (faixa("de_31_a_60") ?? 0), ESPERADO_AGING.vencidoTotal);
}

/* ── PROVISÃO POR REGIME ──────────────────────────────────────────────────── */
/**
 * ⚠️ **O salário NÃO é o custo, e a diferença é o REGIME.** Sobre 5.000,00 de
 * bruto, conferido à mão contra a tabela de 2025:
 *
 *   Simples, Anexo III (a CPP está dentro do DAS — nada por fora):
 *     bruto 5.000,00 + FGTS 400,00 + 13º 416,67 + FGTS s/ 13º 33,33
 *     + férias 416,67 + 1/3 138,89 + FGTS s/ férias 44,44 ⇒ 6.450,01
 *
 *   Lucro Presumido (a contribuição patronal é recolhida POR FORA):
 *                                                        ⇒ 8.122,23
 *
 * A diferença — 1.672,22, mais de 25% do bruto — é a razão de o regime não
 * poder ser um palpite. Estes dois literais são travados TAMBÉM no
 * `engine-audit`, de propósito: se alguém "atualizar" a tabela sem querer, os
 * dois arquivos reprovam, e um conserto que silencie um deixa o outro vermelho.
 */
{
  const simplesIII = calcularCLT({ valor: 5_000 } as never, "2025-06", "simples" as never, "III" as never);
  const presumido = calcularCLT({ valor: 5_000 } as never, "2025-06", "presumido" as never, undefined as never);
  eq("provisão · custo no Simples III = 6.450,01", simplesIII.custoTotal, 6_450.01);
  eq("provisão · custo no Lucro Presumido = 8.122,23", presumido.custoTotal, 8_122.23);
  ok("provisão · o regime MUDA o custo (o caso discrimina)",
     Math.abs((presumido.custoTotal ?? 0) - (simplesIII.custoTotal ?? 0)) > 1_000,
     `${simplesIII.custoTotal} × ${presumido.custoTotal}`);
  // ⚠️ O bruto é o MESMO nos dois: o que muda é o que a empresa paga POR CIMA.
  eq("provisão · o BRUTO não muda com o regime", presumido.bruto, simplesIII.bruto ?? 0);
}

console.log(fails === 0
  ? "✓ TODOS — números travados em literal conferido à mão\n"
  : `\n✗ ${fails} FALHA(S) — números travados\n`);
if (fails > 0) process.exit(1);
