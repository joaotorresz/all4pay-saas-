/**
 * engine-audit — guarda de regressão dos bugs de correção achados na auditoria
 * multi-motor (plataforma, reconciliação, event-store, fdip, risco/decisão).
 * Cada asserção ancora um bug real já corrigido; se algum voltar, isto falha.
 *
 *   npm run audit   (também roda dentro de npm test)
 */
import { LedgerCore } from "@/core/platform/ledger-core";
import { FinancialQueue } from "@/core/platform/queue";
import { reconciliarAutomaticamente } from "@/core/financial-os/reconciliation.engine";
import type { FinancialTransaction } from "@/core/financial-os/types";
import { calcularRiskMatrix } from "@/core/decision/risk-matrix";
import { parseTexto } from "@/core/fdip/engine";
// (parseTexto reusado abaixo para os guards de parsing pt-BR/OFX)
import { TrilhaAuditoria, analisarMudanca } from "@/core/institutional/audit";
import { montarFluxoCaixa } from "@/core/cashflow";
import { dreProjetado, dreGerencial } from "@/core/dre/engine";
import { analisarQuantitativo } from "@/core/quant";
import { analisarInadimplencia } from "@/core/risk";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { appendImported, setImported, clearImported, importedMovements, importedAccounts } from "@/lib/imported";
import { responderLocal } from "@/core/assistant/engine";
import { buscarKB } from "@/lib/assistant-kb";
import { validateCPF, validateCNPJ, maskDoc } from "@/lib/validators";
import { simularAquisicao, situacaoDe, taxaImplicita } from "@/core/aquisicao";
import { extrairCNPJ, extrairCPF, categoriaPorCNAE, cnpjValido, normalizarCNAE } from "@/core/cnae";
import { brlParts, formatBRL } from "@/lib/format";
import { dailyCashflow } from "@/lib/aggregations";
import { simularFinanciamento, antecipar, equivalenteAnual, equivalenteMensal } from "@/core/financing";
import { precoPorMargem, precoPorMarkup, analisarPreco, pontoEquilibrioUnidades, precoComImpostos } from "@/core/pricing";
import { valorFuturo, payback, tempoParaMeta } from "@/core/investment";
import { provisaoTrabalhista } from "@/core/payroll";
import { calcularSimplesNacional } from "@/core/tax";
import { calcularMora } from "@/core/late-fee";
import type { Movement } from "@/lib/types";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

let fails = 0;
const ok = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`✗ FAIL ${n} ${x}`); } };

// ── platform/ledger-core: guarda de duplo estorno ──────────────────────────
{
  const lc = new LedgerCore();
  const tx = lc.postar("r1", "venda", [
    { accountCode: "1.1", direction: "debit", amount: 1000 },
    { accountCode: "3.1", direction: "credit", amount: 1000 },
  ]);
  const est = lc.reverter(tx.id);
  let t1 = false; try { lc.reverter(tx.id); } catch { t1 = true; }
  ok("ledger: reverter 2x a mesma tx lança", t1);
  let t2 = false; try { lc.reverter(est.id); } catch { t2 = true; }
  ok("ledger: estornar um estorno lança", t2);
  ok("ledger: saldo derivado zera após 1 estorno", Math.abs(lc.saldo("1.1")) < 1e-6);
}

// ── platform/queue: self-heal (esgota → replay zera tentativas → conclui) ───
{
  const q = new FinancialQueue();
  const job = q.enfileirar("k1", "pix", 500, undefined, 4);
  let last = job;
  while (last.status !== "concluido" && last.status !== "falha") last = q.processar(job.id, () => { throw new Error("PSP down"); });
  ok("queue: esgota tentativas → falha", last.status === "falha" && last.tentativas === 4);
  q.replay(job.id);
  const re = q.jobs().find((j) => j.id === job.id)!;
  ok("queue: replay zera tentativas e reabre", re.status === "pendente" && re.tentativas === 0);
  let last2 = re;
  while (last2.status !== "concluido" && last2.status !== "falha") last2 = q.processar(job.id, () => {});
  ok("queue: após replay, handler OK → concluido", last2.status === "concluido");
}

// ── reconciliation: simData NaN + greedy runner-up ─────────────────────────
{
  const tx = (o: Partial<FinancialTransaction>): FinancialTransaction =>
    ({ id: Math.random().toString(36).slice(2), tipo: "entrada", valor: 1000, data: "2026-06-15", descricao: "x", contraparte: "ACME LTDA", documento: "NF123", categoria: "vendas", ...o }) as FinancialTransaction;
  const r1 = reconciliarAutomaticamente([tx({ data: "" })], [tx({ id: "L1" })]);
  const only1 = [...r1.auto, ...r1.sugestoes, ...r1.excecoes][0];
  ok("recon: data vazia não vira NaN no confidence", Number.isFinite(only1.confidence));
  const txA = tx({ id: "A", documento: "D1", contraparte: "ALFA", data: "2026-06-10" });
  const txB = tx({ id: "B", documento: "D1", contraparte: "ALFA", data: "2026-06-10" });
  const L1 = tx({ id: "L1", documento: "D1", contraparte: "ALFA", data: "2026-06-10" });
  const L2 = tx({ id: "L2", documento: "D1", contraparte: "ALFA", data: "2026-06-11" });
  const r2 = reconciliarAutomaticamente([txA, txB], [L1, L2]);
  const usados = [...r2.auto, ...r2.sugestoes].map((m) => m.ledger?.id).filter(Boolean).sort();
  ok("recon: colisão não estranha match único (L1+L2 usados)", usados.join(",") === "L1,L2" && r2.excecoes.length === 0);
}

// ── decision/risk-matrix: burn>0 + saldo≤0 satura o risco operacional ───────
{
  const feat = (saldo: number, burn: number) =>
    ({ saldo, burnMensal: burn, probRuptura: 0, runwayMeses: 6, inadimplencia: 0, concentracaoReceita: 0, concentracaoFornecedor: 0, sazonalidade: 0, crescimentoMensal: 0 }) as never;
  const op = (f: never) => calcularRiskMatrix(f).dimensoes.find((d) => d.id === "operacional")!;
  ok("risk-matrix: saldo≤0 + burn>0 → operacional alto", op(feat(-1000, 50000)).probabilidade > 0.9);
  ok("risk-matrix: saldo positivo mantém proporção (~0.5)", Math.abs(op(feat(600000, 50000)).probabilidade - 0.5) < 0.01);
  ok("risk-matrix: sem burn → operacional 0", op(feat(-1000, 0)).probabilidade === 0);
}

// ── fdip: CSV posicional não escolhe uma 2ª coluna de DATA como valor ───────
{
  const csv = ["10/06/2026;16/06/2026;1.234,56;PIX ACME", "11/06/2026;20/06/2026;-500,00;FORN XPTO"].join("\n");
  const vals = parseTexto(csv).records.map((r) => r.valor).sort((a, b) => a - b);
  ok("fdip: valor lido é 1234.56/500, não a 2ª data", vals.includes(1234.56) && vals.includes(500) && vals.every((v) => v < 1e6), JSON.stringify(vals));
}

// ── institutional/audit: hash-chain sela identidade+ctx; analisarMudanca pega injeção ──
{
  const t = new TrilhaAuditoria();
  const ctx = { userId: "u1", userName: "Ana", ip: "1.2.3.4", device: "web" } as never;
  t.registrar({ entityType: "payment" as never, entityId: "p1", action: "created" as never, after: { valor: 100 }, ctx });
  ok("audit: íntegro antes de adulterar", t.verificarIntegridade().intacta === true);
  (t.todos()[0].ctx as { userId: string }).userId = "hacker"; // reescreve o autor
  ok("audit: adulterar ctx.userId quebra a integridade", t.verificarIntegridade().intacta === false);
  const t2 = new TrilhaAuditoria();
  t2.registrar({ entityType: "payment" as never, entityId: "p2", action: "created" as never, after: { valor: 100 }, ctx });
  (t2.todos()[0].entityId as unknown) = "p999"; // repontar p/ outra entidade
  ok("audit: repontar entityId quebra a integridade", t2.verificarIntegridade().intacta === false);
  // INJEÇÃO de chave Pix num registro que não tinha → flag crítico
  const flags = analisarMudanca("updated" as never, { valor: 100 }, { valor: 100, chavePix: "hacker@pix" });
  ok("audit: injeção de chavePix (só no after) vira flag crítico", flags.some((f) => f.campo === "chavePix" && f.nivel === "critico"));
}

// ── cashflow: financiamento ENTRADA não pode dobrar no fluxo livre ──────────
{
  const HOJE = "2026-07-01";
  const mv = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: Math.random().toString(36).slice(2), type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  const inp = (movements: RiskMovement[]): RiskInput => ({ hoje: HOJE, saldoAtual: 0, partyNames: {}, movements } as RiskInput);
  const emprestimo = montarFluxoCaixa(inp([mv({ amount: 50000, category: "Empréstimo bancário" })]), [], { dias: 30, visao: "consolidado" });
  ok("cashflow: empréstimo recebido conta 1x no fluxo livre (50k, não 100k)", Math.abs(emprestimo.fluxo.livre - 50000) < 1e-6, `livre=${emprestimo.fluxo.livre}`);
  ok("cashflow: saldo final = saldo inicial + livre (sem dobra)", Math.abs(emprestimo.fluxo.saldoFinal - 50000) < 1e-6, `saldoFinal=${emprestimo.fluxo.saldoFinal}`);
  const oper = montarFluxoCaixa(inp([mv({ amount: 1000 }), mv({ type: "saida", amount: 400, category: "Fornecedores" })]), [], { dias: 30, visao: "consolidado" });
  ok("cashflow: operacional puro = entradas - saídas (600)", Math.abs(oper.fluxo.operacional - 600) < 1e-6, `operacional=${oper.fluxo.operacional}`);
}

// ── dre/dreProjetado: base = 6 meses MAIS RECENTES (cronológico), não ordem de inserção ──
{
  // 8 meses: 2025-12=100 … 2026-07=800 (atual). Os 6 mais recentes = fev..jul
  // (300+400+500+600+700+800)/6 = 550. Movements em ordem ARRAY invertida
  // (atual primeiro) — se voltar a fatiar por inserção daria (600..100)/6=350.
  const ym = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
  const valores = [100, 200, 300, 400, 500, 600, 700, 800];
  const movsDre: RiskMovement[] = [];
  for (let i = ym.length - 1; i >= 0; i--) // insere do mais novo p/ o mais velho (embaralha a cronologia)
    movsDre.push({ id: `d${i}`, type: "entrada", amount: valores[i], due_date: `${ym[i]}-15`, paid_date: `${ym[i]}-15`, status: "pago", category: "Vendas", party_id: null } as RiskMovement);
  const inpDre: RiskInput = { hoje: "2026-07-15", saldoAtual: 0, partyNames: {}, movements: movsDre } as RiskInput;
  const base30 = dreProjetado(inpDre, 1, 1)[0].receita; // margem=1 → receita = base mensal
  ok("dre: base projeção = 6 meses mais recentes (550), não ordem de inserção", Math.abs(base30 - 550) < 1e-6, `base=${base30}`);
}

// ── lib/imported: appendImported dedup por id (não duplica movimento nem saldo) ──
{
  clearImported();
  setImported({ movements: [], accounts: [{ id: "acc", name: "C", type: "corrente", balance: 1000 }], parties: [], criadoEm: "2026-07-01T00:00:00Z" } as never);
  const mv = { id: "dup1", account_id: "acc", type: "entrada", status: "pago", amount: 500, category: "Vendas", party_id: null, due_date: "2026-07-01", paid_date: "2026-07-01", reconciled: true } as never;
  appendImported({ movement: mv });
  appendImported({ movement: mv }); // reenvio do MESMO id
  const n = importedMovements()!.length;
  const bal = importedAccounts()!.find((a) => a.id === "acc")!.balance;
  ok("imported: reenvio do mesmo id não duplica movimento", n === 1, `n=${n}`);
  ok("imported: reenvio não ajusta saldo 2x", bal === 1500, `bal=${bal}`);
  clearImported();
}

// ── assistant/receita líquida: bruta − impostos; "comissão" NÃO é ISS ──────
{
  const HOJE = "2026-07-15"; let s = 0;
  const rm = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `rl${s++}`, type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  const inp: RiskInput = { hoje: HOJE, saldoAtual: 0, partyNames: {}, movements: [
    rm({ amount: 10000, paid_date: "2026-07-05" }),
    rm({ type: "saida", amount: 3000, paid_date: "2026-07-08", category: "Impostos" }),
    rm({ type: "saida", amount: 2000, paid_date: "2026-07-08", category: "Comissão" }), // NÃO é imposto (iss ⊂ comissão)
  ] } as RiskInput;
  const r = responderLocal("qual minha receita líquida?", inp);
  ok("receita líquida = bruta − impostos, sem contar comissão (7000)", !!r && /R\$.?7\.000/.test(r.resposta) && /menos R\$.?3\.000 de impostos/.test(r.resposta), r?.resposta?.slice(0, 60));
  const rc = responderLocal("qual minha carga tributária?", inp);
  ok("carga tributária = impostos ÷ receita (30%), sem comissão", !!rc && /\b30%/.test(rc.resposta), rc?.resposta?.slice(0, 60));
  // EBITDA exclui o resultado financeiro: receita 10000 − Fornecedores 3000 − Comissão 2000 = 5000; Impostos 3000 é despesa operacional → entra
  const inpE: RiskInput = { hoje: HOJE, saldoAtual: 0, partyNames: {}, movements: [
    rm({ amount: 10000, paid_date: "2026-07-05" }),
    rm({ type: "saida", amount: 3000, paid_date: "2026-07-08", category: "Impostos" }),
    rm({ type: "saida", amount: 2000, paid_date: "2026-07-08", category: "Comissão" }),
    rm({ type: "saida", amount: 500, paid_date: "2026-07-08", category: "Tarifa bancária" }), // financeiro → EXCLUÍDO
  ] } as RiskInput;
  const re = responderLocal("qual meu EBITDA?", inpE);
  // EBITDA = 10000 − (3000 impostos + 2000 comissão) = 5000; Tarifa (financeiro) fora
  ok("EBITDA exclui o resultado financeiro (5000)", !!re && /EBITDA.*R\$.?5\.000/.test(re.resposta), re?.resposta?.slice(0, 60));
  // FCF exclui financiamento: 10000 receita − 6000 fornecedor = 4000; empréstimo 50k fora
  const inpF: RiskInput = { hoje: HOJE, saldoAtual: 0, partyNames: {}, movements: [
    rm({ amount: 10000, paid_date: "2026-07-05" }),
    rm({ type: "saida", amount: 6000, paid_date: "2026-07-08", category: "Fornecedores" }),
    rm({ amount: 50000, paid_date: "2026-07-06", category: "Empréstimo" }),
  ] } as RiskInput;
  const rf = responderLocal("qual meu fluxo de caixa livre?", inpF);
  ok("FCF exclui financiamento/empréstimo (4000)", !!rf && /fluxo de caixa livre.*R\$.?4\.000/.test(rf.resposta), rf?.resposta?.slice(0, 60));
  // peso da folha na receita: 5000 / 20000 = 25%
  const inpP: RiskInput = { hoje: HOJE, saldoAtual: 0, partyNames: {}, movements: [
    rm({ amount: 20000, paid_date: "2026-07-05" }),
    rm({ type: "saida", amount: 5000, paid_date: "2026-07-08", category: "Folha" }),
  ] } as RiskInput;
  const rp = responderLocal("quanto a folha pesa na receita?", inpP);
  ok("peso categoria na receita: Folha = 25%", !!rp && /Folha representa 25% da sua receita/.test(rp.resposta), rp?.resposta?.slice(0, 50));
  // por contraparte: com período escopa a janela; sem período é tudo
  const inpC: RiskInput = { hoje: "2026-07-15", saldoAtual: 0, partyNames: { A: "Alpha" }, movements: [
    rm({ amount: 22000, paid_date: "2026-05-05", party_id: "A" }),
    rm({ amount: 12000, paid_date: "2026-07-05", party_id: "A" }),
  ] } as RiskInput;
  const rcMaio = responderLocal("quanto recebi da Alpha em maio?", inpC);
  const rcTudo = responderLocal("quanto recebi da Alpha?", inpC);
  ok("contraparte c/ período: Alpha em maio = 22000", !!rcMaio && /em maio.*R\$.?22\.000/.test(rcMaio.resposta), rcMaio?.resposta?.slice(0, 50));
  ok("contraparte s/ período: Alpha total = 34000", !!rcTudo && /R\$.?34\.000/.test(rcTudo.resposta), rcTudo?.resposta?.slice(0, 50));
  // janela futura de semana (07-15 qua → próx. semana 20-26/07): só o pendente 07-22 conta
  const inpW: RiskInput = { hoje: "2026-07-15", saldoAtual: 0, partyNames: {}, movements: [
    rm({ amount: 3000, status: "pendente", paid_date: null, due_date: "2026-07-22" }),
    rm({ amount: 1000, status: "pendente", paid_date: null, due_date: "2026-07-16" }), // esta semana, fora
  ] } as RiskInput;
  const rw = responderLocal("quanto vou receber semana que vem?", inpW);
  ok("janela semana que vem: só o pendente da próxima semana (3000)", !!rw && /semana que vem.*R\$.?3\.000/.test(rw.resposta), rw?.resposta?.slice(0, 50));
}

// ── dre/dreGerencial: waterfall com números fechados ────────────────────────
{
  let s = 0;
  const dm = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `dg${s++}`, type: "entrada", amount: 1000, due_date: "2026-07-01", paid_date: "2026-07-01", status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  const g = dreGerencial([
    dm({ type: "entrada", amount: 10000, category: "Vendas" }),
    dm({ type: "saida", amount: 1000, category: "Impostos" }),
    dm({ type: "saida", amount: 2000, category: "Fornecedores" }), // CMV
    dm({ type: "saida", amount: 1500, category: "Folha" }),
    dm({ type: "saida", amount: 500, category: "Marketing" }), // OPEX
    dm({ type: "saida", amount: 300, category: "Tarifa bancária" }), // financeiro
  ]);
  ok("DRE: receita líquida = bruta − impostos (9000)", g.receitaLiquida === 9000, `${g.receitaLiquida}`);
  ok("DRE: lucro bruto = líquida − CMV (7000)", g.lucroBruto === 7000, `${g.lucroBruto}`);
  ok("DRE: EBITDA = bruto − (folha+opex) (5000)", g.ebitda === 5000, `${g.ebitda}`);
  ok("DRE: lucro líquido = EBITDA − financeiro (4700)", g.lucroLiquido === 4700, `${g.lucroLiquido}`);
  // convenção das margens: base é a RECEITA LÍQUIDA (padrão DRE br), não a bruta.
  // margem bruta = 7000/9000 = 77.8% (não 70%); margem líquida = 4700/9000 = 52.2% (não 47%).
  ok("DRE: margem bruta sobre receita LÍQUIDA (7000/9000 = 77.8%, não /bruta)", Math.abs(g.margemBruta - 7000 / 9000) < 1e-6, `${g.margemBruta}`);
  ok("DRE: margem líquida sobre receita LÍQUIDA (4700/9000 = 52.2%)", Math.abs(g.margemLiquida - 4700 / 9000) < 1e-6, `${g.margemLiquida}`);
}

// ── quant/score: invariante direcional (empresa saudável > empresa crítica) ──
{
  const HOJE = "2026-07-15";
  const MESES = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
  let s = 0;
  const qm = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `q${s++}`, type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  // Saudável: caixa alto, resultado positivo todo mês, 2 clientes, sem vencidos.
  const saudavel: RiskMovement[] = [];
  for (const ym of MESES) {
    saudavel.push(qm({ amount: 12000, paid_date: `${ym}-05`, due_date: `${ym}-01`, party_id: "A" }));
    saudavel.push(qm({ amount: 8000, paid_date: `${ym}-06`, due_date: `${ym}-01`, party_id: "B" }));
    saudavel.push(qm({ type: "saida", amount: 11000, paid_date: `${ym}-08`, due_date: `${ym}-07`, category: "Fornecedores" }));
  }
  // Crítica: caixa baixo, queima todo mês, 1 cliente, recebível vencido.
  const critica: RiskMovement[] = [];
  for (const ym of MESES) {
    critica.push(qm({ amount: 8000, paid_date: `${ym}-05`, due_date: `${ym}-01`, party_id: "A" }));
    critica.push(qm({ type: "saida", amount: 15000, paid_date: `${ym}-08`, due_date: `${ym}-07`, category: "Fornecedores" }));
  }
  critica.push(qm({ amount: 20000, status: "pendente", paid_date: null, due_date: "2026-05-01", party_id: "A" })); // vencido
  const qSaud = analisarQuantitativo({ hoje: HOJE, saldoAtual: 120000, partyNames: { A: "A", B: "B" }, movements: saudavel } as RiskInput);
  const qCrit = analisarQuantitativo({ hoje: HOJE, saldoAtual: 1000, partyNames: { A: "A" }, movements: critica } as RiskInput);
  ok("quant score em [0,100] (saudável)", qSaud.score.score >= 0 && qSaud.score.score <= 100, `${qSaud.score.score}`);
  ok("quant score em [0,100] (crítica)", qCrit.score.score >= 0 && qCrit.score.score <= 100, `${qCrit.score.score}`);
  ok("quant: empresa saudável pontua acima da crítica", qSaud.score.score > qCrit.score.score, `saud=${qSaud.score.score} crit=${qCrit.score.score}`);
}

// ── risk/inadimplência: mau pagador pontua mais risco que bom pagador ───────
{
  const HOJE = "2026-07-15";
  const MESES = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  let s = 0;
  const im = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `i${s++}`, type: "entrada", amount: 10000, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  const movs: RiskMovement[] = [];
  for (const ym of MESES) {
    movs.push(im({ due_date: `${ym}-01`, paid_date: `${ym}-03`, party_id: "BOM" })); // paga em ~2 dias
    movs.push(im({ due_date: `${ym}-01`, paid_date: `${ym}-26`, party_id: "MAU" })); // paga ~25 dias atrasado
  }
  movs.push(im({ due_date: "2026-05-01", paid_date: null, status: "pendente", party_id: "MAU", amount: 15000 })); // vencido em aberto
  const port = analisarInadimplencia({ hoje: HOJE, saldoAtual: 50000, partyNames: { BOM: "Bom", MAU: "Mau" }, movements: movs } as RiskInput);
  const bom = port.clientes.find((c) => c.clienteId === "BOM");
  const mau = port.clientes.find((c) => c.clienteId === "MAU");
  ok("inadimplência: perfis de ambos os clientes existem", !!bom && !!mau);
  ok("inadimplência: mau pagador pontua MAIS risco que o bom", !!bom && !!mau && mau.score > bom.score, `bom=${bom?.score} mau=${mau?.score}`);
  ok("inadimplência: scores em [0,100]", !!bom && !!mau && bom.score >= 0 && mau.score <= 100);
}

// ── risk-engine/caixa: empresa perto da ruptura > prob. de ruptura ──────────
{
  const HOJE = "2026-07-15";
  let s = 0;
  const cm = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `c${s++}`, type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  // Saudável: caixa alto, poucas saídas pendentes.
  const saud = scoreRiscoCaixa({ hoje: HOJE, saldoAtual: 200000, partyNames: {}, horizonDias: 60, movements: [
    cm({ type: "entrada", amount: 30000, status: "pendente", paid_date: null, due_date: "2026-07-20", party_id: "A" }),
    cm({ type: "saida", amount: 5000, status: "pendente", paid_date: null, due_date: "2026-07-25", category: "Fornecedores" }),
  ] } as RiskInput);
  // Crítica: caixa baixo, grandes saídas iminentes, recebíveis fracos/atrasados.
  const crit = scoreRiscoCaixa({ hoje: HOJE, saldoAtual: 2000, partyNames: {}, horizonDias: 60, movements: [
    cm({ type: "saida", amount: 40000, status: "pendente", paid_date: null, due_date: "2026-07-20", category: "Fornecedores" }),
    cm({ type: "saida", amount: 30000, status: "pendente", paid_date: null, due_date: "2026-07-28", category: "Folha" }),
    cm({ type: "entrada", amount: 5000, status: "pendente", paid_date: null, due_date: "2026-05-01", party_id: "A" }), // vencido
  ] } as RiskInput);
  ok("risco-caixa: prob. de ruptura em [0,1] (ambos)", saud.probabilidadeRuptura >= 0 && saud.probabilidadeRuptura <= 1 && crit.probabilidadeRuptura >= 0 && crit.probabilidadeRuptura <= 1);
  ok("risco-caixa: empresa crítica tem prob. de ruptura MAIOR", crit.probabilidadeRuptura > saud.probabilidadeRuptura, `saud=${saud.probabilidadeRuptura} crit=${crit.probabilidadeRuptura}`);
}

// ── assistant: intents novos não quebram nem emitem NaN com dados VAZIOS ─────
{
  const vazio: RiskInput = { hoje: "2026-07-15", saldoAtual: 0, partyNames: {}, movements: [] } as RiskInput;
  const perguntas = [
    "qual meu EBITDA?", "qual minha receita líquida?", "qual meu fluxo de caixa livre?",
    "qual minha carga tributária?", "quanto a folha pesa na receita?", "recebo mais de produto ou serviço?",
    "qual o total que já entrou?", "quanto vou receber mês que vem?", "como foi meu semestre?",
    "quanto entra vs sai?", "qual minha receita?", "quanto recebi da Alpha em maio?",
  ];
  let limpo = true;
  for (const q of perguntas) {
    try { const r = responderLocal(q, vazio); if (r && /NaN|undefined|Infinity/.test(r.resposta)) { limpo = false; break; } }
    catch { limpo = false; break; }
  }
  ok("assistant: intents novos são robustos a dados vazios (sem crash/NaN)", limpo);
}

// ── assistant: métricas contam SÓ o pago (excluem pendente/cancelado) ───────
{
  let s = 0;
  const sm = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `s${s++}`, type: "entrada", amount: 1000, due_date: "2026-07-15", paid_date: "2026-07-15", status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  const inpS: RiskInput = { hoje: "2026-07-15", saldoAtual: 0, partyNames: {}, movements: [
    sm({ amount: 10000, paid_date: "2026-07-05" }),
    sm({ type: "saida", amount: 3000, paid_date: "2026-07-08", category: "Fornecedores" }),
    sm({ type: "saida", amount: 1000, paid_date: "2026-07-08", category: "Impostos" }),
    sm({ amount: 5000, status: "pendente", paid_date: null, due_date: "2026-07-25" }), // NÃO conta
    sm({ type: "saida", amount: 2000, status: "pendente", paid_date: null, due_date: "2026-07-28", category: "Folha" }), // NÃO
    sm({ amount: 9999, status: "cancelado", paid_date: "2026-07-06" }), // NÃO
  ] } as RiskInput;
  const eb = responderLocal("qual meu EBITDA?", inpS);
  const cg = responderLocal("qual minha carga tributária?", inpS);
  ok("EBITDA conta só pago (6000, ignora pendente/cancelado)", !!eb && /EBITDA.*R\$.?6\.000/.test(eb.resposta), eb?.resposta?.slice(0, 50));
  ok("carga tributária conta só pago (10%)", !!cg && /\b10%/.test(cg.resposta), cg?.resposta?.slice(0, 50));
}

// ── PF (pessoa física): categorias pessoais roteiam igual (Mercado/Aluguel/Salário) ──
{
  let s = 0;
  const pm = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `pf${s++}`, type: "entrada", amount: 1000, due_date: "2026-07-15", paid_date: "2026-07-15", status: "pago", category: "Salário", party_id: null, ...o }) as RiskMovement;
  const inpPF: RiskInput = { hoje: "2026-07-15", saldoAtual: 8000, partyNames: {}, movements: [
    pm({ amount: 6000, paid_date: "2026-07-05", category: "Salário" }),
    pm({ type: "saida", amount: 1500, paid_date: "2026-07-08", category: "Mercado" }),
    pm({ type: "saida", amount: 1200, paid_date: "2026-07-08", category: "Aluguel" }),
  ] } as RiskInput;
  const gm = responderLocal("quanto gastei com mercado?", inpPF);
  const so = responderLocal("quanto sobrou esse mês?", inpPF);
  ok("PF: gasto por categoria pessoal (Mercado = 1500)", !!gm && /gastou R\$.?1\.500 com Mercado/.test(gm.resposta), gm?.resposta?.slice(0, 50));
  ok("PF: resultado do mês (6000 − 2700 = 3300 sobrou)", !!so && /sobrou R\$.?3\.300/.test(so.resposta), so?.resposta?.slice(0, 50));
}

// ── chain: possessiva de métrica NÃO pode ser sombreada pela KB (vai ao motor) ──
// A KB roda ANTES do motor no AssistantWidget; se buscarKB responder uma
// possessiva ("qual meu EBITDA"), o usuário recebe o CONCEITO em vez do NÚMERO.
{
  const possessivas = ["qual meu EBITDA?", "qual meu runway?", "quanto é meu burn?", "qual meu score?", "qual minha receita líquida?", "qual meu fluxo de caixa livre?"];
  const conceituais = ["o que é EBITDA?", "o que é runway?", "o que é score?"];
  const semKB = possessivas.every((q) => buscarKB(q) === null);
  const comKB = conceituais.every((q) => buscarKB(q) !== null);
  ok("chain: possessivas de métrica não são sombreadas pela KB", semKB);
  ok("chain: 'o que é X' segue resolvendo pela KB", comKB);
  // Calculadora com número + termo forte (boleto/provisão): a KB NÃO pode
  // sombrear o cálculo do motor. "quanto cobrar de um boleto de 1000 vencido..."
  // tem "boleto" (termo forte) mas é MORA — só "o que é boleto?" vira conceito.
  const calcQ = ["quanto cobrar de um boleto de 1000 vencido há 30 dias?", "quanto provisionar de 13º de uma folha de 12 mil?"];
  ok("chain: calculadora com número + termo forte não é sombreada pela KB", calcQ.every((q) => buscarKB(q) === null), calcQ.map((q) => buscarKB(q)?.id).join(","));
  ok("chain: 'o que é boleto?' (conceitual) segue na KB", buscarKB("o que é boleto?") !== null);
}

// ── core/investment: valor futuro (juros compostos) + payback ───────────────
{
  const a = valorFuturo(0, 1000, 0.01, 12);
  ok("investment: 1000/mês @1%×12 → montante 12682.5, juros 682.5", a.montante === 12682.5 && a.jurosGanhos === 682.5, `${a.montante}/${a.jurosGanhos}`);
  const z = valorFuturo(5000, 0, 0, 10);
  ok("investment: só principal @0% → montante = principal, juros 0", z.montante === 5000 && z.jurosGanhos === 0);
  const p = payback(20000, 2000);
  ok("investment: payback 20000 / 2000 = 10 meses", p.meses === 10 && p.paga === true);
  const q = payback(20000, 0);
  ok("investment: payback sem retorno → Infinity, não paga", q.meses === Infinity && q.paga === false);
  // meta de poupança: 24k a 0% guardando 2k/mês = 12 meses exatos
  ok("investment: meta 24k @0% guardando 2k/mês = 12 meses", tempoParaMeta(24000, 2000, 0).meses === 12);
  // com juros 1% a meta de 50k guardando 2k/mês vem ANTES (23 < 25 meses do 0%)
  const meta = tempoParaMeta(50000, 2000, 0.01);
  ok("investment: meta 50k @1% guardando 2k = 23 meses (juros aceleram)", meta.meses === 23, `${meta.meses}`);
  // cross-check: valorFuturo no mês da meta ≥ alvo, no mês anterior < alvo
  ok("investment: meta cross-check — FV(23)≥50k e FV(22)<50k", valorFuturo(0, 2000, 0.01, meta.meses).montante >= 50000 && valorFuturo(0, 2000, 0.01, meta.meses - 1).montante < 50000);
  // já tem a meta → 0 meses; sem aporte nem juros → inatingível
  ok("investment: já tem a meta → 0 meses", tempoParaMeta(10000, 500, 0.01, 10000).meses === 0);
  ok("investment: sem aporte nem juros → inatingível (Infinity)", tempoParaMeta(10000, 0, 0).meses === Infinity && tempoParaMeta(10000, 0, 0).atingivel === false);
  // provisão trabalhista: folha 12000 → 13º 1000, férias 1333.33, FGTS 186.67, total 2520
  const pr = provisaoTrabalhista(12000);
  ok("payroll: folha 12000 → 13º 1000, férias 1333.33, total 2520", pr.decimoTerceiroMes === 1000 && pr.feriasMes === 1333.33 && pr.provisaoTotalMes === 2520, `${pr.decimoTerceiroMes}/${pr.feriasMes}/${pr.provisaoTotalMes}`);
  ok("payroll: custo anual real = 185760 (> 12×folha)", pr.custoAnualFolha === 185760 && pr.custoAnualFolha > 12 * 12000);
}

// ── core/pricing: margem ≠ markup (a confusão clássica) ─────────────────────
{
  const a = precoPorMargem(100, 0.30);
  ok("pricing: 30% de margem s/ custo 100 → preço 142.86 (markup 42.86%)", a.preco === 142.86 && Math.abs(a.markup - 0.4286) < 0.001, `${a.preco}/${a.markup}`);
  const b = precoPorMarkup(100, 0.30);
  ok("pricing: markup 30% s/ custo 100 → preço 130, margem 23.08% (≠30%)", b.preco === 130 && Math.abs(b.margem - 0.2308) < 0.001, `${b.preco}/${b.margem}`);
  const c = analisarPreco(100, 150);
  ok("pricing: custo 100 preço 150 → margem 33.33%, markup 50%", Math.abs(c.margem - 0.3333) < 0.001 && c.markup === 0.5 && c.lucroUnitario === 50);
  ok("pricing: 0 custo não gera NaN", Number.isFinite(precoPorMargem(0, 0.3).preco));
  // ponto de equilíbrio em unidades: custo fixo ÷ margem de contribuição
  ok("pricing: PE unidades 10000 ÷ 50 = 200", pontoEquilibrioUnidades(10000, 50).unidades === 200);
  ok("pricing: PE unidades arredonda p/ cima (10000 ÷ 30 = 334)", pontoEquilibrioUnidades(10000, 30).unidades === 334);
  ok("pricing: margem ≤ 0 → sem equilíbrio (Infinity)", pontoEquilibrioUnidades(10000, 0).unidades === Infinity);
  // gross-up: custo 100, imposto 6%, margem líquida 20% → preço 100/(1−0.20−0.06)=135.14
  const gu = precoComImpostos(100, 0.06, 0.20);
  ok("pricing gross-up: 100 c/ 6% imposto + 20% margem líq → preço 135.14", gu.preco === 135.14 && gu.viavel, `${gu.preco}`);
  // a margem líquida REALIZADA volta a bater os 20% (lucroLiquido/preço)
  ok("pricing gross-up: margem líquida realizada = 20%", Math.abs(gu.lucroLiquido / gu.preco - 0.20) < 0.001, `${gu.lucroLiquido / gu.preco}`);
  ok("pricing gross-up: imposto = 6% do preço", Math.abs(gu.imposto - gu.preco * 0.06) < 0.01);
  // inviável: margem + imposto ≥ 100%
  ok("pricing gross-up: margem 60% + imposto 50% → inviável (preço 0)", precoComImpostos(100, 0.50, 0.60).viavel === false);
}

// ── core/financing: tabela Price/SAC com números fechados ───────────────────
{
  const p = simularFinanciamento(1000, 0.02, 12, "price");
  ok("financing PRICE 1000@2%×12: parcela ≈ 94.56", p.parcela === 94.56, `${p.parcela}`);
  ok("financing PRICE: total ≈ 1134.72, juros ≈ 134.72", Math.abs(p.totalPago - 1134.72) < 0.05 && Math.abs(p.jurosTotal - 134.72) < 0.05, `${p.totalPago}/${p.jurosTotal}`);
  ok("financing PRICE: saldo final = 0 (quita)", p.plano[11].saldo === 0, `${p.plano[11].saldo}`);
  const z = simularFinanciamento(1200, 0, 12, "price");
  ok("financing sem juros: parcela = principal/n (100), juros 0", z.parcela === 100 && z.jurosTotal === 0);
  const s = simularFinanciamento(1200, 0.02, 12, "sac");
  ok("financing SAC 1200@2%×12: p1=124, p12=102, juros=156", s.parcela === 124 && s.parcelaFinal === 102 && s.jurosTotal === 156, `${s.parcela}/${s.parcelaFinal}/${s.jurosTotal}`);
  ok("financing SAC < PRICE em juros (amortização constante paga menos)", s.jurosTotal < p.jurosTotal * (1200 / 1000) + 1);
  // edge: 0 principal não gera NaN
  const e = simularFinanciamento(0, 0.02, 12, "price");
  ok("financing 0 principal → sem NaN", Number.isFinite(e.parcela) && Number.isFinite(e.jurosTotal));
  // antecipação: 10000 vence 2m @3% → líquido 9425.96, custo 574.04 (5.74%)
  const ant = antecipar(10000, 0.03, 2);
  ok("antecipação 10000/2m@3% → líquido 9425.96, custo 574.04", ant.liquido === 9425.96 && ant.custo === 574.04 && ant.custoPct === 5.74, `${ant.liquido}/${ant.custo}`);
  ok("antecipação: líquido + custo = valor futuro", Math.abs(ant.liquido + ant.custo - 10000) < 0.01);
  // conversão de taxa: 2%/mês = 26.82%/ano (composto, não 24%); ida e volta bate
  ok("taxa: 2%/mês → 26.82%/ano (composto, ≠ 24%)", Math.abs(equivalenteAnual(0.02) - 0.2682) < 0.0001, `${equivalenteAnual(0.02)}`);
  ok("taxa: 26.82%/ano → ~2%/mês (inversa)", Math.abs(equivalenteMensal(0.2682) - 0.02) < 0.0001, `${equivalenteMensal(0.2682)}`);
  // desconto/acréscimo (via IA, inline): 200−15%=170, 200+10%=220
  const inp0: RiskInput = { hoje: "2026-07-15", saldoAtual: 0, partyNames: {}, movements: [] } as RiskInput;
  const dd = responderLocal("quanto fica 200 com 15% de desconto?", inp0);
  const da = responderLocal("quanto é 200 mais 10%?", inp0);
  ok("desconto: 200 − 15% = 170", !!dd && /desconto fica R\$.?170\b/.test(dd.resposta), dd?.resposta?.slice(0, 50));
  ok("acréscimo: 200 + 10% = 220", !!da && /acréscimo fica R\$.?220\b/.test(da.resposta), da?.resposta?.slice(0, 50));
  // regressão: frase de CRESCIMENTO ("faturei X, 20% a mais") NÃO vira desconto
  const cresc = responderLocal("esse mês faturei 10 mil, 20% a mais", inp0);
  ok("desconto: 'faturei X, 20% a mais' não é hijackado pela calculadora", !cresc || !/(desconto|acréscimo) fica/.test(cresc.resposta), cresc?.resposta?.slice(0, 50));
}

// ── core/tax: Simples Nacional (alíquota efetiva ≠ nominal, DAS, teto) ───────
{
  // Anexo III, RBT12 500k (faixa 3): efetiva = (500000·0.135 − 17640)/500000 = 9.972%
  const s = calcularSimplesNacional(500000, 40000, "III");
  ok("tax: Simples III 500k → faixa 3, efetiva 9.972% (≠ 13.5% nominal)", s.faixa === 3 && Math.abs(s.aliquotaEfetiva - 0.09972) < 1e-6 && s.aliquotaNominal === 0.135, `${s.faixa}/${s.aliquotaEfetiva}`);
  // DAS = 40000 · 0.09972 = 3988.80
  ok("tax: DAS = receita mês × efetiva (40000 × 9.972% = 3988.80)", s.das === 3988.8, `${s.das}`);
  // Anexo I faixa 1 (≤180k): efetiva = nominal 4%, sem parcela a deduzir
  const c = calcularSimplesNacional(100000, 15000, "I");
  ok("tax: Simples I 100k → faixa 1, efetiva = nominal 4%, DAS 600", c.faixa === 1 && c.aliquotaEfetiva === 0.04 && c.das === 600, `${c.aliquotaEfetiva}/${c.das}`);
  // teto: RBT12 > 4,8M desenquadra
  const t = calcularSimplesNacional(5000000, 400000, "I");
  ok("tax: RBT12 5M > 4,8M → acimaDoTeto", t.acimaDoTeto === true);
  ok("tax: RBT12 4,8M exatos → ainda dentro do teto", calcularSimplesNacional(4800000, 100000, "I").acimaDoTeto === false);
  // RBT12 = 0 (empresa nova) → alíquota de entrada da 1ª faixa, sem NaN
  const zero = calcularSimplesNacional(0, 10000, "III");
  ok("tax: RBT12 0 → efetiva = 1ª faixa (6% Anexo III), sem NaN", zero.aliquotaEfetiva === 0.06 && Number.isFinite(zero.das), `${zero.aliquotaEfetiva}`);
  // efetiva sempre < nominal fora da faixa 1 (a parcela a deduzir alivia)
  const b = calcularSimplesNacional(1000000, 50000, "III");
  ok("tax: efetiva < nominal na faixa 4 (parcela a deduzir alivia)", b.aliquotaEfetiva < b.aliquotaNominal);
}

// ── core/late-fee: juros de mora + multa (título vencido) ───────────────────
{
  // 1000 vencido 30d, praxe 2% + 1% a.m.: multa 20, juros 10 (1%×30/30), corrigido 1030
  const m = calcularMora(1000, 30);
  ok("late-fee: 1000/30d → multa 20, juros 10, corrigido 1030", m.multa === 20 && m.juros === 10 && m.totalCorrigido === 1030, `${m.multa}/${m.juros}/${m.totalCorrigido}`);
  // pro rata die: 45 dias → juros 1%×45/30 = 1.5% → 15
  const q = calcularMora(1000, 45);
  ok("late-fee: pro rata die 45d → juros 15 (1%×45/30)", q.juros === 15, `${q.juros}`);
  // 0 dias (não venceu) → sem encargos
  const z = calcularMora(1000, 0);
  ok("late-fee: 0 dias → sem multa nem juros (não venceu)", z.multa === 0 && z.juros === 0 && z.totalCorrigido === 1000);
  // percentuais custom: multa 5% + juros 2% a.m. em 5000/60d → multa 250, juros 200
  const c = calcularMora(5000, 60, 0.05, 0.02);
  ok("late-fee: custom 5%+2% em 5000/60d → multa 250, juros 200", c.multa === 250 && c.juros === 200, `${c.multa}/${c.juros}`);
  // invariante: corrigido = principal + encargos
  ok("late-fee: corrigido = principal + multa + juros", Math.abs(m.totalCorrigido - (m.principal + m.multa + m.juros)) < 0.01);
  // robustez: principal 0 não gera NaN
  ok("late-fee: principal 0 → sem NaN", Number.isFinite(calcularMora(0, 30).totalCorrigido) && calcularMora(0, 30).encargoPct === 0);
}

// ── lib/aggregations: dailyCashflow acumula o saldo e ignora pendente ───────
{
  let s = 0;
  const dm = (o: Partial<Movement>): Movement =>
    ({ id: `dc${s++}`, account_id: "a", type: "entrada", status: "pago", amount: 1000, due_date: "2026-07-15", paid_date: "2026-07-15", reconciled: false, category: "Vendas", ...o }) as Movement;
  const pts = dailyCashflow([
    dm({ type: "entrada", amount: 500, paid_date: "2026-07-13" }),
    dm({ type: "saida", amount: 200, paid_date: "2026-07-14" }),
    dm({ type: "entrada", amount: 300, paid_date: "2026-07-15" }),
    dm({ type: "saida", amount: 100, paid_date: "2026-07-15" }),
    dm({ type: "entrada", amount: 9999, status: "pendente", paid_date: null, due_date: "2026-07-14" }), // não conta
  ], 3, new Date("2026-07-15T12:00:00"));
  ok("dailyCashflow: saldo acumula 500 → 300 → 500 (pendente fora)", pts.length === 3 && pts[0].balance === 500 && pts[1].balance === 300 && pts[2].balance === 500, pts.map((p) => p.balance).join(","));
}

// ── lib/validators: CPF/CNPJ (mod-11) contra vetores conhecidos ─────────────
{
  ok("CPF válido (111.444.777-35)", validateCPF("111.444.777-35") === true);
  ok("CPF válido (529.982.247-25)", validateCPF("52998224725") === true);
  ok("CPF dígito errado rejeitado", validateCPF("11144477734") === false);
  ok("CPF repetido rejeitado", validateCPF("00000000000") === false);
  ok("CNPJ válido (11.222.333/0001-81)", validateCNPJ("11222333000181") === true);
  ok("CNPJ dígito errado rejeitado", validateCNPJ("11222333000180") === false);
  ok("máscara CPF/CNPJ", maskDoc("pf", "11144477735") === "111.444.777-35" && maskDoc("pj", "11222333000181") === "11.222.333/0001-81");
}

// ── fdip: datas de 1 dígito não descartam a linha; ponto = milhar (não decimal) ──
{
  const csv = ["data;valor;historico", "1/3/2024;2.500;PIX", "15/03/2024;1.234,56;VENDA", "5/12/2024;-500,00;FORN"].join("\n");
  const r = parseTexto(csv);
  ok("fdip: nenhuma linha descartada por data de 1 dígito", r.records.length === 3 && r.ignoradas === 0, `regs=${r.records.length} ign=${r.ignoradas}`);
  const porData = Object.fromEntries(r.records.map((m) => [m.data, m.valor]));
  ok("fdip: '2.500' (ponto milhar) = 2500, não 2.5", porData["2024-03-01"] === 2500, `${porData["2024-03-01"]}`);
  ok("fdip: '1.234,56' = 1234.56", porData["2024-03-15"] === 1234.56, `${porData["2024-03-15"]}`);
  // OFX (ponto DECIMAL) segue correto
  const ofx = parseTexto("<STMTTRN><TRNAMT>2500.00<DTPOSTED>20240315<MEMO>X</STMTTRN>");
  ok("fdip: OFX '2500.00' (ponto decimal) = 2500", ofx.records[0]?.valor === 2500, `${ofx.records[0]?.valor}`);
  // variantes de extrato real: ano 2 díg, sufixo C/D, negativo, milhar s/ centavos
  const csv2 = ["Data;Valor;Historico", "01/03/24;1.500,00;A", "02/03/2024;2.000,00 C;B", "03/03/2024;350,00 D;C", "04/03/2024;-1.234,56;D", "05/03/2024;10.000;E"].join("\n");
  const r2 = parseTexto(csv2);
  const byd = Object.fromEntries(r2.records.map((m) => [m.data, m]));
  ok("fdip: ano de 2 dígitos (01/03/24 → 2024-03-01, 1500)", byd["2024-03-01"]?.valor === 1500);
  ok("fdip: sufixo C = crédito/entrada", byd["2024-03-02"]?.tipo === "entrada" && byd["2024-03-02"]?.valor === 2000);
  ok("fdip: sufixo D = débito/saída", byd["2024-03-03"]?.tipo === "saida" && byd["2024-03-03"]?.valor === 350);
  ok("fdip: negativo = saída (1234.56)", byd["2024-03-04"]?.tipo === "saida" && byd["2024-03-04"]?.valor === 1234.56);
  ok("fdip: '10.000' milhar s/ centavos = 10000", byd["2024-03-05"]?.valor === 10000);
}

// ── lib/format: brlParts (Money) bate com formatBRL, inclusive no carry ─────
{
  const bate = (v: number) => { const p = brlParts(v); return `R$${p.integer},${p.decimals}` === formatBRL(v).replace(/\s/g, ""); };
  ok("brlParts carrega o inteiro em 1,999 → 2,00 (não 1,100)", brlParts(1.999).integer === "2" && brlParts(1.999).decimals === "00");
  ok("brlParts bate com formatBRL (1.999/9.996/99.995/1234.5/33.333)", [1.999, 9.996, 99.995, 1234.5, 33.333, 100, 0.5].every(bate));
}


// ── core/aquisicao: simulador "posso comprar?" — valores fechados ───────────
{
  // Caso do dono: entra 10k/mês, sai 6k, caixa 40k. Carro 150k, 20k de entrada,
  // 48x de 3.200 + 1.250/mês de custo de posse.
  const sit = { caixaAtual: 40000, receitaMensal: 10000, despesaMensal: 6000 };
  const r = simularAquisicao(sit, { tipo: "veiculo", valor: 150000, entrada: 20000, parcelas: 48, taxaMensal: 0.018, parcelaInformada: 3200, custoMensalExtra: 1250 });
  ok("aquisicao: sobra antes = receita − despesa (4000)", r.sobraAntes === 4000, `${r.sobraAntes}`);
  ok("aquisicao: peso/mês = parcela + custo (4450)", r.pesoMensal === 4450, `${r.pesoMensal}`);
  ok("aquisicao: sobra depois = 4000 − 4450 = −450", r.sobraDepois === -450, `${r.sobraDepois}`);
  ok("aquisicao: caixa após entrada = 40k − 20k", r.caixaDepoisEntrada === 20000, `${r.caixaDepoisEntrada}`);
  ok("aquisicao: sobra negativa ⇒ inviável", r.veredito === "inviavel", r.veredito);
  ok("aquisicao: total pago = entrada + 48×3200", r.totalPago === 20000 + 48 * 3200, `${r.totalPago}`);
  ok("aquisicao: juros = total parcelas − financiado", r.juros === 48 * 3200 - 130000, `${r.juros}`);
  ok("aquisicao: comprometimento = 4450/10000", Math.abs(r.comprometimentoRenda - 0.445) < 1e-9, `${r.comprometimentoRenda}`);
  ok("aquisicao: projeção tem horizonte parcelas+12", r.projecao.length === 48 + 12 + 1, `${r.projecao.length}`);
  ok("aquisicao: mês 0 da projeção = caixa após entrada", r.projecao[0].comCompra === 20000);
  ok("aquisicao: baseline cresce pela sobra (m12 = 40k+12×4k)", r.projecao[12].semCompra === 40000 + 12 * 4000, `${r.projecao[12].semCompra}`);
  ok("aquisicao: alternativas não repetem a parcela informada", r.alternativas.every((a) => a.parcela !== 3200) || r.alternativas.length === 0);
  ok("aquisicao: nenhum número vira NaN/Infinity", [r.parcela, r.totalPago, r.juros, r.sobraDepois, r.caixaFinal, r.comprometimentoRenda, r.mesesDeReserva].every(Number.isFinite));

  // Cenário confortável: mesma renda, compra pequena à vista.
  const ok2 = simularAquisicao(sit, { tipo: "outro", valor: 5000, entrada: 5000, parcelas: 0, taxaMensal: 0 });
  ok("aquisicao: compra pequena à vista ⇒ confortável", ok2.veredito === "confortavel", ok2.veredito);
  ok("aquisicao: à vista não tem parcela nem juros", ok2.parcela === 0 && ok2.juros === 0);

  // Entrada maior que o caixa é inviável, sempre.
  const nope = simularAquisicao(sit, { tipo: "outro", valor: 90000, entrada: 90000, parcelas: 0, taxaMensal: 0 });
  ok("aquisicao: entrada > caixa ⇒ inviável", nope.veredito === "inviavel", nope.veredito);

  // Dados degenerados não podem explodir.
  const zero = simularAquisicao({ caixaAtual: 0, receitaMensal: 0, despesaMensal: 0 }, { tipo: "outro", valor: 0, entrada: 0, parcelas: 0, taxaMensal: 0 });
  ok("aquisicao: tudo zero não gera NaN", [zero.sobraDepois, zero.comprometimentoRenda, zero.mesesDeReserva, zero.caixaFinal].every(Number.isFinite));

  // Taxa implícita: 100k em 12x de 10.000 tem juros > 0 e < 5% a.m.
  const ti = taxaImplicita(100000, 10000, 12);
  ok("aquisicao: taxa implícita de 100k→12×10k fica entre 2,9% e 3,0% a.m.", ti > 0.029 && ti < 0.030, `${ti}`);
  ok("aquisicao: sem juros (soma = principal) ⇒ taxa 0", taxaImplicita(12000, 1000, 12) === 0);

  // situacaoDe: médias mensais a partir dos lançamentos realizados.
  const sitDe = situacaoDe({
    hoje: "2024-06-15", saldoAtual: 10000,
    movements: [
      { type: "entrada", amount: 3000, status: "pago", due_date: "2024-05-10", paid_date: "2024-05-10" },
      { type: "entrada", amount: 3000, status: "pago", due_date: "2024-06-10", paid_date: "2024-06-10" },
      { type: "saida", amount: 1000, status: "pago", due_date: "2024-05-20", paid_date: "2024-05-20" },
      { type: "saida", amount: 1000, status: "pago", due_date: "2024-06-05", paid_date: "2024-06-05" },
      { type: "saida", amount: 9999, status: "cancelado", due_date: "2024-06-05", paid_date: "2024-06-05" },
    ],
  });
  ok("aquisicao/situacaoDe: 2 meses vistos ⇒ receita média 3000", sitDe.receitaMensal === 3000, `${sitDe.receitaMensal}`);
  ok("aquisicao/situacaoDe: despesa média 1000 (cancelado fora)", sitDe.despesaMensal === 1000, `${sitDe.despesaMensal}`);
  ok("aquisicao/situacaoDe: caixa = saldo atual", sitDe.caixaAtual === 10000);
}

// ── core/cnae: extração de CNPJ e mapa de atividade → categoria ─────────────
{
  ok("cnae: extrai CNPJ mascarado do histórico", extrairCNPJ("PIX ENVIADO 12.345.678/0001-95 POSTO") === "12345678000195");
  ok("cnae: extrai CNPJ cru colado", extrairCNPJ("PIX QRS 45997418000153 LOJA") === "45997418000153");
  ok("cnae: NÃO inventa CNPJ onde não há", extrairCNPJ("COMPRA CARTAO 5412 MERCADO") === null);
  ok("cnae: linha digitável de boleto não vira CNPJ", extrairCNPJ("BOLETO 34191790010104351004791020150008291070026000") === null);
  ok("cnae: rejeita dígito verificador errado", !cnpjValido("12345678000100"));
  ok("cnae: rejeita sequência repetida", !cnpjValido("11111111111111"));
  ok("cnae: extrai CPF válido", extrairCPF("PIX RECEBIDO 529.982.247-25 JOAO") === "52998224725");

  const cat = (c: string) => categoriaPorCNAE(c)?.categoria;
  ok("cnae: 4731 (posto) → Combustível", cat("4731-8/00") === "Combustível");
  ok("cnae: 6201 (software) → Assinaturas / software", cat("6201-5/01") === "Assinaturas / software");
  ok("cnae: 6821 (imobiliária) → Aluguel", cat("6821-8/01") === "Aluguel");
  ok("cnae: 6920 (contabilidade) → Serviços profissionais", cat("6920-6/01") === "Serviços profissionais");
  ok("cnae: 5611 (restaurante) → Alimentação", cat("5611-2/01") === "Alimentação");
  ok("cnae: 61 (telecom) → Utilidades", cat("6110-8/01") === "Utilidades");
  ok("cnae: 84 (adm. pública) → Impostos", cat("8411-6/00") === "Impostos");
  ok("cnae: específico vence a divisão (4731 ≠ 47 genérico)", cat("4731-8/00") !== cat("4781-4/00"));
  ok("cnae: subclasse é mais confiante que divisão", (categoriaPorCNAE("4731-8/00")?.confianca ?? 0) > (categoriaPorCNAE("6201-5/01")?.confianca ?? 0));
  ok("cnae: CNAE vazio/curto → null", categoriaPorCNAE("") === null && categoriaPorCNAE("4") === null);

  // ZERO À ESQUERDA: a BrasilAPI devolve `cnae_fiscal` como NÚMERO, então todo
  // CNAE das divisões 01–09 chega com 6 dígitos (0600001 → 600001). Lido cru,
  // viraria divisão 60 (rádio/TV) em vez de 06 (extração) — todo o agronegócio
  // e o extrativismo seriam categorizados errado, em silêncio.
  ok("cnae: 6 dígitos ganham o zero à esquerda (600001 → 0600001)", normalizarCNAE("600001") === "0600001");
  ok("cnae: 7 dígitos ficam intactos", normalizarCNAE("4731800") === "4731800");
  ok("cnae: prefixo curto digitado não é preenchido", normalizarCNAE("62") === "62" && normalizarCNAE("4731") === "4731");
  ok("cnae: 600001 (Petrobras) lê divisão 06, não 60", categoriaPorCNAE("600001")?.atividade === "Extração de petróleo e gás", `${categoriaPorCNAE("600001")?.atividade}`);
  ok("cnae: 111301 (arroz) lê divisão 01, não 11", categoriaPorCNAE("111301")?.atividade === "Agricultura e pecuária", `${categoriaPorCNAE("111301")?.atividade}`);
  ok("cnae: 910600 lê divisão 09, não 91", categoriaPorCNAE("910600")?.atividade === "Serviços de apoio à extração", `${categoriaPorCNAE("910600")?.atividade}`);
}

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — guardas de auditoria multi-motor`);
if (fails > 0) process.exit(1);
