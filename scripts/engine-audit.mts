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
import { EventStore } from "@/core/orchestration/event-store";
import { calcularRiskMatrix } from "@/core/decision/risk-matrix";
import { parseTexto } from "@/core/fdip/engine";
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
import { brlParts, formatBRL } from "@/lib/format";
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

// ── event-store: adulteração de campo de identidade quebra a integridade ────
{
  const es = new EventStore();
  es.append({ tipo: "PIX_RECEBIDO", entidadeId: "org1", valor: 500, contraparte: "Cliente A", prioridade: "media", payload: {} });
  ok("event-store: íntegro antes de adulterar", es.verificarIntegridade().intacta === true);
  es.todos()[0].contraparte = "Cliente B";
  ok("event-store: adulterar contraparte quebra integridade", es.verificarIntegridade().intacta === false);
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

// ── lib/format: brlParts (Money) bate com formatBRL, inclusive no carry ─────
{
  const bate = (v: number) => { const p = brlParts(v); return `R$${p.integer},${p.decimals}` === formatBRL(v).replace(/\s/g, ""); };
  ok("brlParts carrega o inteiro em 1,999 → 2,00 (não 1,100)", brlParts(1.999).integer === "2" && brlParts(1.999).decimals === "00");
  ok("brlParts bate com formatBRL (1.999/9.996/99.995/1234.5/33.333)", [1.999, 9.996, 99.995, 1234.5, 33.333, 100, 0.5].every(bate));
}

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — guardas de auditoria multi-motor`);
if (fails > 0) process.exit(1);
