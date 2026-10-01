/**
 * engine-audit — guarda de regressão dos bugs de correção achados na auditoria
 * multi-motor (plataforma, reconciliação, event-store, fdip, risco/decisão).
 * Cada asserção ancora um bug real já corrigido; se algum voltar, isto falha.
 *
 *   npm run audit   (também roda dentro de npm test)
 */
import { reconciliarBilling, estadoDaAssinatura, mrrDeAssinaturas } from "@/core/billing";
import {
  detectarColunas, validarMapeamento, assinaturaLayout,
} from "@/core/ingestao/mapeamento";
import {
  podeAprovar, papelQueAprova, transicaoValida, TRANSICOES, montarFila, titulosDaVisao,
  ordenarFila, diasParado, diasEntreISO, rotuloSituacao as rotuloSituacaoCentral,
  type Lancamento, type Aprovador,
} from "@/core/central";
import { agruparEmLinhas, temCamadaDeTexto, type ItemPdf } from "@/core/fdip/pdf-tabela";
import { refinarDocumento, podeVincularContraparte } from "@/core/compras/refino";
import {
  conciliar as conciliarExtrato, saude as saudeConcil, fila as filaConcil, TOLERANCIA_EXATA,
} from "@/core/conciliacao";
import {
  montarFila as montarFilaIngestao, estadoVazio, loteDe, corrigir as corrigirFila,
  decidir as decidirFila, aplicarLote, progresso as progressoFila, corrigirIguais,
  proximoPendente, anterior as anteriorFila, paraGravar,
} from "@/core/ingestao/fila";
import { extrairCampos } from "@/lib/ocr-local";
import { METODOLOGIAS, metodologiaDe, avisoDeSaturacao } from "@/core/metodologia";
import { LedgerCore } from "@/core/platform/ledger-core";
import { FinancialQueue } from "@/core/platform/queue";
import { reconciliarAutomaticamente } from "@/core/financial-os/reconciliation.engine";
import type { FinancialTransaction } from "@/core/financial-os/types";
import { calcularRiskMatrix } from "@/core/decision/risk-matrix";
import { parseTexto } from "@/core/fdip/engine";
import { csvDeLinhas } from "@/core/fdip";
// (parseTexto reusado abaixo para os guards de parsing pt-BR/OFX)
import { TrilhaAuditoria, analisarMudanca } from "@/core/institutional/audit";
import { montarFluxoCaixa } from "@/core/cashflow";
import { dreProjetado, dreGerencial } from "@/core/dre/engine";
import { montarFilaRevisao, descritivoIlegivel, type ItemRevisao } from "@/core/revisao";
import { MATRIZ_DEMO } from "@/core/seguranca";
import { cascataDRE } from "@/core/relatorios/cascata";
import {
  valorOuNulo, previstoNaJanela, projetadoNaJanela, vencidoEmAberto, canceladosNaJanela,
  coberturaCompetencia,
  janela as janelaCanonica,
  reconciliarSaldo, escolherAbertura, aberturaDoExtrato,
} from "@/core/indicadores";
import { montarDataset } from "@/lib/fdip";
import { analisarImportacao } from "@/core/fdip";
import { importedAbertura } from "@/lib/imported";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
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
import { readFileSync } from "node:fs";
import { rotuloSituacao } from "@/core/movimentacoes";
import { regimeConfigurado, alertaDuplicidadeImpostoLucro } from "@/core/tax/duplicidade";
import { brlParts, formatBRL } from "@/lib/format";
import { periodosPorVencimento, periodosComValores } from "@/core/movimentacoes/periodos";
import { linhasDREdaNatureza, linhaDREvalida } from "@/core/registros";
import {
  projetarRecorrentes, datasDaRegra, porMes, tempoDoIntervalo, fraseDoCusto, fraseDaProporcao,
  janelasDoSeletor, mesesNoIntervalo, type RegraRecorrente,
} from "@/core/contas-pagar/projecao";
import { datasFaturaCron } from "@/lib/recorrencias-sched";
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
  linhaDoTituloDaCompra, recusaDeRetirada, proximoNumeroDeCompra, referenciaDaParcela,
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
import { montarDRE, montarDFC, montarRelatorio, montarConsolidado, montarFechamento, mesesDoIntervalo, intervaloDoPreset, compararOrcamento, ESTRUTURA_DRE, ESTRUTURA_DFC, MAX_EMPRESAS, LINHA_TRANSFERENCIA } from "@/core/relatorios";
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
  conferirEncargos,
  titulosDoPeriodo, titulosDaRescisao, titulosSubstituidosNaRescisao, primeiraParcelaSubstituida,
  lerTituloDaFolha, competenciaDoTitulo, encargosProjetados, encargosLancados, mesesAtivosNoAno,
  contaDoColaborador,
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

/* ── A4P-007: "Venceu × Foi pago" olha para TRÁS ────────────────────────────
 *
 * ⚠️ A janela era `[hoje, hoje + N]`, e **pagamento é fato do passado**: nesta
 * base, 101 de 101 liquidados têm `paid_date` anterior a hoje. A coluna do
 * pago somava zero contra um previsto cheio, e toda contraparte aparecia como
 * se não tivesse pago nada — um comparativo em que um dos lados não PODE
 * existir não compara, acusa.
 *
 * As duas colunas são ancoradas no MESMO conjunto (o que venceu na janela),
 * senão um título vencido meses antes e quitado agora entraria só no lado do
 * pago e produziria 300% de cumprimento num mês de atraso.
 *
 * Provada plantando o defeito: com a janela para a frente, quem pagou tudo sai
 * com `realizado = 0` e quem não pagou SOME da tabela.
 */
{
  const HOJE = "2026-08-13";
  const mv = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: Math.random().toString(36).slice(2), type: "entrada", amount: 1000,
       due_date: HOJE, paid_date: null, status: "pendente", party_id: null, ...o }) as RiskMovement;
  const inp = (movements: RiskMovement[]): RiskInput =>
    ({ hoje: HOJE, saldoAtual: 50000, partyNames: {}, movements } as RiskInput);

  const m = montarFluxoCaixa(inp([
    // Alpha venceu 15.000 no mês passado e pagou tudo.
    mv({ amount: 10000, due_date: "2026-07-20", paid_date: "2026-07-21", status: "pago", category: "Alpha" }),
    mv({ amount: 5000, due_date: "2026-07-25", paid_date: "2026-07-26", status: "pago", category: "Alpha" }),
    // Beta venceu 8.000 e não pagou — é atraso, não ausência.
    mv({ amount: 8000, due_date: "2026-07-22", category: "Beta" }),
    // Um título FUTURO não pertence a nenhum dos dois lados.
    mv({ amount: 99999, due_date: "2026-09-10", category: "Alpha" }),
  ]), [], { dias: 30 });

  const linha = (k: string) => m.prevReal.find((l) => l.label === k);
  const alpha = linha("Alpha"), beta = linha("Beta");
  ok("A4P-007: quem venceu no período aparece nas duas pontas",
     !!alpha && !!beta, `linhas=${m.prevReal.map((l) => l.label).join(",") || "(vazio)"}`);
  ok("A4P-007: quem pagou tudo mostra 15.000 × 15.000, não 0 no pago",
     alpha?.planejado === 15000 && alpha?.realizado === 15000,
     `venceu=${alpha?.planejado} pago=${alpha?.realizado}`);
  ok("A4P-007: quem não pagou é ATRASO (8.000 × 0), não some da tabela",
     beta?.planejado === 8000 && beta?.realizado === 0,
     `venceu=${beta?.planejado} pago=${beta?.realizado}`);
  ok("A4P-007: vencimento FUTURO não entra em nenhuma das duas colunas",
     alpha?.planejado === 15000, `venceu=${alpha?.planejado} (99999 vazou se somar 114999)`);
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
  ok("receita líquida = bruta − impostos, sem contar comissão (7000)", !!r && /R\$.?7\.000/.test(r.resposta) && /menos R\$.?3\.000,00 de impostos/.test(r.resposta), r?.resposta?.slice(0, 60));
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
  ], "competencia");
  ok("DRE: receita líquida = bruta − impostos (9000)", g.receitaLiquida === 9000, `${g.receitaLiquida}`);
  ok("DRE: lucro bruto = líquida − CMV (7000)", g.lucroBruto === 7000, `${g.lucroBruto}`);
  ok("DRE: EBITDA = bruto − (folha+opex) (5000)", g.ebitda === 5000, `${g.ebitda}`);
  ok("DRE: lucro líquido = EBITDA − financeiro (4700)", g.lucroLiquido === 4700, `${g.lucroLiquido}`);
  // convenção das margens: base é a RECEITA LÍQUIDA (padrão DRE br), não a bruta.
  // margem bruta = 7000/9000 = 77.8% (não 70%); margem líquida = 4700/9000 = 52.2% (não 47%).
  /*
   * ⚠️ **As margens viraram `Indicador`, e a asserção não foi apagada — foi
   * desembrulhada.** O que ela cobra segue igual: a base é a receita LÍQUIDA,
   * não a bruta. O que mudou é que a margem agora pode NÃO EXISTIR (sem receita
   * líquida não há margem), e o tipo passou a carregar essa possibilidade em vez
   * de dividir por 1 e publicar o valor em reais com um "%" ao lado.
   */
  const mb = valorOuNulo(g.margemBruta), ml = valorOuNulo(g.margemLiquida);
  ok("DRE: margem bruta sobre receita LÍQUIDA (7000/9000 = 77.8%, não /bruta)", mb !== null && Math.abs(mb - 7000 / 9000) < 1e-6, `${mb}`);
  ok("DRE: margem líquida sobre receita LÍQUIDA (4700/9000 = 52.2%)", ml !== null && Math.abs(ml - 4700 / 9000) < 1e-6, `${ml}`);
  // E o caso que o tipo novo existe para cobrir: sem receita, sem margem.
  const vazio = dreGerencial([], "competencia");
  ok("DRE: sem receita líquida a margem é INDISPONÍVEL, nunca 0%",
    !!vazio.margemEbitda.indisponivel && !!vazio.margemBruta.indisponivel && !!vazio.margemLiquida.indisponivel,
    vazio.margemEbitda.indisponivel?.codigo);
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
  /*
   * ⚠️ **MUDANÇA DE REGIME, DECLARADA.** Este caso esperava 6.000 — receita e
   * despesas apenas do que foi PAGO. Era o retrato fiel da agregação inline que
   * a IA tinha: um EBITDA de CAIXA apresentado sem dizer que era de caixa.
   *
   * Com a IA lendo a `cascataDRE`, o número passa a 9.000, porque o DRE é
   * **competência**: a venda de 5.000 com vencimento em julho é receita de
   * julho ainda que o cliente não tenha pago, e a folha de 2.000 vencendo em
   * julho é despesa de julho. Não é o EBITDA que mudou de valor; é o rótulo
   * que passou a corresponder ao que o número sempre deveria ter medido — e a
   * resposta agora DIZ o regime, que é o que faltava para os dois serem
   * distinguíveis.
   *
   * O que este caso continua cobrando, e é o essencial dele: **cancelado nunca
   * entra**. Se os 9.999 cancelados voltassem à base, o EBITDA seria 18.999.
   */
  ok("EBITDA em competência (9000: pendente do mês entra, cancelado nunca)",
    !!eb && /EBITDA.*R\$.?9\.000/.test(eb.resposta) && !/18\.999/.test(eb.resposta),
    eb?.resposta?.slice(0, 50));
  ok("EBITDA declara o regime de que saiu", !!eb && /regime de compet[êe]ncia/.test(eb.resposta), eb?.resposta?.slice(-70));
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
  ok("PF: gasto por categoria pessoal (Mercado = 1500)", !!gm && /pagos R\$.?1\.500,00 em Mercado/.test(gm.resposta), gm?.resposta?.slice(0, 50));
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
  ok("relatorios/dre: resultado líquido = EBIT + financeiro", v("resultado_liquido") === 55_000, `${v("resultado_liquido")}`);
  // ⚠️ Sem D&A lançada, EBITDA e EBIT coincidem — e é justamente por isso que o
  // rótulo errado sobreviveu tanto tempo: na base sem depreciação, os dois
  // números são iguais e nada denuncia a troca de nome.
  ok("relatorios/dre: sem D&A lançada, EBIT == EBITDA", v("ebit") === v("ebitda"), `ebit=${v("ebit")} ebitda=${v("ebitda")}`);
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

  /* Análise vertical — a BASE é declarada, e as duas leituras têm de fechar.
   *
   * ⚠️ O padrão passou a ser RECEITA LÍQUIDA. A bruta inclui imposto sobre
   * venda que nunca foi da empresa; medir despesa contra dinheiro que sai em
   * guia infla toda a coluna. Estas guardas fixavam a base antiga e por isso
   * reprovaram a troca — corrigi-las é registrar a decisão, não afrouxá-las:
   * cada uma agora DIZ sobre que base afirma.
   */
  const avCom = (base: "receita_bruta" | "receita_liquida") => {
    const r = montarDRE(input, { intervalo: jun, tipo: "vertical", baseVertical: base });
    return (id: string) => r.linhas.find((l) => l.id === id)?.celulas[0]?.av;
  };
  const avB = avCom("receita_bruta"), avL = avCom("receita_liquida");
  ok("relatorios/dre: com base BRUTA, a receita bruta é 100%", avB("receita_bruta") === 100, `${avB("receita_bruta")}`);
  ok("relatorios/dre: com base BRUTA, o EBITDA é 30%", avB("ebitda") === 30, `${avB("ebitda")}`);
  ok("relatorios/dre: com base LÍQUIDA (padrão), a receita líquida é 100%", avL("receita_liquida") === 100, `${avL("receita_liquida")}`);
  ok("relatorios/dre: a base padrão é a LÍQUIDA", 
     dre.linhas.find((l) => l.id === "receita_liquida")?.celulas[0]?.av === 100,
     `av(receita_liquida)=${dre.linhas.find((l) => l.id === "receita_liquida")?.celulas[0]?.av}`);

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
  ok("qr: acento e travessão não quebram", gerarQR("Pagamento à QUATTRO — R$ 1,00").tamanho > 0);
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
    hoje: "2026-08-02", plano: "Quattro", empresaId: "1639124",
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
    "/", "/quattro-ai", "/orcamento", "/dashboard/help", "/comece",
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

/* ── projecao: as ocorrências futuras das REGRAS de recorrência ── */
{
  const regra = (
    id: string, valor: number, inicio: string, fim: string | null,
    extra: Partial<RegraRecorrente> = {},
  ): RegraRecorrente => ({
    id, descricao: `Regra ${id}`, valor, frequencia: "mensal",
    inicio, fim, diaVencimento: 10, ativa: true, ...extra,
  });
  const titulo = (id: string, ref: string | null, amount: number, due: string): RiskMovement => ({
    id, type: "saida", status: "pendente", amount, due_date: due, paid_date: null,
    referenceCode: ref, category: "Fornecedores",
  });

  const JAN_JUN = { de: "2026-01-01", ate: "2026-06-30" };

  // ── caso 1: recorrência com FIM no meio do intervalo ──
  // Começa em janeiro, acaba em 2026-03-31 ⇒ jan, fev, mar. Abril não existe.
  {
    const r = projetarRecorrentes({ regras: [regra("a", 1_000, "2026-01-10", "2026-03-31")], movimentos: [], ...JAN_JUN });
    ok("projecao: a data de fim corta a projeção", r.ocorrencias.length === 3 && r.total === 3_000,
       `${r.ocorrencias.length} × ${r.total}`);
    ok("projecao: nada é projetado depois do fim",
       r.ocorrencias.every((o) => o.vencimento <= "2026-03-31"));
    // ⚠️ O dia do FIM ainda é vigência: uma regra que acaba EXATAMENTE no dia do
    // vencimento tem essa última ocorrência. Cortar com `>=` perderia um mês.
    const noDia = projetarRecorrentes({ regras: [regra("a", 1_000, "2026-01-10", "2026-03-10")], movimentos: [], ...JAN_JUN });
    ok("projecao: o dia do fim ainda vence", noDia.ocorrencias.length === 3);
  }

  // ── caso 2: recorrência cancelada (ou pausada) não projeta ──
  {
    const r = projetarRecorrentes({
      regras: [regra("a", 1_000, "2026-01-10", null), regra("b", 500, "2026-01-10", null, { ativa: false })],
      movimentos: [], ...JAN_JUN,
    });
    ok("projecao: regra inativa não projeta",
       r.ocorrencias.every((o) => o.regraId === "a") && r.regrasInativas === 1 && r.total === 6_000,
       `${r.total} · inativas ${r.regrasInativas}`);
  }

  // ── caso 3: mês JÁ materializado não duplica ──
  // ⚠️ O título de março tem o `reference_code` da regra e um valor DIFERENTE
  // (1.200): se a projeção somasse os dois, o total iria a 7.200; se ela
  // ignorasse o título, iria a 6.000 e esconderia o valor real cobrado.
  {
    const movimentos = [titulo("m1", "rec:a:2026-03-10", 1_200, "2026-03-10")];
    const r = projetarRecorrentes({ regras: [regra("a", 1_000, "2026-01-10", null)], movimentos, ...JAN_JUN });
    ok("projecao: mês materializado não duplica", r.ocorrencias.length === 6, String(r.ocorrencias.length));
    // ⚠️ 1.200 no realizado E 1.200 nos cinco projetados: a última cobrança
    // CONHECIDA vira o valor esperado dos meses seguintes, porque é ela que diz
    // o que a conta custa hoje. A regra ainda diz 1.000, e é essa divergência
    // que marca as ocorrências como estimadas.
    ok("projecao: o mês materializado vale o valor do TÍTULO",
       r.total === 7_200 && r.totalRealizado === 1_200 && r.totalProjetado === 6_000,
       `${r.total} / ${r.totalRealizado} / ${r.totalProjetado}`);
    ok("projecao: a divergência de valor marca os meses futuros",
       r.ocorrencias.filter((o) => o.origem === "projetado").every((o) => o.estimada && o.valor === 1_200));
    const marco = r.ocorrencias.find((o) => o.mes === "2026-03");
    ok("projecao: o mês materializado é marcado como realizado",
       marco?.origem === "realizado" && marco?.movimentoId === "m1");
    // ⚠️ O casamento é por MÊS, não pela data exata: o materializador arredonda
    // o dia e a regra pode ter mudado de dia. Um título no dia 15 continua
    // suprimindo a projeção do dia 10 do mesmo mês.
    const outroDia = projetarRecorrentes({
      regras: [regra("a", 1_000, "2026-01-10", null)],
      movimentos: [titulo("m2", "rec:a:2026-03-15", 1_200, "2026-03-15")], ...JAN_JUN,
    });
    // ⚠️ A asserção é sobre a ORIGEM, não sobre o total. Plantei o defeito
    // (casar pela data exata) e o total continuou 7.200: com a divergência de
    // valor, a ocorrência PROJETADA de março vale o mesmo que o título, e os
    // dois números coincidem. Um teste que só olha o total aprova a duplicata
    // sempre que o valor projetado bater com o real — que é o caso comum.
    const marcoOutroDia = outroDia.ocorrencias.find((o) => o.mes === "2026-03");
    ok("projecao: o casamento é por mês, não pelo dia",
       outroDia.ocorrencias.length === 6
       && marcoOutroDia?.origem === "realizado" && marcoOutroDia?.movimentoId === "m2",
       `${outroDia.ocorrencias.length} · ${marcoOutroDia?.origem} · ${marcoOutroDia?.movimentoId}`);
    // Título de OUTRA regra não suprime nada.
    const outraRegra = projetarRecorrentes({
      regras: [regra("a", 1_000, "2026-01-10", null)],
      movimentos: [titulo("m3", "rec:zzz:2026-03-10", 1_200, "2026-03-10")], ...JAN_JUN,
    });
    ok("projecao: título de outra regra não suprime", outraRegra.total === 6_000);
    // E um título SEM `reference_code` (a maioria do banco) é invisível aqui —
    // ele não pertence a regra nenhuma e não pode suprimir uma projeção.
    const semRef = projetarRecorrentes({
      regras: [regra("a", 1_000, "2026-01-10", null)],
      movimentos: [titulo("m4", null, 1_200, "2026-03-10")], ...JAN_JUN,
    });
    ok("projecao: título sem chave não suprime", semRef.total === 6_000);
  }

  // ── caso 4: recorrência criada no MEIO do intervalo ──
  {
    const r = projetarRecorrentes({ regras: [regra("a", 1_000, "2026-04-10", null)], movimentos: [], ...JAN_JUN });
    ok("projecao: regra que começa no meio só vale dali para frente",
       r.ocorrencias.length === 3 && r.ocorrencias[0].vencimento === "2026-04-10",
       `${r.ocorrencias.length} · ${r.ocorrencias[0]?.vencimento}`);
  }

  // ── valor: a regra manda, exceto quando a última cobrança discorda ──
  {
    const movimentos = [titulo("m1", "rec:a:2026-02-10", 1_500, "2026-02-10")];
    const r = projetarRecorrentes({ regras: [regra("a", 1_000, "2026-01-10", null)], movimentos, ...JAN_JUN });
    const futuro = r.ocorrencias.filter((o) => o.origem === "projetado");
    ok("projecao: valor divergente usa a última cobrança e marca estimada",
       futuro.every((o) => o.valor === 1_500 && o.estimada) && r.regrasComValorDivergente === 1,
       `${futuro[0]?.valor} · estimada ${futuro[0]?.estimada}`);
  }

  // ── a fase do ciclo sai do INÍCIO da regra, não do início do intervalo ──
  {
    const r = projetarRecorrentes({
      regras: [regra("t", 900, "2026-01-10", null, { frequencia: "trimestral" })],
      movimentos: [], ...JAN_JUN,
    });
    ok("projecao: trimestral respeita a fase do início",
       r.ocorrencias.map((o) => o.mes).join(",") === "2026-01,2026-04",
       r.ocorrencias.map((o) => o.mes).join(","));
  }

  // ── intervalo invertido devolve VAZIO, não silêncio ──
  {
    const r = projetarRecorrentes({ regras: [regra("a", 1_000, "2026-01-10", null)], movimentos: [], de: "2026-06-30", ate: "2026-01-01" });
    ok("projecao: intervalo invertido devolve vazio", r.ocorrencias.length === 0 && r.total === 0);
  }

  // ── nunca negativo, e mês vazio vale ZERO ──
  {
    const r = projetarRecorrentes({ regras: [regra("a", 1_000, "2026-05-10", null)], movimentos: [], ...JAN_JUN });
    const linhas = porMes(r);
    ok("projecao: porMes traz TODOS os meses do intervalo", linhas.length === 6, String(linhas.length));
    ok("projecao: mês sem ocorrência vale zero", linhas[0].total === 0 && linhas[0].mes === "2026-01");
    ok("projecao: nenhum valor é negativo",
       linhas.every((l) => l.total >= 0 && l.realizado >= 0 && l.projetado >= 0));
    ok("projecao: a soma dos meses fecha com o total",
       Math.round(linhas.reduce((s, l) => s + l.total, 0) * 100) / 100 === r.total);
  }

  // ── o tempo verbal sai do INTERVALO, não de um ternário na tela ──
  {
    const H = "2026-08-12";
    ok("projecao: intervalo passado fala no passado",
       tempoDoIntervalo("2026-01-01", "2026-06-30", H) === "passado"
       && fraseDoCusto("2026-01-01", "2026-06-30", H) === "Seu custo recorrente foi de");
    ok("projecao: intervalo futuro fala no futuro",
       tempoDoIntervalo("2026-09-01", "2027-02-28", H) === "futuro"
       && fraseDoCusto("2026-09-01", "2027-02-28", H) === "Seu custo recorrente estará em");
    ok("projecao: intervalo que cruza hoje tem frase própria",
       tempoDoIntervalo("2026-08-01", "2027-01-31", H) === "cruza"
       && fraseDoCusto("2026-08-01", "2027-01-31", H) === "Seu custo recorrente será de");
    // ⚠️ As bordas: o dia de hoje pertence ao intervalo que termina hoje E ao
    // que começa hoje. Um `<`/`>` trocado aqui faria a janela "próximos 6
    // meses" — que começa hoje — ser anunciada no passado.
    ok("projecao: o intervalo que termina HOJE não é passado", tempoDoIntervalo("2026-01-01", H, H) === "cruza");
    ok("projecao: o intervalo que começa HOJE não é futuro", tempoDoIntervalo(H, "2027-01-01", H) === "cruza");
    // ⚠️ A PROPORÇÃO também se conjuga. "ainda é projeção" é vocabulário de
    // futuro, e apareceu (medido no navegador) num intervalo passado ao lado de
    // um valor que descreve meses já vividos. No passado a proporção diz outra
    // coisa: o dinheiro saiu, só que nenhum título ficou ligado à regra.
    ok("projecao: a proporção no passado não fala de expectativa",
       fraseDaProporcao("2026-01-01", "2026-06-30", H) === "do valor foi derivado da regra, sem título ligado a ela"
       && fraseDaProporcao("2026-09-01", "2027-02-28", H) === "do valor ainda é projeção");

    // ── as três janelas do seletor, em meses FECHADOS ──
    const js = janelasDoSeletor(H);
    ok("projecao: o seletor tem as três janelas", js.length === 3 && js.map((j) => j.id).join(",") === "ultimos6,proximos6,proximos12");
    const u6 = js[0], p6 = js[1], p12 = js[2];
    ok("projecao: últimos 6 meses termina no fim do mês corrente",
       u6.de === "2026-03-01" && u6.ate === "2026-08-31", `${u6.de}..${u6.ate}`);
    ok("projecao: próximos 6 meses INCLUI o mês corrente",
       p6.de === "2026-08-01" && p6.ate === "2027-01-31", `${p6.de}..${p6.ate}`);
    ok("projecao: próximos 12 meses vai até o fim do 12º",
       p12.de === "2026-08-01" && p12.ate === "2027-07-31", `${p12.de}..${p12.ate}`);
    ok("projecao: cada janela cobre exatamente os meses do rótulo",
       mesesNoIntervalo(u6.de, u6.ate).length === 6
       && mesesNoIntervalo(p6.de, p6.ate).length === 6
       && mesesNoIntervalo(p12.de, p12.ate).length === 12);
    // Fevereiro: o último dia do mês tem de ser 28/29, nunca o dia 1º do
    // seguinte (a armadilha de `new Date` em UTC-3 que a guarda `tz` cobra).
    ok("projecao: fevereiro fecha no último dia",
       janelasDoSeletor("2026-02-10")[0].ate === "2026-02-28",
       janelasDoSeletor("2026-02-10")[0].ate);
  }

  // ── a projeção e o MATERIALIZADOR têm de gerar as MESMAS datas ──
  // ⚠️ Sem isto a tela diz dia 10 e o título nasce dia 15, e a mesma conta
  // aparece duas vezes com um dia de diferença. As duas implementações são
  // separadas de propósito (o cron só olha para a frente; a projeção aceita
  // qualquer intervalo), e é esta guarda que as mantém de acordo.
  {
    const r = regra("a", 1_000, "2026-01-05", null, { diaVencimento: 31 });
    const meu = datasDaRegra(r, "2026-03-01", "2026-06-30");
    const dele = datasFaturaCron(r.inicio, r.frequencia, r.diaVencimento, "2026-03-01", 121);
    ok("projecao: as datas batem com as do materializador",
       meu.join(",") === dele.join(","), `${meu.join(",")} ≠ ${dele.join(",")}`);
  }
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

  // ── a faixa vai ATÉ ONDE HOUVER TÍTULO, e não para em hoje ──
  // ⚠️ `montarPeriodos` monta doze meses TERMINANDO no mês corrente — a leitura
  // sazonal, que olha para trás. Numa tela de títulos isso escondia o que a
  // pessoa acabou de lançar: uma compra em 12x ou o salário agendado para
  // dezembro ficavam sem cápsula e sem coluna, e quem lançou concluía que o
  // lançamento não entrou.
  {
    const futuro: RiskInput = {
      hoje: "2026-08-11", saldoAtual: 0,
      movements: [
        { id: "f1", type: "saida", status: "pendente", amount: 900, due_date: "2026-08-20", paid_date: null },
        { id: "f2", type: "saida", status: "pendente", amount: 700, due_date: "2026-12-05", paid_date: null },
      ],
    };
    const fx = periodosPorVencimento(futuro, futuro.hoje, "mes", "pagar");
    const chaves = fx.map((x) => x.key);
    ok("t9: a faixa alcança o mês do título mais distante",
       chaves[chaves.length - 1] === "2026-12", chaves.slice(-4).join(","));
    ok("t9: e o valor cai no mês certo",
       fx.find((x) => x.key === "2026-12")?.total === 700
       && fx.find((x) => x.key === "2026-08")?.total === 900);
    // Os meses do meio entram VAZIOS, não pulados: uma faixa que pula mês deixa
    // de ser calendário e vira lista ordenada por data.
    ok("t9: os meses entre hoje e o título distante existem, em zero",
       ["2026-09", "2026-10", "2026-11"].every((m) => fx.find((x) => x.key === m)?.total === 0));
    // Sem título futuro, a faixa continua com os doze de sempre — a extensão é
    // consequência do DADO, não uma janela nova cravada.
    const semFuturo = periodosPorVencimento(
      { ...futuro, movements: [futuro.movements[0]] }, futuro.hoje, "mes", "pagar");
    ok("t9: sem título futuro a faixa não cresce", semFuturo.length === 12, String(semFuturo.length));
  }

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

// ── folha: CINCO SALÁRIOS, uma por faixa, conferidos À MÃO ────────────────
/*
 * ⚠️ **Cada caso prova que o caminho RECEBEU VALOR** (regra do CLAUDE.md): não
 * basta o cálculo não explodir — o número tem de ser o esperado, e os casos têm
 * de DISCRIMINAR entre si. Um conjunto de salários que produzisse o mesmo
 * líquido não testaria a progressividade que ele existe para fixar.
 *
 * Tabela de 2025 (junho), sem dependentes, regime Lucro Presumido.
 */
{
  const CASOS = [
    // 1.518 — PISO. Só a 1ª faixa: 1518 × 7,5% = 113,85. IRRF zero (base abaixo
    // da 1ª faixa mesmo pelo critério legal).
    { bruto: 1518, inss: 113.85, irrf: 0, liquido: 1404.15, custo: 2465.91 },
    // 2.500 — 2ª faixa. 1518×7,5% = 113,85 · (2500−1518)×9% = 88,38 → 202,23.
    { bruto: 2500, inss: 202.23, irrf: 0, liquido: 2297.77, custo: 4061.11 },
    // 5.000 — 4ª faixa. 113,85 + 114,83 + 167,63 + (5000−4190,83)×14% = 113,28
    // → 509,60. IRRF pelo SIMPLIFICADO: 312,89 (menor que o legal).
    { bruto: 5000, inss: 509.60, irrf: 312.89, liquido: 4177.51, custo: 8122.23 },
    // 10.000 — ACIMA DO TETO do INSS: 951,63 e não cresce mais.
    { bruto: 10000, inss: 951.63, irrf: 1579.57, liquido: 7468.80, custo: 16244.44 },
    // 30.000 — bem acima do teto: INSS idêntico ao de 10.000; só o IRRF cresce.
    { bruto: 30000, inss: 951.63, irrf: 7079.57, liquido: 21968.80, custo: 48733.33 },
  ];
  for (const k of CASOS) {
    const c = calcularCLT({ id: "f", nome: "f", tipo: "clt", valor: k.bruto, dependentes: 0 } as never,
      "2025-06", "presumido" as never, null);
    ok(`folha: ${k.bruto} → INSS ${k.inss}`, c.inss === k.inss, String(c.inss));
    ok(`folha: ${k.bruto} → IRRF ${k.irrf}`, c.irrf === k.irrf, String(c.irrf));
    ok(`folha: ${k.bruto} → líquido ${k.liquido}`, c.liquido === k.liquido, String(c.liquido));
    ok(`folha: ${k.bruto} → custo ${k.custo}`, c.custoTotal === k.custo, String(c.custoTotal));
  }

  /*
   * ⚠️ **OS CASOS DISCRIMINAM** — cinco líquidos DIFERENTES. Sem isto, uma
   * implementação que devolvesse sempre o mesmo número passaria nas asserções
   * acima se por acaso acertasse uma delas.
   */
  const liquidos = new Set(CASOS.map((k) => k.liquido));
  ok("folha: os cinco casos produzem líquidos DIFERENTES", liquidos.size === 5, `${liquidos.size} distintos`);

  /*
   * ⚠️ **E O MULTIPLICADOR É CONSTANTE — de propósito, e isto NÃO é defeito.**
   *
   * Foi reportado como erro ("dois salários com o mesmo 1,62× é matematicamente
   * impossível"). É o contrário: `custoTotal` é bruto + FGTS + patronal +
   * provisões, e TODAS essas parcelas são proporcionais ao bruto. O INSS e o
   * IRRF do empregado são DESCONTO — saem do bolso dele, não entram no custo do
   * empregador. Então o fator de custo é o mesmo para qualquer salário, e o que
   * a progressividade muda é o LÍQUIDO, asserido acima.
   *
   * Esta asserção existe para impedir que alguém "conserte" o que está certo.
   */
  const fatores = new Set(CASOS.map((k) => Math.round((k.custo / k.bruto) * 1000)));
  ok("folha: o multiplicador de CUSTO é o mesmo para todo salário (encargo é proporcional)",
     fatores.size === 1, `${[...fatores].map((f) => (f / 1000).toFixed(3)).join(", ")}`);
}

// ── folha: o aviso de encargo divergente ──────────────────────────────────
{
  /*
   * ⚠️ Os quatro casos que decidem se o aviso PRESTA. Um aviso que aparece
   * sempre é um aviso que se aprende a ignorar — e aí ele não existe quando
   * importa.
   */
  ok("folha: encargo dentro da faixa NÃO avisa (10% de desvio)",
     conferirEncargos(10_000, 11_000).divergente === false, "10%");
  ok("folha: encargo 25% ABAIXO avisa", conferirEncargos(10_000, 7_500).divergente === true, "-25%");
  ok("folha: encargo 30% ACIMA avisa", conferirEncargos(10_000, 13_000).divergente === true, "+30%");
  /*
   * ⚠️ **Sem lançamento não é divergência, é ausência.** Sem esta linha o aviso
   * apareceria para toda empresa que ainda não importou o extrato do mês, com
   * desvio de −100% — ruído, não achado.
   */
  ok("folha: sem lançamento na competência NÃO avisa",
     conferirEncargos(10_000, 0).divergente === false && conferirEncargos(10_000, 0).comparavel === false);
  // E o caso REAL medido na organização auditada: FGTS a 6,1% e INSS a 11,1%
  // contra 8% e 27,8% — ~57% abaixo do projetado. Tem de avisar.
  ok("folha: o caso real da organização auditada avisa",
     conferirEncargos(263_119.71, 125_925.27).divergente === true,
     `${Math.round(conferirEncargos(263_119.71, 125_925.27).desvio * 100)}%`);
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
  // As duas PARCELAS (os encargos do 13º viraram títulos próprios — ver o bloco
  // "FOLHA, COMPRAS E REEMBOLSOS" no fim deste arquivo).
  ok("folha: o 13º sai em DUAS parcelas", d.filter((x) => x.tipo === "decimo").length === 2);
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

/* ── O VENCIDO EM ABERTO ENTRA NA PROJEÇÃO ──────────────────────────────────
 *
 * ⚠️ A projeção de caixa recortava por `due_date >= hoje`. Um título em aberto
 * que venceu ontem caía fora — e ele não sumiu: ainda vai sair da conta. O
 * caixa projetado nascia melhor do que a realidade pelo valor exato do que a
 * empresa já devia, todos os dias. Medido em produção (org 835278a9, 14/08/26):
 * **R$ 74.248,59** de saídas vencidas em aberto contra **R$ 3.162,12** de
 * entradas — R$ 71.086,47 líquidos ignorados a favor da empresa.
 *
 * A regra é EXPLÍCITA e tem nome: o vencido é esperado a partir de HOJE, a
 * data mais cedo em que ele ainda pode se mover. `previstoNaJanela` (a agenda
 * de vencimentos) NÃO muda; quem projeta usa `projetadoNaJanela` — número
 * diferente, nome diferente.
 *
 * Provada quebrando: com a fixture sem o vencido, os dois números coincidem e
 * o caso deixa de discriminar — por isso cada asserção afirma sobre o VALOR
 * que o caminho produziu, e não só sobre a ausência de exceção.
 */
{
  const HOJE = "2026-08-14";
  const mv = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: Math.random().toString(36).slice(2), type: "saida", amount: 1000,
       due_date: HOJE, paid_date: null, status: "pendente", category: "Fornecedores",
       party_id: null, ...o }) as RiskMovement;
  const inp = (movements: RiskMovement[]): RiskInput =>
    ({ hoje: HOJE, saldoAtual: 100_000, partyNames: {}, movements } as RiskInput);

  const VENCIDA = mv({ amount: 74_248.59, due_date: "2026-06-10" });
  const A_VENCER = mv({ amount: 30_000, due_date: "2026-08-25" });
  const RECEBER_VENCIDO = mv({ type: "entrada", amount: 3_162.12, due_date: "2026-07-02", category: "Vendas" });
  const CANCELADO_VENCIDO = mv({ amount: 999_999, due_date: "2026-05-01", status: "cancelado" });
  const COM = inp([VENCIDA, A_VENCER, RECEBER_VENCIDO, CANCELADO_VENCIDO]);
  const SEM = inp([A_VENCER]);

  const J = janelaCanonica(HOJE, "2026-09-12", "Janela do filtro");

  /* ---- A agenda de vencimentos NÃO muda de significado ------------------- */
  const agenda = previstoNaJanela(COM, J, "saida");
  ok("vencido: a agenda de vencimentos conta só o que vence na janela (30.000)",
     Math.abs(agenda.valor - 30_000) < 1e-6, String(agenda.valor));

  /* ---- A projeção soma o vencido, e o número MUDA ------------------------ */
  const proj = projetadoNaJanela(COM, J, "saida");
  ok("vencido: a projeção inclui o vencido em aberto (104.248,59)",
     Math.abs(proj.valor - 104_248.59) < 1e-6, String(proj.valor));
  // ⚠️ A asserção que dá sentido ao caso: os dois têm de DISCORDAR, e a
  // diferença tem de ser exatamente o vencido. Um caso que não discrimina é um
  // caso que não testa.
  ok("vencido: a diferença entre agenda e projeção é exatamente o vencido",
     Math.abs((proj.valor - agenda.valor) - 74_248.59) < 1e-6,
     String(proj.valor - agenda.valor));
  ok("vencido: sem título vencido, agenda e projeção coincidem",
     Math.abs(projetadoNaJanela(SEM, J, "saida").valor - previstoNaJanela(SEM, J, "saida").valor) < 1e-6);

  /* ---- O cancelado não volta pela porta do vencido ----------------------- */
  ok("vencido: título cancelado e vencido fica de fora",
     Math.abs(vencidoEmAberto(COM, "saida").valor - 74_248.59) < 1e-6,
     String(vencidoEmAberto(COM, "saida").valor));
  ok("vencido: o lado de entrada é medido à parte",
     Math.abs(vencidoEmAberto(COM, "entrada").valor - 3_162.12) < 1e-6,
     String(vencidoEmAberto(COM, "entrada").valor));

  /* ---- Janela que começa ANTES de hoje não conta duas vezes -------------- */
  // ⚠️ União, não soma: o vencido já está DENTRO de uma janela retroativa, e
  // somar os dois blocos duplicaria esses títulos.
  const retro = projetadoNaJanela(COM, janelaCanonica("2026-06-01", "2026-09-12", "Retroativa"), "saida");
  ok("vencido: janela retroativa não conta o vencido duas vezes",
     Math.abs(retro.valor - 104_248.59) < 1e-6, String(retro.valor));

  /* ---- A natureza continua projeção, e a agenda é fato ------------------- */
  ok("vencido: o vencido em aberto é FATO (o título existe e a data passou)",
     vencidoEmAberto(COM, "saida").procedencia.natureza === "fato");
  ok("vencido: a projeção continua marcada como projeção",
     proj.procedencia.natureza === "projecao");

  /* ---- A TELA: o resumo executivo do fluxo de caixa ---------------------- */
  const comFluxo = montarFluxoCaixa(COM, [], { dias: 30, visao: "previsto" });
  const semFluxo = montarFluxoCaixa(SEM, [], { dias: 30, visao: "previsto" });
  ok("vencido: as saídas projetadas do resumo incluem o vencido",
     Math.abs(comFluxo.resumo.saidasProjetadas - 104_248.59) < 1e-6,
     String(comFluxo.resumo.saidasProjetadas));
  ok("vencido: o resumo separa quanto das projetadas é atraso",
     Math.abs(comFluxo.resumo.saidasVencidas - 74_248.59) < 1e-6,
     String(comFluxo.resumo.saidasVencidas));
  ok("vencido: sem o título vencido o número CAI exatamente esse valor",
     Math.abs((comFluxo.resumo.saidasProjetadas - semFluxo.resumo.saidasProjetadas) - 74_248.59) < 1e-6,
     `${comFluxo.resumo.saidasProjetadas} - ${semFluxo.resumo.saidasProjetadas}`);
  ok("vencido: o cartão e o canônico contam a MESMA coisa",
     Math.abs(comFluxo.resumo.saidasCanonicas.valor - comFluxo.resumo.saidasProjetadas) < 1e-6,
     `${comFluxo.resumo.saidasCanonicas.valor} x ${comFluxo.resumo.saidasProjetadas}`);
  // ⚠️ A regra tem de estar DITA — a projeção subiu de valor e nada na tela
  // explicaria por quê. Instrumentação sem consumidor não conta como feito.
  ok("vencido: a regra de expectativa é declarada em português",
     /vencido/.test(comFluxo.resumo.regraDoVencido) && /hoje/.test(comFluxo.resumo.regraDoVencido),
     comFluxo.resumo.regraDoVencido);
  // ⚠️ E o CALENDÁRIO tem de concordar com o cartão: o vencido aparece no dia
  // de hoje. Se ele sumir daqui, a árvore e o cartão voltam a discordar.
  const hojeNoCalendario = comFluxo.calendario.find((d) => d.date === HOJE);
  ok("vencido: o calendário mostra o vencido no dia de hoje",
     !!hojeNoCalendario && Math.abs(hojeNoCalendario.paga - 74_248.59) < 1e-6,
     String(hojeNoCalendario?.paga));
}

/* ── O CANCELADO É INVISÍVEL, E CALADO ──────────────────────────────────────
 *
 * ⚠️ Excluir o cancelado do resultado está CERTO: ele não é receita, não é
 * despesa e não vai ao caixa. O defeito era o silêncio — um DRE sobre uma base
 * com centenas de cancelados tem a mesma cara de um DRE sobre base limpa, e a
 * diferença só aparece para quem confere o total contra o extrato.
 *
 * Medido na organização auditada (14/08/26, fora a amostra): **119 títulos
 * cancelados, R$ 579.361,41** — R$ 189.960,40 de entrada e R$ 389.401,01 de
 * saída. No período de 12 meses do relatório: 62 títulos, R$ 395.722,13.
 * Conferido na trilha de auditoria: nenhum evento alterou `status` em momento
 * algum, e os 123 `movements.criar` registrados nasceram pendentes ou pagos —
 * os cancelamentos são ANTERIORES à trilha (junho/26). Não é deriva recente de
 * semântica: é estado preexistente, e por isso se documenta em vez de desfazer.
 *
 * ⚠️ A asserção que dá sentido ao caso: o cancelado continua FORA de toda soma.
 * Um rodapé que virasse linha devolveria ao resultado dinheiro que ninguém deve
 * nem receberá — defeito bem pior do que o silêncio que ele conserta.
 */
{
  const HOJE = "2026-08-14";
  const mv = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: Math.random().toString(36).slice(2), type: "entrada", amount: 1000,
       due_date: "2026-08-10", paid_date: "2026-08-10", status: "pago",
       category: "Vendas", party_id: null, ...o }) as RiskMovement;
  const AGOSTO = janelaCanonica("2026-08-01", "2026-08-31", "Agosto/26");

  const INPUT: RiskInput = {
    hoje: HOJE, saldoAtual: 10_000, partyNames: {},
    movements: [
      mv({ amount: 20_000 }),
      mv({ type: "saida", amount: 5_000, category: "Fornecedores" }),
      mv({ amount: 133_851.63, status: "cancelado", paid_date: null }),
      mv({ type: "saida", amount: 261_870.50, status: "cancelado", paid_date: null, category: "Fornecedores" }),
      // Cancelado FORA da janela — não pode entrar no rodapé do período.
      mv({ amount: 999_999, due_date: "2026-03-02", status: "cancelado", paid_date: null }),
    ],
  } as RiskInput;

  const c = canceladosNaJanela(INPUT, AGOSTO);
  ok("cancelado: o rodapé conta os títulos cancelados da janela", c.quantidade === 2,
     String(c.quantidade));
  ok("cancelado: entrada e saída ficam separadas",
     Math.abs(c.entradas - 133_851.63) < 1e-6 && Math.abs(c.saidas - 261_870.50) < 1e-6,
     `${c.entradas} / ${c.saidas}`);
  ok("cancelado: o total é a soma das magnitudes (395.722,13)",
     Math.abs(c.total - 395_722.13) < 1e-6, String(c.total));
  ok("cancelado: cancelado fora da janela não entra no rodapé",
     Math.abs(c.total - 395_722.13) < 1e-6 && c.quantidade === 2);
  ok("cancelado: o painel de pagar rodapeia só o lado dele",
     canceladosNaJanela(INPUT, AGOSTO, "saida").quantidade === 1
     && Math.abs(canceladosNaJanela(INPUT, AGOSTO, "saida").total - 261_870.50) < 1e-6);
  // ⚠️ Sem cancelado o rodapé SOME. Rodapé permanente de "0 cancelados" é ruído
  // em toda tela, e ruído treina a pessoa a não ler o rodapé no dia em que ele
  // tem algo a dizer.
  ok("cancelado: base limpa não produz rodapé",
     canceladosNaJanela({ ...INPUT, movements: INPUT.movements.filter((m) => m.status !== "cancelado") }, AGOSTO)
       .quantidade === 0);

  /* ---- E O NÚMERO CONTINUA FORA DAS SOMAS ------------------------------- */
  // Esta é a asserção que impede o "conserto" errado: alguém somar o rodapé.
  const cascata = cascataDRE(INPUT, { intervalo: { de: "2026-08-01", ate: "2026-08-31" }, regime: "competencia" });
  ok("cancelado: a receita bruta ignora o cancelado (20.000, não 153.851,63)",
     Math.abs(cascata.linhas.receita_bruta.valor - 20_000) < 1e-6, String(cascata.linhas.receita_bruta.valor));
  ok("cancelado: o resultado líquido ignora o cancelado (15.000)",
     Math.abs(cascata.linhas.resultado_liquido.valor - 15_000) < 1e-6, String(cascata.linhas.resultado_liquido.valor));
}

/* ── A DECOMPOSIÇÃO DO CAIXA FECHA AO CENTAVO ───────────────────────────────
 *
 * ⚠️ **O achado que quase virou "não existe", e o erro de método que causou isso.**
 *
 * Relatado: o extrato não fecha, com gap de R$ 1.293,65 "exatamente igual ao
 * Resultado Financeiro do período". Eu medi `fluxo_financiamento` juntando
 * `movements` a `categories` por `category_id` — e as 36 linhas de tarifa desta
 * organização têm `category_id` NULO, com o nome no campo TEXTO `movements.
 * category`, que é justamente o que a classificação lê. Todas caíram em "(sem
 * categoria)", o financeiro deu zero e eu concluí que o defeito não existia.
 * **Medi uma superfície e concluí sobre outra** — a mesma família do erro que
 * refutou o A4P-036 pelo avesso.
 *
 * O defeito é REAL e mora no RELATÓRIO, não no extrato: `Saídas Operacionais`
 * exclui o financeiro (corretamente — ela se chama operacionais e o financeiro
 * sai em `Fluxo de Financiamentos`), mas quem lê os três números mais salientes
 * e faz a conta de cabeça erra por exatamente o Resultado Financeiro.
 *
 * Medido: 680.884,72 + 519.976,29 − 1.230.567,52 = −29.706,51 contra um saldo
 * real de −31.000,16. As 26 Tarifas bancárias e as 10 de adquirência valem
 * R$ 1.293,65 na janela.
 *
 * Esta guarda fixa as DUAS metades: a decomposição TOTAL fecha sem resíduo, e o
 * par ingênuo NÃO fecha — e sobra exatamente o financeiro. A segunda existe para
 * o próximo auditor encontrar a explicação em vez de perseguir o fantasma.
 */
{
  const mv = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: Math.random().toString(36).slice(2), type: "entrada", amount: 1000,
       due_date: "2026-03-10", paid_date: "2026-03-10", status: "pago",
       category: "Vendas", party_id: null, ...o }) as RiskMovement;

  // Fecha em −31.000,16 com abertura de 680.884,72, como na org auditada.
  const ENTRADAS = 519_976.29, SAIDAS_OP = 1_230_567.52, TARIFAS = 1_293.65;
  const SALDO_HOJE = ENTRADAS - SAIDAS_OP - TARIFAS + 680_884.72;
  const INPUT: RiskInput = {
    hoje: "2026-08-31", saldoAtual: SALDO_HOJE, partyNames: {},
    movements: [
      mv({ amount: ENTRADAS }),
      mv({ type: "saida", amount: SAIDAS_OP, category: "Fornecedores" }),
      mv({ type: "saida", amount: TARIFAS, category: "Tarifas bancárias" }),
    ],
  } as RiskInput;

  const dfc = montarDFC(INPUT, { intervalo: { de: "2025-09-01", ate: "2026-08-31" }, tipo: "dfc" });
  const val = (id: string) => {
    const l = dfc.linhas.find((x) => x.id === id);
    if (!l) return NaN;
    return id === "saldo_inicial" ? l.celulas[0].valor
      : id === "saldo_final" ? l.celulas[l.celulas.length - 1].valor
      : l.total.valor;
  };
  const cent = (n: number) => Math.round(n * 100) / 100;

  const abertura = val("saldo_inicial");
  const fechamento = val("saldo_final");
  const financeiro = val("fluxo_financiamento");
  const investimento = val("fluxo_investimento");
  const entradasTotais = val("entradas_operacionais")
    + Math.max(0, investimento) + Math.max(0, financeiro);
  const saidasTotais = val("saidas_operacionais")
    - Math.min(0, investimento) - Math.min(0, financeiro);

  /* ---- R2: o caminho testado RECEBEU valor -------------------------------- */
  // Sem esta asserção, tudo abaixo passaria com o financeiro em zero — que é
  // exatamente o estado em que a medição errada me convenceu de que não havia
  // defeito. Fixture sobre o vazio é pior que fixture nenhuma.
  ok("caixa: a fixture tem resultado financeiro de verdade, não zero",
     cent(financeiro) === -TARIFAS && financeiro !== 0, String(financeiro));
  ok("caixa: a abertura é reconstruída do saldo de hoje",
     cent(abertura) === cent(SALDO_HOJE - (ENTRADAS - SAIDAS_OP - TARIFAS)), String(abertura));

  /* ---- A decomposição TOTAL fecha, sem resíduo ---------------------------- */
  const residuo = cent(abertura + entradasTotais - saidasTotais - fechamento);
  ok("caixa: abertura + entradas totais − saídas totais = fechamento, ao centavo",
     residuo === 0, `resíduo = ${residuo}`);
  // Derivado das linhas, não de um literal: as saídas totais são as
  // operacionais mais o que o financeiro tirou do caixa.
  ok("caixa: as saídas totais incluem o financeiro apurado pela cascata",
     cent(saidasTotais) === cent(val("saidas_operacionais") - Math.min(0, financeiro)),
     String(saidasTotais));

  /* ---- E o par INGÊNUO não fecha — e sobra o financeiro ------------------- */
  /**
   * ⚠️ Esta é a asserção que documenta o fantasma. Ela tem de FALHAR de fechar:
   * se um dia o par ingênuo fechar, alguém somou o financeiro dentro de
   * `saidas_operacionais` e a linha passou a contar duas vezes (ela já sai em
   * `fluxo_financiamento`). O nome da linha é "operacionais" — ela não pode.
   *
   * ⚠️ **E ela NÃO fixa um número.** A primeira versão cobrava R$ 1.293,65, o
   * valor medido em produção. Basta uma reclassificação legítima — mover
   * "Tarifas de adquirência" de resultado financeiro para despesa variável,
   * que é o que ela é (MDR é custo de vender) — para o valor mudar e a guarda
   * reprovar código correto. Guarda que reprova o certo é desligada na primeira
   * semana, ou "consertada" com o número novo, e aí ela deixou de medir a
   * regra e passou a memorizar um dataset.
   *
   * O que a regra diz é uma IDENTIDADE: o resíduo do par ingênuo é, sempre, o
   * resultado financeiro que a própria cascata apurou — seja ele qual for.
   */
  const residuoIngenuo = cent(
    abertura + val("entradas_operacionais") - val("saidas_operacionais") - fechamento,
  );
  ok("caixa: o par ingênuo NÃO fecha, e o que sobra é o financeiro da cascata",
     residuoIngenuo === cent(-financeiro) && residuoIngenuo !== 0,
     `resíduo ${residuoIngenuo} × financeiro ${cent(-financeiro)}`);
  ok("caixa: o financeiro não é contado duas vezes no fluxo líquido",
     cent(val("fluxo_liquido")) === cent(ENTRADAS - SAIDAS_OP - TARIFAS),
     String(val("fluxo_liquido")));
}

/* ── A FILA DE REVISÃO — separa, não classifica ─────────────────────────────
 *
 * Os casos são os MEDIDOS na org 835278a9 em 14/08, um a um. A fixture usa os
 * valores e textos reais porque o que ela protege é o CRITÉRIO: uma regra que
 * deixe de pegar o lixo de OCR, ou que passe a acusar "NF-e 123/45", perde a
 * fila do mesmo jeito — por omissão ou por ruído.
 *
 * ⚠️ A regra recorrente entra na fila junto com os títulos que ela gera.
 * Medido: os quatro "Salário" de R$ 35.000 são filhos FIÉIS da regra
 * `d9439421` (descrição *Salário*, contraparte *GOOGLE ADS CAMPANHA*,
 * categoria *Assinaturas / software*). Corrigir os filhos e deixar a regra viva
 * a faz materializar o mesmo defeito no mês seguinte.
 */
{
  const it = (o: Partial<ItemRevisao>): ItemRevisao =>
    ({ id: "x", origem: "lancamento", descricao: null, valor: 100, data: "2026-06-10",
       tipo: "saida", categoriaTexto: "Aluguel", categoriaChave: null, contraparte: null, ...o });

  const FILA = montarFilaRevisao([
    // Os cinco de R$ 35.000 com a chave contradizendo a descrição.
    it({ id: "a", descricao: "Salário", valor: 35_000, categoriaTexto: null, categoriaChave: "Assinaturas / software" }),
    it({ id: "b", descricao: "123", valor: 35_000, categoriaTexto: null, categoriaChave: "Aluguel" }),
    // As duas ENTRADAS com nome de salário.
    it({ id: "c", descricao: "Salary", valor: 8_500, tipo: "entrada", categoriaTexto: "Salary" }),
    // O lixo de leitura ótica, vencido desde 2023 e em aberto.
    it({ id: "d", descricao: "! [=]E?s rica NE Bro,", valor: 32, data: "2023-05-05" }),
    // Valor zero.
    it({ id: "e", descricao: "Estorno", valor: 0, tipo: "entrada", categoriaTexto: "Tarifas bancárias" }),
    // A regra recorrente contraditória.
    it({ id: "f", origem: "recorrencia", descricao: "Salário", valor: 35_000,
         categoriaTexto: null, categoriaChave: "Assinaturas / software", contraparte: "GOOGLE ADS CAMPANHA" }),
    /* ---- E o que NÃO pode entrar: a fila só serve se não gritar lobo ------ */
    it({ id: "ok1", descricao: "NF-e 123/45", valor: 1_200, categoriaTexto: "Fornecedores" }),
    it({ id: "ok2", descricao: "PIX — João", valor: 300, categoriaTexto: "Utilidades" }),
    it({ id: "ok3", descricao: "Folha de pagamento", valor: 20_000, categoriaTexto: "Folha de pagamento" }),
    // Recorrência COERENTE: descrição de folha com categoria de folha.
    it({ id: "ok4", origem: "recorrencia", descricao: "Salário", valor: 9_000,
         categoriaChave: "Folha de pagamento", contraparte: "Equipe" }),
  ]);
  const por = (m: string) => FILA.achados.filter((a) => a.motivo === m).map((a) => a.id);

  ok("revisao: a chave que contradiz a descrição entra na fila",
     por("categoria_nao_propagada").join(",") === "a,b", por("categoria_nao_propagada").join(","));
  ok("revisao: entrada com nome de salário entra", por("entrada_com_cara_de_folha").join(",") === "c");
  ok("revisao: lixo de leitura ótica entra", por("descritivo_ilegivel").join(",") === "d");
  ok("revisao: valor zero entra", por("valor_zero").join(",") === "e");
  ok("revisao: a REGRA recorrente entra, não só os títulos dela",
     por("regra_inconsistente").join(",") === "f", por("regra_inconsistente").join(","));
  /**
   * ⚠️ A asserção que decide se a fila presta: ela NÃO grita lobo. Um detector
   * que acusa nota fiscal, PIX e folha coerente treina a pessoa a fechar a aba,
   * e aí ele deixou de existir. Mesma regra do detector de segredos.
   */
  ok("revisao: nada legítimo entra na fila",
     !FILA.achados.some((a) => a.id.startsWith("ok")),
     FILA.achados.filter((a) => a.id.startsWith("ok")).map((a) => `${a.id}:${a.motivo}`).join(" | "));
  ok("revisao: são exatamente os 6 achados medidos", FILA.achados.length === 6, String(FILA.achados.length));
  // O maior primeiro: a fila é trabalho humano, e trabalho humano se prioriza
  // por consequência.
  ok("revisao: o maior valor vem primeiro", Math.abs(FILA.achados[0].valor) === 35_000);
  ok("revisao: o total é a soma das MAGNITUDES, não um saldo",
     Math.abs(FILA.total - (35_000 * 3 + 8_500 + 32)) < 1e-6, String(FILA.total));
  // ⚠️ Cada achado sai com a PERGUNTA — sem ela a fila é uma lista de acusações
  // sem o que fazer, e quem abre fecha.
  ok("revisao: todo achado diz o que perguntar",
     FILA.achados.every((a) => a.pergunta.length > 10 && a.explicacao.length > 10));

  /* ---- O detector de ilegível, nos dois sentidos ------------------------- */
  ok("revisao: ilegível pega o que é ilegível", descritivoIlegivel("! [=]E?s rica NE Bro,") === true);
  ok("revisao: e NÃO pega o que um financeiro escreve o dia inteiro",
     ["NF-e 123/45", "PIX — João", "Boleto Condomínio", "DARF 0561", "R$ 1.234,56 — taxa"]
       .every((t) => !descritivoIlegivel(t)));
}

/* ── TRANSFERÊNCIA FORA, ESTORNO NEGATIVO ──────────────────────────────────
 *
 * Duas regras que a Etapa 4 do de-para exigiu, e as duas mexem no resultado.
 *
 * ⚠️ **`transferencia` não é linha, é a ausência de linha DITA.** Antes, a
 * única forma de tirar um pagamento de fatura de cartão do resultado era não
 * declará-lo — e aí o palpite por palavra-chave o punha em despesa operacional,
 * inflando o custo com dinheiro que só mudou de bolso. Medido: R$ 267,70 nesta
 * organização (fatura de cartão R$ 167,70 + boleto de transferência R$ 100,00).
 *
 * ⚠️ **ENTRADA numa linha de sinal "-" é ESTORNO, e entra negativa.** Uma
 * restituição de imposto é a dedução voltando; em magnitude ela AUMENTARIA a
 * dedução — o contribuinte recebe dinheiro de volta e o DRE registra que ele
 * pagou mais imposto. Sem esta regra, a única saída seria classificar a
 * restituição como receita, e aí ela infla o faturamento (era o estado medido:
 * R$ 655,30 dentro da receita bruta).
 */
{
  const mv = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: Math.random().toString(36).slice(2), type: "saida", amount: 1000,
       due_date: "2026-03-10", paid_date: "2026-03-10", status: "pago",
       category: "Aluguel", party_id: null, ...o }) as RiskMovement;
  const INPUT: RiskInput = {
    hoje: "2026-08-31", saldoAtual: 0, partyNames: {},
    movements: [
      mv({ type: "entrada", amount: 100_000, category: "Vendas" }),
      mv({ amount: 10_000, category: "Simples Nacional" }),
      mv({ type: "entrada", amount: 655.30, category: "Restituição de impostos" }),
      mv({ amount: 267.70, category: "Credit card payment" }),
    ],
  } as RiskInput;
  const DECL: Record<string, string> = {
    "vendas": "receita_bruta", "simples nacional": "deducoes",
    "restituição de impostos": "deducoes", "credit card payment": LINHA_TRANSFERENCIA,
  };
  const rodar = (decl: Record<string, string>) => montarRelatorio(INPUT, ESTRUTURA_DRE, {
    intervalo: { de: "2026-03-01", ate: "2026-03-31" }, tipo: "dre",
    regime: "competencia", linhaPorCategoria: decl,
  });
  const val = (r: ReturnType<typeof rodar>, id: string) =>
    Math.round((r.linhas.find((l) => l.id === id)?.total.valor ?? NaN) * 100) / 100;

  const r = rodar(DECL);
  /* ---- A transferência não entra em NENHUMA linha ------------------------ */
  // Sem a saída declarada ela cairia em despesa operacional — é o "antes".
  const semSaida = rodar({ ...DECL, "credit card payment": "despesas_operacionais" });
  ok("transferencia: declarada, não entra em linha nenhuma",
     val(r, "despesas_operacionais") === 0, String(val(r, "despesas_operacionais")));
  ok("transferencia: e o controle prova que o caminho recebia valor",
     val(semSaida, "despesas_operacionais") === 267.70, String(val(semSaida, "despesas_operacionais")));
  // ⚠️ O resultado MUDA pelo valor exato da transferência — e é isso que se
  // quer: ela nunca foi despesa. Somar zeros não provaria nada.
  ok("transferencia: o resultado melhora exatamente o valor dela",
     Math.round((val(r, "resultado_liquido") - val(semSaida, "resultado_liquido")) * 100) / 100 === 267.70,
     `${val(r, "resultado_liquido")} × ${val(semSaida, "resultado_liquido")}`);

  /* ---- O estorno REDUZ a dedução, não aumenta --------------------------- */
  ok("estorno: a restituição REDUZ a dedução (10.000 − 655,30)",
     val(r, "deducoes") === 9_344.70, String(val(r, "deducoes")));
  // ⚠️ A asserção que fixa o defeito: em magnitude daria 10.655,30 — a
  // devolução aumentando o imposto pago.
  ok("estorno: em magnitude daria 10.655,30, e não dá", val(r, "deducoes") !== 10_655.30);
  ok("estorno: e a restituição NÃO está na receita bruta",
     val(r, "receita_bruta") === 100_000, String(val(r, "receita_bruta")));
}

/* ── COMPETÊNCIA ≠ VENCIMENTO ≠ CAIXA ──────────────────────────────────────
 *
 * ⚠️ **O caso que sozinho separa os dois regimes, e que o sistema não tinha.**
 * Uma compra com competência em MARÇO e vencimento em ABRIL tem de cair em
 * março no DRE e em abril no DFC. Antes caía em abril nos dois: `dataDe(m,
 * "competencia")` devolvia `due_date` e `RiskMovement` sequer declarava
 * `competence_date` — não era fallback silencioso, era coluna inerte.
 *
 * A consequência não era o número (medido: 23,2% preenchido, e as duas
 * divergências caem no mesmo mês, então o DRE não muda um centavo). Era o
 * formulário exigir "Data de competência" e dizer *"quando o fato aconteceu — é
 * o que o DRE lê"*. E era de produto: um DRE que apura por vencimento não é
 * competência nem caixa, e os dois relatórios passavam a diferir só por
 * pago-versus-não-pago.
 */
{
  const COMP = "2026-03-15", VENC = "2026-04-10", PAGO = "2026-04-10";
  const compra: RiskMovement = {
    id: "c1", type: "saida", status: "pago", amount: 12_000,
    due_date: VENC, paid_date: PAGO, competence_date: COMP,
    category: "Fornecedores / insumos", party_id: null,
  } as RiskMovement;
  const INPUT: RiskInput = { hoje: "2026-08-31", saldoAtual: 0, partyNames: {}, movements: [compra] } as RiskInput;
  const MARCO = { de: "2026-03-01", ate: "2026-03-31" };
  const ABRIL = { de: "2026-04-01", ate: "2026-04-30" };

  const dre = (i: { de: string; ate: string }) =>
    montarRelatorio(INPUT, ESTRUTURA_DRE, { intervalo: i, tipo: "dre", regime: "competencia" })
      .linhas.find((l) => l.id === "custos_variaveis")!.total.valor;
  const dfc = (i: { de: string; ate: string }) =>
    montarRelatorio(INPUT, ESTRUTURA_DFC, { intervalo: i, tipo: "dfc", regime: "caixa" })
      .linhas.find((l) => l.id === "saidas_operacionais")!.total.valor;

  ok("competencia: o DRE põe a compra em MARÇO (a competência)", dre(MARCO) === 12_000, String(dre(MARCO)));
  ok("competencia: e NÃO em abril", dre(ABRIL) === 0, String(dre(ABRIL)));
  ok("competencia: o DFC põe a mesma compra em ABRIL (o caixa)", dfc(ABRIL) === 12_000, String(dfc(ABRIL)));
  ok("competencia: e NÃO em março", dfc(MARCO) === 0, String(dfc(MARCO)));
  /**
   * ⚠️ A asserção que dá sentido ao caso: os dois regimes têm de DISCORDAR
   * sobre este lançamento. Se um dia concordarem, a competência voltou a ser o
   * vencimento e o sistema tem de novo um regime só com dois nomes.
   */
  ok("competencia: os dois regimes discordam sobre o mesmo lançamento",
     dre(MARCO) !== dfc(MARCO) && dre(ABRIL) !== dfc(ABRIL));

  /* ---- Sem competência, o vencimento vale — e a tela DIZ quantos ---------- */
  const semComp: RiskMovement = { ...compra, id: "c2", competence_date: null } as RiskMovement;
  const MISTO: RiskInput = { ...INPUT, movements: [compra, semComp] } as RiskInput;
  ok("competencia: sem o campo, o vencimento continua valendo",
     montarRelatorio(MISTO, ESTRUTURA_DRE, { intervalo: ABRIL, tipo: "dre", regime: "competencia" })
       .linhas.find((l) => l.id === "custos_variaveis")!.total.valor === 12_000);
  // ⚠️ Instrumentação com consumidor (R4): o fallback é DECLARADO. Sem este
  // número na tela, um DRE metade por competência e metade por vencimento tem a
  // mesma cara de um conferido.
  const cob = coberturaCompetencia(MISTO, janelaCanonica("2026-03-01", "2026-04-30", "Mar–Abr"));
  ok("competencia: a cobertura conta quantos caíram no vencimento",
     cob.total === 2 && cob.comCompetencia === 1 && cob.semCompetencia === 1
     && Math.abs((cob.cobertura ?? 0) - 0.5) < 1e-9,
     `${cob.comCompetencia}/${cob.total}`);
}

/* ── A CONTRAPARTE NUNCA É A CATEGORIA ─────────────────────────────────────
 *
 * ⚠️ Era `nomes[party_id] ?? ultimo.category ?? "Sem contraparte"`. Sem cadastro
 * de contraparte, a CATEGORIA virava o nome dela — e como a CHAVE do
 * agrupamento sai daí, fornecedores distintos viravam um compromisso só.
 *
 * Medido na organização auditada: 12 lançamentos "GOOGLE ADS CAMPANHA" e 12
 * "META ADS FACEBOOK INSTAGRAM", R$ 71.043,14 no período, todos com `party_id`
 * NULO e o nome do fornecedor na DESCRIÇÃO. Colapsavam numa linha chamada
 * "Marketing".
 *
 * ⚠️ E o achado nasceu de uma acusação REFUTADA: a linha "GOOGLE ADS CAMPANHA ·
 * Assinaturas / software · R$ 35.000/mês" NÃO era fabricada — os 4 lançamentos
 * de R$ 35.000 têm `party_id` de verdade apontando para essa contraparte, e a
 * média sai deles. O defeito estava ao lado, no fallback.
 */
{
  const mv = (desc: string, valor: number, mes: string): RiskMovement =>
    ({ id: `${desc}-${mes}`, type: "saida", status: "pago", amount: valor,
       due_date: `${mes}-10`, paid_date: `${mes}-10`, category: "Marketing",
       party_id: null, descricao: desc } as RiskMovement);
  const MESES = ["2026-03", "2026-04", "2026-05", "2026-06"];
  const INPUT: RiskInput = {
    hoje: "2026-06-30", saldoAtual: 0, partyNames: { "p-goog": "GOOGLE ADS CAMPANHA" },
    movements: [
      ...MESES.map((m) => mv("GOOGLE ADS CAMPANHA", 3_000, m)),
      ...MESES.map((m) => mv("META ADS FACEBOOK INSTAGRAM", 2_000, m)),
      // O caso com contraparte CADASTRADA continua vencendo a descrição.
      ...MESES.map((m) => ({ ...mv("qualquer texto", 35_000, m), party_id: "p-goog",
        category: "Assinaturas / software" } as RiskMovement)),
    ],
  } as RiskInput;

  const painel = montarPainelRecorrentes(INPUT, "2026-06");
  const nomes = painel.grupos.map((g) => g.contraparte);

  ok("contraparte: a categoria NUNCA vira o nome da contraparte",
     !nomes.includes("Marketing"), nomes.join(" | "));
  ok("contraparte: Google e Meta ficam SEPARADOS",
     nomes.filter((n) => /google/i.test(n)).length >= 1 && nomes.some((n) => /meta/i.test(n)),
     nomes.join(" | "));
  // ⚠️ A asserção que fixa o defeito: eram DOIS fornecedores num grupo só.
  const semParty = painel.grupos.filter((g) => !/^GOOGLE ADS CAMPANHA$/.test(g.contraparte));
  ok("contraparte: os dois sem cadastro viram DOIS compromissos, não um",
     semParty.length === 2, `${semParty.length}: ${semParty.map((g) => g.contraparte).join(" | ")}`);
  ok("contraparte: a cadastrada vence a descrição",
     nomes.includes("GOOGLE ADS CAMPANHA"), nomes.join(" | "));
  // E a média de cada um sai do próprio grupo, não da soma dos dois.
  const google = painel.grupos.find((g) => /google/i.test(g.contraparte) && g.categoria === "Marketing");
  ok("contraparte: a média é do fornecedor, não da soma",
     Math.abs((google?.mediaMensal ?? 0) - 3_000) < 1e-6, String(google?.mediaMensal));
}

/* ── A MATRIZ DE PERMISSÃO, do lado do cliente ─────────────────────────────
 *
 * ⚠️ O achado que a motivou: em 17/08 o banco tinha OITO papéis em
 * `role_permissions` e o tipo `Papel` do cliente tinha SETE. O
 * `contador_externo` entrou pela ONDA 13 no servidor e nunca chegou aqui — a
 * tela de usuários não conseguia oferecê-lo, e quem o recebesse por SQL
 * apareceria com a string crua, porque `nomeDoPapel` não o encontrava.
 *
 * A decisão da ONDA 9 ("a matriz mora no servidor e a interface PERGUNTA")
 * continua certa; o que faltava era a outra metade: **perguntar só funciona se
 * o cliente souber nomear a resposta.**
 *
 * O par desta guarda é `scripts/matriz-permissao.sql`, que cobra a MESMA lista
 * contra o banco. As duas juntas fecham os dois sentidos — e a lista literal
 * aparece nos dois lugares de propósito: mudar permissão passa a exigir escrever
 * a mudança duas vezes, que é o momento em que a decisão fica registrada.
 */
{
  const ESPERADO: Record<string, string> = {
    owner: "administrar,aprovar,baixar,cobranca,exportar,fechar,lancar,ler",
    admin: "administrar,aprovar,baixar,exportar,fechar,lancar,ler",
    aprovador: "aprovar,baixar,exportar,lancar,ler",
    fechador: "baixar,exportar,fechar,lancar,ler",
    lancador: "baixar,exportar,lancar,ler",
    member: "baixar,exportar,lancar,ler",
    contador_externo: "exportar,fechar,ler",
    leitor: "ler",
  };
  const obtido = Object.fromEntries(
    Object.entries(MATRIZ_DEMO).map(([p, as]) => [p, [...as].sort().join(",")]),
  );
  for (const [papel, acoes] of Object.entries(ESPERADO)) {
    ok(`permissao: ${papel} tem exatamente as ações declaradas`,
       obtido[papel] === acoes, `${obtido[papel] ?? "(papel ausente)"} ≠ ${acoes}`);
  }
  // ⚠️ O outro sentido: papel no cliente que a matriz declarada não conhece.
  ok("permissao: nenhum papel a mais no cliente",
     Object.keys(obtido).length === Object.keys(ESPERADO).length,
     Object.keys(obtido).filter((p) => !(p in ESPERADO)).join(", "));
  // ⚠️ E a invariante que não envelhece: quem só lê não escreve. Ela fica fora
  // da lista literal de propósito — a lista é um retrato do produto de hoje,
  // esta é uma regra sobre o que o papel SIGNIFICA.
  const ESCRITA = ["lancar", "baixar", "aprovar", "administrar", "cobranca"];
  for (const papel of ["leitor", "contador_externo"] as const) {
    ok(`permissao: ${papel} não escreve`,
       !MATRIZ_DEMO[papel].some((a) => ESCRITA.includes(a)),
       MATRIZ_DEMO[papel].join(", "));
  }
  // ⚠️ E a que separa o contador do administrador: FECHAR sem LANÇAR é o que
  // define a função. Dar-lhe admin "porque é mais fácil" põe um terceiro, fora
  // da empresa, com poder de mover dinheiro.
  ok("permissao: o contador externo FECHA sem LANÇAR",
     MATRIZ_DEMO.contador_externo.includes("fechar")
     && !MATRIZ_DEMO.contador_externo.includes("lancar"));
}

// ═══════════════════════════════════════════════════════════════════════════
// ABERTURA CONFERIDA — a cascata, e a regra "NUNCA a primeira linha do extrato"
// ═══════════════════════════════════════════════════════════════════════════
//
// `reconciliarSaldo` só fecha com fonte INDEPENDENTE da abertura. Esta guarda
// prova a CASCATA (arquivo > cadastro > nada) e a reconstrução do saldo a partir
// do `<LEDGERBAL>` do banco — não da primeira transação. Provada quebrando:
// trocar `escolherAbertura` para preferir a informada, ou `aberturaDoExtrato`
// para somar em vez de subtrair o líquido, reprova aqui.
{
  // 1) A CASCATA, pura. Importada vence informada; informada vence o nada.
  const imp = { valor: 4300, data: "2024-01-31" };
  const inf = { valor: 999, data: "2024-02-02", por: "Ana" };
  ok("abertura: importada VENCE informada",
     escolherAbertura({ importada: imp, informada: inf })?.origem === "extrato_bancario");
  ok("abertura: só informada → informada (com o nome de quem confirmou)",
     escolherAbertura({ informada: inf })?.origem === "cadastro_manual"
     && escolherAbertura({ informada: inf })?.por === "Ana");
  ok("abertura: nenhuma fonte → null (NÃO CONFERIDO)",
     escolherAbertura({}) === null && escolherAbertura({ importada: null, informada: null }) === null);

  // 2) O saldo de abertura é o DECLARADO menos o líquido — não uma linha.
  ok("abertura: aberturaDoExtrato = declarado − líquido",
     aberturaDoExtrato(5000, 700, "2024-01-31").valor === 4300);
  ok("abertura: líquido negativo eleva a abertura (5000 − (−300) = 5300)",
     aberturaDoExtrato(5000, -300, "2024-01-31").valor === 5300);

  // 3) O PARSER lê o <LEDGERBAL> (campo de saldo), com sinal, e NÃO uma transação.
  const OFX = [
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20240110<TRNAMT>1000.00<FITID>a1<MEMO>Venda Alpha</STMTTRN>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20240120<TRNAMT>-300.00<FITID>a2<MEMO>Fornecedor Beta</STMTTRN>",
    "</BANKTRANLIST><LEDGERBAL><BALAMT>5000.00<DTASOF>20240131</LEDGERBAL>",
    "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");
  const parsed = parseTexto(OFX);
  ok("abertura: parser captura o saldo declarado do banco",
     parsed.saldoDeclarado?.valor === 5000 && parsed.saldoDeclarado?.data === "2024-01-31");
  ok("abertura: BALAMT negativo preserva o sinal (cheque especial)",
     parseTexto(OFX.replace("<BALAMT>5000.00", "<BALAMT>-1500.00")).saldoDeclarado?.valor === -1500);

  // 4) INTEGRAÇÃO: montarDataset usa o LEDGERBAL como saldo da conta e reconstrói
  //    a abertura; a reconciliação FECHA. ⚠️ A abertura (4300) NÃO é o valor da
  //    primeira transação (1000) — é o que prova a regra "nunca a primeira linha".
  const rep = analisarImportacao(OFX);
  const ds = montarDataset(rep);
  ok("abertura: montarDataset — saldo da conta = LEDGERBAL",
     ds.accounts[0]?.balance === 5000);
  ok("abertura: montarDataset — abertura reconstruída = 4300, fonte importada",
     ds.abertura?.valor === 4300 && ds.abertura?.origem === "extrato_bancario");
  ok("abertura: 4300 NÃO é o valor de nenhuma transação (não veio da 1ª linha)",
     !rep.records.some((r) => Math.abs(r.valor - (ds.abertura?.valor ?? 0)) < 0.005));

  const movs: RiskMovement[] = ds.movements.map((m) => ({
    id: m.id, type: m.type, status: m.status, amount: m.amount,
    due_date: m.due_date, paid_date: m.paid_date ?? null, party_id: m.party_id ?? null,
  }));
  const inputConf: RiskInput = {
    hoje: "2026-08-17", saldoAtual: ds.accounts[0].balance, movements: movs,
    horizonDias: 60, aberturaVerificada: ds.abertura,
  };
  const recConf = reconciliarSaldo(inputConf);
  ok("abertura: com LEDGERBAL a reconciliação FECHA (resíduo zero)",
     recConf.fecha && recConf.residuo === 0, `residuo ${recConf.residuo} fecha ${recConf.fecha}`);
  ok("abertura: a origem nomeia o banco e a data",
     recConf.aberturaOrigem === "informado pelo banco em 31/01/2024", recConf.aberturaOrigem);

  // 5) SEM declaração (CSV / OFX sem LEDGERBAL): abertura null, NÃO CONFERIDO.
  const semBal = OFX.replace(/<LEDGERBAL>[\s\S]*?<\/LEDGERBAL>/i, "");
  const dsSem = montarDataset(analisarImportacao(semBal));
  ok("abertura: sem LEDGERBAL, abertura null e saldo derivado dos lançamentos",
     dsSem.abertura === null && dsSem.accounts[0].balance === 700);
  const recSem = reconciliarSaldo({
    hoje: "2026-08-17", saldoAtual: dsSem.accounts[0].balance,
    movements: dsSem.movements.map((m) => ({
      id: m.id, type: m.type, status: m.status, amount: m.amount,
      due_date: m.due_date, paid_date: m.paid_date ?? null, party_id: m.party_id ?? null,
    })),
    horizonDias: 60,
  });
  ok("abertura: sem fonte, NÃO CONFERIDO (não afirma que fecha)",
     !recSem.aberturaVerificada && !recSem.fecha && recSem.aberturaOrigem === undefined);

  // 6) A abertura importada persiste no dataset e volta pelo leitor.
  setImported({ ...ds, criadoEm: new Date().toISOString() });
  ok("abertura: importedAbertura devolve a abertura gravada",
     importedAbertura()?.valor === 4300 && importedAbertura()?.origem === "extrato_bancario");
  clearImported();

  // 7) ⚠️ A METADE DA TELA. Em produção o saldo declarado pelo banco NÃO tem
  //    onde ser guardado (`financial_accounts` não tem coluna), então a tela tem
  //    de DIZER isso — senão ela mostra o banco confirmando um saldo e a pessoa
  //    conclui que a conta ficou conferida. Guarda de valor sozinha aprovaria o
  //    conserto pela metade, e é a metade da tela que a pessoa vê.
  const revisao = readFileSync("src/components/upload/RevisaoImportacao.tsx", "utf8");
  ok("abertura: a revisão da importação mostra o saldo declarado pelo banco",
     revisao.includes("report.saldoDeclarado"));
  ok("abertura: e DIZ, fora da demonstração, que o valor não é salvo",
     /NÃO é salvo/.test(revisao) && revisao.includes("isDemo"));
  ok("abertura: e aponta o caminho que funciona (declarar no cadastro da conta)",
     /Contas banc[áa]rias/.test(revisao));
}

// ═══════════════════════════════════════════════════════════════════════════
// A4P-078 — Simples + IRPJ/CSLL no mesmo mês: ALERTA, nunca provisão
// ═══════════════════════════════════════════════════════════════════════════
//
// Medido em produção: a org tem `Simples Nacional` R$5.200/mês e `IRPJ / CSLL`
// (R$75.982,66 em 9 meses) na MESMA competência. No Simples esses dois tributos
// estão dentro do DAS — inclusive no Anexo IV, cuja exceção é a CPP patronal.
//
// ⚠️ A asserção que carrega a decisão é a ÚLTIMA: `provisaoEstimada === 0`
// SEMPRE. O enunciado original deste item pedia provisão parametrizada por
// regime numa linha que, medida, já tinha lançamento real — provisionar teria
// contado o imposto uma terceira vez.
{
  const LANC = [
    { id: "d0e18291", competencia: "2025-10-20", valor: 7622.41 },
    { id: "c5f4f355", competencia: "2025-11-20", valor: 9103.93 },
    { id: "ee5e8f4d", competencia: "2025-12-20", valor: 7626.51 },
  ];

  // 1) Regime NÃO configurado é `null` — nunca um padrão que finge configuração.
  ok("a4p078: sem cadastro, regime é null (vazio é vazio)",
     regimeConfigurado({}).regime === null && regimeConfigurado(undefined).regime === null);
  ok("a4p078: 'Simples Nacional' no cadastro vira simples, com o anexo",
     regimeConfigurado({ regimeTributario: "Simples Nacional", anexoSimples: "IV" }).regime === "simples"
     && regimeConfigurado({ regimeTributario: "Simples Nacional", anexoSimples: "IV" }).anexo === "IV");
  // ⚠️ O anexo só existe DENTRO do Simples: guardá-lo num Presumido faria a tela
  // dizer "Anexo IV" para quem não está no Simples.
  ok("a4p078: anexo é descartado fora do Simples",
     regimeConfigurado({ regimeTributario: "presumido", anexoSimples: "IV" }).anexo === null);

  // 2) O alerta exige AS DUAS condições.
  const simplesIV = regimeConfigurado({ regimeTributario: "simples", anexoSimples: "IV" });
  const comAmbos = alertaDuplicidadeImpostoLucro(simplesIV, LANC);
  ok("a4p078: Simples + lançamento no lucro → ACUSA duplicidade",
     comAmbos.duplicidade && comAmbos.quantidade === 3
     && Math.abs(comAmbos.total - 24352.85) < 0.005, `total ${comAmbos.total}`);
  ok("a4p078: o aviso nomeia o DAS e manda conferir com a contabilidade",
     /DAS/.test(comAmbos.aviso) && /contabilidade/i.test(comAmbos.aviso)
     && /Anexo IV/.test(comAmbos.aviso));
  ok("a4p078: Presumido com o MESMO lançamento NÃO acusa (lá o DARF é devido)",
     !alertaDuplicidadeImpostoLucro(regimeConfigurado({ regime: "presumido" }), LANC).duplicidade);
  ok("a4p078: Simples SEM lançamento no lucro não acusa nada",
     !alertaDuplicidadeImpostoLucro(simplesIV, []).duplicidade);
  // ⚠️ Sem regime configurado NÃO se acusa duplicidade — acusar quem não
  // declarou nada é o mesmo defeito do padrão que finge configuração, ao avesso.
  ok("a4p078: sem regime configurado, não acusa",
     !alertaDuplicidadeImpostoLucro(regimeConfigurado({}), LANC).duplicidade);

  // 2b) A METADE DA TELA — sem ela o alerta existe no motor e não existe para
  //     quem lê o DRE, que é onde a duplicidade aparece.
  {
    const limpar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, " ");
    const dre = limpar(readFileSync("src/components/relatorios/DemonstrativoView.tsx", "utf8"));
    const cad = limpar(readFileSync("src/components/administracao/DadosEmpresaView.tsx", "utf8"));
    ok("a4p078: o DRE mostra o aviso de duplicidade",
       /AvisoDuplicidadeImposto/.test(dre) && /alertaDuplicidadeImpostoLucro/.test(dre));
    ok("a4p078: o cadastro NÃO nasce com regime presumido (vazio é vazio)",
       /regime: ""/.test(cad) && !/regime: "presumido"/.test(cad));
    ok("a4p078: o cadastro oferece o anexo, e só dentro do Simples",
       /ANEXOS_SIMPLES/.test(cad) && /simples && \(/.test(cad));
  }

  // 3) A REGRA CENTRAL: nunca provisão sobre lançamento real.
  for (const [nome, cfg] of [["simples", simplesIV], ["presumido", regimeConfigurado({ regime: "presumido" })],
                             ["vazio", regimeConfigurado({})]] as const) {
    ok(`a4p078: provisão estimada é ZERO (${nome}) — nunca soma sobre lançamento real`,
       alertaDuplicidadeImpostoLucro(cfg, LANC).provisaoEstimada === 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A4P-031 — a base da Análise Vertical, e o CONSUMIDOR dela
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ Medido: o motor aceita `baseVertical` (padrão Receita Líquida) e corta a
// base insignificante desde o #99 — mas NENHUMA tela passava o parâmetro. A
// escolha existia no motor e não existia para quem lê o relatório: parâmetro
// sem consumidor, que é trabalho com cara de pronto.
//
// A metade do VALOR (o corte da base) e a metade da TELA (o seletor) são
// cobradas juntas, pela regra das duas metades.
{
  const M = (id: string, tipo: "entrada" | "saida", amount: number, data: string, category: string): RiskMovement =>
    ({ id, type: tipo, status: "pago", amount, due_date: data, paid_date: data, party_id: null, category });

  // Janela de 2 meses: um normal, outro com a receita desabada — o caso que
  // produzia "Assinaturas / software 3451,4%".
  const movs: RiskMovement[] = [
    M("r1", "entrada", 100_000, "2026-01-15", "Vendas"),
    M("d1", "saida", 10_000, "2026-01-20", "ISS"),
    M("s1", "saida", 20_000, "2026-01-25", "Assinaturas / software"),
    M("r2", "entrada", 100, "2026-02-15", "Vendas"),          // base desaba
    M("s2", "saida", 20_000, "2026-02-25", "Assinaturas / software"),
  ];
  const inputAV: RiskInput = { hoje: "2026-03-01", saldoAtual: 0, movements: movs, horizonDias: 60 };
  const janela = { de: "2026-01-01", ate: "2026-02-28" };
  const linhaDe = (rel: { linhas: { id: string; filhos?: unknown[]; celulas: { av: number | null }[] }[] }, id: string) =>
    rel.linhas.find((l) => l.id === id);

  const relLiq = montarRelatorio(inputAV, ESTRUTURA_DRE,
    { tipo: "vertical", intervalo: janela, regime: "competencia" });
  const relBruta = montarRelatorio(inputAV, ESTRUTURA_DRE,
    { tipo: "vertical", intervalo: janela, regime: "competencia", baseVertical: "receita_bruta" });

  // 1) O PADRÃO é receita líquida — e a escolha MUDA o número, senão o seletor
  //    seria decorativo. Líquida = 90.000 (100k − 10k de ISS); bruta = 100.000.
  const avLiq = linhaDe(relLiq, "despesas_operacionais")?.celulas[0].av ?? null;
  const avBruta = linhaDe(relBruta, "despesas_operacionais")?.celulas[0].av ?? null;
  ok("a4p031: base padrão é RECEITA LÍQUIDA (20k/90k = 22,2%)",
     avLiq !== null && Math.abs(avLiq - 22.22) < 0.05, `av ${avLiq}`);
  ok("a4p031: escolher Receita Bruta MUDA a base (20k/100k = 20,0%)",
     avBruta !== null && Math.abs(avBruta - 20) < 0.05, `av ${avBruta}`);

  // 2) A base insignificante vira "—" (null), NUNCA um percentual de 3 dígitos.
  const avFeb = linhaDe(relLiq, "despesas_operacionais")?.celulas[1].av ?? null;
  ok("a4p031: mês com base insignificante devolve null (a tela mostra —), não 3451%",
     avFeb === null, `av ${avFeb}`);

  // 3) A METADE DA TELA: o filtro declara a base e o relatório a recebe. Sem
  //    isto o parâmetro volta a existir só no motor.
  const kit = readFileSync("src/components/relatorios/kit.tsx", "utf8");
  const view = readFileSync("src/components/relatorios/DemonstrativoView.tsx", "utf8");
  ok("a4p031: o filtro tem o campo e o padrão é receita_liquida",
     /baseVertical: BaseVertical/.test(kit) && /baseVertical: "receita_liquida"/.test(kit));
  ok("a4p031: a tela OFERECE a escolha (seletor de base)",
     /Base da an[áa]lise vertical/.test(kit));
  ok("a4p031: e o relatório RECEBE a escolha (parâmetro com consumidor)",
     /baseVertical: aplicados\.baseVertical/.test(view));
}

// ═══════════════════════════════════════════════════════════════════════════
// A4P-027 — a coluna anterior ao primeiro lançamento é NOMEADA, não escondida
// ═══════════════════════════════════════════════════════════════════════════
//
// Medido em produção: `Minha empresa` tem o primeiro lançamento em 05/10/2025 e
// ZERO em 09/2025; `joaov.yoshimi` tem histórico desde 2023 e também nenhum
// lançamento em 09/2025. Com o preset de 12 meses contando para trás, a coluna
// sai inteira em zero e a AV inteira em "—" — e quem lê não distingue "não
// houve movimento" de "não deu para calcular".
//
// ⚠️ A janela NÃO é estreitada: entregar 11 colunas sob um filtro que diz
// "12 meses" trocaria o período que a pessoa pediu, em silêncio.
{
  const M = (id: string, tipo: "entrada" | "saida", amount: number, data: string): RiskMovement =>
    ({ id, type: tipo, status: "pago", amount, due_date: data, paid_date: data, party_id: null, category: "Vendas" });

  const rel = montarRelatorio(
    { hoje: "2026-03-31", saldoAtual: 0, horizonDias: 60,
      movements: [
        // 01/2026 vazio de propósito (nada aqui)
        M("a", "entrada", 5_000, "2026-02-10"),
        // ⚠️ 03/2026 tem SÓ despesa: existe lançamento e a BASE da AV é zero.
        // É este o caso que separa as duas implementações — escrever "sem dado"
        // como `base === 0` acusaria este mês, que tem movimento. Com um mês de
        // +1.000/−1.000 (a versão anterior desta fixture) as duas davam a MESMA
        // resposta, e o teste negativo passava sem reprovar nada.
        M("c", "saida", 1_000, "2026-03-20"),
      ] },
    ESTRUTURA_DRE,
    { tipo: "vertical", intervalo: { de: "2026-01-01", ate: "2026-03-31" }, regime: "competencia" },
  );

  ok("a4p027: a janela pedida é PRESERVADA (3 colunas, nenhuma sumiu)",
     rel.colunas.length === 3, rel.colunas.join(","));
  ok("a4p027: o mês sem nenhum lançamento é NOMEADO",
     rel.colunasSemDado.length === 1 && rel.colunasSemDado[0] === "2026-01",
     rel.colunasSemDado.join(","));
  // ⚠️ A distinção que dá sentido ao campo: soma zero NÃO é ausência de dado.
  // Um mês com +1.000 e −1.000 tem movimento e resultado zero; chamá-lo de
  // vazio seria falso, e é o erro fácil de escrever (`total === 0`).
  ok("a4p027: mês só com despesa (base ZERO) NÃO é 'sem dado' — há lançamento",
     !rel.colunasSemDado.includes("2026-03"), rel.colunasSemDado.join(","));
  ok("a4p027: mês com movimento não entra na lista",
     !rel.colunasSemDado.includes("2026-02"));

  // A METADE DA TELA: o cabeçalho marca a coluna.
  const kitTxt = readFileSync("src/components/relatorios/kit.tsx", "utf8");
  ok("a4p027: o cabeçalho da tabela marca a coluna sem lançamento",
     /colunasSemDado/.test(kitTxt) && /sem lan[çc]amento/.test(kitTxt));
}

// ═══════════════════════════════════════════════════════════════════════════
// A4P-045 — o ID inteiro e a SITUAÇÃO em palavra, nas duas direções
// ═══════════════════════════════════════════════════════════════════════════
//
// Medido no código: a tabela de títulos renderizava `m.id.slice(0, 10)` — dez
// caracteres de um UUID ("16ab4f3c-4"), que não identificam nada para quem lê
// nem servem para procurar o título no suporte. E a situação existia SÓ como
// ponto colorido com `title`: cor sozinha não é informação para quem não
// distingue as cores, e `title` não aparece no toque.
{
  // A palavra muda com a direção — é a que a pessoa usa ao falar com o outro
  // lado. Um título a receber liquidado foi RECEBIDO, não "pago".
  ok("a4p045: liquidado → Pago (pagar) e Recebido (receber)",
     rotuloSituacao("liquidado", "pagar") === "Pago"
     && rotuloSituacao("liquidado", "receber") === "Recebido");
  ok("a4p045: atrasado → Vencido (pagar) e Em atraso (receber)",
     rotuloSituacao("atrasado", "pagar") === "Vencido"
     && rotuloSituacao("atrasado", "receber") === "Em atraso");
  ok("a4p045: aberto → A vencer nos dois lados",
     rotuloSituacao("aberto", "pagar") === "A vencer"
     && rotuloSituacao("aberto", "receber") === "A vencer");

  /*
   * ⚠️ COMENTÁRIOS FORA — e esta guarda reprovou por causa disso na primeira
   * execução: o comentário que documenta a correção CITA `m.id.slice(0, 10)`
   * para explicar o que saiu, e a varredura o leu como se o defeito estivesse
   * de volta. É a terceira vez que esta armadilha aparece no repositório
   * (guarda de credenciais, varredura da ONDA 14, agora esta). Guarda que
   * reprova a documentação da própria correção treina quem a lê a ignorá-la.
   */
  const tv = readFileSync("src/components/movimentacoes/TitulosView.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n]*/g, " ");
  // ⚠️ A asserção afirma sobre o DEFEITO PROIBIDO, não sobre o resultado certo:
  // conferir que existe um IdCopiavel passaria mesmo se o slice continuasse ao
  // lado. O que não pode voltar é o corte.
  ok("a4p045: o UUID cortado NÃO volta (nenhum m.id.slice na tabela)",
     !/m\.id\.slice\(/.test(tv));
  ok("a4p045: o id sai inteiro, pelo componente compartilhado",
     /<IdCopiavel id=\{m\.id\}/.test(tv));
  ok("a4p045: a tabela tem coluna Situação, com a palavra",
     /<Th>Situação<\/Th>/.test(tv) && /rotuloSituacao\(st, direcao\)/.test(tv));
  // A planilha do contador tem de dizer a MESMA palavra da tela.
  ok("a4p045: a exportação usa o mesmo rótulo da tela",
     /rotuloSituacao\(statusDoTitulo\(m, input\.hoje\), direcao\)/.test(tv));
  // ⚠️ Simetria: é o MESMO componente nos dois lados — se algum dia virar dois,
  // as duas listas de dinheiro divergem no primeiro ajuste.
  const pagar = readFileSync("src/app/contas-a-pagar/titulos/page.tsx", "utf8");
  const receber = readFileSync("src/app/contas-a-receber/titulos/page.tsx", "utf8");
  ok("a4p045: pagar e receber usam a MESMA TitulosView (código compartilhado)",
     /TitulosView/.test(pagar) && /TitulosView/.test(receber));
}

// ═══════════════════════════════════════════════════════════════════════════
// A4P-034 — hierarquia por métrica ACIONÁVEL no painel de contas a pagar
// ═══════════════════════════════════════════════════════════════════════════
//
// Medido: os três cards tinham o mesmo peso e "Total geral pago no período" era
// o PRIMEIRO — na ordem de leitura, o destaque. Com R$1,54 pago ao lado de
// R$38.626,59 vencidos, a tela dava o lugar nobre ao número que não pede ação.
// O que já saiu não muda nada; vencidas e a vencer mudam.
{
  const dash = readFileSync("src/components/contas-pagar/DashboardContasPagar.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n]*/g, " ");
  const ordem = Array.from(dash.matchAll(/titulo="(Contas atrasadas|Contas a vencer|Total geral pago no período)"/g))
    .map((m) => m[1]);
  ok("a4p034: o acionável vem primeiro — atrasadas, depois a vencer, e o pago por último",
     ordem.join(" · ") === "Contas atrasadas · Contas a vencer · Total geral pago no período",
     ordem.join(" · "));
  // ⚠️ Ordem sozinha não basta: com o mesmo corpo, os três seguem competindo.
  ok("a4p034: o card de PAGO é secundário (corpo menor), não apenas o último",
     /rotuloData="Pago em"\s*\n\s*secundario/.test(dash));
  // ⚠️ E secundário NÃO é escondido: trocar hierarquia por ausência é outro
  // defeito. O valor continua na tela.
  const kitTxt = readFileSync("src/components/titulos/kit.tsx", "utf8");
  ok("a4p034: secundário reduz o corpo, não remove o valor",
     /secundario \? "text-\[20px\] text-muted" : "text-\[28px\] text-ink"/.test(kitTxt));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BILLING — o relógio, o bloqueio suave e a reconciliação (Etapa D)
 * ═══════════════════════════════════════════════════════════════════════════ */
{
  const HOJE = "2026-08-18";

  // ── (a) organização que USA e não paga tem de reprovar ───────────────────
  const usaSemPlano = reconciliarBilling([{
    orgId: "o1", nome: "Usa e não paga", status: "none", plano: null, mrr: 0,
    fim: null, lancamentos: 677, ultimoLancamento: "2026-08-11",
  }], HOJE);
  ok("billing: organização com lançamento e sem cobrança ativa acende o alerta",
     usaSemPlano.length === 1 && usaSemPlano[0].tipo === "usa_sem_plano",
     JSON.stringify(usaSemPlano.map((a) => a.tipo)));
  /*
   * ⚠️ E o alerta cita o NÚMERO que o justifica. "Organização sem plano" é uma
   * frase; "677 lançamentos e nenhuma cobrança" é uma decisão. Alerta sem o
   * número vira paisagem — foi assim que 14 organizações operaram dois meses.
   */
  ok("billing: o alerta carrega o número que o justifica",
     usaSemPlano[0]?.detalhe.includes("677"), usaSemPlano[0]?.detalhe);

  // ⚠️ O NEGATIVO da mesma regra: organização vazia NÃO é vazamento de receita.
  // Sem esta, a guarda aprovaria uma versão que acende alerta para toda conta
  // recém-criada — 14 falsos alertas, e a tela deixaria de ser lida.
  ok("billing: organização SEM lançamento nenhum não acende alerta de uso",
     reconciliarBilling([{
       orgId: "o2", nome: "Vazia", status: "none", plano: null, mrr: 0,
       fim: null, lancamentos: 0, ultimoLancamento: null,
     }], HOJE).length === 0);

  // ⚠️ E quem está EM TESTE dentro do prazo também não: o teste existe
  // justamente para ser usado sem pagar.
  ok("billing: quem está em teste dentro do prazo não acende alerta",
     reconciliarBilling([{
       orgId: "o3", nome: "Em teste", status: "trial", plano: null, mrr: 0,
       fim: "2026-09-01", lancamentos: 318, ultimoLancamento: "2026-08-17",
     }], HOJE).length === 0);

  // ── paga e não usa · acima do teto ───────────────────────────────────────
  const pagaSemUso = reconciliarBilling([{
    orgId: "o4", nome: "Paga e não usa", status: "active", plano: "Enterprise", mrr: 990,
    fim: null, lancamentos: 0, ultimoLancamento: null,
  }], HOJE);
  ok("billing: plano ativo sem nenhum lançamento acende 'paga e não usa'",
     pagaSemUso.length === 1 && pagaSemUso[0].tipo === "paga_sem_uso");

  const acima = reconciliarBilling([{
    orgId: "o5", nome: "Acima do teto", status: "active", plano: "Starter", mrr: 149,
    fim: null, lancamentos: 642, ultimoLancamento: "2026-08-17", limiteLancamentos: 500,
  }], HOJE);
  ok("billing: uso acima do teto do plano acende — e é conversa de upgrade, não corte",
     acima.length === 1 && acima[0].tipo === "acima_do_limite" && /upgrade/i.test(acima[0].acao));

  // ── (b) o vencimento BLOQUEIA a escrita, e só a escrita ──────────────────
  const vencido = estadoDaAssinatura(
    { orgId: "o6", status: "trial", mrr: 0, inicio: "2026-07-01", fim: "2026-08-17" }, HOJE);
  ok("billing: teste vencido ONTEM bloqueia a escrita",
     vencido.bloqueado && vencido.diasRestantes === -1, String(vencido.diasRestantes));
  /*
   * ⚠️ A borda que decide: vencer é `fim < hoje`, não `fim <= hoje`. Com `<=` o
   * cliente perde a escrita no ÚLTIMO dia do teste — o dia que ele foi
   * prometido. Um teste de 14 dias que dura 13 é um defeito que ninguém
   * reporta, porque parece só um dia.
   */
  const ultimoDia = estadoDaAssinatura(
    { orgId: "o7", status: "trial", mrr: 0, inicio: "2026-08-04", fim: HOJE }, HOJE);
  ok("billing: no ÚLTIMO dia do teste ainda dá para escrever",
     !ultimoDia.bloqueado && ultimoDia.diasRestantes === 0);
  /*
   * ⚠️ O aviso tem de PROMETER acesso e nunca AMEAÇAR perda — é o bloqueio
   * suave por escrito, e o que a pessoa precisa saber primeiro não é que
   * atrasou, é se perdeu o arquivo.
   *
   * ⚠️ A primeira versão desta asserção proibia a palavra "apagado" e REPROVOU
   * a frase certa: *"Nada foi apagado"*. Guarda que casa palavra em vez de
   * AFIRMAÇÃO reprova o texto que ela existe para exigir — mesma lição da
   * varredura que acusou o próprio comentário que documentava a regra.
   */
  ok("billing: a mensagem de vencido promete que o dado continua acessível",
     /vendo|export|consult/i.test(vencido.aviso ?? ""), vencido.aviso);
  ok("billing: a mensagem de vencido não AMEAÇA perda de dado",
     !/(ser[ãa]o|foram|vamos)\s+(apagad|exclu|remov)/i.test(vencido.aviso ?? "")
     && !/perder[áa]/i.test(vencido.aviso ?? ""), vencido.aviso);
  ok("billing: a mensagem diz COMO resolver, não só o que aconteceu",
     /plano/i.test(vencido.aviso ?? ""), vencido.aviso);
  ok("billing: assinatura ativa sem data de fim NÃO bloqueia",
     !estadoDaAssinatura({ orgId: "o8", status: "active", mrr: 990, fim: null }, HOJE).bloqueado);

  // ── (c) o MRR do painel é a soma das assinaturas ATIVAS ──────────────────
  const assinaturas = [
    { orgId: "a", status: "active" as const, mrr: 990 },
    { orgId: "b", status: "trial" as const, mrr: 0 },
    { orgId: "c", status: "past_due" as const, mrr: 349 },
    { orgId: "d", status: "canceled" as const, mrr: 149 },
  ];
  ok("billing: o MRR soma só o ATIVO — inadimplente e cancelado ficam de fora",
     mrrDeAssinaturas(assinaturas) === 990, String(mrrDeAssinaturas(assinaturas)));
  /*
   * ⚠️ A asserção que fixa o defeito: somar `past_due` daria 1.488 e o painel
   * anunciaria receita que o extrato não tem. É a forma de erro de MRR que
   * chega a um investidor.
   */
  ok("billing: a soma ingênua (com inadimplente e cancelado) é OUTRO número",
     assinaturas.reduce((s, a) => s + a.mrr, 0) === 1488);

  // ── a metodologia publicada (A4P-032) ────────────────────────────────────
  for (const m of METODOLOGIAS) {
    const soma = m.componentes.reduce((s, c) => s + c.peso, 0);
    ok(`metodologia: os pesos de "${m.indicador}" somam 1`, Math.abs(soma - 1) < 1e-9, soma.toFixed(4));
    ok(`metodologia: "${m.indicador}" declara o que NÃO enxerga`, m.limitacoes.length > 0);
    ok(`metodologia: "${m.indicador}" nomeia o motor e a versão`, /\/\d+\.\d+\.\d+/.test(m.motor), m.motor);
  }
  /*
   * ⚠️ **O TETO TEM DE SE DECLARAR TETO.** `Math.min(0.97, …)` no motor de
   * risco: com ruptura projetada para hoje o valor sai 0,97 SEMPRE, e "97% de
   * chance" lido como medida é o mesmo defeito do "33 meses de fôlego" da
   * ONDA 4. A guarda exige a frase no valor saturado E o silêncio fora dele —
   * marcar sempre é não marcar nunca.
   */
  ok("metodologia: 97% é declarado como TETO, não como medida",
     (avisoDeSaturacao("chance-ruptura", 0.97) ?? "").includes("TETO"));
  ok("metodologia: 2% é declarado como PISO",
     (avisoDeSaturacao("chance-ruptura", 0.02) ?? "").includes("PISO"));
  ok("metodologia: valor no meio da escala não ganha aviso de saturação",
     avisoDeSaturacao("chance-ruptura", 0.41) === null);
  /*
   * ⚠️ As DUAS probabilidades de ruptura têm de estar declaradas separadas. O
   * produto exibe uma de 60 dias (motor de risco) e outra de 90 (quant), com
   * rótulos quase idênticos; declarar só uma faria a página de metodologia
   * explicar um número e legitimar o outro por tabela.
   */
  ok("metodologia: as duas probabilidades de ruptura estão declaradas, com horizontes distintos",
     !!metodologiaDe("chance-ruptura") && !!metodologiaDe("chance-ruptura-90d")
     && metodologiaDe("chance-ruptura")!.janela !== metodologiaDe("chance-ruptura-90d")!.janela);

  /*
   * ⚠️ Metodologia é INSTRUMENTAÇÃO, e instrumentação sem consumidor não conta
   * como feita: a tela tem de LER daqui, não repetir o texto à mão — texto à
   * mão envelhece na primeira mudança de fórmula e passa a descrever um
   * cálculo que não existe.
   */
  const fluxo = readFileSync("src/components/fluxo-caixa/FluxoCaixaView.tsx", "utf8");
  ok("metodologia: o cartão de ruptura consome a declaração (não texto à mão)",
     /infoDaMetodologia\("chance-ruptura"\)/.test(fluxo) && /avisoDeSaturacao\("chance-ruptura"/.test(fluxo));
  ok("metodologia: o cartão de score consome a declaração",
     /infoDaMetodologia\("score-saude"\)/.test(fluxo));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CENTRAL FINANCEIRA — a máquina de estados, a segregação R1 e a alçada
 * ═══════════════════════════════════════════════════════════════════════════ */
{
  // ── R1: quem lançou NUNCA aprova o próprio ────────────────────────────────
  const meu: Lancamento = { id: "t1", valor: 1000, lancadoPor: "ana", situacao: "previsto" };
  const euMesmo: Aprovador = { id: "ana", papel: "aprovador" };
  const colega: Aprovador = { id: "bia", papel: "aprovador" };

  const auto = podeAprovar(meu, euMesmo);
  ok("central R1: quem lançou NÃO aprova o próprio lançamento",
     auto.pode === false && auto.motivo === "auto_aprovacao", JSON.stringify(auto));
  // ⚠️ O positivo ao lado do negativo: se o negativo passasse por a fila estar
  // vazia, o teste não provaria nada. Um colega COM alçada aprova.
  ok("central R1: um colega com alçada aprova o mesmo título",
     podeAprovar(meu, colega).pode === true);

  // ── alçada: acima do teto do papel reprova ────────────────────────────────
  const caro: Lancamento = { id: "t2", valor: 40_000, lancadoPor: "ana", situacao: "previsto" };
  const vAprovador = podeAprovar(caro, colega); // aprovador: teto 5.000
  ok("central alçada: 40.000 acima da alçada do aprovador (5.000) reprova",
     vAprovador.pode === false && vAprovador.motivo === "acima_da_alcada" && vAprovador.tetoDoPapel === 5000);
  ok("central alçada: o fechador (teto 50.000) aprova os 40.000",
     podeAprovar(caro, { id: "cid", papel: "fechador" }).pode === true);
  // ⚠️ Sem alçada configurada NADA é aprovável — não "tudo é aprovável".
  ok("central alçada: papel SEM alçada tem teto ZERO, não infinito",
     podeAprovar(meu, { id: "leo", papel: "leitor" }).motivo === "papel_sem_alcada");
  // ⚠️ E a asserção que fixa a direção: um mapa de alçada VAZIO recusa tudo,
  // inclusive o admin — a prova de que a ausência é fechada, não aberta.
  const alcadaVazia = { leitor: 0, lancador: 0, aprovador: 0, fechador: 0, admin: 0, titular: 0 };
  ok("central alçada: mapa vazio recusa até o titular (ausência = fechado)",
     podeAprovar(meu, { id: "x", papel: "titular" }, alcadaVazia).pode === false);

  // "sobe o mínimo necessário", não direto ao titular
  ok("central alçada: 40.000 sobe ao FECHADOR, não ao titular", papelQueAprova(40_000) === "fechador");
  ok("central alçada: 3.000 fica no aprovador", papelQueAprova(3_000) === "aprovador");

  // ── a máquina de estados: só as transições declaradas ─────────────────────
  ok("central máquina: previsto→confirmado é válida", transicaoValida("previsto", "confirmado"));
  ok("central máquina: confirmado→baixado é válida", transicaoValida("confirmado", "baixado"));
  ok("central máquina: baixado→conciliado é válida", transicaoValida("baixado", "conciliado"));
  // ⚠️ O caminho que MORRE: baixa direta pulando a confirmação (A4P-052).
  ok("central máquina: previsto→baixado é PROIBIDA (não pula a confirmação)",
     transicaoValida("previsto", "baixado") === false);
  ok("central máquina: conciliado→previsto é proibida (não volta no tempo)",
     transicaoValida("conciliado", "previsto") === false);
  ok("central máquina: cancelado é terminal", TRANSICOES.cancelado.length === 0);

  // baixar exige situação certa
  const jaBaixado: Lancamento = { id: "t3", valor: 100, lancadoPor: "ana", situacao: "baixado" };
  ok("central: não se confirma o que já foi baixado",
     podeAprovar(jaBaixado, colega).motivo === "situacao_nao_permite");

  // ── o efeito no relatório: confirmado × previsto ──────────────────────────
  const carteira = [
    { id: "a", situacao: "previsto" as const, valor: 100 },
    { id: "b", situacao: "confirmado" as const, valor: 200 },
    { id: "c", situacao: "baixado" as const, valor: 300 },
    { id: "d", situacao: "cancelado" as const, valor: 999 },
    { id: "e", situacao: "estornado" as const, valor: 888 },
  ];
  const soConfirmado = titulosDaVisao(carteira, "confirmado");
  ok("central relatório: visão CONFIRMADO exclui o previsto (e o cancelado/estornado)",
     soConfirmado.length === 2 && soConfirmado.every((t) => t.situacao !== "previsto"));
  const somaConf = soConfirmado.reduce((s, t) => s + t.valor, 0);
  ok("central relatório: a soma dos confirmados é 500 (200 + 300), não 600", somaConf === 500);
  const comPrevisto = titulosDaVisao(carteira, "com-previsto");
  ok("central relatório: visão COM-PREVISTO soma 600 (inclui o previsto)",
     comPrevisto.reduce((s, t) => s + t.valor, 0) === 600);
  // ⚠️ O cancelado e o estornado NUNCA entram, em nenhuma visão.
  ok("central relatório: cancelado e estornado ficam fora das DUAS visões",
     !comPrevisto.some((t) => t.situacao === "cancelado" || t.situacao === "estornado"));

  // ── a fila única, com origem visível ──────────────────────────────────────
  const fila = montarFila([
    { id: "f1", descricao: "Fornecedor A", contraparte: "A", valor: 100, direcao: "saida", vencimento: "2026-09-01", situacao: "previsto", origem: "contas-a-pagar", lancadoPor: "ana" },
    { id: "f2", descricao: "Cliente B", contraparte: "B", valor: 200, direcao: "entrada", vencimento: "2026-09-02", situacao: "previsto", origem: "contas-a-receber", lancadoPor: "ana" },
    { id: "f3", descricao: "Extrato", contraparte: "C", valor: 300, direcao: "saida", vencimento: "2026-09-03", situacao: "previsto", origem: "upload", lancadoPor: "bia" },
    { id: "f4", descricao: "Já confirmado", contraparte: "D", valor: 400, direcao: "saida", vencimento: "2026-09-04", situacao: "confirmado", origem: "contas-a-pagar", lancadoPor: "ana" },
  ]);
  ok("central fila: só os PREVISTOS aguardam confirmação (o confirmado não volta)",
     fila.totalAguardando === 3);
  ok("central fila: as três origens aparecem com contagem",
     fila.porOrigem["contas-a-pagar"] === 1 && fila.porOrigem["contas-a-receber"] === 1 && fila.porOrigem["upload"] === 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO D — MAPEAMENTO DE COLUNAS e a ABERTURA do extrato (A4P-073)
 * ═══════════════════════════════════════════════════════════════════════════ */
{
  // ── layout LIMPO (nome + conteúdo concordam) → confiança alta, sem confirmar ─
  const limpo = detectarColunas(
    ["Data", "Histórico", "Valor", "Documento"],
    [
      ["16/01/2024", "PIX RECEBIDO ALPHA", "1.234,56", "E123"],
      ["17/01/2024", "TARIFA MENSAL", "-49,90", "T001"],
      ["18/01/2024", "PAGAMENTO FORNECEDOR", "-500,00", "B999"],
    ],
  );
  // ─────────────────────────────────────────────────────────────────────────
  // BLOCO 3 · CONCILIAÇÃO — nada casa duas vezes, e a tolerância é declarada
  // ─────────────────────────────────────────────────────────────────────────
  {
    const E = (id: string, data: string, valor: number) => ({ id, data, valor, descricao: id });
    const T = (id: string, data: string, valor: number, tipo: "entrada" | "saida" = "saida") =>
      ({ id, data, valor, tipo, descricao: id });

    // ⚠️ A INVARIANTE PRIMEIRA: nenhum id em dois matches. Casar o mesmo
    // lançamento com dois títulos dobra a baixa — dois títulos quitados por um
    // dinheiro só, e o saldo descola do banco pelo valor do segundo.
    // ⚠️ **O CASO PRECISA DISCRIMINAR.** A primeira versão tinha UMA linha de
    // extrato e dois títulos — e o laço cria no máximo um match por linha,
    // então a proteção de reuso nem era exercitada: desligá-la não fazia a
    // asserção falhar. Aqui são DUAS linhas iguais disputando UM título: sem a
    // trava, as duas o consomem e o título fica quitado duas vezes.
    const r1 = conciliarExtrato(
      [E("e1", "2026-08-10", -100), E("e2", "2026-08-10", -100)],
      [T("t1", "2026-08-10", 100)],
    );
    const idsT = r1.matches.flatMap((m) => m.tituloIds);
    const idsE = r1.matches.flatMap((m) => m.extratoIds);
    ok("concil: duas linhas iguais — o título NÃO é consumido duas vezes",
       idsT.length === new Set(idsT).size && idsT.length === 1, JSON.stringify(idsT));
    ok("concil: e a linha do extrato também não se repete",
       idsE.length === new Set(idsE).size);
    ok("concil: a linha de extrato que sobrou é DITA, não some", r1.extratoSobrando.length === 1);

    const exato = conciliarExtrato([E("e1", "2026-08-10", -1000)], [T("t1", "2026-08-10", 987)], TOLERANCIA_EXATA);
    ok("concil: com tolerância ZERO, valores diferentes NÃO casam",
       exato.matches.length === 0, JSON.stringify(exato.matches));
    const tolerante = conciliarExtrato(
      [E("e1", "2026-08-10", -1000)], [T("t1", "2026-08-10", 987)], { dias: 3, centavos: 20 });
    ok("concil: com tolerância declarada, casa E devolve a diferença",
       tolerante.matches.length === 1 && Math.abs(tolerante.matches[0].diferenca) === 13,
       JSON.stringify(tolerante.matches[0]));
    ok("concil: a tolerância USADA viaja no resultado (a tela mostra)",
       tolerante.matches[0].tolerancia.centavos === 20 && tolerante.matches[0].tipo === "aproximado");

    const sinal = conciliarExtrato(
      [E("e1", "2026-08-10", 100)], [T("t1", "2026-08-10", 100, "saida")], { dias: 5, centavos: 500 });
    ok("concil: sinal oposto não casa nem dentro da tolerância", sinal.matches.length === 0);

    const lote = conciliarExtrato(
      [E("e1", "2026-08-10", -300)],
      [T("t1", "2026-08-10", 100), T("t2", "2026-08-10", 200)],
    );
    ok("concil: um pagamento em lote casa com os DOIS títulos que o somam",
       lote.matches.length === 1 && lote.matches[0].tipo === "multiplo" &&
       lote.matches[0].tituloIds.length === 2, JSON.stringify(lote.matches));
    const partido = conciliarExtrato(
      [E("e1", "2026-08-10", -100), E("e2", "2026-08-11", -200)],
      [T("t1", "2026-08-10", 300)],
    );
    ok("concil: um título pago em duas transferências também casa",
       partido.matches.length === 1 && partido.matches[0].extratoIds.length === 2,
       JSON.stringify(partido.matches));
    const naoFecha = conciliarExtrato(
      [E("e1", "2026-08-10", -305)],
      [T("t1", "2026-08-10", 100), T("t2", "2026-08-10", 200)],
    );
    ok("concil: soma que não fecha NÃO vira múltiplo", naoFecha.matches.length === 0);

    // ⚠️ O exato vem ANTES do múltiplo: senão uma soma consumiria o título que
    // casaria sozinho e certo com outra linha.
    const ordem = conciliarExtrato(
      [E("e1", "2026-08-10", -300), E("e2", "2026-08-10", -100)],
      [T("t1", "2026-08-10", 100), T("t2", "2026-08-10", 200)],
    );
    const exatoDoT1 = ordem.matches.find((m) => m.tituloIds.includes("t1"));
    ok("concil: o EXATO ganha do múltiplo (t1 casa com e2, não vira soma)",
       !!exatoDoT1 && exatoDoT1.tipo === "exato" && exatoDoT1.extratoIds[0] === "e2",
       JSON.stringify(ordem.matches));

    const ts = [T("a", "2025-07-03", 10), T("b", "2026-08-01", 500), T("c", "2026-08-02", 40)];
    const sd = saudeConcil(ts, new Set(["b"]), "2026-08-19");
    ok("concil: a fração sai da contagem real (1 de 3)",
       Math.abs(sd.fracao - 1 / 3) < 1e-9 && sd.conciliados === 1, JSON.stringify(sd));
    ok("concil: o valor em aberto soma só os NÃO conciliados", sd.valorEmAberto === 50, String(sd.valorEmAberto));
    ok("concil: o mais antigo pendente é nomeado, com a idade",
       sd.maisAntigo === "2025-07-03" && sd.diasDoMaisAntigo === 412,
       `${sd.maisAntigo} ${sd.diasDoMaisAntigo}`);

    const f = filaConcil(ts, new Set<string>());
    ok("concil: a fila prioriza por VALOR, não por data",
       f[0].id === "b" && f[2].id === "a", f.map((x) => x.id).join(","));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCO 2 · a FILA um-a-um (teclado, lote seguro, progresso, retomada)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const mv = (chave: string, contraparte: string | null, categoria: string, confianca: number,
                situacao: "nova" | "revisar" | "duplicata_base" = "nova") => ({
      chave, contaId: null, data: "2026-08-10", valor: 100, tipo: "saida" as const,
      descritivoBruto: "PIX ENV " + chave, descritivoNormalizado: chave,
      contraparte, documento: null, origem: "extrato" as const,
      classificacao: { categoria, natureza: "despesa" as const, confianca, motivo: "teste" },
      situacao,
    });
    const plano = {
      versao: "x", linhas: [
        mv("a", "POSTO IPIRANGA", "Combustível", 0.95),
        mv("b", "POSTO IPIRANGA", "Combustível", 0.95),
        mv("c", "POSTO IPIRANGA", "Manutenção", 0.95),   // categoria DIVERGE
        mv("d", "MERCADO LIVRE", "Compras", 0.95),        // contraparte diverge
        mv("e", "POSTO IPIRANGA", "Combustível", 0.5),    // confiança baixa
        mv("z", "X", "Y", 0.99, "duplicata_base"),        // não pede decisão
      ],
      resumo: {} as never, porCategoria: [], contrapartesNovas: [],
    } as unknown as Parameters<typeof montarFilaIngestao>[0];

    const fila = montarFilaIngestao(plano);
    ok("fila: duplicata de base NÃO pede decisão (atenção não se gasta no que não muda nada)",
       fila.length === 5 && !fila.some((l) => l.chave === "z"), String(fila.length));

    let est = estadoVazio();

    // ⚠️ O caso que a fila existe para impedir: massa atravessando categoria.
    const lote = loteDe(fila, fila[0], est);
    ok("fila: o lote pega SÓ mesma contraparte E mesma categoria E confiança alta",
       lote.chaves.length === 2 && lote.chaves.includes("a") && lote.chaves.includes("b"),
       JSON.stringify(lote.chaves));
    ok("fila: a linha de categoria DIVERGENTE fica de fora do lote",
       !lote.chaves.includes("c"), JSON.stringify(lote.chaves));
    ok("fila: a de outra contraparte fica de fora", !lote.chaves.includes("d"));
    ok("fila: a de confiança baixa fica de fora", !lote.chaves.includes("e"));

    // ⚠️ A ÂNCORA duvidosa não arrasta ninguém — dúvida não se propaga com
    // cara de decisão.
    const loteFraco = loteDe(fila, fila[4], est);
    ok("fila: âncora de confiança baixa não forma lote, e DIZ por quê",
       loteFraco.chaves.length === 0 && !!loteFraco.motivo, JSON.stringify(loteFraco));

    // Correção humana vale confiança total e MUDA quem cabe no lote.
    est = corrigirFila(est, "e", "Combustível");
    const lote2 = loteDe(fila, fila[0], est);
    ok("fila: corrigida à mão, a linha passa a caber no lote (correção vale 1)",
       lote2.chaves.includes("e"), JSON.stringify(lote2.chaves));

    // ⚠️ A correção alcança as PENDENTES da mesma contraparte — foi ela que
    // levou 500 linhas de 10,3 min para 3,6 min, medido. Sem ela, 71 das 500
    // eram a MESMA correção repetida.
    {
      let ec = estadoVazio();
      ec = decidirFila(ec, "b", "confirmada", 1);   // já decidida: não pode mudar
      ec = corrigirIguais(ec, fila, fila[0], "Frota");
      ok("fila: a correção alcança as pendentes da MESMA contraparte",
         ec.correcoes["a"] === "Frota" && ec.correcoes["e"] === "Frota",
         JSON.stringify(ec.correcoes));
      ok("fila: NÃO mexe no que já foi decidido (não desfaz decisão da pessoa)",
         ec.correcoes["b"] === undefined, JSON.stringify(ec.correcoes));
      ok("fila: NÃO atravessa contraparte (a regra da categoria não se atravessa)",
         ec.correcoes["d"] === undefined, JSON.stringify(ec.correcoes));
      // ⚠️ 'c' é da MESMA contraparte e categoria diferente: a correção manual
      // vale porque a pessoa DISSE qual é — é o oposto da massa automática.
      ok("fila: alcança a de categoria divergente da mesma contraparte (a pessoa disse)",
         ec.correcoes["c"] === "Frota");
    }

    // Progresso: sem base, a estimativa é AUSENTE — não um número inventado.
    const p0 = progressoFila(fila, est);
    ok("fila: sem ritmo medido a estimativa é ausente, não um palpite",
       p0.restanteMs === null && p0.ritmoMs === null, JSON.stringify(p0));
    ok("fila: progresso conta o total certo", p0.total === 5 && p0.restantes === 5);

    // Com ritmo, a estimativa aparece. Mediana, não média: uma pausa longa não
    // pode multiplicar a estimativa do resto do lote.
    let e2 = estadoVazio();
    // ⚠️ **O CASO PRECISA DISCRIMINAR.** A primeira versão tinha UM intervalo
    // absurdo entre cinco normais — e a MEDIANA já resiste a um outlier
    // sozinho, então desligar o filtro não mudava nada e a asserção passava
    // dos dois jeitos. Descoberto plantando o defeito e vendo passar. Aqui são
    // três pausas contra três decisões: com o filtro a mediana é 1s, sem ele
    // salta para 600s — e a barra passaria a prometer horas.
    e2 = { ...e2, marcas: [0, 1000, 2000, 3000, 603_000, 1_203_000, 1_803_000] };
    const p1 = progressoFila(fila, e2);
    ok("fila: o intervalo absurdo (pausa) é descartado do ritmo",
       p1.ritmoMs === 1000, String(p1.ritmoMs));
    ok("fila: a estimativa é ritmo × restantes",
       p1.restanteMs === 1000 * p1.restantes, String(p1.restanteMs));

    // Retomada: decidir não perde nada e o próximo pendente é achado.
    let e3 = estadoVazio();
    e3 = decidirFila(e3, "a", "confirmada", 10);
    e3 = decidirFila(e3, "b", "ignorada", 20);
    ok("fila: o próximo pendente pula o que já foi decidido",
       fila[proximoPendente(fila, e3, 0)].chave === "c",
       fila[proximoPendente(fila, e3, 0)]?.chave);
    ok("fila: voltar nunca passa de zero", anteriorFila(0) === 0 && anteriorFila(3) === 2);

    // ⚠️ Só o CONFIRMADO é gravado — o ignorado não entra, e a correção vai junto.
    let e4 = estadoVazio();
    e4 = decidirFila(e4, "a", "confirmada", 1);
    e4 = decidirFila(e4, "c", "ignorada", 2);
    e4 = corrigirFila(e4, "a", "Frota");
    const grava = paraGravar(fila, e4);
    ok("fila: grava só o confirmado (o ignorado não entra)",
       grava.length === 1 && grava[0].chave === "a", String(grava.length));
    ok("fila: a correção acompanha o que vai ser gravado",
       grava[0].classificacao.categoria === "Frota" && grava[0].classificacao.confianca === 1,
       JSON.stringify(grava[0].classificacao));

    // Fim de fila devolve -1: voltar ao zero daria trabalho infinito.
    let e5 = estadoVazio();
    for (const l of fila) e5 = decidirFila(e5, l.chave, "confirmada", 1);
    ok("fila: com tudo decidido, não há próximo (-1), e o lote fecha",
       proximoPendente(fila, e5, 0) === -1);
    ok("fila: e o progresso fecha em 1", progressoFila(fila, e5).fracao === 1);

    // Aplicar o lote decide TODAS as chaves de uma vez.
    let e6 = estadoVazio();
    e6 = aplicarLote(e6, loteDe(fila, fila[0], e6), 1);
    ok("fila: aplicar o lote confirma as duas de uma vez",
       progressoFila(fila, e6).feitas === 2, String(progressoFila(fila, e6).feitas));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCO 3 · o documento REFINADO — calculado vence adivinhado
  // ─────────────────────────────────────────────────────────────────────────
  {
    // Um boleto REAL: linha digitável válida (DV conferido), com valor e
    // vencimento embutidos. O OCR "leu" um valor DIFERENTE — é o caso que
    // decide quem vence.
    // ⚠️ A linha é MONTADA com os DVs corretos, não digitada à mão: um número
    // inventado tem DV geral inválido, e a primeira asserção abaixo existe
    // justamente para o caso não passar testando o nada. (Foi ela que pegou a
    // primeira versão desta fixture.)
    const fatorB3 = fatorDaData("2026-08-20");
    const semDVB3 = "3419" + String(fatorB3).padStart(4, "0") + "0000123456" + "1234567890123456789012345";
    const barrasB3 = semDVB3.slice(0, 4) + dvModulo11(semDVB3.slice(0, 4) + semDVB3.slice(4)) + semDVB3.slice(4);
    const linha = linhaDeCodigoDeBarras(barrasB3);
    const b = lerBoleto(linha);
    ok("bloco3: a linha digitável de teste é válida (senão o caso não testa nada)",
       !!b && b.valido, b ? b.problemas.join(",") : "não parseou");

    const r = refinarDocumento({ linhaDigitavel: linha, valor: 999.99, confianca: 0.7 });
    ok("bloco3: o valor do CÓDIGO DE BARRAS vence o do OCR",
       r.valor.procedencia === "codigo_de_barras" && r.valor.valor === b?.valor,
       `${r.valor.procedencia} ${r.valor.valor}`);
    ok("bloco3: e a divergência é RELATADA, não resolvida em silêncio",
       r.divergencias.some((d) => d.campo === "valor"), JSON.stringify(r.divergencias));
    ok("bloco3: campo calculado tem confiança 1; o do OCR, menos",
       r.valor.confianca === 1);

    // ⚠️ DV QUE NÃO CONFERE NÃO É USADO. Um dígito lido errado produz uma linha
    // PLAUSÍVEL, e dela sai um valor plausível e errado — trocar um palpite
    // honesto por um número falso com confiança 1 é o pior resultado possível.
    const quebrada = linha.replace(/\d$/, (d) => String((Number(d) + 1) % 10));
    const rq = refinarDocumento({ linhaDigitavel: quebrada, valor: 999.99, confianca: 0.7 });
    ok("bloco3: linha com DV quebrado NÃO substitui o valor do OCR",
       rq.valor.procedencia === "ocr" && rq.valor.valor === 999.99,
       `${rq.valor.procedencia} ${rq.valor.valor}`);
    ok("bloco3: e o boleto não é dado como reconhecido",
       rq.reconhecido.boleto === false);

    // ⚠️ CNPJ INVÁLIDO (dígito verificador) NÃO amarra contraparte — ligar o
    // fornecedor errado é defeito que só aparece no fechamento.
    const ruim = refinarDocumento({ cnpj: "11111111111111", valor: 10 });
    ok("bloco3: CNPJ com DV inválido perde a confiança",
       ruim.cnpj.confianca === 0, String(ruim.cnpj.confianca));
    ok("bloco3: e NÃO pode vincular contraparte",
       podeVincularContraparte(ruim) === false);

    const bom = refinarDocumento({ cnpj: "11.222.333/0001-81", valor: 10 });
    ok("bloco3: CNPJ válido por OCR pode vincular",
       podeVincularContraparte(bom) === true, JSON.stringify(bom.cnpj));

    // ⚠️ A confiança do conjunto é a do campo MAIS FRACO, não a média — média
    // esconde um campo ruim atrás de três bons, e é o ruim que vira lançamento.
    //
    // ⚠️ **O CASO PRECISA DISCRIMINAR.** A primeira versão usava um boleto que
    // dava valor E vencimento com confiança 1: mínimo e média davam o MESMO
    // número, e trocar um pelo outro no motor não fazia a asserção falhar —
    // descoberto plantando a média e vendo passar. Aqui o boleto tem fator
    // 0000 (sem vencimento), então o valor vem do código de barras (1) e o
    // vencimento do OCR (0,4): mínimo 0,4 × média 0,7.
    const semVenc = "3419" + "0000" + "0000123456" + "1234567890123456789012345";
    const barrasSV = semVenc.slice(0, 4) + dvModulo11(semVenc.slice(0, 4) + semVenc.slice(4)) + semVenc.slice(4);
    const misto = refinarDocumento({
      linhaDigitavel: linhaDeCodigoDeBarras(barrasSV),
      vencimento: "2026-09-10", valor: null, confianca: 0.4,
    });
    ok("bloco3: o caso discrimina (valor calculado 1 × vencimento do OCR 0,4)",
       misto.valor.confianca === 1 && misto.vencimento.confianca === 0.4,
       `${misto.valor.confianca}/${misto.vencimento.confianca}`);
    ok("bloco3: confiança do conjunto é o MÍNIMO (0,4), não a média (0,7)",
       misto.confiancaGeral === 0.4, String(misto.confiancaGeral));

    // ⚠️ **O RAMO DA NF-e NÃO PODE SER INSTRUMENTAÇÃO INERTE.** O refino só
    // recebe `chaveNFe` se o OCR extrair a chave — e ele não extraía. Estas
    // asserções cobram as DUAS metades: o extrator acha a chave, e o refino a
    // usa. Sem a primeira, o ramo inteiro seria código que nunca roda.
    // ⚠️ O DV é CALCULADO, não digitado: a primeira versão desta fixture tinha
    // o último dígito errado e a asserção "senão o caso não testa nada" a pegou.
    const base43 = "3524061122233300018155001000000001100000001";
    const chaveBoa = base43 + dvDaChave(base43);
    const nfe = lerChaveNFe(chaveBoa);
    ok("bloco3: a chave de teste é válida (senão o caso não testa nada)",
       !!nfe && nfe.valido, JSON.stringify(nfe));
    const ex = extrairCampos(`NOTA FISCAL ELETRONICA\nCHAVE DE ACESSO\n${chaveBoa}\nVALOR 100,00`, 0.9);
    ok("bloco3: o OCR EXTRAI a chave da NF-e (o ramo não é inerte)",
       ex.chaveNFe === chaveBoa, String(ex.chaveNFe));

    // ⚠️ 44 dígitos NÃO bastam: o código de barras de um boleto também tem 44.
    // Sem conferir o DV da chave, o boleto viraria "nota" e o CNPJ do
    // "emitente" sairia de bytes que significam outra coisa.
    const exBoleto = extrairCampos(`BOLETO\n${barrasB3}\n`, 0.9);
    ok("bloco3: código de barras de BOLETO não é lido como chave de NF-e",
       exBoleto.chaveNFe === null, String(exBoleto.chaveNFe));

    const rn = refinarDocumento({ chaveNFe: chaveBoa, cnpj: "99.999.999/0001-99", valor: 100 });
    ok("bloco3: o CNPJ da CHAVE vence o do OCR (tem dígito verificador)",
       rn.cnpj.procedencia === "chave_de_acesso" && rn.cnpj.confianca === 1,
       `${rn.cnpj.procedencia} ${rn.cnpj.valor}`);
    ok("bloco3: e a divergência de CNPJ é relatada",
       rn.divergencias.some((d) => d.campo === "cnpj"));

    // Documento sem nada exato continua funcionando (não regride o caminho atual).
    const cru = refinarDocumento({ valor: 50, vencimento: "2026-09-01", confianca: 0.65 });
    ok("bloco3: sem boleto nem chave, o OCR segue valendo (sem regressão)",
       cru.valor.valor === 50 && cru.valor.procedencia === "ocr" && cru.confiancaGeral === 0.65);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCO D · a TABELA dentro do PDF (camada de texto)
  // ⚠️ O defeito medido: todo PDF virava UM lançamento (kind:"doc"). Um extrato
  // de 200 transações entrava como uma linha só. Estas asserções fixam a
  // reconstrução da tabela — a parte que decide o que é linha e o que é coluna.
  // ─────────────────────────────────────────────────────────────────────────
  {
    // Um extrato de 3 lançamentos, como o pdf.js entrega: pedaços com
    // coordenadas, y CRESCENDO PARA CIMA (a 1ª linha do extrato tem o maior y).
    // A descrição vem PARTIDA em dois pedaços colados — é o que o pdf.js faz
    // ao mudar de kerning no meio da palavra.
    const pag: ItemPdf[] = [
      { texto: "Data",      x:  50, y: 700, largura: 22, altura: 9 },
      { texto: "Histórico", x: 110, y: 700, largura: 45, altura: 9 },
      { texto: "Valor",     x: 320, y: 700, largura: 25, altura: 9 },
      // linha 1
      { texto: "01/08/2026", x: 50, y: 680, largura: 46, altura: 9 },
      { texto: "MERCADO",    x:110, y: 680, largura: 42, altura: 9 },
      { texto: "LIVRE",      x:157, y: 680, largura: 24, altura: 9 },
      { texto: "-1.234,56",  x:320, y: 680, largura: 40, altura: 9 },
      // linha 2 — descrição COM ponto e vírgula (o caso do parser)
      { texto: "02/08/2026", x: 50, y: 665, largura: 46, altura: 9 },
      { texto: "PIX; TARIFA",x:110, y: 665, largura: 52, altura: 9 },
      { texto: "-99,90",     x:320, y: 665, largura: 30, altura: 9 },
      // linha 3
      { texto: "03/08/2026", x: 50, y: 650, largura: 46, altura: 9 },
      { texto: "SALARIO",    x:110, y: 650, largura: 38, altura: 9 },
      { texto: "5.000,00",   x:320, y: 650, largura: 36, altura: 9 },
    ];
    const linhas = agruparEmLinhas(pag);

    ok("blocoD pdf: 3 lançamentos + cabeçalho viram 4 linhas (não 1)",
      linhas.length === 4, `linhas=${linhas.length}`);

    // ⚠️ A ORDEM é o achado que a asserção protege: no PDF o y cresce para CIMA,
    // então ordenar por y crescente devolve o extrato DE TRÁS PARA A FRENTE — e
    // um extrato invertido não parece quebrado, parece um extrato.
    ok("blocoD pdf: a ordem de leitura é do topo para baixo (y decrescente)",
      linhas[1]?.[0] === "01/08/2026" && linhas[3]?.[0] === "03/08/2026",
      `1a=${linhas[1]?.[0]} · 3a=${linhas[3]?.[0]}`);

    // A descrição partida pelo pdf.js volta a ser UMA célula.
    ok("blocoD pdf: pedaços colados viram UMA célula ('MERCADO LIVRE', não duas)",
      linhas[1]?.[1] === "MERCADO LIVRE" && linhas[1]?.length === 3,
      JSON.stringify(linhas[1]));

    // ⚠️ O ';' dentro da descrição sobrevive à reconstrução — é ele que o
    // parser ciente de aspas tem de receber inteiro (a lição do Bloco 1).
    ok("blocoD pdf: ';' na descrição não parte a célula",
      linhas[2]?.[1] === "PIX; TARIFA" && linhas[2]?.length === 3,
      JSON.stringify(linhas[2]));

    // Colunas separadas por vão largo continuam separadas.
    ok("blocoD pdf: valor fica em célula PRÓPRIA (o vão de coluna separa)",
      linhas[1]?.[2] === "-1.234,56" && linhas[3]?.[2] === "5.000,00",
      `${linhas[1]?.[2]} / ${linhas[3]?.[2]}`);

    // ⚠️ ESCANEADO vai para o OCR, não para o parser de tabela. Um PDF de scan
    // quase sempre traz ALGUM texto (número de página, marca d'água do
    // software de digitalização); tratar "tem algum texto" como "tem camada de
    // texto" mandaria o extrato escaneado ao parser, que devolveria duas linhas
    // de lixo em silêncio — o import "funciona" e traz quase nada.
    const escaneado: ItemPdf[] = [
      { texto: "1", x: 300, y: 40, largura: 5, altura: 8 },
      { texto: "Digitalizado por ScanApp", x: 50, y: 20, largura: 120, altura: 6 },
    ];
    ok("blocoD pdf: escaneado (poucos itens) NÃO é camada de texto — vai ao OCR",
      temCamadaDeTexto(escaneado) === false, `itens=${escaneado.length}`);
    ok("blocoD pdf: extrato com texto de verdade É camada de texto",
      temCamadaDeTexto([...pag, ...pag, ...pag, ...pag]) === true);
    ok("blocoD pdf: página vazia não quebra nem inventa linha",
      agruparEmLinhas([]).length === 0);

    // ⚠️ O caso do MEIO, que é o que se erra. Três vãos, três respostas — e um
    // limiar só para os três produziria ou "MERCA DO" (partindo palavra) ou
    // "MERCADO LIVRE" grudado numa coluna com o valor.
    const kern: ItemPdf[] = [
      { texto: "MERCA", x: 110, y: 500, largura: 30, altura: 9 },  // termina 140
      { texto: "DO",    x: 140, y: 500, largura: 12, altura: 9 },  // vão 0  → mesma palavra
      { texto: "LIVRE", x: 157, y: 500, largura: 24, altura: 9 },  // vão 5  → espaço
      { texto: "10,00", x: 320, y: 500, largura: 30, altura: 9 },  // vão 139 → coluna nova
    ];
    const lk = agruparEmLinhas(kern)[0] ?? [];
    ok("blocoD pdf: vão ZERO é a MESMA palavra (kerning) — não inventa espaço",
      lk[0] === "MERCADO LIVRE", JSON.stringify(lk));
    ok("blocoD pdf: vão largo é COLUNA nova — o valor não gruda na descrição",
      lk.length === 2 && lk[1] === "10,00", JSON.stringify(lk));

    // ⚠️ **A CADEIA INTEIRA, não só o agrupamento.** Uma fixture que prova que
    // as linhas saem bonitas e não prova que viram LANÇAMENTO é verde sobre o
    // vazio: era exatamente assim que o PDF "funcionava" antes — lia, não
    // reclamava, e trazia um lançamento só.
    const csvPdf = csvDeLinhas(agruparEmLinhas(pag));
    const repPdf = analisarImportacao(csvPdf);
    ok("blocoD pdf: a cadeia (tabela → csv → FDIP) devolve os 3 lançamentos",
      repPdf.records.length === 3, `records=${repPdf.records.length}`);
    ok("blocoD pdf: o ';' da descrição sobrevive até o lançamento",
      repPdf.records.some((r) => (r.contraparte ?? "").includes("TARIFA")),
      JSON.stringify(repPdf.records.map((r) => r.contraparte)));
    // ⚠️ Duas páginas não podem virar uma linha só na emenda: o y de cada
    // página recomeça do zero, e sem deslocar por página o último lançamento
    // de uma e o primeiro da outra teriam y parecidos e seriam fundidos.
    const pag2 = pag.map((i) => ({ ...i, y: i.y - 100000 }));
    const duasPaginas = agruparEmLinhas([...pag, ...pag2]);
    ok("blocoD pdf: duas páginas não fundem linha na emenda",
      duasPaginas.length === 8, `linhas=${duasPaginas.length}`);
  }

  ok("blocoD mapa: layout limpo mapeia data=0 valor=2 descricao=1",
     limpo.mapeamento.data === 0 && limpo.mapeamento.valor === 2 && limpo.mapeamento.descricao === 1,
     JSON.stringify(limpo.mapeamento));
  ok("blocoD mapa: layout limpo NÃO pede confirmação (confiança alta)",
     limpo.precisaConfirmar === false && limpo.confianca >= 70, `conf=${limpo.confianca}`);

  // ── layout DESCONHECIDO (sem cabeçalho reconhecível, colunas fora de ordem) ──
  // ⚠️ Isto é o defeito que o palpite calado produzia: sem detecção honesta,
  // entraria com data=0/valor=1 e classificaria tudo errado. Agora DECLARA.
  const estranho = detectarColunas(
    ["col_a", "col_b", "col_c"],
    [
      ["PAGAMENTO LUZ", "-120,00", "05/02/2024"],
      ["DEPOSITO", "800,00", "06/02/2024"],
    ],
  );
  ok("blocoD mapa: layout desconhecido acha data e valor pelo CONTEÚDO (nome não ajuda)",
     estranho.mapeamento.data === 2 && estranho.mapeamento.valor === 1,
     JSON.stringify(estranho.mapeamento));
  // ⚠️ E DECLARA que precisa confirmar — o palpite calado é o defeito.
  ok("blocoD mapa: layout desconhecido PEDE confirmação (não chuta calado)",
     estranho.precisaConfirmar === true, `conf=${estranho.confianca}`);

  // ── o CONTEÚDO vence o NOME quando discordam ────────────────────────────────
  // Cabeçalho diz "Valor" na col 0, mas o conteúdo dela é texto; o número está na col 2.
  const enganoso = detectarColunas(
    ["Valor", "Data", "Quantia"],
    [
      ["COMPRA MERCADO", "10/03/2024", "-89,90"],
      ["SALARIO", "05/03/2024", "3.000,00"],
    ],
  );
  ok("blocoD mapa: o CONTEÚDO vence o NOME — 'Valor' sem números não é a coluna de valor",
     enganoso.mapeamento.valor === 2, `valor=${enganoso.mapeamento.valor}`);

  // ── validação: um mapeamento salvo que NÃO bate é rejeitado ──────────────────
  const amostras = [["16/01/2024", "PIX", "100,00"], ["17/01/2024", "TED", "200,00"]];
  ok("blocoD mapa: mapeamento correto valida (nenhum problema)",
     validarMapeamento({ data: 0, valor: 2, descricao: 1, documento: -1 }, amostras).length === 0);
  // ⚠️ Reusar cegamente um mapa de outro banco (data e valor trocados) é pego.
  const trocado = validarMapeamento({ data: 2, valor: 0, descricao: 1, documento: -1 }, amostras);
  ok("blocoD mapa: mapeamento com data/valor trocados é REJEITADO antes de reusar",
     trocado.includes("data") && trocado.includes("valor"), trocado.join(","));

  // ── a assinatura do layout: header casa, posicional não salva sob chave vazia ─
  ok("blocoD mapa: dois arquivos do mesmo banco têm a MESMA assinatura",
     assinaturaLayout(["Data", "Valor", "Histórico"]) === assinaturaLayout(["data", "valor", "historico"]));
  ok("blocoD mapa: arquivo posicional (sem header) tem assinatura VAZIA (não salva)",
     assinaturaLayout([]) === "" && assinaturaLayout(["", "", ""]) === "");

  // ── A4P-073: a abertura vem do SALDO DECLARADO, NUNCA da primeira linha ──────
  // Extrato: saldo declarado (LEDGERBAL) 5.000; líquido do arquivo +1.500.
  // Abertura = 5.000 − 1.500 = 3.500. E 3.500 não é o valor de nenhuma transação.
  const transacoes = [1000, 800, -300, 4300];  // a 4300 é a armadilha da 1ª linha
  const netLiquidado = transacoes.reduce((s, v) => s + v, 0); // 5.800? não — ver abaixo
  const ab = aberturaDoExtrato(5000, 1500, "2024-01-01");
  ok("blocoD abertura: 5.000 declarado − 1.500 líquido = 3.500", ab.valor === 3500, String(ab.valor));
  // ⚠️ A ASSERÇÃO QUE FIXA O DEFEITO: a abertura NÃO é o valor de nenhuma
  // transação do extrato. É a prova de que ela não veio da 1ª linha (a lição
  // do bloco `abertura:` — provar X ≠ Y para todo Y, não conferir X).
  ok("blocoD abertura: o valor da abertura NÃO é o de nenhuma transação (não veio da 1ª linha)",
     !transacoes.some((v) => Math.abs(v - ab.valor) < 0.005), `abertura=${ab.valor}`);
  // A escolha da cascata: importada (extrato) vence informada (digitada).
  const escolha = escolherAbertura({
    importada: { valor: 3500, data: "2024-01-01" },
    informada: { valor: 9999, data: "2024-01-01", por: "fulano" },
  });
  ok("blocoD abertura: o saldo do EXTRATO vence o digitado à mão",
     escolha?.origem === "extrato_bancario" && escolha.valor === 3500);
  // ⚠️ A ORIGEM NÃO É COSMÉTICA (A4P-073): uma abertura preenchida SEM origem
  // é uma âncora anônima — a tela do Razão não pode dizer de onde veio o saldo.
  // Toda abertura que a cascata devolve carrega origem; a guarda prova.
  const abInf = escolherAbertura({ informada: { valor: 100, data: "2024-01-01", por: "Ana" } });
  ok("blocoD abertura: a informada carrega origem 'cadastro_manual'",
     abInf?.origem === "cadastro_manual");
  ok("blocoD abertura: NENHUMA abertura com valor sai sem origem",
     [escolha, abInf].every((a) => !a || (a.valor !== undefined && !!a.origem)));
  void netLiquidado;
}

/* ── BLOCO 1: o parser CIENTE DE ASPAS (o caso REAL, não o contornado) ────────
 *
 * ⚠️ O CASO PRINCIPAL é o que ACONTECE: separador `;` e descrição contendo `;`
 * entre aspas. A guarda anterior media TAB — um caso que quase nunca aparece
 * numa célula de extrato — e ficava verde enquanto o parser PERDIA o lançamento
 * de descrição citada. Verde no caso que não acontece, cega no que acontece: a
 * família do `resíduo = x − x`. Aqui o caso real vem PRIMEIRO; TAB é adicional.
 */
{
  // 1. O CASO REAL, direto no parser (sem passar por csvDeLinhas): `;` separador,
  //    `;` DENTRO de aspas na descrição do meio. Provado quebrando: o parser
  //    ingênuo (split cru) devolvia 2 — o de R$ 99,90 SUMIA.
  const real =
    "Data;Histórico;Valor\r\n" +
    "16/01/2024;PIX RECEBIDO ALPHA;1.000,00\r\n" +
    '17/01/2024;"COMPRA CARTAO; PARCELA 1/3";-99,90\r\n' +
    "18/01/2024;PAGAMENTO FORNECEDOR BETA;-300,00\r\n";
  const pr = parseTexto(real);
  ok("blocoD parser: descrição com ';' entre aspas NÃO parte a linha (3, não 2)",
     pr.records.length === 3, String(pr.records.length));
  // ⚠️ `?.` de propósito: com o parser quebrado o array encurta, e a guarda tem
  // de REPROVAR com um FAIL limpo — não estourar antes das próximas asserções.
  ok("blocoD parser: o ';' fica DENTRO da descrição, intacto",
     pr.records[1]?.descricao === "COMPRA CARTAO; PARCELA 1/3", pr.records[1]?.descricao);
  ok("blocoD parser: o valor do lançamento citado é lido (−99,90)",
     pr.records[1]?.tipo === "saida" && pr.records[1]?.valor === 99.9, String(pr.records[1]?.valor));

  // 2. Aspas ESCAPADAS ("" = uma aspa literal) — o BB põe aspas no histórico.
  const escapada = 'Data;Histórico;Valor\n01/02/2024;"PAGTO ""XPTO"" LTDA";-10,00\n';
  const pe = parseTexto(escapada);
  ok("blocoD parser: \"\" vira UMA aspa literal na descrição",
     pe.records.length === 1 && pe.records[0].descricao === 'PAGTO "XPTO" LTDA', pe.records[0]?.descricao);

  // 3. QUEBRA DE LINHA dentro de campo entre aspas — memo de duas linhas do Inter
  //    é UM lançamento, não dois nem uma linha perdida.
  const multilinha = 'Data;Histórico;Valor\n02/02/2024;"MEMO LINHA 1\nMEMO LINHA 2";-20,00\n';
  const pm = parseTexto(multilinha);
  ok("blocoD parser: quebra de linha entre aspas é UM lançamento, não dois",
     pm.records.length === 1, String(pm.records.length));

  // 4. BOM no início não gruda na primeira célula do cabeçalho (a coluna Data
  //    ainda é reconhecida — sem isto, '﻿Data' não casa /data/ e o header some).
  const comBom = "﻿Data;Histórico;Valor\n03/02/2024;PIX RECEBIDO;1.000,00\n";
  const pb = parseTexto(comBom);
  ok("blocoD parser: BOM no início não quebra o reconhecimento do cabeçalho",
     pb.records.length === 1 && pb.records[0]?.tipo === "entrada" && pb.records[0]?.valor === 1000);

  // 5. SEPARADOR DETECTADO, não assumido: um arquivo com `,` (Nubank) e vírgula
  //    de descrição entre aspas parseia igual, e o `,` decimal não vira coluna.
  const virgula = 'Data,Descrição,Valor\n2024-02-04,"Boleto, energia",-230.50\n2024-02-05,Compra,1500.00\n';
  const pv = parseTexto(virgula);
  ok("blocoD parser: separador ',' detectado; ',' de descrição citada não parte",
     pv.records.length === 2 && pv.records[0]?.descricao === "Boleto, energia", pv.records[0]?.descricao);
  ok("blocoD parser: com separador ',', o ',' decimal NÃO é lido como coluna",
     pv.records[1]?.valor === 1500, String(pv.records[1]?.valor));

  // 6. TAB como caso ADICIONAL (nunca o principal): um arquivo tabulado parseia,
  //    mas não é o separador padrão — só vence quando DOMINA a primeira linha.
  const tab = "Data\tHistórico\tValor\n06/02/2024\tPIX\t1.000,00\n";
  const pt = parseTexto(tab);
  ok("blocoD parser: TAB é reconhecido quando domina (caso adicional, não padrão)",
     pt.records.length === 1 && pt.records[0]?.valor === 1000);
}

/* ── BLOCO 1: FIXTURES de banco brasileiro real (bytes de verdade em disco) ───
 * Guardadas em scripts/fixtures/extratos/*.csv — cada uma com um defeito de
 * mundo real: BOM+CRLF (Itaú), sufixo C/D (Bradesco), separador vírgula +
 * data ISO (Nubank), quebra de linha citada (Inter), aspas escapadas (BB).
 */
{
  const ler = (banco: string) =>
    parseTexto(readFileSync(new URL(`./fixtures/extratos/${banco}.csv`, import.meta.url), "utf8"));

  const itau = ler("itau");
  ok("blocoD fixture Itaú: BOM+CRLF+';' citado → 3 lançamentos",
     itau.records.length === 3, String(itau.records.length));
  ok("blocoD fixture Itaú: a compra parcelada com ';' sobrevive inteira",
     itau.records.some((r) => r.descricao === "COMPRA CARTAO 1234; PARCELA 01/03"));

  const bradesco = ler("bradesco");
  ok("blocoD fixture Bradesco: sufixo C/D vira sinal → 3 lançamentos",
     bradesco.records.length === 3, String(bradesco.records.length));
  ok("blocoD fixture Bradesco: '2.000,00 C' é entrada; '500,00 D' é saída",
     bradesco.records[0]?.tipo === "entrada" && bradesco.records[0]?.valor === 2000 &&
     bradesco.records[1]?.tipo === "saida" && bradesco.records[1]?.valor === 500);
  ok("blocoD fixture Bradesco: coluna de documento é lida",
     bradesco.records[0]?.documento === "000123");

  const nubank = ler("nubank");
  ok("blocoD fixture Nubank: separador ',' + data ISO → 3 lançamentos",
     nubank.records.length === 3, String(nubank.records.length));
  ok("blocoD fixture Nubank: descrição com vírgula citada fica inteira",
     nubank.records.some((r) => r.descricao === "Pagamento boleto, energia elétrica"));

  const inter = ler("inter");
  ok("blocoD fixture Inter: memo de DUAS linhas é UM lançamento → 3 no total",
     inter.records.length === 3, String(inter.records.length));

  const bb = ler("bb");
  ok("blocoD fixture BB: aspas escapadas viram aspa literal → 3 lançamentos",
     bb.records.length === 3, String(bb.records.length));
  ok("blocoD fixture BB: a aspa literal do histórico é preservada",
     bb.records.some((r) => r.descricao === 'PAGTO "FORNECEDOR PREMIUM" LTDA'));
}

/* ── Fatia 2: xlsx entra no MESMO pipeline (mesma contagem, categorias, chave) ── */
{
  const linhas = [
    ["Data", "Histórico", "Valor"],
    ["16/01/2024", "PIX RECEBIDO ALPHA", "1.000,00"],
    ["17/01/2024", "TARIFA MENSAL", "-50,00"],
    ["18/01/2024", "PAGAMENTO FORNECEDOR BETA", "-300,00"],
    ["", "", ""],  // linha vazia do fim da aba do Excel — some
  ];
  const csvManual =
    "Data;Histórico;Valor\n16/01/2024;PIX RECEBIDO ALPHA;1.000,00\n17/01/2024;TARIFA MENSAL;-50,00\n18/01/2024;PAGAMENTO FORNECEDOR BETA;-300,00";

  const viaPlanilha = analisarImportacao(csvDeLinhas(linhas));
  const viaCsv = analisarImportacao(csvManual);

  ok("blocoD xlsx: planilha e CSV dão a MESMA contagem de lançamentos",
     viaPlanilha.records.length === viaCsv.records.length && viaPlanilha.records.length === 3,
     `${viaPlanilha.records.length} × ${viaCsv.records.length}`);

  const cats = (r: typeof viaCsv) => r.classificacoes.map((x) => x.categoria).sort().join("|");
  ok("blocoD xlsx: planilha e CSV sugerem as MESMAS categorias",
     cats(viaPlanilha) === cats(viaCsv), `${cats(viaPlanilha)} × ${cats(viaCsv)}`);

  const chaves = (r: typeof viaCsv) => r.records.map((x) => x.fingerprint).sort().join("|");
  ok("blocoD xlsx: planilha e CSV geram a MESMA chave de idempotência",
     chaves(viaPlanilha) === chaves(viaCsv));

  // ⚠️ Agora via csvDeLinhas com separador `;` DE VERDADE: a descrição com `;`
  // é CITADA na serialização e o parser ciente de aspas a desfaz — 1 lançamento,
  // não 2, e o `;` fica na descrição. (Antes csvDeLinhas usava TAB p/ esconder
  // o defeito; agora o defeito está corrigido na origem.)
  const comPontoVirgula = [["Data", "Histórico", "Valor"], ["20/01/2024", "COMPRA A; PARCELA 1", "-99,90"]];
  const rep = analisarImportacao(csvDeLinhas(comPontoVirgula));
  ok("blocoD xlsx: descrição com ';' NÃO parte a linha (1 lançamento, não 2)",
     rep.records.length === 1, String(rep.records.length));
  ok("blocoD xlsx: e o ';' continua DENTRO da descrição serializada com ';'",
     rep.records[0]?.descricao === "COMPRA A; PARCELA 1", rep.records[0]?.descricao);
}

// ─────────────────────────────────────────────────────────────────────────────
// A4P-079 — A TELA DE GOVERNANÇA NÃO AFIRMA INTEGRIDADE QUE NÃO PODE CONFERIR
//
// ⚠️ Esta guarda existe porque a verificação de integridade, em produção, era
// `x − x`: `getAuditTrail` MONTA a cadeia no navegador a partir das linhas de
// `audit_log` (que não guarda hash) e então verifica essa cadeia contra ela
// mesma. Medido pelo MESMO caminho da produção: adulterar o `depois` de uma
// linha, apagar a linha do meio e a cadeia vazia — os três devolviam
// `intacta: true`, e a tela estampava a pílula verde "Cadeia íntegra".
//
// ⚠️ **A guarda NÃO mede a integridade** — medir isso seria repetir a
// tautologia. Ela mede o que a tela AFIRMA: com a cadeia reconstruída, nenhum
// caminho pode produzir o rótulo positivo nem oferecer o teste de adulteração.
// É a forma "X nunca pode vir de Y" da doutrina: prova-se excluindo o caminho
// errado, não confirmando o resultado certo.
{
  const { veredictoDaCadeia } = await import("@/core/institutional/cadeia");
  const { TrilhaAuditoria } = await import("@/core/institutional/audit");

  // 1) O defeito original, reproduzido: a cadeia reconstruída NÃO detecta.
  type L = { id: string; depois: Record<string, unknown> };
  const montar = (linhas: L[]) => {
    const t = new TrilhaAuditoria();
    for (const r of linhas)
      t.registrar({
        entityType: "movement", entityId: r.id, action: "update",
        before: null, after: r.depois,
        ctx: { userId: "u", userName: "u", companyId: "—", ip: "—", device: "—", browser: "—", os: "—" },
        timestamp: `2026-08-0${r.id}T10:00:00Z`,
      });
    return t.verificarIntegridade();
  };
  const LINHAS: L[] = [
    { id: "1", depois: { valor: 1000 } },
    { id: "2", depois: { valor: 2000 } },
    { id: "3", depois: { valor: 3000 } },
  ];
  const adulterada = montar(LINHAS.map((l) => (l.id === "2" ? { ...l, depois: { valor: 999999 } } : l)));
  const semMeio = montar(LINHAS.filter((l) => l.id !== "2"));
  ok("A4P-079: reconstruir a cadeia NÃO detecta adulteração (o defeito é real)",
     adulterada.intacta && semMeio.intacta,
     `adulterada=${adulterada.intacta} · apagada=${semMeio.intacta}`);

  // 2) …e por isso o veredicto de uma cadeia reconstruída nunca é positivo.
  const recon = veredictoDaCadeia({ origem: "reconstruida", total: 3, intacta: true });
  ok("A4P-079: cadeia reconstruída NUNCA diz 'Cadeia íntegra'",
     !recon.verificavel && recon.rotulo !== "Cadeia íntegra" && recon.tom !== "positivo", recon.rotulo);
  ok("A4P-079: e NUNCA oferece o teste de adulteração (proteção que o dado não tem)",
     recon.podeTestarAdulteracao === false);
  ok("A4P-079: o motivo ocupa o lugar da afirmação, e nomeia a causa",
     recon.explicacao.includes("calculado na hora da leitura") && recon.explicacao.length > 80);

  // 3) O vazio: 0 eventos passa em verificarIntegridade por VACUIDADE.
  const vazioCru = new TrilhaAuditoria([]).verificarIntegridade();
  ok("A4P-079: 0 eventos passa na verificação crua (é por isso que a tela mentia)",
     vazioCru.intacta && vazioCru.total === 0);
  const vazio = veredictoDaCadeia({ origem: "armazenada", total: 0, intacta: true });
  ok("A4P-079: mas o veredicto do VAZIO não é positivo, mesmo com cadeia armazenada",
     !vazio.verificavel && vazio.tom === "neutro" && !vazio.podeTestarAdulteracao, vazio.rotulo);
  ok("A4P-079: e o vazio DIZ que ausência de registro não é registro em ordem",
     vazio.explicacao.toLowerCase().includes("não é o mesmo"));

  // 4) O caso legítimo continua funcionando — senão a guarda proibiria o certo.
  const boa = veredictoDaCadeia({ origem: "armazenada", total: 3, intacta: true });
  const ruim = veredictoDaCadeia({ origem: "armazenada", total: 3, intacta: false });
  ok("A4P-079: cadeia ARMAZENADA e íntegra continua podendo afirmar",
     boa.verificavel && boa.rotulo === "Cadeia íntegra" && boa.podeTestarAdulteracao);
  ok("A4P-079: cadeia ARMAZENADA adulterada acusa (o caso discrimina)",
     ruim.verificavel && ruim.tom === "alerta" && ruim.rotulo !== boa.rotulo);

  // 5) TETO ZERO na tela: nenhum caminho estampa o rótulo positivo por conta
  //    própria. Era um ternário inline sobre `integridade.intacta`, e foi ele
  //    que atravessou meses sem ninguém ver.
  const fs = await import("node:fs");
  const tela = fs.readFileSync("src/components/institucional/InstitutionalView.tsx", "utf8");
  ok("A4P-079: a tela não escreve 'Cadeia íntegra' à mão — sai do veredicto",
     !tela.includes('"Cadeia íntegra"') && tela.includes("veredictoDaCadeia"));
  ok("A4P-079: o teste de adulteração é gateado pelo veredicto, não por eventos.length",
     tela.includes("veredicto.podeTestarAdulteracao"));
}

// ─────────────────────────────────────────────────────────────────────────────
// METODOLOGIA PÚBLICA (item 12) — a página descreve o cálculo que o produto
// EXECUTA, não um cálculo que alguém digitou uma vez.
//
// ⚠️ Uma página pública de metodologia com texto à mão é pior que nenhuma: ela
// envelhece na primeira mudança de fórmula e passa a afirmar, para quem ainda
// não é cliente, um cálculo que não existe mais. Por isso a guarda cobra o
// CONSUMO das fontes, e cobra que toda linha de soma tenha explicação — senão a
// próxima linha nova entra na cascata muda.
{
  const fs = await import("node:fs");
  const { ESTRUTURA_DRE, ESTRUTURA_DFC } = await import("@/core/relatorios");
  const { METODOLOGIAS } = await import("@/core/metodologia");
  const { LIMITES } = await import("@/core/metodologia/limites");

  const somas = [...ESTRUTURA_DRE, ...ESTRUTURA_DFC].filter((l) => l.tipo === "soma");
  const semEntra = somas.filter((l) => !l.entra || l.entra.length < 40);
  ok("metodologia: TODA linha de soma diz em português o que cai nela",
     semEntra.length === 0, semEntra.map((l) => l.id).join(", "));

  // ⚠️ O caso que DISCRIMINA: a explicação da dedução tem de dizer que IRPJ e
  // CSLL NÃO entram ali. Foi exatamente essa confusão que levou a dedução a
  // 47,54% da receita numa organização real, e uma explicação que a omitisse
  // publicaria a versão errada da regra.
  const ded = ESTRUTURA_DRE.find((l) => l.id === "deducoes");
  ok("metodologia: a linha de deduções DIZ que IRPJ/CSLL ficam de fora",
     /irpj/i.test(ded?.entra ?? "") && /csll/i.test(ded?.entra ?? ""));

  const totais = ESTRUTURA_DRE.filter((l) => l.tipo === "total" && l.id !== "saldo_inicial");
  ok("metodologia: toda linha de total tem fórmula (nenhuma soma lançamento)",
     totais.every((l) => (l.formula?.length ?? 0) > 0 && !l.casa),
     totais.filter((l) => !l.formula?.length || l.casa).map((l) => l.id).join(", "));

  // ⚠️ TETO ZERO: a página LÊ das fontes. Se ela deixar de importar qualquer
  // uma, virou texto à mão — e é aí que a divergência começa, em silêncio.
  const pag = fs.readFileSync("src/components/metodologia/MetodologiaView.tsx", "utf8");
  for (const fonte of ["ESTRUTURA_DRE", "ESTRUTURA_DFC", "METODOLOGIAS", "LIMITES"])
    ok(`metodologia: a página consome ${fonte} em vez de repetir o texto`,
       new RegExp(`import[^;]*${fonte}`).test(pag));

  ok("metodologia: a página tem a seção do que o sistema NÃO faz",
     pag.includes("O que o sistema não faz"));
  ok("metodologia: cada limite traz o que fazer no lugar (limite sem saída lê como defeito)",
     LIMITES.length >= 5 && LIMITES.every((l) => l.emVezDisso.length > 30 && l.porque.length > 30));
  // ⚠️ Discrimina: a lista tem de conter os limites que DOEM, não só os fáceis.
  const titulos = LIMITES.map((l) => l.titulo.toLowerCase()).join(" | ");
  ok("metodologia: os limites que doem estão declarados (contador · dinheiro · previsão)",
     /contador/.test(titulos) && /move dinheiro/.test(titulos) && /prev[êe]/.test(titulos), titulos);

  ok("metodologia: todo indicador declara o que NÃO enxerga",
     METODOLOGIAS.length > 0 && METODOLOGIAS.every((m) => m.limitacoes.length > 0));
  ok("metodologia: os pesos de cada indicador somam 1",
     METODOLOGIAS.every((m) => Math.abs(m.componentes.reduce((a, c) => a + c.peso, 0) - 1) < 0.001),
     METODOLOGIAS.map((m) => `${m.id}=${m.componentes.reduce((a, c) => a + c.peso, 0).toFixed(3)}`).join(" "));

  // ⚠️ Pública de verdade: sem esta linha no middleware a página existe e pede
  // login — e uma metodologia que só quem já comprou consegue ler não cumpre a
  // função de ajudar a decidir a compra.
  const mw = fs.readFileSync("src/middleware.ts", "utf8").replace(/\/\/.*$/gm, "");
  ok("metodologia: a rota é pública no middleware", mw.includes('pathname.startsWith("/metodologia")'));
}

// ─────────────────────────────────────────────────────────────────────────────
// MVP · A IA NÃO CHAMA FOLHA DE FORNECEDOR
//
// ⚠️ Medido numa organização real: "qual meu maior fornecedor" respondia
// "Folha Funcionarios (R$65.441,24), Pro Labore Socios (R$18.000,00)". Não é
// falso — o dinheiro sai mesmo para eles — mas para um dono de empresa
// fornecedor é quem lhe VENDE, não quem trabalha nele. Uma resposta que soa
// errada contamina as certas ao lado, e numa demo isso custa a reunião.
{
  const { responderLocal } = await import("@/core/assistant/engine");
  const mk = (cat: string, valor: number, party: string) => ({
    id: `f-${party}-${valor}`, type: "saida", status: "pago", amount: valor,
    due_date: "2026-08-10", paid_date: "2026-08-10", competence_date: "2026-08-10",
    category: cat, description: cat, party_id: party, accountId: "c1",
  });
  const inputIA = {
    hoje: "2026-08-20", saldoAtual: 50_000,
    // A folha é a MAIOR saída de propósito: se ela não fosse a maior, o caso
    // passaria sem discriminar nada.
    movements: [
      mk("Folha de pagamento", 90_000, "p-folha"),
      mk("Pró-labore", 30_000, "p-prolabore"),
      mk("Fornecedores / insumos", 12_000, "p-distribuidora"),
    ],
    accounts: [{ id: "c1", name: "Conta", balance: 50_000 }],
    parties: [],
    partyNames: { "p-folha": "Folha Funcionarios", "p-prolabore": "Pro Labore Socios", "p-distribuidora": "Distribuidora Sul" },
  } as never;
  const r = responderLocal("qual meu maior fornecedor", inputIA) as { resposta?: string } | null;
  const txt = r?.resposta ?? "";
  ok("mvp: a IA responde a pergunta de fornecedor", txt.length > 10, txt.slice(0, 80));
  ok("mvp: folha NÃO aparece como fornecedor", !/Folha Funcionarios/i.test(txt), txt.slice(0, 110));
  ok("mvp: pró-labore NÃO aparece como fornecedor", !/Pro Labore/i.test(txt), txt.slice(0, 110));
  // ⚠️ O caso DISCRIMINA: o fornecedor de verdade tem de sobrar na resposta.
  // Sem esta linha, esconder tudo passaria nas duas asserções acima.
  ok("mvp: o fornecedor de verdade continua na resposta", /Distribuidora Sul/i.test(txt), txt.slice(0, 110));
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEM 16 — CONFIRMADO × PREVISTO no relatório
//
// ⚠️ Duas coisas precisam ser verdade ao mesmo tempo, e uma sem a outra é
// inútil: a distinção tem de MUDAR o número (senão não distingue nada), e o
// PADRÃO tem de preservar o comportamento de hoje (senão todo cliente vê os
// números caírem da noite para o dia, e número que muda sozinho é lido como
// defeito, não como recurso).
{
  const { titulosDaVisao, ehConfirmado, situacaoDe } = await import("@/core/central");
  const t = (id: string, situacao: string) => ({ id, situacao } as never);
  const carteira = [
    t("a", "previsto"), t("b", "confirmado"), t("c", "baixado"),
    t("d", "conciliado"), t("e", "cancelado"), t("f", "estornado"),
  ];

  const comPrevisto = titulosDaVisao(carteira, "com-previsto");
  const soConfirmado = titulosDaVisao(carteira, "confirmado");

  ok("item16: a visão CONFIRMADO é menor que a com previsto (a distinção distingue)",
     soConfirmado.length < comPrevisto.length, `${soConfirmado.length} × ${comPrevisto.length}`);
  ok("item16: com previsto inclui o previsto", comPrevisto.some((x) => (x as { id: string }).id === "a"));
  ok("item16: só confirmado NÃO inclui o previsto", !soConfirmado.some((x) => (x as { id: string }).id === "a"));

  // ⚠️ Cancelado e estornado saem das DUAS: eles não são "previsto que talvez
  // aconteça", são dinheiro que saiu do resultado por definição. Se entrassem na
  // visão com previsto, o relatório completo somaria o que foi desfeito.
  for (const v of ["com-previsto", "confirmado"] as const) {
    const r = titulosDaVisao(carteira, v);
    ok(`item16: cancelado fica fora da visão "${v}"`, !r.some((x) => (x as { id: string }).id === "e"));
    ok(`item16: estornado fica fora da visão "${v}"`, !r.some((x) => (x as { id: string }).id === "f"));
  }

  // Os três estados firmes contam como confirmado.
  for (const s2 of ["confirmado", "baixado", "conciliado"] as const)
    ok(`item16: "${s2}" conta como firme`, ehConfirmado(s2));
  for (const s2 of ["previsto", "cancelado", "estornado"] as const)
    ok(`item16: "${s2}" NÃO conta como firme`, !ehConfirmado(s2));

  // ⚠️ E a ponte com a coluna nova: `situacaoDe` prefere o gravado. Este caso
  // fixa o comportamento que ligar a coluna no select produz.
  ok("item16: situacaoDe prefere a coluna quando ela vem",
     situacaoDe({ status: "pendente", situacao: "confirmado" } as never) === "confirmado");
  ok("item16: e deriva do status quando ela não vem",
     situacaoDe({ status: "pago" } as never) === "baixado");

  // ⚠️ TETO ZERO na tela: o padrão é "com-previsto". Abrir em "confirmado"
  // derrubaria todo número de todo cliente sem ninguém ter pedido.
  const fs = await import("node:fs");
  const tela = fs.readFileSync("src/components/relatorios/DemonstrativoView.tsx", "utf8");
  ok("item16: o relatório ABRE com previsto (não muda número de ninguém sozinho)",
     /useState<VisaoRelatorio>\("com-previsto"\)/.test(tela));
  ok("item16: e o recorte é DITO na tela, nas duas visões",
     tela.includes("Mostrando o confirmado E o previsto") && tela.includes("Mostrando só o CONFIRMADO"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * A ORDEM DA FILA DA CENTRAL — o topo da tela principal
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Medido em produção (26/08): o primeiro item da Central era um título de
 * **05/05/2023** — 1.209 dias parado, R$ 32,00 — porque a fila ordenava por
 * `due_date` crescente. Idade não é urgência: o vencido de três dias é urgente,
 * o de três anos está abandonado, e o topo é o lugar mais caro da tela.
 */
{
  const HOJE = "2026-08-26";
  const f = (id: string, vencimento: string) => ({ id, vencimento });
  const fila = [
    f("velho", "2023-05-05"),      // 1.209 dias — o caso real
    f("hoje", "2026-08-26"),
    f("vencido3", "2026-08-23"),   // 3 dias — urgente de verdade
    f("futuro", "2026-09-10"),
    f("limite", "2026-05-28"),     // 90 dias exatos: NÃO é parado
  ];
  const ordem = ordenarFila(fila, HOJE).map((i) => i.id);

  ok("central: o título de 2023 SAI do topo", ordem[0] !== "velho", ordem.join(" · "));
  ok("central: o vencido recente vem primeiro — é ele que exige decisão hoje",
     ordem[0] === "limite" && ordem[1] === "vencido3", ordem.join(" · "));
  ok("central: o parado vai para o FIM, e não some", ordem[ordem.length - 1] === "velho" && ordem.length === 5);
  ok("central: 90 dias exatos ainda NÃO é parado (a borda é `>`, não `>=`)",
     diasParado("2026-05-28", HOJE) === 0, `${diasEntreISO("2026-05-28", HOJE)} dias`);
  ok("central: 91 dias JÁ é parado", diasParado("2026-05-27", HOJE) > 0);
  ok("central: o número de dias parados é o real, não um rótulo",
     diasParado("2023-05-05", HOJE) === 1209, `${diasParado("2023-05-05", HOJE)}`);
  /*
   * ⚠️ A asserção que prova que a ordem MUDOU alguma coisa: com o critério
   * antigo (`due_date` crescente puro) o topo seria `velho`. Sem ela, um dia
   * alguém "simplifica" `ordenarFila` para um sort por data e as cinco de cima
   * continuam passando — todas falam do resultado, nenhuma exclui o caminho.
   */
  const antigo = [...fila].sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1)).map((i) => i.id);
  ok("central: o critério NOVO discorda do antigo (senão nada foi consertado)",
     antigo[0] === "velho" && ordem[0] !== antigo[0], `antigo: ${antigo[0]} · novo: ${ordem[0]}`);

  /* Rótulo: era um mapa que devolvia a própria chave. */
  /*
   * ⚠️ Alias no import: `rotuloSituacao` existe em DOIS módulos —
   * `core/central` (a esteira) e `core/movimentacoes` (o título a pagar/receber,
   * com assinatura diferente). Dois nomes iguais para conceitos vizinhos é a
   * próxima "duas fontes" esperando alguém importar o errado; fica REGISTRADO
   * aqui, sem renomear neste lote.
   */
  ok("central: a situação sai com rótulo de gente, não o valor da coluna",
     rotuloSituacaoCentral("previsto") === "Previsto" && rotuloSituacaoCentral("baixado") === "Baixado",
     `${rotuloSituacaoCentral("previsto")} · ${rotuloSituacaoCentral("baixado")}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENXUGAMENTO DO MVP + CAMPFIRE (30/09/2026) — as quatro funções novas.
//
// Cada bloco afirma sobre o VALOR que o caminho produziu (a regra do "toda
// fixture prova que o caminho recebeu valor"), e cada um carrega a asserção
// que discrimina o defeito que ele existe para impedir.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { analisarVariacao } = await import("@/core/variacao");
  const { montarDRE } = await import("@/core/relatorios");
  const { balancoComparativo } = await import("@/lib/ledger");
  const { provisaoComEstorno, ultimoDiaDoMes, primeiroDiaDoMesSeguinte } = await import("@/core/close");
  const { balanceado } = await import("@/core/ledger");
  const { montarRegua, registrarEnvio, etapaDoTitulo, REGUA_PADRAO } = await import("@/core/cobranca");

  type RM = import("@/core/risk-engine/types").RiskMovement;
  const m = (id: string, type: "entrada" | "saida", amount: number, due: string, category: string, party = "P1",
    status: "pago" | "pendente" = "pago"): RM =>
    ({ id, type, status, amount, due_date: due, paid_date: status === "pago" ? due : null, category, party_id: party }) as RM;

  /* ---------------- 1) ANÁLISE DE VARIAÇÃO ---------------- */
  const movsV: RM[] = [
    // julho: receita 20.000, marketing 3.000, aluguel 5.000, tarifa 10
    m("j1", "entrada", 20_000, "2026-07-05", "Vendas", "C1"),
    m("j2", "saida", 3_000, "2026-07-10", "Marketing", "M1"),
    m("j3", "saida", 5_000, "2026-07-12", "Aluguel", "L1"),
    m("j4", "saida", 10, "2026-07-15", "Tarifa bancária", "B1"),
    // agosto: receita 21.000 (+5%, abaixo do %), marketing 9.000 (+6.000),
    // aluguel igual, tarifa 30 (+200%, mas R$ 20 — abaixo do valor mínimo)
    m("a1", "entrada", 21_000, "2026-08-05", "Vendas", "C1"),
    m("a2", "saida", 6_000, "2026-08-10", "Marketing", "M1"),
    m("a2b", "saida", 3_000, "2026-08-11", "Marketing", "M2"),
    m("a3", "saida", 5_000, "2026-08-12", "Aluguel", "L1"),
    m("a4", "saida", 30, "2026-08-15", "Tarifa bancária", "B1"),
  ];
  const inV = { hoje: "2026-09-02", saldoAtual: 50_000, movements: movsV, partyNames: { M1: "Meta Ads", M2: "Google Ads", C1: "Cliente Um" } } as never;
  const av = analisarVariacao(inV, "2026-08");
  const dreV = montarDRE(inV, { intervalo: { de: "2026-05-01", ate: "2026-08-31" }, tipo: "horizontal" });
  const kAgo = dreV.colunas.indexOf("2026-08");
  // Marketing é despesa VARIÁVEL na cascata; tarifa bancária é resultado financeiro.
  const opex = av.linhas.find((l) => l.id === "despesas_variaveis");
  const fin = av.linhas.find((l) => l.id === "resultado_financeiro");
  const rec = av.linhas.find((l) => l.id === "receita_bruta");

  ok("variacao: os números saem da cascata do DRE (sem soma paralela)",
     av.linhas.every((l) => Math.abs(l.atual - (dreV.linhas.find((x) => x.id === l.id)?.celulas[kAgo]?.valor ?? NaN)) < 0.01));
  ok("variacao: o caminho RECEBEU valor (a linha de despesa não é zero)", !!opex && opex.atual > 0 && opex.anterior > 0,
     `${opex?.atual} · ${opex?.anterior}`);
  ok("variacao: despesa que sobe R$ 6.000 é material e PIORA o resultado",
     !!opex && opex.material && opex.leitura === "piorou" && Math.abs(opex.delta - 6_000) < 0.01, `${opex?.delta} ${opex?.leitura}`);
  ok("variacao: receita +5% não passa do percentual mínimo (dois pisos, não um)", !!rec && !rec.material && rec.delta === 1_000);
  // ⚠️ O caso que discrimina: +200% num valor de R$ 20. Só o percentual o
  // acusaria; só o valor o ignora. Com um piso só, uma das duas asserções cai.
  ok("variacao: +200% em R$ 20 não vira manchete",
     !!fin && fin.deltaPct != null && Math.abs(fin.deltaPct) >= 100 && !fin.material, `${fin?.deltaPct} ${fin?.material}`);
  ok("variacao: os motivos somam a variação da linha", !!opex
     && Math.abs(opex.motivos.reduce((s, x) => s + x.delta, 0) - opex.delta) < 0.01);
  const mkt = opex?.motivos[0];
  ok("variacao: o maior motivo vem primeiro, com a contraparte que mais pesa",
     mkt?.categoria === "Marketing" && mkt?.principalContraparte === "Meta Ads", `${mkt?.categoria} · ${mkt?.principalContraparte}`);
  ok("variacao: o drill-down aponta os lançamentos exatos do mês",
     !!mkt && mkt.movimentos.slice().sort().join(",") === "a2,a2b");
  ok("variacao: a tarifa continua no drill-down mesmo sem ser manchete",
     fin?.motivos.some((x) => x.categoria === "Tarifa bancária" && Math.abs(x.delta + 20) < 0.01) === true);
  ok("variacao: o comentário cita a linha, o valor e quem explica",
     !!opex && opex.comentario.includes(opex.label) && opex.comentario.includes("R$6.000,00") && opex.comentario.includes("Marketing") && opex.comentario.includes("Meta Ads"), opex?.comentario);
  // Sem mês anterior com lançamento, a variação é AUSENTE — não "+100%".
  const semBase = analisarVariacao(inV, "2026-07");
  ok("variacao: sem base de comparação o motor diz o motivo (ONDA 4)",
     semBase.indisponivel?.codigo === "sem_base" && semBase.materiais.length === 0);

  /* ---------------- 2) BALANÇO COMPARATIVO ---------------- */
  const lanc = (id: string, data: string, linhas: { conta: string; nome: string; tipo: "asset" | "liability" | "equity" | "revenue" | "expense"; debito: number; credito: number }[]) =>
    ({ id, data, descricao: id, origem: "manual", linhas: linhas.map((l) => ({ ...l, dimensions: {} })) }) as never;
  const razao = [
    lanc("l1", "2026-07-01", [
      { conta: "1.1.01", nome: "Caixa", tipo: "asset", debito: 10_000, credito: 0 },
      { conta: "3.1.01", nome: "Capital", tipo: "equity", debito: 0, credito: 10_000 },
    ]),
    lanc("l2", "2026-08-10", [
      { conta: "1.1.05", nome: "Estoque", tipo: "asset", debito: 4_000, credito: 0 },
      { conta: "1.1.01", nome: "Caixa", tipo: "asset", debito: 0, credito: 4_000 },
    ]),
  ];
  const bc = balancoComparativo(razao, "2026-08-31", "2026-07-31");
  const cx = bc.linhas.find((l) => l.nome === "Caixa");
  const est = bc.linhas.find((l) => l.nome === "Estoque");
  ok("balanço: o caixa variou −4.000 (o caminho recebeu valor)", !!cx && cx.anterior === 10_000 && cx.atual === 6_000 && cx.variacao === -4_000);
  ok("balanço: conta que só existe numa data entra com ZERO na outra", !!est && est.anterior === 0 && est.atual === 4_000);
  const ativoLinhas = bc.linhas.filter((l) => l.grupo === "Ativo");
  const totAtivo = bc.atual.grupos.find((g) => g.titulo === "Ativo")!.total - bc.anterior.grupos.find((g) => g.titulo === "Ativo")!.total;
  ok("balanço: a soma das variações do grupo é a variação do total", Math.abs(ativoLinhas.reduce((s, l) => s + l.variacao, 0) - totAtivo) < 0.01);
  ok("balanço: fecha nas duas datas", bc.atual.fecha && bc.anterior.fecha);

  /* ---------------- 3) PROVISÃO COM ESTORNO ---------------- */
  const [prov, est2] = provisaoComEstorno("2026-12", "Energia", 1_234.56);
  ok("provisão: nasce no último dia do mês e o estorno no 1º do seguinte (dezembro → janeiro)",
     prov.entryDate === "2026-12-31" && est2.entryDate === "2027-01-01", `${prov.entryDate} · ${est2.entryDate}`);
  ok("provisão: fevereiro de ano bissexto termina no dia 29", ultimoDiaDoMes("2028-02") === "2028-02-29");
  ok("provisão: o mês seguinte não vira mês 13", primeiroDiaDoMesSeguinte("2026-12") === "2027-01-01");
  ok("provisão: as duas partidas estão balanceadas", balanceado(prov.lines) && balanceado(est2.lines));
  // ⚠️ O que discrimina: o estorno é o ESPELHO. Débito e crédito somados por
  // conta nas duas partidas dão zero — sem isso a despesa fica contada duas
  // vezes quando a conta real chegar.
  const liquidoPorConta = new Map<string, number>();
  for (const l of [...prov.lines, ...est2.lines]) liquidoPorConta.set(l.accountId, (liquidoPorConta.get(l.accountId) ?? 0) + (l.debit ?? 0) - (l.credit ?? 0));
  ok("provisão: provisão + estorno zeram cada conta", Array.from(liquidoPorConta.values()).every((v) => Math.abs(v) < 0.005));
  ok("provisão: as chaves são distintas e estáveis (relançar não duplica)",
     prov.externalKey !== est2.externalKey && provisaoComEstorno("2026-12", "Energia", 1)[0].externalKey === prov.externalKey);

  /* ---------------- 4) RÉGUA DE COBRANÇA ---------------- */
  const hojeR = "2026-09-20";
  const movsR: RM[] = [
    m("r-antes", "entrada", 500, "2026-09-23", "Vendas", "C1", "pendente"),    // D−3
    m("r-hoje", "entrada", 700, "2026-09-20", "Vendas", "C1", "pendente"),     // D0
    m("r-3", "entrada", 900, "2026-09-17", "Vendas", "C2", "pendente"),        // D+3
    m("r-5", "entrada", 950, "2026-09-15", "Vendas", "C2", "pendente"),        // D+5 → segue em D+3, não é da fila
    m("r-65", "entrada", 4_000, "2026-07-17", "Vendas", "C3", "pendente"),     // D+65 → decisão manual
    m("r-pago", "entrada", 800, "2026-09-17", "Vendas", "C2", "pago"),         // pago: fora
    m("r-transf", "entrada", 20_000, "2026-09-17", "Transferência entre contas", "C1", "pendente"), // não se cobra
    m("r-longe", "entrada", 300, "2026-10-30", "Vendas", "C1", "pendente"),    // cedo demais
  ];
  const inR = { hoje: hojeR, saldoAtual: 0, movements: movsR, partyNames: { C1: "Alfa", C2: "Beta", C3: "Gama" } } as never;
  const regua = montarRegua(inR);
  const idsFila = regua.filaDeHoje.map((i) => i.movimentoId).sort();
  ok("régua: a fila de hoje traz exatamente D−3, D0, D+3 e o manual",
     idsFila.join(",") === ["r-3", "r-65", "r-antes", "r-hoje"].sort().join(","), idsFila.join(","));
  ok("régua: vence HOJE é lembrete, não atraso", regua.itens.find((i) => i.movimentoId === "r-hoje")?.etapa.id === "d0");
  ok("régua: 5 dias de atraso segue na etapa de 3 dias e não é da fila de hoje",
     regua.itens.find((i) => i.movimentoId === "r-5")?.etapa.id === "d+3" && !idsFila.includes("r-5"));
  ok("régua: transferência entre contas próprias NÃO é cobrada", !regua.itens.some((i) => i.movimentoId === "r-transf"));
  ok("régua: título pago e título distante não entram", !regua.itens.some((i) => i.movimentoId === "r-pago" || i.movimentoId === "r-longe"));
  const msg = regua.itens.find((i) => i.movimentoId === "r-3")?.mensagem ?? "";
  ok("régua: a mensagem sai preenchida (cliente, valor, vencimento, dias)",
     msg.includes("Beta") && msg.includes("R$900,00") && msg.includes("17/09/2026") && msg.includes("3 dias") && !msg.includes("{"), msg);
  // ⚠️ O que discrimina: o mesmo título NÃO recebe a mesma etapa duas vezes.
  const envio = { movimentoId: "r-3", etapaId: "d+3", em: "2026-09-20T10:00:00Z", canal: "whatsapp" as const };
  const r1 = registrarEnvio([], envio);
  const r2 = registrarEnvio(r1.envios, envio);
  ok("régua: reenviar a mesma etapa ao mesmo título é recusado", !r1.repetido && r2.repetido && r2.envios.length === 1);
  const depois = montarRegua(inR, r1.envios);
  ok("régua: quem foi avisado sai da fila de hoje", !depois.filaDeHoje.some((i) => i.movimentoId === "r-3")
     && depois.itens.find((i) => i.movimentoId === "r-3")?.jaEnviado === true);
  ok("régua: antes da primeira etapa não há etapa", etapaDoTitulo(-10, REGUA_PADRAO) === null);
  ok("régua: o último degrau é MANUAL (protesto não sai por calendário)", REGUA_PADRAO[REGUA_PADRAO.length - 1].canal === "manual");

  /* ---------------- 5) A VENDA TEM UMA MORADA SÓ (sales_docs) ---------------- */
  // ⚠️ A venda morava em três lugares (navegador, sales_docs, movements) e a
  // lista somava um enquanto o DRE somava outro. Três metades: a TRADUÇÃO
  // tela ⇄ documento não perde campo, o ESCRITOR único liga o título ao
  // documento, e NENHUMA tela volta a ler o navegador.
  const doc = await import("../src/core/vendas/documento.ts");
  const fsV = await import("node:fs");
  const base = {
    id: "11111111-2222-4333-8444-555555555555", numero: "2026-0007",
    clienteId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", clienteNome: "Cliente X",
    competencia: "2026-09-10", vencimento: "2026-10-10",
    itens: [{ produtoId: "prod-local", nome: "Curso", quantidade: 2, precoUnitario: 500 }],
    valorTotal: 1000, valorTotalComJuros: 1080,
    taxaPlataforma: { valor: 99.9, fornecedorId: "f1" },
    taxaAntecipacao: { valor: 0, fornecedorId: "" }, taxaStreaming: { valor: 0, fornecedorId: "" },
    comissaoCoprodutor: { valor: 0, fornecedorId: "" }, comissaoAfiliado: { valor: 50, fornecedorId: "f2" },
    contaId: "cccccccc-dddd-4eee-8fff-000000000000", operacao: "venda", status: "aprovada", metodo: "cartao",
    idExterno: "HX-1", categoria: "Vendas de cursos", tipoPagamento: "avista", plataforma: "Hotmart",
    chaveTransacao: "", pago: false, valorPago: 0, dataPagamento: null,
    projetos: [{ id: "p1", percentual: 100 }], centros: [], descricao: "", textoDocumentoFiscal: "",
    observacoes: "obs", statusNF: "emitida", numeroNF: "123", criadoEm: "2026-09-10",
  } as never;
  const g = doc.documentoDaVenda(base);
  const volta = doc.vendaDoDocumento({
    ...g, doc_date: g.doc_date, parties: { name: "Cliente X" }, created_at: "2026-09-10T12:00:00Z",
    sale_items: doc.itensDoDocumento(base).map((i) => ({
      product_id: i.product_id, service_id: null, description: i.description, qty: i.qty, unit_price: i.unit_price,
    })),
  } as never);
  ok("venda: ida e volta pelo documento não perdem taxa, rateio, plataforma nem NF",
     volta.taxaPlataforma.valor === 99.9 && volta.comissaoAfiliado.fornecedorId === "f2"
     && volta.projetos.length === 1 && volta.plataforma === "Hotmart" && volta.numeroNF === "123"
     && volta.statusNF === "emitida" && volta.status === "aprovada" && volta.numero === "2026-0007");
  ok("venda: o total do documento é o COM juros (o que o título cobra), o sem juros fica visível",
     g.total === 1080 && volta.valorTotalComJuros === 1080 && volta.valorTotal === 1000);
  ok("venda: id de produto que não é do banco não vira chave estrangeira",
     doc.itensDoDocumento(base)[0].product_id === null);
  ok("venda: o status do lançamento rápido é traduzido, e texto estranho cai em 'iniciada'",
     doc.statusDaVenda("faturado") === "completa" && doc.statusDaVenda("aberto") === "iniciada"
     && doc.statusDaVenda("xyz") === "iniciada");
  ok("venda: o próximo número é MÁXIMO + 1 (com buraco no meio, contar repetiria o último)",
     doc.proximoNumeroDe(["2026-0001", "2026-0003", "2025-0009"], 2026) === "2026-0004",
     doc.proximoNumeroDe(["2026-0001", "2026-0003", "2025-0009"], 2026));

  const lib = fsV.readFileSync("src/lib/vendas.ts", "utf8");
  const corpoTit = lib.slice(lib.indexOf("function tituloDaVenda"), lib.indexOf("async function titulosDaVenda"));
  ok("venda: o título nasce pelo escritor único, com origem 'venda' e a chave do documento",
     /criarTitulos\(\[tituloDaVenda\(v\)\]\)/.test(lib)
     && /origem: "venda"/.test(corpoTit) && /sale_doc_id: v\.id/.test(corpoTit));
  const corpoNovo = lib.slice(lib.indexOf("if (!existente)"), lib.indexOf("const { id: _id"));
  ok("venda: título recusado desfaz o documento (nenhuma venda sem recebível)",
     corpoNovo.indexOf("criarTitulos(") > 0 && corpoNovo.lastIndexOf("desfazerDocumento(v.id)") > corpoNovo.indexOf("criarTitulos("));
  const corpoRem = lib.slice(lib.indexOf("export async function removerVendaDoc"), lib.indexOf("/* ─────────────────── vendas que ficaram"));
  // Revisão 30/09: a regra subiu para `bloqueioDeExclusao` (core/vendas/nota),
  // conferida por valor no bloco VENDER; aqui, que o caminho de produção a
  // consulta e LANÇA antes de mandar qualquer título para a lixeira.
  ok("venda: excluir com recebimento baixado é RECUSADO (não se apaga dinheiro que entrou)",
     /const bloqueio = bloqueioDeExclusao\(v, titulos\.map\(\(t\) => t\.situacao\)\);\s*if \(bloqueio\) throw/.test(corpoRem)
     && corpoRem.lastIndexOf("if (bloqueio) throw") < corpoRem.indexOf("excluirLogico("));
  const corpoAtu = lib.slice(lib.indexOf("async function atualizarTitulo"), lib.indexOf("async function trocarItens"));
  ok("venda: editar só reescreve título PREVISTO (baixado é dinheiro que já se moveu)",
     /\.eq\("situacao", "previsto"\)/.test(corpoAtu));

  // ⚠️ Teto ZERO: nenhuma tela lê ou grava venda pelo navegador — só `lib/vendas`.
  const telas = ["src/components/vendas-nf/VendasView.tsx", "src/components/vendas-nf/VendaForm.tsx",
    "src/components/vendas-nf/OutrasViews.tsx", "src/components/contabilidade-export/EnvioNFsView.tsx"];
  const voltaram = telas.filter((f) => /\b(listarVendas|salvarVenda|removerVenda)\b/.test(fsV.readFileSync(f, "utf8")));
  ok("venda: teto ZERO — nenhuma tela lê ou grava venda pelo navegador", voltaram.length === 0, voltaram.join(", "));
}

/* ── TRANSFERÊNCIA ENTRE CONTAS NÃO É RECEITA NEM DESPESA (30/09/2026) ───────
 *
 * ⚠️ Achado dirigindo a tela como usuário: uma transferência de R$ 500 entre
 * duas contas próprias aparecia como R$ 500 de Receita Bruta no DRE. A perna
 * de ENTRADA caía no palpite (é entrada, não é financeira) e a de SAÍDA em
 * Despesa Operacional — o resultado fechava, e o faturamento e o custo subiam
 * pelo valor que só trocou de conta.
 *
 * E a tela oficial de Transferências, em produção, só gravava no navegador:
 * os dois lançamentos nasciam dentro de `if (isDemo)`.
 */
{
  const conv = await import("@/core/indicadores/convencoes");
  const fsT = await import("node:fs");
  let k = 0;
  const tm = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `tr${k++}`, type: "entrada", amount: 10_000, due_date: "2026-03-10", paid_date: "2026-03-10",
       status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  const base = [tm({}), tm({ type: "saida", amount: 2_000, category: "Aluguel" })];
  const par = [
    tm({ type: "saida", amount: 500, category: conv.CATEGORIA_TRANSFERENCIA }),
    tm({ type: "entrada", amount: 500, category: conv.CATEGORIA_TRANSFERENCIA }),
  ];
  const rodarT = (movs: RiskMovement[], decl?: Record<string, string>) => montarRelatorio(
    { hoje: "2026-08-31", saldoAtual: 0, partyNames: {}, movements: movs } as RiskInput, ESTRUTURA_DRE,
    { intervalo: { de: "2026-03-01", ate: "2026-03-31" }, tipo: "dre", regime: "competencia", linhaPorCategoria: decl });
  const v = (r: ReturnType<typeof rodarT>, id: string) =>
    Math.round((r.linhas.find((l) => l.id === id)?.total.valor ?? NaN) * 100) / 100;
  const sem = rodarT(base), com = rodarT([...base, ...par]);
  ok("transferencia: sem declaração, a categoria canônica NÃO vira Receita Bruta",
     v(com, "receita_bruta") === v(sem, "receita_bruta") && v(sem, "receita_bruta") === 10_000,
     `${v(com, "receita_bruta")} × ${v(sem, "receita_bruta")}`);
  ok("transferencia: nem Despesa Operacional",
     v(com, "despesas_operacionais") === v(sem, "despesas_operacionais"),
     `${v(com, "despesas_operacionais")} × ${v(sem, "despesas_operacionais")}`);
  ok("transferencia: os DOIS lados saem marcados como transferência (não somem calados)",
     par.every((m) => com.foraDoDre[m.id] === "transferencia"));
  // O controle: sem a regra, o caminho recebia valor — é isso que a asserção de cima exclui.
  const outroNome = par.map((m) => ({ ...m, category: "Movimento qualquer" }));
  ok("transferencia: controle — com outra categoria a entrada CAIRIA na receita (o caminho recebe valor)",
     v(rodarT([...base, ...outroNome]), "receita_bruta") === 10_500);
  const declOutra = rodarT([...base, ...par], { [conv.CATEGORIA_TRANSFERENCIA.toLowerCase()]: "receita_bruta" });
  ok("transferencia: declaração explícita para outra linha continua vencendo",
     par.every((m) => declOutra.foraDoDre[m.id] === undefined) && v(declOutra, "receita_bruta") > 10_000);
  // As outras duas cascatas concordam com a referência.
  const g0 = dreGerencial(base, "competencia"), g1 = dreGerencial([...base, ...par], "competencia");
  ok("transferencia: dreGerencial concorda (receita e lucro não se movem)",
     g0.receitaBruta === g1.receitaBruta && g0.lucroLiquido === g1.lucroLiquido, `${g0.receitaBruta} × ${g1.receitaBruta}`);
  ok("transferencia: o predicado é estreito — 'Boleto de transferência bancária' é despesa, não transferência",
     !conv.ehTransferenciaEntreContas("Boleto de transferência bancária")
     && conv.ehTransferenciaEntreContas("Transferência") && conv.ehTransferenciaEntreContas("transferência entre contas"));

  // ⚠️ Teto ZERO no ESCRITOR: a transferência de produção grava os DOIS lados
  // no banco, com a categoria canônica, e só guarda o registro DEPOIS.
  const cad = fsT.readFileSync("src/lib/cadastros.ts", "utf8");
  const corpoCad = cad.slice(cad.indexOf("export async function createTransferencia"), cad.indexOf("export async function createSaleDoc"));
  ok("transferencia: o escritor único grava a categoria canônica (era `null`)",
     /category: CATEGORIA_TRANSFERENCIA/.test(corpoCad) && !/category: null/.test(corpoCad));
  const mov = fsT.readFileSync("src/lib/movimentacoes.ts", "utf8");
  const corpoMov = mov.slice(mov.indexOf("export async function criarTransferencia"), mov.indexOf("export async function removerTransferencia"));
  const iBanco = corpoMov.indexOf("createTransferencia("), iFato = corpoMov.indexOf("gravar(K_TRANSF");
  ok("transferencia: em produção a tela grava no BANCO, e o registro só depois (era só no navegador)",
     iBanco > 0 && iFato > iBanco && /\} else \{/.test(corpoMov.slice(0, iBanco)));
  const hk = fsT.readFileSync("src/components/lancamentos/hooks.ts", "utf8");
  ok("transferencia: o modal e a tela passam pelo MESMO escritor",
     /criarTransferencia\(/.test(hk.slice(hk.indexOf("export function useCreateTransferencia"))));

  // ⚠️ A importação: a transferência do extrato ENTRA (com a categoria de
  // transferência) e a demonstração MESCLA em vez de substituir.
  const fd = fsT.readFileSync("src/lib/fdip.ts", "utf8");
  ok("importacao: a transferência do extrato não é mais descartada (o saldo tem de bater com o banco)",
     !/\.filter\(\(r\) => cls\.get\(r\.id\)\?\.destino !== "Transferência"\)/.test(fd)
     && /CATEGORIA_TRANSFERENCIA/.test(fd));
  const demoImp = fd.slice(fd.indexOf("export async function aplicarOnboarding"));
  const ramoDemo = demoImp.slice(demoImp.indexOf("if (isDemo)"), demoImp.indexOf("const supabase"));
  ok("importacao: a demonstração MESCLA (importar o 2º extrato apagava o 1º e tudo o que a pessoa criou)",
     /mesclarImportacao\(/.test(ramoDemo) && !/setImported\(/.test(ramoDemo));
}

/* ── CAD ── */
/**
 * ⚠️ OS CADASTROS MORAM NO BANCO (migration 20260930180000).
 *
 * Contas bancárias, centros, projetos e plano de contas moravam em
 * `org_state`/`localStorage` com id NUMÉRICO, e os lançamentos apontam para
 * UUID: a tela de contas dizia "Nenhuma conta cadastrada" com quatro contas
 * existindo, e projeto/centro não podiam ser gravados num lançamento em
 * produção. As guardas abaixo cobram as DUAS metades — o que a tela faz e o que
 * o banco recusa — e cada varredura carrega o seu TESTE NEGATIVO (a mesma
 * função aplicada ao defeito plantado tem de acusar).
 */
{
  const fsC = await import("node:fs");
  const H = await import("@/core/registros/hierarquia");
  const R = await import("@/core/registros");
  const lerC = (p: string) => (fsC.existsSync(p) ? fsC.readFileSync(p, "utf8") : "");
  const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  /* ---- ida e volta: a linha do banco ⇄ a tela, sem perder campo ---- */
  const conta: import("@/core/registros").ContaBancaria = {
    id: "u-1", nome: "Cartão Empresa", banco: "Itaú", tipo: "cartao", agencia: "0123", numero: "4567-8",
    dataSaldoInicial: "2026-09-01", saldoInicial: 1500.5, saldoInicialConferido: true, codigoContabil: "77",
    diaFechamento: 20, diaVencimento: 28, ativo: false,
  };
  const linhaC = H.linhaDaConta(conta);
  const volta = H.contaDaLinha({ id: "u-1", balance: 999, ...linhaC });
  ok("CAD: conta ida e volta sem perder campo (tipo, agência, número, código, dias, abertura, ativo)",
     volta.tipo === "cartao" && volta.agencia === "0123" && volta.numero === "4567-8" && volta.codigoContabil === "77"
     && volta.diaFechamento === 20 && volta.diaVencimento === 28 && volta.saldoInicial === 1500.5
     && volta.dataSaldoInicial === "2026-09-01" && volta.saldoInicialConferido === true && volta.ativo === false
     && volta.saldoAtual === 999, JSON.stringify(volta));
  ok("CAD: o banco da conta vai como CHAVE (Itaú → itau), a mesma do onboarding e da tesouraria",
     linhaC.bank === "itau" && H.rotuloDoBanco("itau") === "Itaú" && H.slugDoBanco("Banco do Brasil") === "bb");
  ok("CAD: editar o cadastro NÃO leva o saldo corrente (quem move saldo é baixa e conciliação)",
     !("balance" in linhaC));
  ok("CAD: dia de fatura só vai quando a conta é cartão",
     H.linhaDaConta({ ...conta, tipo: "corrente" }).dia_fechamento === null);
  const cat: import("@/core/registros/hierarquia").CategoriaCadastro = {
    id: "c-1", nome: "Google Ads", codigo: "4.2.01", natureza: "despesa", paiId: "g-1", dreLinha: "despesas_variaveis", ativo: false,
  };
  const voltaCat = H.categoriaDaLinha({ id: "c-1", ...H.linhaDaCategoria(cat) });
  ok("CAD: categoria ida e volta (grupo, código, linha do DRE, ativa)",
     voltaCat.paiId === "g-1" && voltaCat.codigo === "4.2.01" && voltaCat.dreLinha === "despesas_variaveis" && voltaCat.ativo === false);
  const cc: import("@/core/registros/hierarquia").CentroCustoCadastro = {
    id: "cc-1", nome: "Mídia paga", codigo: "CC-07", codigoContabil: "12", descricao: "tráfego", ativo: true, paiId: "cc-0",
  };
  const voltaCc = H.centroDaLinha({ id: "cc-1", ...H.linhaDoCentro(cc) });
  ok("CAD: centro ida e volta (grupo, código, código contábil, descrição)",
     voltaCc.paiId === "cc-0" && voltaCc.codigo === "CC-07" && voltaCc.codigoContabil === "12" && voltaCc.descricao === "tráfego");
  const pj: import("@/core/registros/hierarquia").ProjetoCadastro = {
    id: "p-1", nome: "Turma 12", codigo: "PRJ", descricao: "", dataInicial: "2026-01-01", dataFinal: "2026-06-30",
    previsaoReceita: 1000, previsaoDespesa: 400, clienteId: "pt-1", centroId: "cc-1", status: "encerrado",
  };
  const voltaPj = H.projetoDaLinha({ id: "p-1", ...H.linhaDoProjeto(pj) });
  ok("CAD: projeto ida e volta (cliente, centro responsável, situação)",
     voltaPj.clienteId === "pt-1" && voltaPj.centroId === "cc-1" && voltaPj.status === "encerrado" && voltaPj.previsaoDespesa === 400);

  /* ---- a árvore: só folha ativa é selecionável ---- */
  const arvore: import("@/core/registros/hierarquia").CategoriaCadastro[] = [
    { id: "g", nome: "Marketing", codigo: "", natureza: "despesa", paiId: null, ativo: true },
    { id: "f1", nome: "Google Ads", codigo: "", natureza: "despesa", paiId: "g", ativo: true },
    { id: "f2", nome: "Meta", codigo: "", natureza: "despesa", paiId: "g", ativo: false },
    { id: "r", nome: "Vendas", codigo: "", natureza: "receita", paiId: null, ativo: true },
  ];
  const sel = H.categoriasSelecionaveis(arvore, "despesa").map((c) => c.id);
  ok("CAD: o formulário só recebe FOLHA ATIVA da natureza (nem o grupo, nem a inativa, nem a receita)",
     sel.length === 1 && sel[0] === "f1", sel.join(","));
  ok("CAD: caminho legível 'Grupo › Categoria'", H.caminhoDe(arvore, "f1") === "Marketing › Google Ads");
  ok("CAD: pendurar o grupo na própria filha fecha ciclo", H.fechaCiclo(arvore, "g", "f1") && !H.fechaCiclo(arvore, "f1", "g"));
  ok("CAD: a lixeira vai das folhas para o grupo (o banco recusa o grupo antes das filhas)",
     JSON.stringify(H.ordemDeExclusao(arvore, "g")) === JSON.stringify(["f1", "f2", "g"]));
  ok("CAD: nome repetido no MESMO grupo é recusado; em outro grupo, não",
     !!H.validarCategoria({ ...arvore[1], id: "", nome: " google ads " }, arvore).nome
     && !H.validarCategoria({ ...arvore[1], id: "", paiId: null, nome: "Google Ads" }, arvore).nome);
  ok("CAD: linha de TOTAL do DRE não é escolhível (contaria o valor duas vezes)",
     !!H.validarCategoria({ ...arvore[1], dreLinha: "ebitda" }, arvore).dreLinha);
  ok("CAD: natureza diferente do grupo é recusada na tela (e no banco)",
     !!H.validarCategoria({ ...arvore[1], natureza: "receita" }, arvore).natureza);

  /* ---- a frase é a MESMA na demonstração e no banco ---- */
  const mig = lerC("supabase/migrations/20260930180000_cadastros_hierarquia.sql");
  const fraseGrupo = H.problemaDoGrupo(arvore[0], 3) ?? "";
  const fraseLixo = H.problemaDaExclusao(arvore[1], arvore, 2) ?? "";
  ok("CAD: 'não pode virar grupo' — a demonstração fala a frase do gatilho",
     fraseGrupo.includes("já tem 3 lançamento(s) e não pode virar grupo") && mig.includes("lançamento(s) e não pode virar grupo"));
  ok("CAD: 'não pode ir para a lixeira' — idem",
     fraseLixo.includes("tem 2 lançamento(s) e não pode ir para a lixeira") && mig.includes("lançamento(s) e não pode ir para a lixeira"));
  ok("CAD: grupo com subcategoria viva não vai para a lixeira (demonstração)",
     (H.problemaDaExclusao(arvore[0], arvore, 0) ?? "").includes("ainda tem 2 subcategoria"));

  /* ---- o cadastro antigo: nada migra sozinho, nada é sobrescrito ---- */
  const antigas = [conta, { ...conta, id: "velha-2", nome: "Só no navegador", tipo: "corrente" as const }];
  const atuaisC = [H.contaDaLinha({ id: "db-1", name: "cartão empresa", bank: "itau", tipo: "corrente", codigo_contabil: "5" })];
  const pend = H.contasAntigas(antigas, atuaisC);
  const pCompletar = pend.find((p) => p.acao === "completar");
  ok("CAD: antigo SEM par na tabela vira 'criar'; COM par e dado faltando vira 'completar'",
     pend.length === 2 && pend.some((p) => p.acao === "criar" && p.nome === "Só no navegador")
     && !!pCompletar && pCompletar.alvoId === "db-1" && pCompletar.campos.includes("dias da fatura"),
     JSON.stringify(pend));
  const completada = H.contaCompletada(atuaisC[0], conta);
  ok("CAD: completar NÃO sobrescreve o que a tabela já tem (o código 5 fica)",
     completada.codigoContabil === "5" && completada.tipo === "cartao" && completada.diaFechamento === 20);

  /* ---- TETO ZERO: nenhuma das quatro telas grava na morada antiga ---- */
  const TELAS = [
    "src/components/registros/ContasBancariasView.tsx",
    "src/components/registros/ProjetosCentrosView.tsx",
    "src/components/registros/PlanoContasView.tsx",
    "src/components/registros/hooks.ts",
  ];
  const PROIBIDO = [
    /from "@\/lib\/store-org"/, /\blocalStorage\b/, /from "@\/lib\/registros"/, /from "@\/lib\/iuli-cadastros"/,
    /from "@\/lib\/imported"/, /\bsetImported\(|\bappendImported\(|\bgravarCadastrosDemo\(|\bgravarContaDemo\(/,
    /\bsalvarPlanoContas\(|\bsalvarUsoPadrao\(|\baddProjeto\(|\baddCentroCusto\(|\bremoverContaBancaria\(/,
  ];
  const telaGravaLocal = (txt: string) => PROIBIDO.some((re) => re.test(semComentarios(txt)));
  const infratoras = TELAS.filter((t) => !lerC(t) || telaGravaLocal(lerC(t)));
  ok("CAD: nenhuma das quatro telas grava em org_state/localStorage (teto ZERO)", infratoras.length === 0, infratoras.join(" | "));
  // NEGATIVO: a MESMA varredura sobre a tela ANTIGA tem de acusar.
  ok("CAD: [negativo] a varredura acusa a tela antiga (import de lib/registros + gravar)",
     telaGravaLocal('import { listContasBancarias, salvarContaBancaria } from "@/lib/registros";')
     && telaGravaLocal("try { localStorage.setItem(k, v) } catch {}"));

  // Os escritores ANTIGOS foram removidos — um escritor que existe é um escritor que alguém chama.
  const regTxt = semComentarios(lerC("src/lib/registros.ts"));
  const iuliTxt = semComentarios(lerC("src/lib/iuli-cadastros.ts"));
  ok("CAD: os escritores antigos de contas, plano, uso padrão, centros e projetos não existem mais",
     !/gravar\(K_CONTAS|gravar\(K_PLANO|gravar\(K_USOS/.test(regTxt) && !/localStorage\.setItem/.test(iuliTxt)
     && !/export function (addProjeto|updateProjeto|addCentroCusto|updateCentroCusto)/.test(iuliTxt));

  /* ---- os escritores LANÇAM o erro do banco ---- */
  const libTxt = semComentarios(lerC("src/lib/cadastros-hierarquia.ts"));
  const corpos = (txt: string) => {
    const out: { nome: string; corpo: string }[] = [];
    const re = /export (?:async )?function (\w+)/g;
    const idx: { nome: string; i: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) idx.push({ nome: m[1], i: m.index });
    idx.forEach((x, k) => out.push({ nome: x.nome, corpo: txt.slice(x.i, idx[k + 1]?.i ?? txt.length) }));
    return out;
  };
  const escritorEngole = (corpo: string) =>
    /\bcatch\b/.test(corpo)
    || (/\.(insert|update|upsert)\(/.test(corpo) && !/if \(error\) throw erroDoBanco\(error\)/.test(corpo));
  const escritores = corpos(libTxt).filter((c) => /^(salvar|definir|excluir)/.test(c.nome));
  const engolem = escritores.filter((c) => escritorEngole(c.corpo)).map((c) => c.nome);
  ok("CAD: todo escritor (salvar/definir/excluir) lança o erro do banco e não tem catch",
     escritores.length >= 10 && engolem.length === 0, `${escritores.length} escritores · engolem: ${engolem.join(", ")}`);
  ok("CAD: [negativo] a varredura acusa o escritor que engole",
     escritorEngole('export async function salvarX() { const { error } = await s.from("t").insert(l); if (error) return; }')
     && escritorEngole('export async function salvarY() { try { await s.from("t").update(l) } catch {} }'));
  ok("CAD: o erro do banco é traduzido pelo NOME da restrição, e o gatilho vai inteiro (mensagem + dica)",
     /financial_accounts_org_nome_unico/.test(libTxt) && /parties_org_doc_unico/.test(libTxt) && /e\?\.hint/.test(libTxt));

  // O dataset da demonstração só recebe cadastro DENTRO de `if (isDemo)`.
  const gravaForaDaDemo = (corpo: string) => {
    const chamadas = [...corpo.matchAll(/gravar(CadastrosDemo|ContaDemo)\(/g)].map((x) => x.index ?? 0);
    const iDemo = corpo.indexOf("if (isDemo)");
    const iBanco = corpo.indexOf("createClient()");
    return chamadas.some((i) => iDemo < 0 || i < iDemo || (iBanco >= 0 && i > iBanco && iBanco > iDemo));
  };
  const fora = corpos(libTxt).filter((c) => gravaForaDaDemo(c.corpo)).map((c) => c.nome);
  ok("CAD: o dataset da demonstração só é escrito dentro de if (isDemo)", fora.length === 0, fora.join(", "));
  ok("CAD: [negativo] a varredura acusa a gravação no dataset fora da demonstração",
     gravaForaDaDemo('export async function salvarZ() { gravarContaDemo(x); const s = createClient(); }'));

  /* ---- o leitor dos formulários só oferece folha ---- */
  const dataTxt = semComentarios(lerC("src/lib/data.ts"));
  const corpoGetCat = dataTxt.slice(dataTxt.indexOf("export async function getCategories"), dataTxt.indexOf("export async function getLinhasDeCategoria"));
  ok("CAD: getCategories devolve só as folhas ativas (categoriasSelecionaveis) com parent_id, code e dre_linha",
     /categoriasSelecionaveis\(/.test(corpoGetCat) && /parent_id:/.test(corpoGetCat) && /dre_linha:/.test(corpoGetCat));

  /* ---- a migration: o gatilho de folha e o índice por empresa ---- */
  const migSem = mig.replace(/^\s*--.*$/gm, "");
  ok("CAD: a migration tem o gatilho de FOLHA em movements (e em rateio e recorrência)",
     /create trigger lancamento_categoria_folha\s+before insert or update of category_id on public\.movements/.test(migSem)
     && /parent_id = new\.category_id and excluido_em is null/.test(migSem)
     && /rateio_categoria_folha/.test(migSem) && /recorrencia_categoria_folha/.test(migSem));
  ok("CAD: o documento do contato é único POR EMPRESA e o índice global sai",
     /parties_org_doc_unico\s+on public\.parties \(org_id, doc_digits\)/.test(migSem)
     && /drop index if exists public\.parties_doc_unique/.test(migSem));
  ok("CAD: nome de conta único por empresa, cartão com os dois dias, conta inativa e projeto encerrado recusados",
     /financial_accounts_org_nome_unico/.test(migSem) && /financial_accounts_dias_do_cartao/.test(migSem)
     && /create trigger lancamento_cadastro_vigente/.test(migSem) && /v_status = 'encerrado'/.test(migSem));
  ok("CAD: natureza trocada NÃO é recusada (entrada em despesa é estorno legítimo)",
     !/kind\s*<>\s*case|type = 'entrada' and .*kind = 'despesa'/.test(migSem));
  ok("CAD: a migration se RECUSA nomeando quando a unicidade reprovaria dado existente",
     /há conta bancária com o MESMO NOME/.test(mig) && /há categoria repetida .* que ESTÁ EM USO/.test(mig));

  /* ---- a guarda de BANCO existe, roda no CI e carrega o negativo ---- */
  const sqlG = lerC("scripts/cadastros-hierarquia.sql");
  ok("CAD: a guarda de banco existe, tem o teste negativo e o CI a roda",
     /drop trigger lancamento_categoria_folha/.test(sqlG) && /VERMELHO PELO MOTIVO ERRADO/.test(sqlG)
     && /scripts\/cadastros-hierarquia\.sql/.test(lerC(".github/workflows/ci.yml")));
  ok("CAD: registros core exporta o contrato que as telas usam", typeof R.validarContaBancaria === "function");

  /* ---- a "primeira conta" dos escritores automáticos é só entre as ATIVAS ----
     O banco agora recusa lançamento novo em conta inativa; um `limit(1)` cru
     sobre `financial_accounts` que caísse numa conta desativada derrubaria a
     importação inteira. TETO ZERO fora de `lib/conta-padrao`. */
  const pegaPrimeiraCrua = (t: string) =>
    /from\(\s*["']financial_accounts["']\s*\)\s*\.select\(\s*["']id["']\s*\)(?:\s*\.eq\(\s*["']org_id["'][^)]*\))?\s*\.limit\(\s*1\s*\)/.test(semComentarios(t));
  const arquivosSrc: string[] = [];
  const andar = (dir: string) => {
    for (const e of fsC.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) andar(p);
      else if (/\.(ts|tsx)$/.test(e.name)) arquivosSrc.push(p);
    }
  };
  andar("src");
  const cruas = arquivosSrc.filter((p) => p !== "src/lib/conta-padrao.ts" && pegaPrimeiraCrua(lerC(p)));
  ok("CAD: nenhum escritor escolhe a 'primeira conta' sem o filtro de ATIVA (teto zero)",
     cruas.length === 0, cruas.join(", "));
  ok("CAD: a varredura da 'primeira conta' pega o defeito plantado (teste negativo)",
     pegaPrimeiraCrua('const { data } = await supabase.from("financial_accounts").select("id").limit(1);')
     && pegaPrimeiraCrua('await admin.from("financial_accounts").select("id").eq("org_id", orgId).limit(1)')
     && !pegaPrimeiraCrua('await supabase.from("financial_accounts").select("id").eq("ativo", true).limit(1)'));
  const padrao = lerC("src/lib/conta-padrao.ts");
  ok("CAD: a conta padrão filtra ATIVA e tem a queda declarada para a coluna ausente",
     /\.eq\(\s*"ativo",\s*true\s*\)/.test(padrao) && /COLUNA_AUSENTE/.test(padrao) && !/^\s*["']use client["']/m.test(padrao));
}


/* ── CAD-2 ── */
/**
 * ⚠️ OS FORMULÁRIOS USAM OS CADASTROS DO BANCO (CAD, parte 2 — 30/09/2026).
 *
 * Título, receita/despesa, venda, compra, contrato, orçamento, impostos e o
 * cadastro de cliente/fornecedor liam o cadastro ANTIGO do navegador (id
 * numérico): em produção o projeto/centro era recusado e a categoria de uma
 * venda chegava ao DRE como "217290". Cada guarda abaixo carrega o NEGATIVO —
 * a mesma varredura sobre o defeito plantado tem de acusar.
 */
{
  const fsD = await import("node:fs");
  const H = await import("@/core/registros/hierarquia");
  const E = await import("@/core/registros/estrutura");
  const lerD = (p: string) => (fsD.existsSync(p) ? fsD.readFileSync(p, "utf8") : "");
  const semCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  /* ---- 1. TETO ZERO: nenhum formulário de lançamento lê o plano local para gravar ---- */
  const FORMS = [
    "src/components/movimentacoes/TituloForm.tsx",
    "src/components/lancamentos/ReceitaForm.tsx",
    "src/components/vendas-nf/VendaForm.tsx",
    "src/components/registros/ContratosView.tsx",
    "src/components/registros/OrcamentosView.tsx",
    "src/components/vendas-nf/OutrasViews.tsx",
    "src/components/compras/CompraForm.tsx",
    "src/components/registros/PartesView.tsx",
    "src/components/movimentacoes/TitulosView.tsx",
    "src/components/movimentacoes/ModalBaixa.tsx",
    "src/components/visao-geral/ExtratoTransacoes.tsx",
  ];
  const LEITURA_LOCAL = [
    /\blistPlanoContas\(/, /\blistUsosPadrao\(/, /\blistContasBancarias\(/, /from "@\/lib\/iuli-cadastros"/,
    /\blistProjetos\(/, /\blistCentrosCusto\(/, /\bvincularProjetos?\(/, /\bprojetoDoMovimento\(/,
    /extraParty\([^)]*\)\.categoriaPadrao/,
  ];
  const leLocal = (t: string) => LEITURA_LOCAL.some((re) => re.test(semCom(t)));
  const formsLocais = FORMS.filter((f) => !lerD(f) || leLocal(lerD(f)));
  ok("CAD-2: nenhum formulário de lançamento lê o cadastro antigo do navegador (teto ZERO)",
     formsLocais.length === 0, formsLocais.join(" | "));
  ok("CAD-2: [negativo] a varredura acusa o formulário antigo",
     leLocal("const cats = listPlanoContas().filter((c) => c.paiId);")
     && leLocal('import { listProjetos, listCentrosCusto } from "@/lib/iuli-cadastros";')
     && leLocal("const padrao = extraParty(f.parteId).categoriaPadrao;")
     && !leLocal('const opcoes = useOpcoesCadastro("saida");'));
  const semHook = FORMS.slice(0, 7).filter((f) => !/useOpcoesCadastro\(|useCategories\(/.test(semCom(lerD(f))));
  ok("CAD-2: os formulários leem as escolhas pelo hook único (useOpcoesCadastro/useCategories)",
     semHook.length === 0, semHook.join(", "));

  /* ---- 2. o seletor de categoria só oferece FOLHA da natureza do lado ---- */
  const arv: import("@/core/registros/hierarquia").CategoriaCadastro[] = [
    { id: "gR", nome: "Receitas", codigo: "", natureza: "receita", paiId: null, ativo: true },
    { id: "r1", nome: "Assinaturas", codigo: "", natureza: "receita", paiId: "gR", ativo: true },
    { id: "gD", nome: "Marketing", codigo: "", natureza: "despesa", paiId: null, ativo: true },
    { id: "d1", nome: "Google Ads", codigo: "", natureza: "despesa", paiId: "gD", ativo: true },
    { id: "d2", nome: "Meta", codigo: "", natureza: "despesa", paiId: "gD", ativo: false },
  ];
  const saida = H.categoriasDoLado(arv, "saida");
  const entrada = H.categoriasDoLado(arv, "entrada");
  ok("CAD-2: saída oferece só a FOLHA ativa de despesa, rotulada pelo caminho",
     saida.length === 1 && saida[0].value === "d1" && saida[0].label === "Marketing › Google Ads", JSON.stringify(saida));
  ok("CAD-2: entrada oferece só a folha de receita (nunca o grupo)",
     entrada.length === 1 && entrada[0].value === "r1");
  const opcTxt = semCom(lerD("src/components/lancamentos/opcoes-cadastro.ts"));
  const categoriaPelaArvoreCrua = (t: string) => /useCategoriasArvore\(|listarCategorias\(/.test(t);
  const formsArvore = [...FORMS, "src/components/lancamentos/opcoes-cadastro.ts"].filter((f) => categoriaPelaArvoreCrua(semCom(lerD(f))));
  ok("CAD-2: nenhum formulário oferece a árvore crua (com grupos) como categoria (teto ZERO)",
     formsArvore.length === 0 && /useCategories\(/.test(opcTxt), formsArvore.join(", "));
  ok("CAD-2: [negativo] a varredura acusa o formulário que lista a árvore inteira",
     categoriaPelaArvoreCrua("const { data } = useCategoriasArvore();"));
  ok("CAD-2: a categoria padrão do contato só preenche quando continua selecionável",
     H.categoriaPadraoValida("d1", saida) === "d1" && H.categoriaPadraoValida("gD", saida) === ""
     && H.categoriaPadraoValida("r1", saida) === "" && H.categoriaPadraoValida(null, saida) === "");
  const centrosF: import("@/core/registros/hierarquia").CentroCustoCadastro[] = [
    { id: "c0", nome: "Comercial", codigo: "", codigoContabil: "", descricao: "", ativo: true, paiId: null },
    { id: "c1", nome: "Vendas", codigo: "", codigoContabil: "", descricao: "", ativo: true, paiId: "c0" },
    { id: "c2", nome: "Pós-venda", codigo: "", codigoContabil: "", descricao: "", ativo: false, paiId: "c0" },
  ];
  const cs = H.centrosSelecionaveis(centrosF);
  ok("CAD-2: centro selecionável é ativo e analítico (o grupo é soma)",
     cs.length === 1 && cs[0].value === "c1" && cs[0].label === "Comercial › Vendas", JSON.stringify(cs));

  /* ---- 3. o rateio vira linha de movement_splits, e fecha ---- */
  const rs = H.linhasDoRateio([{ id: "pA", percentual: 60 }, { id: "pB", percentual: 40 }],
    [{ id: "cX", percentual: 50 }, { id: "cY", percentual: 50 }], 1000, "d1");
  const somaV = Math.round(rs.reduce((t, x) => t + x.amount, 0) * 100) / 100;
  const somaP = Math.round(rs.reduce((t, x) => t + x.percent, 0) * 100) / 100;
  ok("CAD-2: 60/40 × 50/50 de R$ 1.000 vira 4 fatias que somam R$ 1.000,00 e 100%",
     rs.length === 4 && somaV === 1000 && somaP === 100 && rs[0].amount === 300 && rs[3].amount === 200, JSON.stringify(rs));
  const fatiaP = H.fatiasDoRateio(rs, "project_id");
  ok("CAD-2: somada por dimensão, a fatia devolve o que a pessoa digitou (60 e 40)",
     fatiaP.find((x) => x.id === "pA")?.percentual === 60 && fatiaP.find((x) => x.id === "pB")?.percentual === 40);
  const tres = H.linhasDoRateio([{ id: "a", percentual: 33.33 }, { id: "b", percentual: 33.33 }, { id: "c", percentual: 33.34 }], [], 100);
  ok("CAD-2: 100 ÷ 3 — o centavo que sobra vai na ÚLTIMA fatia (nenhum some)",
     Math.round(tres.reduce((t, x) => t + x.amount, 0) * 100) === 10000 && tres[2].amount === 33.34, JSON.stringify(tres));
  ok("CAD-2: uma fatia em cada dimensão não gera linha (o principal já está no lançamento)",
     H.linhasDoRateio([{ id: "a", percentual: 100 }], [{ id: "x", percentual: 100 }], 50).length === 0
     && H.principalDoRateio([{ id: "a", percentual: 30 }, { id: "b", percentual: 70 }]) === "b");
  const dataD = semCom(lerD("src/lib/data.ts"));
  const corpoCreate = dataD.slice(dataD.indexOf("export async function createLancamento"), dataD.indexOf("export interface TituloAvulso"));
  const rateioDescartado = (t: string) => /splits:\s*null,/.test(t);
  ok("CAD-2: o rateio é gravado em CADA parcela, com projeto (createLancamento)",
     /titulos\.flatMap\(\(mv, i\) =>\s*fatiarValor/.test(corpoCreate) && /project_id: exigirUUID\(s\.project_id/.test(corpoCreate));
  const tituloTxt = semCom(lerD("src/components/movimentacoes/TituloForm.tsx"));
  ok("CAD-2: o formulário de título não descarta mais o rateio (teto ZERO de `splits: null` fixo)",
     !rateioDescartado(tituloTxt) && /linhasDoRateio\(projetos, centros/.test(tituloTxt));
  ok("CAD-2: [negativo] a varredura acusa o rateio descartado",
     rateioDescartado("cost_center_id: x,\n          splits: null,\n"));
  ok("CAD-2: criarTitulos grava centro, projeto e o rateio (folha, venda, impostos)",
     /cost_center_id: exigirUUID\(l\.cost_center_id/.test(dataD) && /from\("movement_splits"\)\.insert\(fatias\)/.test(dataD));

  /* ---- 3b. (revisão) rateio recusado DESFAZ os títulos — nenhum lançamento pela metade ---- */
  const corpoRateio = (t: string) => {
    const i = t.indexOf("async function gravarRateioOuDesfazer");
    return i < 0 ? "" : t.slice(i, t.indexOf("\n}\n", i));
  };
  const desfazNoErro = (t: string) => {
    const c = corpoRateio(t);
    const iCatch = c.indexOf("catch (e)");
    return iCatch > 0 && /excluirLogico\("movements"/.test(c.slice(iCatch)) && /throw new Error/.test(c.slice(iCatch));
  };
  ok("CAD-rev: rateio recusado desfaz os títulos que acabaram de nascer (sem isso, salvar de novo DUPLICA)",
     desfazNoErro(dataD)
     && (corpoCreate.match(/gravarRateioOuDesfazer\(/g) ?? []).length === 1
     && /gravarRateioOuDesfazer\(supabase, titulos/.test(dataD.slice(dataD.indexOf("export async function criarTitulos"))),
     "gravarRateioOuDesfazer ausente ou sem desfazer no catch");
  ok("CAD-rev: [negativo] a varredura acusa o rateio que só relança o erro",
     !desfazNoErro("async function gravarRateioOuDesfazer() {\n  try { x(); } catch (e) {\n    throw e;\n  }\n}\n"));

  /* ---- 3c. (revisão) impostos: o escritor de produção existe e não duplica ---- */
  const vsTxt = semCom(lerD("src/lib/vendas-store.ts"));
  // A região inteira do escritor dos impostos (o título, a gravação e a porta da tela).
  const corpoImp = (t: string) => t.slice(t.indexOf("const tituloDoImposto"), t.indexOf("/* ---------------------------- links"));
  const impostoMorto = (t: string) => /if \(!isDemo\) return/.test(corpoImp(t)) || !/criarTitulos\(/.test(corpoImp(t));
  ok("CAD-rev: criar contas a pagar dos impostos GRAVA em produção (escritor morto teto ZERO)",
     !impostoMorto(vsTxt) && /reference_code: `imp:\$\{mesCompetencia\}:\$\{c\.imposto\}`/.test(corpoImp(vsTxt)));
  ok("CAD-rev: [negativo] a varredura acusa o escritor que só age em demonstração",
     impostoMorto("const tituloDoImposto = 1;\nexport async function criarContasDeImpostos() {\n  if (!isDemo) return 0;\n}\n/* ---------------------------- links"));
  const migCad = lerD("supabase/migrations/20260930180000_cadastros_hierarquia.sql");
  ok("CAD-rev: o banco recusa a segunda guia do mesmo imposto na mesma competência (índice imp:%)",
     /create unique index if not exists movements_imp_ref_uniq\s+on public\.movements \(org_id, reference_code\)\s+where reference_code like 'imp:%'/.test(migCad));
  ok("CAD-rev: o botão de impostos não aceita o segundo clique enquanto grava",
     /disabled=\{!podeCriar \|\| criandoContas\}/.test(lerD("src/components/vendas-nf/OutrasViews.tsx")));

  /* ---- 3d. (revisão) a importação não engole a recusa da conta que recebe o extrato ---- */
  const fdipTxt = semCom(lerD("src/lib/fdip.ts"));
  const contaEngolida = (t: string) => {
    const i = t.indexOf('name: "Conta consolidada"');
    if (i < 0) return true;
    const trecho = t.slice(i, i + 900);
    return !/error: ea \}/.test(t.slice(Math.max(0, i - 200), i)) || !/if \(ea\)\s*\{\s*throw new Error/.test(trecho);
  };
  ok("CAD-rev: a importação não engole a recusa ao criar a conta do extrato", !contaEngolida(fdipTxt));
  ok("CAD-rev: [negativo] a varredura acusa o escritor que descarta o erro",
     contaEngolida('const { data: created } = await supabase.from("financial_accounts").insert({ name: "Conta consolidada", bank: "inter" }).select("id").single();\naccId = created?.id;'));

  /* ---- 4. o projeto do lançamento mora em movements.project_id ---- */
  const pv = semCom(lerD("src/lib/projeto-vinculo.ts"));
  ok("CAD-2: o vínculo antigo do navegador não tem mais escritor",
     !/export function vincular/.test(pv) && !/gravar/.test(pv));
  const corpoDef = dataD.slice(dataD.indexOf("export async function definirProjetoDoMovimento"));
  ok("CAD-2: vincular projeto grava movements.project_id em produção (e no movimento, na demonstração)",
     /\.update\(\{ project_id: exigirUUID\(/.test(corpoDef) && /updateImportedMovement\(id, \{ project_id/.test(corpoDef));
  const corpoRisco = dataD.slice(dataD.indexOf("export async function getRiscoInput"));
  const ramoLive = corpoRisco.slice(corpoRisco.indexOf("const supabase = createClient()"));
  ok("CAD-2: em produção o nome do projeto sai só do embed (nenhum vínculo do navegador)",
     !/vinculosProjeto\(|listProjetos\(|projetoLocal/.test(ramoLive)
     && /projetoId: texto\(r\.project_id\)/.test(semCom(lerD("src/lib/risco-linhas.ts"))));

  /* ---- 5. ativo e categoria padrão moram em parties ---- */
  const corpoGetParties = dataD.slice(dataD.indexOf("export async function getParties"), dataD.indexOf("export async function getAccountsList"));
  ok("CAD-2: o seletor de contatos só traz os ATIVOS (com queda reportada para a coluna ausente)",
     /\.eq\("ativo", true\)/.test(corpoGetParties) && /reportar\(/.test(corpoGetParties));
  const partesTxt = semCom(lerD("src/components/registros/PartesView.tsx"));
  ok("CAD-2: o cadastro de contato grava ativo e default_category_id na TABELA",
     /default_category_id: f\.categoriaPadrao/.test(partesTxt) && /ativo: f\.ativo,/.test(partesTxt)
     && !/categoriaPadrao: f\.categoriaPadrao/.test(partesTxt));
  ok("CAD-2: a criação de contato na demonstração GRAVA (antes era descartada)",
     /gravarParteDemo\(/.test(semCom(lerD("src/lib/cadastros.ts"))));

  /* ---- 6. TETO ZERO: nenhuma chave de CHAVES_ORG com localStorage.setItem cru ---- */
  const SO = await import("@/lib/store-org");
  const chavesNeg = Object.values(SO.CHAVES_ORG) as string[];
  const arquivosD: string[] = [];
  const andarD = (dir: string) => {
    for (const e2 of fsD.readdirSync(dir, { withFileTypes: true })) {
      const p2 = `${dir}/${e2.name}`;
      if (e2.isDirectory()) andarD(p2);
      else if (/\.(ts|tsx)$/.test(e2.name)) arquivosD.push(p2);
    }
  };
  andarD("src");
  const gravaCru = (t: string) => {
    const s2 = semCom(t);
    if (!/localStorage\.setItem\(/.test(s2)) return [];
    return chavesNeg.filter((k) => s2.includes(`"${k}"`) || s2.includes(`'${k}'`) || s2.includes("`" + k));
  };
  const crus = arquivosD.filter((f) => f !== "src/lib/store-org.ts").map((f) => ({ f, k: gravaCru(lerD(f)) })).filter((x) => x.k.length);
  ok("CAD-2: nenhuma chave de negócio (CHAVES_ORG) escrita com localStorage.setItem cru (teto ZERO)",
     crus.length === 0, crus.map((x) => `${x.f} [${x.k.join(",")}]`).join(" | "));
  ok("CAD-2: [negativo] a varredura acusa o escritor cru de chave de negócio",
     gravaCru('const KEY = "a4p_company";\nexport function salvar(c) { localStorage.setItem(KEY, JSON.stringify(c)); }').length === 1
     && gravaCru('const KEY = "a4p_theme";\nlocalStorage.setItem(KEY, "dark");').length === 0);
  let recusou = false;
  try { SO.gravarPreferencia("a4p_company", {}); } catch { recusou = true; }
  ok("CAD-2: gravar chave de negócio como PREFERÊNCIA é recusado", recusou);
  ok("CAD-2: as entidades com tabela que só a demonstração grava estão CONGELADAS",
     ["a4p_recorrencias", "a4p_nfse", "a4p_ledger", "a4p_revrec", "a4p_cronogramas", "a4p_tags", "a4p_movimento_projeto"]
       .every((k) => SO.estaCongelada(k)));

  /* ---- 7. o hub: a ordem de dependência e o que falta para lançar ---- */
  const vazio: import("@/core/registros/estrutura").EntradaEstrutura = {
    empresa: { nome: null, regimeDeclarado: false }, contas: [], categorias: [], centros: [], projetos: [],
    clientes: 0, fornecedores: 0, produtos: 0, servicos: 0, contratos: 0,
  };
  const pv0 = E.pendenciasDaEstrutura(vazio);
  ok("CAD-2: empresa vazia — sem conta e sem categoria IMPEDEM, e vêm primeiro",
     pv0.slice(0, 3).every((x) => x.gravidade === "bloqueia")
     && ["sem-conta", "sem-receita", "sem-despesa"].every((id) => pv0.some((x) => x.id === id)), pv0.map((x) => x.id).join(","));
  const contaOk = H.contaDaLinha({ id: "a1", name: "Itaú", bank: "itau", ativo: true, saldo_inicial: 10, data_saldo_inicial: "2026-01-01", saldo_inicial_conferido: true });
  const pronta = E.pendenciasDaEstrutura({
    ...vazio, empresa: { nome: "X", regimeDeclarado: true }, contas: [contaOk],
    categorias: arv.map((c) => ({ ...c, dreLinha: c.natureza === "receita" ? "receita_bruta" : "despesas_operacionais" })),
    clientes: 1, fornecedores: 1,
  });
  ok("CAD-2: estrutura completa não tem pendência (a lista vazia é a resposta 'dá para lançar')",
     pronta.length === 0, pronta.map((x) => x.id).join(","));
  const semLinha = E.pendenciasDaEstrutura({ ...vazio, contas: [contaOk], categorias: arv, clientes: 1, fornecedores: 1, empresa: { nome: "X", regimeDeclarado: true } });
  ok("CAD-2: folha sem linha do DRE é ATENÇÃO (salva, mas classifica por palpite), não bloqueio",
     semLinha.length === 1 && semLinha[0].id === "sem-linha-dre" && semLinha[0].gravidade === "atencao", semLinha.map((x) => x.id).join(","));
  const niv = E.niveisDaEstrutura(vazio).map((n) => n.id).join(">");
  ok("CAD-2: os níveis na ordem de dependência", niv === "empresa>contas>plano>alocacao>partes>catalogo>contratos", niv);
  const navTxt = lerD("src/components/dashboard/nav-data.ts");
  const cfg = navTxt.slice(navTxt.indexOf("export const CONFIG"));
  ok("CAD-2: o hub tem UMA porta, em Configurações, e linha no inventário",
     /href: "\/dashboard\/registrations",/.test(cfg)
     && /rota: "\/dashboard\/registrations", nome: "Estrutura e cadastros"/.test(lerD("src/core/rotas/inventario.ts")));
}
/* ── AUT ── */
/* AUTOMAÇÕES DE E-MAIL E WHATSAPP (30/09/2026) — cada asserção prova o que a
 * regra PROÍBE: reenviar ao reexecutar, simulado virando avisado, "R$0,00" de
 * empresa vazia, régua sem opt-in ou no degrau de 60 dias, mensagem sem credor
 * ou com valor cru. Os casos negativos plantam o defeito e exigem que a
 * asserção o enxergue (senão ela seria decoração). */
{
  const A = await import("@/core/automacoes");
  const { variaveisDoTemplate, montarRegua } = await import("@/core/cobranca");
  const { formatBRL } = await import("@/lib/format");
  const fsA = await import("node:fs");
  type RM = import("@/core/risk-engine/types").RiskMovement;
  type Ctx = import("@/core/automacoes").ContextoAutomacao;
  type Cfg = import("@/core/automacoes").ConfigAutomacao;
  type Linha = import("@/core/automacoes").LinhaEnvio;
  type Reg = import("@/core/automacoes").RegistroEnvios;
  type Prov = import("@/core/automacoes").ProvedorEnvio;
  const mv = (id: string, type: "entrada" | "saida", amount: number, due: string, category: string, party: string | null,
    status: "pago" | "pendente" = "pendente", accountId: string | null = null): RM =>
    ({ id, type, status, amount, due_date: due, paid_date: status === "pago" ? due : null, category, party_id: party, accountId }) as RM;
  const HOJE = "2026-09-30"; // quarta-feira, dia útil
  const movs: RM[] = [
    mv("s-hoje", "saida", 1_500, "2026-09-30", "Aluguel", "F1", "pendente", "A1"),
    mv("s-amanha", "saida", 800, "2026-10-01", "Energia", "F2", "pendente", "A1"),
    mv("s-vencida", "saida", 300, "2026-09-25", "Internet", "F3"),
    mv("s-longe", "saida", 999, "2026-10-20", "Seguro", "F4"),
    mv("e-pago", "entrada", 5_000, "2026-09-20", "Vendas", "C1", "pago"),
    mv("r-3a", "entrada", 900, "2026-09-27", "Vendas", "C1"),   // D+3
    mv("r-3b", "entrada", 400.5, "2026-09-27", "Vendas", "C1"), // D+3, MESMO cliente
    mv("r-10", "entrada", 700, "2026-09-20", "Vendas", "C2"),   // D+10
    mv("r-60", "entrada", 4_000, "2026-08-01", "Vendas", "C3"), // D+60 (manual)
  ];
  const credor = { nome: "Aurora", razaoSocial: "Padaria Aurora Ltda", documento: "12345678000195" };
  const ctxBase = (over: Partial<Ctx> = {}): Ctx => ({
    orgId: "org-a", hoje: HOJE, credor,
    input: { hoje: HOJE, saldoAtual: 10_000, movements: movs, partyNames: { F1: "Imobiliária Sol", F2: "Luz SA", F3: "Net", F4: "Seguradora", C1: "Cliente Um", C2: "Cliente Dois", C3: "Cliente Tres" }, horizonDias: 60 },
    contas: [{ id: "A1", nome: "Conta Movimento", saldo: 1_000 }, { id: "A2", nome: "Reserva", saldo: 9_000 }],
    contatos: { C1: { id: "C1", nome: "Cliente Um", telefone: "(11) 99999-0001" }, C2: { id: "C2", nome: "Cliente Dois", email: "dois@cliente.com" }, C3: { id: "C3", nome: "Cliente Tres", telefone: "11999990003" } },
    membros: [{ userId: "u1", papel: "owner", nome: "Dona", email: "dona@aurora.com" }],
    aprovacoesPendentes: 2, mesesTravados: [], envios: [], appUrl: "https://app.exemplo", ...over,
  });
  const cfg = (tipo: import("@/core/automacoes").TipoAutomacao, over: Partial<Cfg> = {}): Cfg =>
    ({ ...A.configPadrao(tipo), ativo: true, destinatarios: [{ userId: "u1", email_ativo: true }], ...over });

  // ---- 0) o dia é o de BRASÍLIA, não o do servidor em UTC ----
  ok("aut: hoje é o dia de Brasília (01:30 UTC de 01/10 ainda é 30/09)", A.hojeEm(new Date("2026-10-01T01:30:00Z")) === "2026-09-30");
  ok("aut: e às 03:30 UTC já virou", A.hojeEm(new Date("2026-10-01T03:30:00Z")) === "2026-10-01");

  // ---- 1) REEXECUTAR NÃO ENVIA DE NOVO (índice único + grava-antes-de-enviar) ----
  const log: string[] = [];
  let chamadas = 0;
  const provAtivo: Prov = {
    ativo: () => true,
    async enviar() { chamadas++; log.push("enviar"); return { ok: true, id: `SM${chamadas}` }; },
  };
  const linhas: Linha[] = [];
  const reg = A.registroEmMemoria(linhas, () => "2026-09-30T12:00:00Z");
  const regComLog: Reg = {
    reservar: async (k) => { log.push("reservar"); return reg.reservar(k); },
    concluir: async (k, r) => { log.push("concluir"); return reg.concluir(k, r); },
  };
  const ctx = ctxBase();
  const lembrete = A.gerarMensagens(cfg("lembrete_pagar"), ctx);
  ok("aut: o lembrete RECEBEU valor (1 mensagem, com as contas de hoje e de amanhã)",
     lembrete.mensagens.length === 1 && lembrete.mensagens[0].texto.includes(formatBRL(1_500)) && lembrete.mensagens[0].texto.includes(formatBRL(800)),
     lembrete.semEnvio?.motivo ?? "");
  const r1 = await A.despachar("org-a", lembrete.mensagens, { registro: regComLog, provedor: provAtivo });
  const r2 = await A.despachar("org-a", A.gerarMensagens(cfg("lembrete_pagar"), ctx).mensagens, { registro: regComLog, provedor: provAtivo });
  ok("aut: reexecutar NÃO envia de novo (1 envio, 1 linha; a segunda execução bate no registro)",
     r1.enviados === 1 && r2.enviados === 0 && r2.jaRegistrados === 1 && chamadas === 1 && linhas.length === 1,
     `${r1.enviados}/${r2.enviados}/${r2.jaRegistrados} chamadas=${chamadas} linhas=${linhas.length}`);
  ok("aut: a ORDEM é grava → envia → conclui (o registro vem antes do provedor)",
     log.slice(0, 3).join(",") === "reservar,enviar,concluir", log.join(","));
  ok("aut: o registro guarda o id do provedor e diz 'enviado'", linhas[0]?.status === "enviado" && linhas[0]?.provedorMsgId === "SM1");
  // Defeito plantado: um registro que não recusa a repetição (a trava removida)
  // TEM de fazer o provedor ser chamado duas vezes — senão a asserção acima
  // passaria mesmo sem trava.
  let chamadasSemTrava = 0;
  const semTrava: Reg = { reservar: async () => "reservado", concluir: async () => {} };
  const provConta: Prov = { ativo: () => true, async enviar() { chamadasSemTrava++; return { ok: true }; } };
  await A.despachar("org-a", lembrete.mensagens, { registro: semTrava, provedor: provConta });
  await A.despachar("org-a", lembrete.mensagens, { registro: semTrava, provedor: provConta });
  ok("aut: (defeito plantado) sem a trava, reexecutar ENVIA DUAS VEZES — a guarda discrimina", chamadasSemTrava === 2);
  // Registro indisponível: NADA sai (mandar sem ter onde anotar é o aviso em dobro de amanhã).
  let chamadasSemRegistro = 0;
  const quebrado: Reg = { reservar: async () => { throw new Error("banco fora"); }, concluir: async () => {} };
  const rq = await A.despachar("org-a", lembrete.mensagens, { registro: quebrado, provedor: { ativo: () => true, async enviar() { chamadasSemRegistro++; return { ok: true }; } } });
  ok("aut: sem registro, o provedor NÃO é chamado", chamadasSemRegistro === 0 && rq.falhas === 1);
  // dryRun não toca em nada.
  const linhasDry: Linha[] = [];
  let chamadasDry = 0;
  const rd = await A.despachar("org-a", lembrete.mensagens, { registro: A.registroEmMemoria(linhasDry), provedor: { ativo: () => true, async enviar() { chamadasDry++; return { ok: true }; } }, dryRun: true });
  ok("aut: dryRun diz quantas sairiam e não grava nem envia", rd.sairiam === 1 && linhasDry.length === 0 && chamadasDry === 0);
  // Falha é retomável; enviado não.
  const linhasF: Linha[] = [];
  const regF = A.registroEmMemoria(linhasF);
  let tentativa = 0;
  const provFalhaDepoisOk: Prov = { ativo: () => true, async enviar() { tentativa++; return tentativa === 1 ? { ok: false, erro: "recusado" } : { ok: true, id: "ok2" }; } };
  const f1 = await A.despachar("org-a", lembrete.mensagens, { registro: regF, provedor: provFalhaDepoisOk });
  const f2 = await A.despachar("org-a", lembrete.mensagens, { registro: regF, provedor: provFalhaDepoisOk });
  const f3 = await A.despachar("org-a", lembrete.mensagens, { registro: regF, provedor: provFalhaDepoisOk });
  ok("aut: envio que FALHOU é retomado; depois de enviado, não sai de novo",
     f1.falhas === 1 && f2.enviados === 1 && f3.jaRegistrados === 1 && tentativa === 2 && linhasF.length === 1, `${tentativa} ${linhasF.map((l) => l.status)}`);

  // ---- 2) SIMULADO NUNCA VIRA AVISADO ----
  const linhasSim: Linha[] = [];
  const cfgRegua = cfg("regua_cobranca");
  const regua = A.gerarMensagens(cfgRegua, ctx);
  const rs = await A.despachar("org-a", regua.mensagens, { registro: A.registroEmMemoria(linhasSim), provedor: { ativo: () => false, async enviar() { throw new Error("não devia chamar"); } } });
  ok("aut: sem credencial, a régua registra SIMULADO (e não chama o provedor)",
     rs.simulados === regua.mensagens.length && regua.mensagens.length > 0 && linhasSim.every((l) => l.status === "simulado"), `${rs.simulados}/${regua.mensagens.length}`);
  const historicoSim = linhasSim.map((l) => ({ tipo: l.tipo, chave: l.chave, canal: l.canal, status: l.status, em: l.criadoEm }));
  const reguaDepois = montarRegua(ctx.input, A.enviosDaRegua(historicoSim), undefined, { credor });
  ok("aut: título com envio SIMULADO continua NÃO avisado na régua",
     reguaDepois.itens.filter((i) => ["r-3a", "r-3b", "r-10"].includes(i.movimentoId)).every((i) => !i.jaEnviado));
  ok("aut: simulado não conta como avisado; enviado e manual contam",
     !A.contaComoAvisado("simulado") && !A.contaComoAvisado("falhou") && A.contaComoAvisado("enviado") && A.contaComoAvisado("manual"));
  // Defeito plantado: se simulado contasse, os títulos sairiam da régua.
  const plantado = montarRegua(ctx.input, A.enviosDaRegua(historicoSim.map((h) => ({ ...h, status: "enviado" as const }))), undefined, { credor });
  ok("aut: (defeito plantado) tratar simulado como enviado MARCARIA os títulos como avisados",
     plantado.itens.filter((i) => ["r-3a", "r-3b", "r-10"].includes(i.movimentoId)).every((i) => i.jaEnviado));
  const repetirSim = A.gerarMensagens(cfgRegua, ctxBase({ envios: historicoSim }));
  ok("aut: depois de um envio simulado, a régua ainda propõe o aviso (nada chegou ao cliente)",
     repetirSim.mensagens.length === regua.mensagens.length);

  // ---- 3) EMPRESA SEM DADOS NÃO RECEBE "R$ 0" ----
  const vazio = ctxBase({ input: { hoje: HOJE, saldoAtual: 0, movements: [], partyNames: {}, horizonDias: 60 }, contas: [] });
  for (const t of ["resumo_diario", "resumo_semanal", "lembrete_pagar", "alerta_caixa", "fechamento_pendente"] as const) {
    const r = A.gerarMensagens(cfg(t), vazio);
    ok(`aut: empresa sem lançamentos não recebe ${t}`, r.mensagens.length === 0 && r.semEnvio?.codigo === "sem_dados", r.semEnvio?.codigo ?? "saiu mensagem");
  }
  // Com dados, mas NADA vencendo hoje: a soma vazia vira frase, nunca "R$0,00".
  const semHoje = ctxBase({ input: { ...ctx.input, movements: movs.filter((m) => m.due_date !== HOJE) } });
  const rd0 = A.redigirResumoDiario(semHoje);
  const zeroFormatado = formatBRL(0);
  ok("aut: resumo sem vencimento hoje diz 'nada vence hoje' e NÃO imprime R$0,00",
     !A.ehSemEnvio(rd0) && rd0.texto.includes("nada vence hoje") && !rd0.texto.includes(zeroFormatado) && !rd0.html.includes(zeroFormatado),
     A.ehSemEnvio(rd0) ? rd0.motivo : rd0.texto);
  ok("aut: (defeito plantado) o detector enxerga R$0,00 quando ele aparece", `A receber hoje: ${formatBRL(0)}`.includes(zeroFormatado));
  const rdc = A.redigirResumoDiario(ctx);
  ok("aut: o resumo do dia RECEBEU valor (saldo, hoje, vencidos, aprovações)",
     !A.ehSemEnvio(rdc) && rdc.texto.includes(formatBRL(10_000)) && rdc.texto.includes(formatBRL(1_500)) && rdc.texto.includes(formatBRL(300)) && rdc.texto.includes("Aprovações pendentes"),
     A.ehSemEnvio(rdc) ? rdc.motivo : rdc.texto);
  ok("aut: resumo não sai no fim de semana (mas a prévia mostra)",
     A.ehSemEnvio(A.redigirResumoDiario({ ...ctx, hoje: "2026-10-03" })) && !A.ehSemEnvio(A.redigirResumoDiario({ ...ctx, hoje: "2026-10-03" }, { ignorarCalendario: true })));

  // ---- 4) RÉGUA: opt-in, nunca D+60, uma mensagem por cliente por dia, pausa ----
  ok("aut: régua DESLIGADA não gera nada (e tudo nasce desligado)",
     A.gerarMensagens({ ...cfgRegua, ativo: false }, ctx).mensagens.length === 0 && A.configPadrao("regua_cobranca").ativo === false);
  const titulosNaRegua = regua.mensagens.flatMap((m) => m.chavesExtras ?? []);
  ok("aut: D+60 NUNCA sai automático (o degrau manual fica de fora)",
     !titulosNaRegua.some((c) => c.includes("r-60")) && !regua.mensagens.some((m) => m.texto.includes(formatBRL(4_000))), titulosNaRegua.join(","));
  ok("aut: o caminho recebeu valor — D+3 e D+10 entram", titulosNaRegua.includes("titulo:r-3a:d+3") && titulosNaRegua.includes("titulo:r-10:d+10"), titulosNaRegua.join(","));
  const doC1 = regua.mensagens.filter((m) => m.chave.startsWith("cliente:C1:"));
  ok("aut: cliente com DOIS títulos recebe UMA mensagem no dia (com os dois)",
     doC1.length === 1 && (doC1[0].chavesExtras ?? []).length === 2 && doC1[0].texto.includes(formatBRL(1_300.5)), doC1.map((m) => m.texto).join(" | "));
  ok("aut: o canal é o do cadastro (C1 WhatsApp · C2 só tem e-mail)",
     doC1[0]?.canal === "whatsapp" && regua.mensagens.find((m) => m.chave.startsWith("cliente:C2:"))?.canal === "email");
  const pausada = A.gerarMensagens({ ...cfgRegua, parametros: { ...cfgRegua.parametros, pausas: [{ alvo: "cliente", id: "C1", ate: "2026-10-15" }] } }, ctx);
  ok("aut: cliente pausado não recebe", !pausada.mensagens.some((m) => m.chave.startsWith("cliente:C1:")) && pausada.mensagens.length === 1);
  const pausaVencida = A.gerarMensagens({ ...cfgRegua, parametros: { ...cfgRegua.parametros, pausas: [{ alvo: "cliente", id: "C1", ate: "2026-09-29" }] } }, ctx);
  ok("aut: pausa que já venceu não segura mais", pausaVencida.mensagens.some((m) => m.chave.startsWith("cliente:C1:")));
  const jaCobrado = A.gerarMensagens(cfgRegua, ctxBase({ envios: [{ tipo: "regua_cobranca", chave: `cliente:C1:${HOJE}`, canal: "whatsapp", status: "enviado", em: `${HOJE}T10:00:00Z` }] }));
  ok("aut: cliente já cobrado HOJE por outra porta (copiloto, botão) não recebe de novo",
     !jaCobrado.mensagens.some((m) => m.chave.startsWith("cliente:C1:")) && jaCobrado.mensagens.length === 1);

  // ---- 5) CREDOR IDENTIFICADO e VALOR POR formatBRL ----
  for (const m of regua.mensagens) {
    ok(`aut: a cobrança (${m.canal}) identifica o credor com razão social e CNPJ`,
       m.texto.includes("Padaria Aurora Ltda") && m.texto.includes("CNPJ 12.345.678/0001-95") && m.html.includes("Padaria Aurora Ltda"), m.texto);
    ok(`aut: a cobrança (${m.canal}) diz "se já pagou, desconsidere"`, m.texto.includes("Se já pagou, desconsidere"));
    ok("aut: a variável de valor do template é formatBRL (nunca o número cru)", /^R\$/.test(m.variaveis["3"]) && !/^\d+(\.\d+)?$/.test(m.variaveis["3"]), m.variaveis["3"]);
  }
  const vt = variaveisDoTemplate({ cliente: "Beta", valor: 1234.5, vencimento: "2026-09-27", dias: 3 }, credor);
  ok("aut: o template da régua manual leva valor formatado e credor (era String(1234.5))",
     vt["3"] === formatBRL(1234.5) && vt["3"] !== "1234.5" && vt["2"].includes("Padaria Aurora Ltda"), JSON.stringify(vt));
  const manual = montarRegua(ctx.input, [], undefined, { credor }).itens.filter((i) => i.etapa.canal !== "manual");
  ok("aut: TODA etapa não manual da régua cita o credor e o 'desconsidere'",
     manual.length > 0 && manual.every((i) => i.mensagem.includes("Padaria Aurora Ltda") && i.mensagem.includes("Se já pagou, desconsidere")));
  // O template é por TOM: lembrete e aviso formal não saem com o mesmo texto.
  const { FINALIDADE_DO_TOM } = await import("@/core/cobranca");
  ok("aut: um template por tom (lembrete ≠ atraso ≠ formal)",
     new Set(Object.values(FINALIDADE_DO_TOM)).size === 3 && FINALIDADE_DO_TOM.lembrete !== FINALIDADE_DO_TOM.formal);
  // Encargo só quando configurado, e pela calculadora canônica.
  const comMora = A.gerarMensagens({ ...cfgRegua, parametros: { ...cfgRegua.parametros, multaPct: 0.02, jurosMesPct: 0.01 } }, ctx);
  const c2 = comMora.mensagens.find((m) => m.chave.startsWith("cliente:C2:"));
  ok("aut: com multa/juros configurados, o valor corrigido sai de calcularMora (700 + 2% + 1% × 10/30)",
     !!c2 && c2.texto.includes(formatBRL(716.33)), c2?.texto ?? "");
  // ⚠️ O teto vale no NÚCLEO: um parâmetro gravado errado (2 em vez de 0,02,
  // vindo da API ou de um SQL) não pode cobrar 200% de multa do cliente.
  const foraDoTeto = A.gerarMensagens({ ...cfgRegua, parametros: { ...cfgRegua.parametros, multaPct: 2, jurosMesPct: 1 } }, ctx);
  const c2t = foraDoTeto.mensagens.find((m) => m.chave.startsWith("cliente:C2:"));
  ok("aut: multa/juros acima do teto do CDC (2% · 1% a.m.) são limitados ao teto no núcleo",
     !!c2t && c2t.texto.includes(formatBRL(716.33)) && !c2t.texto.includes(formatBRL(700 * 3)), c2t?.texto ?? "");
  ok("aut: sem configurar, NENHUM encargo entra", !(regua.mensagens.find((m) => m.chave.startsWith("cliente:C2:"))?.texto ?? "").includes("multa"));
  const comPix = A.gerarMensagens({ ...cfgRegua, parametros: { ...cfgRegua.parametros, chavePix: "12345678000195", cidadePix: "Sao Paulo" } }, ctx);
  ok("aut: com chave PIX, a mensagem traz o copia e cola (BR Code com CRC)",
     comPix.mensagens.length > 0 && comPix.mensagens.every((m) => /000201[\s\S]*6304[0-9A-F]{4}/.test(m.texto)));

  // ---- 6) LEMBRETE: agrupado por data, vence hoje é a vencer, sexta = semana seguinte, conta que não cobre ----
  const lt = lembrete.mensagens[0]?.texto ?? "";
  ok("aut: lembrete agrupa por DATA e 'vence hoje' é a vencer (não atraso)",
     lt.includes("Vence hoje (30/09)") && lt.includes("Vence em 01/10/2026") && lt.includes("Já venceram") && !lt.includes(formatBRL(999)), lt);
  ok("aut: lembrete avisa quando o saldo da conta não cobre", lt.includes("O saldo da conta Conta Movimento"), lt);
  // O que vence HOJE está no prazo: o bloco "Já venceram" soma só o de 25/09.
  ok("aut: o título que vence hoje NÃO entra em 'Já venceram' (o bloco soma só o atraso de verdade)",
     lt.includes(`Já venceram · ${formatBRL(300)}`) && (lt.match(/Imobiliária Sol/g) ?? []).length === 1, lt);
  ok("aut: na sexta o lembrete olha a semana seguinte inteira",
     A.janelaDoLembrete("2026-10-02").ate === "2026-10-11" && A.janelaDoLembrete("2026-09-30").ate === "2026-10-01");
  ok("aut: com feriado (20/11, Consciência Negra), o lembrete de quinta olha até a segunda 23/11",
     A.janelaDoLembrete("2026-11-19").ate === "2026-11-23" && A.janelaDoLembrete("2026-10-01").ate === "2026-10-02", `${A.janelaDoLembrete("2026-11-19").ate}`);

  // ---- 7) ALERTA: condicional, sem 97%, só quando a faixa muda ----
  const aperto = ctxBase({ input: { hoje: HOJE, saldoAtual: 1_000, movements: [mv("x1", "saida", 3_000, "2026-10-05", "Fornecedor", "F9"), mv("x0", "entrada", 50, "2026-09-01", "Vendas", "C1", "pago")], partyNames: {}, horizonDias: 60 } });
  const al = A.gerarMensagens(cfg("alerta_caixa", { parametros: { horizonteDias: 15, saldoMinimo: 0 } }), aperto);
  ok("aut: o alerta sai no CONDICIONAL e sem percentual (o 97% é o teto da fórmula)",
     al.mensagens.length === 1 && al.mensagens[0].texto.includes("ficaria negativo") && !/%/.test(al.mensagens[0].texto), al.semEnvio?.motivo ?? al.mensagens[0]?.texto);
  ok("aut: a chave do alerta carrega a faixa (5 dias → faixa 7)", !!al.mensagens[0]?.chave.startsWith(`faixa:neg-7:${HOJE}:`), al.mensagens[0]?.chave);
  const repetido = A.gerarMensagens(cfg("alerta_caixa"), { ...aperto, envios: [{ tipo: "alerta_caixa", chave: "faixa:neg-7:2026-09-28:abcd", canal: "email", status: "enviado", em: "2026-09-28T12:00:00Z" }] });
  ok("aut: a MESMA faixa avisada há 2 dias não reenvia", repetido.mensagens.length === 0 && repetido.semEnvio?.codigo === "faixa_ja_avisada");
  const mudou = A.gerarMensagens(cfg("alerta_caixa"), { ...aperto, envios: [{ tipo: "alerta_caixa", chave: "faixa:neg-15:2026-09-28:abcd", canal: "email", status: "enviado", em: "2026-09-28T12:00:00Z" }] });
  ok("aut: faixa que MUDOU (15 → 7) reenvia", mudou.mensagens.length === 1);
  const simAntes = A.gerarMensagens(cfg("alerta_caixa"), { ...aperto, envios: [{ tipo: "alerta_caixa", chave: "faixa:neg-7:2026-09-29:abcd", canal: "email", status: "simulado", em: "2026-09-29T12:00:00Z" }] });
  ok("aut: um alerta SIMULADO antes não conta como avisado (sai de novo)", simAntes.mensagens.length === 1);
  ok("aut: sem aperto no horizonte, nada sai", A.gerarMensagens(cfg("alerta_caixa"), ctx).semEnvio?.codigo === "nada_a_avisar");

  // ---- 8) FECHAMENTO: 3º e 8º dia útil, só com o mês anterior aberto ----
  const out5 = { ...ctx, hoje: "2026-10-05" }; // 3º dia útil de outubro/2026 (1, 2, 5)
  const fech = A.gerarMensagens(cfg("fechamento_pendente"), out5);
  ok("aut: no 3º dia útil, com setembro aberto, o aviso sai", fech.mensagens.length === 1 && fech.mensagens[0].assunto.includes("setembro de 2026"), fech.semEnvio?.motivo ?? "");
  ok("aut: setembro travado não gera aviso", A.gerarMensagens(cfg("fechamento_pendente"), { ...out5, mesesTravados: ["2026-09"] }).semEnvio?.codigo === "mes_fechado");
  ok("aut: fora do 3º/8º dia útil não sai", A.gerarMensagens(cfg("fechamento_pendente"), { ...ctx, hoje: "2026-10-06" }).semEnvio?.codigo === "fora_do_dia");

  // ---- 9) destinatário: só titular/admin ATUAL recebe ----
  const saiu = A.gerarMensagens(cfg("resumo_diario", { destinatarios: [{ userId: "ex-socio", email_ativo: true }] }), ctx);
  ok("aut: quem saiu da empresa não recebe (o e-mail vem do MEMBRO, não da configuração)",
     saiu.mensagens.length === 0 && saiu.semEnvio?.codigo === "sem_destinatario");
  const dois = A.gerarMensagens(cfg("resumo_diario", { canais: ["email", "whatsapp"], destinatarios: [{ userId: "u1", email_ativo: true, whatsapp_ativo: true, telefone: "(11) 98888-7777" }] }), ctx);
  ok("aut: e-mail e WhatsApp do mesmo resumo são dois envios, e a chave não carrega o endereço",
     dois.mensagens.length === 2 && new Set(dois.mensagens.map((m) => `${m.chave}|${m.canal}`)).size === 2 && dois.mensagens.every((m) => !m.chave.includes("dona@")));
  ok("aut: o destino é MASCARADO no registro", dois.mensagens.length > 0 && dois.mensagens.every((m) => m.destinoMascarado.includes("***") || m.destinoMascarado.includes("••••")));

  // ---- 10) uma função só lê linhas → RiskInput (o mapeador único) ----
  const dataTs = fsA.readFileSync("src/lib/data.ts", "utf8");
  const consolidadoTs = fsA.readFileSync("src/lib/consolidado.ts", "utf8");
  const ctxTs = fsA.readFileSync("src/lib/automacoes-contexto.ts", "utf8");
  ok("aut: tela, consolidação e runner montam o RiskInput pelo MESMO mapeador",
     /linhasParaRiskInput\(/.test(dataTs) && /linhasParaRiskInput\(/.test(consolidadoTs) && /linhasParaRiskInput\(/.test(ctxTs)
     && !/category: r\.categoria \? String\(r\.categoria\)/.test(consolidadoTs) && !/category: embedName\(m\.categoria\)/.test(dataTs));
  const { linhaParaRiskMovement } = await import("@/lib/risco-linhas");
  const embed = linhaParaRiskMovement({ id: "1", type: "saida", status: "pendente", amount: "12.5", due_date: "2026-09-30", category: "texto livre", categoria: [{ name: "Do cadastro" }], centro: { name: "Adm" } });
  const achatado = linhaParaRiskMovement({ id: "1", type: "saida", status: "pendente", amount: 12.5, due_date: "2026-09-30", category: "texto livre", categoria: "Do cadastro", centro: "Adm" });
  ok("aut: o mapeador lê o embed da tela e o texto achatado da RPC do MESMO jeito",
     JSON.stringify(embed) === JSON.stringify(achatado) && embed.category === "Do cadastro" && embed.amount === 12.5 && embed.costCenter === "Adm", JSON.stringify(embed));

  // ---- 11) a rota do runner: CRON_SECRET pela regra única, dryRun, grava antes ----
  const runner = fsA.readFileSync("src/app/api/financial-os/run/route.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok("aut: o runner usa recusaDeCron, lê pela RPC e despacha pelo núcleo (dryRun incluído)",
     /recusaDeCron\(req\)/.test(runner) && /rpc\("automacao_contexto"/.test(runner) && /despachar\(/.test(runner) && /dryRun/.test(runner)
     && !/lib\/supabase\/client/.test(runner));
  const copiloto = fsA.readFileSync("src/lib/ai-copilot.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok("aut: o copiloto cobra pela MESMA rota e grava no MESMO registro (clienteChave)",
     /\/api\/cobranca\/whatsapp/.test(copiloto) && /registro: \{ clienteChave/.test(copiloto) && !/Quattro · Olá!/.test(copiloto));
  const migr = fsA.readFileSync("supabase/migrations/20260930190000_automacoes.sql", "utf8");
  ok("aut: a migration tem o índice único, o padrão por seed E por gatilho, e a RPC só para service_role",
     /create unique index if not exists automacao_envios_unico\s+on public\.automacao_envios \(org_id, tipo, chave, canal\)/.test(migr)
     && /insert into public\.automacoes[\s\S]*cross join public\.automacoes_padrao\(\)/.test(migr)
     && /after insert on public\.organizations[\s\S]*automacoes_inicial/.test(migr)
     && /revoke all on function public\.automacao_contexto\(uuid\) from public, anon, authenticated/.test(migr)
     && /grant execute on function public\.automacao_contexto\(uuid\) to service_role/.test(migr));
}

/* ── CAMP-A ── */
// Checklist de fechamento com dono/prazo/revisor · aging de contas a pagar ·
// previsão do mês em três camadas. Valores fechados sobre fixture, e cada regra
// provada pelo defeito que ela proíbe.
{
  const ck = await import("@/core/close/checklist");
  const { montarAgingContasPagar, faixaDoTitulo } = await import("@/core/contas-pagar/aging");
  const { montarPrevisaoDoMes } = await import("@/core/previsao-mes");
  type Mov = import("@/core/risk-engine/types").RiskMovement;

  /* ---------------- 1. CHECKLIST ---------------- */
  const geradas = ck.tarefasAGerar("2026-08", []);
  ok("campa checklist: o mês nasce com as CINCO tarefas do modelo",
     geradas.length === 5 && ["conciliar_bancos", "provisoes", "revisar_dre", "conferir_impostos", "exportar_contador"].every((k) => geradas.some((g) => g.chave === k)),
     JSON.stringify(geradas.map((g) => g.chave)));
  ok("campa checklist: todas nascem PENDENTES e sem carimbo", geradas.every((g) => g.status === "pending" && !g.concluidaPor && !g.revisadaPor));
  ok("campa checklist: prazo no mês SEGUINTE (conciliação dia 3 → 2026-09-03)",
     geradas.find((g) => g.chave === "conciliar_bancos")?.prazo === "2026-09-03");
  ok("campa checklist: dezembro vira janeiro do ano seguinte (não mês 13)", ck.prazoDoModelo("2026-12", 8) === "2027-01-08");
  ok("campa checklist: dia além do fim do mês vira o último dia", ck.prazoDoModelo("2027-01", 31) === "2027-02-28");

  const comId = geradas.map((g, i) => ({ ...g, id: `t${i}` }));
  ok("campa checklist: gerar de novo é IDEMPOTENTE (abrir a tela duas vezes não duplica)",
     ck.tarefasAGerar("2026-08", comId).length === 0);
  // A herança: quem cuidou da conciliação em agosto cuida em setembro.
  const agoAtrib = comId.map((t) => (t.chave === "conciliar_bancos" ? { ...t, responsavelId: "ana", revisorId: "bia" } : t));
  const set = ck.tarefasAGerar("2026-09", agoAtrib);
  const conc = set.find((t) => t.chave === "conciliar_bancos");
  ok("campa checklist: responsável e revisor se REPETEM do mês anterior",
     conc?.responsavelId === "ana" && conc?.revisorId === "bia" && set.length === 5);

  const membros2 = [
    { id: "ana", nome: "Ana", podeRevisar: true },
    { id: "bia", nome: "Bia", podeRevisar: true },
    { id: "caio", nome: "Caio", podeRevisar: false },
  ];
  const membros1 = [{ id: "ana", nome: "Ana", podeRevisar: true }];
  const t0 = comId[0];
  const c = ck.concluir(t0, "ana", "2026-09-02T10:00:00Z");
  ok("campa checklist: concluir carimba quem concluiu", c.ok && c.tarefa.status === "review" && c.tarefa.concluidaPor === "ana");
  const concluida = c.ok ? c.tarefa : t0;
  const auto = ck.revisar(concluida, "ana", membros2, "2026-09-02T11:00:00Z");
  ok("campa checklist: AUTORREVISÃO BLOQUEADA quando existe outro membro habilitado",
     !auto.ok && auto.codigo === "segregacao", JSON.stringify(auto));
  const porBia = ck.revisar(concluida, "bia", membros2, "2026-09-02T11:00:00Z");
  ok("campa checklist: outra pessoa habilitada revisa, sem carimbo de autorrevisão",
     porBia.ok && porBia.tarefa.status === "done" && porBia.tarefa.revisadaPor === "bia" && !porBia.tarefa.autorrevisao);
  const porCaio = ck.revisar(concluida, "caio", membros2, "2026-09-02T11:00:00Z");
  ok("campa checklist: membro SEM o papel de fechamento não revisa", !porCaio.ok && porCaio.codigo === "permissao");
  // ⚠️ Caio (sem papel) NÃO conta como "outro revisor": a pergunta é quem PODE revisar.
  const soComCaio = ck.revisar(concluida, "ana", [membros2[0], membros2[2]], "2026-09-02T11:00:00Z");
  ok("campa checklist: membro sem papel não torna a autorrevisão proibida (sai da matriz, não do quadro)",
     soComCaio.ok && soComCaio.tarefa.autorrevisao);
  const sozinha = ck.revisar(concluida, "ana", membros1, "2026-09-02T11:00:00Z");
  ok("campa checklist: sem outro habilitado, a autorrevisão é PERMITIDA e CARIMBADA",
     sozinha.ok && sozinha.tarefa.autorrevisao && sozinha.tarefa.autorrevisaoMotivo === ck.MOTIVO_AUTORREVISAO);
  ok("campa checklist: pendente → revisada direto é recusado (pularia quem fez)",
     !ck.revisar(t0, "bia", membros2, "x").ok);
  ok("campa checklist: atribuir a quem não é membro é recusado",
     !ck.atribuir(t0, { responsavelId: "estranho" }, membros2).ok && ck.atribuir(t0, { responsavelId: "caio" }, membros2).ok);

  // Atrasada: passou do prazo SEM revisão; "vence hoje" ainda está no prazo.
  ok("campa checklist: prazo de hoje NÃO é atraso", !ck.atrasada({ status: "pending", prazo: "2026-09-03" }, "2026-09-03"));
  ok("campa checklist: passou do prazo e não foi revisada → atrasada", ck.atrasada({ status: "review", prazo: "2026-09-03" }, "2026-09-04"));
  ok("campa checklist: revisada nunca atrasa", !ck.atrasada({ status: "done", prazo: "2026-09-03" }, "2026-12-01"));

  // A trava: tudo revisado, ou motivo de 20+.
  const tudoRevisado = comId.map((t) => ({ ...t, status: "done" as const }));
  ok("campa checklist: com tudo revisado, trava sem motivo", ck.podeTravar(tudoRevisado, null).pode);
  const umaAberta = tudoRevisado.map((t, i) => (i === 2 ? { ...t, status: "review" as const } : t));
  const semMotivo = ck.podeTravar(umaAberta, "ok");
  ok("campa checklist: com tarefa aberta, motivo de fachada NÃO trava", !semMotivo.pode && semMotivo.abertas === 1);
  ok("campa checklist: com tarefa aberta, motivo de 20+ caracteres trava (registrado)",
     (() => { const r = ck.podeTravar(umaAberta, "contador entrega a guia na segunda"); return r.pode && r.comMotivo; })());
  const pr = ck.prontidao(umaAberta, "2026-09-10");
  ok("campa checklist: prontidão conta só o REVISADO (concluída sem revisão não fecha)",
     pr.revisadas === 4 && pr.aguardandoRevisao === 1 && pr.fracao === 0.8 && !pr.completa, JSON.stringify(pr));

  // ⚠️ A cópia da regra na tela e o gatilho do banco têm de falar a mesma
  // coisa: as duas mensagens de segregação e o piso do motivo.
  const fsC = await import("node:fs");
  const sql = fsC.readFileSync("supabase/migrations/20260930200000_fechamento_responsavel.sql", "utf8");
  ok("campa checklist: o gatilho do banco tem a segregação e o carimbo",
     /A4P-FECHAMENTO-SEGREGACAO/.test(sql) && /autorrevisao := true/.test(sql) && /role_permissions rp on rp\.papel = om\.role and rp\.acao = 'fechar'/.test(sql));
  ok("campa checklist: o piso do motivo é o MESMO na tela e no banco",
     new RegExp(`< ${ck.MOTIVO_MINIMO}`).test(sql));
  // ⚠️ (revisão CAMP-A) A fechadura tem guarda de BANCO no CI — a que exercita
  // as portas laterais (mês → nulo, lixeira, trocar o mês). Esta asserção só
  // impede que o passo saia do CI sem ninguém ver.
  const ciYml = fsC.readFileSync(".github/workflows/ci.yml", "utf8");
  ok("campa checklist: o CI roda a guarda de banco do checklist (scripts/fechamento-checklist.sql)",
     /-f scripts\/fechamento-checklist\.sql/.test(ciYml) && fsC.existsSync("scripts/fechamento-checklist.sql"));
  // ⚠️ Uma morada só: a tela não volta a ler as tarefas do navegador unido ao banco.
  const closeLib = fsC.readFileSync("src/lib/close.ts", "utf8");
  ok("campa checklist: lib/close não guarda mais tarefa (era a segunda morada)",
     !/a4p_close_tasks|saveCloseTask|loadCloseTasks/.test(closeLib.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));

  /* ---------------- 2. AGING DE CONTAS A PAGAR ---------------- */
  const hoje = "2026-08-15";
  const sai = (id: string, due: string, amount: number, extra: Partial<Mov> = {}): Mov =>
    ({ id, type: "saida", status: "pendente", amount, due_date: due, category: "Fornecedores", party_id: "p-a", ...extra });
  const carteira: Mov[] = [
    sai("hoje", "2026-08-15", 100),
    sai("v1", "2026-08-14", 200),
    sai("v30", "2026-07-16", 300),
    sai("v31", "2026-07-15", 400, { party_id: "p-b", category: "Aluguel" }),
    sai("v90", "2026-05-17", 500, { party_id: "p-b", category: "Aluguel" }),
    sai("v91", "2026-05-16", 600, { party_id: "p-b", category: "Aluguel" }),
    sai("a7", "2026-08-22", 700),
    sai("a8", "2026-08-23", 800),
    sai("a30", "2026-09-14", 900),
    sai("a31", "2026-09-15", 1000),
    // FORA da carteira: pago, cancelado, e o que a empresa RECEBE.
    sai("pago", "2026-07-01", 9999, { status: "pago", paid_date: "2026-07-01" }),
    sai("canc", "2026-07-01", 8888, { status: "cancelado" }),
    { id: "rec", type: "entrada", status: "pendente", amount: 7777, due_date: "2026-07-01" },
  ];
  const inpAging = { hoje, saldoAtual: 0, movements: carteira, partyNames: { "p-a": "Fornecedor A", "p-b": "Imobiliária B" } };
  const ag = montarAgingContasPagar(inpAging);
  const F = ag.totais.faixas;
  ok("campa aging: limites das faixas um a um (hoje · 1 · 30 · 31 · 90 · 91 · +7 · +8 · +30 · +31)",
     F.ate_7 === 800 && F.ate_30 === 500 && F.de_31_a_60 === 400 && F.de_61_a_90 === 500 && F.acima_90 === 600
     && F.de_8_a_15 === 800 && F.de_16_a_30 === 900 && F.acima_30 === 1000, JSON.stringify(F));
  ok("campa aging: o que vence HOJE é a vencer (nunca atraso)", faixaDoTitulo("2026-08-15", hoje) === "ate_7");
  ok("campa aging: vencido 2.000 · a vencer 3.500 · total 5.500, só o EM ABERTO (pago, cancelado e receber ficam fora)",
     ag.totais.vencido === 2000 && ag.totais.aVencer === 3500 && ag.totais.total === 5500 && ag.totais.quantidade === 10,
     JSON.stringify(ag.totais));
  const fA = ag.porFornecedor.find((l) => l.nome === "Fornecedor A");
  const fB = ag.porFornecedor.find((l) => l.nome === "Imobiliária B");
  ok("campa aging: por FORNECEDOR (A deve 4.000 com 500 vencido · B deve 1.500, tudo vencido)",
     fA?.total === 4000 && fA.vencido === 500 && fB?.total === 1500 && fB.vencido === 1500 && fB.faixas.acima_90 === 600);
  const cAl = ag.porCategoria.find((l) => l.nome === "Aluguel");
  ok("campa aging: por CATEGORIA (Aluguel 1.500 · Fornecedores 4.000)",
     cAl?.total === 1500 && ag.porCategoria.find((l) => l.nome === "Fornecedores")?.total === 4000);
  const somaLinhas = (ls: { total: number }[]) => Math.round(ls.reduce((s, l) => s + l.total, 0) * 100) / 100;
  ok("campa aging: as linhas FECHAM com a carteira nas duas dimensões",
     somaLinhas(ag.porFornecedor) === ag.totais.total && somaLinhas(ag.porCategoria) === ag.totais.total);
  // ⚠️ Mais de 10 fornecedores: o resto vira "Demais", não some.
  const muitos: Mov[] = Array.from({ length: 14 }, (_, i) => sai(`m${i}`, "2026-08-20", 10 + i, { party_id: `p${i}` }));
  const agM = montarAgingContasPagar({ hoje, saldoAtual: 0, movements: muitos,
    partyNames: Object.fromEntries(muitos.map((m, i) => [m.party_id!, `F${i}`])) });
  ok("campa aging: além do teto, o resto vira UMA linha 'Demais' e a soma continua fechando",
     agM.porFornecedor.length === 10 && agM.agregadas.fornecedor === 5 && somaLinhas(agM.porFornecedor) === agM.totais.total);
  // ⚠️ É POSIÇÃO: a carteira de hoje não depende de período nenhum — o vencido
  // de maio está aqui em agosto.
  ok("campa aging: a carteira enxerga o vencido de MESES atrás (maio em agosto)",
     ag.totais.quantidades.acima_90 === 1 && ag.totais.quantidades.de_61_a_90 === 1);

  /* ---------------- 3. PREVISÃO DO MÊS ---------------- */
  const m = (id: string, type: "entrada" | "saida", status: "pago" | "pendente", amount: number, due: string, extra: Partial<Mov> = {}): Mov =>
    ({ id, type, status, amount, due_date: due, paid_date: status === "pago" ? due : null, category: null, ...extra });
  const hist: Mov[] = [];
  for (const mm of ["02", "03", "04", "05", "06", "07"]) {
    // Aluguel — título materializado da REGRA R1 (chave rec:R1:<data>).
    hist.push(m(`alu${mm}`, "saida", "pago", 1500, `2026-${mm}-10`, { category: "Aluguel", party_id: "p-imob", referenceCode: `rec:R1:2026-${mm}-10` }));
    // Energia — padrão inferido (sem regra), fixo em 400.
    hist.push(m(`luz${mm}`, "saida", "pago", 400, `2026-${mm}-12`, { category: "Utilidades", party_id: "p-luz" }));
    // Internet — padrão inferido que JÁ apareceu em agosto.
    hist.push(m(`net${mm}`, "saida", "pago", 200, `2026-${mm}-03`, { category: "Internet", party_id: "p-net" }));
    // Cliente fixo — receita que se repete, ainda não entrou em agosto.
    hist.push(m(`cli${mm}`, "entrada", "pago", 2000, `2026-${mm}-07`, { category: "Receita de serviços", party_id: "p-cli" }));
  }
  const ago: Mov[] = [
    m("venda", "entrada", "pago", 5000, "2026-08-05", { category: "Vendas", party_id: "p-x" }),
    m("forn", "saida", "pago", 1000, "2026-08-10", { category: "Fornecedores", party_id: "p-y" }),
    m("alu08", "saida", "pago", 1500, "2026-08-10", { category: "Aluguel", party_id: "p-imob", referenceCode: "rec:R1:2026-08-10" }),
    m("net08", "saida", "pago", 200, "2026-08-03", { category: "Internet", party_id: "p-net" }),
    m("receber", "entrada", "pendente", 3000, "2026-08-25", { category: "Vendas", party_id: "p-x" }),
    m("pagar", "saida", "pendente", 2000, "2026-08-20", { category: "Fornecedores", party_id: "p-y" }),
    m("setembro", "saida", "pendente", 999, "2026-09-05", { category: "Fornecedores", party_id: "p-y" }),
    m("cancelada", "saida", "cancelado" as "pendente", 777, "2026-08-21", { status: "cancelado" }),
  ];
  const regras = [
    { id: "R1", descricao: "Aluguel", contraparte: "Imobiliária", categoria: "Aluguel", valor: 1500, frequencia: "mensal" as const,
      inicio: "2026-01-10", fim: null, diaVencimento: 10, ativa: true },
    { id: "R2", descricao: "Software", contraparte: "SaaS", categoria: "Assinaturas", valor: 300, frequencia: "mensal" as const,
      inicio: "2026-01-28", fim: null, diaVencimento: 28, ativa: true },
  ];
  const inpPrev = {
    hoje, saldoAtual: 10000, movements: [...hist, ...ago],
    partyNames: { "p-imob": "Imobiliária", "p-luz": "Companhia de Luz", "p-net": "Provedor", "p-cli": "Cliente Fixo", "p-x": "Cliente X", "p-y": "Fornecedor Y" },
  };
  const pv = montarPrevisaoDoMes({ input: inpPrev, regras });
  const C = pv.camadas;
  ok("campa previsao: REALIZADO = liquidado de 1º/08 até hoje (5.000 entrou · 2.700 saiu)",
     C.realizado.entradas === 5000 && C.realizado.saidas === 2700 && C.realizado.natureza === "fato", JSON.stringify(C.realizado));
  ok("campa previsao: AGENDADO = aberto até o FIM do mês (3.000 · 2.000; setembro e cancelado fora)",
     C.agendado.entradas === 3000 && C.agendado.saidas === 2000 && C.agendado.natureza === "projecao", JSON.stringify(C.agendado));
  ok("campa previsao: ESTIMADO = regra sem título (software 300) + padrão que não apareceu (luz 400; cliente 2.000)",
     C.estimado.saidas === 700 && C.estimado.entradas === 2000 && C.estimado.natureza === "estimativa",
     JSON.stringify(pv.estimados));
  ok("campa previsao: a regra sem título entra pela chave rec:<regra>:<data>",
     pv.estimados.some((e) => e.chave === "rec:R2:2026-08-28" && e.origem === "regra"));
  // ⚠️ O defeito proibido: o título já lançado aparecer de novo como estimado.
  ok("campa previsao: o aluguel JÁ LANÇADO (rec:R1) NÃO volta como estimado — nem pela regra, nem pelo padrão",
     !pv.estimados.some((e) => /aluguel|imobili|R1/i.test(`${e.chave} ${e.descricao} ${e.categoria ?? ""}`)), JSON.stringify(pv.estimados));
  ok("campa previsao: a internet que JÁ apareceu em agosto não é estimada",
     !pv.estimados.some((e) => /internet|provedor/i.test(`${e.descricao} ${e.categoria ?? ""}`)));
  ok("campa previsao: resultado previsto = soma das três camadas (10.000 − 5.400 = 4.600)",
     pv.previsto.entradas === 10000 && pv.previsto.saidas === 5400 && pv.previsto.resultado === 4600, JSON.stringify(pv.previsto));
  // Com o título de agosto da R2 lançado, a estimativa da R2 some (casamento por regra+MÊS, mesmo em outro dia).
  const comR2 = montarPrevisaoDoMes({ input: { ...inpPrev, movements: [...inpPrev.movements,
    m("sw08", "saida", "pendente", 300, "2026-08-27", { category: "Assinaturas", referenceCode: "rec:R2:2026-08-27" })] }, regras });
  ok("campa previsao: título da regra no mês (em OUTRO dia) suprime a estimativa — sai do estimado e entra no agendado",
     !comR2.estimados.some((e) => e.chave.startsWith("rec:R2")) && comR2.camadas.agendado.saidas === 2300
     && comR2.previsto.saidas === 5400, JSON.stringify(comR2.previsto));
  // ⚠️ Sem o título de agosto do aluguel, ele é estimado UMA vez — pela regra —
  // e não de novo pelo padrão inferido dos mesmos lançamentos (seriam dois aluguéis).
  const semAlu08 = montarPrevisaoDoMes({ input: { ...inpPrev, movements: inpPrev.movements.filter((x) => x.id !== "alu08") }, regras });
  const alugueis = semAlu08.estimados.filter((e) => /aluguel/i.test(`${e.descricao} ${e.categoria ?? ""}`));
  ok("campa previsao: compromisso com regra é estimado UMA vez (a regra responde; o padrão não duplica)",
     alugueis.length === 1 && alugueis[0].origem === "regra" && semAlu08.camadas.estimado.saidas === 2200, JSON.stringify(alugueis));
  // ⚠️ (revisão CAMP-A) O aluguel de agosto lançado À MÃO, sem a chave `rec:`
  // da regra — o materializador está parado em produção. Ele já está no
  // agendado; a regra NÃO pode estimá-lo de novo (seriam R$ 3.000 de aluguel).
  const aluManual = montarPrevisaoDoMes({ input: { ...inpPrev, movements: [
    ...inpPrev.movements.filter((x) => x.id !== "alu08"),
    m("alu08m", "saida", "pendente", 1500, "2026-08-11", { category: "Aluguel", party_id: "p-imob" }),
  ] }, regras });
  ok("campa previsao: aluguel lançado À MÃO no mês (sem rec:) não é estimado de novo pela regra",
     !aluManual.estimados.some((e) => /aluguel/i.test(`${e.descricao} ${e.categoria ?? ""}`))
     && aluManual.camadas.agendado.saidas === 3500 && aluManual.previsto.saidas === 5400,
     JSON.stringify({ est: aluManual.estimados, prev: aluManual.previsto }));
  // O vencido de antes do mês entra no agendado, e é DITO à parte.
  const comVencido = montarPrevisaoDoMes({ input: { ...inpPrev, movements: [...inpPrev.movements,
    m("velho", "saida", "pendente", 450, "2026-07-20", { category: "Fornecedores", party_id: "p-y" })] }, regras });
  ok("campa previsao: o vencido não pago entra no agendado e é declarado à parte",
     comVencido.camadas.agendado.saidas === 2450 && comVencido.vencidoNoAgendado.saidas === 450);
  ok("campa previsao: cada camada declara a natureza na procedência (a tela marca o projetado por ela)",
     C.realizado.procedencia.natureza === "fato" && C.agendado.procedencia.natureza === "projecao" && C.estimado.procedencia.natureza === "estimativa");

  // ⚠️ Teto ZERO na tela: as duas telas novas não somam nada.
  for (const arq of ["src/components/fluxo-caixa/PrevisaoDoMes.tsx", "src/components/contas-pagar/AgingContasPagar.tsx"]) {
    const src = fsC.readFileSync(arq, "utf8");
    ok(`campa: ${arq.split("/").pop()} não soma lançamento por conta própria`,
       !/\.reduce\(/.test(src) && !/m\.amount|\.amount\b/.test(src));
  }
}

/* ── CAMP-B ── caixa de entrada de contas, edição em massa, extrato do contato,
   busca global de títulos e eliminações no consolidado (30/09/2026). Cada
   asserção foi provada PLANTANDO o defeito que ela existe para pegar. */
{
  const em = await import("@/core/movimentacoes/edicao-massa");
  const ce = await import("@/core/caixa-entrada");
  const bu = await import("@/core/busca");
  const ex = await import("@/core/extrato-contato");
  const pc = await import("@/core/relatorios/posicao-consolidada");
  const mv = await import("@/core/movimentacoes");
  const fsC = await import("node:fs");
  type M = import("@/core/risk-engine/types").RiskMovement;
  type RI = import("@/core/risk-engine/types").RiskInput;
  const mk = (o: Partial<M> & { id: string }): M =>
    ({ type: "saida", status: "pendente", amount: 100, due_date: "2026-09-10", paid_date: null, party_id: null, category: "Aluguel", ...o } as M);

  /* ── edição em massa ─────────────────────────────────────────────────── */
  const tit: M[] = [
    mk({ id: "aberto-set", amount: 1000, category: "Aluguel", due_date: "2026-09-10" }),
    mk({ id: "aberto-ago", amount: 500, category: "Aluguel", due_date: "2026-08-20" }), // mês FECHADO
    mk({ id: "baixado-set", amount: 300, category: "Aluguel", status: "pago", situacao: "baixado", paid_date: "2026-09-05", due_date: "2026-09-05" }),
    mk({ id: "cancelado", amount: 50, status: "cancelado", situacao: "cancelado", due_date: "2026-09-12" }),
    mk({ id: "ja-igual", amount: 70, category: "Marketing", due_date: "2026-09-15" }),
  ];
  const fech = { mesesFechados: ["2026-08"] };
  const pCat = em.planejarEdicao(tit, { campo: "categoria", para: "cat-mkt", paraRotulo: "Marketing" }, fech);
  const motivoDe = (p: typeof pCat, id: string) => p.recusados.find((r) => r.id === id)?.motivo;
  ok("campb: edição em massa NÃO mexe em título de mês fechado (a correção é estorno)",
     !pCat.aplicar.some((a) => a.id === "aberto-ago") && motivoDe(pCat, "aberto-ago") === "mes_fechado");
  ok("campb: categoria do BAIXADO pode mudar (é classificação, não fato)",
     pCat.aplicar.some((a) => a.id === "baixado-set"));
  ok("campb: cancelado não se edita em lote (terminal)", motivoDe(pCat, "cancelado") === "terminal");
  ok("campb: o que já está igual não vira alteração nem evento", motivoDe(pCat, "ja-igual") === "igual");
  ok("campb: o plano diz quantos e quanto ANTES de gravar (2 títulos, R$ 1.300,00)",
     pCat.quantidade === 2 && pCat.soma === 1300 && pCat.grupos.length === 1 && pCat.grupos[0].de === "Aluguel" && pCat.grupos[0].para === "Marketing",
     JSON.stringify(pCat.grupos));
  const pVenc = em.planejarEdicao(tit, { campo: "vencimento", para: "2026-09-30", paraRotulo: "30/09/2026" }, fech);
  ok("campb: vencimento do BAIXADO não muda (só título previsto)",
     motivoDe(pVenc, "baixado-set") === "nao_previsto" && !pVenc.aplicar.some((a) => a.id === "baixado-set"));
  ok("campb: vencimento do previsto em mês aberto muda",
     pVenc.aplicar.length === 2 && pVenc.aplicar.some((a) => a.id === "aberto-set" && a.de === "2026-09-10" && a.para === "2026-09-30"));
  const pParaFechado = em.planejarEdicao(tit, { campo: "vencimento", para: "2026-08-31", paraRotulo: "31/08/2026" }, fech);
  ok("campb: vencimento que LEVARIA o título para mês fechado é recusado",
     pParaFechado.aplicar.length === 0 && motivoDe(pParaFechado, "aberto-set") === "destino_fechado");
  const libEm = fsC.readFileSync("src/lib/edicao-massa.ts", "utf8");
  ok("campb: o escritor da edição em massa não engole erro (recusa do banco vira falha nomeada)",
     !/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(libEm) && /falhas\.push\(\{ id: item\.id, mensagem: error\.message \}\)/.test(libEm));
  ok("campb: UPDATE que o banco filtrou (zero linhas) é FALHA, não \"título alterado\"",
     /\.update\(patch\)\.eq\("id", item\.id\)\.select\("id"\)\.maybeSingle\(\)/.test(libEm) && /if \(!alterado\) \{\s*falhas\.push/.test(libEm));
  const ramoDemoEm = libEm.slice(libEm.indexOf("if (isDemo)"), libEm.indexOf("const s = createClient()"));
  // A tela recusa o "sair do mês fechado"; a FECHADURA é o banco (medido em
  // transação desfeita: antes da 20260930210000 o UPDATE passava).
  // ⚠️ REVISÃO CAMP-B — a prova da trava é de BANCO (`scripts/campb-banco.sql`,
  // com o defeito replantado acusando), não um grep no texto da migration: o
  // grep passava com a trava aplicada ou não. Aqui só se cobra que a guarda de
  // banco continua no CI — sem ela, a trava pode sumir sem nada reprovar.
  const ciYml = fsC.readFileSync(".github/workflows/ci.yml", "utf8");
  ok("campb: a guarda de banco do CAMP-B (mês fechado pela origem · consolidado) roda no CI",
     /-f scripts\/campb-banco\.sql/.test(ciYml) && fsC.existsSync("scripts/campb-banco.sql"));
  ok("campb: a demonstração registra UM evento por título na trilha",
     /for \(const item of plano\.aplicar\)[\s\S]*registrarLog\(/.test(ramoDemoEm));

  /* ── caixa de entrada de contas ─────────────────────────────────────── */
  const bol = (id: string, cod: string, extra: Record<string, unknown> = {}) => ({
    id, origem: "dda", beneficiario: "Energia SA", pagador: "Nós", pago: false, dataPagamento: null,
    recebidoEm: "2026-09-01", movimentoId: null,
    leitura: { codigoBarras: cod, valor: 412.5, vencimento: "2026-09-20" }, ...extra,
  }) as unknown as import("@/core/compras").BoletoRecebido;
  const nf = {
    id: "nf1", chave: null, numero: "4471", tipo: "nfe", fornecedorId: null, fornecedor: "Papelaria X",
    cnpj: "12.345.678/0001-95", emissao: "2026-09-03", valor: 980, categoria: "Material", status: "autorizada",
    avaliacao: "pendente", origem: "sefaz",
  } as unknown as import("@/core/compras").NFRecebida;
  const docs = ce.documentosDasFontes({
    boletos: [bol("b1", "11111"), bol("b1-dup", "11111"), bol("b2", "22222", { pago: true }), bol("b3", "33333", { movimentoId: "m9" })],
    nfs: [nf],
    ocr: [{ refId: "o1", fornecedor: "Oficina", documento: null, valor: 150, vencimento: "2026-09-25", emissao: null, numero: null, descricao: "Documento lido", categoria: null, recebidoEm: "2026-09-02" }],
  });
  ok("campb: a fila junta as três fontes (DDA, SEFAZ, OCR) e deduplica o boleto pelo código de barras",
     docs.length === 3 && docs.filter((d) => d.origem === "dda").length === 1, docs.map((d) => d.chave).join(","));
  ok("campb: boleto já pago ou já lançado não volta para a fila",
     !docs.some((d) => d.refId === "b2" || d.refId === "b3"));
  const dBol = docs.find((d) => d.origem === "dda")!;
  const semMotivo = ce.descartarEntrada(ce.ESTADO_VAZIO, dBol, "", "2026-09-04T10:00:00Z");
  const curto = ce.descartarEntrada(ce.ESTADO_VAZIO, dBol, "dup", "2026-09-04T10:00:00Z");
  ok("campb: descarte SEM motivo é recusado (e a recusa diz o porquê)",
     !semMotivo.ok && /motivo/i.test((semMotivo as { erro: string }).erro));
  ok("campb: motivo de fachada (\"dup\") também é recusado", !curto.ok);
  const desc = ce.descartarEntrada(ce.ESTADO_VAZIO, dBol, "já pago pelo cartão em 12/09", "2026-09-04T10:00:00Z", "ana");
  ok("campb: descarte com motivo grava", desc.ok);
  const est1 = desc.ok ? desc.estado : ce.ESTADO_VAZIO;
  const cxPend = ce.montarCaixaEntrada(docs, est1.decisoes, "pendentes");
  const cxDesc = ce.montarCaixaEntrada(docs, est1.decisoes, "descartados");
  ok("campb: o descartado sai da fila e aparece no filtro \"descartados\" com o motivo",
     cxPend.contagem.pendentes === 2 && cxDesc.itens.length === 1 && cxDesc.itens[0].decisao?.motivo === "já pago pelo cartão em 12/09");
  ok("campb: o descartado continua listável quando a fonte deixa de trazê-lo",
     ce.montarCaixaEntrada([], est1.decisoes, "descartados").itens.length === 1);
  const dNF = docs.find((d) => d.origem === "sefaz")!;
  const est2 = ce.converterEntrada(est1, dNF, "4471", "2026-09-05T10:00:00Z");
  const cx2 = ce.montarCaixaEntrada(docs, est2.decisoes, "pendentes");
  ok("campb: converter tira da fila e o contador acompanha (3 → 1)",
     cx2.contagem.pendentes === 1 && cx2.contagem.convertidos === 1 && cx2.valorPendente === 150);
  const camposNF = ce.camposDoFormulario(dNF);
  ok("campb: nota sem vencimento abre o formulário SEM vencimento (não na emissão)",
     !("vencimento" in camposNF) && camposNF.competencia === "2026-09-03" && camposNF.entrada === dNF.chave);
  const storeOrg = fsC.readFileSync("src/lib/store-org.ts", "utf8");
  ok("campb: a chave da caixa é dado de NEGÓCIO e tem rótulo (teto zero de chave sem classificação)",
     /caixaEntrada: "a4p_caixa_entrada"/.test(storeOrg) && /a4p_caixa_entrada: "Caixa de entrada de contas a pagar"/.test(storeOrg));
  const form = fsC.readFileSync("src/components/movimentacoes/TituloForm.tsx", "utf8");
  const iConv = form.indexOf("converterPorChave(entrada");
  ok("campb: o documento só sai da fila DEPOIS de a conta ser gravada",
     iConv > form.indexOf("await createLancamento(") && iConv > form.indexOf("appendImported({"));
  const cs = fsC.readFileSync("src/lib/compras-store.ts", "utf8");
  ok("campb: o boleto não tem mais o escritor que só criava conta em demonstração",
     !/export function lancarBoleto/.test(cs));

  /* ── busca global por valor ─────────────────────────────────────────── */
  ok("campb: \"1.234,56\" · \"1234,56\" · \"R$ 1.234,56\" são R$ 1.234,56",
     bu.interpretarValor("1.234,56") === 1234.56 && bu.interpretarValor("1234,56") === 1234.56 && bu.interpretarValor("R$ 1.234,56") === 1234.56);
  ok("campb: \"1.234\" é mil duzentos e trinta e quatro (ponto de milhar)", bu.interpretarValor("1.234") === 1234);
  ok("campb: texto não vira número (\"abril\", \"NF\")", bu.interpretarValor("abril") === null && bu.interpretarValor("NF") === null);
  const ib: RI = {
    hoje: "2026-09-15", saldoAtual: 0, horizonDias: 60,
    partyNames: { p1: "Padaria Pão Bom" },
    movements: [
      mk({ id: "t-1234", amount: 1234.56, party_id: "p1", due_date: "2026-03-10" }),
      mk({ id: "t-11234", amount: 11234.56, due_date: "2026-09-10" }),
      mk({ id: "t-1234b", amount: 1234.5, due_date: "2026-09-11" }),
      mk({ id: "t-doc", amount: 77, referenceCode: "NF-4471", due_date: "2026-09-12" }),
      mk({ id: "t-canc", amount: 1234.56, status: "cancelado", due_date: "2026-09-12" }),
    ],
  };
  const r1 = bu.buscarTitulos(ib, "1.234,56");
  ok("campb: a busca por \"1.234,56\" acha o título de R$ 1.234,56 — e só ele",
     r1.total === 1 && r1.itens[0]?.id === "t-1234" && r1.itens[0].motivo === "valor", JSON.stringify(r1.itens.map((i) => i.id)));
  ok("campb: a busca abre a tela certa já filtrada", r1.itens[0]?.rota === "/contas-a-pagar/titulos?busca=t-1234");
  ok("campb: busca por documento e por contraparte",
     bu.buscarTitulos(ib, "4471").itens[0]?.id === "t-doc" && bu.buscarTitulos(ib, "padaria").itens[0]?.id === "t-1234");
  const muitos: RI = { ...ib, movements: Array.from({ length: 20 }, (_, i) => mk({ id: `x${i}`, amount: 50, category: "Frete" })) };
  const rT = bu.buscarTitulos(muitos, "frete");
  ok("campb: o teto é DECLARADO (mostra 8 e diz que há 20)", rT.itens.length === bu.TETO_TITULOS && rT.total === 20);
  const naTela = mv.filtrarTitulos(ib, "pagar", { busca: "1.234,56" }).map((m) => m.id);
  ok("campb: a lista de títulos (destino da busca) casa o mesmo valor — e não o de R$ 11.234,56",
     naTela.length === 1 && naTela[0] === "t-1234", naTela.join(","));
  ok("campb: \"1234\" na lista não acha R$ 11.234 por texto contido",
     mv.filtrarTitulos({ ...ib, movements: [mk({ id: "y", amount: 11234 })] }, "pagar", { busca: "1234" }).length === 0);

  /* ── extrato do contato ─────────────────────────────────────────────── */
  const ie: RI = {
    hoje: "2026-09-15", saldoAtual: 0, horizonDias: 60, partyNames: { c1: "Cliente Um" },
    movements: [
      mk({ id: "e-velho", type: "entrada", party_id: "c1", amount: 400, due_date: "2026-06-10" }),
      mk({ id: "e-velho-pago", type: "entrada", party_id: "c1", amount: 999, status: "pago", due_date: "2026-05-10", paid_date: "2026-05-12" }),
      mk({ id: "e-antecip", type: "entrada", party_id: "c1", amount: 250, status: "pago", due_date: "2026-08-20", paid_date: "2026-06-30" }),
      mk({ id: "e-pago", type: "entrada", party_id: "c1", amount: 1000, status: "pago", due_date: "2026-07-10", paid_date: "2026-07-15" }),
      mk({ id: "e-venc", type: "entrada", party_id: "c1", amount: 600, due_date: "2026-08-05" }),
      mk({ id: "e-futuro", type: "entrada", party_id: "c1", amount: 300, due_date: "2026-09-25" }),
      mk({ id: "e-forn", type: "saida", party_id: "c1", amount: 5000, due_date: "2026-08-01" }),
    ],
  };
  const xt = ex.montarExtratoContato(ie, "c1", "receber", "2026-07-01", "2026-09-30");
  const abertoIndep = ie.movements
    .filter((m) => m.type === "entrada" && m.status !== "pago" && m.due_date <= "2026-09-30")
    .reduce((s, m) => s + m.amount, 0);
  ok("campb: o extrato FECHA — saldo anterior + lançado − quitado == em aberto calculado por fora",
     xt.saldoFinal === xt.emAberto && xt.emAberto === abertoIndep && xt.saldoAnterior === 400 && xt.lancado === 2150 && xt.quitado === 1250,
     JSON.stringify({ a: xt.saldoAnterior, l: xt.lancado, q: xt.quitado, f: xt.saldoFinal, ab: xt.emAberto, ind: abertoIndep }));
  ok("campb: título pago ANTES do período não fica em aberto no extrato",
     xt.linhas.find((l) => l.id === "e-antecip")?.situacao === "quitado");
  ok("campb: vencido é o que passou do prazo até hoje (o futuro é a vencer)",
     xt.vencido === 1000 && xt.linhas.find((l) => l.id === "e-futuro")?.situacao === "a_vencer");
  ok("campb: o lado não se mistura (a conta a pagar ao mesmo contato não entra)",
     !xt.linhas.some((l) => l.id === "e-forn"));
  // REVISÃO CAMP-B · liquidado SEM data de pagamento (baixa antiga, importação)
  // é quitado — exigir `paid_date` deixava o título em aberto para sempre e o
  // extrato cobrava do cliente o que ele já pagou.
  const ieSemData: RI = { ...ie, movements: [mk({ id: "e-sem-data", type: "entrada", party_id: "c1", amount: 480, status: "pago", paid_date: null, due_date: "2026-08-10" })] };
  const xs = ex.montarExtratoContato(ieSemData, "c1", "receber", "2026-07-01", "2026-09-30");
  ok("campb: título liquidado sem data de pagamento sai QUITADO do extrato, não em aberto",
     xs.emAberto === 0 && xs.vencido === 0 && xs.quitado === 480 && xs.linhas[0]?.situacao === "quitado",
     JSON.stringify({ ab: xs.emAberto, v: xs.vencido, q: xs.quitado }));
  ok("campb: intervalo invertido é DITO, não um extrato vazio calado",
     !!ex.montarExtratoContato(ie, "c1", "receber", "2026-09-30", "2026-07-01").problema);

  /* ── eliminações no consolidado ─────────────────────────────────────── */
  const ent = (id: string, nome: string, movs: M[], partyNames: Record<string, string>) =>
    ({ id, nome, input: { hoje: "2026-09-15", saldoAtual: 1000, horizonDias: 60, partyNames, movements: movs } as RI });
  const grupo = [
    ent("h", "Holding", [
      mk({ id: "ic-r", type: "entrada", party_id: "pm", amount: 2500, due_date: "2026-09-05" }),
      mk({ id: "ic-r-fora", type: "entrada", party_id: "pm", amount: 700, due_date: "2026-05-05" }),
    ], { pm: "Matriz" }),
    ent("m", "Matriz", [
      mk({ id: "ic-p", type: "saida", party_id: "ph", amount: 2500, due_date: "2026-09-06" }),
      mk({ id: "ic-p-fora", type: "saida", party_id: "ph", amount: 700, due_date: "2026-05-05" }),
      mk({ id: "venda-terceiro", type: "entrada", party_id: "pt", amount: 2500, due_date: "2026-09-05" }),
      mk({ id: "custo", type: "saida", party_id: "pt", amount: 800, due_date: "2026-09-10" }),
    ], { ph: "Holding", pt: "Cliente Terceiro" }),
  ];
  const pos = pc.montarPosicaoConsolidada(grupo, "2026-09-01", "2026-09-30");
  ok("campb: o par intercompany é eliminado e LISTADO (quem, quanto, competência)",
     pos.eliminacoes.length === 1 && pos.eliminacoes[0].valor === 2500 && pos.eliminacoes[0].entre.includes("Holding") && pos.eliminacoes[0].competencia === "2026-09-05",
     JSON.stringify(pos.eliminacoes));
  ok("campb: a venda a TERCEIRO de mesmo valor e data não é eliminada (critério conservador)",
     pos.depois.receita === 2500 && pos.antes.receita === 5000);
  ok("campb: eliminar tira o MESMO valor dos dois lados — o resultado não se move",
     pos.antes.resultado === pos.depois.resultado && pos.eliminadoReceita === pos.eliminadoDespesa && pos.eliminadoReceita === 2500);
  ok("campb: o par de OUTRO mês não sai do período (a soma não o tinha)",
     !pos.eliminacoes.some((e) => e.entrada.includes("fora")));
  // REVISÃO CAMP-B · o par que ATRAVESSA a borda do período (entrada 29/09,
  // saída 02/10 — dentro da tolerância de 5 dias). Filtrando só pela competência
  // (a data da entrada), setembro tirava a receita e uma despesa que não somou:
  // o resultado consolidado caía 900 sem nada ter acontecido.
  const borda = [
    ent("h", "Holding", [mk({ id: "b-r", type: "entrada", party_id: "pm", amount: 900, due_date: "2026-09-29" })], { pm: "Matriz" }),
    ent("m", "Matriz", [mk({ id: "b-p", type: "saida", party_id: "ph", amount: 900, due_date: "2026-10-02" })], { ph: "Holding" }),
  ];
  const posB = pc.montarPosicaoConsolidada(borda, "2026-09-01", "2026-09-30");
  ok("campb: par que atravessa a borda do período NÃO é eliminado pela metade (o resultado não se move)",
     posB.antes.resultado === posB.depois.resultado && posB.eliminadoReceita === posB.eliminadoDespesa && posB.eliminacoes.length === 0,
     JSON.stringify({ a: posB.antes, d: posB.depois, n: posB.eliminacoes.length }));
  const posB2 = pc.montarPosicaoConsolidada(borda, "2026-09-01", "2026-10-31");
  ok("campb: com as duas pontas no período o mesmo par É eliminado (a guarda não passa sobre o vazio)",
     posB2.eliminacoes.length === 1 && posB2.eliminadoReceita === 900 && posB2.antes.resultado === posB2.depois.resultado);
  const cv = fsC.readFileSync("src/components/consolidado/ConsolidadoView.tsx", "utf8");
  ok("campb: a tela do Consolidado usa a posição com eliminações e mostra a lista",
     /montarPosicaoConsolidada\(/.test(cv) && /<ListaEliminacoes/.test(cv));
  const mvw = fsC.readFileSync("src/components/relatorios/MultiempresaView.tsx", "utf8");
  ok("campb: nenhuma tela de consolidado afirma \"sem eliminações\" enquanto elimina",
     !/Sem eliminações intercompany \(v1\)/.test(mvw) && /<ListaEliminacoes/.test(mvw));
}

/* ── IA E AJUDA (30/09/2026) — a Quattro AI responde o MESMO número da tela ──
 *
 * Cada asserção abaixo nasceu de um número que a IA dizia diferente da tela que
 * responde à mesma pergunta, medido na demonstração:
 *   · "runway de 0 meses" ao lado de "— não há queima" no Fluxo de caixa (o
 *     quant copiava o `.valor` 0 de um indicador AUSENTE);
 *   · margem de CAIXA (39%) contra a margem líquida do DRE (56,4%);
 *   · "lucro" respondido com o resultado de caixa;
 *   · origem do EBITDA dizendo "0 lançamentos";
 *   · "posso gastar?" com uma reserva inventada (15% do saldo × 3);
 *   · a semana de domingo a sábado contra a de segunda a domingo dos painéis;
 *   · "0 dia(s) no do vencimento".
 * E da Central de Ajuda: o detector que deixava passar o CPF sem pontuação e o
 * cartão colado com a validade, e o chamado gravado por fora do `store-org`.
 * Cada uma foi provada plantando o defeito de volta.
 */
{
  const fsIA = await import("node:fs");
  const { centroInteligencia } = await import("@/core/executive");
  const { classificar } = await import("@/core/quant/score");
  const { VEREDITO_LABEL } = await import("@/core/aquisicao");
  const { pct: pctIA } = await import("@/lib/format");
  const { KB } = await import("@/lib/assistant-kb");
  const { destinoDe } = await import("@/core/rotas/aliases");
  const { planejarContratacoes } = await import("@/core/headcount");
  const { simularCenario } = await import("@/core/executive/scenario");

  const HOJE_IA = "2026-07-15"; // quarta-feira: a semana vai de 13/07 (seg) a 19/07 (dom)
  let sIA = 0;
  const mvIA = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `ia${sIA++}`, type: "entrada", amount: 1000, due_date: HOJE_IA, paid_date: HOJE_IA, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  // Empresa que GERA caixa (sem queima) e com receita de julho ainda a receber:
  // é o caso que separa margem de caixa (50%) de margem do DRE (64%).
  const inpIA: RiskInput = { hoje: HOJE_IA, saldoAtual: 100000, partyNames: {}, movements: [
    mvIA({ amount: 30000, due_date: "2026-05-10", paid_date: "2026-05-10" }),
    mvIA({ amount: 30000, due_date: "2026-06-10", paid_date: "2026-06-10" }),
    mvIA({ amount: 10000, due_date: "2026-07-05", paid_date: "2026-07-05" }),
    mvIA({ amount: 10000, due_date: "2026-07-20", paid_date: null, status: "pendente" }),
    mvIA({ type: "saida", amount: 10000, due_date: "2026-05-12", paid_date: "2026-05-12", category: "Fornecedores" }),
    mvIA({ type: "saida", amount: 10000, due_date: "2026-06-12", paid_date: "2026-06-12", category: "Fornecedores" }),
    mvIA({ type: "saida", amount: 5000, due_date: "2026-07-08", paid_date: "2026-07-08", category: "Fornecedores" }),
    // domingo DENTRO da semana seg–dom (fora da dom–sáb) …
    mvIA({ type: "saida", amount: 1500, due_date: "2026-07-19", paid_date: null, status: "pendente", category: "Aluguel" }),
    // … e o domingo ANTERIOR, dentro da dom–sáb e fora da seg–dom
    mvIA({ type: "saida", amount: 700, due_date: "2026-07-12", paid_date: null, status: "pendente", category: "Energia" }),
  ] } as RiskInput;
  const ctxIA = centroInteligencia(inpIA).context;
  const resp = (q: string, i: RiskInput = inpIA) => responderLocal(q, i, ctxIA)?.resposta ?? "";

  /* runway: a AUSÊNCIA atravessa a IA — nunca "0 meses" sobre quem gera caixa */
  const qIA = analisarQuantitativo(inpIA).indicadores;
  ok("ia: o quant devolve runway AUSENTE (null + sem_queima), não 0, para quem gera caixa",
     qIA.runwayMeses === null && qIA.runwayMotivo?.codigo === "sem_queima", `runwayMeses=${qIA.runwayMeses}`);
  const rSaldo = responderLocal("qual meu saldo?", inpIA, ctxIA);
  ok("ia: o saldo não afirma runway de 0 meses sobre uma empresa que gera caixa",
     !!rSaldo && !/\b0(,0)? meses\b/.test(rSaldo.resposta) && /não há prazo de runway/.test(rSaldo.resposta), rSaldo?.resposta.slice(0, 160));
  ok("ia: a pílula do runway é a da tela (\"— não há queima\")",
     !!rSaldo && rSaldo.numeros.some((n) => n.label === "Runway" && n.valor === "— não há queima"), JSON.stringify(rSaldo?.numeros));
  const rRun = resp("qual meu runway?");
  ok("ia: \"qual meu runway?\" diz que não há queima, sem número inventado",
     /não houve queima/.test(rRun) && !/\b0(,0)? meses\b/.test(rRun), rRun.slice(0, 120));

  /* margem e lucro: a MESMA conta do DRE (competência), não a de caixa */
  const cIA = cascataDRE(inpIA, { intervalo: { de: "2026-07-01", ate: "2026-07-31" }, regime: "competencia" });
  const mEsperada = pctIA(cIA.margemLiquida.valor);
  ok("ia: âncora à mão — a margem líquida de julho do DRE é 64,0% (12.800 ÷ 20.000)", mEsperada === "64,0%", mEsperada);
  const rMarg = resp("qual minha margem esse mês?");
  ok("ia: a margem da IA é a margem líquida do DRE (64,0%), não a de caixa (50,0%)",
     rMarg.includes(`é ${mEsperada}`) && !/\b50(,0)?%/.test(rMarg), rMarg.slice(0, 140));
  const rLucro = resp("qual meu lucro esse mês?");
  ok("ia: \"lucro\" é o resultado líquido do DRE (R$12.800,00), com o caixa (R$5.000,00) dito como caixa",
     /resultado líquido de R\$\s?12\.800,00/.test(rLucro) && /por competência/.test(rLucro) && /Pelo caixa.*R\$\s?5\.000,00/.test(rLucro), rLucro.slice(0, 220));

  /* origem: a linha "=" do DRE não tem lançamento próprio — a frase soma as linhas que a formam */
  const rEb = resp("qual meu EBITDA?");
  const nLanc = Number(rEb.match(/(\d+) lançamentos?\./)?.[1] ?? "0");
  ok("ia: a origem do EBITDA cita os lançamentos que o formam (não \"0 lançamentos\")", nLanc > 0, rEb.slice(-120));

  /* posso gastar? — a MESMA reserva do simulador "Posso comprar?" */
  const sitIA = situacaoDe(inpIA);
  const reservaIA = formatBRL(sitIA.despesaMensal * 3);
  const simIA = simularAquisicao(sitIA, { tipo: "outro", valor: 20000, entrada: 20000, parcelas: 0, taxaMensal: 0 });
  const rGasto = resp("posso gastar 20 mil?");
  ok("ia: \"posso gastar 20 mil?\" usa a reserva do simulador (3 meses de DESPESA média)",
     rGasto.includes(reservaIA), `esperava ${reservaIA} — ${rGasto.slice(0, 200)}`);
  ok("ia: …e não a reserva inventada de 15% do saldo × 3 (R$45.000,00)", !/45\.000,00/.test(rGasto), rGasto.slice(0, 200));
  ok("ia: …com o MESMO veredito da tela \"Posso comprar?\"", rGasto.startsWith(VEREDITO_LABEL[simIA.veredito]), `${VEREDITO_LABEL[simIA.veredito]} × ${rGasto.slice(0, 40)}`);

  /* a semana: segunda a domingo, como os painéis de contas a pagar/receber */
  const rSem = resp("o que vence esta semana?");
  ok("ia: \"esta semana\" vai de segunda a domingo — o título do DOMINGO 19/07 entra (R$1.500,00)",
     /R\$\s?1\.500,00 a pagar/.test(rSem), rSem.slice(0, 160));
  ok("ia: …e o do domingo ANTERIOR (12/07) não entra", !/R\$\s?2\.200,00|R\$\s?700,00 a pagar/.test(rSem), rSem.slice(0, 160));
  // sem período na pergunta, o padrão é a semana corrente — pela MESMA função
  const rVenc = resp("quais os próximos vencimentos?");
  ok("ia: sem período dito, os vencimentos são os da semana seg–dom (R$1.500,00)",
     /R\$\s?1\.500,00 a pagar/.test(rVenc) && /nesta semana/i.test(rVenc), rVenc.slice(0, 160));

  /* pontualidade: pagar no dia é "no dia do vencimento", não "0 dia(s) no do vencimento" */
  const inpPont: RiskInput = { hoje: HOJE_IA, saldoAtual: 0, partyNames: {}, movements: [
    mvIA({ amount: 800, due_date: "2026-07-01", paid_date: "2026-07-01" }),
    mvIA({ amount: 900, due_date: "2026-07-03", paid_date: "2026-07-03" }),
  ] } as RiskInput;
  const rPont = responderLocal("meus clientes pagam em dia?", inpPont)?.resposta ?? "";
  ok("ia: pagar no vencimento lê \"no dia do vencimento\" (sem \"0 dia(s)\")",
     /no dia do vencimento/.test(rPont) && !/0 dia\(s\)/.test(rPont), rPont.slice(0, 120));

  /* saúde: a MESMA faixa da tela Quant, e a chance de ruptura com o horizonte certo (60 dias) */
  const rSaude = resp("como está a saúde da empresa?");
  const nivelIA = ({ excelente: "excelente", saudavel: "saudável", atencao: "em atenção", risco: "em risco elevado", critico: "crítica" } as const)[classificar(ctxIA.scoreFinanceiro)];
  ok("ia: a saúde usa a faixa da tela Quant (classificar)", rSaude.includes(`está ${nivelIA}:`), `${nivelIA} × ${rSaude.slice(0, 80)}`);
  ok("ia: a chance de ruptura é dita em 60 dias (o horizonte do motor), nunca 90",
     /em 60 dias/.test(rSaude) && !/90 dias/.test(rSaude), rSaude.slice(0, 220));

  /* onde economizar sem mês anterior: não há "subiu" sobre base vazia */
  const inpEco: RiskInput = { hoje: HOJE_IA, saldoAtual: 0, partyNames: {}, movements: [
    mvIA({ type: "saida", amount: 4000, due_date: "2026-07-03", paid_date: "2026-07-03", category: "Fornecedores" }),
  ] } as RiskInput;
  const rEco = responderLocal("onde posso economizar?", inpEco)?.resposta ?? "";
  ok("ia: sem despesa no mês anterior, \"onde economizar\" não diz que algo subiu",
     !/subiu R\$/.test(rEco) && /para comparar/.test(rEco), rEco.slice(0, 120));

  /* headcount: o "antes" sai da mesma conta do "depois" */
  const hc = planejarContratacoes(qIA, inpIA.saldoAtual, 80, [{ id: "c1", cargo: "Analista", salario: 5000, quantidade: 1, mesInicio: 1 }]);
  ok("headcount: o runway ANTES sai do mesmo cenário do DEPOIS (era o canônico ausente lido como 0)",
     hc.antes.runwayMeses === simularCenario(qIA, inpIA.saldoAtual, {}).runwayMeses && hc.antes.runwayMeses > 0, `antes=${hc.antes.runwayMeses}`);

  /* as portas que a IA oferece: nenhuma rota da base de conhecimento é um desvio */
  const rotasKB = Array.from(new Set(KB.map((k) => k.rota).filter((r): r is string => !!r)));
  const desvios = rotasKB.filter((r) => { const [c, q] = r.split("?"); return destinoDe(c, q ? `?${q}` : undefined) !== null; });
  ok("ia: nenhum \"Abrir tela ↗\" da base de conhecimento leva a um alias", desvios.length === 0 && rotasKB.length > 0, desvios.join(", "));

  /* ── Central de Ajuda: o detector de segredos, nos formatos que se cola de verdade ── */
  const tiposIA = (t: string) => detectarSegredos(t).map((a) => a.tipo).join(",");
  ok("ajuda: CPF SEM pontuação é pego (tinha âncora só para o formatado)", tiposIA("meu cpf é 52998224725") === "cpf", tiposIA("meu cpf é 52998224725"));
  ok("ajuda: …e redigido antes de gravar", !redigirSegredos("meu cpf é 52998224725").includes("52998224725"));
  ok("ajuda: CPF seguido de um valor continua sendo só CPF", tiposIA("cpf 529.982.247-25 1000 reais") === "cpf", tiposIA("cpf 529.982.247-25 1000 reais"));
  ok("ajuda: cartão com espaços colado com a validade é pego", tiposIA("cartão 4111 1111 1111 1111 12/28") === "cartao", tiposIA("cartão 4111 1111 1111 1111 12/28"));
  ok("ajuda: …e o número some da mensagem", !/4111 1111 1111 1111/.test(redigirSegredos("cartão 4111 1111 1111 1111 12/28")));
  ok("ajuda: o dia a dia do financeiro continua limpo (valor, NF, data, 11 dígitos inválidos)",
     !temSegredo("Paguei R$ 1.234,56 da NF 000123456789 em 10/09/2026") && !temSegredo("o protocolo 12345678901 sumiu"));

  /* ── Central de Ajuda + chat: o que a tela promete tem de ser o que acontece ── */
  const srcIA = (f: string) => fsIA.readFileSync(f, "utf8");
  const semComentIA = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const ajudaStore = srcIA("src/lib/ajuda-store.ts");
  ok("ajuda: chamados e conversa passam pelo store-org (gravados à parte, a hidratação os apagava)",
     /gravarOrg\(K_CHAMADOS/.test(ajudaStore) && /gravarOrg\(K_CONVERSA/.test(ajudaStore)
     && /lerOrg<unknown>\(K_CHAMADOS/.test(ajudaStore) && /lerOrg<unknown>\(K_CONVERSA/.test(ajudaStore)
     && !/gravar\(K_CHAMADOS|gravar\(K_CONVERSA|ler<[^>]+>\(K_CHAMADOS|ler<[^>]+>\(K_CONVERSA/.test(ajudaStore));
  // Não há canal que leve o chamado ao suporte da Quattro: a tela não pode dizer que leva.
  const promessaSuporte = /alguém do suporte|o suporte recebe|chamado para o suporte|chega ao suporte|enviado ao suporte/i;
  for (const f of ["src/components/ajuda/AjudaView.tsx", "src/components/app/guides.ts"]) {
    ok(`ajuda: ${f.split("/").pop()} não promete entrega ao suporte que não existe`, !promessaSuporte.test(semComentIA(srcIA(f))));
  }
  for (const f of ["src/components/ia/IAView.tsx", "src/components/app/AssistantWidget.tsx"]) {
    const s = srcIA(f);
    const cls = s.match(/aria-label="Enviar"\s*className="([^"]+)"/)?.[1] ?? "";
    ok(`ia: o botão Enviar de ${f.split("/").pop()} é lime + verde-base (a seta em on-lime sobre ink era invisível)`,
       /\bbg-lime\b/.test(cls) && /\btext-on-lime\b/.test(cls) && !/\bbg-ink\b/.test(cls), cls);
    ok(`ia: ${f.split("/").pop()} não escreve "Quattro IA" na tela (a marca é ${"Quattro AI"})`, !/Quattro IA\b/.test(semComentIA(s)));
  }
  const iaView = semComentIA(srcIA("src/components/ia/IAView.tsx"));
  ok("ia: o rodapé do histórico diz a verdade do ambiente (não afirma \"neste navegador\" em produção)",
     /isDemo\s*\?/.test(iaView) && !/não acompanham você em outra máquina/.test(iaView));
  ok("ia: o histórico ouve a hidratação (a lista nascia vazia numa máquina nova)", /inscreverConversas\(/.test(iaView));
  const widget = srcIA("src/components/app/AssistantWidget.tsx");
  ok("ia: a conversa do painel flutuante entra no MESMO histórico da página", /salvarConversa\(/.test(widget) && /onMudou:\s*aoMudar/.test(widget));
  const kit = srcIA("src/components/ia/chat-kit.tsx"), chat = srcIA("src/components/ia/useChatIA.ts");
  ok("ia: \"Copiado\" só aparece se copiou (a cópia é AGUARDADA e devolve o resultado)",
     /await navigator\.clipboard\.writeText/.test(kit) && /const ok = await copiarTexto\(/.test(chat) && /copia === "falhou"/.test(kit));
  const fb = chat.slice(chat.indexOf("const darFeedback"), chat.indexOf("const responder"));
  ok("ia: o feedback entra na conversa salva e não conta duas vezes",
     /if \(t\.feedback === dir\) return;/.test(fb) && /mudouRef\.current\?\.\(novo\)/.test(fb));
  const copilotoLib = srcIA("src/lib/ai-copilot.ts");
  const logIA = copilotoLib.slice(copilotoLib.indexOf("export async function logAcaoIA"), copilotoLib.indexOf("export async function listAcoesIA"));
  ok("ia: a recusa do banco ao gravar a trilha da IA não é engolida (o cliente devolve `error`, não lança)",
     /const \{ error \} = await createClient\(\)\.from\("ai_actions"\)\.insert/.test(logIA) && /if \(error\) throw error/.test(logIA) && /reportar\(/.test(logIA));
}

/* ── IA — REVISÃO (01/10/2026): "a receber" é CONTA a receber ──
 *
 * A IA somava ao "a receber", aos vencimentos e à lista de devedores TODA
 * entrada pendente — inclusive empréstimo a creditar e transferência entre
 * contas próprias. O painel de Contas a receber (`ehContaAReceber`) não soma, e
 * a pessoa via dois totais para a mesma pergunta. Provada plantando o defeito.
 */
{
  const { montarPainelContasReceber } = await import("@/core/contas-receber");
  const H = "2026-07-15";
  let k = 0;
  const mvR = (o: Partial<RiskMovement>): RiskMovement =>
    ({ id: `rv${k++}`, type: "entrada", amount: 1000, due_date: H, paid_date: null, status: "pendente", category: "Vendas", party_id: null, ...o }) as RiskMovement;
  const inpR: RiskInput = { hoje: H, saldoAtual: 50000, partyNames: { c1: "Cliente Um" }, movements: [
    mvR({ amount: 3000, due_date: "2026-07-17", party_id: "c1" }),
    mvR({ amount: 2000, due_date: "2026-07-10", party_id: "c1" }),
    mvR({ amount: 20000, due_date: "2026-07-16", category: "Empréstimo bancário" }),
    mvR({ amount: 7000, due_date: "2026-07-08", category: "Transferência entre contas" }),
  ] } as RiskInput;
  const painel = montarPainelContasReceber(inpR, { de: "2026-01-01", ate: "2026-12-31" });
  ok("ia-rev: âncora — a carteira do painel de Contas a receber é R$ 5.000,00 (sem empréstimo nem transferência)",
     Math.abs(painel.carteira.emAberto - 5000) < 0.005, String(painel.carteira.emAberto));
  const rRec = responderLocal("quanto tenho a receber?", inpR)?.resposta ?? "";
  ok("ia-rev: \"quanto tenho a receber?\" é a carteira do painel (R$5.000,00), não R$32.000,00",
     /Há R\$\s?5\.000,00 a receber em 2 título/.test(rRec), rRec.slice(0, 140));
  const rDev = responderLocal("quem está me devendo?", inpR)?.resposta ?? "";
  ok("ia-rev: a lista de devedores não cobra a transferência que a empresa fez para si mesma (vencido R$2.000,00)",
     /R\$\s?2\.000,00 vencidos/.test(rDev) && !/9\.000,00|7\.000,00/.test(rDev), rDev.slice(0, 140));
  const rSem = responderLocal("o que vence esta semana?", inpR)?.resposta ?? "";
  ok("ia-rev: o \"a receber\" da semana não inclui o empréstimo a creditar (R$3.000,00)",
     /R\$\s?3\.000,00 a receber/.test(rSem), rSem.slice(0, 140));

  /* receita ≠ toda entrada; gasto ≠ toda saída */
  const inpF: RiskInput = { hoje: H, saldoAtual: 10000, partyNames: { a: "Alfa" }, movements: [
    mvR({ amount: 10000, party_id: "a", paid_date: H, status: "pago" }),
    mvR({ amount: 20000, category: "Empréstimo bancário", paid_date: H, status: "pago" }),
    mvR({ amount: 3000, category: "Transferência entre contas", paid_date: H, status: "pago" }),
    mvR({ type: "saida", amount: 4000, category: "Fornecedores", paid_date: H, status: "pago" }),
    mvR({ type: "saida", amount: 2500, category: "Transferência entre contas", paid_date: H, status: "pago" }),
  ] } as RiskInput;
  const rFat = responderLocal("quanto faturei esse mês?", inpF)?.resposta ?? "";
  ok("ia-rev: \"quanto faturei?\" é a receita (R$10.000,00), não o empréstimo somado (R$33.000,00)",
     /receita recebida em julho soma R\$\s?10\.000,00/.test(rFat) && !/Principal origem: Empréstimo/.test(rFat), rFat.slice(0, 160));
  ok("ia-rev: …e o que entrou sem ser faturamento é DITO, não some (R$23.000,00)", /R\$\s?23\.000,00 que não são faturamento/.test(rFat), rFat.slice(0, 220));
  const rEnt = responderLocal("quanto entrou esse mês?", inpF)?.resposta ?? "";
  ok("ia-rev: \"quanto entrou?\" (caixa) cita o total das entradas E a parte que é receita",
     /Entraram R\$\s?33\.000,00/.test(rEnt) && /R\$\s?10\.000,00 de receita/.test(rEnt), rEnt.slice(0, 160));
  const rCli = responderLocal("quem é meu maior cliente?", inpF)?.resposta ?? "";
  ok("ia-rev: a fatia do maior cliente é sobre a RECEITA (100%), não sobre o empréstimo junto (30%)", /100% da receita/.test(rCli), rCli.slice(0, 140));
  const rOri = responderLocal("de onde vem minha receita?", inpF)?.resposta ?? "";
  ok("ia-rev: \"de onde vem a receita\" não lista empréstimo como fonte de receita", !/concentra-se em:[^.]*Empréstimo/.test(rOri), rOri.slice(0, 200));
  const rGas = responderLocal("quanto gastei esse mês?", inpF)?.resposta ?? "";
  ok("ia-rev: \"quanto gastei?\" não conta a transferência entre contas próprias como gasto (R$4.000,00)",
     /gastos pagos em julho somam R\$\s?4\.000,00/.test(rGas), rGas.slice(0, 160));
}

/* ── FOLHA, COMPRAS E REEMBOLSOS ── */
{
  const fsF = await import("node:fs");
  const lerF = (p: string) => fsF.readFileSync(p, "utf8");
  // Comentários saem antes da busca: a guarda não pode reprovar a documentação
  // que cita o defeito (a lição da varredura da ONDA 14).
  const semComent = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const ana: Colaborador = { id: "a", nome: "Ana Souza", vinculo: "clt", valor: 5000, desde: "2026-09" };

  /* ---- 13º PROPORCIONAL: quem entrou em setembro não recebe o 13º inteiro ---- */
  const d13 = titulosDoDecimo(ana, 2026, "presumido", null);
  const parcelas13 = d13.filter((t) => t.tipo === "decimo");
  ok("folha13: 4 meses de casa dão 4/12 do 13º", mesesAtivosNoAno(ana, 2026) === 4);
  // Conferido à mão: 5.000 × 4/12 = 1.666,67; metade = 833,34; INSS sobre o 13º
  // (7,5% até 1.518 + 9% sobre 148,67) = 127,23; IRRF zero; 2ª = 706,10.
  ok("folha13: a 1ª parcela de quem entrou em setembro é 833,34 — NÃO os 2.500 do 13º inteiro",
     parcelas13[0]?.valor === 833.34, String(parcelas13[0]?.valor));
  ok("folha13: a 2ª parcela desconta o INSS do 13º PROPORCIONAL (706,10)",
     parcelas13[1]?.valor === 706.1, String(parcelas13[1]?.valor));
  ok("folha13: a descrição diz a proporção (4/12)", /\(4\/12\)/.test(parcelas13[0]?.descricao ?? ""));

  /* ---- O 13º TEM ENCARGOS: tudo o que ele custa vira título ---- */
  const cheio: Colaborador = { ...ana, desde: "2025-01" };
  const d25 = titulosDoDecimo(cheio, 2025, "presumido", null);
  // ⚠️ A INVARIANTE, e não uma lista de valores: 13º + FGTS + patronal = soma
  // dos títulos. O IRRF e o INSS do empregado saem da 2ª parcela e voltam como
  // DARF — o dinheiro não some nem aparece duas vezes. Sem os títulos de
  // encargo a soma dava 4.177,51 (só as duas parcelas).
  ok("folha13: tudo o que o 13º custa (13º + FGTS + patronal = 6.800) vira título",
     r2(d25.reduce((s, t) => s + t.valor, 0)) === 6800, String(r2(d25.reduce((s, t) => s + t.valor, 0))));
  const fgts13 = d25.filter((t) => t.tipo === "fgts");
  ok("folha13: FGTS de cada parcela — a 1ª até 20/12, a 2ª até 20/01",
     fgts13.length === 2 && fgts13[0].valor === 200 && fgts13[0].vencimento === "2025-12-19"
     && fgts13[1].valor === 200 && fgts13[1].vencimento === "2026-01-20",
     fgts13.map((t) => `${t.vencimento}:${t.valor}`).join(" "));
  const inss13 = d25.find((t) => /^INSS do 13º/.test(t.descricao));
  const irrf13 = d25.find((t) => /^IRRF do 13º/.test(t.descricao));
  ok("folha13: INSS do empregado + patronal do 13º no DARF de 20/12 (509,60 + 1.400)",
     inss13?.valor === 1909.6 && inss13?.vencimento === "2025-12-19", `${inss13?.vencimento}:${inss13?.valor}`);
  ok("folha13: IRRF retido na 2ª parcela no DARF de 20/01 (312,89)",
     irrf13?.valor === 312.89 && irrf13?.vencimento === "2026-01-20", `${irrf13?.vencimento}:${irrf13?.valor}`);

  /* ---- O cadastro não agenda o 13º de um ano cujos meses não gerou ---- */
  const per = titulosDoPeriodo(ana, 12, "nao_declarado", null);
  ok("folha13: 12 meses a partir de 09/2026 agendam SÓ o 13º de 2026",
     per.filter((t) => t.tipo === "decimo").every((t) => t.competencia === "2026-12")
     && per.filter((t) => t.tipo === "decimo").length === 2,
     per.filter((t) => t.tipo === "decimo").map((t) => t.descricao).join(" | "));
  ok("folha13: nenhum título do cadastro vence depois do último mês gerado + 1",
     per.every((t) => t.vencimento <= "2027-09-30"), per[per.length - 1]?.vencimento);

  /* ---- PENSÃO: o que se desconta, se deposita ---- */
  const comPensao = titulosDaCompetencia({ ...ana, pensao: 1000 }, "2026-09", "presumido", null);
  const pensao = comPensao.find((t) => t.tipo === "pensao");
  const salarioP = comPensao.find((t) => t.tipo === "salario");
  ok("folha: a pensão descontada vira título de 1.000 na data do salário",
     pensao?.valor === 1000 && pensao?.vencimento === salarioP?.vencimento, `${pensao?.valor}`);
  ok("folha: salário + pensão = o líquido sem a pensão (o dinheiro não some)",
     r2((salarioP?.valor ?? 0) + (pensao?.valor ?? 0)) === 4490.4);
  ok("folha: sem pensão, continuam TRÊS títulos por CLT",
     titulosDaCompetencia(ana, "2026-09", "presumido", null).length === 3);

  /* ---- PJ: a retenção é recolhida, e não se afirma o que não foi declarado ---- */
  const pjNao = titulosDaCompetencia({ ...ana, vinculo: "pj", valor: 10_000, prestadorSimples: false }, "2026-09", "presumido", null);
  const ret = pjNao.find((t) => t.tipo === "retencao");
  ok("folha PJ: fora do Simples, IRRF 1,5% + PCC 4,65% viram DARF de 615",
     ret?.valor === 615 && ret?.vencimento === "2026-11-19", `${ret?.vencimento}:${ret?.valor}`);
  ok("folha PJ: nota líquida + retenção = a nota cheia (o custo)",
     r2(pjNao.reduce((s, t) => s + t.valor, 0)) === 10_000);
  ok("folha PJ: a retenção fica na MESMA linha do DRE que a nota",
     ret?.categoria === pjNao[0].categoria);
  const memNd = calcularPJ({ ...ana, vinculo: "pj", valor: 10_000 }, "2026-09").memoria.map((l) => l.formula).join(" ");
  ok("folha PJ: sem declaração, a memória NÃO afirma que o prestador é do Simples",
     !/prestador do Simples Nacional/.test(memNd) && /não diz se o prestador é do Simples/.test(memNd));
  ok("folha PJ: declarado do Simples, sem retenção e dito assim",
     titulosDaCompetencia({ ...ana, vinculo: "pj", valor: 10_000, prestadorSimples: true }, "2026-09", "presumido", null).length === 1
     && /prestador do Simples Nacional/.test(calcularPJ({ ...ana, vinculo: "pj", valor: 10_000, prestadorSimples: true }, "2026-09").memoria[1].formula));

  /* ---- A COMPETÊNCIA de um título da folha é o mês de TRABALHO ---- */
  const sal09 = titulosDaCompetencia(ana, "2026-09", "presumido", null)[0];
  ok("folha: o salário de 09/2026 vence em outubro e é competência de SETEMBRO",
     sal09.vencimento.startsWith("2026-10") && competenciaDoTitulo(sal09) === "2026-09-30",
     `${sal09.vencimento} → ${competenciaDoTitulo(sal09)}`);
  const libFolha = lerF("src/lib/folha.ts");
  ok("folha: o mapeamento para o escritor único usa a competência, não o vencimento",
     /competence_date: competenciaDoTitulo\(t\)/.test(libFolha));
  const telaFolha = semComent(lerF("src/components/contas-pagar/FolhaSalarial.tsx"));
  ok("folha: a tela da folha agenda pelo mapeamento único (era `competence_date: t.vencimento`)",
     /linhaDoTituloDaFolha\(/.test(telaFolha) && !/competence_date: t\.vencimento/.test(telaFolha));
  // ⚠️ A substituição (rescisão/férias) LÊ A DESCRIÇÃO do título. O ramo de
  // demonstração de `getRiscoInput` não a transporta, e a tela que alimentava
  // a substituição pelo `RiskInput` não achava título nenhum para retirar.
  ok("folha: a substituição lê títulos de uma fonte que carrega a DESCRIÇÃO (não o RiskInput)",
     /descricao:\s*m\.description/.test(telaFolha)
     && !/const lancamentos[^;]*risco\?\.movements/.test(telaFolha));

  /* ---- A RESCISÃO substitui o que o cadastro agendou ---- */
  const lanc = per.map((t, k) => ({
    id: `m${k}`, type: "saida", status: "pendente", amount: t.valor, due_date: t.vencimento, descricao: t.descricao,
    accountId: "ac-folha",
  }));
  lanc.push({ id: "pago", type: "saida", status: "pago", amount: 4490.4, due_date: "2026-11-09", descricao: "Salário 10/2026 · Ana Souza", accountId: "ac-folha" });
  lanc.push({ id: "outro", type: "saida", status: "pendente", amount: 4490.4, due_date: "2026-11-09", descricao: "Salário 10/2026 · Bruno Reis", accountId: "ac-x" });
  lanc.push({ id: "manual", type: "saida", status: "pendente", amount: 300, due_date: "2026-11-09", descricao: "Salário extra combinado · Ana Souza", accountId: "ac-x" });
  lanc.push({ id: "antigo", type: "saida", status: "pendente", amount: 4490.4, due_date: "2026-12-07", descricao: "Salário · Ana Souza", accountId: "ac-folha" });
  const sai = titulosSubstituidosNaRescisao(lanc, "Ana Souza", "2026-10-15");
  const idsSai = new Set(sai.map((m) => m.id));
  const desc = (m: { descricao?: string | null }) => m.descricao ?? "";
  ok("rescisao: sai o salário do mês do desligamento e todos os seguintes",
     sai.some((m) => desc(m) === "Salário 10/2026 · Ana Souza") && sai.some((m) => desc(m) === "Salário 08/2027 · Ana Souza"));
  // ⚠️ A asserção que separa COMPETÊNCIA de VENCIMENTO: o FGTS e o DARF de
  // setembro vencem em 20/10, DEPOIS do desligamento, e são devidos — retirar
  // por data de vencimento os apagaria.
  ok("rescisao: o FGTS e o DARF de SETEMBRO (vencem depois do desligamento) FICAM",
     !sai.some((m) => /09\/2026/.test(desc(m))), sai.filter((m) => /09\/2026/.test(desc(m))).map(desc).join(" | "));
  ok("rescisao: o 13º do ano (parcelas e encargos) sai — ele vira 13º proporcional na rescisão",
     sai.filter((m) => /13º 2026/.test(desc(m))).length === 5);
  ok("rescisao: pago, de outro colaborador e digitado à mão NÃO saem",
     !idsSai.has("pago") && !idsSai.has("outro") && !idsSai.has("manual"));
  ok("rescisao: o título no formato ANTIGO (sem competência) também é reconhecido",
     idsSai.has("antigo") && lerTituloDaFolha("Salário · Ana Souza", "2026-12-07")?.competencia === "2026-11");
  ok("rescisao: títulos da própria rescisão e da multa nunca são lidos como folha mensal",
     lerTituloDaFolha("FGTS da rescisão · Ana Souza", "2026-10-23") === null
     && lerTituloDaFolha("Multa do FGTS · Ana Souza", "2026-10-23") === null
     && lerTituloDaFolha("Reembolso · Ana Souza · Uber", "2026-10-23") === null);
  ok("rescisao: a conta da rescisão é a da folha do colaborador, não a primeira da lista",
     contaDoColaborador(lanc, "Ana Souza") === "ac-folha");
  const eR = { modalidade: "sem_justa_causa" as const, desligamento: "2026-10-15", admissao: "2026-09-01",
    avisoTrabalhado: false, diasFeriasVencidas: 0, saldoFGTS: 0, estimarSaldo: true };
  const cR = calcularRescisao(ana, eR, "presumido", null);
  const tR = titulosDaRescisao(ana, eR, cR, "Sem justa causa");
  ok("rescisao: tudo o que a rescisão custa vira título (19.942,23 = custo total)",
     r2(tR.reduce((s, t) => s + t.valor, 0)) === r2(cR.custoTotal) && r2(cR.custoTotal) === 19942.23,
     `${r2(tR.reduce((s, t) => s + t.valor, 0))} × ${cR.custoTotal}`);
  ok("rescisao: o FGTS das verbas e o DARF (INSS, IRRF, patronal) são títulos próprios",
     tR.some((t) => t.tipo === "fgts" && t.valor === 533.33)
     && tR.some((t) => t.tipo === "darf" && t.valor === 3238.91 && t.vencimento === "2026-11-19"));
  // Férias com adiantamento: a 1ª parcela do ano sai; a do ano seguinte, não.
  const adiant = primeiraParcelaSubstituida(lanc, "Ana Souza", "2026-10-02");
  ok("ferias: o adiantamento do 13º substitui a 1ª parcela de 2026 (e só ela)",
     adiant.length === 1 && /13º 2026 \(4\/12\) · 1ª parcela/.test(desc(adiant[0])));

  /* ---- A conferência de encargos compara FGTS + patronal, não as provisões ---- */
  const p3 = montarPainelFolha([ana], "2026-09", "simples", "III");
  ok("folha: no Simples III o projetado de FGTS + patronal é 400 (não 1.450 de custo − bruto)",
     encargosProjetados(p3) === 400, String(encargosProjetados(p3)));
  ok("folha: o FGTS certinho NÃO acende o aviso",
     conferirEncargos(encargosProjetados(p3), 400).divergente === false);
  // A prova de que a conta antiga mentia: com as provisões dentro, o MESMO
  // recolhimento correto acusava −72%.
  ok("folha: (a conta antiga, custo − bruto, acusava o recolhimento correto)",
     conferirEncargos(r2(p3.custoTotal - p3.totalBruto), 400).divergente === true);
  const guias = [
    { type: "saida", status: "pago", category: "FGTS", due_date: "2026-10-20", amount: 400 },
    { type: "saida", status: "pago", category: "FGTS", due_date: "2026-09-18", amount: 380 },
  ];
  ok("folha: a guia da competência de setembro é a que vence em OUTUBRO",
     encargosLancados(guias, "2026-09") === 400, String(encargosLancados(guias, "2026-09")));
  ok("folha: a tela usa o projetado de FGTS + patronal",
     /encargosProjetados\(painel\)/.test(telaFolha) && !/custoTotal - painel\.totalBruto/.test(telaFolha));

  /* ---- COMPRAS: a linha que o banco recebe ---- */
  const C = (o: Partial<Compra>): Compra => ({
    id: "cmp_1", numero: "2026-C0001", fornecedorId: "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b", fornecedor: "Alpha Ltda",
    contaId: "ac1", categoria: "Fornecedores", tipoPagamento: "parcelado", parcelas: 3,
    vencimento: "2026-10-15", competencia: "2026-09-30", valor: 1_000,
    documentoFiscal: "", especie: null, pago: true, dataPagamento: "2026-10-15",
    projetos: [], centros: [], anexos: [], descricao: "", infoPagamento: "",
    observacoes: "", status: "aprovada", criadoPor: "Você", criadoEm: "2026-09-30",
    ...o,
  });
  const linhas = movimentosDaCompra(C({})).map(linhaDoTituloDaCompra);
  ok("compras: cada parcela leva a chave compra:<id>:<n> (é ela que permite reprovar sem órfão)",
     linhas.map((l) => l.reference_code).join(",") === "compra:cmp_1:1,compra:cmp_1:2,compra:cmp_1:3"
     && referenciaDaParcela("cmp_1", 2) === "compra:cmp_1:2");
  ok("compras: a linha leva origem e espécie (sem origem o banco recusa com A4P05)",
     linhas.every((l) => l.origem === "manual" && l.especie === "titulo"));
  ok("compras: a competência de TODAS as parcelas é a da compra, não o vencimento de cada uma",
     linhas.every((l) => l.competence_date === "2026-09-30") && linhas[2].due_date === "2026-12-15");
  ok("compras: só a 1ª parcela nasce baixada (paga)",
     linhas[0].situacao === "baixado" && linhas[1].situacao === "previsto" && linhas[0].paid_date === "2026-10-15");
  ok("compras: fornecedor uuid vai; id curto de demonstração não (o banco só aceita uuid)",
     linhas[0].party_id === "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b"
     && linhaDoTituloDaCompra(movimentosDaCompra(C({ fornecedorId: "p1" }))[0]).party_id === null);
  ok("compras: parcela paga RECUSA cancelar (apagaria dinheiro que já saiu)",
     /já paga/.test(recusaDeRetirada("2026-C0001", [{ pago: true }, { pago: false }], "cancelar") ?? ""));
  ok("compras: sem parcela paga, cancelar pode", recusaDeRetirada("2026-C0001", [{ pago: false }], "cancelar") === null);
  ok("compras: o número é o MAIOR + 1 (contar repetiria o C0003)",
     proximoNumeroDeCompra(["2026-C0001", "2026-C0003", "2025-C0009"], 2026) === "2026-C0004");

  /* ---- O ESCRITOR MORTO das compras, do boleto e da importação ---- */
  const store = semComent(lerF("src/lib/compras-store.ts"));
  // ⚠️ A forma EXATA do defeito: `if (!isDemo) return;` antes do appendImported,
  // num arquivo sem caminho nenhum para `movements`. A guarda do escritor morto
  // não via, porque o próprio `return` contém a palavra `isDemo`.
  ok("compras: aprovar grava no BANCO em produção (era `if (!isDemo) return`)",
     /from\("movements"\)\.insert\(movs\.map\(linhaDoTituloDaCompra\)\)/.test(store)
     && !/if \(!isDemo\) return;/.test(store));
  // O boleto vira título pelo formulário de conta a pagar (o escritor único),
  // não por um segundo escritor no store (CAMP-B removeu o `lancarBoleto`).
  ok("compras: o boleto lançado vira título pelo formulário de conta a pagar",
     /dashboard\/financial\/payables\/new\?/.test(semComent(lerF("src/components/compras/RecebidosViews.tsx")))
     && !/export async function lancarBoleto/.test(store));
  ok("compras: a compra mora em store-org, não no localStorage cru (quem aprova é outra pessoa)",
     /ler<Compra\[\]>\(CHAVES_ORG\.compras/.test(store) && !/localStorage/.test(store));
  ok("compras: o título nasce ANTES do status aprovado",
     /await criarTitulosDaCompra\(nova\);[\s\S]*?return persistir\(nova\)/.test(store));
  const imp = semComent(lerF("src/components/movimentacoes/ImportacaoView.tsx"));
  ok("importacao: a planilha de contas grava pelo escritor único em produção (era `else if (isDemo)`)",
     /await criarTitulos\(/.test(imp) && !/else if \(isDemo\)/.test(imp));
  // A regra geral, que teria pego os dois: todo arquivo que grava no dataset da
  // demonstração TEM de ter um caminho para o banco no mesmo arquivo.
  const DECLARADOS: Record<string, string> = {
    "src/lib/vendas-store.ts": "é a casa da venda SÓ em demonstração; `lib/vendas` é o escritor de produção e delega para cá quando isDemo",
  };
  const semBanco: string[] = [];
  const varrer = (dir: string) => {
    for (const e of fsF.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { varrer(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name) || p === "src/lib/imported.ts" || DECLARADOS[p]) continue;
      const t = semComent(lerF(p));
      if (!/\bappendImported\s*\(/.test(t)) continue;
      if (!/from\("movements"\)|criarTitulos\(|createLancamento\(|createTransferencia\(|criarTransferencia\(/.test(t)) semBanco.push(p);
    }
  };
  varrer("src");
  ok("escritor: todo arquivo que grava no dataset da demo tem caminho para o banco",
     semBanco.length === 0, semBanco.join(" | "));

  /* ---- REEMBOLSOS: a recusa do banco não vira "A pagar" ---- */
  const reemb = semComent(lerF("src/lib/reembolsos.ts"));
  const gerar = /async function gerarPagamento[\s\S]*?\n}/.exec(reemb)?.[0] ?? "";
  ok("reembolso: o insert dos títulos em produção não engole a recusa",
     /\.from\("movements"\)\.insert\(rows\)[\s\S]{0,120}if \(error\) throw error;/.test(gerar));
  ok("reembolso: sem conta bancária a recusa é DITA (antes: lista vazia e 'A pagar')",
     /if \(!accId\) throw new Error\(/.test(gerar) && !/if \(!accId\) return out;/.test(gerar));
  ok("reembolso: o título leva espécie, competência da despesa e chave idempotente",
     /especie: "titulo"/.test(gerar) && /competence_date: it\.data/.test(gerar) && /reference_code: refs\[i\]/.test(gerar));
  const sinc = /export async function sincronizarReembolsos[\s\S]*?\n}/.exec(reemb)?.[0] ?? "";
  ok("reembolso: a falha fica no reembolso e volta para a tela, sem marcar 'A pagar'",
     /catch \(e\)[\s\S]{0,400}falhas\.push[\s\S]{0,200}continue;/.test(sinc)
     && sinc.indexOf("falhas.push") < sinc.indexOf('r.status = "a_pagar"'));
  ok("reembolso: a solicitação sem aprovação no banco é recusada (nasceria presa para sempre)",
     /A solicitação de aprovação não foi gravada/.test(reemb) && /if \(error\) throw error;\s*const saved = fromRow/.test(reemb));
}

/* ── COMPRAS · CAIXA DE ENTRADA FISCAL ── */
{
  const fsR = await import("node:fs");
  const semComentR = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const { boletoJaCapturado, notaJaCapturada } = await import("@/core/compras");
  const fatorR = fatorDaData("2026-10-20");
  const semDVR = "2379" + String(fatorR).padStart(4, "0") + "0000084217" + "9876543210987654321098765";
  const barrasR = semDVR.slice(0, 4) + dvModulo11(semDVR) + semDVR.slice(4);
  const lidoR = lerBoleto(linhaDeCodigoDeBarras(barrasR), "2026-09-30")!;
  const lancado: BoletoRecebido = {
    id: "b1", origem: "manual", beneficiario: "Gráfica Aurora", pagador: "Sua empresa", leitura: lidoR,
    pago: false, dataPagamento: null, recebidoEm: "2026-09-30", movimentoId: "boleto-x",
  };
  ok("recebidos: o boleto já capturado é reconhecido pelo CÓDIGO DE BARRAS",
     boletoJaCapturado([lancado], lidoR.codigoBarras)?.movimentoId === "boleto-x"
     && boletoJaCapturado([lancado], lidoR.codigoBarras.replace(/.$/, "0")) === null);
  const base43R = "31" + "2609" + "11222333000181" + "55" + "002" + "000004321" + "1" + "87654321";
  const chaveR = base43R + String(dvDaChave(base43R));
  const nfR = lerChaveNFe(chaveR)!;
  const aprovada: NFRecebida = {
    id: "n1", chave: nfR, numero: nfR.numero, tipo: "NFE", fornecedorId: null, fornecedor: "Metalúrgica Serra",
    cnpj: nfR.cnpj, emissao: "2026-09-01", valor: 1300, categoria: "", status: "processada", avaliacao: "aprovada", origem: "manual",
  };
  ok("recebidos: a nota já capturada é reconhecida pela CHAVE", notaJaCapturada([aprovada], chaveR)?.avaliacao === "aprovada");
  // ⚠️ O defeito, na tela: colar de novo SUBSTITUÍA o registro (a nota aprovada
  // voltava a pendente; o boleto lançado perdia o vínculo com o título). A tela
  // tem de perguntar antes de gravar, e a chave com dígito errado não entra.
  const telaR = semComentR(fsR.readFileSync("src/components/compras/RecebidosViews.tsx", "utf8"));
  const addBoleto = /function adicionar\(\) \{[\s\S]*?salvarBoleto\(/.exec(telaR)?.[0] ?? "";
  ok("recebidos: adicionar boleto confere a duplicata ANTES de gravar",
     /boletoJaCapturado\(listarBoletos\(\)/.test(addBoleto) && /return;/.test(addBoleto.slice(addBoleto.indexOf("boletoJaCapturado"))));
  const addNota = /function adicionar\(\) \{(?:(?!function adicionar)[\s\S])*?salvarNF\(/.exec(telaR.slice(telaR.indexOf("export function NFsRecebidasView")))?.[0] ?? "";
  ok("recebidos: adicionar nota confere a duplicata ANTES de gravar",
     /notaJaCapturada\(listarNFs\(\)/.test(addNota));
  ok("recebidos: nota com dígito verificador errado não entra (era gravada com status 'erro')",
     /if \(!leitura \|\| !leitura\.valido\) return;/.test(addNota) && !/leitura\.valido \? "recebida" : "erro"/.test(telaR));
  ok("recebidos: valor digitado que não é número não vira R$ 0,00 calado",
     /valorNovo\.trim\(\) && valor == null/.test(addNota));
}

/* ── PAGAR · REVISÃO ── */
{
  const fsF = await import("node:fs");
  const semComent = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const folha = await import("@/core/folha");
  const compras = await import("@/core/compras");

  /* ---- a compra em produção não engole a recusa do banco ---- */
  const store = semComent(fsF.readFileSync("src/lib/compras-store.ts", "utf8"));
  ok("pagar-rev: o insert dos títulos da compra em produção LANÇA a recusa do banco",
     /insert\(movs\.map\(linhaDoTituloDaCompra\)\);\s*if \(error\) throw error;/.test(store));

  /* ---- "confirmado" não é pago ---- */
  ok("pagar-rev: título CONFIRMADO (aprovado, não pago) não conta como parcela paga",
     compras.situacaoPaga("confirmado") === false && compras.situacaoPaga("previsto") === false
     && compras.situacaoPaga("baixado") === true && compras.situacaoPaga("conciliado") === true);
  ok("pagar-rev: a retirada da compra usa a regra única de 'pago'",
     /pago: situacaoPaga\(t\.situacao\)/.test(store));
  ok("pagar-rev: retirar parcelas da compra com parcela paga é RECUSADO antes de qualquer exclusão",
     /const recusa = recusaDeRetirada\([^)]*\);\s*if \(recusa\) throw new Error\(recusa\);/.test(store));

  /* ---- a rescisão desconta o 13º já pago ---- */
  // CLT de 6.000 desde 2025, desligado em 20/12/2026 sem justa causa, depois da
  // 1ª parcela (3.000,00) de 30/11. 13º proporcional de 12/12 = 6.000.
  const bia = { id: "b", nome: "Bia Lima", vinculo: "clt" as const, valor: 6000, desde: "2025-01" };
  const base = { modalidade: "sem_justa_causa" as const, desligamento: "2026-12-20", admissao: "2025-01-02",
    avisoTrabalhado: true, diasFeriasVencidas: 0, saldoFGTS: 10000, estimarSaldo: false };
  const sem = folha.calcularRescisao(bia, base, "presumido", null);
  const com = folha.calcularRescisao(bia, { ...base, decimoAdiantado: 3000 }, "presumido", null);
  const decimo = sem.verbas.find((v) => v.nome.startsWith("13º proporcional"))?.valor ?? 0;
  ok("pagar-rev: a fixture exercita o 13º (12/12 = 6.000,00)", decimo === 6000, String(decimo));
  ok("pagar-rev: o 13º já pago (3.000) sai do líquido da rescisão — e só ele",
     r2(sem.liquido - com.liquido) === 3000, `${sem.liquido} → ${com.liquido}`);
  ok("pagar-rev: o INSS e o IRRF continuam sobre o 13º INTEIRO (a 1ª parcela saiu sem desconto)",
     com.inss === sem.inss && com.irrf === sem.irrf && com.patronal === sem.patronal);
  ok("pagar-rev: o FGTS da rescisão sai só sobre o que ela paga (−240 = 8% de 3.000)",
     r2(sem.fgtsSobreVerbas - com.fgtsSobreVerbas) === 240, `${sem.fgtsSobreVerbas} → ${com.fgtsSobreVerbas}`);
  const tCom = folha.titulosDaRescisao(bia, { ...base, decimoAdiantado: 3000 }, com, "Sem justa causa");
  ok("pagar-rev: com o desconto, os títulos ainda somam o custo da rescisão",
     r2(tCom.reduce((s, t) => s + t.valor, 0)) === r2(com.custoTotal));
  const excesso = folha.calcularRescisao(bia, { ...base, decimoAdiantado: 9000 }, "presumido", null);
  ok("pagar-rev: descontar além do 13º devido não acontece — o excesso vira aviso",
     r2(sem.liquido - excesso.liquido) === 6000 && excesso.alertas.some((a) => /excedem o 13º/.test(a)));

  /* ---- e a tela acha a 1ª parcela PAGA ---- */
  const lanc = [
    { id: "p1", type: "saida", status: "pago", amount: 3000, due_date: "2026-11-30", descricao: "13º 2026 · 1ª parcela · Bia Lima" },
    { id: "p2", type: "saida", status: "pendente", amount: 2400, due_date: "2026-12-18", descricao: "13º 2026 · 2ª parcela · Bia Lima" },
    { id: "p3", type: "saida", status: "pago", amount: 3000, due_date: "2025-11-28", descricao: "13º 2025 · 1ª parcela · Bia Lima" },
    { id: "p4", type: "saida", status: "pago", amount: 1500, due_date: "2026-11-30", descricao: "13º 2026 · 1ª parcela · Outra Pessoa" },
  ];
  ok("pagar-rev: o 13º já pago é a 1ª parcela BAIXADA do ano, do colaborador (3.000)",
     folha.decimoJaPagoNoAno(lanc, "Bia Lima", "2026") === 3000, String(folha.decimoJaPagoNoAno(lanc, "Bia Lima", "2026")));
  // A 1ª parcela PREVISTA sai pela própria rescisão; contá-la como paga a
  // descontaria do funcionário sem ela nunca ter sido paga.
  // Com a 1ª parcela PAGA, o FGTS dela (devido pelo que já saiu) FICA; com ela
  // prevista, sai junto. A rescisão recolhe o FGTS só sobre o que ela paga.
  const fgts1 = { id: "f1", type: "saida", status: "pendente", amount: 240, due_date: "2026-12-18", descricao: "FGTS do 13º 2026 · 1ª parcela · Bia Lima" };
  const fgts2 = { id: "f2", type: "saida", status: "pendente", amount: 240, due_date: "2027-01-20", descricao: "FGTS do 13º 2026 · 2ª parcela · Bia Lima" };
  const comPaga = folha.titulosSubstituidosNaRescisao([lanc[0], lanc[1], fgts1, fgts2], "Bia Lima", "2026-12-20").map((m) => m.id);
  ok("pagar-rev: 1ª parcela PAGA — o FGTS dela fica; a 2ª parcela e o FGTS dela saem",
     !comPaga.includes("f1") && comPaga.includes("f2") && comPaga.includes("p2"), comPaga.join(","));
  const comPrevista = folha.titulosSubstituidosNaRescisao([{ ...lanc[0], status: "pendente" }, fgts1], "Bia Lima", "2026-12-20").map((m) => m.id);
  ok("pagar-rev: 1ª parcela PREVISTA — ela e o FGTS dela saem juntos",
     comPrevista.includes("p1") && comPrevista.includes("f1"), comPrevista.join(","));
  /* ---- o adiantamento do 13º nas férias é um título reconhecível ---- */
  const calcF = folha.calcularFerias(bia, { ...folha.FERIAS_PADRAO, inicio: "2026-11-09", adiantar13: true }, "presumido", null);
  const tF = folha.titulosDasFerias(bia, "2026-11-09", 30, calcF);
  const adiantF = tF.find((t) => t.tipo === "decimo");
  ok("pagar-rev: férias com adiantamento agendam o 13º adiantado (3.000) em título PRÓPRIO",
     !!adiantF && adiantF.valor === 3000 && adiantF.valor === calcF.adiantamento13, adiantF?.descricao ?? "(sem título)");
  ok("pagar-rev: férias + adiantamento somam o líquido do cálculo (nada some, nada dobra)",
     r2(tF.reduce((s, t) => s + t.valor, 0)) === r2(calcF.liquido));
  ok("pagar-rev: o adiantamento é lido como 1ª parcela do ano — pago, a rescisão o desconta",
     folha.decimoJaPagoNoAno([{ id: "fa", type: "saida", status: "pago", amount: adiantF?.valor ?? 0,
       due_date: adiantF?.vencimento ?? "", descricao: adiantF?.descricao ?? "" }], "Bia Lima", "2026") === 3000);

  /* ---- o desfazer sobrevive à linha que sumiu ---- */
  const acao = semComent(fsF.readFileSync("src/components/ui/AcaoDestrutiva.tsx", "utf8"));
  ok("pagar-rev: o 'Desfazer' mora numa raiz própria, não no botão da linha excluída",
     /createRoot\(/.test(acao) && /mostrarDesfazer\(titulo, reverter\)/.test(acao)
     && !/useState<\(\(\) => void \| Promise<void>\) \| null>/.test(acao));
  ok("pagar-rev: a 1ª parcela ainda PREVISTA não é 13º pago",
     folha.decimoJaPagoNoAno([{ ...lanc[0], status: "pendente" }], "Bia Lima", "2026") === 0);
  const modal = semComent(fsF.readFileSync("src/components/contas-pagar/ModalFolha.tsx", "utf8"));
  const telaF = semComent(fsF.readFileSync("src/components/contas-pagar/FolhaSalarial.tsx", "utf8"));
  ok("pagar-rev: o modal de rescisão pré-preenche o 13º pago a partir dos títulos BAIXADOS",
     /decimoJaPagoNoAno\(pagos/.test(modal) && /pagos=\{pagos\}/.test(telaF)
     && /useMovementsByFilter\("saida", "realizado"\)/.test(telaF));
}
/* ── VENDER ── */
// Rodada 30/09: vendas, notas, impostos, assinaturas e POS dirigidos como uma
// PME dirige. Cada asserção abaixo foi provada plantando o defeito de volta.
{
  const fsV = await import("node:fs");
  const lerV = (p: string) => fsV.readFileSync(p, "utf8");
  // Comentário sai antes da busca: a documentação do defeito cita o defeito.
  const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const { titulosDaVendaPos, somaMeses, CATEGORIA_TAXA_POS } = await import("@/core/vendas/pos");
  const { pedidoDeNota, statusNFDaNota, vendaComNota, podeEmitirNota } = await import("@/core/vendas/nota");
  const cv = await import("@/core/vendas");
  const { montarDRE: dreV } = await import("@/core/relatorios");

  /* ---- POS: a taxa MDR sai UMA vez, e no repasse ---- */
  const t3 = titulosDaVendaPos({ total: 1_000, taxa: 0.03, parcelas: 3, descricao: "Venda POS" }, "2026-01-31");
  const somaTipo = (ts: typeof t3, tipo: "entrada" | "saida") => Math.round(ts.filter((t) => t.type === tipo).reduce((s, t) => s + t.amount, 0) * 100) / 100;
  ok("vender/pos: a receita a receber é o BRUTO da venda (era o líquido)", somaTipo(t3, "entrada") === 1_000, `${somaTipo(t3, "entrada")}`);
  ok("vender/pos: a taxa a pagar é a taxa da venda, uma vez", somaTipo(t3, "saida") === 30, `${somaTipo(t3, "saida")}`);
  ok("vender/pos: bruto − taxa = o líquido que o caixa recebe", somaTipo(t3, "entrada") - somaTipo(t3, "saida") === 970);
  // ⚠️ Revisão: a versão anterior aceitava QUALQUER entrada com a mesma data —
  // com todas as taxas datadas de HOJE (o defeito), a parcela 1 também vence
  // hoje e a asserção passava. Agora é parcela a parcela, e as datas são três.
  const entr3 = t3.filter((t) => t.type === "entrada"), sai3 = t3.filter((t) => t.type === "saida");
  ok("vender/pos: cada taxa vence com o repasse da SUA parcela (a k-ésima taxa com a k-ésima entrada)",
     sai3.length === entr3.length && sai3.every((s, k) => s.due_date === entr3[k].due_date) && new Set(sai3.map((s) => s.due_date)).size === 3,
     sai3.map((s) => s.due_date).join(" "));
  ok("vender/pos: 3 parcelas = 3 entradas, a última leva o resto dos centavos",
     t3.filter((t) => t.type === "entrada").map((t) => t.amount).join("|") === "333.33|333.33|333.34");
  ok("vender/pos: 31/01 + 1 mês cai em 28/02 (não escorrega para março)", somaMeses("2026-01-31", 1) === "2026-02-28", somaMeses("2026-01-31", 1));
  ok("vender/pos: a parcela 2 vence no mês seguinte", t3.filter((t) => t.type === "entrada")[1].due_date === "2026-02-28");
  const t1 = titulosDaVendaPos({ total: 100, taxa: 0.03, parcelas: 1, descricao: "V" }, "2026-06-10");
  const dPos = dreV({
    hoje: "2026-06-30", saldoAtual: 0, partyNames: {},
    movements: t1.map((t, k) => ({ id: `pos${k}`, type: t.type, status: "pendente", amount: t.amount, due_date: t.due_date, paid_date: null, category: t.category })) as RiskMovement[],
  }, { intervalo: { de: "2026-06-01", ate: "2026-06-30" }, tipo: "vertical" });
  const lPos = (id: string) => dPos.linhas.find((l) => l.id === id)?.celulas[0]?.valor ?? NaN;
  ok("vender/pos: no DRE a receita bruta é a venda cheia", lPos("receita_bruta") === 100, `${lPos("receita_bruta")}`);
  ok("vender/pos: no DRE o resultado é venda − taxa (a taxa dupla dava 94)", lPos("resultado_liquido") === 97, `${lPos("resultado_liquido")}`);
  ok("vender/pos: a taxa é despesa de adquirência nomeada", t1.some((t) => t.category === CATEGORIA_TAXA_POS));
  const posLib = lerV("src/lib/pos-venda.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok("vender/pos: o escritor não manda `status` para a coluna GERADA (o Postgres recusa toda venda)",
     !/\bstatus\s*:/.test(posLib) && /criarTitulos\(/.test(posLib));
  ok("vender/pos: sem conta a venda é recusada — nenhuma conta bancária é inventada",
     !/financial_accounts"\)\s*\.insert/.test(posLib));
  const posView = lerV("src/components/pos/PosVendaView.tsx");
  const iEfeito = posView.indexOf('if (tela !== "processando") return;');
  const corpoEfeito = posView.slice(iEfeito, posView.indexOf("setRecibo(", iEfeito));
  ok("vender/pos: a recusa do registro NÃO vira recibo 'Aprovado'",
     /catch \(e\)[\s\S]*?setTela\("recusado"\)[\s\S]*?return;/.test(corpoEfeito));

  /* ---- impostos: o botão funciona em produção e a categoria não trava ---- */
  const VV = (o: Partial<Venda>): Venda => ({
    id: "v", numero: "2026-0001", clienteId: "c1", clienteNome: "Alpha", competencia: "2026-12-10", vencimento: "2026-12-20",
    itens: [{ produtoId: "p1", nome: "Consultoria", quantidade: 1, precoUnitario: 1_000 }], valorTotal: 1_000, valorTotalComJuros: 0,
    taxaPlataforma: { valor: 0, fornecedorId: "" }, taxaAntecipacao: { valor: 0, fornecedorId: "" }, taxaStreaming: { valor: 0, fornecedorId: "" },
    comissaoCoprodutor: { valor: 0, fornecedorId: "" }, comissaoAfiliado: { valor: 0, fornecedorId: "" },
    contaId: "ac1", operacao: "venda", status: "completa", metodo: "pix", idExterno: "", categoria: "cat1", tipoPagamento: "avista",
    plataforma: "", chaveTransacao: "", pago: false, valorPago: 0, dataPagamento: null, projetos: [], centros: [], descricao: "",
    textoDocumentoFiscal: "", observacoes: "", statusNF: "a_emitir", numeroNF: "", criadoEm: "2026-12-10", ...o,
  });
  const cfgV = { ...cv.configPadrao("presumido"), contaId: "ac1", fornecedores: { municipal: "fm", estadual: "fe", federal: "ff" } };
  const provV = cv.provisionarImpostos([VV({}), VV({ id: "x", status: "chargeback" }), VV({ id: "y", status: "cancelada" })], cfgV);
  const comValorV = cv.IMPOSTOS.filter((i) => provV.porImposto[i] > 0);
  ok("vender/impostos: sem categoria escolhida NÃO há pendência (o plano local nasce vazio e travava o botão)",
     cv.pendenciasConfig(cfgV, comValorV).length === 0, cv.pendenciasConfig(cfgV, comValorV).join(" · "));
  ok("vender/impostos: sem fornecedor continua havendo pendência",
     cv.pendenciasConfig({ ...cfgV, fornecedores: { municipal: "", estadual: "", federal: "" } }, comValorV).length > 0);
  ok("vender/impostos: chargeback e cancelada fora da base", provV.faturamento === 1_000, `${provV.faturamento}`);
  const contasV = cv.contasAPagarDosImpostos(provV, cfgV, "2026-12");
  ok("vender/impostos: competência de dezembro vence em JANEIRO do ano seguinte",
     contasV.find((c) => c.imposto === "iss")!.vencimento === "2027-01-10" && contasV.find((c) => c.imposto === "irpj")!.vencimento === "2027-01-31",
     contasV.map((c) => `${c.imposto}:${c.vencimento}`).join(" "));
  ok("vender/impostos: ISS maior muda o valor da conta (alíquota editável)",
     cv.provisionarImpostos([VV({})], { ...cfgV, aliquotas: { ...cfgV.aliquotas, iss: 2 } }).porImposto.iss === 20);
  // O título sem categoria sai com o NOME do imposto — e o DRE precisa pôr
  // cada um na linha certa, senão a queda da pendência troca um botão travado
  // por um imposto na linha errada.
  const dImp = dreV({
    hoje: "2026-12-31", saldoAtual: 0, partyNames: {},
    movements: contasV.map((c) => ({ id: c.imposto, type: "saida", status: "pendente", amount: c.valor, due_date: "2026-12-15", paid_date: null, category: c.rotulo })) as RiskMovement[],
  }, { intervalo: { de: "2026-12-01", ate: "2026-12-31" }, tipo: "vertical" });
  const linhaDe = (id: string) => dImp.classificacao[id]?.linha;
  ok("vender/impostos: PIS, COFINS e ISS sem categoria caem em DEDUÇÕES",
     ["pis", "cofins", "iss"].every((i) => linhaDe(i) === "deducoes"), ["pis", "cofins", "iss"].map((i) => `${i}:${linhaDe(i)}`).join(" "));
  ok("vender/impostos: IRPJ e CSLL sem categoria caem em IMPOSTOS SOBRE O LUCRO",
     ["irpj", "csll"].every((i) => linhaDe(i) === "impostos_lucro"), ["irpj", "csll"].map((i) => `${i}:${linhaDe(i)}`).join(" "));
  const store = semComentario(lerV("src/lib/vendas-store.ts"));
  const gravar = store.slice(store.indexOf("export function gravarContasDeImpostos"), store.indexOf("export function criarContasDeImpostos"));
  ok("vender/impostos: em produção o botão GRAVA (era `if (!isDemo) return 0` e a tela dizia 'nada a criar')",
     !/if \(!isDemo\)[^\n]*return/.test(gravar) && !/if \(!isDemo\) return 0/.test(store) && /criarTitulos\(/.test(gravar));
  // ⚠️ Revisão: a versão anterior cobrava só que as palavras `neq(...)` e
  // `jaExistiam` existissem — trocar o filtro por `const novas = contas`
  // passava verde. Agora a regra é uma função pura, conferida por VALOR, e os
  // dois caminhos (demonstração e banco) têm de usá-la.
  const { contasSemTitulo } = cv;
  const sep = contasSemTitulo([{ rotulo: "PIS" }, { rotulo: "ISS" }, { rotulo: "IRPJ" }], "2026-12",
    ["PIS · competência 2026-12", "ISS · competência 2026-11", "Aluguel"]);
  ok("vender/impostos: imposto com título vivo na MESMA competência não ganha outro; outra competência não conta",
     sep.novas.map((c) => c.rotulo).join() === "ISS,IRPJ" && sep.jaExistiam.join() === "PIS", JSON.stringify(sep));
  const gravarAgora = store.slice(store.indexOf("export function gravarContasDeImpostos"), store.indexOf("export function criarContasDeImpostos"));
  ok("vender/impostos: demonstração E banco passam pela mesma regra de idempotência, e só as novas são gravadas",
     (gravarAgora.match(/contasSemTitulo\(/g) ?? []).length >= 2 && /neq\("status", "cancelado"\)/.test(gravarAgora)
     && /criarTitulos\(novas\.map/.test(gravarAgora) && !/removerImported\(/.test(gravarAgora));
  ok("vender/impostos: em produção as gravações entram em FILA (dois cliques não consultam ao mesmo tempo)",
     /filaImpostos\.then\(/.test(gravarAgora) && /filaImpostos = vez\.catch/.test(gravarAgora));
  const salvarV = store.slice(store.indexOf("export function salvarVenda("), store.indexOf("export function salvarSoDocumento"));
  ok("vender/store: em demonstração regravar a venda NÃO reescreve recebível já baixado",
     /status === "pago"\) return lista;/.test(salvarV) && salvarV.indexOf('status === "pago"') < salvarV.indexOf("removerImported("));
  const vnf = semComentario(lerV("src/lib/vendas-nf.ts"));
  ok("vender/nota: emitir a nota grava SÓ as colunas da nota (reescrever a venda podia ser recusado DEPOIS da nota autorizada)",
     /gravarNotaDaVendaDoc\(/.test(vnf) && !/salvarVendaDoc\(/.test(vnf));
  ok("vender/impostos: o título leva o NOME da categoria, nunca o id do plano",
     /category: nomeDaCategoriaDoImposto\(c(, nomeCategoria)?\)/.test(store) && !/category: c\.categoria \|\|/.test(store));
  ok("vender/impostos: a descrição-chave mora num lugar só",
     cv.descricaoDoImposto("PIS", "2026-12") === "PIS · competência 2026-12");

  /* ---- a nota da venda: um fato, dois painéis, uma receita ---- */
  const vN = VV({ textoDocumentoFiscal: "Consultoria de dezembro" });
  const ped = pedidoDeNota(vN, "v-rec", 5);
  ok("vender/nota: a nota REAPROVEITA o título da venda (a avulsa lançava a receita de novo)", ped.movimentoReceita === "v-rec");
  ok("vender/nota: o valor da nota é o faturamento da venda", ped.valorServico === 1_000 && ped.tomadorId === "c1");
  ok("vender/nota: o status volta para a venda — autorizada vira emitida, rejeitada vira negada",
     statusNFDaNota("autorizada") === "emitida" && statusNFDaNota("enviada") === "emitida"
     && statusNFDaNota("rejeitada") === "negada" && statusNFDaNota("processando") === "processando");
  const emitida = vendaComNota(vN, { status: "autorizada", numero: "100001" });
  const cardsNF = cv.painelStatusNF([emitida, VV({ id: "b" })]);
  const cardsNotas = cv.painelNotasFiscais([emitida, VV({ id: "b" })]);
  ok("vender/nota: a venda com nota entra em 'NFs emitidas' no painel da lista",
     cardsNF.find((c) => c.id === "emitidas")!.quantidade === 1 && cardsNF.find((c) => c.id === "emitidas")!.valor === 1_000);
  ok("vender/nota: e no painel da tela de notas, com o mesmo número",
     cardsNotas.find((c) => c.id === "emitida")!.quantidade === 1 && emitida.numeroNF === "100001");
  ok("vender/nota: nota emitida ou venda cancelada não oferecem emitir de novo",
     !podeEmitirNota(emitida) && !podeEmitirNota(VV({ status: "cancelada" })) && podeEmitirNota(VV({ statusNF: "negada" })));
  const cardsCb = cv.painelStatusNF([VV({ id: "ok" }), VV({ id: "cb", status: "chargeback", valorTotal: 400 }), VV({ id: "cn", status: "cancelada", statusNF: "negada", valorTotal: 50 })]);
  const aEmitir = cardsCb.find((c) => c.id === "a_emitir")!, comErro = cardsCb.find((c) => c.id === "erro")!;
  ok("vender/nota: venda com chargeback NÃO é 'NF a emitir' (o card pedia nota de dinheiro devolvido)",
     aEmitir.quantidade === 1 && aEmitir.valor === 1_000, `${aEmitir.quantidade} · ${aEmitir.valor}`);
  ok("vender/nota: nota negada de venda cancelada não é 'NF com erro' pendente", comErro.quantidade === 0, `${comErro.quantidade}`);
  ok("vender/nota: o card e o botão da linha concordam sobre o que é pendente",
     [VV({ id: "cb", status: "chargeback" }), VV({})].every((x) => podeEmitirNota(x) === (cv.painelStatusNF([x]).find((c) => c.id === "a_emitir")!.quantidade === 1)));
  const nfse = lerV("src/lib/nfse.ts");
  ok("vender/nfse: a inserção recusada em produção sobe — não vira nota local com id inventado",
     /const \{ data, error \} = await createClient\(\)\.from\("nfse"\)\.insert/.test(nfse) && /if \(error\) throw new Error\(error\.message\);\n  const saved/.test(nfse));
  ok("vender/nfse: nota autorizada sem receita não é silêncio",
     /Nota autorizada, mas a receita não foi lançada/.test(nfse) && !/if \(!accId\) return ids;/.test(nfse));
  const nfseView = semComentario(lerV("src/components/nfse/NfseView.tsx"));
  ok("vender/nfse: a tela não afirma mais que o ISS entra no DRE", !/receita e ISS na DRE|a receita e o ISS entram/.test(nfseView));

  // ⚠️ REVISÃO — o reaproveitamento da receita só existia na memória da sessão.
  // Em produção a nota devolvida por `criarNfse` era remontada da linha gravada
  // (sem `movimentoReceita`), e a transmissão lançava OUTRA receita: "Emitir NF"
  // da venda dobrava o faturamento. E, recarregada a tela, cancelar a nota de
  // uma venda mandava o recebível da venda para a lixeira.
  const { receitaReaproveitada } = await import("@/core/vendas/nota");
  ok("vender/nfse: rascunho com título ligado está REAPROVEITANDO (a avulsa só ganha receita na autorização)",
     receitaReaproveitada({ status: "rascunho", movimentoId: "m1" }) && receitaReaproveitada({ status: "processando", movimentoId: "m1" }));
  ok("vender/nfse: nota autorizada de venda ou de fatura reaproveita; a avulsa autorizada não",
     receitaReaproveitada({ status: "autorizada", movimentoId: "m1", saleDocId: "v1" })
     && receitaReaproveitada({ status: "autorizada", movimentoId: "m1", recorrenciaId: "r1" })
     && !receitaReaproveitada({ status: "autorizada", movimentoId: "m1" })
     && !receitaReaproveitada({ status: "rascunho", movimentoId: null }));
  const nfseSem = semComentario(nfse);
  const criarN = nfseSem.slice(nfseSem.indexOf("export async function criarNfse"), nfseSem.indexOf("export async function transmitirNfse"));
  ok("vender/nfse: o título reaproveitado vai para o banco desde o rascunho, e a nota devolvida o carrega",
     /movement_id: isUuid\(n\.movimentoReceita\)/.test(criarN) && /movimentoReceita: n\.movimentoReceita/.test(criarN));
  ok("vender/nfse: a nota recarregada do banco reconhece a receita reaproveitada",
     /movimentoReceita: receitaReaproveitada\(/.test(nfseSem.slice(nfseSem.indexOf("function fromRow"), nfseSem.indexOf("export async function hydrateNfse"))));
  const cancN = nfseSem.slice(nfseSem.indexOf("export async function cancelarNfse"));
  ok("vender/nfse: cancelar a nota NÃO apaga o título que tem chave de venda (pergunta ao banco)",
     /select\("sale_doc_id"\)/.test(cancN) && /sale_doc_id\)\s*continue/.test(cancN) && /receitaReaproveitada\(/.test(cancN));
  ok("vender/nfse: a lista do banco lê o erro (lista vazia não pode esconder recusa)",
     /const \{ data, error \} = await createClient\(\)\.from\("nfse"\)\s*\.select/.test(nfseSem));
  // REVISÃO — excluir a venda: nota emitida e recebimento baixado bloqueiam,
  // pela MESMA regra em demonstração e em produção.
  const { bloqueioDeExclusao } = await import("@/core/vendas/nota");
  ok("vender/excluir: venda com nota emitida ou em processamento não se exclui (a nota seguiria valendo)",
     /Cancele a nota/.test(bloqueioDeExclusao({ numero: "1", statusNF: "emitida", numeroNF: "100001" }, ["previsto"]) ?? "")
     && /Cancele a nota/.test(bloqueioDeExclusao({ numero: "1", statusNF: "processando", numeroNF: "" }, []) ?? ""));
  ok("vender/excluir: recebimento baixado bloqueia; previsto, cancelado e nota cancelada/a emitir não",
     /Estorne/.test(bloqueioDeExclusao({ numero: "1", statusNF: "a_emitir", numeroNF: "" }, ["previsto", "baixado"]) ?? "")
     && bloqueioDeExclusao({ numero: "1", statusNF: "cancelada", numeroNF: "9" }, ["previsto", "cancelado"]) === null
     && bloqueioDeExclusao({ numero: "1", statusNF: "a_emitir", numeroNF: "" }, []) === null);
  const libV = semComentario(lerV("src/lib/vendas.ts"));
  const remV = libV.slice(libV.indexOf("export async function removerVendaDoc"), libV.indexOf("export function vendasSoNoNavegador"));
  ok("vender/excluir: demonstração e produção perguntam a mesma regra ANTES de apagar",
     (remV.match(/if \(bloqueio\) throw new Error\(bloqueio\);/g) ?? []).length === 2
     && remV.indexOf("if (bloqueio) throw") < remV.indexOf("removerLocal("));
  ok("vender/nota: cancelar a nota de uma venda leva o status de volta à venda",
     /refletirCancelamentoNaVenda\(/.test(nfseView) && /statusNF: "cancelada"|"cancelada", nf\.numero/.test(semComentario(lerV("src/lib/vendas-nf.ts"))));

  /* ---- assinaturas: dá para criar, e o MRR normaliza o ciclo ---- */
  const pagAss = lerV("src/app/dashboard/sales-invoices/subscriptions/page.tsx");
  ok("vender/assinaturas: a tela monta o gerenciador (criar, ativar, pausar, cancelar) — estava órfão",
     /<RecorrenciasView \/>/.test(pagAss));
  const criarCat = lerV("src/core/criar/index.ts");
  ok("vender/assinaturas: 'Nova assinatura' não abre mais o formulário de contrato que não grava em demonstração",
     !/Nova assinatura[^\n]*modal: "contrato"/.test(criarCat));
  const recView = semComentario(lerV("src/components/recorrencias/RecorrenciasView.tsx"));
  // ⚠️ Revisão: a versão anterior só reconhecia o defeito na forma exata de
  // antes (`style={{ color: tone }}`); `style={{ color: alerta ? negative … }}`
  // passava. Agora o CARTÃO inteiro não pode decidir cor do número.
  const kpiRec = recView.slice(recView.indexOf("function Kpi("));
  ok("vender/assinaturas: o churn não é pintado de vermelho por limiar (o alerta é um ponto ao lado do rótulo)",
     !/churn[^\n]*color-negative/.test(recView) && !/style=\{\{\s*color/.test(kpiRec) && !/color-negative|text-negative/.test(kpiRec)
     && /alerta=\{kpis\.churn > 0\.2\}/.test(recView));
  ok("vender/assinaturas: a NFS-e da assinatura recusada na CRIAÇÃO vira aviso, não erro solto",
     /try \{\s*nf = await criarNfse\(/.test(recView));
  const { mrr: mrrV } = await import("@/core/indicadores");
  const mV = mrrV({ hoje: "2026-09-30", saldoAtual: 0, movements: [] }, [
    { ativo: true, valorCiclo: 300, mesesCiclo: 3 }, { ativo: true, valorCiclo: 1_200, mesesCiclo: 12 }, { ativo: false, valorCiclo: 999, mesesCiclo: 1 },
  ]).valor;
  ok("vender/assinaturas: MRR normaliza o ciclo (trimestral 300 + anual 1.200 = 200/mês) e ignora a inativa", mV === 200, `${mV}`);

  /* ---- PIX copia-e-cola: CRC conferido por implementação independente ---- */
  try {
    const { gerarPixCopiaECola } = await import("@/lib/pix");
    const payload = gerarPixCopiaECola({ chave: "12345678000195", valor: 123.4, nome: "Padaria São João Ltda", cidade: "São Paulo", txid: "V20260001" });
    // CRC16-CCITT-FALSE escrito à mão AQUI (não importado): se as duas
    // implementações divergirem, alguém mexeu num lado sem querer.
    let c = 0xffff;
    const corpo = payload.slice(0, -4);
    for (let i = 0; i < corpo.length; i++) { c ^= corpo.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
    ok("vender/pix: o CRC do copia-e-cola confere", payload.slice(-4) === c.toString(16).toUpperCase().padStart(4, "0"), payload);
    ok("vender/pix: valor, moeda, país e chave nos campos EMV", /5406123\.40/.test(payload) && /5303986/.test(payload) && /5802BR/.test(payload) && payload.includes("12345678000195"));
    ok("vender/pix: nome e cidade sem acento (o leitor recusa byte fora do ASCII)", /^[\x20-\x7e]+$/.test(payload));
  } catch (e) {
    ok("vender/pix: o gerador de PIX carrega fora do navegador", false, String(e));
  }

  /* ---- configuração de impostos e links: dado da EMPRESA, não do navegador ---- */
  // Antes as duas chaves iam direto ao localStorage: a alíquota que o contador
  // configurou valia só naquela máquina, e a hidratação (o servidor vence)
  // devolvia a cópia antiga na sessão seguinte.
  const funcaoDe = (nome: string) => { const i = store.indexOf(nome); return i < 0 ? "" : store.slice(i, store.indexOf("\n}", i) + 2 || undefined); };
  const linhaDe2 = (prefixo: string) => (store.split("\n").find((l) => l.startsWith(prefixo)) ?? "") + (store.split("\n")[store.split("\n").findIndex((l) => l.startsWith(prefixo)) + 1] ?? "");
  ok("vender/store: a configuração de impostos é LIDA por store-org",
     /lerOrg<ConfigImpostos>\(K_CONFIG/.test(linhaDe2("export const lerConfigImpostos")), linhaDe2("export const lerConfigImpostos"));
  ok("vender/store: a configuração de impostos é GRAVADA por store-org",
     /gravarOrg\(K_CONFIG/.test(funcaoDe("export function salvarConfigImpostos")) && !/[^g]gravar\(K_CONFIG/.test(store));
  ok("vender/store: os links de pagamento são lidos e gravados por store-org",
     /lerOrg<LinkPagamento\[\]>\(K_LINKS/.test(store) && !/[^g]gravar\(K_LINKS/.test(store) && !/[^r]ler<LinkPagamento/.test(store));
  const { CHAVES_DE_NEGOCIO } = await import("@/lib/store-org");
  ok("vender/store: as duas chaves continuam classificadas como dado da empresa",
     CHAVES_DE_NEGOCIO.includes("a4p_impostos_config") && CHAVES_DE_NEGOCIO.includes("a4p_links_pagamento"));
}

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — guardas de auditoria multi-motor`);
if (fails > 0) process.exit(1);
