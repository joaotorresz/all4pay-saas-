/**
 * depreciacao-unica — o bem pesa UMA vez no resultado (Fase 3.4 do plano,
 * 04/11/2026).
 *
 *   npm run depreciacao-unica        (dentro de npm test)
 *
 * O risco declarado na Rodada 4: a compra do bem entrava no razão como
 * despesa cheia e o cronograma lançava a depreciação por cima. Um lote de
 * notebooks de R$ 18.000 depreciado em 36 meses virava R$ 36.000 de despesa.
 * Agora o cronograma aponta a compra (`movimentoId`), e o razão leva a compra
 * ao ATIVO. A guarda reprova se alguém desfizer:
 *
 *   VALOR (o razão de uma empresa com uma compra e um cronograma)
 *   1. ao fim da vida útil, a despesa do bem é R$ 18.000 (só a depreciação),
 *      e o imobilizado tem R$ 18.000 com R$ 18.000 de depreciação acumulada;
 *   2. o razão continua fechando (débito = crédito);
 *   3. SEM o vínculo, a mesma conta dá R$ 36.000 — a guarda sabe ver o dobro
 *      (o teste negativo fica, para a asserção 1 não passar por acaso);
 *   4. uma ENTRADA com o id de um cronograma não vira ativo.
 *
 *   FORMA (o caminho de volta do defeito)
 *   5. lib/ledger passa as compras do ativo ao derivar o razão;
 *   6. o formulário exige a resposta "qual compra" e mostra a recusa real;
 *   7. lib/schedules grava e lê `movement_id`, e a demonstração recusa a
 *      mesma compra em dois cronogramas (a regra do banco);
 *   8. a migration tem o índice único entre os vivos e a conferência de
 *      empresa e de saída, e o CI roda `scripts/cronograma-compra.sql`.
 *
 * ⚠️ Os números esperados são literais (18.000 e 36.000); a soma da despesa é
 * feita aqui, linha a linha, sem `dreDoRazao` (regra 11).
 */
import { readFileSync } from "node:fs";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { lancamentosDeMovimentos, tipoConta } from "@/core/ledger/chart";
import { comprasDoAtivo, lancamentoDoMes, type Cronograma } from "@/core/schedules";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${det ? ` — ${det}` : ""}`); }
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/* ── a empresa: uma compra paga e um cronograma de 36 meses ─────────────── */
const compra: RiskMovement = {
  id: "mov-notebooks", type: "saida", status: "pago", amount: 18000,
  due_date: "2026-01-10", paid_date: "2026-01-10", category: "Equipamentos de TI",
};
const venda: RiskMovement = {
  id: "mov-venda", type: "entrada", status: "pago", amount: 50000,
  due_date: "2026-01-15", paid_date: "2026-01-15", category: "Vendas",
};
const input = { movements: [compra, venda] } as unknown as RiskInput;
const cronograma: Cronograma = {
  id: "cr-notebooks", tipo: "depreciacao", descricao: "Notebooks (lote)",
  valorTotal: 18000, residual: 0, meses: 36, inicio: "2026-01-01",
  categoria: "Equipamentos de TI", movimentoId: compra.id,
};

type Linha = { conta: string; debito: number; credito: number };
function razao(cronogramas: Cronograma[], entrada = input): Linha[][] {
  const derivados = lancamentosDeMovimentos(entrada, undefined, comprasDoAtivo(cronogramas))
    .map((e) => e.lines.map((l) => ({ conta: l.accountId, debito: l.debit ?? 0, credito: l.credit ?? 0 })));
  // O lançamento mensal do cronograma, como a tela posta (4.3.01 × 1.2.99).
  const mensais: Linha[][] = [];
  for (let i = 0; i < 36; i++) {
    const d = new Date(2026, i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const l = lancamentoDoMes(cronogramas, mes);
    if (l.total > 0) mensais.push([
      { conta: "4.3.01", debito: l.porTipo.depreciacao, credito: 0 },
      { conta: "1.2.99", debito: 0, credito: l.total },
    ]);
  }
  return [...derivados, ...mensais];
}
const despesa = (ls: Linha[][]) => r2(ls.flat().filter((l) => tipoConta(l.conta) === "expense").reduce((s, l) => s + l.debito - l.credito, 0));
const saldo = (ls: Linha[][], conta: string) => r2(ls.flat().filter((l) => l.conta === conta).reduce((s, l) => s + l.debito - l.credito, 0));

console.log("\nvalor");
const ligado = razao([cronograma]);
ok("1. com o vínculo, a despesa do bem na vida útil é R$ 18.000", despesa(ligado) === 18000, `deu ${despesa(ligado)}`);
ok("1. o imobilizado (1.2.01) recebe a compra: R$ 18.000", saldo(ligado, "1.2.01") === 18000, `deu ${saldo(ligado, "1.2.01")}`);
ok("1. a depreciação acumulada (1.2.99) fecha o valor do bem", saldo(ligado, "1.2.99") === -18000, `deu ${saldo(ligado, "1.2.99")}`);
const totD = r2(ligado.flat().reduce((s, l) => s + l.debito, 0));
const totC = r2(ligado.flat().reduce((s, l) => s + l.credito, 0));
ok("2. o razão fecha (débito = crédito)", totD === totC, `${totD} × ${totC}`);

const solto = razao([{ ...cronograma, movimentoId: null }]);
ok("3. sem o vínculo a conta dá R$ 36.000 (a guarda vê o dobro)", despesa(solto) === 36000, `deu ${despesa(solto)}`);

const entradaLigada = razao([{ ...cronograma, movimentoId: venda.id }]);
ok("4. uma entrada não vira ativo", saldo(entradaLigada, "1.2.01") === 0 && saldo(entradaLigada, "1.1.05") === 0);

console.log("\nforma");
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ledger = semComentario(readFileSync("src/lib/ledger.ts", "utf8"));
ok("5. lib/ledger deriva o razão com as compras do ativo",
   /lancamentosDeMovimentos\(input,[\s\S]{0,160}comprasDoAtivo\(cronogramas\)\)/.test(ledger),
   "sem isso a compra ligada volta para a despesa");
const chart = semComentario(readFileSync("src/core/ledger/chart.ts", "utf8"));
ok("5. a regra do razão só leva SAÍDA ao ativo",
   /m\.type === "saida" && contaDoAtivo\?\.get\(m\.id\)/.test(chart));

const view = semComentario(readFileSync("src/components/cronogramas/CronogramasView.tsx", "utf8"));
ok("6. o formulário pergunta a compra do bem", /label="Compra do bem"/.test(view));
ok("6. salvar sem responder é recusado", /draft\.movimentoId === undefined\) \{ setErroSalvar/.test(view));
ok("6. a recusa do banco vai para a tela", /catch \(e\) \{ setErroSalvar\(\(e as Error\)\.message\)/.test(view));

const sched = semComentario(readFileSync("src/lib/schedules.ts", "utf8"));
ok("7. lib/schedules lê e grava movement_id",
   /movimentoId: r\.movement_id/.test(sched) && /movement_id: c\.movimentoId/.test(sched) && /periods,movement_id"/.test(sched));
ok("7. lib/schedules não engole a recusa", /if \(error\) \{/.test(sched) && !/^\s*(?:if \(c\.id\) |else )?await sb\.from\("schedules"\)\.(update|insert)\(row\)/m.test(sched));
ok("7. a demonstração recusa a mesma compra em dois cronogramas",
   /if \(c\.movimentoId && list\.some\(\(x\) => x\.id !== c\.id && x\.movimentoId === c\.movimentoId\)\) \{\s*throw/.test(sched));

const mig = readFileSync("supabase/migrations/20261104100000_cronograma_compra_do_bem.sql", "utf8");
ok("8. migration: uma compra por cronograma vivo",
   /create unique index if not exists schedules_uma_compra_por_cronograma[\s\S]*?where movement_id is not null and excluido_em is null/.test(mig));
ok("8. migration: confere empresa e saída", /is distinct from new\.org_id/.test(mig) && /v_tipo <> 'saida'/.test(mig));
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
ok("8. o CI roda a guarda de banco", /-f scripts\/cronograma-compra\.sql/.test(ci));

if (falhas > 0) {
  console.log(`\n✗ depreciacao-unica: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ depreciacao-unica: a compra ligada vai ao ativo, e o bem pesa uma vez no resultado\n");
