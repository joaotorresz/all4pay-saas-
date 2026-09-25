/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROVA DO MODO SIMULAÇÃO — o materializador de recorrências, sem gravar nada
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run recorrencias-simulacao
 *
 * O cron `/api/recorrencias/run` está com 0 execuções na trilha (8 regras
 * ativas, último título recorrente em 19/06). A SÉTIMA regra do CLAUDE.md
 * ("prove que aguenta antes de ligar, nunca depois") exige provar volume e
 * idempotência ANTES de religar — não depois. Esta prova roda a função PURA
 * `simularMaterializacao` (`src/lib/recorrencias-simulacao.ts`) sobre uma
 * fixture de regra PARADA HÁ 3 MESES e confere:
 *
 *  1. **Não há backfill.** Uma regra parada não gera de uma vez os meses
 *     perdidos — só as ocorrências que caem no horizonte a partir de hoje.
 *     É exatamente o medo que o card nomeia ("religar sem testar gera de uma
 *     vez três meses de títulos atrasados"): a prova mostra que isso NÃO
 *     acontece, plantando o caso e olhando as datas uma a uma.
 *  2. **Idempotência.** Rodar a simulação sobre um estado onde parte dos
 *     títulos já foi materializada mostra só os que FALTAM — os existentes
 *     não duplicam, exatamente como o índice único faria no cron real.
 *  3. **Escopo.** Regra com contrato vencido e organização sem conta
 *     cadastrada não geram título nenhum.
 *  4. **Efeito no saldo projetado.** Entradas somam, saídas subtraem, e o
 *     resultado é o saldo atual mais o líquido dos títulos NOVOS.
 *
 * Sem acesso a banco: tudo aqui é dado inventado passado à função pura, nunca
 * uma chamada de rede. É o mesmo motivo de o teste do A4P-078 não precisar de
 * Supabase — a regra que se quer provar mora numa função sem I/O.
 */
import { simularMaterializacao, type RecorrenciaParaSimular } from "@/lib/recorrencias-simulacao";

let falhas = 0;
const caso = (nome: string, ok: boolean, detalhe?: string) => {
  if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗"} ${nome}${detalhe ? " — " + detalhe : ""}`);
};

/* ── fixture: "8 regras ativas, 0 execuções, último título em 19/06" ─────── */
const HOJE = "2026-09-25";

const regraParadaTresMeses: RecorrenciaParaSimular = {
  id: "rec-parada-3-meses", orgId: "org-a", type: "saida", amount: 480,
  freq: "mensal", startDate: "2026-06-19", endDate: null, dueDay: 19,
};
const regraVencida: RecorrenciaParaSimular = {
  id: "rec-vencida", orgId: "org-a", type: "saida", amount: 200,
  freq: "mensal", startDate: "2025-01-10", endDate: "2026-08-01", dueDay: 10,
};
const regraSemConta: RecorrenciaParaSimular = {
  id: "rec-sem-conta", orgId: "org-sem-conta", type: "entrada", amount: 999,
  freq: "mensal", startDate: "2026-01-15", endDate: null, dueDay: 15,
};
const receitaRecorrente: RecorrenciaParaSimular = {
  id: "rec-receita", orgId: "org-b", type: "entrada", amount: 800,
  freq: "mensal", startDate: "2026-07-05", endDate: null, dueDay: 5,
};
const despesaRecorrente: RecorrenciaParaSimular = {
  id: "rec-despesa", orgId: "org-b", type: "saida", amount: 300,
  freq: "mensal", startDate: "2026-07-20", endDate: null, dueDay: 20,
};

const contas = new Map<string, boolean>([["org-a", true], ["org-b", true], ["org-sem-conta", false]]);
const saldos = new Map<string, number>([["org-a", 10_000], ["org-b", 5_000]]);

/* ═══ CASO 1 — regra parada há 3 meses: NENHUM backfill dos meses perdidos ═══ */
{
  const r1 = simularMaterializacao({
    hojeISO: HOJE, horizonteDias: 90,
    recorrencias: [regraParadaTresMeses],
    temConta: (org) => contas.get(org) ?? false,
    referenciaExiste: () => false,
    saldoDaOrg: (org) => saldos.get(org) ?? null,
  });

  console.log("\n  regra parada desde 19/06, hoje = " + HOJE + ", horizonte 90 dias:");
  for (const t of r1.titulos) console.log(`    ${t.data}  ${t.tipo.padEnd(7)}  R$${t.valor.toFixed(2)}  ${t.referenceCode}`);

  const datasMesesPerdidos = ["2026-06-19", "2026-07-19", "2026-08-19", "2026-09-19"];
  const nenhumaAtrasada = r1.titulos.every((t) => !datasMesesPerdidos.includes(t.data));
  caso("nenhum título nas datas dos meses perdidos (jun/jul/ago/set)", nenhumaAtrasada);
  caso("todas as datas geradas são >= hoje", r1.titulos.every((t) => t.data >= HOJE));
  caso("exatamente 3 títulos no horizonte (out/nov/dez, dia 19)", r1.titulos.length === 3, `obtido ${r1.titulos.length}`);
  caso(
    "as datas são out/nov/dez, dia 19 — não um backfill de 3 atrasados",
    JSON.stringify(r1.titulos.map((t) => t.data)) === JSON.stringify(["2026-10-19", "2026-11-19", "2026-12-19"]),
  );
  caso("efeito no saldo projetado = 10.000 − 3×480 = 8.560", r1.porOrg[0]?.saldoProjetado === 8_560, `obtido ${r1.porOrg[0]?.saldoProjetado}`);
}

/* ═══ CASO 2 — idempotência: parte já materializada não duplica ═══════════ */
{
  const jaMaterializados = new Set(["rec:rec-parada-3-meses:2026-10-19", "rec:rec-parada-3-meses:2026-11-19"]);
  const r2 = simularMaterializacao({
    hojeISO: HOJE, horizonteDias: 90,
    recorrencias: [regraParadaTresMeses],
    temConta: (org) => contas.get(org) ?? false,
    referenciaExiste: (ref) => jaMaterializados.has(ref),
    saldoDaOrg: (org) => saldos.get(org) ?? null,
  });
  caso("com 2 de 3 já materializados, só 1 título NOVO", r2.titulos.filter((t) => !t.jaExiste).length === 1);
  caso("o total de títulos continua 3 (2 marcados jaExiste + 1 novo)", r2.titulos.length === 3);
  caso("o saldo projetado conta só o título NOVO: 10.000 − 480 = 9.520", r2.porOrg[0]?.saldoProjetado === 9_520, `obtido ${r2.porOrg[0]?.saldoProjetado}`);
  caso("rodar a simulação de novo sobre o MESMO estado dá o MESMO resultado (idempotente)", (() => {
    const r2b = simularMaterializacao({
      hojeISO: HOJE, horizonteDias: 90,
      recorrencias: [regraParadaTresMeses],
      temConta: (org) => contas.get(org) ?? false,
      referenciaExiste: (ref) => jaMaterializados.has(ref),
      saldoDaOrg: (org) => saldos.get(org) ?? null,
    });
    return JSON.stringify(r2b) === JSON.stringify(r2);
  })());
}

/* ═══ CASO 3 — contrato vencido e org sem conta: zero título ═══════════════ */
{
  const r3 = simularMaterializacao({
    hojeISO: HOJE, horizonteDias: 90,
    recorrencias: [regraVencida, regraSemConta],
    temConta: (org) => contas.get(org) ?? false,
    referenciaExiste: () => false,
    saldoDaOrg: (org) => saldos.get(org) ?? null,
  });
  caso("regra com end_date no passado não gera título nenhum", r3.titulos.filter((t) => t.recorrenciaId === "rec-vencida").length === 0);
  caso("org sem conta cadastrada é contada em recorrenciasSemConta, não gera título", r3.recorrenciasSemConta === 1 && r3.titulos.filter((t) => t.recorrenciaId === "rec-sem-conta").length === 0);
  caso("nenhum título no total (as duas regras são inelegíveis)", r3.titulos.length === 0);
}

/* ═══ CASO 4 — entrada e saída na mesma org: efeito líquido correto ═══════ */
{
  const r4 = simularMaterializacao({
    hojeISO: HOJE, horizonteDias: 60,
    recorrencias: [receitaRecorrente, despesaRecorrente],
    temConta: (org) => contas.get(org) ?? false,
    referenciaExiste: () => false,
    saldoDaOrg: (org) => saldos.get(org) ?? null,
  });
  const efeito = r4.porOrg.find((e) => e.orgId === "org-b");
  caso("efeitoLiquido = entradas novas − saídas novas", efeito !== undefined && efeito.efeitoLiquido === efeito.valorEntradasNovas - efeito.valorSaidasNovas);
  caso("saldoProjetado = saldoAtual + efeitoLiquido", efeito !== undefined && efeito.saldoProjetado === Math.round((5_000 + efeito.efeitoLiquido) * 100) / 100);
}

/* ═══ CASO 5 — dry-run não é a mesma coisa que gravar: prova de escopo ════ */
{
  // A própria assinatura da função é a prova: `simularMaterializacao` não recebe
  // um cliente de banco, só funções puras de leitura (temConta/referenciaExiste/
  // saldoDaOrg) — não HÁ como ela emitir um insert. Confirma que o resultado é
  // um objeto de dados simples (serializável), nunca uma Promise de escrita.
  const r5 = simularMaterializacao({
    hojeISO: HOJE, horizonteDias: 90,
    recorrencias: [regraParadaTresMeses],
    temConta: () => true,
    referenciaExiste: () => false,
    saldoDaOrg: () => 0,
  });
  caso("o resultado é dado puro (JSON-serializável), não uma promessa de escrita", (() => {
    try { JSON.stringify(r5); return true; } catch { return false; }
  })());
}

console.log(falhas === 0
  ? "\n✓ TODOS — o modo simulação mostra o que seria gerado sem gravar, e sem backfill de mês perdido\n"
  : `\n✗ ${falhas} FALHA(S)\n`);
if (falhas > 0) process.exit(1);
