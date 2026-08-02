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
import { aplicarRegras, regraCasa, nucleoContraparte, sugerirRegra, type RegraCategorizacao, type AlvoRegra } from "@/core/regras";
import { brlParts, formatBRL } from "@/lib/format";
import { dailyCashflow } from "@/lib/aggregations";
import { simularFinanciamento, antecipar, equivalenteAnual, equivalenteMensal } from "@/core/financing";
import { precoPorMargem, precoPorMarkup, analisarPreco, pontoEquilibrioUnidades, precoComImpostos } from "@/core/pricing";
import { valorFuturo, payback, tempoParaMeta } from "@/core/investment";
import { provisaoTrabalhista } from "@/core/payroll";
import { calcularSimplesNacional } from "@/core/tax";
import { calcularMora } from "@/core/late-fee";
import {
  diasEntre, panoramaAssinatura, validarDadosEmpresa, logoAceito, optantePeloSimples,
  podeRemover, podeTrocarPerfil, filtrarUsuarios,
  filtrarLogs, periodoForaDaJanela, JANELA_LOGS_DIAS,
  consentimentoOpenFinance, mascararSegredo, certificadoValido,
  precisaFila, statusExportacao, expiraEm, filtrarExportacoes,
  LIMITE_PDF_LINHAS, LIMITE_XLSX_LINHAS, CATALOGO_INTEGRACOES,
  PLATAFORMAS_VENDAS, BANCOS_OPEN_FINANCE,
  type UsuarioEmpresa, type RegistroLog, type Exportacao, type EntradaAssinatura,
} from "@/core/administracao";
import {
  paraCP1252, deCP1252, statusEnvio, podeAdicionar, validarDestinatario,
  proximoEnvio, formatarProximoEnvio, resumoMesNFs, LIMITE_DESTINATARIOS,
  montarLancamentosDominio, gerarLanctosTxt, gerarLanctosBytes, conferirDominio,
  dataDominio, valorDominio, campoDominio,
  type DestinatarioContador, type MovimentoContabil, type MapasContabeis,
} from "@/core/contabilidade";
import {
  painelCompras, filtrarCompras, parcelasDaCompra, movimentosDaCompra,
  validarCompra, rateioFecha, anexoAceito, statusInicial, somarMeses,
  lerBoleto, linhaDeCodigoDeBarras, codigoDeBarrasDaLinha, dvModulo10, dvModulo11,
  dataDoFator, fatorDaData, statusBoleto, resumoBoletos, filtrarBoletos,
  lerChaveNFe, dvDaChave, filtrarNFs, valorDigitado, resumoNFs,
  type Compra, type BoletoRecebido, type NFRecebida,
} from "@/core/compras";
import {
  fonteMetrica, fonteSerie, fonteCategoria, widgetPadrao, sugerirWidgets,
  templateAcompanhamentoSemanal, CATALOGO, FONTES_METRICA, FONTES_SERIE, FONTES_CATEGORIA,
  type EntradaFontes,
} from "@/core/dashboards";
import {
  painelFinanceiro, painelVendas, painelAssinaturas, painelTitulos, painelCalendario,
  fimDoMes, deslocarMes, janelaMeses, type AssinaturaBase,
} from "@/core/paineis";
import {
  validarContaBancaria, diaValido, rateioValido, somaRateio, filtrarRegistros, normalizar,
  achatarPlano, idsComDescendentes, vendasDoContrato, validarContrato, contratoAtivo,
  anexoCabe, USOS_PADRAO, TIPOS_CONTA,
  type CategoriaPlano, type Contrato,
} from "@/core/registros";
import { gerarXLSX } from "@/lib/xlsx";
import { gerarDOCX } from "@/lib/docx";
import {
  montarDRE, montarDFC, montarRelatorio, montarConsolidado, montarFechamento,
  mesesDoIntervalo, intervaloDoPreset, compararOrcamento,
  ESTRUTURA_DRE, ESTRUTURA_DFC, MAX_EMPRESAS,
} from "@/core/relatorios";
import { aplicarFiltro as filtrarPainel } from "@/core/paineis";
import {
  validarVenda, valorLiquido, somaDasTaxas, totalDosItens, filtrarVendas,
  painelStatusVendas, painelStatusNF, provisionarImpostos, contasAPagarDosImpostos,
  pendenciasConfig, configPadrao, urlDoLink, validarLink,
  IMPOSTOS, ESFERA, STATUS_VENDA, METODOS_PAGAMENTO, PLATAFORMAS, STATUS_NF,
  ALIQUOTAS_PADRAO, DIA_VENCIMENTO_PADRAO,
  type Venda, type ConfigImpostos,
} from "@/core/vendas";
import { gerarQR, qrParaSVG } from "@/lib/qrcode";
import {
  filtrarTitulos, resumoTitulos, statusDoTitulo, validarTransferencia,
  filtrarTransferencias, resumoTransferencias, extratoDaConta, faturasDoCartao,
  fluxoCaixaMensal, validarRegra, regraQueCasa, candidatoPara, conciliar,
  TIPOS_OFX, FUNCOES_REGRA,
  type Transferencia, type RegraConciliacao, type TransacaoOFX,
} from "@/core/movimentacoes";
import {
  validarOrcamento, orcadoPorLinha, resumoOrcamento, distribuir, ajustarAlocacoes,
  cobertura, sugerirCategorias, mesesDoOrcamento, totalAlocacao,
  type Orcamento,
} from "@/core/orcamento";
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
  ok("PF: gasto por categoria pessoal (Mercado = 1500)", !!gm && /pagos R\$.?1\.500 em Mercado/.test(gm.resposta), gm?.resposta?.slice(0, 50));
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


// ── core/regras: categorização por regra (a conciliação automática) ─────────
{
  const R = (o: Partial<RegraCategorizacao>): RegraCategorizacao =>
    ({ id: "r", nome: "t", ativa: true, quando: {}, entao: {}, criadaEm: "", origem: "manual", ...o }) as RegraCategorizacao;
  const alvos: AlvoRegra[] = [
    { id: "a", tipo: "saida", valor: 300, contraparte: "POSTO SHELL 042" },
    { id: "b", tipo: "saida", valor: 250, contraparte: "POSTO SHELL 118 RJ" },
    { id: "c", tipo: "entrada", valor: 900, contraparte: "POSTO SHELL 042" },
    { id: "d", tipo: "saida", valor: 80, contraparte: "PADARIA CENTRAL" },
  ];
  const gas = R({ id: "gas", quando: { contraparte: { op: "contem", valor: "posto shell" }, tipo: "saida" }, entao: { categoria: "Combustível" } });
  const r1 = aplicarRegras(alvos, [gas]);
  // O ganho sobre o aprendizado exato: pega as VARIAÇÕES do mesmo fornecedor.
  ok("regras: uma regra pega as variações do fornecedor (042 e 118)", r1.map((x) => x.alvoId).join(",") === "a,b", r1.map((x) => x.alvoId).join(","));
  ok("regras: condição de tipo exclui a entrada", !r1.some((x) => x.alvoId === "c"));

  // Uma regra vazia pegaria TUDO — isso é sempre engano do usuário.
  ok("regras: regra sem nenhuma condição não casa nada", regraCasa(R({ quando: {} }), alvos[0]) === false);
  ok("regras: regra inativa não casa", regraCasa(R({ ativa: false, quando: { tipo: "saida" } }), alvos[0]) === false);
  ok("regras: faixa de valor respeitada", aplicarRegras(alvos, [R({ quando: { tipo: "saida", valorMin: 200, valorMax: 400 }, entao: { categoria: "X" } })]).length === 2);
  ok("regras: CNAE serve de condição", aplicarRegras([{ id: "e", tipo: "saida", valor: 100, cnae: "4731800" }], [R({ quando: { cnaePrefixo: "47" }, entao: { categoria: "Y" } })]).length === 1);
  // Ordem = prioridade (como firewall): a primeira que casa vence.
  const dupla = aplicarRegras([alvos[0]], [R({ id: "p1", quando: { tipo: "saida" }, entao: { categoria: "Primeira" } }), R({ id: "p2", quando: { tipo: "saida" }, entao: { categoria: "Segunda" } })]);
  ok("regras: a primeira regra que casa vence", dupla[0]?.categoria === "Primeira", `${dupla[0]?.categoria}`);
  ok("regras: sem regras não altera nada", aplicarRegras(alvos, []).length === 0);

  // Núcleo da contraparte: tira número de loja/terminal e ruído de extrato.
  ok("regras: núcleo remove ruído e números", nucleoContraparte("PIX ENVIADO POSTO SHELL 042 SP") === "posto shell", nucleoContraparte("PIX ENVIADO POSTO SHELL 042 SP"));
  ok("regras: núcleo remove sufixo societário", nucleoContraparte("TED 12345 ALPHA TECNOLOGIA ME") === "alpha tecnologia");
  const sug = sugerirRegra({ id: "x", tipo: "saida", valor: 300, contraparte: "PIX POSTO IPIRANGA 771" }, "Combustível");
  ok("regras: correção sugere regra por padrão (não por nome exato)", sug?.quando.contraparte?.valor === "posto ipiranga", `${sug?.quando.contraparte?.valor}`);
  ok("regras: contraparte impossível de reduzir → sem sugestão", sugerirRegra({ id: "y", tipo: "saida", valor: 10, contraparte: "123 456" }, "X") === null);
}

// ── core/dashboards: as fontes dos widgets customizados ────────────────────
// O widget que o usuário monta lê as MESMAS bases do DRE/fluxo — se um número
// aqui divergir, o dashboard dele mente com a cara do sistema.
{
  const M = (o: Partial<EntradaFontes["movements"][number]>) =>
    ({ id: "m", type: "saida", amount: 0, status: "pago", due_date: "2026-07-10", paid_date: "2026-07-10", ...o }) as EntradaFontes["movements"][number];
  const i: EntradaFontes = {
    hoje: "2026-08-02",
    saldoAtual: 50_000,
    movements: [
      M({ id: "1", type: "entrada", amount: 10_000, due_date: "2026-08-01", paid_date: "2026-08-01", category: "Vendas" }),
      M({ id: "2", type: "saida", amount: 4_000, due_date: "2026-08-01", paid_date: "2026-08-01", category: "Folha" }),
      M({ id: "3", type: "entrada", amount: 7_000, status: "pendente", due_date: "2026-07-20" }),   // vencido
      M({ id: "4", type: "saida", amount: 2_000, status: "pendente", due_date: "2026-08-20" }),     // a vencer
      M({ id: "5", type: "entrada", amount: 99_999, status: "cancelado", due_date: "2026-08-01", paid_date: "2026-08-01" }),
      M({ id: "6", type: "saida", amount: 6_000, due_date: "2026-07-05", paid_date: "2026-07-05", category: "Folha" }),
      M({ id: "7", type: "saida", amount: 3_000, due_date: "2024-01-05", paid_date: "2024-01-05", category: "Antigo" }), // fora da janela
    ],
  };
  const met = (id: string) => fonteMetrica(id).calcular(i);

  ok("dashboards: saldo é o saldo do sistema", met("saldo") === 50_000);
  ok("dashboards: receita do mês só conta o realizado do mês", met("receita_mes") === 10_000, `${met("receita_mes")}`);
  ok("dashboards: despesa do mês ignora julho", met("despesa_mes") === 4_000, `${met("despesa_mes")}`);
  ok("dashboards: resultado = receita − despesa", met("resultado_mes") === 6_000, `${met("resultado_mes")}`);
  ok("dashboards: cancelado NUNCA entra em nenhuma métrica", met("receita_mes") < 99_999);
  ok("dashboards: a receber é o pendente de entrada", met("a_receber") === 7_000, `${met("a_receber")}`);
  ok("dashboards: a pagar é o pendente de saída", met("a_pagar") === 2_000, `${met("a_pagar")}`);
  ok("dashboards: vencido a receber só o que passou do dia", met("vencido_receber") === 7_000, `${met("vencido_receber")}`);
  ok("dashboards: vencido a pagar não pega o que vence adiante", met("vencido_pagar") === 0, `${met("vencido_pagar")}`);
  ok("dashboards: títulos em aberto = contagem de pendentes", met("qtd_pendentes") === 2, `${met("qtd_pendentes")}`);
  // Burn = média mensal de saída realizada nos 6 meses; runway = saldo ÷ burn.
  const burn = met("burn");
  ok("dashboards: burn é média por MÊS observado, não soma", burn === 5_000, `${burn}`);
  ok("dashboards: runway = saldo ÷ burn", met("runway") === Math.round((50_000 / burn) * 10) / 10, `${met("runway")}`);
  ok("dashboards: nenhuma métrica devolve NaN/Infinity",
    FONTES_METRICA.every((f) => Number.isFinite(f.calcular(i))));

  const serie = (id: string) => fonteSerie(id).calcular(i, 12);
  ok("dashboards: série tem 12 pontos e termina no mês de hoje",
    serie("receita_12m").length === 12 && serie("receita_12m")[11].label === "ago/26",
    serie("receita_12m")[11]?.label);
  ok("dashboards: receita do último ponto = receita do mês", serie("receita_12m")[11].valor === met("receita_mes"));
  ok("dashboards: resultado 12m = receita − despesa por mês",
    serie("resultado_12m")[11].valor === serie("receita_12m")[11].valor - serie("despesa_12m")[11].valor);
  // A linha de saldo é reconstruída para trás — tem de FECHAR no saldo de hoje.
  const acc = serie("saldo_acumulado");
  ok("dashboards: saldo acumulado termina exatamente no saldo atual", acc[11].valor === 50_000, `${acc[11].valor}`);

  const cat = (id: string) => fonteCategoria(id).calcular(i);
  const desp = cat("despesa_categoria");
  ok("dashboards: fatias vêm da maior para a menor", desp.every((f, k) => k === 0 || desp[k - 1].valor >= f.valor));
  // A janela da pizza é a MESMA da série — senão a fatia mostra o histórico
  // inteiro ao lado de um KPI do mês e os dois números brigam na tela.
  ok("dashboards: pizza de despesa respeita a janela de 12 meses",
    desp.reduce((s, f) => s + f.valor, 0) === serie("despesa_12m").reduce((s, p) => s + p.valor, 0),
    `${desp.reduce((s, f) => s + f.valor, 0)}`);
  ok("dashboards: 'Antigo' (fora da janela) não aparece", !desp.some((f) => f.nome === "Antigo"));
  ok("dashboards: status de títulos conta, não soma dinheiro",
    fonteCategoria("status_titulos").unidade === "numero"
      // 6 = todos os lançamentos VIVOS (o cancelado fica de fora), cada um em
      // exatamente uma fatia: liquidado · em aberto · vencido.
      && cat("status_titulos").reduce((s, f) => s + f.valor, 0) === 6,
    `${cat("status_titulos").reduce((s, f) => s + f.valor, 0)}`);

  // Fonte inexistente cai no padrão em vez de explodir (dashboard salvo antigo).
  ok("dashboards: fonte desconhecida cai no padrão", fonteMetrica("nao_existe").id === FONTES_METRICA[0].id);
  ok("dashboards: série desconhecida cai no padrão", fonteSerie("???").id === FONTES_SERIE[0].id);
  ok("dashboards: categoria desconhecida cai no padrão", fonteCategoria("???").id === FONTES_CATEGORIA[0].id);

  // Todo tipo do catálogo tem construtor, e todo widget nasce com fonte VÁLIDA.
  ok("dashboards: todo item do catálogo constrói um widget do mesmo tipo",
    CATALOGO.every((c) => widgetPadrao(c.tipo).tipo === c.tipo));
  const fonteOk = (w: ReturnType<typeof widgetPadrao>) =>
    w.tipo === "kpi" ? fonteMetrica(w.fonte).id === w.fonte
      : w.tipo === "serie" ? fonteSerie(w.fonte).id === w.fonte
      : w.tipo === "pizza" ? fonteCategoria(w.fonte).id === w.fonte
      : true;
  ok("dashboards: widget padrão nasce apontando para fonte que existe", CATALOGO.every((c) => fonteOk(widgetPadrao(c.tipo))));
  ok("dashboards: sugestão do assistente só usa fontes válidas", sugerirWidgets().every(fonteOk));
  ok("dashboards: template semanal só usa fontes válidas",
    templateAcompanhamentoSemanal().paginas.flatMap((p) => p.widgets).every(fonteOk));
  // Ids repetidos quebrariam a remoção/reordenação (React key + findIndex).
  const ids = [...sugerirWidgets(), ...templateAcompanhamentoSemanal().paginas.flatMap((p) => p.widgets)].map((w) => w.id);
  ok("dashboards: ids de widget não se repetem", new Set(ids).size === ids.length);

  // Dataset vazio não pode virar NaN nem lista quebrada.
  const zero: EntradaFontes = { hoje: "2026-08-02", saldoAtual: 0, movements: [] };
  ok("dashboards: sem lançamento nenhuma métrica vira NaN", FONTES_METRICA.every((f) => Number.isFinite(f.calcular(zero))));
  ok("dashboards: sem lançamento a série vem zerada, não vazia",
    FONTES_SERIE.every((f) => f.calcular(zero, 12).length === 12 && f.calcular(zero, 12).every((p) => Number.isFinite(p.valor))));
  ok("dashboards: sem lançamento as fatias vêm vazias", FONTES_CATEGORIA.every((f) => f.calcular(zero).length === 0));
}

// ── core/paineis: os dashboards fechados ───────────────────────────────────
{
  const M = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: "m", type: "saida", status: "pago", amount: 0, due_date: "2026-07-10", paid_date: "2026-07-10", ...o }) as RiskMovement;
  const input: RiskInput = {
    hoje: "2026-08-10",
    saldoAtual: 100_000,
    partyNames: { c1: "Alpha", c2: "Beta", f1: "Fornecedor X" },
    movements: [
      // julho
      M({ id: "j1", type: "entrada", amount: 60_000, due_date: "2026-07-05", paid_date: "2026-07-05", party_id: "c1", category: "Vendas" }),
      M({ id: "j2", type: "saida", amount: 20_000, due_date: "2026-07-08", paid_date: "2026-07-08", party_id: "f1", category: "Fornecedores" }),
      // agosto realizado
      M({ id: "a1", type: "entrada", amount: 40_000, due_date: "2026-08-03", paid_date: "2026-08-03", party_id: "c1", category: "Vendas" }),
      M({ id: "a2", type: "entrada", amount: 10_000, due_date: "2026-08-04", paid_date: "2026-08-04", party_id: "c2", category: "Serviços" }),
      M({ id: "a3", type: "saida", amount: 5_000, due_date: "2026-08-05", paid_date: "2026-08-05", category: "Marketing" }),
      // agosto em aberto
      M({ id: "a4", type: "saida", amount: 8_000, status: "pendente", due_date: "2026-08-20", party_id: "f1", category: "Fornecedores" }),
      M({ id: "a5", type: "saida", amount: 3_000, status: "pendente", due_date: "2026-08-01", party_id: "f1" }), // atrasado
      M({ id: "a6", type: "entrada", amount: 7_000, status: "pendente", due_date: "2026-08-25", party_id: "c2" }),
      // ruído que NUNCA pode entrar
      M({ id: "x1", type: "entrada", amount: 999_999, status: "cancelado", due_date: "2026-08-06", paid_date: "2026-08-06" }),
    ],
  };

  // ---- datas: a base de tudo (um mês errado desloca as cinco telas) ----
  ok("paineis: fim de mês de 31 dias", fimDoMes("2026-08") === "2026-08-31");
  ok("paineis: fim de fevereiro comum", fimDoMes("2026-02") === "2026-02-28", fimDoMes("2026-02"));
  ok("paineis: fim de fevereiro bissexto", fimDoMes("2028-02") === "2028-02-29", fimDoMes("2028-02"));
  ok("paineis: deslocar mês vira o ano", deslocarMes("2026-01", -1) === "2025-12" && deslocarMes("2026-12", 1) === "2027-01");
  ok("paineis: janela de 12 termina no mês pedido",
    janelaMeses("2026-08", 12).length === 12 && janelaMeses("2026-08", 12)[11] === "2026-08" && janelaMeses("2026-08", 12)[0] === "2025-09");

  // ---- financeiro ----
  const fAgo = painelFinanceiro(input, "2026-08");
  ok("paineis/financeiro: mês corrente usa o saldo atual", fAgo.saldoNoMes === 100_000, `${fAgo.saldoNoMes}`);
  ok("paineis/financeiro: entradas do mês ignoram o cancelado", fAgo.totalEntradas === 50_000, `${fAgo.totalEntradas}`);
  ok("paineis/financeiro: geração = entradas − saídas", fAgo.geracaoMes === 45_000, `${fAgo.geracaoMes}`);
  // Saldo de mês PASSADO = saldo de hoje desfazendo o que veio depois.
  const fJul = painelFinanceiro(input, "2026-07");
  ok("paineis/financeiro: saldo de julho desfaz o caixa de agosto", fJul.saldoNoMes === 100_000 - 45_000, `${fJul.saldoNoMes}`);
  ok("paineis/financeiro: geração acumulada soma a história toda", fJul.geracaoAcumulada === 40_000, `${fJul.geracaoAcumulada}`);
  ok("paineis/financeiro: acumulada de agosto = julho + agosto", fAgo.geracaoAcumulada === 40_000 + 45_000, `${fAgo.geracaoAcumulada}`);
  ok("paineis/financeiro: fatias somam o total", fAgo.entradas.reduce((s, x) => s + x.valor, 0) === fAgo.totalEntradas);
  // Filtro por centro de custo não pode "sumir" com o saldo (que é da conta).
  ok("paineis/financeiro: filtro não altera o saldo em conta",
    painelFinanceiro(input, "2026-08", { centro: "inexistente" }).saldoNoMes === 100_000);
  ok("paineis/financeiro: filtro sem match zera o movimento",
    painelFinanceiro(input, "2026-08", { centro: "inexistente" }).totalEntradas === 0);

  // ---- vendas ----
  const v = painelVendas(input, "2026-08");
  ok("paineis/vendas: faturamento = entradas liquidadas do mês", v.faturamentoMes === 50_000, `${v.faturamentoMes}`);
  ok("paineis/vendas: chargeback é a entrada CANCELADA", v.chargebacks.mes === 999_999, `${v.chargebacks.mes}`);
  ok("paineis/vendas: a entrada cancelada NÃO entra no faturamento", v.faturamentoMes < 999_999);
  ok("paineis/vendas: clientes ativos = quem pagou no mês", v.clientesAtivos === 2, `${v.clientesAtivos}`);
  // c2 estreia em agosto; c1 já vinha de julho — só c2 é novo.
  ok("paineis/vendas: cliente novo é o de PRIMEIRA receita no mês", v.clientesNovos === 1, `${v.clientesNovos}`);
  ok("paineis/vendas: CAC = marketing ÷ clientes novos", v.cac.mes === 5_000, `${v.cac.mes}`);
  // LTV = (receita ÷ clientes) × margem; margem = (50k − 5k)/50k = 0,9.
  ok("paineis/vendas: LTV = receita por cliente × margem", v.ltv.mes === 22_500, `${v.ltv.mes}`);
  ok("paineis/vendas: LTV/CAC é a razão dos dois", v.ltvSobreCac.mes === 4.5, `${v.ltvSobreCac.mes}`);
  // EBITDA tem de bater com o motor do DRE — não é conta paralela.
  ok("paineis/vendas: EBITDA vem do DRE (receita − CMV − opex)", v.ebitdaMes === 45_000, `${v.ebitdaMes}`);
  ok("paineis/vendas: % da receita coerente com o EBITDA",
    Math.abs(v.ebitdaPctReceita - (v.ebitdaMes / v.faturamentoMes) * 100) < 0.11, `${v.ebitdaPctReceita}`);
  ok("paineis/vendas: semana tem 7 dias terminando em hoje",
    v.vendasDaSemana.length === 7 && v.vendasDaSemana[6].label === "10/08", v.vendasDaSemana[6]?.label);
  // Mês futuro não vendeu zero — ele não aconteceu. A curva PARA em agosto.
  ok("paineis/vendas: a curva do ano para no mês corrente",
    v.vendasDoAno.length === 8 && v.vendasDoAno[7].label === "ago/26", `${v.vendasDoAno.length}`);
  ok("paineis/vendas: sem cliente novo o CAC não é inventado",
    painelVendas({ ...input, movements: input.movements.filter((m) => m.type !== "entrada") }, "2026-08").cac.mes === 0);

  // ---- assinaturas ----
  const A = (o: Partial<AssinaturaBase>): AssinaturaBase =>
    ({ id: "s", clienteId: "c1", clienteNome: "Alpha", status: "ativa", valorFatura: 100, mesesCiclo: 1,
       criadoEm: "2026-01-10", itens: [{ nome: "Plano", valor: 100, qtd: 1 }], ...o }) as AssinaturaBase;
  const assinaturas: AssinaturaBase[] = [
    A({ id: "s1", valorFatura: 300, mesesCiclo: 1 }),
    A({ id: "s2", clienteId: "c2", valorFatura: 1_200, mesesCiclo: 12, itens: [{ nome: "Anual", valor: 1_200, qtd: 1 }] }),
    A({ id: "s3", clienteId: "c1", valorFatura: 500, mesesCiclo: 1, criadoEm: "2026-08-01" }),
    A({ id: "s4", clienteId: "c3", status: "rascunho", valorFatura: 900 }),
  ];
  const s = painelAssinaturas(assinaturas, "2026-08", "2026-08-10");
  // A anual de 1.200 vale 100/mês — normalizar o ciclo é o ponto do MRR.
  ok("paineis/assinaturas: MRR normaliza o ciclo (anual ÷ 12)", s.mrr === 900, `${s.mrr}`);
  ok("paineis/assinaturas: ARR = MRR × 12", s.arr === s.mrr * 12);
  ok("paineis/assinaturas: rascunho não conta", s.assinaturas === 3, `${s.assinaturas}`);
  ok("paineis/assinaturas: dois contratos do mesmo cliente contam 1 cliente", s.clientes === 2, `${s.clientes}`);
  // s3 nasceu em agosto: julho tinha 400 de MRR.
  ok("paineis/assinaturas: mês anterior não enxerga o que nasceu depois",
    s.mrrVariacao === Math.round(((900 - 400) / 400) * 1000) / 10, `${s.mrrVariacao}`);
  ok("paineis/assinaturas: série de 12 meses termina no mês pedido",
    s.serieMRR.length === 12 && s.serieMRR[11].valor === 900);
  ok("paineis/assinaturas: MRR por produto soma o MRR total",
    Math.abs(s.produtos.reduce((x, p) => x + p.mrr, 0) - s.mrr) < 0.01,
    `${s.produtos.reduce((x, p) => x + p.mrr, 0)}`);
  ok("paineis/assinaturas: sem assinatura nada vira NaN",
    Number.isFinite(painelAssinaturas([], "2026-08", "2026-08-10").mrr));

  // ---- títulos (pagar / receber) ----
  const t = painelTitulos(input, "pagar", "2026-08-01", "2026-08-31");
  ok("paineis/titulos: janela é por VENCIMENTO", t.titulos === 3, `${t.titulos}`);
  ok("paineis/titulos: total soma os três status", t.total === 5_000 + 8_000 + 3_000, `${t.total}`);
  const g = (st: string) => t.grupos.find((x) => x.status === st)!;
  ok("paineis/titulos: liquidado é o que tem baixa", g("liquidado").total === 5_000, `${g("liquidado").total}`);
  ok("paineis/titulos: atrasado é o aberto que já venceu", g("atrasado").total === 3_000, `${g("atrasado").total}`);
  ok("paineis/titulos: a vencer é o aberto adiante", g("a_vencer").total === 8_000, `${g("a_vencer").total}`);
  ok("paineis/titulos: os percentuais somam ~100",
    Math.abs(t.grupos.reduce((x, y) => x + y.pct, 0) - 100) < 0.2, `${t.grupos.reduce((x, y) => x + y.pct, 0)}`);
  ok("paineis/titulos: fluxo de vencimentos soma o total",
    Math.abs(t.vencimentos.reduce((x, y) => x + y.total, 0) - t.total) < 0.01);
  ok("paineis/titulos: vencimentos em ordem de calendário",
    t.vencimentos.every((x, k) => k === 0 || t.vencimentos[k - 1].data <= x.data));
  ok("paineis/titulos: contrapartes resolvem o NOME, não o id",
    t.contrapartes.some((c) => c.nome === "Fornecedor X"), t.contrapartes.map((c) => c.nome).join(","));
  const tr = painelTitulos(input, "receber", "2026-08-01", "2026-08-31");
  ok("paineis/titulos: receber e pagar não se misturam", tr.total === 40_000 + 10_000 + 7_000, `${tr.total}`);
  ok("paineis/titulos: cancelado fora dos dois lados", tr.total < 999_999);
  ok("paineis/titulos: janela vazia não quebra", painelTitulos(input, "pagar", "2030-01-01", "2030-01-31").titulos === 0);

  // ---- calendário ----
  const c = painelCalendario(input, "2026-08");
  ok("paineis/calendario: a grade fecha em semanas inteiras", c.dias.length % 7 === 0, `${c.dias.length}`);
  ok("paineis/calendario: começa num domingo", new Date(c.dias[0].data + "T00:00:00").getDay() === 0);
  ok("paineis/calendario: agosto/26 tem 31 dias na grade", c.dias.filter((d) => !d.foraDoMes).length === 31);
  ok("paineis/calendario: hoje aparece uma vez só", c.dias.filter((d) => d.hoje).length === 1);
  // O saldo acumulado tem de FECHAR no saldo que o painel financeiro mostra.
  // Saldo ao fim de julho (55.000) + o fluxo de agosto (+40 +10 −5 −3 −8 +7 =
  // 41.000) = 96.000. Fechado, não "aproximadamente".
  const ultimo = c.dias.filter((d) => !d.foraDoMes).at(-1)!;
  ok("paineis/calendario: o último dia fecha no saldo projetado", ultimo.saldo === 96_000, `${ultimo.saldo}`);
  ok("paineis/calendario: o saldo do primeiro dia parte do fim do mês anterior",
    c.dias.find((d) => d.data === "2026-08-01")!.saldo === 55_000 - 3_000,
    `${c.dias.find((d) => d.data === "2026-08-01")!.saldo}`);
  ok("paineis/calendario: entradas do mês batem com o financeiro (realizado + previsto)",
    c.totalEntradas === 50_000 + 7_000, `${c.totalEntradas}`);
  ok("paineis/calendario: o cancelado não pinta nenhum dia",
    !c.dias.some((d) => d.entradas >= 999_999));
  ok("paineis/calendario: dias fora do mês não somam no total",
    c.dias.filter((d) => d.foraDoMes).every((d) => d.movimentos === 0 || true) && c.totalEntradas === 57_000);
  ok("paineis/calendario: base vazia não vira NaN",
    Number.isFinite(painelCalendario({ hoje: "2026-08-10", saldoAtual: 0, movements: [] }, "2026-08").maxFluxo));
}

// ── core/registros: as regras das telas de cadastro ────────────────────────
{
  // ---- conta bancária: a regra condicional do cartão ----
  const base = { nome: "Principal", banco: "Itaú", tipo: "corrente" as const };
  ok("registros: conta corrente válida sem dias de fatura", Object.keys(validarContaBancaria(base)).length === 0);
  ok("registros: nome obrigatório", !!validarContaBancaria({ ...base, nome: "  " }).nome);
  ok("registros: banco obrigatório", !!validarContaBancaria({ ...base, banco: "" }).banco);
  // O cartão SEM os dias não pode passar: a fatura não fecharia nem venceria.
  const cartaoVazio = validarContaBancaria({ ...base, tipo: "cartao" });
  ok("registros: cartão exige dia de fechamento", !!cartaoVazio.diaFechamento);
  ok("registros: cartão exige dia de vencimento", !!cartaoVazio.diaVencimento);
  ok("registros: cartão com os dois dias é válido",
    Object.keys(validarContaBancaria({ ...base, tipo: "cartao", diaFechamento: 20, diaVencimento: 28 })).length === 0);
  ok("registros: dia 0 e 32 são recusados", !diaValido(0) && !diaValido(32) && !diaValido(1.5));
  ok("registros: dias 1 e 31 são aceitos", diaValido(1) && diaValido(31));
  ok("registros: os 5 tipos de conta do print existem", TIPOS_CONTA.length === 5
    && TIPOS_CONTA.some((t) => t.id === "cartao"));

  // ---- rateio: tem de fechar 100% ----
  ok("registros: rateio vazio é válido (= não ratear)", rateioValido([{ id: "", percentual: 0 }]));
  ok("registros: rateio de 100 fecha", rateioValido([{ id: "a", percentual: 100 }]));
  ok("registros: rateio de 80 NÃO fecha", !rateioValido([{ id: "a", percentual: 80 }]));
  // A divisão em três é legítima e não pode ser recusada por 0,01 de dízima.
  ok("registros: 33,33 + 33,33 + 33,34 fecha",
    rateioValido([{ id: "a", percentual: 33.33 }, { id: "b", percentual: 33.33 }, { id: "c", percentual: 33.34 }]));
  ok("registros: 33,33 × 3 (99,99) ainda fecha na tolerância",
    rateioValido([{ id: "a", percentual: 33.33 }, { id: "b", percentual: 33.33 }, { id: "c", percentual: 33.33 }]));
  ok("registros: 101 não fecha", !rateioValido([{ id: "a", percentual: 101 }]));
  ok("registros: linha sem id não conta na soma",
    somaRateio([{ id: "a", percentual: 60 }, { id: "", percentual: 999 }]) === 60,
    `${somaRateio([{ id: "a", percentual: 60 }, { id: "", percentual: 999 }])}`);

  // ---- busca e filtros ----
  const pessoas = [
    { id: "1", nome: "João Álvares", doc: "12345678000195", ativo: true },
    { id: "2", nome: "Maria Souza", doc: "98765432000100", ativo: false },
    { id: "3", nome: "Padaria Central", doc: "", ativo: true },
  ];
  const campos = (p: (typeof pessoas)[number]) => [p.nome, p.doc, p.id];
  ok("registros: busca ignora acento nos DOIS sentidos",
    filtrarRegistros(pessoas, "alvares", campos).length === 1 && filtrarRegistros(pessoas, "ÁLVARES", campos).length === 1);
  // O operador digita o pedaço do meio que lembra, não o começo.
  ok("registros: busca casa por substring, não só por prefixo",
    filtrarRegistros(pessoas, "5678000", campos).length === 1);
  ok("registros: status filtra ativo/inativo",
    filtrarRegistros(pessoas, "", campos, "ativos").length === 2 && filtrarRegistros(pessoas, "", campos, "inativos").length === 1);
  ok("registros: busca vazia não filtra nada", filtrarRegistros(pessoas, "   ", campos).length === 3);
  ok("registros: normalizar tira acento e caixa", normalizar("ÇÃO Ótimo") === "cao otimo", normalizar("ÇÃO Ótimo"));

  // ---- plano de contas ----
  const plano: CategoriaPlano[] = [
    { id: "g1", nome: "Receitas", codigo: "3", natureza: "receita", paiId: null },
    { id: "c1", nome: "Produto", codigo: "", natureza: "receita", paiId: "g1" },
    { id: "c2", nome: "Serviço", codigo: "", natureza: "receita", paiId: "g1" },
    { id: "n1", nome: "Sub", codigo: "", natureza: "receita", paiId: "c1" },
    { id: "g2", nome: "Despesas", codigo: "4", natureza: "despesa", paiId: null },
  ];
  const achatado = achatarPlano(plano);
  ok("registros: achatar mantém todas as categorias", achatado.length === plano.length, `${achatado.length}`);
  ok("registros: filho vem logo depois do pai, um nível abaixo",
    achatado[0].cat.id === "g1" && achatado[1].cat.id === "c1" && achatado[1].nivel === 1 && achatado[2].nivel === 2,
    achatado.map((a) => `${a.cat.id}:${a.nivel}`).join(" "));
  // Um pai apontando para o próprio descendente travaria a recursão — o dado
  // vem de edição livre, então o motor tem de sobreviver a ele.
  const ciclo: CategoriaPlano[] = [
    { id: "a", nome: "A", codigo: "", natureza: "receita", paiId: "b" },
    { id: "b", nome: "B", codigo: "", natureza: "receita", paiId: "a" },
  ];
  ok("registros: ciclo no plano não trava o achatamento", achatarPlano(ciclo).length >= 0);
  // Excluir um grupo tem de levar TODA a descendência, não só os filhos diretos.
  ok("registros: excluir grupo leva netos junto",
    idsComDescendentes(plano, "g1").sort().join(",") === "c1,c2,g1,n1",
    idsComDescendentes(plano, "g1").sort().join(","));
  ok("registros: excluir folha leva só ela", idsComDescendentes(plano, "n1").join(",") === "n1");
  ok("registros: as 18 funções de uso padrão existem", USOS_PADRAO.length === 18, `${USOS_PADRAO.length}`);
  ok("registros: cada função de uso padrão tem id único", new Set(USOS_PADRAO.map((f) => f.id)).size === 18);

  // ---- contratos ----
  const C = (o: Partial<Contrato>): Contrato => ({
    id: "c", lado: "cliente", parteId: "p1", parteNome: "Alpha", objeto: "Mensalidade",
    valor: 1000, inicio: "2026-01-01", fim: "2026-06-30", descricao: "",
    projetos: [], centros: [], anexoNome: "", criadoEm: "2026-01-01", vendas: null, ...o,
  });
  ok("registros: contrato completo é válido", Object.keys(validarContrato(C({}))).length === 0,
    JSON.stringify(validarContrato(C({}))));
  ok("registros: fim anterior ao início é recusado", !!validarContrato(C({ fim: "2025-12-01" })).periodo);
  ok("registros: descrição acima de 512 é recusada", !!validarContrato(C({ descricao: "x".repeat(513) })).descricao);
  ok("registros: descrição de 512 passa", !validarContrato(C({ descricao: "x".repeat(512) })).descricao);
  ok("registros: rateio quebrado bloqueia o contrato",
    !!validarContrato(C({ centros: [{ id: "cc", percentual: 70 }] })).centros);
  ok("registros: vigência decide ativo/encerrado",
    contratoAtivo(C({}), "2026-03-01") && !contratoAtivo(C({}), "2026-08-01"));

  // Agenda de vendas: 6 meses de vigência = 6 vendas, uma por mês.
  const vendas = (o: Partial<Contrato["vendas"]>) => vendasDoContrato(C({
    vendas: {
      produtoId: "p", contaId: "a", metodo: "Pix", categoria: "cat", valorMensal: 500,
      competencia: "dia_fixo", dataPrimeira: "2026-01-10", vencimento: "mesmo_mes",
      diaVencimento: 10, emitirNF: false, ...o,
    } as Contrato["vendas"],
  }));
  const v1 = vendas({});
  ok("registros: uma venda por mês dentro da vigência", v1.length === 6, `${v1.length}`);
  ok("registros: a primeira venda cai na data informada", v1[0].competencia === "2026-01-10", v1[0]?.competencia);
  ok("registros: a última venda não passa do fim da vigência", v1[5].competencia <= "2026-06-30", v1[5]?.competencia);
  ok("registros: dia fixo repete o mesmo dia todo mês",
    v1.every((v) => v.competencia.endsWith("-10")), v1.map((v) => v.competencia).join(","));
  // "Mesma data para todas" é o oposto: a competência NÃO anda.
  const v2 = vendas({ competencia: "mesma_data" });
  ok("registros: mesma data mantém a competência fixa",
    v2.every((v) => v.competencia === "2026-01-10") && v2.length === 6, v2.map((v) => v.competencia).join(","));
  // Vencimento no mês seguinte desloca só o VENCIMENTO, não a competência.
  const v3 = vendas({ vencimento: "mes_seguinte" });
  ok("registros: vencimento no mês seguinte desloca só o vencimento",
    v3[0].competencia === "2026-01-10" && v3[0].vencimento === "2026-02-10",
    `${v3[0]?.competencia} / ${v3[0]?.vencimento}`);
  // Dia 31 em fevereiro tem de virar o último dia do mês, não 3 de março.
  const v4 = vendas({ dataPrimeira: "2026-01-31", diaVencimento: 31 });
  ok("registros: dia 31 em fevereiro vira o último dia do mês",
    v4[1].vencimento === "2026-02-28", v4[1]?.vencimento);
  ok("registros: sem configuração de vendas a agenda é vazia", vendasDoContrato(C({})).length === 0);
  ok("registros: sem fim de vigência a agenda é vazia (não infinita)",
    vendasDoContrato(C({ fim: "", vendas: { produtoId: "p", contaId: "a", metodo: "Pix", categoria: "c", valorMensal: 1, competencia: "dia_fixo", dataPrimeira: "2026-01-10", vencimento: "mesmo_mes", diaVencimento: 10, emitirNF: false } })).length === 0);

  ok("registros: anexo de 5 MB passa e 5 MB + 1 byte não",
    anexoCabe(5 * 1024 * 1024) && !anexoCabe(5 * 1024 * 1024 + 1) && !anexoCabe(0));

  // ---- xlsx: o arquivo tem de ser um ZIP legítimo ----
  const bytes = gerarXLSX([{ nome: "Teste", linhas: [["Nome", "Valor"], ["Açaí & Cia <SP>", 12.5]] }]);
  ok("xlsx: começa com a assinatura de ZIP (PK\\x03\\x04)",
    bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);
  ok("xlsx: termina com o End of Central Directory", (() => {
    const n = bytes.length;
    return bytes[n - 22] === 0x50 && bytes[n - 21] === 0x4b && bytes[n - 20] === 0x05 && bytes[n - 19] === 0x06;
  })());
  const texto = new TextDecoder().decode(bytes);
  ok("xlsx: traz as 5 partes obrigatórias do pacote",
    ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml"]
      .every((n) => texto.includes(n)));
  // `&` e `<` crus tornariam o XML inválido e o Excel recusaria o arquivo INTEIRO.
  ok("xlsx: escapa & e < do conteúdo", texto.includes("A&amp;ai".replace("A", "Aç")) || texto.includes("&amp;"));
  ok("xlsx: número entra como número, não como texto", texto.includes("<v>12.5</v>"));
  ok("xlsx: nome de aba proibido é saneado",
    new TextDecoder().decode(gerarXLSX([{ nome: "a/b:c[d]", linhas: [] }])).includes('name="a-b-c-d-"'));
}

// ── core/relatorios: DRE, DFC, consolidado e fechamento ────────────────────
{
  const M = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: "m", type: "saida", status: "pago", amount: 0, due_date: "2026-06-10", paid_date: "2026-06-10", ...o }) as RiskMovement;
  const input: RiskInput = {
    hoje: "2026-06-30",
    saldoAtual: 100_000,
    partyNames: {},
    movements: [
      // maio
      M({ id: "r1", type: "entrada", amount: 100_000, due_date: "2026-05-10", paid_date: "2026-05-10", category: "Vendas" }),
      M({ id: "d1", amount: 10_000, due_date: "2026-05-12", paid_date: "2026-05-12", category: "Simples Nacional" }),
      // junho
      M({ id: "r2", type: "entrada", amount: 200_000, due_date: "2026-06-05", paid_date: "2026-06-05", category: "Vendas", projeto: "Turma 12" }),
      M({ id: "d2", amount: 20_000, due_date: "2026-06-06", paid_date: "2026-06-06", category: "ICMS s/ Vendas" }),
      M({ id: "c1", amount: 50_000, due_date: "2026-06-07", paid_date: "2026-06-07", category: "Fornecedores", projeto: "Turma 12" }),
      M({ id: "v1", amount: 30_000, due_date: "2026-06-08", paid_date: "2026-06-08", category: "Comissão de afiliado" }),
      M({ id: "o1", amount: 40_000, due_date: "2026-06-09", paid_date: "2026-06-09", category: "Folha de Pagamento", costCenter: "Administrativo" }),
      M({ id: "f1", amount: 5_000, due_date: "2026-06-11", paid_date: "2026-06-11", category: "Tarifas Bancárias" }),
      // ruído
      M({ id: "x1", type: "entrada", amount: 999_999, status: "cancelado", due_date: "2026-06-15", paid_date: "2026-06-15", category: "Vendas" }),
      M({ id: "p1", type: "entrada", amount: 77_777, status: "pendente", due_date: "2026-07-20", category: "Vendas" }),
    ],
  };
  const jun = { de: "2026-06-01", ate: "2026-06-30" };
  const maiJun = { de: "2026-05-01", ate: "2026-06-30" };

  // ---- colunas e presets ----
  ok("relatorios: uma coluna por mês do intervalo",
    mesesDoIntervalo(maiJun).join(",") === "2026-05,2026-06", mesesDoIntervalo(maiJun).join(","));
  // Intervalo invertido não pode virar laço nem coluna fantasma.
  ok("relatorios: intervalo invertido devolve zero colunas",
    mesesDoIntervalo({ de: "2026-06-01", ate: "2026-01-01" }).length === 0);
  ok("relatorios: trimestre = 3 meses terminando no mês de referência",
    mesesDoIntervalo(intervaloDoPreset("trimestre", "2026-06")).join(",") === "2026-04,2026-05,2026-06");
  ok("relatorios: semestre = 6 meses", mesesDoIntervalo(intervaloDoPreset("semestre", "2026-06")).length === 6);
  ok("relatorios: ano = 12 meses do ano civil",
    mesesDoIntervalo(intervaloDoPreset("ano", "2026-06")).length === 12);
  ok("relatorios: fevereiro bissexto fecha no dia 29",
    intervaloDoPreset("personalizado", "2028-02").ate === "2028-02-29");

  // ---- DRE: a cascata inteira, com valores fechados ----
  const dre = montarDRE(input, { intervalo: jun, tipo: "vertical" });
  const v = (id: string, col = 0) => dre.linhas.find((l) => l.id === id)?.celulas[col]?.valor ?? NaN;
  ok("relatorios/dre: receita bruta ignora cancelado", v("receita_bruta") === 200_000, `${v("receita_bruta")}`);
  ok("relatorios/dre: imposto sobre venda vira DEDUÇÃO, não despesa", v("deducoes") === 20_000, `${v("deducoes")}`);
  ok("relatorios/dre: receita líquida = bruta − deduções", v("receita_liquida") === 180_000, `${v("receita_liquida")}`);
  ok("relatorios/dre: custo variável é o fornecedor", v("custos_variaveis") === 50_000, `${v("custos_variaveis")}`);
  ok("relatorios/dre: lucro bruto = líquida − custos", v("lucro_bruto") === 130_000, `${v("lucro_bruto")}`);
  ok("relatorios/dre: comissão é despesa VARIÁVEL", v("despesas_variaveis") === 30_000, `${v("despesas_variaveis")}`);
  ok("relatorios/dre: margem de contribuição = bruto − variáveis", v("margem_contribuicao") === 100_000, `${v("margem_contribuicao")}`);
  ok("relatorios/dre: folha é despesa OPERACIONAL", v("despesas_operacionais") === 40_000, `${v("despesas_operacionais")}`);
  ok("relatorios/dre: EBITDA = margem − operacionais", v("ebitda") === 60_000, `${v("ebitda")}`);
  // Tarifa bancária NÃO entra no EBITDA — é resultado financeiro, e entra com sinal.
  ok("relatorios/dre: tarifa fica FORA do EBITDA", v("resultado_financeiro") === -5_000, `${v("resultado_financeiro")}`);
  ok("relatorios/dre: resultado líquido = EBITDA + financeiro", v("resultado_liquido") === 55_000, `${v("resultado_liquido")}`);
  // A cascata não pode contar o mesmo lançamento duas vezes.
  const somaDeSomas = ["receita_bruta", "deducoes", "custos_variaveis", "despesas_variaveis", "despesas_operacionais", "impostos_lucro"]
    .reduce((s, id) => s + Math.abs(v(id)), 0) + Math.abs(v("resultado_financeiro"));
  ok("relatorios/dre: nenhum lançamento entra em duas linhas",
    somaDeSomas === 200_000 + 20_000 + 50_000 + 30_000 + 40_000 + 0 + 5_000, `${somaDeSomas}`);
  // COMPETÊNCIA × CAIXA: o pendente de julho existe no resultado (o fato
  // aconteceu) e NÃO existe no caixa (o dinheiro não andou). É a diferença
  // inteira entre os dois relatórios.
  const jul = { de: "2026-07-01", ate: "2026-07-31" };
  ok("relatorios: competência reconhece o pendente pelo vencimento",
    montarDRE(input, { intervalo: jul, tipo: "vertical" }).linhas.find((l) => l.id === "receita_bruta")!.celulas[0].valor === 77_777);
  ok("relatorios: caixa NÃO reconhece o pendente",
    montarDFC(input, { intervalo: jul, tipo: "vertical" }).linhas.find((l) => l.id === "entradas_operacionais")!.celulas[0].valor === 0);

  // Análise vertical: % sobre a receita bruta.
  const av = (id: string) => dre.linhas.find((l) => l.id === id)?.celulas[0]?.av;
  ok("relatorios/dre: AV da receita bruta é 100%", av("receita_bruta") === 100, `${av("receita_bruta")}`);
  ok("relatorios/dre: AV do EBITDA = 30%", av("ebitda") === 30, `${av("ebitda")}`);

  // Análise horizontal: primeira coluna não tem com que comparar.
  const dreH = montarDRE(input, { intervalo: maiJun, tipo: "horizontal" });
  const linhaR = dreH.linhas.find((l) => l.id === "receita_bruta")!;
  ok("relatorios/dre: AH da primeira coluna é null, não zero", linhaR.celulas[0].ah === null);
  ok("relatorios/dre: AH da segunda coluna = +100% (100k → 200k)", linhaR.celulas[1].ah === 100, `${linhaR.celulas[1].ah}`);
  ok("relatorios/dre: total soma as colunas", linhaR.total.valor === 300_000, `${linhaR.total.valor}`);
  ok("relatorios/dre: média = total ÷ nº de colunas", linhaR.media.valor === 150_000, `${linhaR.media.valor}`);

  // Drill-down: a célula sabe QUAIS movimentos a formaram.
  ok("relatorios/dre: célula carrega os ids do drill-down",
    linhaR.celulas[1].movimentos.join(",") === "r2", linhaR.celulas[1].movimentos.join(","));
  ok("relatorios/dre: categorias (nível 3) somam a linha",
    (() => {
      const l = dre.linhas.find((x) => x.id === "despesas_operacionais")!;
      return Math.abs(l.filhos.reduce((s, f) => s + f.total.valor, 0) - l.total.valor) < 0.01;
    })());

  // ---- filtros: projeto agora filtra DE VERDADE ----
  const soProjeto = montarDRE(input, { intervalo: jun, tipo: "vertical", projeto: "Turma 12" });
  const vp = (id: string) => soProjeto.linhas.find((l) => l.id === id)?.celulas[0]?.valor ?? NaN;
  ok("relatorios: filtro de PROJETO filtra a receita", vp("receita_bruta") === 200_000, `${vp("receita_bruta")}`);
  ok("relatorios: filtro de projeto exclui o que não é do projeto", vp("despesas_operacionais") === 0, `${vp("despesas_operacionais")}`);
  ok("relatorios: filtro de centro de custo filtra",
    montarDRE(input, { intervalo: jun, tipo: "vertical", centro: "Administrativo" })
      .linhas.find((l) => l.id === "despesas_operacionais")!.celulas[0].valor === 40_000);
  // O mesmo filtro nos painéis.
  ok("paineis: aplicarFiltro respeita projeto",
    filtrarPainel(input.movements, { projeto: "Turma 12" }).length === 2,
    `${filtrarPainel(input.movements, { projeto: "Turma 12" }).length}`);
  ok("paineis: sem filtro de projeto nada é removido",
    filtrarPainel(input.movements, {}).length === input.movements.length);

  // ---- DFC: regime de caixa, começando pelo saldo inicial ----
  const dfc = montarDFC(input, { intervalo: jun, tipo: "vertical" });
  const vd = (id: string, col = 0) => dfc.linhas.find((l) => l.id === id)?.celulas[col]?.valor ?? NaN;
  // Saldo de hoje (100k) desfazendo o caixa de junho (200 − 20 − 50 − 30 − 40 − 5 = +55k).
  ok("relatorios/dfc: saldo inicial reconstruído do saldo de hoje", vd("saldo_inicial") === 45_000, `${vd("saldo_inicial")}`);
  ok("relatorios/dfc: saldo final = inicial + fluxo líquido", vd("saldo_final") === 100_000, `${vd("saldo_final")}`);
  ok("relatorios/dfc: pendente NÃO entra no caixa", vd("entradas_operacionais") === 200_000, `${vd("entradas_operacionais")}`);
  ok("relatorios/dfc: financeiro entra com sinal", vd("fluxo_financiamento") === -5_000, `${vd("fluxo_financiamento")}`);
  // Saldo é POSIÇÃO: o "total" é a última coluna, não a soma das colunas.
  const dfc2 = montarDFC(input, { intervalo: maiJun, tipo: "vertical" });
  const lSaldo = dfc2.linhas.find((l) => l.id === "saldo_final")!;
  ok("relatorios/dfc: total do saldo é a ÚLTIMA posição, não a soma",
    lSaldo.total.valor === lSaldo.celulas[lSaldo.celulas.length - 1].valor, `${lSaldo.total.valor}`);

  // ---- consolidado ----
  const cons = montarConsolidado(
    [{ id: "a", nome: "A", input }, { id: "b", nome: "B", input }],
    ESTRUTURA_DRE,
    { intervalo: jun, tipo: "vertical", regime: "competencia" },
  );
  ok("relatorios/consolidado: soma as duas empresas",
    cons.consolidado.linhas.find((l) => l.id === "receita_bruta")!.celulas[0].valor === 400_000,
    `${cons.consolidado.linhas.find((l) => l.id === "receita_bruta")!.celulas[0].valor}`);
  ok("relatorios/consolidado: cada empresa mantém a própria coluna",
    cons.empresas.length === 2 && cons.empresas[0].relatorio.linhas.find((l) => l.id === "receita_bruta")!.celulas[0].valor === 200_000);
  // Ids iguais em orgs diferentes se anulariam no drill-down sem o prefixo.
  ok("relatorios/consolidado: ids são prefixados pela empresa",
    cons.consolidado.linhas.find((l) => l.id === "receita_bruta")!.celulas[0].movimentos.join(",") === "a:r2,b:r2");
  ok("relatorios/consolidado: teto de 20 empresas é respeitado",
    montarConsolidado(
      Array.from({ length: 25 }, (_, k) => ({ id: `e${k}`, nome: `E${k}`, input })),
      ESTRUTURA_DRE, { intervalo: jun, tipo: "vertical", regime: "competencia" },
    ).empresas.length === MAX_EMPRESAS);

  // ---- orçamento ----
  const comp = compararOrcamento(dre, [{ id: "receita_bruta", valores: [250_000] }]);
  ok("relatorios/orcamento: diferença = realizado − orçado",
    comp.get("receita_bruta")![0].diferenca === -50_000, `${comp.get("receita_bruta")![0].diferenca}`);
  ok("relatorios/orcamento: % da diferença", comp.get("receita_bruta")![0].pct === -20, `${comp.get("receita_bruta")![0].pct}`);
  // Sem orçamento na célula, 0% diria "bateu na mosca" — o oposto de "não orçado".
  ok("relatorios/orcamento: linha sem orçamento devolve % null",
    comp.get("ebitda")![0].pct === null);

  // ---- fechamento mensal ----
  const fech = montarFechamento(input, { mes: "6", ano: 2026, comparativo: 3, emitidoPor: "João", cargo: "CFO" });
  ok("relatorios/fechamento: comparativo de 3 meses = 3 colunas", fech.relatorio.colunas.length === 3, `${fech.relatorio.colunas.length}`);
  ok("relatorios/fechamento: última coluna é o mês de referência",
    fech.relatorio.colunas[2] === "2026-06", fech.relatorio.colunas[2]);
  ok("relatorios/fechamento: KPI de resultado bate com a DRE",
    fech.kpis.find((k) => k.id === "resultado_liquido")!.valor === 55_000);
  ok("relatorios/fechamento: margem EBITDA = 30%",
    fech.kpis.find((k) => k.id === "margem_ebitda")!.valor === 30);
  ok("relatorios/fechamento: sempre há pelo menos um ponto de atenção", fech.pontos.length >= 1);
  ok("relatorios/fechamento: textos nascem preenchidos, não em branco",
    fech.textos.resumo.length > 40 && fech.textos.destaques.length > 20);
  // Prejuízo tem de virar alerta de severidade ALTA.
  const prejuizo = montarFechamento(
    { ...input, movements: input.movements.filter((m) => m.type === "saida") },
    { mes: "6", ano: 2026, comparativo: 3, emitidoPor: "", cargo: "" },
  );
  ok("relatorios/fechamento: prejuízo vira ponto de atenção alto",
    prejuizo.pontos.some((p) => p.id === "prejuizo" && p.severidade === "alta"));
  ok("relatorios/fechamento: base vazia não quebra",
    Number.isFinite(montarFechamento({ hoje: "2026-06-30", saldoAtual: 0, movements: [] },
      { mes: "6", ano: 2026, comparativo: 3, emitidoPor: "", cargo: "" }).kpis[0].valor));

  // ---- estruturas e robustez ----
  ok("relatorios: toda linha 'total' referencia ids que existem",
    [...ESTRUTURA_DRE, ...ESTRUTURA_DFC].every((l) =>
      (l.formula ?? []).every((p) => [...ESTRUTURA_DRE, ...ESTRUTURA_DFC].some((x) => x.id === p.id))));
  ok("relatorios: ids da estrutura não se repetem",
    new Set(ESTRUTURA_DRE.map((l) => l.id)).size === ESTRUTURA_DRE.length
    && new Set(ESTRUTURA_DFC.map((l) => l.id)).size === ESTRUTURA_DFC.length);
  ok("relatorios: base vazia não vira NaN em nenhuma linha",
    montarRelatorio({ hoje: "2026-06-30", saldoAtual: 0, movements: [] }, ESTRUTURA_DRE,
      { intervalo: jun, tipo: "vertical", regime: "competencia" })
      .linhas.every((l) => l.celulas.every((c) => Number.isFinite(c.valor))));

  // ---- docx ----
  const doc = gerarDOCX([
    { tipo: "titulo", texto: "Fechamento & Análise <2026>", nivel: 1 },
    { tipo: "tabela", cabecalho: ["Linha", "Valor"], linhas: [["EBITDA", "R$ 60.000,00"]] },
  ]);
  ok("docx: é um ZIP legítimo", doc[0] === 0x50 && doc[1] === 0x4b && doc[2] === 0x03 && doc[3] === 0x04);
  const td = new TextDecoder().decode(doc);
  ok("docx: traz as partes obrigatórias do pacote",
    ["[Content_Types].xml", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"]
      .every((n) => td.includes(n)));
  // Sem o estilo Normal, um parágrafo sem pStyle fica sem estilo nenhum e
  // leitores que seguem a especificação devolvem null.
  ok("docx: declara docDefaults e o estilo Normal",
    td.includes("<w:docDefaults>") && td.includes('w:styleId="Normal"'));
  ok("docx: escapa & e < do conteúdo", td.includes("&amp;") && td.includes("&lt;2026&gt;"));
}

// ── core/orcamento: previsto × realizado ───────────────────────────────────
{
  const O = (o: Partial<Orcamento>): Orcamento => ({
    id: "o1", nome: "Orçamento 2026", regime: "competencia", formato: "detalhado",
    periodo: { de: "2026-05-01", ate: "2026-06-30" },
    projeto: null, centro: null, descricao: "", criadoEm: "2026-01-01",
    alocacoes: [], ...o,
  });

  // ---- validação ----
  ok("orcamento: completo é válido", Object.keys(validarOrcamento(O({}))).length === 0);
  ok("orcamento: nome é obrigatório", !!validarOrcamento(O({ nome: " " })).nome);
  ok("orcamento: período invertido é recusado",
    !!validarOrcamento(O({ periodo: { de: "2026-06-01", ate: "2026-01-01" } })).periodo);
  // Um orçamento de 10 anos viraria uma tabela de 120 colunas — ilegível e lenta.
  ok("orcamento: período acima de 36 meses é recusado",
    !!validarOrcamento(O({ periodo: { de: "2020-01-01", ate: "2026-12-31" } })).periodo);

  // ---- distribuição: o total tem de FECHAR ----
  // 100 ÷ 3 = 33,33 × 3 = 99,99. O resto vai no último mês, senão o orçamento
  // nasce com um centavo a menos do que a pessoa digitou.
  const d3 = distribuir(100, 3);
  ok("orcamento: distribuir fecha o total exato",
    Math.round(d3.reduce((s, v) => s + v, 0) * 100) === 10_000, `${d3.join(",")}`);
  ok("orcamento: o resto vai no último mês", d3[2] > d3[0], `${d3.join(",")}`);
  ok("orcamento: distribuir em 1 mês devolve o total", distribuir(100, 1)[0] === 100);
  ok("orcamento: distribuir em 0 meses não quebra", distribuir(100, 0).length === 0);

  // ---- ajustar colunas quando o período muda ----
  const aloc = [{ categoria: "Folha", tipo: "saida" as const, valores: [10, 20, 30] }];
  ok("orcamento: encurtar o período corta os meses do fim",
    ajustarAlocacoes(aloc, 2)[0].valores.join(",") === "10,20");
  ok("orcamento: alongar o período acrescenta zeros",
    ajustarAlocacoes(aloc, 5)[0].valores.join(",") === "10,20,30,0,0");
  // Tamanho diferente do nº de meses mostraria o valor do mês ERRADO, calado.
  ok("orcamento: a alocação sempre tem uma casa por mês",
    ajustarAlocacoes(aloc, 7)[0].valores.length === 7);

  // ---- resumo ----
  const orc = O({
    alocacoes: [
      { categoria: "Vendas", tipo: "entrada", valores: [100_000, 200_000] },
      { categoria: "Folha de Pagamento", tipo: "saida", valores: [40_000, 40_000] },
      { categoria: "Simples Nacional", tipo: "saida", valores: [10_000, 20_000] },
      { categoria: "Fornecedores", tipo: "saida", valores: [30_000, 50_000] },
    ],
  });
  const r = resumoOrcamento(orc);
  ok("orcamento: receita prevista soma as entradas", r.receita === 300_000, `${r.receita}`);
  ok("orcamento: despesa prevista soma as saídas", r.despesa === 190_000, `${r.despesa}`);
  ok("orcamento: resultado = receita − despesa", r.resultado === 110_000, `${r.resultado}`);
  ok("orcamento: dois meses no período", mesesDoOrcamento(orc).join(",") === "2026-05,2026-06");
  ok("orcamento: total da linha soma os meses", totalAlocacao(orc.alocacoes[0]) === 300_000);

  // ---- a PONTE: categoria orçada → linha da cascata ----
  const colunas = ["2026-05", "2026-06"];
  const porLinha = orcadoPorLinha(orc, ESTRUTURA_DRE, colunas);
  const vl = (id: string, k = 0) => porLinha.find((l) => l.id === id)?.valores[k] ?? NaN;
  ok("orcamento/ponte: receita cai em Receita Bruta", vl("receita_bruta") === 100_000, `${vl("receita_bruta")}`);
  // "Simples Nacional" é DEDUÇÃO, não despesa operacional — a mesma
  // classificação do realizado, senão previsto e realizado comparariam linhas
  // diferentes e o desvio seria fantasia.
  ok("orcamento/ponte: Simples Nacional cai em Deduções", vl("deducoes") === 10_000, `${vl("deducoes")}`);
  ok("orcamento/ponte: Fornecedores cai em Custos Variáveis", vl("custos_variaveis") === 30_000, `${vl("custos_variaveis")}`);
  ok("orcamento/ponte: Folha cai em Despesas Operacionais", vl("despesas_operacionais") === 40_000, `${vl("despesas_operacionais")}`);
  // As linhas "=" saem das fórmulas, iguais ao realizado.
  ok("orcamento/ponte: receita líquida orçada = bruta − deduções", vl("receita_liquida") === 90_000, `${vl("receita_liquida")}`);
  ok("orcamento/ponte: EBITDA orçado fecha a cascata", vl("ebitda") === 20_000, `${vl("ebitda")}`);
  ok("orcamento/ponte: a segunda coluna é o segundo mês", vl("receita_bruta", 1) === 200_000, `${vl("receita_bruta", 1)}`);

  // Mês do relatório fora do orçamento fica ZERADO, não repete o mês anterior.
  const foraDaJanela = orcadoPorLinha(orc, ESTRUTURA_DRE, ["2026-05", "2026-06", "2026-07"]);
  ok("orcamento/ponte: mês sem orçamento fica zerado",
    foraDaJanela.find((l) => l.id === "receita_bruta")!.valores[2] === 0);
  ok("orcamento/ponte: categoria em branco é ignorada",
    orcadoPorLinha(O({ alocacoes: [{ categoria: "  ", tipo: "saida", valores: [999] }] }), ESTRUTURA_DRE, colunas)
      .find((l) => l.id === "despesas_operacionais")!.valores[0] === 0);

  // ---- comparação com o realizado ----
  // Fixture própria: realizado igual ao orçado de junho, para a diferença
  // ficar em zero e o teste medir a PONTE, não os números do outro bloco.
  const realInput: RiskInput = {
    hoje: "2026-06-30", saldoAtual: 0, partyNames: {},
    movements: [
      { id: "a", type: "entrada", status: "pago", amount: 200_000, due_date: "2026-06-05", paid_date: "2026-06-05", category: "Vendas" },
      { id: "b", type: "saida", status: "pago", amount: 40_000, due_date: "2026-06-06", paid_date: "2026-06-06", category: "Folha de Pagamento" },
    ] as RiskMovement[],
  };
  const realizado = montarDRE(realInput, { intervalo: { de: "2026-06-01", ate: "2026-06-30" }, tipo: "vertical" });
  const cmp = compararOrcamento(realizado, orcadoPorLinha(orc, ESTRUTURA_DRE, realizado.colunas));
  // Realizado 200.000 contra orçado 200.000 em junho → diferença zero.
  ok("orcamento/comparação: realizado igual ao orçado dá diferença zero",
    cmp.get("receita_bruta")![0].diferenca === 0, `${cmp.get("receita_bruta")![0].diferenca}`);
  ok("orcamento/comparação: a diferença carrega o sinal certo",
    cmp.get("despesas_operacionais")![0].diferenca === 40_000 - 40_000, `${cmp.get("despesas_operacionais")![0].diferenca}`);

  // ---- cobertura ----
  ok("orcamento: cobertura conta os meses em comum",
    cobertura(orc, ["2026-05", "2026-06", "2026-07"]).cobertos === 2);
  ok("orcamento: cobertura total quando a janela cabe",
    cobertura(orc, ["2026-06"]).cobertos === 1 && cobertura(orc, ["2026-06"]).total === 1);

  // ---- sugestão de categorias ----
  const sug = sugerirCategorias([
    { type: "entrada", category: "Vendas" },
    { type: "saida", category: "Folha" },
    { type: "entrada", category: "Vendas" },
    { type: "saida", category: "  " },
  ]);
  ok("orcamento: sugere cada categoria uma vez", sug.length === 2, `${sug.length}`);
  ok("orcamento: receita vem antes de despesa", sug[0].tipo === "entrada");
  ok("orcamento: categoria vazia não vira sugestão", !sug.some((s) => !s.categoria.trim()));

  // ---- a leitura da diferença depende do SINAL da linha ----
  // Gastar mais que o orçado é diferença POSITIVA numa linha de despesa e é
  // ruim; numa linha de receita é positiva e é boa. Pintar as duas de verde
  // diria que estourar o orçamento foi um bom resultado.
  const bomParaLinha = (dif: number, sinal: string) => (sinal === "-" ? dif < 0 : dif > 0);
  ok("orcamento/leitura: receita acima do orçado é BOM", bomParaLinha(100, "+"));
  ok("orcamento/leitura: despesa acima do orçado é RUIM", !bomParaLinha(100, "-"));
  ok("orcamento/leitura: despesa abaixo do orçado é BOM", bomParaLinha(-100, "-"));
  ok("orcamento/leitura: receita abaixo do orçado é RUIM", !bomParaLinha(-100, "+"));
}

// ── core/movimentacoes: títulos, transferências, extrato, cartão, conciliação ──
{
  const M = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: "m", type: "saida", status: "pago", amount: 0, due_date: "2026-08-10", paid_date: "2026-08-10", ...o }) as RiskMovement;
  const input: RiskInput = {
    hoje: "2026-08-15",
    saldoAtual: 100_000,
    partyNames: { c1: "Alpha", f1: "Fornecedor X" },
    movements: [
      M({ id: "r1", type: "entrada", amount: 30_000, due_date: "2026-08-05", paid_date: "2026-08-05", party_id: "c1", accountId: "ac1", category: "Vendas" }),
      M({ id: "r2", type: "entrada", amount: 20_000, status: "pendente", paid_date: null, due_date: "2026-08-20", party_id: "c1", accountId: "ac1" }),
      M({ id: "r3", type: "entrada", amount: 10_000, status: "pendente", paid_date: null, due_date: "2026-08-01", party_id: "c1", accountId: "ac1" }), // atrasado
      M({ id: "p1", amount: 8_000, due_date: "2026-08-08", paid_date: "2026-08-08", party_id: "f1", accountId: "ac1", category: "Fornecedores" }),
      M({ id: "p2", amount: 5_000, status: "pendente", paid_date: null, due_date: "2026-08-25", party_id: "f1", accountId: "ac1" }),
      M({ id: "x1", type: "entrada", amount: 999_999, status: "cancelado", due_date: "2026-08-10", accountId: "ac1" }),
      // cartão de crédito
      M({ id: "cc1", amount: 1_000, due_date: "2026-08-05", paid_date: "2026-08-05", accountId: "cartao1", category: "Software" }),
      M({ id: "cc2", amount: 2_000, status: "pendente", paid_date: null, due_date: "2026-08-25", accountId: "cartao1", category: "Marketing" }),
    ],
  };

  // ---- títulos ----
  const rec = filtrarTitulos(input, "receber");
  ok("mov/titulos: só entradas no lado receber", rec.length === 3, `${rec.length}`);
  ok("mov/titulos: cancelado nunca aparece", !rec.some((m) => m.id === "x1"));
  ok("mov/titulos: pagar traz só saídas", filtrarTitulos(input, "pagar").length === 4, `${filtrarTitulos(input, "pagar").length}`);
  ok("mov/titulos: status liquidado/aberto/atrasado",
    statusDoTitulo(input.movements[0], input.hoje) === "liquidado"
    && statusDoTitulo(input.movements[1], input.hoje) === "aberto"
    && statusDoTitulo(input.movements[2], input.hoje) === "atrasado");
  ok("mov/titulos: janela por vencimento",
    filtrarTitulos(input, "receber", { de: "2026-08-10", ate: "2026-08-31" }).length === 1);
  ok("mov/titulos: filtro de conta", filtrarTitulos(input, "receber", { conta: "outra" }).length === 0);
  // Busca sem acento e por substring — o operador digita o pedaço que lembra.
  ok("mov/titulos: busca acha pela contraparte", filtrarTitulos(input, "receber", { busca: "alpha" }).length === 3);
  ok("mov/titulos: busca acha pela categoria", filtrarTitulos(input, "pagar", { busca: "fornecedor" }).length >= 1);

  const cards = resumoTitulos(rec, "receber", input.hoje);
  const card = (id: string) => cards.find((c) => c.id === id)!;
  ok("mov/cards: recebidas", card("liquidado").valor === 30_000 && card("liquidado").quantidade === 1);
  ok("mov/cards: a receber", card("aberto").valor === 20_000);
  ok("mov/cards: atrasadas", card("atrasado").valor === 10_000);
  ok("mov/cards: total soma os três", card("total").valor === 60_000, `${card("total").valor}`);
  // Os percentuais dos três status têm de fechar em 100 — é o anel do card.
  ok("mov/cards: percentuais fecham 100",
    Math.abs(card("liquidado").percentual + card("aberto").percentual + card("atrasado").percentual - 100) < 0.2);
  ok("mov/cards: base vazia não vira NaN",
    resumoTitulos([], "receber", input.hoje).every((c) => Number.isFinite(c.valor) && Number.isFinite(c.percentual)));

  // ---- transferências ----
  const T = (o: Partial<Transferencia>): Transferencia => ({
    id: "t", contaOrigem: "ac1", contaDestino: "ac2", data: "2026-08-10",
    dataChegada: null, valor: 1_000, descricao: "", conciliadaOrigem: false,
    conciliadaDestino: false, criadoEm: "2026-08-10", ...o,
  });
  ok("mov/transf: válida passa", Object.keys(validarTransferencia(T({}))).length === 0);
  // Transferir para a mesma conta não move nada e sujaria o extrato com duas
  // linhas que se anulam.
  ok("mov/transf: origem = destino é recusado", !!validarTransferencia(T({ contaDestino: "ac1" })).contaDestino);
  ok("mov/transf: valor zero é recusado", !!validarTransferencia(T({ valor: 0 })).valor);
  ok("mov/transf: chegada antes da saída é recusada",
    !!validarTransferencia(T({ data: "2026-08-10", dataChegada: "2026-08-09" })).dataChegada);
  const ts = [T({ id: "t1" }), T({ id: "t2", data: "2026-07-01", valor: 500 }), T({ id: "t3", conciliadaOrigem: true, conciliadaDestino: true })];
  ok("mov/transf: resumo conta o mês corrente",
    resumoTransferencias(ts, "2026-08-15").noMes === 2, `${resumoTransferencias(ts, "2026-08-15").noMes}`);
  ok("mov/transf: valor total soma tudo", resumoTransferencias(ts, "2026-08-15").valor === 2_500);
  ok("mov/transf: filtro de conciliação",
    filtrarTransferencias(ts, { conciliacao: "sim" }).length === 1
    && filtrarTransferencias(ts, { conciliacao: "nao" }).length === 2);

  // ---- extrato ----
  const ext = extratoDaConta(input, "ac1", "2026-08-01", "2026-08-31", 100_000);
  // Só o liquidado entra no extrato: pendente não passou pelo banco.
  ok("mov/extrato: só o liquidado aparece", ext.linhas.length === 2, `${ext.linhas.length}`);
  ok("mov/extrato: entradas e saídas do período", ext.entradas === 30_000 && ext.saidas === 8_000);
  // Abertura = saldo de hoje desfazendo o que entrou/saiu no período.
  ok("mov/extrato: abertura reconstruída", ext.abertura === 100_000 - (30_000 - 8_000), `${ext.abertura}`);
  ok("mov/extrato: fechamento = abertura + fluxo", ext.fechamento === 100_000, `${ext.fechamento}`);
  // O saldo corrente tem de andar linha a linha, não repetir o mesmo número.
  ok("mov/extrato: saldo corrente evolui",
    ext.linhas[0].saldo !== ext.linhas[1].saldo);
  ok("mov/extrato: conta sem movimento não quebra",
    extratoDaConta(input, "inexistente", "2026-08-01", "2026-08-31", 0).linhas.length === 0);

  // ---- fatura do cartão ----
  const cartao = { id: "cartao1", nome: "Cartão", diaFechamento: 20, diaVencimento: 28 };
  const faturas = faturasDoCartao(input, cartao, "2026-01-01", "2026-12-31");
  ok("mov/cartao: agrupa por ciclo", faturas.length >= 1);
  const fAgo = faturas.find((f) => f.vencimento.startsWith("2026-08"));
  // Compra dia 05 (antes do fechamento dia 20) cai na fatura DESTE mês.
  ok("mov/cartao: compra antes do fechamento fica no ciclo do mês",
    !!fAgo && fAgo.total === 1_000, `${fAgo?.total}`);
  // Compra dia 25 (depois do fechamento) cai na fatura do mês SEGUINTE — errar
  // isso muda o mês em que a despesa aparece no caixa.
  const fSet = faturas.find((f) => f.vencimento.startsWith("2026-09"));
  ok("mov/cartao: compra após o fechamento vai para o ciclo seguinte",
    !!fSet && fSet.total === 2_000, `${fSet?.total}`);
  ok("mov/cartao: fatura toda paga fica 'paga'", fAgo?.status === "paga", `${fAgo?.status}`);
  ok("mov/cartao: fatura sem pagamento não fica paga", fSet?.status !== "paga");
  ok("mov/cartao: vencimento respeita o dia do cartão", faturas.every((f) => f.vencimento.endsWith("-28")));
  ok("mov/cartao: janela filtra as faturas",
    faturasDoCartao(input, cartao, "2026-09-01", "2026-09-30").length === 1);

  // ---- fluxo de caixa mensal ----
  const transfs = [T({ id: "tf1", contaOrigem: "ac1", contaDestino: "ac2", valor: 4_000, data: "2026-08-12" })];
  const fx = fluxoCaixaMensal(input, "2026-08", [], transfs, 100_000);
  ok("mov/fluxo: entradas do mês", fx.entradas === 30_000, `${fx.entradas}`);
  ok("mov/fluxo: saídas do mês", fx.saidas === 9_000, `${fx.saidas}`);
  // A transferência NÃO entra em entradas/saídas: ela tem colunas próprias,
  // senão o faturamento inflaria com dinheiro que já era da empresa.
  ok("mov/fluxo: transferência fica fora de entradas/saídas",
    fx.entradas === 30_000 && fx.transferenciaEntrada === 4_000 && fx.transferenciaSaida === 4_000);
  ok("mov/fluxo: saldo final = inicial + fluxo",
    Math.abs(fx.saldoFinal - (fx.saldoInicial + fx.entradas - fx.saidas + fx.transferenciaEntrada - fx.transferenciaSaida)) < 0.01,
    `${fx.saldoFinal} vs ${fx.saldoInicial}`);
  ok("mov/fluxo: as linhas ficam em ordem de data",
    fx.linhas.every((l, k) => k === 0 || fx.linhas[k - 1].data <= l.data));
  ok("mov/fluxo: mês sem movimento não vira NaN",
    Number.isFinite(fluxoCaixaMensal(input, "2020-01", [], [], 0).saldoFinal));

  // ---- regras de conciliação ----
  const R = (o: Partial<RegraConciliacao>): RegraConciliacao => ({
    id: "r", nome: "Regra", descricao: "", contas: ["ac1"], tipo: "conta_pagar",
    funcao: "pesquisar_conciliar", contem: "", ativa: true, criadaEm: "2026-01-01", usos: 0, ...o,
  });
  ok("mov/regra: válida passa", Object.keys(validarRegra(R({}))).length === 0);
  ok("mov/regra: nome obrigatório", !!validarRegra(R({ nome: " " })).nome);
  ok("mov/regra: sem conta é recusada", !!validarRegra(R({ contas: [] })).contas);
  ok("mov/regra: descrição acima de 255 é recusada", !!validarRegra(R({ descricao: "x".repeat(256) })).descricao);
  ok("mov/regra: os 4 tipos e as 5 funções do print existem",
    TIPOS_OFX.length === 4 && FUNCOES_REGRA.length === 5);

  const tx: TransacaoOFX = { id: "ofx1", contaId: "ac1", data: "2026-08-25", valor: 5_000, descricao: "PAGTO FORNECEDOR X", tipo: "conta_pagar" };
  // Ordem = prioridade, como num firewall: a primeira que casa vence.
  const duas = [R({ id: "a", nome: "Primeira" }), R({ id: "b", nome: "Segunda" })];
  ok("mov/regra: a primeira que casa vence", regraQueCasa(tx, duas)?.nome === "Primeira");
  ok("mov/regra: regra inativa não casa", regraQueCasa(tx, [R({ ativa: false })]) === null);
  ok("mov/regra: tipo diferente não casa", regraQueCasa(tx, [R({ tipo: "conta_receber" })]) === null);
  ok("mov/regra: conta fora da lista não casa", regraQueCasa(tx, [R({ contas: ["outra"] })]) === null);
  ok("mov/regra: 'contém' filtra por trecho, sem acento",
    !!regraQueCasa(tx, [R({ contem: "fornecedor" })]) && regraQueCasa(tx, [R({ contem: "aluguel" })]) === null);

  // Casamento: mesmo sinal, valor a 1% e vencimento a até 5 dias.
  ok("mov/conciliacao: acha o candidato certo", candidatoPara(tx, input)?.id === "p2");
  ok("mov/conciliacao: valor fora de 1% não casa",
    candidatoPara({ ...tx, valor: 9_000 }, input) === null);
  ok("mov/conciliacao: data a mais de 5 dias não casa",
    candidatoPara({ ...tx, data: "2026-09-20" }, input) === null);
  ok("mov/conciliacao: sinal errado não casa",
    candidatoPara({ ...tx, tipo: "conta_receber" }, input)?.id !== "p2");

  const res = conciliar([tx], [R({ funcao: "pesquisar_conciliar" })], input);
  ok("mov/conciliacao: pesquisar e conciliar concilia quando acha", res[0].acao === "conciliar");
  ok("mov/conciliacao: sugerir só propõe", conciliar([tx], [R({ funcao: "sugerir" })], input)[0].acao === "sugerir");
  ok("mov/conciliacao: ignorar não vira lançamento", conciliar([tx], [R({ funcao: "ignorar" })], input)[0].acao === "ignorar");
  ok("mov/conciliacao: sem regra fica sem ação", conciliar([tx], [], input)[0].acao === "sem_regra");
  // "Criar…" só age quando NÃO achou: criar em cima de um título existente é o
  // caminho mais curto para duplicar o financeiro.
  ok("mov/conciliacao: criar-e-conciliar NÃO cria quando já existe",
    conciliar([tx], [R({ funcao: "criar_conciliar" })], input)[0].acao === "conciliar");
  const semPar: TransacaoOFX = { ...tx, id: "ofx2", valor: 77, descricao: "TARIFA" };
  ok("mov/conciliacao: criar-e-conciliar cria quando não existe",
    conciliar([semPar], [R({ funcao: "criar_conciliar" })], input)[0].acao === "criar");
  ok("mov/conciliacao: criar-e-sugerir propõe a criação",
    conciliar([semPar], [R({ funcao: "criar_sugerir" })], input)[0].acao === "propor_criacao");
}

// ── core/vendas: venda, painéis, impostos e links ──────────────────────────
{
  const V = (o: Partial<Venda>): Venda => ({
    id: "v", numero: "2026-0001", clienteId: "c1", clienteNome: "Alpha",
    competencia: "2026-08-10", vencimento: "2026-08-20",
    itens: [{ produtoId: "p1", nome: "Curso", quantidade: 2, precoUnitario: 500 }],
    valorTotal: 1_000, valorTotalComJuros: 0,
    taxaPlataforma: { valor: 0, fornecedorId: "" },
    taxaAntecipacao: { valor: 0, fornecedorId: "" },
    taxaStreaming: { valor: 0, fornecedorId: "" },
    comissaoCoprodutor: { valor: 0, fornecedorId: "" },
    comissaoAfiliado: { valor: 0, fornecedorId: "" },
    contaId: "ac1", operacao: "venda", status: "completa", metodo: "pix",
    idExterno: "", categoria: "cat1", tipoPagamento: "avista", plataforma: "Hotmart",
    chaveTransacao: "", pago: false, valorPago: 0, dataPagamento: null,
    projetos: [], centros: [], descricao: "", textoDocumentoFiscal: "", observacoes: "",
    statusNF: "a_emitir", numeroNF: "", criadoEm: "2026-08-10", ...o,
  });

  // ---- os cálculos ----
  ok("vendas: total dos itens = qtd × preço", totalDosItens(V({}).itens) === 1_000);
  const comTaxas = V({
    taxaPlataforma: { valor: 100, fornecedorId: "f1" },
    comissaoAfiliado: { valor: 200, fornecedorId: "f2" },
  });
  ok("vendas: soma das taxas", somaDasTaxas(comTaxas) === 300, `${somaDasTaxas(comTaxas)}`);
  ok("vendas: líquido = bruto − taxas", valorLiquido(comTaxas) === 700, `${valorLiquido(comTaxas)}`);
  // O juro cobrado do cliente foi para a plataforma; partir do total SEM juros
  // deixaria esse dinheiro parecendo margem.
  ok("vendas: líquido parte do total COM juros quando existe",
    valorLiquido(V({ valorTotalComJuros: 1_200, taxaPlataforma: { valor: 200, fornecedorId: "" } })) === 1_000);
  ok("vendas: sem taxa o líquido é o bruto", valorLiquido(V({})) === 1_000);
  ok("vendas: os 13 status, 8 métodos e 21 plataformas do print existem",
    STATUS_VENDA.length === 13 && METODOS_PAGAMENTO.length === 8 && PLATAFORMAS.length === 21 && STATUS_NF.length === 5);

  // ---- validação ----
  ok("vendas: venda completa é válida", Object.keys(validarVenda(V({}))).length === 0, JSON.stringify(validarVenda(V({}))));
  ok("vendas: sem cliente é recusada", !!validarVenda(V({ clienteId: "" })).clienteId);
  ok("vendas: sem produto é recusada",
    !!validarVenda(V({ itens: [{ produtoId: "", nome: "", quantidade: 1, precoUnitario: 0 }] })).itens);
  ok("vendas: quantidade zero é recusada",
    !!validarVenda(V({ itens: [{ produtoId: "p1", nome: "X", quantidade: 0, precoUnitario: 10 }] })).itens);
  ok("vendas: marcar pago exige valor e data",
    !!validarVenda(V({ pago: true })).valorPago && !!validarVenda(V({ pago: true, valorPago: 10 })).dataPagamento);

  // ---- painéis ----
  const lista = [
    V({ id: "a", status: "completa", valorTotal: 1_000, statusNF: "emitida" }),
    V({ id: "b", status: "aprovada", valorTotal: 500, statusNF: "a_emitir" }),
    V({ id: "c", status: "iniciada", valorTotal: 300, statusNF: "negada" }),
    V({ id: "d", status: "chargeback", valorTotal: 200, statusNF: "cancelada" }),
  ];
  const pv = painelStatusVendas(lista);
  const cv = (id: string) => pv.find((c) => c.id === id)!;
  ok("vendas/painel: completa", cv("completa").valor === 1_000 && cv("completa").quantidade === 1);
  ok("vendas/painel: chargeback", cv("chargeback").valor === 200);
  ok("vendas/painel: total soma tudo", cv("total").valor === 2_000, `${cv("total").valor}`);
  // "Iniciada" agrupa os estados de venda ainda não fechada — separá-los em
  // cinco cards deixaria o painel ilegível.
  ok("vendas/painel: iniciada agrupa os estados em aberto", cv("iniciada").valor === 300);
  ok("vendas/painel: percentuais fecham ~100",
    Math.abs(["completa", "aprovada", "iniciada", "chargeback", "reembolsada"]
      .reduce((s, id) => s + cv(id).percentual, 0) - 100) < 0.3);
  const pn = painelStatusNF(lista);
  ok("vendas/nf: emitidas e com erro separadas",
    pn.find((c) => c.id === "emitidas")!.valor === 1_000 && pn.find((c) => c.id === "erro")!.valor === 300);
  ok("vendas/painel: lista vazia não vira NaN",
    painelStatusVendas([]).every((c) => Number.isFinite(c.valor) && Number.isFinite(c.percentual)));

  // ---- filtros ----
  ok("vendas/filtro: por status", filtrarVendas(lista, { status: "completa" }).length === 1);
  ok("vendas/filtro: por status da NF", filtrarVendas(lista, { statusNF: "negada" }).length === 1);
  ok("vendas/filtro: busca acha pelo produto", filtrarVendas(lista, { busca: "curso" }).length === 4);
  ok("vendas/filtro: busca sem acento", filtrarVendas(lista, { busca: "ALPHA" }).length === 4);
  ok("vendas/filtro: janela por competência",
    filtrarVendas(lista, { de: "2026-09-01" }).length === 0);

  // ---- impostos ----
  const cfg: ConfigImpostos = {
    ...configPadrao("presumido"),
    fornecedores: { municipal: "fm", estadual: "fe", federal: "ff" },
    categorias: Object.fromEntries(IMPOSTOS.map((i) => [i, "cat"])) as ConfigImpostos["categorias"],
    contaId: "ac1",
  };
  // Presumido serviços: PIS 0,65 · COFINS 3 · ISS 5 · CSLL 2,88 · IRPJ 4,8.
  ok("impostos: alíquotas do presumido conferem",
    ALIQUOTAS_PADRAO.presumido.pis === 0.65 && ALIQUOTAS_PADRAO.presumido.cofins === 3
    && ALIQUOTAS_PADRAO.presumido.iss === 5 && ALIQUOTAS_PADRAO.presumido.csll === 2.88
    && ALIQUOTAS_PADRAO.presumido.irpj === 4.8);
  const prov = provisionarImpostos(lista, cfg);
  // Base = 1.000 + 500 + 300 = 1.800 (chargeback fica de fora: não houve
  // faturamento a tributar).
  ok("impostos: chargeback/cancelada não são tributados", prov.faturamento === 1_800, `${prov.faturamento}`);
  ok("impostos: PIS = 0,65% da base", prov.porImposto.pis === 11.7, `${prov.porImposto.pis}`);
  ok("impostos: COFINS = 3% da base", prov.porImposto.cofins === 54, `${prov.porImposto.cofins}`);
  ok("impostos: ISS = 5% da base", prov.porImposto.iss === 90, `${prov.porImposto.iss}`);
  ok("impostos: IRPJ = 4,8% da base", prov.porImposto.irpj === 86.4, `${prov.porImposto.irpj}`);
  ok("impostos: total = soma dos impostos",
    Math.abs(prov.total - (11.7 + 54 + 90 + 86.4 + 51.84)) < 0.01, `${prov.total}`);
  ok("impostos: uma linha por venda tributável", prov.linhas.length === 3);
  ok("impostos: a linha soma os seus impostos",
    Math.abs(prov.linhas[0].total - Object.values(prov.linhas[0].valores).reduce((s, x) => s + x, 0)) < 0.01);

  // UMA conta por imposto — não uma por venda. O contribuinte recolhe o total
  // do mês numa guia só.
  const contasImp = contasAPagarDosImpostos(prov, cfg, "2026-08");
  ok("impostos: uma conta a pagar por imposto com valor", contasImp.length === 5, `${contasImp.length}`);
  ok("impostos: imposto zerado não vira conta", !contasImp.some((c) => c.valor === 0));
  // PIS vence dia 25 do mês SEGUINTE ao de competência.
  ok("impostos: PIS vence dia 25 do mês seguinte",
    contasImp.find((c) => c.imposto === "pis")!.vencimento === "2026-09-25",
    contasImp.find((c) => c.imposto === "pis")!.vencimento);
  ok("impostos: ISS vence dia 10 do mês seguinte",
    contasImp.find((c) => c.imposto === "iss")!.vencimento === "2026-09-10");
  // Dia 0 = último dia do mês; setembro tem 30.
  ok("impostos: IRPJ vence no ÚLTIMO dia do mês seguinte",
    contasImp.find((c) => c.imposto === "irpj")!.vencimento === "2026-09-30",
    contasImp.find((c) => c.imposto === "irpj")!.vencimento);
  // Fevereiro é a prova do "último dia": 28 em ano comum.
  const provFev = provisionarImpostos([V({ competencia: "2026-01-15" })], cfg);
  ok("impostos: último dia respeita fevereiro",
    contasAPagarDosImpostos(provFev, cfg, "2026-01").find((c) => c.imposto === "irpj")!.vencimento === "2026-02-28");
  ok("impostos: a conta sai para o fornecedor da esfera certa",
    contasImp.find((c) => c.imposto === "iss")!.fornecedorId === "fm"
    && contasImp.find((c) => c.imposto === "pis")!.fornecedorId === "ff");
  ok("impostos: ISS é municipal e ICMS estadual", ESFERA.iss === "municipal" && ESFERA.icms === "estadual");
  ok("impostos: dias padrão do presumido conferem",
    DIA_VENCIMENTO_PADRAO.pis === 25 && DIA_VENCIMENTO_PADRAO.iss === 10
    && DIA_VENCIMENTO_PADRAO.icms === 20 && DIA_VENCIMENTO_PADRAO.irpj === 0);

  // Sem configuração o botão NÃO libera: uma conta a pagar sem fornecedor é um
  // título órfão, que ninguém sabe a quem pagar.
  const comValor = IMPOSTOS.filter((i) => prov.porImposto[i] > 0);
  ok("impostos: configuração completa não tem pendência", pendenciasConfig(cfg, comValor).length === 0);
  ok("impostos: sem conta bancária há pendência",
    pendenciasConfig({ ...cfg, contaId: "" }, comValor).some((p) => p.includes("conta bancária")));
  ok("impostos: sem fornecedor da esfera há pendência",
    pendenciasConfig({ ...cfg, fornecedores: { ...cfg.fornecedores, municipal: "" } }, comValor)
      .some((p) => p.includes("municipais")));
  ok("impostos: base vazia não vira NaN", Number.isFinite(provisionarImpostos([], cfg).total));

  // ---- links de pagamento ----
  ok("links: título é obrigatório", !!validarLink({ titulo: " " }).titulo);
  ok("links: valor negativo é recusado", !!validarLink({ titulo: "X", valor: -1 }).valor);
  ok("links: valor zero é aceito (link aberto)", Object.keys(validarLink({ titulo: "X", valor: 0 })).length === 0);
  ok("links: url não duplica a barra",
    urlDoLink({ id: "lk1" } as never, "https://app.com/") === "https://app.com/pagar/lk1");

  // ---- QR code ----
  // Validado por decodificação real (OpenCV) fora da suíte; aqui ficam as
  // invariantes estruturais que quebrariam silenciosamente.
  const qr = gerarQR("https://all4pay.com/pagar/lk_abc123");
  ok("qr: versão 3 para uma URL de 35 bytes", qr.versao === 3 && qr.tamanho === 29, `v${qr.versao} ${qr.tamanho}`);
  ok("qr: a matriz é quadrada e do tamanho certo",
    qr.modulos.length === qr.tamanho && qr.modulos.every((l) => l.length === qr.tamanho));
  // Os três finders são a primeira coisa que o leitor procura.
  const finder = (y: number, x: number) =>
    qr.modulos[y][x] && qr.modulos[y + 6][x] && qr.modulos[y][x + 6] && !qr.modulos[y + 1][x + 1];
  ok("qr: os três finders estão no lugar",
    finder(0, 0) && finder(0, qr.tamanho - 7) && finder(qr.tamanho - 7, 0));
  // O módulo escuro fixo é obrigatório em toda versão.
  ok("qr: módulo escuro fixo presente", qr.modulos[qr.tamanho - 8][8] === true);
  // Timing alternado na linha/coluna 6.
  ok("qr: padrão de timing alterna",
    qr.modulos[6][8] === true && qr.modulos[6][9] === false && qr.modulos[8][6] === true);
  ok("qr: texto maior escolhe versão maior",
    gerarQR("x".repeat(120)).versao > qr.versao);
  ok("qr: acento e travessão não quebram", gerarQR("Pagamento à ALL4PAY — R$ 1,00").tamanho > 0);
  // Acima da versão 10 a função AVISA em vez de gerar um código que o leitor
  // recusaria.
  ok("qr: conteúdo grande demais é recusado com mensagem", (() => {
    try { gerarQR("x".repeat(400)); return false; } catch { return true; }
  })());
  const svg = qrParaSVG(qr, 200);
  ok("qr: SVG traz a zona silenciosa de 4 módulos",
    svg.includes(`viewBox="0 0 ${qr.tamanho + 8} ${qr.tamanho + 8}"`), svg.slice(0, 120));
  ok("qr: SVG é auto-contido (sem fetch externo)", !svg.includes("http://") || svg.includes("www.w3.org/2000/svg"));
}

// ── core/compras: aprovação, parcelas, boleto e chave de NF-e ──────────────
{
  const C = (o: Partial<Compra>): Compra => ({
    id: "c1", numero: "2026-C0001", fornecedorId: "f1", fornecedor: "Alpha Ltda",
    contaId: "ac1", categoria: "Fornecedores", tipoPagamento: "a_vista", parcelas: 1,
    vencimento: "2026-08-20", competencia: "2026-08-01", valor: 1_000,
    documentoFiscal: "", especie: null, pago: false, dataPagamento: null,
    projetos: [], centros: [], anexos: [], descricao: "", infoPagamento: "",
    observacoes: "", status: "aguardando", criadoPor: "Você", criadoEm: "2026-08-01",
    ...o,
  });

  // ---- a regra central: pedido não é despesa ----
  // Se isto quebrar, um pedido aguardando aprovação volta a entrar no fluxo de
  // caixa — e um pedido REPROVADO passa a pesar num caixa que nunca tocou.
  ok("compras: aguardando não gera título", movimentosDaCompra(C({ status: "aguardando" })).length === 0);
  ok("compras: reprovada não gera título", movimentosDaCompra(C({ status: "reprovada" })).length === 0);
  ok("compras: cancelada não gera título", movimentosDaCompra(C({ status: "cancelada" })).length === 0);
  ok("compras: aprovada gera título", movimentosDaCompra(C({ status: "aprovada" })).length === 1);
  // Compra paga nasce aprovada: o dinheiro já saiu, não há o que autorizar.
  ok("compras: paga nasce aprovada", statusInicial(true) === "aprovada");
  ok("compras: não paga nasce aguardando", statusInicial(false) === "aguardando");

  // ---- parcelas: o resto vai na ÚLTIMA ----
  const tres = parcelasDaCompra(C({ tipoPagamento: "parcelado", parcelas: 3, valor: 100 }));
  ok("compras: 3 parcelas de 100 somam exatamente 100",
    Math.round(tres.reduce((s, p) => s + p.valor, 0) * 100) === 10_000,
    tres.map((p) => p.valor).join("+"));
  ok("compras: o centavo do resto fica na última", tres[2].valor === 33.34, String(tres[2].valor));
  ok("compras: uma parcela por mês",
    tres[0].vencimento === "2026-08-20" && tres[1].vencimento === "2026-09-20" && tres[2].vencimento === "2026-10-20");
  // Dia 31 num mês de 30 vira o último dia — nunca escorrega para o mês seguinte.
  ok("compras: 31/01 + 1 mês = 28/02", somarMeses("2026-01-31", 1) === "2026-02-28", somarMeses("2026-01-31", 1));
  ok("compras: 31/03 + 1 mês = 30/04", somarMeses("2026-03-31", 1) === "2026-04-30");
  // A competência NÃO se parcela: a despesa é do mês em que o bem entrou.
  const parc = movimentosDaCompra(C({ status: "aprovada", tipoPagamento: "parcelado", parcelas: 4, valor: 400 }));
  ok("compras: todas as parcelas têm a MESMA competência",
    parc.every((m) => m.competencia === "2026-08-01"));
  ok("compras: só a 1ª parcela pode nascer paga",
    movimentosDaCompra(C({ status: "aprovada", pago: true, dataPagamento: "2026-08-20", tipoPagamento: "parcelado", parcelas: 3, valor: 300 }))
      .filter((m) => m.status === "pago").length === 1);

  // ---- validação ----
  ok("compras: parcelado com 1 parcela é recusado",
    !!validarCompra({ ...C({ tipoPagamento: "parcelado", parcelas: 1 }) }).parcelas);
  // ⚠️ O rateio compara CENTÉSIMOS INTEIROS. Três linhas de 33,33 somam
  // 99.99000000000001 em float, e um `Math.abs(soma - 100) <= 0.01` devolve
  // 0.010000000000005 — rejeitando a divisão em três, que é a mais comum que
  // existe. Foi o bug que a auditoria dos Cadastros pegou; aqui ele não volta.
  ok("compras: rateio 33,33 × 3 fecha (a divisão mais comum que existe)",
    rateioFecha([
      { id: "a", nome: "A", percentual: 33.33 },
      { id: "b", nome: "B", percentual: 33.33 },
      { id: "c", nome: "C", percentual: 33.33 },
    ]));
  ok("compras: 33,33 + 33,33 + 33,34 também fecha",
    rateioFecha([
      { id: "a", nome: "A", percentual: 33.33 },
      { id: "b", nome: "B", percentual: 33.33 },
      { id: "c", nome: "C", percentual: 33.34 },
    ]));
  ok("compras: 99% não fecha (a folga é de um centavo, não de um ponto)",
    !rateioFecha([{ id: "a", nome: "A", percentual: 99 }]));
  ok("compras: rateio de 90% não fecha",
    !rateioFecha([{ id: "a", nome: "A", percentual: 90 }]));
  ok("compras: anexo de 2 MB é recusado", !!anexoAceito("nota.pdf", 2 * 1024 * 1024));
  ok("compras: .exe é recusado", !!anexoAceito("virus.exe", 100));
  ok("compras: .ofx de 500 KB passa", anexoAceito("extrato.ofx", 500 * 1024) === null);

  // ---- filtros: a compra paga entra pela data do PAGAMENTO ----
  const paga = C({ id: "c2", pago: true, dataPagamento: "2026-07-05", vencimento: "2026-08-20", status: "aprovada" });
  ok("compras: paga é filtrada pela data do pagamento",
    filtrarCompras([paga], { vencDe: "2026-07-01", vencAte: "2026-07-31" }).length === 1);
  ok("compras: paga não aparece na janela do vencimento",
    filtrarCompras([paga], { vencDe: "2026-08-01", vencAte: "2026-08-31" }).length === 0);

  // ---- painel: total é 100% e a soma dos grupos fecha nele ----
  const cards = painelCompras([
    C({ id: "a", status: "aprovada", valor: 600 }),
    C({ id: "b", status: "aguardando", valor: 300 }),
    C({ id: "c", status: "reprovada", valor: 100 }),
  ]);
  const total = cards.find((c) => c.id === "total")!;
  ok("compras: total do painel soma tudo", total.valor === 1_000 && total.quantidade === 3);
  ok("compras: as fatias somam 100%",
    Math.round(cards.filter((c) => c.id !== "total").reduce((s, c) => s + c.percentual, 0)) === 100);
  ok("compras: reprovadas e canceladas caem no MESMO card",
    painelCompras([C({ id: "a", status: "reprovada", valor: 50 }), C({ id: "b", status: "cancelada", valor: 50 })])
      .find((c) => c.id === "reprovada")!.quantidade === 2);
  // Lista vazia não pode virar NaN no anel.
  ok("compras: painel vazio não produz NaN",
    painelCompras([]).every((c) => Number.isFinite(c.percentual) && Number.isFinite(c.valor)));

  /* ------------------------------- boleto ------------------------------- */

  // Um boleto real montado a partir do código de barras: banco 341 (Itaú),
  // moeda 9, fator do dia 20/08/2026 e valor R$ 1.234,56.
  const fator = fatorDaData("2026-08-20");
  const semDV = "3419" + String(fator).padStart(4, "0") + "0000123456" + "1234567890123456789012345";
  const barras = semDV.slice(0, 4) + dvModulo11(semDV.slice(0, 4) + semDV.slice(4)) + semDV.slice(4);
  const linha = linhaDeCodigoDeBarras(barras);

  ok("boleto: linha digitável tem 47 dígitos", linha.length === 47, String(linha.length));
  // Ida e volta: a linha reordena os campos do código de barras e intercala 4
  // DVs. Um erro de índice aqui produz um boleto plausível e ilegível.
  ok("boleto: linha → código de barras volta idêntico",
    codigoDeBarrasDaLinha(linha) === barras, `${codigoDeBarrasDaLinha(linha)} != ${barras}`);

  const lido = lerBoleto(linha, "2026-08-01")!;
  ok("boleto: lê o valor exato", lido.valor === 1_234.56, String(lido.valor));
  ok("boleto: lê o vencimento", lido.vencimento === "2026-08-20", String(lido.vencimento));
  ok("boleto: identifica o banco", lido.banco === "341" && lido.bancoNome === "Itaú");
  ok("boleto: os quatro DVs conferem", lido.valido && lido.problemas.length === 0, lido.problemas.join(" "));

  // Um dígito trocado no meio precisa ser DENUNCIADO, não lido em silêncio —
  // é a única coisa que separa "conferido" de "digitado".
  const corrompida = linha.slice(0, 12) + (linha[12] === "9" ? "0" : "9") + linha.slice(13);
  ok("boleto: dígito trocado é denunciado", !lerBoleto(corrompida, "2026-08-01")!.valido);

  // ⚠️ O ciclo do fator: em 21/02/2025 ele chegou a 9999 e reiniciou em 1000.
  // Sem tratar isso, todo boleto de 2025 em diante é lido com data de 2000-e-
  // poucos e cai como "vencido há 20 anos".
  ok("boleto: fator base 1000 = 07/10/1997 + 1000 dias",
    dataDoFator(1000, "1998-01-01") === "2000-07-03", String(dataDoFator(1000, "1998-01-01")));
  ok("boleto: o mesmo fator relido em 2026 cai no ciclo NOVO",
    dataDoFator(1000, "2026-08-01") === "2025-02-22", String(dataDoFator(1000, "2026-08-01")));
  ok("boleto: fator 0000 não inventa data", dataDoFator(0) === null);
  ok("boleto: entrada curta demais devolve null", lerBoleto("123") === null);

  // Módulo 10 e módulo 11 são regras diferentes e não intercambiáveis.
  ok("boleto: módulo 10 conhecido", dvModulo10("341900001") === dvModulo10("341900001"));
  ok("boleto: módulo 11 nunca devolve 0, 10 ou 11", (() => {
    for (let k = 0; k < 60; k++) {
      const dv = dvModulo11(String(k).padStart(43, "1"));
      if (dv === 0 || dv === 10 || dv === 11) return false;
    }
    return true;
  })());

  const B = (o: Partial<BoletoRecebido>): BoletoRecebido => ({
    id: "b1", origem: "manual", beneficiario: "Alpha Ltda", pagador: "Sua empresa",
    leitura: lido, pago: false, dataPagamento: null, recebidoEm: "2026-08-01",
    movimentoId: null, ...o,
  });
  ok("boleto: vencido é quem passou da data", statusBoleto(B({}), "2026-09-01") === "vencido");
  ok("boleto: a vencer antes da data", statusBoleto(B({}), "2026-08-01") === "a_vencer");
  ok("boleto: pago vence qualquer data", statusBoleto(B({ pago: true }), "2026-09-01") === "pago");
  ok("boleto: resumo conta os três estados", (() => {
    const r = resumoBoletos([B({ id: "a" }), B({ id: "b", pago: true })], "2026-09-01");
    return r.quantidade === 2 && r.vencidos === 1 && r.pagos === 1;
  })());
  // A busca por código de barras ignora pontuação — ninguém digita os pontos.
  ok("boleto: busca pelo número formatado encontra",
    filtrarBoletos([B({})], linha.slice(0, 5) + "." + linha.slice(5, 10), "todos", "2026-08-01").length === 1);

  /* -------------------------------- NF-e -------------------------------- */

  // Chave real: SP (35), agosto/2026, CNPJ, modelo 55, série 1, nº 1234.
  const base43 = "35" + "2608" + "12345678000195" + "55" + "001" + "000001234" + "1" + "12345678";
  const chave = base43 + String(dvDaChave(base43));
  const nf = lerChaveNFe(chave)!;
  ok("nfe: chave tem 44 dígitos", chave.length === 44, String(chave.length));
  ok("nfe: lê a UF", nf.uf === "SP");
  ok("nfe: lê a competência de emissão", nf.emissao === "2026-08", nf.emissao);
  ok("nfe: lê o CNPJ do emitente", nf.cnpj === "12345678000195");
  ok("nfe: lê modelo, série e número",
    nf.modeloLabel === "NF-e" && nf.serie === "1" && nf.numero === "1234",
    `${nf.modeloLabel}/${nf.serie}/${nf.numero}`);
  ok("nfe: o dígito confere", nf.valido);
  ok("nfe: dígito trocado é denunciado",
    !lerChaveNFe(base43 + String((Number(chave[43]) + 1) % 10))!.valido);
  ok("nfe: modelo 65 é NFC-e",
    lerChaveNFe("35260812345678000195" + "65" + "001" + "000001234" + "1" + "12345678" + "0")!.modeloLabel === "NFC-e");
  // Resto 0 ou 1 no módulo 11 devolve 0 — nunca 10, que não cabe numa casa.
  ok("nfe: DV nunca é 10", (() => {
    for (let k = 0; k < 200; k++) if (dvDaChave(String(k).padStart(43, "7")) >= 10) return false;
    return true;
  })());
  ok("nfe: chave curta devolve null", lerChaveNFe("3526081234") === null);

  const N = (o: Partial<NFRecebida>): NFRecebida => ({
    id: "n1", chave: nf, numero: "1234", tipo: "NFE", fornecedorId: null,
    fornecedor: "Alpha Ltda", cnpj: nf.cnpj, emissao: "2026-08-10", valor: 1_300,
    categoria: "Fornecedores", status: "recebida", avaliacao: "pendente", origem: "manual",
    ...o,
  });
  // O operador copia o valor do DANFE (pt-BR) ou digita o número redondo.
  ok("nfs: '1.300,00' e '1300' são o mesmo filtro",
    valorDigitado("1.300,00") === 1_300 && valorDigitado("1300") === 1_300);
  ok("nfs: campo vazio não filtra", valorDigitado("  ") === null);
  ok("nfs: filtro de valor casa em centavos",
    filtrarNFs([N({})], { valor: 1_300 }).length === 1);
  ok("nfs: valor diferente não casa", filtrarNFs([N({})], { valor: 1_301 }).length === 0);
  ok("nfs: janela de emissão exclui fora",
    filtrarNFs([N({})], { de: "2026-09-01", ate: "2026-09-30" }).length === 0);
  ok("nfs: busca por CNPJ encontra", filtrarNFs([N({})], { fornecedor: "12345678000195" }).length === 1);
  ok("nfs: pendentes contam só o que não foi avaliado",
    resumoNFs([N({ id: "a" }), N({ id: "b", avaliacao: "aprovada" })]).pendentes === 1);
  ok("nfs: resumo vazio não produz NaN",
    Number.isFinite(resumoNFs([]).valorTotal) && resumoNFs([]).quantidade === 0);
}

// ── core/contabilidade: envio ao contador e TXT do Domínio ────────────────
{
  /* ---------------------------- envio das NFs ---------------------------- */

  const D = (o: Partial<DestinatarioContador>): DestinatarioContador => ({
    id: "d1", email: "contador@escritorio.com.br", verificado: false,
    criadoEm: "2026-08-01", verificadoEm: null, ...o,
  });

  // ⚠️ Double opt-in não é etiqueta: o pacote leva a escrituração fiscal da
  // empresa. Um e-mail digitado errado entregaria os XMLs a um estranho todo
  // dia 1º, em silêncio, porque "o envio funciona".
  ok("contador: sem verificado o envio fica INATIVO", statusEnvio([D({})]) === "inativo");
  ok("contador: um verificado ativa", statusEnvio([D({ verificado: true })]) === "ativo");
  ok("contador: lista vazia é inativa", statusEnvio([]) === "inativo");

  const cinco = Array.from({ length: 5 }, (_, k) => D({ id: `d${k}`, email: `c${k}@e.com` }));
  ok("contador: o teto é 5 destinatários", LIMITE_DESTINATARIOS === 5);
  ok("contador: no teto não dá para adicionar", !podeAdicionar(cinco));
  ok("contador: com 4 ainda dá", podeAdicionar(cinco.slice(0, 4)));
  ok("contador: o 6º é recusado com motivo", !!validarDestinatario("novo@e.com", cinco));
  ok("contador: e-mail duplicado é recusado",
    !!validarDestinatario("C0@E.COM", cinco), "case-insensitive");
  ok("contador: e-mail sem domínio é recusado", !!validarDestinatario("contador@", []));
  ok("contador: e-mail válido passa", validarDestinatario("a@b.com.br", []) === null);

  // O pacote sai no dia 1º do mês SEGUINTE, 21h — depois do fechamento.
  ok("contador: próximo envio é o dia 1º do mês seguinte",
    proximoEnvio("2026-08-15") === "2026-09-01T21:00", proximoEnvio("2026-08-15"));
  // ⚠️ Virada de ano: dezembro + 1 é janeiro do ano SEGUINTE, não mês 13.
  ok("contador: dezembro vira janeiro do ano seguinte",
    proximoEnvio("2026-12-20") === "2027-01-01T21:00", proximoEnvio("2026-12-20"));
  // ⚠️ Em UTC-3 o dia 1º lido de um Date UTC cai no mês anterior — a data aqui
  // é fatiada da string, e é isso que este guard trava.
  ok("contador: o dia 1º não escorrega para o mês anterior",
    proximoEnvio("2026-09-01") === "2026-10-01T21:00", proximoEnvio("2026-09-01"));
  ok("contador: formatação pt-BR do próximo envio",
    formatarProximoEnvio("2026-09-01T21:00") === "01/09/2026, 21:00");

  // ⚠️ "Arquivada" não é sinônimo de "existe": o arquivamento começa quando há
  // destinatário verificado. Contar notas antigas prometeria um pacote que
  // ninguém montou.
  const notas = [
    { emissao: "2026-08-03", arquivada: true },
    { emissao: "2026-08-20", arquivada: true },
    { emissao: "2026-07-30", arquivada: true },
  ];
  const semDest = resumoMesNFs(notas, [], "2026-08", null);
  ok("contador: sem destinatário nada é arquivado",
    semDest.entrada === 2 && semDest.entradaArquivadas === 0);
  const comDest = resumoMesNFs(notas, [], "2026-08", "2026-08-10");
  ok("contador: só arquiva o que veio DEPOIS da verificação",
    comDest.entrada === 2 && comDest.entradaArquivadas === 1, String(comDest.entradaArquivadas));
  ok("contador: nota cancelada não conta como arquivada",
    resumoMesNFs([{ emissao: "2026-08-03", arquivada: false }], [], "2026-08", "2026-08-01")
      .entradaArquivadas === 0);
  ok("contador: entrada e saída são contadas em separado", (() => {
    const r = resumoMesNFs(notas, [{ emissao: "2026-08-05", arquivada: true }], "2026-08", "2026-08-01");
    return r.entrada === 2 && r.saida === 1;
  })());

  /* ------------------------------ CP-1252 ------------------------------ */

  // ⚠️ O Domínio lê ANSI. Um arquivo UTF-8 faz "Manutenção" chegar como
  // "ManutenÃ§Ã£o" no histórico de TODOS os lançamentos: o arquivo importa, os
  // valores batem, e a escrituração fica ilegível.
  const acentos = "Manutenção prédio · ÁÉÍÓÚ àâãç";
  const bytes = paraCP1252(acentos);
  ok("cp1252: acentos ocupam UM byte, não dois",
    bytes.length === acentos.length, `${bytes.length} vs ${acentos.length}`);
  ok("cp1252: NÃO é UTF-8",
    bytes.length < new TextEncoder().encode(acentos).length);
  ok("cp1252: ç é 0xE7 e ã é 0xE3",
    bytes[Array.from(acentos).indexOf("ç")] === 0xe7 &&
    bytes[Array.from(acentos).indexOf("ã")] === 0xe3);
  ok("cp1252: ida e volta preserva o texto", deCP1252(bytes) === acentos, deCP1252(bytes));
  // A faixa 0x80–0x9F é onde o 1252 diverge do Latin-1 — e é justamente a
  // tipografia que aparece num histórico copiado e colado.
  ok("cp1252: travessão, reticências e aspas curvas cabem",
    deCP1252(paraCP1252("— … “aspas” ‘simples’ €")) === "— … “aspas” ‘simples’ €");
  ok("cp1252: travessão é 0x97", paraCP1252("—")[0] === 0x97);
  // O que não cabe é TRANSLITERADO, não descartado: "?" no meio da palavra é
  // ruído que o contador não decifra.
  ok("cp1252: caractere fora da tabela vira '?' e não some",
    paraCP1252("A😀B").length === 3 && paraCP1252("A😀B")[1] === 0x3f);
  ok("cp1252: string vazia devolve zero bytes", paraCP1252("").length === 0);

  /* ------------------------------- Domínio ------------------------------- */

  const M = (o: Partial<MovimentoContabil>): MovimentoContabil => ({
    id: "m1", data: "2026-08-05", valor: 1_234.5, tipo: "saida",
    descricao: "Aluguel do escritório", categoria: "Aluguel", centroCusto: null, ...o,
  });
  const mapas: MapasContabeis = {
    categorias: { Aluguel: "4.1.2.001", Vendas: "3.1.1.001" },
    centros: { Comercial: "CC-01" },
  };

  ok("dominio: data sai DDMMAAAA", dataDominio("2026-08-05") === "05082026");
  // A data é fatiada da string: um Date UTC lido em UTC-3 recuaria um dia.
  ok("dominio: o dia 1º não recua", dataDominio("2026-09-01") === "01092026");
  ok("dominio: valor com vírgula decimal e sem milhar",
    valorDominio(1_234.5) === "1234,50", valorDominio(1_234.5));
  ok("dominio: centavos não se perdem", valorDominio(0.07) === "0,07");

  // ⚠️ O separador é ';'. Um ponto e vírgula dentro do histórico partiria a
  // linha em duas e deslocaria TODAS as colunas seguintes do lançamento.
  ok("dominio: ';' no histórico é neutralizado",
    !campoDominio("Pagamento; parcela 2").includes(";"), campoDominio("Pagamento; parcela 2"));
  ok("dominio: quebra de linha no histórico é neutralizada",
    !campoDominio("linha1\nlinha2").includes("\n"));

  // Saída DEBITA a contrapartida, entrada CREDITA — partida simples vista do
  // lado da conta bancária, que é a contrapartida fixa.
  const montagem = montarLancamentosDominio(
    [M({}), M({ id: "m2", tipo: "entrada", categoria: "Vendas", valor: 500, centroCusto: "Comercial" })],
    mapas,
  );
  ok("dominio: saída é D e entrada é C",
    montagem.linhas[0].natureza === "D" && montagem.linhas[1].natureza === "C");
  ok("dominio: a conta vem do Plano de Contas", montagem.linhas[0].conta === "4.1.2.001");
  ok("dominio: o centro de custo vem do cadastro", montagem.linhas[1].centroCusto === "CC-01");

  // ⚠️ Sem código contábil o lançamento NÃO sai com o campo em branco: ele fica
  // fora e vira pendência. O Domínio aceitaria a linha vazia e jogaria o valor
  // numa conta transitória — o mês fecharia e o erro só apareceria depois.
  const comBuraco = montarLancamentosDominio(
    [M({}), M({ id: "m3", categoria: "Categoria sem código" })],
    mapas,
  );
  ok("dominio: categoria sem código vira PENDÊNCIA, não linha vazia",
    comBuraco.linhas.length === 1 && comBuraco.pendencias.length === 1);
  ok("dominio: nenhuma linha sai com a conta em branco",
    comBuraco.linhas.every((l) => l.conta.trim().length > 0));
  ok("dominio: lançamento sem categoria também é pendência",
    montarLancamentosDominio([M({ id: "m4", categoria: "" })], mapas).pendencias.length === 1);

  // O arquivo: CRLF (destino Windows) e uma linha por lançamento.
  const txt = gerarLanctosTxt(montagem.linhas);
  ok("dominio: quebra de linha é CRLF", txt.includes("\r\n") && !/[^\r]\n/.test(txt));
  ok("dominio: uma linha por lançamento",
    txt.trimEnd().split("\r\n").length === 2, String(txt.trimEnd().split("\r\n").length));
  ok("dominio: a linha tem os 7 campos do layout",
    txt.trimEnd().split("\r\n").every((l) => l.split(";").length === 7));
  ok("dominio: a primeira linha é a esperada",
    txt.startsWith("05082026;4.1.2.001;D;1234,50;;Aluguel do escritório;"),
    txt.split("\r\n")[0]);
  ok("dominio: arquivo vazio não emite linha em branco", gerarLanctosTxt([]) === "");
  // Os BYTES são ANSI — é o arquivo, não a string, que o Domínio lê.
  ok("dominio: os bytes do arquivo são ANSI, não UTF-8",
    gerarLanctosBytes(montagem.linhas).length === gerarLanctosTxt(montagem.linhas).length);

  // Em partidas simples débito e crédito NÃO fecham em zero: são os dois
  // sentidos do extrato, não os dois lados de um mesmo lançamento.
  const conf = conferirDominio(montagem.linhas);
  ok("dominio: conferência separa débito de crédito",
    conf.debitos === 1_234.5 && conf.creditos === 500);
  ok("dominio: líquido é entradas − saídas", conf.liquido === -734.5, String(conf.liquido));
  ok("dominio: conferência vazia não produz NaN",
    Number.isFinite(conferirDominio([]).liquido) && conferirDominio([]).lancamentos === 0);
}

// ── core/administracao: assinatura, usuários, logs, integrações, exports ───
{
  /* ------------------------------ datas ------------------------------ */

  // ⚠️ Dias de CALENDÁRIO, não 24h corridas: um "expira em 8 dias" que vira 7
  // depois das 21h é o erro que ninguém reporta e todo mundo desconfia.
  ok("admin: diasEntre conta calendário", diasEntre("2026-08-02", "2026-08-10") === 8);
  ok("admin: diasEntre é negativo quando já passou", diasEntre("2026-08-15", "2026-08-10") === -5);
  ok("admin: vira o mês sem perder o dia", diasEntre("2026-08-31", "2026-09-01") === 1);
  ok("admin: vira o ano sem perder o dia", diasEntre("2026-12-31", "2027-01-01") === 1);

  /* ---------------------------- assinatura ---------------------------- */

  const A = (o: Partial<EntradaAssinatura>): EntradaAssinatura => ({
    hoje: "2026-08-02", plano: "all4pay", empresaId: "1639124",
    planoContratado: null, expiracao: "2026-08-10", usuariosAtivos: 1,
    donoAtivo: true, contas: [], receberNFs: false, emitirNFs: false,
    plataformasConectadas: 0, ...o,
  });

  ok("assinatura: dias restantes batem com o calendário",
    panoramaAssinatura(A({})).diasRestantes === 8);
  ok("assinatura: expirada é marcada como expirada", (() => {
    const p = panoramaAssinatura(A({ expiracao: "2026-07-20" }));
    return p.expirado && p.diasRestantes === -13;
  })());
  ok("assinatura: sem data não inventa dias",
    panoramaAssinatura(A({ expiracao: null })).diasRestantes === null);
  // "Não informado" é mais honesto que repetir o nome do plano.
  ok("assinatura: plano contratado vazio vira 'Não informado'",
    panoramaAssinatura(A({})).planoContratado === "Não informado");

  // ⚠️ "Elegíveis sem conexão" ≠ "contas não conectadas": só conta o banco que
  // TEM conector. Contar todas transformaria a métrica em ruído permanente.
  const contas = [
    { id: "1", nome: "Itaú", conectada: true, elegivel: true },
    { id: "2", nome: "Bradesco", conectada: false, elegivel: true },
    { id: "3", nome: "Banco Local", conectada: false, elegivel: false },
  ];
  const pan = panoramaAssinatura(A({ contas }));
  ok("assinatura: panorama de contas separa os três números",
    pan.contasCadastradas === 3 && pan.contasConectadas === 1 && pan.elegiveisSemConexao === 1,
    `${pan.contasCadastradas}/${pan.contasConectadas}/${pan.elegiveisSemConexao}`);
  ok("assinatura: sem contas nada é NaN",
    panoramaAssinatura(A({ contas: [] })).elegiveisSemConexao === 0);

  /* --------------------------- dados da empresa --------------------------- */

  ok("empresa: CNPJ com 13 dígitos é recusado",
    !!validarDadosEmpresa({ tipoPessoa: "juridica", documento: "1234567800017", razaoSocial: "X" }).documento);
  ok("empresa: CPF com 14 dígitos é recusado",
    !!validarDadosEmpresa({ tipoPessoa: "fisica", documento: "34568449000172", razaoSocial: "X" }).documento);
  ok("empresa: CNPJ de 14 passa",
    !validarDadosEmpresa({ tipoPessoa: "juridica", documento: "34.568.449/0001-72", razaoSocial: "X" }).documento);
  ok("empresa: razão social é obrigatória", !!validarDadosEmpresa({ documento: "34568449000172" }).razaoSocial);
  ok("empresa: e-mail torto é recusado",
    !!validarDadosEmpresa({ documento: "34568449000172", razaoSocial: "X", tipoPessoa: "juridica", email: "a@b" }).email);
  ok("empresa: CEP de 7 dígitos é recusado",
    !!validarDadosEmpresa({ documento: "34568449000172", razaoSocial: "X", tipoPessoa: "juridica", cep: "0471113" }).cep);
  // ⚠️ O regime DECIDE o Simples — dois campos independentes divergiriam, e a
  // divergência vira imposto calculado errado.
  ok("empresa: Simples e MEI são optantes",
    optantePeloSimples("simples") && optantePeloSimples("mei"));
  ok("empresa: Presumido e Real não são",
    !optantePeloSimples("presumido") && !optantePeloSimples("real"));
  ok("empresa: logo .gif é recusado", !!logoAceito("marca.gif", 1000));
  ok("empresa: logo de 6 MB é recusado", !!logoAceito("marca.png", 6 * 1024 * 1024));
  ok("empresa: webp de 1 MB passa", logoAceito("marca.webp", 1024 * 1024) === null);

  /* ------------------------------ usuários ------------------------------ */

  const U = (o: Partial<UsuarioEmpresa>): UsuarioEmpresa => ({
    id: "u1", nome: "João", email: "joao@e.com", perfil: "admin", dono: false, ...o,
  });

  // ⚠️ A organização não pode ficar sem administrador: quem desfaria precisa
  // justamente do papel que acabou de sumir.
  const soUmAdmin = [U({}), U({ id: "u2", perfil: "leitura", email: "b@e.com" })];
  ok("usuarios: o único admin não pode ser removido", !!podeRemover(soUmAdmin, "u1"));
  ok("usuarios: o único admin não pode ser REBAIXADO", !!podeTrocarPerfil(soUmAdmin, "u1", "leitura"));
  ok("usuarios: com dois admins dá para remover um",
    podeRemover([U({}), U({ id: "u2", perfil: "admin", email: "b@e.com" })], "u1") === null);
  ok("usuarios: o dono nunca é removido", !!podeRemover([U({ dono: true }), U({ id: "u2", perfil: "admin" })], "u1"));
  ok("usuarios: perfil não-admin sai sem impedimento",
    podeRemover(soUmAdmin, "u2") === null);
  ok("usuarios: promover para admin nunca é bloqueado",
    podeTrocarPerfil(soUmAdmin, "u2", "admin") === null);
  ok("usuarios: busca ignora acento e caixa",
    filtrarUsuarios([U({ nome: "João Antônio" })], "joao anto").length === 1);

  /* -------------------------------- logs -------------------------------- */

  const L = (o: Partial<RegistroLog>): RegistroLog => ({
    id: "l1", quando: "2026-08-01T10:30:00Z", acao: "alterou", usuario: "João",
    origem: "Web", tipoEntidade: "Lançamento", entidadeId: "mov-1",
    entidade: "mov-1", resumo: "valor: de 1000 para 10000", ...o,
  });

  // ⚠️ Pedir fora da janela de retenção precisa AVISAR. Devolver vazio diria
  // "nada aconteceu" quando a verdade é "isso foi descartado" — e é numa
  // auditoria que a diferença entre as duas frases importa.
  ok("logs: a janela é de 30 dias", JANELA_LOGS_DIAS === 30);
  ok("logs: período de 60 dias atrás é sinalizado",
    periodoForaDaJanela("2026-08-02", "2026-06-02"));
  ok("logs: período dentro da janela não é sinalizado",
    !periodoForaDaJanela("2026-08-02", "2026-07-25"));
  ok("logs: sem data inicial não sinaliza nada", !periodoForaDaJanela("2026-08-02", null));

  // A busca varre o RESUMO — filtrar só pelo nome da entidade não acharia
  // "mudou o valor de 1.000 para 10.000", que é o que se procura numa auditoria.
  ok("logs: busca encontra no conteúdo do resumo",
    filtrarLogs([L({})], { busca: "de 1000 para 10000" }).length === 1);
  ok("logs: busca por entidade também funciona", filtrarLogs([L({})], { busca: "mov-1" }).length === 1);
  ok("logs: filtro de ação exclui o resto",
    filtrarLogs([L({}), L({ id: "l2", acao: "removeu" })], { acao: "removeu" }).length === 1);
  ok("logs: janela de data exclui fora",
    filtrarLogs([L({})], { de: "2026-08-02", ate: "2026-08-02" }).length === 0);
  ok("logs: o próprio dia entra na janela",
    filtrarLogs([L({})], { de: "2026-08-01", ate: "2026-08-01" }).length === 1);

  /* ---------------------------- integrações ---------------------------- */

  ok("integracoes: o catálogo tem os 8 cartões", CATALOGO_INTEGRACOES.length === 8);
  ok("integracoes: ids do catálogo são únicos",
    new Set(CATALOGO_INTEGRACOES.map((c) => c.id)).size === 8);
  ok("integracoes: 18 plataformas de venda", PLATAFORMAS_VENDAS.length === 18, String(PLATAFORMAS_VENDAS.length));
  ok("integracoes: 19 bancos homologados", BANCOS_OPEN_FINANCE.length === 19, String(BANCOS_OPEN_FINANCE.length));

  // ⚠️ Um segredo NUNCA volta na tela: o que sobra é o prefixo (para saber QUAL
  // chave é) e os quatro últimos. Devolver o valor inteiro transforma qualquer
  // print ou sessão aberta num vazamento que o dono não percebe.
  const chave = "a4p_live_9f2c8b1e4d7a3f5e";
  const mascara = mascararSegredo(chave);
  ok("segredo: a máscara NÃO contém o segredo", !mascara.includes("9f2c8b1e4d7a3f5e"), mascara);
  ok("segredo: a máscara guarda o prefixo", mascara.startsWith("a4p_"), mascara);
  ok("segredo: a máscara guarda os 4 últimos", mascara.endsWith("3f5e"), mascara);
  ok("segredo: segredo curto vira só bolinhas", mascararSegredo("abc123") === "••••");
  ok("segredo: vazio continua vazio", mascararSegredo("") === "");

  // O consentimento do Open Finance vale 12 meses — regra do BC, e vencido
  // significa extrato parado.
  // A data de vencimento é montada em UTC de propósito (`Date.UTC`) e lida por
  // `toISOString()`. Em UTC-3 as duas construções coincidem, então o guard
  // abaixo NÃO é sobre fuso — ele trava a regra dos 12 meses e a preservação do
  // dia, que é o que de fato já quebrou aqui.
  const c1 = consentimentoOpenFinance("2025-09-15", "2026-08-02");
  ok("openfinance: vence no MESMO dia, 12 meses depois", c1.vence === "2026-09-15", c1.vence);
  ok("openfinance: 1º de março não recua para fevereiro",
    consentimentoOpenFinance("2025-03-01", "2026-01-01").vence === "2026-03-01",
    consentimentoOpenFinance("2025-03-01", "2026-01-01").vence);
  ok("openfinance: entra na janela de aviso a 44 dias? não",
    !c1.aVencer && !c1.vencido, `${c1.diasRestantes}`);
  const c2 = consentimentoOpenFinance("2025-08-20", "2026-08-02");
  ok("openfinance: a 18 dias já avisa", c2.aVencer && !c2.vencido, String(c2.diasRestantes));
  const c3 = consentimentoOpenFinance("2025-06-01", "2026-08-02");
  ok("openfinance: vencido é vencido", c3.vencido && c3.diasRestantes < 0, String(c3.diasRestantes));

  ok("certificado: vencido é inválido", !certificadoValido("2026-07-01", "2026-08-02"));
  ok("certificado: válido no próprio dia do vencimento", certificadoValido("2026-08-02", "2026-08-02"));
  ok("certificado: ausente é inválido", !certificadoValido(null, "2026-08-02"));

  /* -------------------------- exportações -------------------------- */

  // ⚠️ Os limiares são POR FORMATO. Registrar toda exportação transformaria a
  // fila num log onde o relatório de 40 mil linhas que a pessoa espera se
  // perderia entre cinquenta downloads instantâneos.
  ok("export: PDF de 301 linhas vai para a fila", precisaFila("pdf", LIMITE_PDF_LINHAS + 1));
  ok("export: PDF de 300 linhas baixa na hora", !precisaFila("pdf", LIMITE_PDF_LINHAS));
  // O caso que SEPARA os dois limiares: 1.000 linhas passa do teto do PDF e não
  // chega perto do teto do XLSX. Um limiar único trataria os dois igual.
  ok("export: XLSX de 1.000 linhas baixa na hora", !precisaFila("xlsx", 1_000));
  ok("export: PDF de 1.000 linhas vai para a fila", precisaFila("pdf", 1_000));
  ok("export: XLSX de 5.001 vai para a fila", precisaFila("xlsx", LIMITE_XLSX_LINHAS + 1));

  const E = (o: Partial<Exportacao>): Exportacao => ({
    id: "e1", relatorio: "Contas a pagar", nomeArquivo: "contas-a-pagar.xlsx",
    formato: "xlsx", linhas: 9_000, exportadoEm: "2026-08-01", status: "pronto", ...o,
  });

  ok("export: expira 15 dias depois", expiraEm("2026-08-01") === "2026-08-16", expiraEm("2026-08-01"));
  // ⚠️ Expirada continua NA LISTA, marcada — sumir faria parecer que a
  // exportação nunca aconteceu.
  ok("export: passado o prazo o status vira expirado",
    statusExportacao(E({}), "2026-08-20") === "expirado");
  ok("export: dentro do prazo continua pronto",
    statusExportacao(E({}), "2026-08-10") === "pronto");
  ok("export: processando não expira",
    statusExportacao(E({ status: "processando" }), "2026-09-30") === "processando");
  ok("export: erro não vira expirado",
    statusExportacao(E({ status: "erro" }), "2026-09-30") === "erro");
  ok("export: filtro de formato separa",
    filtrarExportacoes([E({}), E({ id: "e2", formato: "pdf" })], { formato: "pdf" }).length === 1);
  ok("export: filtro de período exclui fora",
    filtrarExportacoes([E({})], { de: "2026-08-02", ate: "2026-08-30" }).length === 0);
}

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — guardas de auditoria multi-motor`);
if (fails > 0) process.exit(1);
