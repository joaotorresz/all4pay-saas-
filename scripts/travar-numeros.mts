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
import { painelIndicadores } from "@/core/indicadores";
import { calcularCLT } from "@/core/folha";
import { INPUT_ORG, ESPERADO_JULHO, ESPERADO_MAIO, ESPERADO_JUNHO, HOJE_ORG } from "./fixture-org.mts";

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

console.log(fails === 0
  ? "✓ TODOS — números travados em literal conferido à mão\n"
  : `\n✗ ${fails} FALHA(S) — números travados\n`);
if (fails > 0) process.exit(1);
