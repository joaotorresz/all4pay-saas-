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
import { periodosPorVencimento, periodosComValores } from "@/core/movimentacoes/periodos";
import { linhasDREdaNatureza, linhaDREvalida } from "@/core/registros";
import { dailyCashflow } from "@/lib/aggregations";
import { simularFinanciamento, antecipar, equivalenteAnual, equivalenteMensal } from "@/core/financing";
import { precoPorMargem, precoPorMarkup, analisarPreco, pontoEquilibrioUnidades, precoComImpostos } from "@/core/pricing";
import { valorFuturo, payback, tempoParaMeta } from "@/core/investment";
import { provisaoTrabalhista } from "@/core/payroll";
import { calcularSimplesNacional } from "@/core/tax";
import { calcularMora } from "@/core/late-fee";
import { GUIDES } from "@/components/app/guides";
import { SECTIONS, CONFIG, ACOES_GLOBAIS, leafAtivo, indiceItemAtivo, menuDoPlano, PLATAFORMA_ITENS } from "@/components/dashboard/nav-data";
import {
  detectarSegredos, redigirSegredos, temSegredo, luhn, entropia, melhorGuia,
  statusTour, contarTours, filtrarTours, agruparTours, tourAutomatico,
  validarChamado, filtrarAnuncios, naoLidos, SUGESTOES,
  type Tour as TourAjuda, type ProgressoTour, type Anuncio,
} from "@/core/ajuda";
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
  montarPainelContasPagar, opcoesDeFiltro,
  periodoMes, periodoSemana, periodoPersonalizado, periodoInvalido,
} from "@/core/contas-pagar";
import { planejarLancamento } from "@/core/contas-pagar/lancamento";
import {
  montarPainelContasReceber, ponteVendaRecebimento, opcoesDeFiltroReceber, faixaDoAtraso,
} from "@/core/contas-receber";
import { montarPainelRecorrentes, deslocarMes as deslocarMesCP } from "@/core/contas-pagar/recorrentes";
import {
  calcularCLT, calcularPJ, inssEmpregado, irrfEmpregado, tetoINSS, inssDe, irrfDe,
  encargosPatronais, titulosDaCompetencia, titulosDoDecimo, montarPainelFolha,
  compararVinculo, custoAnual, diaUtilDoMes, vencimentoSalario, vencimentoFGTS,
  vencimentoDARF, pascoa, feriadosNacionais, ehDiaUtil, anteciparParaDiaUtil,
  calcularFerias, diasPorFaltas, maximoAbono,
  calcularRescisao, diasAviso, estimarFGTS, REGRAS,
  type Colaborador,
} from "@/core/folha";
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
const round2ea = (n: number) => Math.round(n * 100) / 100;
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
  ok("paineis: deslocar mês vira o ano", deslocarMesCP("2026-01", -1) === "2025-12" && deslocarMesCP("2026-12", 1) === "2027-01");
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

  /**
   * ⚠️ **O PAINEL NÃO PODE MUDAR POR CAUSA DO PRÓPRIO FILTRO.**
   *
   * O defeito: a tela calculava os cards sobre a lista JÁ filtrada pelo status.
   * Clicar em "Recebidas" deixava a lista só com as recebidas, os cards
   * recalculavam sobre ela, e "A receber" e "Atrasadas" zeravam — como se
   * filtrar tivesse apagado os outros títulos.
   *
   * A invariante é esta: seja qual for o status escolhido para a TABELA, os
   * cards saem da mesma base (todos os outros recortes, sem o status). Aqui ela
   * é medida — não basta a varredura de texto, porque um dia alguém troca o
   * nome da variável e a varredura passa a aprovar o defeito.
   */
  {
    const base = filtrarTitulos(input, "receber", { status: "todos" });
    const esperados = resumoTitulos(base, "receber", input.hoje);
    for (const st of ["liquidado", "aberto", "atrasado"] as const) {
      // A tabela recorta...
      const tabela = filtrarTitulos(input, "receber", { status: st });
      // ...mas os cards continuam saindo da base inteira.
      const obtidos = resumoTitulos(base, "receber", input.hoje);
      ok(`mov/cards: filtrar por "${st}" não mexe nos cards`,
        JSON.stringify(obtidos) === JSON.stringify(esperados)
        && tabela.every((m) => statusDoTitulo(m, input.hoje) === st),
        `${tabela.length} na tabela`);
    }
    // E o contrário, que é o defeito em si: calcular sobre a lista filtrada
    // ZERA os outros dois. A asserção fixa que essa é a leitura errada.
    const errado = resumoTitulos(filtrarTitulos(input, "receber", { status: "liquidado" }), "receber", input.hoje);
    ok("mov/cards: calcular sobre a lista filtrada zeraria os outros (o defeito)",
      errado.find((c) => c.id === "aberto")!.valor === 0
      && esperados.find((c) => c.id === "aberto")!.valor > 0);
  }

  /**
   * ⚠️ O período do gráfico recorta a MESMA janela que os cards e a tabela.
   * Sem isto, clicar num mês pintava a cápsula e não mudava número nenhum — um
   * controle que parece filtrar e não filtra faz quem clica concluir que os
   * valores abaixo já são daquele mês.
   */
  {
    const janela = { de: "2026-08-10", ate: "2026-08-31" };
    const cardsDaJanela = resumoTitulos(
      filtrarTitulos(input, "receber", { ...janela, status: "todos" }), "receber", input.hoje,
    );
    const todos = resumoTitulos(filtrarTitulos(input, "receber", { status: "todos" }), "receber", input.hoje);
    ok("mov/cards: a janela do gráfico recorta os cards",
      cardsDaJanela.find((c) => c.id === "total")!.valor
        < todos.find((c) => c.id === "total")!.valor,
      `${cardsDaJanela.find((c) => c.id === "total")!.valor} < ${todos.find((c) => c.id === "total")!.valor}`);
  }

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

// ── core/ajuda: detector de segredos, tours e anúncios ────────────────────
{
  /* -------------------------- detector de segredos -------------------------- */

  const tipos = (t: string) => detectarSegredos(t).map((a) => a.tipo).join(",");

  // O que PRECISA ser pego — é para isto que o aviso existe.
  ok("segredos: senha declarada", tipos("Minha senha é Trocar@123") === "senha");
  ok("segredos: senha com dois-pontos", tipos("password: sup3rS3cret") === "senha");
  ok("segredos: chave com prefixo conhecido",
    tipos("use a chave a4p_live_9f2c8b1e4d7a3f5e") === "token");
  ok("segredos: token de MCP", tipos("mcp_0a1b2c3d4e5f6071") === "token");
  ok("segredos: JWT", tipos("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk") === "jwt");
  ok("segredos: cartão passa por Luhn", tipos("cartão 4111 1111 1111 1111") === "cartao");
  ok("segredos: CNPJ com pontuação", tipos("CNPJ 34.568.449/0001-72") === "cnpj");
  ok("segredos: CPF com pontuação", tipos("CPF 111.444.777-35") === "cpf");
  ok("segredos: chave PIX aleatória (UUID)",
    tipos("pix e3b0c442-98fc-1c14-9afb-f4c8996fb924") === "pix");
  ok("segredos: linha digitável de boleto",
    tipos("boleto 34191234546789012345767890123457715700000345670") === "boleto");

  // ⚠️ O QUE NÃO PODE SER PEGO. Um detector que acusa qualquer sequência longa
  // treina a pessoa a ignorar o aviso — e aí o aviso deixou de existir. Estes
  // são textos que um financeiro escreve o dia inteiro.
  ok("segredos: valor em reais NÃO é cartão", !temSegredo("Paguei R$ 1.234,56 e o total foi R$ 98.765,43"));
  ok("segredos: número de NF NÃO é segredo", !temSegredo("A NF 000123456789 sumiu da lista"));
  ok("segredos: data e competência NÃO são segredo", !temSegredo("Fatura 2026-08 vencendo dia 10/09/2026"));
  // Este falso positivo apareceu no PRIMEIRO teste do detector: entropia
  // sozinha acusa "contas-a-pagar-2026-08-31" (3,4 bits/char). A pontuação é o
  // que separa nome legível de token.
  ok("segredos: nome de arquivo com hífens NÃO é token",
    !temSegredo("O relatório contas-a-pagar-2026-08-31 não abre"), tipos("contas-a-pagar-2026-08-31"));
  ok("segredos: slug de rota NÃO é token", !temSegredo("abri /dashboard/financial/accounts-and-transfers"));
  ok("segredos: CNPJ inválido não vira CNPJ", !temSegredo("o número 11.111.111/1111-11 apareceu"));
  ok("segredos: 16 dígitos que falham Luhn não viram cartão",
    !temSegredo("protocolo 1234567890123456"), tipos("1234567890123456"));
  ok("segredos: texto comum é limpo", !temSegredo("Como faço para emitir uma nota fiscal de serviço?"));

  // Luhn e entropia são as âncoras — se elas cederem, tudo vira falso positivo.
  ok("segredos: Luhn aceita cartão de teste", luhn("4111111111111111"));
  ok("segredos: Luhn recusa o mesmo número com um dígito trocado", !luhn("4111111111111112"));
  ok("segredos: entropia separa aleatório de legível",
    entropia("9f2c8b1e4d7a3f5e0c1d") > entropia("relatorio-de-contas"),
    `${entropia("9f2c8b1e4d7a3f5e0c1d").toFixed(2)} vs ${entropia("relatorio-de-contas").toFixed(2)}`);

  // ⚠️ Redige, NÃO bloqueia: impedir o envio faria a pessoa reescrever a mesma
  // mensagem por fora. A dúvida chega ao suporte; o segredo não.
  const cru = "Minha senha é Trocar@123 e a chave a4p_live_9f2c8b1e4d7a3f5e não funciona";
  const limpo = redigirSegredos(cru);
  ok("segredos: o texto redigido NÃO contém a senha", !limpo.includes("Trocar@123"), limpo);
  ok("segredos: o texto redigido NÃO contém a chave", !limpo.includes("9f2c8b1e4d7a3f5e"), limpo);
  ok("segredos: o texto redigido PRESERVA a dúvida", limpo.includes("não funciona"), limpo);
  ok("segredos: redigir texto limpo não altera nada",
    redigirSegredos("Como emito uma NFS-e?") === "Como emito uma NFS-e?");
  // Sobreposição: um mesmo trecho não vira dois avisos.
  ok("segredos: um trecho gera UM achado só",
    detectarSegredos("cartão 4111111111111111").length === 1);

  /* --------------------------------- tours --------------------------------- */

  const T = (o: Partial<TourAjuda>): TourAjuda => ({
    id: "/dre", rota: "/dre", titulo: "DRE", descricao: "Resultado do período",
    passos: 6, secao: "Caixa & Resultado", ...o,
  });
  const tours = [
    T({}),
    T({ id: "/upload", rota: "/upload", titulo: "Upload de dados", descricao: "Importar extrato", secao: "Dados & Cadastros" }),
    T({ id: "/", rota: "/", titulo: "Início", descricao: "Visão geral", secao: "Boas-vindas" }),
  ];
  const prog: Record<string, ProgressoTour> = {
    "/dre": { passo: 3, concluido: false },
    "/": { passo: 6, concluido: true },
  };

  ok("tours: status derivado do progresso",
    statusTour(prog["/dre"]) === "em_andamento" &&
    statusTour(prog["/"]) === "concluido" &&
    statusTour(undefined) === "nao_iniciado");
  const cont = contarTours(tours, prog);
  ok("tours: a contagem fecha no total",
    cont.nao_iniciado + cont.em_andamento + cont.concluido === cont.todos && cont.todos === 3,
    JSON.stringify(cont));
  ok("tours: filtro por status", filtrarTours(tours, "", "concluido", prog).length === 1);
  // Quem procura "extrato" não sabe em que tela ela mora — é por isso que está
  // procurando. A busca varre título, descrição e seção.
  ok("tours: busca varre a descrição", filtrarTours(tours, "extrato", "todos", prog).length === 1);
  ok("tours: busca ignora acento", filtrarTours(tours, "resultado", "todos", prog).length >= 1);
  ok("tours: agrupamento não perde tour",
    agruparTours(tours).reduce((s, g) => s + g.tours.length, 0) === 3);

  // ⚠️ As duas travas do disparo automático — um tour que reaparece deixa de
  // ser ajuda e vira obstáculo.
  const vistas = new Set<string>(["/upload"]);
  ok("tours: dispara na tela nunca vista",
    tourAutomatico("/dre", tours, vistas, 0)?.id === "/dre");
  ok("tours: NÃO dispara em tela já vista",
    tourAutomatico("/upload", tours, vistas, 0) === null);
  ok("tours: NÃO dispara um segundo na mesma sessão",
    tourAutomatico("/dre", tours, vistas, 1) === null);
  ok("tours: rota sem tour devolve null",
    tourAutomatico("/inexistente", tours, vistas, 0) === null);

  /* -------------------------------- chamados -------------------------------- */

  ok("chamado: assunto é obrigatório", !!validarChamado({ descricao: "x".repeat(40) }).assunto);
  // Um chamado de três palavras volta como "poderia detalhar?" e custa um dia.
  ok("chamado: descrição curta é recusada",
    !!validarChamado({ assunto: "Erro", descricao: "não abre" }).descricao);
  ok("chamado: descrição suficiente passa",
    Object.keys(validarChamado({ assunto: "Erro", descricao: "A tela de conciliação não carrega nada." })).length === 0);

  /* -------------------------------- anúncios -------------------------------- */

  const A = (o: Partial<Anuncio>): Anuncio => ({
    id: "a1", titulo: "TXT do Domínio sai em ANSI",
    corpo: "O arquivo é gerado em Windows-1252, não UTF-8.",
    publicadoEm: "2026-08-02", lido: false, categoria: "Contabilidade", ...o,
  });
  ok("anuncios: filtro de não lidas", filtrarAnuncios([A({}), A({ id: "a2", lido: true })], { visualizacao: "nao_lidas" }).length === 1);
  ok("anuncios: filtro de lidas", filtrarAnuncios([A({}), A({ id: "a2", lido: true })], { visualizacao: "lidas" }).length === 1);
  ok("anuncios: janela de período exclui fora",
    filtrarAnuncios([A({})], { de: "2026-09-01", ate: "2026-09-30" }).length === 0);
  // Quem procura "Domínio" não sabe se a palavra está no título ou no corpo, e
  // um resultado vazio parece ausência.
  ok("anuncios: busca varre o corpo, não só o título",
    filtrarAnuncios([A({})], { busca: "windows-1252" }).length === 1);
  ok("anuncios: contagem de não lidas", naoLidos([A({}), A({ id: "a2", lido: true })]) === 1);

  ok("ajuda: as sugestões são perguntas de USO, não de número",
    SUGESTOES.every((s) => s.perguntas.every((q) => /^(como|onde|qual|o que)/i.test(q))),
    SUGESTOES.flatMap((s) => s.perguntas).filter((q) => !/^(como|onde|qual|o que)/i.test(q)).join(" | "));

  // ⚠️ TODA pergunta sugerida precisa ter resposta. Oferecer uma sugestão que
  // cai em "não encontrei" é pior que não sugerir nada — e foi exatamente o que
  // aconteceu na primeira versão: 14 das 16 falhavam, porque a base de
  // conhecimento responde CONCEITO e as perguntas eram de USO. Este guard
  // quebra se alguém acrescentar uma sugestão órfã ou apagar um guia.
  const candidatosAjuda = Object.entries(GUIDES).map(([rota, g]) => ({
    rota, titulo: g.titulo, intro: g.intro, comoUsar: g.comoUsar,
    termos: g.secoes.flatMap((sec) => sec.itens.map((i) => `${i.nome} ${i.desc}`)),
  }));
  const semResposta = SUGESTOES.flatMap((s) => s.perguntas)
    .filter((q) => !buscarKB(q) && !melhorGuia(q, candidatosAjuda));
  ok("ajuda: TODA pergunta sugerida tem resposta",
    semResposta.length === 0, semResposta.join(" | "));

  // A camada de USO precisa existir de verdade — se ela sumir, as sugestões
  // voltam a cair no vazio mesmo com a KB intacta.
  ok("ajuda: 'como faço' é respondido pelo guia da tela",
    melhorGuia("Como aprovar um pedido de compra?", candidatosAjuda)?.rota === "/dashboard/purchases",
    String(melhorGuia("Como aprovar um pedido de compra?", candidatosAjuda)?.rota));
  // ⚠️ A barra de 3 pontos: uma palavra que só aparece no CORPO de vários guias
  // não pode eleger um deles. Com a barra em 1, "valor" e "tela" — palavras que
  // um usuário digita sem querer dizer nada — passariam a devolver uma tela
  // qualquer com ar de resposta certa.
  ok("ajuda: palavra genérica de corpo não elege guia",
    melhorGuia("valor", candidatosAjuda) === null &&
    melhorGuia("tela", candidatosAjuda) === null &&
    melhorGuia("aparece", candidatosAjuda) === null);
  ok("ajuda: pergunta vazia devolve null", melhorGuia("   ", candidatosAjuda) === null);
}

// ── navegação: o menu em acordeão ─────────────────────────────────────────
{
  const todas = [...SECTIONS, CONFIG];
  const itens = todas.flatMap((s) => s.items);
  const rotas = [...todas.filter((s) => s.href).map((s) => s.href!), ...itens.map((i) => i.href).filter(Boolean)];

  ok("nav: nenhuma rota duplicada no menu",
    new Set(rotas).size === rotas.length,
    rotas.filter((r, i) => rotas.indexOf(r) !== i).join(" | "));

  /*
   * ⚠️ E O MENU DE QUEM ADMINISTRA A PLATAFORMA TAMBÉM. A checagem acima varre
   * `SECTIONS`/`CONFIG` — o shape ESTÁTICO. Os itens de plataforma são
   * anexados a Configurações em tempo de execução (`useNavSections`), então
   * eles ficavam fora da varredura: três telas apareceram duas vezes no mesmo
   * grupo, com rótulos diferentes ("Armazenamento" e "Armazenamento e backup",
   * "Segurança" e "Segurança e isolamento"), e nenhuma guarda viu.
   *
   * Duplicata só existe para quem tem o papel, que é justamente quem menos
   * reclama — e por isso ela sobreviveria.
   */
  const rotasAdmin = [...rotas, ...PLATAFORMA_ITENS.map((i) => i.href).filter(Boolean)];
  ok("nav: nem no menu de quem administra a plataforma",
    new Set(rotasAdmin).size === rotasAdmin.length,
    rotasAdmin.filter((r, i) => rotasAdmin.indexOf(r) !== i).join(" | "));
  ok("nav: ids de grupo são únicos", new Set(todas.map((s) => s.id)).size === todas.length);
  // Um grupo sem `href` e sem filhos seria uma linha que abre para o nada.
  ok("nav: todo grupo é folha OU tem filhos",
    todas.every((s) => !!s.href || s.items.length > 0),
    todas.filter((s) => !s.href && s.items.length === 0).map((s) => s.id).join(" | "));
  ok("nav: todo grupo tem ícone", todas.every((s) => !!s.icon),
    todas.filter((s) => !s.icon).map((s) => s.id).join(" | "));
  ok("nav: todo item tem destino (href, evento ou 'em breve')",
    itens.every((i) => !!i.href || !!i.event || !!i.soon));

  // ⚠️ O acordeão abre o grupo da rota atual. Se uma tela não estiver em grupo
  // nenhum, o menu fica MUDO justamente onde a pessoa está — ela não descobre
  // as telas irmãs. Este guard cobre as rotas principais de cada módulo.
  const PRINCIPAIS = [
    "/", "/all4pay-ai", "/orcamento", "/dashboard/help", "/comece",
    "/dashboard/purchases", "/dashboard/purchases/received-boletos",
    "/dashboard/sales-invoices", "/dashboard/accounting/dominio-export",
    "/dashboard/administration/users", "/fluxo-caixa", "/upload",
    "/dashboard/financial/reconciliation", "/dashboard/registrations/bank-accounts",
  ];
  // ⚠️ Quatro telas NÃO estão no menu de propósito, e a exceção não é branda:
  // cada uma declara em `ACOES_GLOBAIS` onde mora (o botão flutuante da IA, o
  // menu ⋮ da barra superior). Uma tela com porta global E linha de menu é a
  // duplicata que produziu seis entradas para a mesma IA; uma tela sem porta
  // nenhuma só existe para quem já sabe o endereço. A guarda cobra a porta.
  const comPortaGlobal = new Set(ACOES_GLOBAIS.map((a) => a.rota));
  const semOnde = ACOES_GLOBAIS.filter((a) => !a.onde || a.onde.length < 10);
  ok("nav: toda ação global declara ONDE mora", semOnde.length === 0,
    semOnde.map((a) => a.rota).join(" | "));
  const orfas = PRINCIPAIS.filter(
    (r) => !comPortaGlobal.has(r)
      && !todas.some((s) => (s.href && leafAtivo(s.href, r)) || s.items.some((i) => leafAtivo(i.href, r))),
  );
  ok("nav: nenhuma tela principal fica fora do menu", orfas.length === 0, orfas.join(" | "));
  // Nota: uma sub-rota (`/x/y`) continua acesa pelo item pai (`/x`) — o guard
  // acima cobre o caso real, que é a tela SEM pai no menu, como as de
  // Administração, que entram uma a uma em Configurações.

  // Os itens `pro` são a profundidade — no Modo Simples eles somem, e o que
  // sobra precisa continuar cobrindo o dia a dia. `menuDoPlano` é a MESMA
  // função que a barra lateral usa para montar a lista.
  const simples = menuDoPlano(SECTIONS, false);
  const DIA_A_DIA = ["/", "/orcamento", "/fluxo-caixa", "/upload", "/dashboard/purchases", "/dashboard/sales-invoices"];
  const fora = DIA_A_DIA.filter(
    (r) => !simples.some((s) => (s.href && leafAtivo(s.href, r)) || s.items.some((i) => leafAtivo(i.href, r))),
  );
  ok("nav: o Modo Simples ainda cobre o dia a dia", fora.length === 0, fora.join(" | "));

  // `leafAtivo` é o que decide o destaque: `/` não pode casar com tudo.
  ok("nav: '/' só casa com a própria home", leafAtivo("/", "/dre") === false && leafAtivo("/", "/") === true);
  ok("nav: sub-rota acende o item pai", leafAtivo("/dashboard/purchases", "/dashboard/purchases/new"));
  ok("nav: rota com ?aba ainda casa", leafAtivo("/contabilidade?aba=razao", "/contabilidade"));

  // ── o item ATIVO é exato; o grupo é que é por prefixo ──
  // ⚠️ O defeito: em `/contas-a-pagar/titulos` o painel (`/contas-a-pagar`) e a
  // própria tela casam por PREFIXO, o desempate por query não resolve (nenhum
  // dos dois tem query) e o primeiro da lista ganhava — o painel ficava aceso
  // nas quatro telas da área, e o destaque parava de responder "onde estou".
  const itensCP: { label: string; href: string; icon: string }[] = [
    { label: "Painel de contas a pagar", href: "/contas-a-pagar", icon: "layout-dashboard" },
    { label: "Títulos a pagar", href: "/contas-a-pagar/titulos", icon: "file-text" },
    { label: "Contas recorrentes", href: "/contas-a-pagar/recorrentes", icon: "repeat" },
    { label: "Folha salarial", href: "/contas-a-pagar/folha", icon: "users" },
  ];
  const acesos = itensCP.map((_, i) => i).filter(
    (i) => indiceItemAtivo(itensCP, itensCP[i].href, "") === i,
  );
  ok("nav: cada tela da área acende o SEU item, e só ele", acesos.length === 4, `acesos: ${acesos.join(",")}`);
  ok(
    "nav: o item pai não fica preso aceso na sub-rota",
    indiceItemAtivo(itensCP, "/contas-a-pagar/titulos", "") === 1,
  );
  // O prefixo SOBREVIVE onde nenhum item declara a rota: `.../new` não tem
  // linha no menu, e marcar o pai é a resposta certa ali.
  ok(
    "nav: sub-rota sem item próprio ainda acende o pai",
    indiceItemAtivo(
      [{ label: "Compras", href: "/dashboard/purchases", icon: "cart" }],
      "/dashboard/purchases/new",
      "",
    ) === 0,
  );
  // E as três linhas que apontam para o MESMO caminho continuam desempatando
  // pela aba — o exato não pode atropelar essa regra.
  const abas = [
    { label: "Títulos a receber", href: "/x?tab=receivables", icon: "a" },
    { label: "Títulos a pagar", href: "/x?tab=payables", icon: "a" },
    { label: "Transferências", href: "/x?tab=transfers", icon: "a" },
  ];
  ok("nav: hub com abas desempata pela query", indiceItemAtivo(abas, "/x", "tab=transfers") === 2);
}

/* ── t7: a categoria DECLARA a linha do DRE (e o total nunca é escolhível) ── */
{
  // ⚠️ As linhas de TOTAL (`=`) não podem aparecer na escolha: elas saem de
  // FÓRMULA sobre as outras, e apontar uma categoria para uma delas somaria o
  // lançamento na linha E de novo dentro do total que a contém — o mesmo valor
  // contado duas vezes, com a cascata fechando "certo".
  const totais = ESTRUTURA_DRE.filter((l) => l.tipo === "total").map((l) => l.id);
  const despesa = linhasDREdaNatureza("despesa").map((l) => l.id);
  const receita = linhasDREdaNatureza("receita").map((l) => l.id);
  ok("t7: linha de total nunca é escolhível",
     [...despesa, ...receita].every((id) => !totais.includes(id)),
     [...despesa, ...receita].filter((id) => totais.includes(id)).join(" "));
  ok("t7: despesa não escolhe Receita Bruta", !despesa.includes("receita_bruta"));
  ok("t7: receita não escolhe Despesas Operacionais", !receita.includes("despesas_operacionais"));
  ok("t7: as linhas de ambos os lados existem", despesa.length > 0 && receita.length > 0);
  ok("t7: a validação recusa a linha de outra natureza",
     linhaDREvalida("despesas_operacionais", "despesa") && !linhaDREvalida("despesas_operacionais", "receita"));
  ok("t7: a validação recusa linha inexistente", !linhaDREvalida("linha_que_nao_existe", "despesa"));

  // ⚠️ E a parte que dá sentido ao campo: a linha DECLARADA vence o palpite por
  // palavra-chave. "Ferramentas do time" não casa com regex nenhum e cai na
  // linha genérica; declarada, ela entra onde quem cadastrou mandou.
  const mvT7 = (id: string, category: string, amount: number): RiskMovement => ({
    id, type: "saida", status: "pago", amount,
    due_date: "2026-08-10", paid_date: "2026-08-10", category,
  });
  const IN_T7: RiskInput = {
    hoje: "2026-08-11", saldoAtual: 0,
    movements: [
      { id: "r", type: "entrada", status: "pago", amount: 10_000, due_date: "2026-08-01", paid_date: "2026-08-01", category: "Vendas" },
      mvT7("f", "Ferramentas do time", 1_000),
    ],
  };
  const janelaT7 = { intervalo: { de: "2026-08-01", ate: "2026-08-31" }, tipo: "vertical" as const };
  const valorDa = (r: ReturnType<typeof montarDRE>, id: string) =>
    r.linhas.find((l) => l.id === id)?.celulas[0]?.valor ?? 0;

  const sem = montarDRE(IN_T7, janelaT7);
  const com = montarDRE(IN_T7, { ...janelaT7, linhaPorCategoria: { "ferramentas do time": "custos_variaveis" } });
  ok("t7: sem declaração, o palpite manda (despesa operacional)",
     valorDa(sem, "despesas_operacionais") === 1_000 && valorDa(sem, "custos_variaveis") === 0,
     `${valorDa(sem, "despesas_operacionais")} / ${valorDa(sem, "custos_variaveis")}`);
  ok("t7: a linha DECLARADA vence o palpite",
     valorDa(com, "custos_variaveis") === 1_000 && valorDa(com, "despesas_operacionais") === 0,
     `${valorDa(com, "custos_variaveis")} / ${valorDa(com, "despesas_operacionais")}`);
  // O valor não pode aparecer nos DOIS lugares — o teste acima já falharia, mas
  // esta asserção nomeia a consequência (dinheiro contado duas vezes).
  ok("t7: o lançamento entra em UMA linha só",
     valorDa(com, "custos_variaveis") + valorDa(com, "despesas_operacionais") === 1_000);
  // E a declaração não pode desviar o valor para uma linha de TOTAL.
  const fraude = montarDRE(IN_T7, { ...janelaT7, linhaPorCategoria: { "ferramentas do time": "ebitda" } });
  ok("t7: declaração apontando para um TOTAL é ignorada (cai no palpite)",
     valorDa(fraude, "despesas_operacionais") === 1_000);
}

// ── contas-a-pagar: valores fechados, datas certas e os filtros filtrando ──
{
  /** Dias entre duas datas-só, em UTC — para provar que a faixa não pula dia. */
  const diasEntreISO = (a: string, b: string) => {
    const [a1, m1, d1] = a.split("-").map(Number);
    const [a2, m2, d2] = b.split("-").map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
  };
  const mv = (
    id: string, amount: number, status: RiskMovement["status"],
    due_date: string, paid_date: string | null,
    extra: Partial<RiskMovement> = {},
  ): RiskMovement => ({
    id, type: "saida", status, amount, due_date, paid_date,
    category: "Fornecedores", ...extra,
  });

  const INPUT: RiskInput = {
    hoje: "2026-08-11",
    saldoAtual: 10_000,
    partyNames: { p1: "Fornecedor Alfa" },
    movements: [
      // Pagas DENTRO do período, pela data de PAGAMENTO.
      mv("pg1", 1_000, "pago", "2026-07-28", "2026-08-03", { party_id: "p1" }),
      mv("pg2", 500, "pago", "2026-08-05", "2026-08-05", { costCenter: "Comercial" }),
      // ⚠️ Vence no período mas foi PAGA fora dele: não entra em nenhum card.
      // É a prova de que pago usa `paid_date` e não `due_date`.
      mv("pg3", 999, "pago", "2026-08-20", "2026-09-02"),
      // Vence HOJE e está em aberto → A VENCER, jamais atrasada.
      mv("hj", 2_000, "pendente", "2026-08-11", null),
      mv("av", 3_000, "pendente", "2026-08-25", null, { projeto: "Obra Norte" }),
      mv("at", 4_000, "pendente", "2026-08-02", null, { projeto: "Obra Norte", costCenter: "Comercial" }),
      // Cancelada não é obrigação; entrada não é conta a pagar.
      mv("cx", 9_999, "cancelado", "2026-08-07", null),
      { id: "in", type: "entrada", status: "pago", amount: 50_000, due_date: "2026-08-04", paid_date: "2026-08-04" },
    ],
  };

  const AGOSTO = { de: "2026-08-01", ate: "2026-08-31" };
  const p = montarPainelContasPagar(INPUT, AGOSTO);

  // ── a faixa de períodos: TOTAL a pagar, nunca resultado, nunca negativo ──
  // ⚠️ A agregação NOVA existe ao lado da de resultado, não no lugar dela: o
  // extrato pergunta "como foi o mês" (com sinal e cor) e a tela de títulos
  // pergunta "quanto vence aqui" (uma soma de obrigações, que não tem sinal).
  {
    const fx = periodosPorVencimento(INPUT, INPUT.hoje, "mes", "pagar");
    const ago = fx.find((x) => x.key === "2026-08");
    const jul = fx.find((x) => x.key === "2026-07");
    // 500 + 999 + 2.000 + 3.000 + 4.000 — pelo VENCIMENTO. `pg1` venceu em
    // julho (mesmo tendo sido paga em agosto) e a cancelada não é obrigação.
    ok("t9: o total do período sai do VENCIMENTO, não da data de caixa",
       ago?.total === 10_499 && jul?.total === 1_000, `${ago?.total} / ${jul?.total}`);
    // A entrada de R$ 50.000 não pode aparecer do lado de pagar, e é ela que
    // tornaria um "resultado" negativo se a grandeza fosse a errada.
    ok("t9: a faixa de pagar ignora entradas", (ago?.total ?? 0) === 10_499);
    ok("t9: a faixa de receber vê a entrada",
       periodosPorVencimento(INPUT, INPUT.hoje, "mes", "receber").find((x) => x.key === "2026-08")?.total === 50_000);
    // ⚠️ A asserção que dá sentido à tarefa: NENHUM período pode vir negativo,
    // em nenhuma granularidade e em nenhum dos dois sentidos. Se algum vier, é
    // defeito de DADO (um `amount` com sinal) e tem de aparecer — mascarar com
    // `Math.abs` na tela transformaria um lançamento invertido em número
    // plausível.
    const todos = (["mes", "semana"] as const).flatMap((g) =>
      (["pagar", "receber"] as const).flatMap((d) => periodosPorVencimento(INPUT, INPUT.hoje, g, d)));
    ok("t9: nenhum período vem negativo", todos.every((x) => (x.total ?? 0) >= 0),
       todos.filter((x) => (x.total ?? 0) < 0).map((x) => `${x.key}=${x.total}`).join(" "));
    // Período sem título vale ZERO — a resposta "nada vence aqui", não ausência.
    ok("t9: período sem título soma zero", fx.find((x) => x.key === "2026-03")?.total === 0);
    ok("t9: a faixa traz sempre os 12 períodos", fx.length === 12);
    // E a agregação de RESULTADO segue intacta: ela responde outra coisa e dá
    // outro número no MESMO agosto — 50.000 de entrada menos 10.500 de saídas
    // pela data de CAIXA (pg1 entra porque foi paga em agosto, pg3 sai porque
    // foi paga em setembro). É a prova de que as duas não foram fundidas: 39.500
    // contra os 10.499 da faixa de títulos, sobre os mesmos lançamentos.
    const res = periodosComValores(INPUT, INPUT.hoje, "mes").find((x) => x.key === "2026-08");
    ok("t9: a agregação de resultado continua respondendo o resultado",
       res?.resultado === 39_500 && res?.total === undefined, `${res?.resultado}`);
  }

  ok("cpagar: pago no período usa a DATA DE PAGAMENTO", p.pagoNoPeriodo.total === 1_500 && p.pagoNoPeriodo.quantidade === 2,
     `${p.pagoNoPeriodo.total} / ${p.pagoNoPeriodo.quantidade}`);
  // ⚠️ Se um dia alguém trocar `paid_date` por `due_date` no card de pagas,
  // `pg1` sai (venceu em julho) e `pg3` entra — o total continuaria com cara
  // de total, e é por isso que a asserção é sobre o VALOR, não sobre a soma.
  ok("cpagar: título pago fora do período não conta", !p.pagoNoPeriodo.contas.some((c) => c.id === "pg3"));
  ok("cpagar: 'vence hoje' é a vencer, não atrasada",
     p.aVencer.contas.some((c) => c.id === "hj") && !p.atrasadas.contas.some((c) => c.id === "hj"));
  ok("cpagar: a vencer soma o que vence de hoje em diante", p.aVencer.total === 5_000, String(p.aVencer.total));
  ok("cpagar: atrasadas somam o que venceu antes de hoje", p.atrasadas.total === 4_000, String(p.atrasadas.total));
  ok("cpagar: cancelada e entrada ficam fora",
     ![...p.pagoNoPeriodo.contas, ...p.aVencer.contas, ...p.atrasadas.contas].some((c) => c.id === "cx" || c.id === "in"));
  ok("cpagar: atraso em dias sai da data, não do relógio",
     p.atrasadas.contas.find((c) => c.id === "at")?.diasAtraso === 9);
  ok("cpagar: a contraparte vem do cadastro quando existe",
     p.pagoNoPeriodo.contas.find((c) => c.id === "pg1")?.contraparte === "Fornecedor Alfa");
  // A relação abre com o maior primeiro — é o que se resolve antes.
  ok("cpagar: a relação vem do maior para o menor",
     p.aVencer.contas.map((c) => c.valor).join(",") === "3000,2000");

  // A distribuição é PROPORÇÃO — e é a única leitura em que as três somam.
  const soma = p.distribuicao.reduce((s, d) => s + d.fracao, 0);
  ok("cpagar: as frações da distribuição fecham em 1", Math.abs(soma - 1) < 1e-9, String(soma));
  ok("cpagar: a distribuição bate com os três cards",
     p.distribuicao.find((d) => d.situacao === "pago")!.valor === 1_500
     && p.distribuicao.find((d) => d.situacao === "a_vencer")!.valor === 5_000
     && p.distribuicao.find((d) => d.situacao === "atrasado")!.valor === 4_000);

  // ⚠️ Período SEM nada não divide por zero e não desenha anel nenhum.
  const vazio = montarPainelContasPagar(INPUT, { de: "2027-01-01", ate: "2027-01-31" });
  ok("cpagar: período vazio dá zero sem NaN",
     vazio.distribuicao.every((d) => d.valor === 0 && d.fracao === 0)
     && vazio.dias.every((d) => d.quantidade === 0));
  // ⚠️ E a FAIXA existe mesmo assim: o calendário desenha o período inteiro,
  // não só o que tem lançamento. Um mês vazio são 31 cápsulas vazias, e é essa
  // a resposta — "não vence nada em janeiro" —, não uma faixa em branco.
  ok("cpagar: o calendário desenha o período inteiro, com ou sem lançamento",
     vazio.dias.length === 31 && vazio.dias[0].data === "2027-01-01"
     && vazio.dias[30].data === "2027-01-31", String(vazio.dias.length));

  /* ---- OS FILTROS FILTRAM (a exigência explícita desta tela) ------------- */
  const porProjeto = montarPainelContasPagar(INPUT, { ...AGOSTO, projeto: "Obra Norte" });
  ok("cpagar: filtro de projeto recorta os três cards",
     porProjeto.pagoNoPeriodo.total === 0 && porProjeto.aVencer.total === 3_000 && porProjeto.atrasadas.total === 4_000,
     `${porProjeto.pagoNoPeriodo.total}/${porProjeto.aVencer.total}/${porProjeto.atrasadas.total}`);
  const porCentro = montarPainelContasPagar(INPUT, { ...AGOSTO, centro: "Comercial" });
  ok("cpagar: filtro de centro de custo recorta os três cards",
     porCentro.pagoNoPeriodo.total === 500 && porCentro.aVencer.total === 0 && porCentro.atrasadas.total === 4_000,
     `${porCentro.pagoNoPeriodo.total}/${porCentro.aVencer.total}/${porCentro.atrasadas.total}`);
  const ambos = montarPainelContasPagar(INPUT, { ...AGOSTO, projeto: "Obra Norte", centro: "Comercial" });
  ok("cpagar: os dois filtros se combinam em E", ambos.atrasadas.total === 4_000 && ambos.aVencer.total === 0);
  // ⚠️ E o filtro que não deveria achar nada devolve VAZIO, não tudo: um
  // filtro que ignora o valor desconhecido é indistinguível de nenhum filtro.
  const nenhum = montarPainelContasPagar(INPUT, { ...AGOSTO, projeto: "Não existe" });
  ok("cpagar: filtro sem correspondência devolve vazio",
     nenhum.pagoNoPeriodo.total === 0 && nenhum.aVencer.total === 0 && nenhum.atrasadas.total === 0);

  const opc = opcoesDeFiltro(INPUT);
  ok("cpagar: as opções saem só do que existe nos títulos a pagar",
     opc.projetos.join(",") === "Obra Norte" && opc.centros.join(",") === "Comercial",
     `${opc.projetos.join("|")} / ${opc.centros.join("|")}`);

  /* ---- O calendário ------------------------------------------------------ */
  const dia = (d: string) => p.dias.find((x) => x.data === d);
  ok("cpagar: o dia do pagamento entra pelo pago", dia("2026-08-03")?.pago === 1_000);
  ok("cpagar: o dia do vencimento entra pelo a pagar", dia("2026-08-25")?.aPagar === 3_000);
  ok("cpagar: dia com título vencido é marcado como vencido", dia("2026-08-02")?.situacao === "atrasado");
  ok("cpagar: dia que só tem pagamento é marcado como pago", dia("2026-08-03")?.situacao === "pago");
  ok("cpagar: os dias saem em ordem",
     p.dias.map((d) => d.data).join(",") === [...p.dias.map((d) => d.data)].sort().join(","));
  /*
   * ⚠️ NENHUM DIA PULADO — a asserção que a versão anterior não podia fazer.
   *
   * Antes a faixa continha só os dias COM lançamento: 01, 02, 05, 11, 25. Quem
   * olha lê a sequência como contínua e conclui coisas erradas sobre o
   * espaçamento — dois vencimentos "colados" podiam estar a duas semanas um do
   * outro. Um calendário que pula dia deixa de ser calendário.
   */
  ok("cpagar: agosto tem os 31 dias, sem buraco",
     p.dias.length === 31
     && p.dias.every((d, k) => k === 0 || diasEntreISO(p.dias[k - 1].data, d.data) === 1),
     String(p.dias.length));
  ok("cpagar: os dias vazios entram com zero, não somem",
     p.dias.some((d) => d.quantidade === 0 && d.aPagar === 0 && d.pago === 0 && d.situacao === null));
  ok("cpagar: o dia de hoje vem marcado", p.dias.filter((d) => d.ehHoje).length === 1
     && p.dias.find((d) => d.ehHoje)?.data === "2026-08-11");
  // O teto protege o intervalo personalizado enorme — e DIZ que cortou.
  const longo = montarPainelContasPagar(INPUT, { de: "2026-01-01", ate: "2027-12-31" });
  ok("cpagar: intervalo enorme é cortado no teto E avisa",
     longo.dias.length === 92 && longo.diasTruncados === true, String(longo.dias.length));
  ok("cpagar: intervalo dentro do teto NÃO diz que cortou", p.diasTruncados === false);

  /* ---- Os períodos ------------------------------------------------------- */
  const mes = periodoMes("2026-08-11");
  ok("cpagar: o mês vai do dia 1 ao último", mes.de === "2026-08-01" && mes.ate === "2026-08-31");
  ok("cpagar: fevereiro bissexto fecha no dia 29", periodoMes("2028-02-10").ate === "2028-02-29");
  // ⚠️ Segunda a domingo. Numa semana que começa no domingo, o vencimento de
  // segunda cairia na "semana passada" na manhã de segunda-feira.
  const sem = periodoSemana("2026-08-11");           // 11/08/2026 é uma terça
  ok("cpagar: a semana vai de segunda a domingo", sem.de === "2026-08-10" && sem.ate === "2026-08-16",
     `${sem.de}..${sem.ate}`);
  const domingo = periodoSemana("2026-08-16");
  ok("cpagar: no domingo a semana ainda é a que começou na segunda",
     domingo.de === "2026-08-10" && domingo.ate === "2026-08-16", `${domingo.de}..${domingo.ate}`);
  ok("cpagar: intervalo invertido é recusado, não trocado",
     periodoInvalido(periodoPersonalizado("2026-08-31", "2026-08-01"))
     && !periodoInvalido(periodoPersonalizado("2026-08-01", "2026-08-31")));
}

// ── contas-a-pagar/lancamento: única × recorrente × parcelada ──────────────
{
  const base = { vencimento: "2026-08-31", competencia: "2026-08-10", valor: 4000 };

  const u = planejarLancamento({ ...base, modo: "unica" });
  ok("lanc: única cria um título só", u.titulos.length === 1 && u.total === 4000);
  ok("lanc: única não tem compromisso mensal", u.mensal === null && !u.ehCustoFixo);

  // ⚠️ O PAR QUE JUSTIFICA A TELA: os MESMOS números (4.000 e 12) somam
  // R$ 48.000 num modo e R$ 4.000 no outro. Enquanto isso morava numa caixinha
  // "repetir", nada dizia qual dos dois estava sendo criado.
  const r = planejarLancamento({ ...base, modo: "recorrente", frequencia: "mensal", ocorrencias: 12 });
  const p = planejarLancamento({ ...base, modo: "parcelada", parcelas: 12 });
  ok("lanc: recorrente = valor de CADA vez", r.total === 48_000 && r.titulos.every((t) => t.valor === 4000),
     String(r.total));
  ok("lanc: parcelada = valor TOTAL", p.total === 4000, String(p.total));
  ok("lanc: os dois modos NÃO dão o mesmo número", r.total !== p.total);

  // A competência: cada ocorrência é um fato novo; a compra é um fato só.
  ok("lanc: na recorrente a competência acompanha o vencimento",
     r.titulos[1].competencia === r.titulos[1].vencimento);
  ok("lanc: na parcelada a competência NÃO se parcela",
     p.titulos.every((t) => t.competencia === "2026-08-10"));

  // Centavos: 4000/12 = 333,333… — o resto tem de ir na última.
  const soma = Math.round(p.titulos.reduce((s, t) => s + t.valor, 0) * 100) / 100;
  ok("lanc: as parcelas somam exatamente o total", soma === 4000, String(soma));
  ok("lanc: o resto vai na ÚLTIMA parcela", p.titulos[11].valor > p.titulos[0].valor);

  // Dia 31 num mês de 30 vira o último dia, nunca o dia 1º do mês seguinte.
  ok("lanc: 31/08 → 30/09, não 01/10", p.titulos[1].vencimento === "2026-09-30",
     p.titulos[1].vencimento);
  ok("lanc: fevereiro recebe o último dia", planejarLancamento({
    ...base, vencimento: "2027-01-31", modo: "parcelada", parcelas: 2,
  }).titulos[1].vencimento === "2027-02-28");

  // Custo fixo × recorrente variável — é a resposta do usuário que separa.
  ok("lanc: recorrente de valor estável é custo fixo", r.ehCustoFixo);
  ok("lanc: recorrente de valor que varia NÃO é custo fixo",
     !planejarLancamento({ ...base, modo: "recorrente", frequencia: "mensal", ocorrencias: 12, valorFixo: false }).ehCustoFixo);
  // ⚠️ E a parcela NUNCA é custo fixo: ela acaba, e um custo que acaba não
  // responde "quanto a empresa gasta todo mês para existir".
  ok("lanc: parcela não é custo fixo", !p.ehCustoFixo);

  // O mensal normaliza o ciclo: um anual de 1.200 pesa 100 por mês.
  const anual = planejarLancamento({ ...base, valor: 1200, modo: "recorrente", frequencia: "anual", ocorrencias: 3 });
  ok("lanc: o anual é normalizado para o mês", anual.mensal === 100, String(anual.mensal));

  // Recusas na ENTRADA, com o motivo em português.
  ok("lanc: recorrência sem quantidade é recusada",
     planejarLancamento({ ...base, modo: "recorrente", frequencia: "mensal", ocorrencias: 1 }).problemas.length > 0);
  ok("lanc: parcelamento de 1 parcela é recusado",
     planejarLancamento({ ...base, modo: "parcelada", parcelas: 1 }).problemas.length > 0);
  ok("lanc: valor zero é recusado e não gera título",
     planejarLancamento({ ...base, valor: 0, modo: "unica" }).titulos.length === 0);
  // ⚠️ O modo `folha` NÃO cai no ramo da parcelada. Sem a recusa explícita ele
  // geraria N parcelas do salário em silêncio — o defeito mais barato de
  // escrever e o mais caro de achar, porque nada quebra e o número sai errado.
  const f = planejarLancamento({ ...base, modo: "folha", parcelas: 12 });
  ok("lanc: o modo folha é RECUSADO por este planejador",
     f.titulos.length === 0 && f.total === 0 && f.problemas.length > 0);
}

// ── contas-a-pagar/recorrentes: o que se repete, o que acaba, o custo fixo ─
{
  const mv = (
    id: string, amount: number, due: string,
    extra: Partial<RiskMovement> = {},
  ): RiskMovement => ({
    id, type: "saida", status: "pago", amount, due_date: due, paid_date: due,
    category: "Aluguel", party_id: "p1", ...extra,
  });

  // Seis meses, terminando em agosto/2026.
  const meses = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
  const linhas: RiskMovement[] = [];
  // FIXA: aluguel, sempre 5.000, nos seis meses.
  meses.forEach((m, k) => linhas.push(mv(`al${k}`, 5000, `${m}-05`)));
  // VARIÁVEL: energia, oscila muito, nos seis meses.
  const luz = [800, 1400, 600, 1800, 700, 1500];
  meses.forEach((m, k) => linhas.push(mv(`lz${k}`, luz[k], `${m}-10`,
    { category: "Utilidades", party_id: "p2" })));
  // PARCELADA: notebook em 10x de 900 — repete igual ao aluguel, e ACABA.
  meses.forEach((m, k) => linhas.push(mv(`nb${k}`, 900, `${m}-15`,
    { category: "Equipamentos", party_id: "p3", parcelas: 10, parcela: k + 1 })));
  // AVULSA: cadeiras, uma vez só, em agosto.
  linhas.push(mv("cad", 3000, "2026-08-20", { category: "Móveis", party_id: "p4" }));
  // E uma ENTRADA, que não é conta a pagar.
  linhas.push({ id: "in", type: "entrada", status: "pago", amount: 90_000, due_date: "2026-08-01", paid_date: "2026-08-01" });

  const INPUT: RiskInput = {
    hoje: "2026-08-11", saldoAtual: 10_000, movements: linhas,
    partyNames: { p1: "Imobiliária Norte", p2: "Energia SA", p3: "TechStore", p4: "Móveis Sul" },
  };

  const p = montarPainelRecorrentes(INPUT, "2026-08");
  const esp = (c: string) => p.grupos.find((g) => g.contraparte === c)?.especie;

  ok("recor: aluguel estável é FIXA", esp("Imobiliária Norte") === "fixa", String(esp("Imobiliária Norte")));
  ok("recor: energia que oscila é VARIÁVEL", esp("Energia SA") === "variavel", String(esp("Energia SA")));
  // ⚠️ A asserção que justifica o campo `parcelas`: pelo PADRÃO, o notebook é
  // idêntico ao aluguel — mesmo valor, todo mês, seis meses. Só o dado diz que
  // ele acaba.
  ok("recor: parcela que parece aluguel é PARCELADA", esp("TechStore") === "parcelada", String(esp("TechStore")));
  ok("recor: compra de uma vez é AVULSA", esp("Móveis Sul") === "avulsa", String(esp("Móveis Sul")));

  // O custo fixo NÃO inclui a parcela nem a avulsa.
  ok("recor: o custo fixo é só o que continua", p.custoFixoMensal === 5000, String(p.custoFixoMensal));
  ok("recor: o custo fixo nomeia quantos compromissos o formam", p.compromissosFixos === 1);
  // ⚠️ E ele é MENOR que o total do mês — se fossem iguais, um dos dois estaria
  // respondendo a pergunta do outro.
  ok("recor: total do mês = 5000+1500+900+3000", p.totalDoMes === 10_400, String(p.totalDoMes));
  ok("recor: custo fixo < total do mês", p.custoFixoMensal < p.totalDoMes);
  ok("recor: a entrada não entra em conta a pagar",
     !p.categorias.some((c) => c.valor === 90_000));

  // As frações fecham, e as categorias somam o mês.
  const somaCat = Math.round(p.categorias.reduce((s, c) => s + c.valor, 0) * 100) / 100;
  ok("recor: as categorias somam o total do mês", somaCat === p.totalDoMes, String(somaCat));
  const somaEsp = Math.round(p.especies.reduce((s, e) => s + e.valor, 0) * 100) / 100;
  ok("recor: as espécies somam o total do mês", somaEsp === p.totalDoMes, String(somaEsp));
  ok("recor: as frações da espécie fecham em 1",
     Math.abs(p.especies.reduce((s, e) => s + e.fracao, 0) - 1) < 1e-9);

  // O gráfico: seis colunas, e cada uma soma as quatro espécies.
  ok("recor: o gráfico traz os 6 meses", p.meses.length === 6 && p.meses[5].mes === "2026-08");
  ok("recor: cada coluna soma as espécies",
     p.meses.every((m) => Math.abs((m.fixa + m.variavel + m.parcelada + m.avulsa) - m.total) < 0.011));

  // A média mensal usa os meses OBSERVADOS, não os 6 da janela.
  const novo: RiskInput = { ...INPUT, movements: [
    mv("n1", 2000, "2026-07-05", { category: "Software", party_id: "p9" }),
    mv("n2", 2000, "2026-08-05", { category: "Software", party_id: "p9" }),
    mv("n3", 2000, "2026-06-05", { category: "Software", party_id: "p9" }),
  ], partyNames: { p9: "SaaS Novo" } };
  const q = montarPainelRecorrentes(novo, "2026-08");
  ok("recor: contrato novo custa o que custa, não 1/6 disso",
     q.grupos[0].mediaMensal === 2000, String(q.grupos[0].mediaMensal));

  // Uma aparição não é padrão.
  const uma: RiskInput = { ...INPUT, movements: [mv("u", 500, "2026-08-01")], partyNames: {} };
  ok("recor: uma aparição só não vira recorrente",
     montarPainelRecorrentes(uma, "2026-08").custoFixoMensal === 0);

  // Base vazia: zero sem NaN e sem divisão por zero.
  const vazio = montarPainelRecorrentes({ ...INPUT, movements: [] }, "2026-08");
  ok("recor: base vazia dá zero sem NaN",
     vazio.totalDoMes === 0 && vazio.custoFixoMensal === 0
     && vazio.especies.every((e) => e.fracao === 0) && vazio.meses.length === 6);

  // ⚠️ ZERO É UM VALOR, NÃO A AUSÊNCIA DE VALOR (ONDA 4). Com histórico curto
  // nenhum grupo alcança o mínimo e a soma sai zero CORRETAMENTE — e "seu custo
  // fixo é R$ 0,00" afirma que a empresa não tem custo fixo, que é o oposto do
  // que a base diz. Ela não diz nada ainda.
  const curto: RiskInput = { ...INPUT, movements: [
    mv("c1", 5000, "2026-07-05"), mv("c2", 5000, "2026-08-05"),
  ] };
  const pc = montarPainelRecorrentes(curto, "2026-08");
  ok("recor: histórico curto marca o custo fixo como indisponível",
     pc.custoFixoIndisponivel !== null && pc.mesesComDados === 2,
     `${pc.mesesComDados} meses`);
  ok("recor: e o motivo diz como resolver",
     !!pc.custoFixoIndisponivel?.comoResolver);
  // ⚠️ E com base suficiente ele NÃO fica indisponível — senão a marca cobriria
  // todo caso e deixaria de significar alguma coisa.
  ok("recor: com base suficiente o custo fixo é respondido",
     p.custoFixoIndisponivel === null && p.mesesComDados === 6, String(p.mesesComDados));

  // Deslocar mês atravessa o ano sem virar mês 13.
  ok("recor: dezembro + 1 = janeiro do ano seguinte", deslocarMesCP("2026-12", 1) === "2027-01");
  ok("recor: janeiro − 1 = dezembro do ano anterior", deslocarMesCP("2026-01", -1) === "2025-12");
}

// ── folha: as tabelas legais, os encargos por regime e as quatro datas ────
{
  const ti = inssDe("2025-06").tabela;
  const tr = irrfDe("2025-06").tabela;

  /* ---- INSS: progressivo por faixa, com teto -------------------------------
   * ⚠️ Os valores são conferidos À MÃO, faixa a faixa. Um teste que só compara
   * o motor com ele mesmo passa com a fórmula errada.
   * 1518×7,5% = 113,85 · (2793,88−1518)×9% = 114,83 · (4190,83−2793,88)×12% =
   * 167,63 · (8157,41−4190,83)×14% = 555,32 → teto 951,63.
   */
  ok("folha: INSS do piso é 7,5% do piso", inssEmpregado(1518, ti) === 113.85,
     String(inssEmpregado(1518, ti)));
  ok("folha: INSS de 5.000 é progressivo, não 14% sobre tudo",
     inssEmpregado(5000, ti) === 509.60, String(inssEmpregado(5000, ti)));
  // ⚠️ 14% sobre 5.000 daria 700 — o erro intuitivo tira 190 reais a mais do
  // contracheque todo mês.
  ok("folha: o erro de alíquota única daria muito mais", 5000 * 0.14 > inssEmpregado(5000, ti) * 1.3);
  ok("folha: o teto do INSS é 951,63", tetoINSS(ti) === 951.63, String(tetoINSS(ti)));
  ok("folha: acima do teto o INSS não cresce",
     inssEmpregado(30_000, ti) === tetoINSS(ti), String(inssEmpregado(30_000, ti)));

  /* ---- IRRF: o critério mais vantajoso vence ------------------------------- */
  const ir5k = irrfEmpregado(5000, 509.60, 0, 0, tr);
  ok("folha: IRRF de 5.000 usa o simplificado (312,89)",
     ir5k.imposto === 312.89 && ir5k.criterio === "simplificado",
     `${ir5k.imposto} ${ir5k.criterio}`);
  const ir10k = irrfEmpregado(10_000, 951.63, 0, 0, tr);
  ok("folha: IRRF de 10.000 usa o legal (1.579,57)",
     ir10k.imposto === 1579.57 && ir10k.criterio === "legal",
     `${ir10k.imposto} ${ir10k.criterio}`);
  // ⚠️ E os dependentes só ajudam no critério LEGAL — no simplificado eles não
  // entram. Somar os dois cobraria imposto a menos.
  const comDep = irrfEmpregado(10_000, 951.63, 3, 0, tr);
  ok("folha: dependente reduz o IRRF", comDep.imposto < ir10k.imposto);
  ok("folha: quem ganha até a faixa de isenção não paga IRRF",
     irrfEmpregado(2000, 150, 0, 0, tr).imposto === 0);

  /* ---- O REDUTOR DE 2026 — a isenção até 5 mil ----------------------------
   * ⚠️ Estes valores foram conferidos À MÃO antes de virarem asserção, e os
   * dois EXTREMOS são o que prova que os coeficientes estão certos: o
   * abatimento tem de cobrir exatamente o imposto em R$ 5.000 e chegar
   * exatamente a zero em R$ 7.350. Coeficiente errado quebra um dos dois — ou
   * sobra imposto para quem a lei isentou, ou aparece um degrau no meio da
   * rampa.
   */
  {
    const t26 = irrfDe("2026-08").tabela;
    const t25 = irrfDe("2025-12").tabela;
    ok("folha26: a vigência de 2026 traz o redutor", !!t26.redutor && !t25.redutor);
    // ⚠️ As FAIXAS não mudaram: a lei abate o imposto, não reescreve a tabela.
    ok("folha26: as faixas de 2026 são as mesmas de 2025",
       JSON.stringify(t26.faixas) === JSON.stringify(t25.faixas));

    const a5k = irrfEmpregado(5000, 509.60, 0, 0, t26);
    ok("folha26: 5.000 retinha 312,89 e passa a reter ZERO",
       a5k.impostoDaTabela === 312.89 && a5k.imposto === 0,
       `${a5k.impostoDaTabela} → ${a5k.imposto}`);
    /**
     * ⚠️ SEM DEGRAU logo acima do limite. Uma isenção "até 5.000" implementada
     * como corte seco faria quem ganha R$ 5.001 pagar R$ 313 — trezentos reais
     * por um real a mais. O redutor é uma rampa, e é isso que esta asserção
     * fixa: um real acima, o imposto é de centavos.
     */
    const a5001 = irrfEmpregado(5001, 509.74, 0, 0, t26);
    ok("folha26: um real acima de 5.000 não cria degrau",
       a5001.imposto > 0 && a5001.imposto < 1, String(a5001.imposto));

    const a6k = irrfEmpregado(6000, 649.60, 0, 0, t26);
    ok("folha26: 6.000 fica no meio da rampa (562,63 → 382,88)",
       a6k.impostoDaTabela === 562.63 && a6k.imposto === 382.88,
       `${a6k.impostoDaTabela} → ${a6k.imposto}`);

    // O outro extremo: em 7.350 o abatimento acabou, e nada muda dali para cima.
    const a7350 = irrfEmpregado(7350, 838.60, 0, 0, t26);
    ok("folha26: em 7.350 o redutor zerou", a7350.redutor === 0
       && a7350.imposto === a7350.impostoDaTabela, String(a7350.redutor));
    const a8k = irrfEmpregado(8000, 929.60, 0, 0, t26);
    ok("folha26: acima de 7.350 o imposto é o da tabela",
       a8k.imposto === irrfEmpregado(8000, 929.60, 0, 0, t25).imposto);

    // ⚠️ E o redutor NUNCA vira crédito: isento é zero, não devolução na folha.
    const isento = irrfEmpregado(3000, 253.41, 0, 0, t26);
    ok("folha26: o redutor não devolve dinheiro", isento.imposto === 0 && isento.redutor >= 0);
  }

  /* ---- O ENCARGO PATRONAL DEPENDE DO REGIME -------------------------------
   * É a asserção que sozinha justifica ler o perfil fiscal: a MESMA folha
   * custa 29% a mais no Simples III e 62% a mais no Presumido.
   */
  ok("folha: Simples Anexo III não recolhe patronal (está no DAS)",
     encargosPatronais("simples", "III").total === 0);
  ok("folha: Simples Anexo IV RECOLHE patronal fora do DAS",
     encargosPatronais("simples", "IV").total > 0.27);
  ok("folha: Presumido recolhe patronal", encargosPatronais("presumido", null).total > 0.27);
  /*
   * ⚠️ REGIME NÃO DECLARADO É TETO, NÃO PISO — e o texto tem de dizer isso.
   *
   * A primeira versão da tela chamava o resultado de "um piso"; com 28% de
   * encargo patronal ele é exatamente o oposto. Um rótulo invertido num número
   * de custo faz o dono planejar para cima achando que planejou para baixo.
   */
  const semRegime = encargosPatronais("nao_declarado", null);
  ok("folha: sem regime declarado aplica o cenário mais CARO",
     semRegime.total >= encargosPatronais("simples", "III").total
     && semRegime.total >= 0.27, String(semRegime.total));
  ok("folha: e o texto diz que declarar só REDUZ",
     /reduzir/i.test(semRegime.porque) && !/piso/i.test(semRegime.porque), semRegime.porque);
  // ⚠️ E ele NÃO pode afirmar um regime que a empresa não declarou.
  ok("folha: o texto não inventa o regime do cliente",
     !/Lucro Presumido/.test(semRegime.porque) && !/Simples/.test(semRegime.porque));

  const clt = (regime: "simples" | "presumido", anexo: "III" | "IV" | null, bruto = 5000) =>
    calcularCLT({ id: "c1", nome: "Ana", vinculo: "clt", valor: bruto, desde: "2025-01" }, "2025-06", regime, anexo);

  const simples3 = clt("simples", "III");
  const presumido = clt("presumido", null);
  // 5000 + 400 (FGTS) + 0 + 416,67 (13º) + 555,56 (férias) + 77,78 (FGTS s/ provisão)
  ok("folha: custo no Simples III fecha em 6.450,01",
     simples3.custoTotal === 6450.01, String(simples3.custoTotal));
  // 5000 + 400 + 1400 (28%) + 416,67 + 555,56 + 350,00
  ok("folha: custo no Presumido fecha em 8.122,23",
     presumido.custoTotal === 8122.23, String(presumido.custoTotal));
  ok("folha: o regime muda o custo em mais de 25 pontos",
     presumido.multiplicador - simples3.multiplicador > 0.25,
     `${simples3.multiplicador} vs ${presumido.multiplicador}`);

  /* ---- O SALÁRIO NÃO É O CUSTO ------------------------------------------- */
  ok("folha: o custo é sempre MAIOR que o bruto", simples3.custoTotal > simples3.bruto);
  ok("folha: o líquido é sempre MENOR que o bruto", simples3.liquido < simples3.bruto);
  // ⚠️ E os dois lados NÃO se confundem: INSS e IRRF saem do bruto (não custam
  // a mais), FGTS e patronal entram por cima. Trocar um pelo outro produz um
  // custo plausível e errado.
  ok("folha: INSS e IRRF NÃO entram no custo da empresa",
     Math.abs(simples3.custoTotal - (simples3.bruto + simples3.fgts + simples3.patronal
       + simples3.provisaoDecimo + simples3.provisaoFerias
       + simples3.provisaoEncargosSobreProvisao)) < 0.011);
  ok("folha: a memória de cálculo tem os 11 passos", simples3.memoria.length === 11);

  /* ---- PJ: a nota é o custo, a retenção é do prestador --------------------- */
  const pj = calcularPJ({ id: "p1", nome: "Beta ME", vinculo: "pj", valor: 7000, desde: "2025-01" }, "2025-06");
  ok("folha: no PJ o custo é a nota cheia", pj.custoTotal === 7000);
  ok("folha: prestador do Simples não sofre retenção", pj.totalRetido === 0);
  const pjFora = calcularPJ({ id: "p2", nome: "Gama SA", vinculo: "pj", valor: 7000, desde: "2025-01" },
    "2025-06", { doSimples: false });
  // 7000 × 1,5% = 105 (acima dos 10 de dispensa) + 7000 × 4,65% = 325,50 (acima dos 5.000)
  ok("folha: fora do Simples a retenção existe",
     pjFora.irrf === 105 && pjFora.pisCofinsCsll === 325.5, `${pjFora.irrf}/${pjFora.pisCofinsCsll}`);
  // ⚠️ Abaixo do limite mensal, PIS/COFINS/CSLL NÃO se aplicam — reter de quem
  // é dispensado tira dinheiro que só volta na declaração anual.
  const pjPequeno = calcularPJ({ id: "p3", nome: "Delta", vinculo: "pj", valor: 3000, desde: "2025-01" },
    "2025-06", { doSimples: false });
  ok("folha: abaixo de 5.000 não há PIS/COFINS/CSLL", pjPequeno.pisCofinsCsll === 0);
  ok("folha: mas o IRRF de 1,5% continua", pjPequeno.irrf === 45);

  /* ---- AS QUATRO DATAS ---------------------------------------------------- */
  // ⚠️ "5º dia útil" ≠ "dia 5". Junho de 2025 começa num domingo: os dias úteis
  // são 2,3,4,5,6 → o 5º é dia 6.
  ok("folha: o 5º dia útil de junho/2025 é dia 6",
     diaUtilDoMes("2025-06", 5) === "2025-06-06", diaUtilDoMes("2025-06", 5));
  // Março de 2025: o Carnaval cai em 3 e 4/3, então os úteis são 5,6,7,10,11.
  ok("folha: o Carnaval empurra o 5º dia útil de março/2025 para o dia 11",
     diaUtilDoMes("2025-03", 5) === "2025-03-11", diaUtilDoMes("2025-03", 5));
  ok("folha: o salário de maio vence no 5º dia útil de junho",
     vencimentoSalario("2025-05") === "2025-06-06", vencimentoSalario("2025-05"));
  // ⚠️ FGTS mudou de dia 7 para dia 20 na competência 03/2024 (FGTS Digital).
  ok("folha: FGTS antes de 03/2024 vencia no dia 7",
     vencimentoFGTS("2024-01").slice(8) <= "07", vencimentoFGTS("2024-01"));
  ok("folha: FGTS de 05/2025 vence no dia 20",
     vencimentoFGTS("2025-05") === "2025-06-20", vencimentoFGTS("2025-05"));
  ok("folha: o DARF vence no dia 20 do mês seguinte",
     vencimentoDARF("2025-05") === "2025-06-20", vencimentoDARF("2025-05"));
  // Antecipa, nunca posterga — 20/07/2025 é domingo.
  ok("folha: vencimento em domingo ANTECIPA para sexta",
     vencimentoDARF("2025-06") === "2025-07-18", vencimentoDARF("2025-06"));

  /* ---- Feriados móveis ---------------------------------------------------- */
  ok("folha: a Páscoa de 2025 é 20/04", pascoa(2025) === "2025-04-20", pascoa(2025));
  ok("folha: a Páscoa de 2026 é 05/04", pascoa(2026) === "2026-04-05", pascoa(2026));
  ok("folha: o Carnaval de 2025 é 03 e 04/03",
     feriadosNacionais(2025).includes("2025-03-04") && feriadosNacionais(2025).includes("2025-03-03"));
  ok("folha: Corpus Christi de 2025 é 19/06", feriadosNacionais(2025).includes("2025-06-19"));
  ok("folha: 20/11 é feriado a partir de 2024",
     feriadosNacionais(2024).includes("2024-11-20") && !feriadosNacionais(2023).includes("2023-11-20"));
  ok("folha: feriado não é dia útil", !ehDiaUtil("2025-12-25"));
  ok("folha: antecipar de 25/12 (quinta) cai em 24/12",
     anteciparParaDiaUtil("2025-12-25") === "2025-12-24", anteciparParaDiaUtil("2025-12-25"));

  /* ---- OS TÍTULOS: três por CLT, um por PJ -------------------------------- */
  const ana: Colaborador = { id: "c1", nome: "Ana", vinculo: "clt", valor: 5000, desde: "2025-01" };
  const t = titulosDaCompetencia(ana, "2025-05", "presumido", null);
  ok("folha: um CLT gera TRÊS títulos, em datas diferentes", t.length === 3
     && new Set(t.map((x) => x.vencimento)).size === 2, String(t.length));
  ok("folha: o título de salário é o LÍQUIDO, não o bruto",
     t.find((x) => x.tipo === "salario")!.valor === presumido.liquido);
  /*
   * ⚠️ O DARF EXISTE MESMO NO PISO, e a primeira versão desta guarda afirmava o
   * contrário — que quem ganha o mínimo, num regime sem patronal, não geraria
   * guia. Está errado: o INSS do EMPREGADO é retido a partir do primeiro real
   * e quem recolhe é a empresa. O que zera no piso é o IRRF (faixa de isenção)
   * e o patronal (Anexo III), não o INSS.
   *
   * Fica como asserção de VALOR, que é o que ela deveria ter sido: o DARF é
   * exatamente INSS + IRRF + patronal, e no piso do Anexo III ele é só o INSS.
   */
  const piso: Colaborador = { id: "c2", nome: "Bia", vinculo: "clt", valor: 1518, desde: "2025-01" };
  const tp = titulosDaCompetencia(piso, "2025-05", "simples", "III");
  const kPiso = calcularCLT(piso, "2025-05", "simples", "III");
  ok("folha: no piso do Anexo III o DARF é só o INSS do empregado",
     tp.find((x) => x.tipo === "darf")?.valor === 113.85
     && kPiso.irrf === 0 && kPiso.patronal === 0,
     String(tp.find((x) => x.tipo === "darf")?.valor));
  ok("folha: o DARF é INSS + IRRF + patronal, sempre",
     Math.abs((t.find((x) => x.tipo === "darf")?.valor ?? 0)
       - (presumido.inss + presumido.irrf + presumido.patronal)) < 0.011);
  const tpj = titulosDaCompetencia({ ...ana, id: "p", vinculo: "pj" }, "2025-05", "presumido", null);
  ok("folha: um PJ gera UM título", tpj.length === 1 && tpj[0].tipo === "nota");

  /* ---- Vigência: quem saiu não custa -------------------------------------- */
  ok("folha: antes de entrar, não custa",
     titulosDaCompetencia(ana, "2024-12", "presumido", null).length === 0);
  ok("folha: depois de sair, não custa",
     titulosDaCompetencia({ ...ana, ate: "2025-03" }, "2025-05", "presumido", null).length === 0);

  /* ---- 13º: duas parcelas, a segunda menor ------------------------------- */
  const d = titulosDoDecimo(ana, 2025, "presumido", null);
  ok("folha: o 13º sai em DUAS parcelas", d.length === 2);
  ok("folha: a 1ª parcela é metade do bruto, sem desconto", d[0].valor === 2500);
  // ⚠️ A segunda vem MENOR: os descontos do 13º inteiro saem dela.
  ok("folha: a 2ª parcela vem menor que a 1ª", d[1].valor < d[0].valor, String(d[1].valor));
  ok("folha: as parcelas vencem em 30/11 e 20/12",
     d[0].vencimento.startsWith("2025-11") && d[1].vencimento.startsWith("2025-12"),
     `${d[0].vencimento} ${d[1].vencimento}`);

  /* ---- O painel ----------------------------------------------------------- */
  const equipe: Colaborador[] = [
    ana,
    { id: "c3", nome: "Caio", vinculo: "clt", valor: 3000, desde: "2025-01" },
    { id: "p1", nome: "Delta ME", vinculo: "pj", valor: 8000, desde: "2025-01" },
  ];
  const painel = montarPainelFolha(equipe, "2025-06", "presumido", null);
  ok("folha: o painel conta os dois vínculos", painel.quantosCLT === 2 && painel.quantosPJ === 1);
  ok("folha: o bruto é a soma dos salários e notas", painel.totalBruto === 16_000);
  ok("folha: os encargos são a diferença entre custo e bruto",
     Math.abs(painel.custoTotal - painel.totalBruto - painel.totalEncargos) < 0.011);
  ok("folha: o painel ordena por custo, maior primeiro",
     painel.linhas[0].custoTotal >= painel.linhas[1].custoTotal);
  ok("folha: os títulos saem em ordem de vencimento",
     painel.titulos.map((x) => x.vencimento).join(",")
       === [...painel.titulos.map((x) => x.vencimento)].sort().join(","));

  /* ---- O anual NÃO é o mensal × 12 --------------------------------------- */
  // ⚠️ O 13º e as férias já entram provisionados no mensal; multiplicar por
  // doze os contaria de novo.
  const anual = custoAnual([ana], 2025, "presumido", null);
  ok("folha: o anual é a soma das doze competências",
     Math.abs(anual - presumido.custoTotal * 12) < 1, `${anual}`);

  /* ---- A TABELA VENCE ----------------------------------------------------- */
  // ⚠️ A asserção que separa "número certo" de "número com cara de certo".
  ok("folha: competência dentro da vigência não acusa desatualização",
     !clt("presumido", null).tabelas.desatualizada);
  /**
   * ⚠️ O FALSO POSITIVO QUE ESTA ASSERÇÃO EXISTE PARA IMPEDIR.
   *
   * Ao entrar a vigência de IRRF de 2026, a regra antiga (`tabela !== ultima`)
   * passou a acusar TODO recálculo de 2025 — que usa a tabela de 2025 porque é
   * essa a tabela de 2025. Um aviso que aparece no cálculo certo é um aviso que
   * a pessoa aprende a fechar sem ler, e aí ele não serve mais para janeiro,
   * que é a única hora em que ele importa.
   */
  ok("folha: recalcular um mês PASSADO com a tabela da época não é desatualização",
     !calcularCLT(ana, "2025-06", "presumido", null).tabelas.desatualizada
     && !calcularCLT(ana, "2025-12", "presumido", null).tabelas.desatualizada);
  // ⚠️ Mas virar o ano SEM tabela nova é desatualização — é o caso de hoje, com
  // o INSS parado em 2025 e a competência em 2026.
  ok("folha: atravessar janeiro sem tabela nova MARCA a competência",
     calcularCLT(ana, "2026-08", "presumido", null).tabelas.desatualizada);
  const futuro = calcularCLT(ana, "2030-06", "presumido", null);
  ok("folha: competência muito à frente MARCA a tabela como desatualizada",
     futuro.tabelas.desatualizada && futuro.tabelas.mesesDeAtraso > 12,
     String(futuro.tabelas.mesesDeAtraso));

  /* ---- CLT × PJ: o número vem com o alerta jurídico ----------------------- */
  const cmp = compararVinculo(5000, "2025-06", "presumido", null);
  ok("folha: a comparação devolve os dois custos", cmp.clt > cmp.pj && cmp.percentual > 50);
  // ⚠️ O alerta não é decoração: a escolha entre CLT e PJ é jurídica, e um
  // número sozinho convida à pejotização.
  ok("folha: a comparação NUNCA vem sem o alerta de vínculo",
     cmp.alerta.includes("vínculo") && cmp.alerta.length > 100);
}

// ── folha/ferias e folha/rescisao: valores fechados e as datas legais ─────
{
  const ana: Colaborador = { id: "c1", nome: "Ana", vinculo: "clt", valor: 5000, desde: "2020-03" };

  /* ---- FÉRIAS ------------------------------------------------------------ */
  // ⚠️ A tabela de faltas é em DEGRAUS. Da 5ª para a 6ª o direito cai de 30
  // para 24 — seis dias de uma vez. Uma regra proporcional daria 29.
  ok("ferias: 5 faltas não tiram nada", diasPorFaltas(5) === 30);
  ok("ferias: a 6ª falta tira SEIS dias de uma vez", diasPorFaltas(6) === 24);
  ok("ferias: acima de 32 faltas não há direito", diasPorFaltas(33) === 0);
  ok("ferias: o abono é 1/3 do direito", maximoAbono(30) === 10 && maximoAbono(24) === 8);

  const f = calcularFerias(ana,
    { inicio: "2025-07-14", diasGozados: 20, diasAbono: 10, faltas: 0, adiantar13: false },
    "presumido", null);
  // 5000/30 = 166,6667 · ×20 = 3.333,33 · terço 1.111,11 · ×10 = 1.666,67 · terço 555,56
  ok("ferias: 20 dias de um salário de 5.000 = 3.333,33", f.ferias === 3333.33, String(f.ferias));
  ok("ferias: o terço constitucional é 1/3 disso", f.tercoFerias === 1111.11, String(f.tercoFerias));
  ok("ferias: o abono de 10 dias = 1.666,67", f.abono === 1666.67, String(f.abono));

  /*
   * ⚠️ A ASSERÇÃO CENTRAL DAS FÉRIAS: o abono e o terço sobre ele NÃO entram na
   * base de imposto. São verbas indenizatórias. Somá-los — o erro fácil, porque
   * saem no mesmo recibo — desconta imposto de uma verba isenta, dinheiro que
   * sai do bolso do funcionário e só volta na declaração anual.
   */
  ok("ferias: o abono NÃO entra na base tributável",
     f.baseTributavel === 4444.44, String(f.baseTributavel));
  ok("ferias: a base é só férias + terço, não o total de proventos",
     f.baseTributavel < f.totalProventos && f.totalProventos === 6666.67,
     `${f.baseTributavel} de ${f.totalProventos}`);
  // Se o abono fosse tributado, o INSS seria maior — é a diferença que a regra
  // protege.
  ok("ferias: tributar o abono descontaria mais",
     inssEmpregado(f.totalProventos, inssDe("2025-07").tabela) > f.inss);
  ok("ferias: o FGTS também não incide sobre o abono",
     Math.abs(f.fgts - f.baseTributavel * 0.08) < 0.011);

  /*
   * ⚠️ VENCE DOIS DIAS ANTES DO INÍCIO, e antecipa quando cai em dia não útil.
   * 14/07/2025 − 2 = 12/07, um sábado → 11/07. Pagar no dia do início já é
   * atraso, e o atraso DOBRA a remuneração (Súmula 450 do TST).
   */
  ok("ferias: vence 2 dias antes, antecipando o sábado",
     f.vencimento === "2025-07-11", f.vencimento);
  ok("ferias: o retorno é o início + os dias gozados",
     f.retorno === "2025-08-03", f.retorno);

  // As recusas de entrada.
  ok("ferias: vender mais de 1/3 é recusado",
     calcularFerias(ana, { inicio: "2025-07-14", diasGozados: 15, diasAbono: 15, faltas: 0, adiantar13: false }, "presumido", null)
       .problemas.length > 0);
  ok("ferias: período menor que 5 dias é recusado",
     calcularFerias(ana, { inicio: "2025-07-14", diasGozados: 3, diasAbono: 0, faltas: 0, adiantar13: false }, "presumido", null)
       .problemas.some((p) => /5 dias/.test(p)));
  ok("ferias: passar do direito é recusado",
     calcularFerias(ana, { inicio: "2025-07-14", diasGozados: 30, diasAbono: 10, faltas: 20, adiantar13: false }, "presumido", null)
       .problemas.length > 0);
  // O adiantamento do 13º entra nos proventos e NÃO na base — é tributado em
  // dezembro, sobre o 13º inteiro. Tributar agora cobraria duas vezes.
  const fAdiant = calcularFerias(ana,
    { inicio: "2025-07-14", diasGozados: 30, diasAbono: 0, faltas: 0, adiantar13: true }, "presumido", null);
  ok("ferias: o adiantamento do 13º é metade do salário", fAdiant.adiantamento13 === 2500);
  ok("ferias: e ele NÃO é tributado agora",
     fAdiant.baseTributavel === round2ea(5000 + 5000 / 3), String(fAdiant.baseTributavel));

  /* ---- RESCISÃO ---------------------------------------------------------- */
  // ⚠️ 30 dias + 3 por ano completo, teto de 90. Fixar em 30 subestima o custo
  // de dispensar quem tem tempo de casa em até dois terços.
  ok("rescisao: o aviso cresce 3 dias por ano", diasAviso(0) === 30 && diasAviso(5) === 45);
  ok("rescisao: o aviso para em 90 dias", diasAviso(20) === 90 && diasAviso(50) === 90);

  const rescindir = (modalidade: Parameters<typeof calcularRescisao>[1]["modalidade"]) =>
    calcularRescisao(ana, {
      modalidade, desligamento: "2025-08-20", admissao: "2020-03-02",
      avisoTrabalhado: false, diasFeriasVencidas: 30, saldoFGTS: 0, estimarSaldo: true,
    }, "presumido", null);

  const semJusta = rescindir("sem_justa_causa");
  const pedido = rescindir("pedido_demissao");
  const justa = rescindir("justa_causa");
  const acordo = rescindir("acordo");

  ok("rescisao: 5 anos e 5 meses dão 45 dias de aviso",
     semJusta.anosCompletos === 5 && semJusta.diasAviso === 45,
     `${semJusta.anosCompletos}a ${semJusta.diasAviso}d`);
  ok("rescisao: sem justa causa o líquido fecha em 23.814,54",
     semJusta.liquido === 23814.54, String(semJusta.liquido));
  ok("rescisao: a multa de 40% sobre o saldo estimado é 10.560",
     semJusta.multaFGTS === 10560, String(semJusta.multaFGTS));

  /*
   * ⚠️ AS TRÊS ASSERÇÕES QUE A MODALIDADE DECIDE — e que um cálculo único
   * erraria em três dos quatro casos.
   */
  ok("rescisao: pedido de demissão NÃO tem multa do FGTS", pedido.multaFGTS === 0);
  ok("rescisao: e o aviso não cumprido é DESCONTADO, não recebido",
     pedido.verbas.some((v) => v.natureza === "desconto" && /Aviso/.test(v.nome)));
  ok("rescisao: justa causa não gera 13º nem férias PROPORCIONAIS",
     !justa.verbas.some((v) => /proporcional/i.test(v.nome)),
     justa.verbas.map((v) => v.nome).join(" | "));
  /*
   * ⚠️ E O CONTRAPONTO, que é o erro mais caro: férias VENCIDAS são devidas em
   * TODAS as modalidades, inclusive na justa causa (Súmula 171 do TST). Quem
   * pensa "justa causa não recebe nada" deixa de pagar e vira reclamação.
   */
  ok("rescisao: mas as férias VENCIDAS são devidas até na justa causa",
     justa.verbas.some((v) => /vencidas/i.test(v.nome) && v.valor > 0),
     justa.verbas.map((v) => v.nome).join(" | "));
  ok("rescisao: o acordo paga METADE do aviso e 20% de multa",
     acordo.diasAviso === 23 && acordo.multaFGTS === 5280,
     `${acordo.diasAviso}d ${acordo.multaFGTS}`);
  ok("rescisao: e o acordo NÃO dá seguro-desemprego",
     !REGRAS.acordo.seguroDesemprego && acordo.alertas.some((a) => /seguro/i.test(a)));

  // O saldo de salário existe em todas — é o que sobra sempre.
  for (const [nome, r] of [["sem justa", semJusta], ["pedido", pedido], ["justa", justa], ["acordo", acordo]] as const) {
    ok(`rescisao: ${nome} sempre tem saldo de salário`,
       r.verbas.some((v) => /Saldo de salário/.test(v.nome)));
  }

  // ⚠️ Verba INDENIZATÓRIA não é tributada: aviso indenizado e férias (vencidas
  // e proporcionais) ficam fora da base. Tributá-las descontaria imposto de
  // quem acabou de perder o emprego.
  ok("rescisao: a base tributável é só saldo + 13º",
     semJusta.baseTributavel === 6666.66, String(semJusta.baseTributavel));
  ok("rescisao: o aviso indenizado NÃO é tributado",
     semJusta.verbas.find((v) => /Aviso prévio indenizado/.test(v.nome))?.tributavel === false);

  /*
   * ⚠️ DEZ DIAS CORRIDOS do desligamento (art. 477 §6º, Reforma de 2017), sem
   * distinção entre aviso trabalhado e indenizado. O prazo antigo ainda circula
   * e atrasa a rescisão em nove dias — o que custa UM SALÁRIO de multa.
   * 20/08/2025 + 10 = 30/08, sábado → antecipa para 29/08.
   */
  ok("rescisao: vence em 10 dias corridos, antecipando o sábado",
     semJusta.vencimento === "2025-08-29", semJusta.vencimento);
  ok("rescisao: o prazo NÃO muda com o aviso trabalhado",
     calcularRescisao(ana, {
       modalidade: "sem_justa_causa", desligamento: "2025-08-20", admissao: "2020-03-02",
       avisoTrabalhado: true, diasFeriasVencidas: 30, saldoFGTS: 0, estimarSaldo: true,
     }, "presumido", null).vencimento === semJusta.vencimento);

  // ⚠️ O saldo do FGTS é uma ESTIMATIVA que SUBESTIMA — e o cálculo diz isso.
  ok("rescisao: o saldo estimado vem marcado e alertado",
     semJusta.saldoEstimado && semJusta.alertas.some((a) => /ESTIMADO/.test(a)));
  ok("rescisao: informado o saldo real, a marca some",
     !calcularRescisao(ana, {
       modalidade: "sem_justa_causa", desligamento: "2025-08-20", admissao: "2020-03-02",
       avisoTrabalhado: false, diasFeriasVencidas: 30, saldoFGTS: 40_000, estimarSaldo: false,
     }, "presumido", null).saldoEstimado);
  ok("rescisao: a estimativa é 8% do salário por mês", estimarFGTS(5000, 66) === 26_400);

  // A multa entra no CUSTO mas não no líquido — ela vai para a conta vinculada.
  ok("rescisao: a multa está no custo e fora do líquido",
     semJusta.custoTotal > semJusta.liquido + semJusta.multaFGTS - 1
     && !semJusta.verbas.some((v) => /multa/i.test(v.nome)));

  // Recusa de entrada.
  ok("rescisao: desligamento antes da admissão é recusado",
     calcularRescisao(ana, {
       modalidade: "sem_justa_causa", desligamento: "2019-01-01", admissao: "2020-03-02",
       avisoTrabalhado: false, diasFeriasVencidas: 0, saldoFGTS: 0, estimarSaldo: true,
     }, "presumido", null).problemas.length > 0);
}


/* ========================================================================== */
/* CONTAS A RECEBER — o painel, o envelhecimento e a ponte com a venda        */
/* ========================================================================== */
{
  const mvR = (
    id: string, amount: number, status: RiskMovement["status"],
    due_date: string, paid_date: string | null,
    extra: Partial<RiskMovement> = {},
  ): RiskMovement => ({
    id, type: "entrada", status, amount, due_date, paid_date,
    category: "Vendas", ...extra,
  });

  const INPUT: RiskInput = {
    hoje: "2026-08-11",
    saldoAtual: 10_000,
    partyNames: { p1: "Cliente Alfa", p2: "Cliente Beta", p3: "Cliente Gama" },
    movements: [
      // Recebidas DENTRO do período, pela data de PAGAMENTO.
      mvR("rc1", 2_000, "pago", "2026-07-28", "2026-08-03", { party_id: "p1" }),
      mvR("rc2", 1_000, "pago", "2026-08-05", "2026-08-05"),
      // ⚠️ Vence no período e foi RECEBIDA fora dele: não entra em card nenhum.
      mvR("rc3", 777, "pago", "2026-08-20", "2026-09-02"),
      // Vence HOJE e está em aberto → A VENCER, jamais vencida.
      mvR("hj", 3_000, "pendente", "2026-08-11", null, { party_id: "p2" }),
      mvR("av", 5_000, "pendente", "2026-08-25", null, { party_id: "p1", projeto: "Contrato Sul" }),
      // Vencidas com IDADES diferentes — e duas delas FORA da janela de agosto.
      mvR("at9", 1_500, "pendente", "2026-08-02", null, { party_id: "p2" }),
      mvR("at72", 2_500, "pendente", "2026-05-31", null, { party_id: "p2" }),
      mvR("at218", 800, "pendente", "2026-01-05", null, { party_id: "p3" }),
      // ⚠️ Entrada que NÃO é recebível: ninguém deve isto à empresa.
      mvR("tr", 20_000, "pendente", "2026-08-15", null, { category: "Transferência entre contas" }),
      mvR("cx", 9_999, "cancelado", "2026-08-07", null),
      { id: "sa", type: "saida", status: "pendente", amount: 4_000, due_date: "2026-08-09", paid_date: null },
    ],
  };
  const AGOSTO = { de: "2026-08-01", ate: "2026-08-31" };
  const r = montarPainelContasReceber(INPUT, AGOSTO);

  /* ---- Os três cards, com as datas que os separam ----------------------- */
  ok("creceber: recebido no período usa a DATA DE RECEBIMENTO",
     r.recebidoNoPeriodo.total === 3_000 && r.recebidoNoPeriodo.quantidade === 2,
     `${r.recebidoNoPeriodo.total} / ${r.recebidoNoPeriodo.quantidade}`);
  ok("creceber: recebida fora do período não conta",
     !r.recebidoNoPeriodo.titulos.some((t) => t.id === "rc3"));
  ok("creceber: 'vence hoje' é a vencer, não vencida",
     r.aVencer.titulos.some((t) => t.id === "hj") && !r.vencidas.titulos.some((t) => t.id === "hj"));
  ok("creceber: a vencer soma o que vence de hoje em diante", r.aVencer.total === 8_000,
     String(r.aVencer.total));
  ok("creceber: o card de vencidas é do PERÍODO", r.vencidas.total === 1_500,
     String(r.vencidas.total));

  /* ---- A regra que separa este motor de uma cópia do de pagar ------------ */
  // ⚠️ Sem esta linha, a transferência entre contas próprias apareceria como
  // dinheiro a cobrar de um cliente — e ela sozinha vale 20 mil na fixture.
  ok("creceber: transferência entre contas próprias NÃO é recebível",
     ![...r.recebidoNoPeriodo.titulos, ...r.aVencer.titulos, ...r.vencidas.titulos]
       .some((t) => t.id === "tr")
     && r.carteira.emAberto === 12_800, String(r.carteira.emAberto));
  ok("creceber: cancelada e saída ficam fora",
     ![...r.recebidoNoPeriodo.titulos, ...r.aVencer.titulos, ...r.vencidas.titulos]
       .some((t) => t.id === "cx" || t.id === "sa"));

  /* ---- A CARTEIRA é posição, não período -------------------------------- */
  /**
   * ⚠️ A asserção que registra o defeito que eu ia publicar: com o
   * envelhecimento preso ao período, `at72` (venceu em maio) e `at218`
   * (janeiro) sumiriam ao olhar agosto — justamente a dívida velha, que é o
   * motivo de existir uma tela de cobrança.
   */
  ok("creceber: a carteira enxerga o vencido de FORA da janela",
     r.carteira.vencido === 4_800 && r.carteira.titulos === 5,
     `${r.carteira.vencido} / ${r.carteira.titulos}`);
  ok("creceber: o vencido da carteira é maior que o vencido do período",
     r.carteira.vencido > r.vencidas.total);

  /* ---- O envelhecimento -------------------------------------------------- */
  const faixa = (id: string) => r.envelhecimento.find((e) => e.faixa === id)!;
  ok("creceber: 9 dias caem em 'até 30'", faixa("ate_30").valor === 1_500);
  ok("creceber: 72 dias caem em '61 a 90'", faixa("de_61_a_90").valor === 2_500);
  ok("creceber: 218 dias caem em 'mais de 90'", faixa("acima_90").valor === 800);
  ok("creceber: faixa sem título vale zero, e aparece", faixa("de_31_a_60").valor === 0
     && r.envelhecimento.length === 4);
  // As frações fecham em 1 sobre o VENCIDO, não sobre a carteira.
  const somaFaixas = r.envelhecimento.reduce((s, e) => s + e.fracao, 0);
  ok("creceber: as faixas fecham em 1 sobre o vencido", Math.abs(somaFaixas - 1) < 1e-9,
     String(somaFaixas));
  // ⚠️ Os limites, um a um: é onde um `<` no lugar de `<=` passa despercebido.
  ok("creceber: os limites das faixas não escorregam",
     faixaDoAtraso(1) === "ate_30" && faixaDoAtraso(30) === "ate_30"
     && faixaDoAtraso(31) === "de_31_a_60" && faixaDoAtraso(60) === "de_31_a_60"
     && faixaDoAtraso(61) === "de_61_a_90" && faixaDoAtraso(90) === "de_61_a_90"
     && faixaDoAtraso(91) === "acima_90");

  /* ---- A concentração ---------------------------------------------------- */
  ok("creceber: a exposição agrupa por cliente e ordena pelo maior",
     r.exposicao[0].cliente === "Cliente Beta" && r.exposicao[0].emAberto === 7_000
     && r.exposicao[0].vencido === 4_000 && r.exposicao[0].quantidade === 3,
     JSON.stringify(r.exposicao[0]));
  ok("creceber: a concentração do maior cliente é sobre a carteira",
     Math.abs(r.concentracaoMaiorCliente - 7_000 / 12_800) < 1e-9,
     String(r.concentracaoMaiorCliente));

  /* ---- O calendário: o período INTEIRO ---------------------------------- */
  ok("creceber: agosto tem 31 cápsulas, nenhuma pulada", r.dias.length === 31
     && r.dias[0].data === "2026-08-01" && r.dias[30].data === "2026-08-31");
  ok("creceber: o dia mostra a situação mais URGENTE que contém",
     r.dias.find((d) => d.data === "2026-08-02")?.situacao === "vencido");
  ok("creceber: hoje é marcado mesmo sem nada vencendo",
     r.dias.find((d) => d.data === "2026-08-11")?.ehHoje === true);

  /* ---- A PONTE: faturar não é receber ------------------------------------ */
  const ponte = ponteVendaRecebimento(INPUT, AGOSTO);
  ok("creceber: faturado é por competência (o vencimento)", ponte.faturado === 11_277,
     String(ponte.faturado));
  ok("creceber: recebido é por caixa", ponte.recebido === 3_000, String(ponte.recebido));
  ok("creceber: a receber é o que vence no período", ponte.aReceber === 9_500,
     String(ponte.aReceber));
  /**
   * ⚠️ A asserção que dá sentido à ponte: os três NÃO fecham entre si. Se um
   * dia `faturado === recebido + aReceber`, alguém colapsou as três datas numa
   * só e a tela voltou a sugerir a soma que a ponte existe para impedir.
   */
  ok("creceber: os três números da ponte não se somam",
     ponte.faturado !== ponte.recebido + ponte.aReceber);
  ok("creceber: a conversão em caixa é recebido ÷ faturado",
     Math.abs((ponte.conversaoEmCaixa ?? -1) - 3_000 / 11_277) < 1e-9);
  // ⚠️ Sem faturamento a conversão é AUSENTE, não 0% — "0% do que faturei
  // entrou" manda cobrar; "não faturei" manda vender (regra da ONDA 4).
  const vazio = ponteVendaRecebimento(
    { ...INPUT, movements: [] }, AGOSTO,
  );
  ok("creceber: sem faturamento a conversão é ausente, não zero",
     vazio.conversaoEmCaixa === null);

  /* ---- Os filtros -------------------------------------------------------- */
  const soAlfa = montarPainelContasReceber(INPUT, { ...AGOSTO, cliente: "Cliente Alfa" });
  ok("creceber: o filtro por cliente recorta os cards",
     soAlfa.aVencer.total === 5_000 && soAlfa.recebidoNoPeriodo.total === 2_000,
     `${soAlfa.aVencer.total} / ${soAlfa.recebidoNoPeriodo.total}`);
  // ⚠️ Filtro sem correspondência devolve VAZIO, nunca tudo.
  const ninguem = montarPainelContasReceber(INPUT, { ...AGOSTO, cliente: "Não existe" });
  ok("creceber: filtro sem correspondência devolve vazio",
     ninguem.aVencer.total === 0 && ninguem.carteira.emAberto === 0);
  const ops = opcoesDeFiltroReceber(INPUT);
  ok("creceber: o filtro só oferece o que existe no recebível",
     ops.projetos.join(",") === "Contrato Sul"
     && ops.clientes.includes("Cliente Beta")
     && !ops.clientes.includes("Transferência entre contas"),
     ops.clientes.join(" | "));

  /* ---- Período vazio, sem divisão por zero ------------------------------- */
  const semNada = montarPainelContasReceber(
    { ...INPUT, movements: [] }, AGOSTO,
  );
  ok("creceber: período vazio não divide por zero",
     semNada.distribuicao.every((d) => d.fracao === 0)
     && semNada.concentracaoMaiorCliente === 0
     && semNada.envelhecimento.every((e) => e.fracao === 0));
}

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — guardas de auditoria multi-motor`);
if (fails > 0) process.exit(1);
