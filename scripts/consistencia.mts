/**
 * consistencia — A MATRIZ DE CONSISTÊNCIA CRUZADA.
 *
 *   npm run consistencia   (também roda dentro de npm test e no CI)
 *
 * Esta é a entrega que impede os defeitos de voltarem. As outras guardas
 * verificam se um motor está certo sozinho; esta verifica se DOIS CAMINHOS
 * DIFERENTES chegam ao MESMO número.
 *
 * A regra que ela codifica é a da ONDA 1: **um indicador, uma função**. Cada
 * asserção abaixo pega um número que aparece em mais de um lugar do sistema —
 * a Home, o Razão, o DRE, o painel, o motor de risco — e exige igualdade contra
 * `core/indicadores`, a camada canônica.
 *
 * Enquanto isto não existia, a mesma pergunta tinha resposta diferente por
 * tela, e ninguém descobria até um cliente conferir.
 *
 * Determinístico: um dataset fixo, sem relógio e sem rede.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import {
  saldo, saldoInicial, entradas, saidas, resultado, burn, runway, runwayMeses,
  geracaoCaixaMensal, mrr, arr, inadimplencia, inadimplenciaTaxa, receitaTributavel,
  painelIndicadores, reconciliarSaldo, foraDaBaseTributavel, pontePosicaoFluxo,
  janela, janelaMes, janelaUltimosDias, janelaHoje, janelaDoMesDe, janelaAnterior,
  diasDe, dentro, contemHoje, saldoEm, saldoAbertura, assinado, magnitude,
  liquidado, dataDe, INDICADORES_VERSION,
} from "@/core/indicadores";
import { calcularBurnRate } from "@/core/risk-engine/burn.engine";
import { calcularRunway } from "@/core/risk-engine/liquidez.engine";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarQuantitativo } from "@/core/quant";
import { dreGerencial, movimentosNoPeriodo } from "@/core/dre/engine";
import { dailyCashflowRange, dailyCashflow, summarizeAccounts } from "@/lib/aggregations";
import { painelAssinaturas } from "@/core/paineis";
import {
  prepararIngestao, linhasAGravar, planejarLimpeza, chaveIdempotencia,
  CATEGORIAS_TODAS, type LinhaBruta, type LinhaExistente,
} from "@/core/ingestao";
import { montarInvestorUpdate } from "@/core/investor";
import { exigePro, podeAbrir, PLANO_SIMPLES, PLANO_ABERTO } from "@/core/planos";
import { TODOS_OS_DESVIOS, destinoDe } from "@/core/rotas/aliases";
import {
  FUSOES, PRONTAS, ROTAS_A_APOSENTAR, ITENS_PENDENTES,
  prontaParaAposentar, pendencias,
} from "@/core/rotas/consolidacao";
import {
  INVENTARIO, CANONICAS, APOSENTANDO, nomesDuplicados,
} from "@/core/rotas/inventario";
import { sanearContraparte, melhorNome, deduplicar } from "@/core/ingestao/contraparte";
import { ACOES_CADASTROS, ACOES_MOVIMENTACOES, ACAO_NOVA_EMPRESA } from "@/core/criar";
import { tituloDaAba, MARCA } from "@/core/marca";
import { SECTIONS, CONFIG } from "@/components/dashboard/nav-data";
import { CHAVES_DE_NEGOCIO, PREFERENCIAS_LOCAIS, PRECISAM_DE_TABELA_PROPRIA } from "@/lib/store-org";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { balancete } from "@/lib/ledger";
import { CAIXA, lancamentosDeMovimentos, nomeConta, tipoConta } from "@/core/ledger/chart";
import { saldoPorNatureza } from "@/core/ledger";
import type { Movement } from "@/lib/types";


/**
 * Varre `src/` atrás de chaves `a4p_*` literais. É como a guarda descobre uma
 * chave nova que ninguém classificou — sem isso, a lista envelhece calada.
 */
function chavesUsadasNoCodigo(): string[] {
  const achadas = new Set<string>();
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      const st = statSync(caminho);
      if (st.isDirectory()) { varrer(caminho); continue; }
      if (!/\.(ts|tsx)$/.test(nome)) continue;
      const txt = readFileSync(caminho, "utf8");
      for (const m of txt.matchAll(/"(a4p_[a-z0-9_]+)"/g)) achadas.add(m[1]);
    }
  };
  varrer("src");
  // Prefixos de chave dinâmica (ex.: `a4p_live_<org>`) não são chaves.
  return Array.from(achadas).filter((c) => !c.endsWith("_")).sort();
}



/**
 * As rotas que o Next REALMENTE publica: todo diretório com `page.tsx` sob
 * `src/app`. É a lista contra a qual o inventário é conferido — declarar é
 * fácil, o difícil é declarar tudo, e só a varredura sabe o que existe.
 */
function rotasPublicadas(): string[] {
  const out: string[] = [];
  const varrer = (dir: string) => {
    let itens: string[];
    try { itens = readdirSync(dir); } catch { return; }
    if (itens.includes("page.tsx")) {
      out.push(dir.replace(/^src\/app/, "").replace(/^$/, "/") || "/");
    }
    for (const nome of itens) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) varrer(caminho);
    }
  };
  varrer("src/app");
  return out.sort();
}

let fails = 0;
const ok = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`✗ FAIL ${n} ${x}`); } };
/** Igualdade em CENTAVOS inteiros — float não fecha em 1e-9 e não deve fingir. */
const cent = (n: number) => Math.round(n * 100);
const eq = (n: string, a: number, b: number, x = "") =>
  ok(n, cent(a) === cent(b), x || `${a.toFixed(2)} ≠ ${b.toFixed(2)} (Δ ${(a - b).toFixed(2)})`);

/* ========================================================================== */
/* Dataset determinístico — todas as armadilhas de uma vez.                    */
/* ========================================================================== */

const HOJE = "2026-08-15";
const SALDO = 42_000;

const mv = (
  id: string, type: "entrada" | "saida", status: "pago" | "pendente" | "cancelado",
  amount: number, due: string, paid?: string | null, category = "Geral", party = "A",
): RiskMovement => ({ id, type, status, amount, due_date: due, paid_date: paid ?? null, category, party_id: party });

const DATASET: RiskMovement[] = [
  // — liquidados dentro do mês corrente —
  mv("e1", "entrada", "pago", 12_000, "2026-08-03", "2026-08-03", "Vendas", "A"),
  mv("e2", "entrada", "pago", 8_500, "2026-08-10", "2026-08-11", "Serviços", "B"),
  mv("s1", "saida", "pago", 4_200, "2026-08-05", "2026-08-05", "Folha", "F"),
  mv("s2", "saida", "pago", 1_800, "2026-08-12", "2026-08-12", "Aluguel", "G"),
  // — ARMADILHA 1: pago com paid_date FORA do mês (competência ≠ caixa) —
  mv("e3", "entrada", "pago", 5_000, "2026-07-28", "2026-08-02", "Vendas", "A"),
  // — ARMADILHA 2: pendente COM paid_date preenchido. Três regras diferentes
  //   do sistema discordavam exatamente aqui. Não é caixa: não foi liquidado. —
  mv("x1", "entrada", "pendente", 9_900, "2026-08-20", "2026-08-20", "Vendas", "A"),
  // — ARMADILHA 3: pendente vencido (inadimplência) —
  mv("v1", "entrada", "pendente", 3_300, "2026-07-10", null, "Vendas", "C"),
  mv("v2", "entrada", "pendente", 1_100, "2026-08-14", null, "Vendas", "C"),
  // — ARMADILHA 4: vence HOJE — não está vencido —
  mv("h1", "entrada", "pendente", 7_000, "2026-08-15", null, "Vendas", "D"),
  // — ARMADILHA 5: cancelado com valor alto — não conta em lugar nenhum —
  mv("c1", "entrada", "cancelado", 50_000, "2026-08-08", "2026-08-08", "Vendas", "A"),
  // — ARMADILHA 6: entradas que NÃO são faturamento —
  mv("t1", "entrada", "pago", 20_000, "2026-08-06", "2026-08-06", "Transferência entre contas", "A"),
  mv("t2", "entrada", "pago", 900, "2026-08-07", "2026-08-07", "Rendimento de aplicação", "A"),
  mv("t3", "entrada", "pago", 15_000, "2026-08-09", "2026-08-09", "Empréstimo bancário", "A"),
  // — histórico para o ritmo de 90 dias —
  mv("h2", "entrada", "pago", 11_000, "2026-06-05", "2026-06-05", "Vendas", "A"),
  mv("h3", "saida", "pago", 14_500, "2026-06-20", "2026-06-20", "Folha", "F"),
  mv("h4", "entrada", "pago", 9_000, "2026-07-05", "2026-07-05", "Vendas", "B"),
  mv("h5", "saida", "pago", 16_000, "2026-07-18", "2026-07-18", "Folha", "F"),
  // — pagáveis vencidos (o outro lado) —
  mv("p1", "saida", "pendente", 2_400, "2026-08-01", null, "Fornecedores", "F"),
];

const INPUT: RiskInput = {
  hoje: HOJE, saldoAtual: SALDO, movements: DATASET,
  partyNames: { A: "Alpha", B: "Beta", C: "Gama", D: "Delta", F: "Forn", G: "Loc" },
} as RiskInput;

const AGOSTO = janelaMes(2026, 7);

/* ========================================================================== */
/* LINHA 1 — SINAL: `amount` é magnitude, direção vem de `type`.               */
/* ========================================================================== */
{
  eq("sinal: entrada assina positivo", assinado(mv("z", "entrada", "pago", 100, HOJE)), 100);
  eq("sinal: saída assina negativo", assinado(mv("z", "saida", "pago", 100, HOJE)), -100);
  // Um `amount` que chega negativo por engano NÃO pode virar receita numa saída.
  eq("sinal: saída com amount negativo continua saída", assinado(mv("z", "saida", "pago", -100, HOJE)), -100);
  eq("sinal: magnitude nunca é negativa", magnitude(mv("z", "saida", "pago", -100, HOJE)), 100);

  // ⚠️ O SALDO NUNCA É EXIBIDO EM MÓDULO. Este é o guard do bug da Home: o
  // herói renderizava `Math.abs(saldo)`, então um caixa de −31 mil aparecia
  // como +31 mil — a informação mais importante da tela, invertida.
  const negativo: RiskInput = { ...INPUT, saldoAtual: -31_000.16 };
  ok("sinal: saldo negativo permanece negativo", saldo(negativo).valor < 0,
     `saldo devolvido = ${saldo(negativo).valor}`);
  eq("sinal: saldo negativo mantém o valor exato", saldo(negativo).valor, -31_000.16);
}

/* ========================================================================== */
/* LINHA 2 — O QUE CONTA: uma definição de liquidado, não três.                */
/* ========================================================================== */
{
  const pendComPaid = DATASET.find((m) => m.id === "x1")!;
  ok("liquidado: pendente com paid_date NÃO é liquidado", !liquidado(pendComPaid));
  ok("liquidado: pendente com paid_date não tem data de caixa", dataDe(pendComPaid, "caixa") === null);
  ok("liquidado: pendente com paid_date TEM data de competência",
     dataDe(pendComPaid, "competencia") === "2026-08-20");
  ok("liquidado: cancelado não tem data em regime nenhum",
     dataDe(DATASET.find((m) => m.id === "c1")!, "caixa") === null &&
     dataDe(DATASET.find((m) => m.id === "c1")!, "competencia") === null);

  // O pendente de 9.900 fica FORA do caixa e DENTRO da competência de agosto.
  const caixaAgo = entradas(INPUT, AGOSTO, "caixa").valor;
  const compAgo = entradas(INPUT, AGOSTO, "competencia").valor;
  ok("regime: caixa ≠ competência quando há pendente no mês", caixaAgo !== compAgo);
  eq("regime: a diferença é exatamente o pendente do mês", compAgo - caixaAgo,
     9_900 + 1_100 + 7_000 - 5_000);
}

/* ========================================================================== */
/* LINHA 3 — SALDO: uma regra, e ela fecha com o extrato.                      */
/* ========================================================================== */
{
  eq("saldo: hoje == saldoAtual das contas", saldo(INPUT, janelaHoje(HOJE)).valor, SALDO);
  eq("saldo: saldoEm(hoje) == saldoAtual", saldoEm(INPUT, HOJE), SALDO);

  // Reconstruir o passado e voltar ao presente tem de fechar: o saldo de
  // abertura do mês mais os líquidos do mês devolve o saldo de hoje.
  const abertura = saldoAbertura(INPUT, AGOSTO.de);
  const liquidosAteHoje = DATASET
    .filter((m) => liquidado(m) && (dataDe(m, "caixa") ?? "") >= AGOSTO.de && (dataDe(m, "caixa") ?? "") <= HOJE)
    .reduce((s, m) => s + assinado(m), 0);
  eq("saldo: abertura do mês + líquidos até hoje == saldo de hoje", abertura + liquidosAteHoje, SALDO);

  // O saldo futuro incorpora os previstos — e SÓ os previstos.
  const fim = saldoEm(INPUT, "2026-08-31");
  const previstosAteFim = DATASET
    .filter((m) => m.status === "pendente" && m.due_date > HOJE && m.due_date <= "2026-08-31")
    .reduce((s, m) => s + assinado(m), 0);
  eq("saldo: futuro == hoje + previstos da janela", fim, SALDO + previstosAteFim);

  // `summarizeAccounts` (o widget de contas) tem de dar o mesmo total.
  const contas = [{ id: "a", name: "Conta", balance: SALDO, currency: "BRL" }] as Parameters<typeof summarizeAccounts>[0];
  eq("saldo: widget de contas == indicador canônico",
     summarizeAccounts(contas, []).total, saldo(INPUT, janelaHoje(HOJE)).valor);
}

/* ========================================================================== */
/* LINHA 4 — ENTRADAS/SAÍDAS/RESULTADO: a mesma base nas três.                 */
/* ========================================================================== */
{
  const e = entradas(INPUT, AGOSTO).valor;
  const s = saidas(INPUT, AGOSTO).valor;
  const r = resultado(INPUT, AGOSTO).valor;
  eq("fluxo: resultado == entradas − saídas", r, e - s);

  // Valor fechado, conferível à mão (agosto, caixa): e1 12.000 + e2 8.500 +
  // e3 5.000 (pago em 02/08) + t1 20.000 + t2 900 + t3 15.000 = 61.400.
  eq("fluxo: entradas de agosto (valor fechado)", e, 61_400);
  // s1 4.200 + s2 1.800 = 6.000.
  eq("fluxo: saídas de agosto (valor fechado)", s, 6_000);
  eq("fluxo: resultado de agosto (valor fechado)", r, 55_400);

  // O cancelado de 50 mil não pode aparecer em nenhuma das três: remover a
  // linha cancelada do dataset não pode mudar número nenhum.
  const semCancelado: RiskInput = { ...INPUT, movements: DATASET.filter((m) => m.status !== "cancelado") };
  eq("fluxo: cancelado não altera as entradas", entradas(semCancelado, AGOSTO).valor, e);
  eq("fluxo: cancelado não altera o resultado", resultado(semCancelado, AGOSTO).valor, r);

  // ⚠️ CRUZAMENTO: o gráfico de fluxo diário e o total do período têm de somar
  // o mesmo. Eram regras diferentes — `dailyCashflowRange` aceitava qualquer
  // linha com `paid_date`, inclusive pendente.
  const pontos = dailyCashflowRange(DATASET as unknown as Movement[], AGOSTO.de, AGOSTO.ate, 0);
  const somaEnt = pontos.reduce((acc, p) => acc + p.inflow, 0);
  const somaSai = pontos.reduce((acc, p) => acc + Math.abs(p.outflow), 0);
  eq("cruzado: gráfico diário == entradas do período", somaEnt, e);
  eq("cruzado: gráfico diário == saídas do período", somaSai, s);

  // E a linha de saldo do gráfico tem de TERMINAR no saldo real.
  // A janela vai até HOJE de propósito: `dailyCashflowRange` desenha o
  // REALIZADO, e realizado não existe depois de hoje. Levá-la até o fim do mês
  // e cobrar o saldo projetado misturaria as duas leituras — que é como um
  // gráfico "realizado" acabava exibindo dinheiro que ainda não entrou.
  const comAbertura = dailyCashflowRange(
    DATASET as unknown as Movement[], AGOSTO.de, HOJE, saldoAbertura(INPUT, AGOSTO.de),
  );
  eq("cruzado: linha de saldo realizado fecha no saldo de hoje",
     comAbertura[comAbertura.length - 1].balance, saldoEm(INPUT, HOJE));

  // `dailyCashflow` (janela móvel) e `dailyCashflowRange` (janela fixa) têm de
  // usar a MESMA regra sobre o mesmo intervalo.
  const j30 = janelaUltimosDias(30, HOJE);
  const movel = dailyCashflow(DATASET as unknown as Movement[], 30, new Date(`${HOJE}T00:00:00`));
  const fixa = dailyCashflowRange(DATASET as unknown as Movement[], j30.de, j30.ate, 0);
  eq("cruzado: janela móvel == janela fixa (entradas)",
     movel.reduce((a, p) => a + p.inflow, 0), fixa.reduce((a, p) => a + p.inflow, 0));
  eq("cruzado: janela móvel == janela fixa (saídas)",
     movel.reduce((a, p) => a + Math.abs(p.outflow), 0), fixa.reduce((a, p) => a + Math.abs(p.outflow), 0));
}

/* ========================================================================== */
/* LINHA 5 — DRE (competência) contra o indicador canônico.                    */
/* ========================================================================== */
{
  const compE = entradas(INPUT, AGOSTO, "competencia").valor;
  const rows = movimentosNoPeriodo(INPUT, "competencia", AGOSTO.de, AGOSTO.ate);
  const dreEnt = rows.filter((m) => m.type === "entrada").reduce((s, m) => s + Math.abs(m.amount), 0);
  eq("cruzado: DRE competência == entradas canônicas (competência)", dreEnt, compE);

  const dre = dreGerencial(rows);
  eq("cruzado: receita bruta do DRE == entradas canônicas", dre.receitaBruta, compE);

  const compS = saidas(INPUT, AGOSTO, "competencia").valor;
  const dreDesp = rows.filter((m) => m.type === "saida").reduce((s, m) => s + Math.abs(m.amount), 0);
  eq("cruzado: despesa do DRE == saídas canônicas (competência)", dreDesp, compS);
}

/* ========================================================================== */
/* LINHA 6 — BURN e RUNWAY: uma unidade, um número, em todos os motores.       */
/* ========================================================================== */
{
  const b = burn(INPUT).valor;
  const g = geracaoCaixaMensal(INPUT).valor;
  eq("ritmo: burn == max(0, −geração)", b, Math.max(0, -g));

  // risk-engine, quant e o canônico têm de concordar no burn e no runway.
  const be = calcularBurnRate(INPUT, 90);
  eq("cruzado: burn do risk-engine == burn canônico", be.burnMensal, b);
  eq("cruzado: geração do risk-engine == geração canônica", be.liquidoMensal, g);

  const re = calcularRunway(INPUT.saldoAtual, be);
  eq("cruzado: runway do risk-engine == runway canônico (dias)", re.base, runway(INPUT).valor);

  const risco = scoreRiscoCaixa(INPUT);
  eq("cruzado: runway do score de risco == runway canônico", risco.runway.base, runway(INPUT).valor);
  eq("cruzado: runwayDias do score == runway canônico", risco.runwayDias, runway(INPUT).valor);
  eq("cruzado: burn do score de risco == burn canônico", risco.burn.burnMensal, b);

  const q = analisarQuantitativo(INPUT);
  eq("cruzado: burn do quant == burn canônico", q.indicadores.burnRate, b);
  eq("cruzado: runway do quant (meses) == runway canônico (meses)",
     Math.round(q.indicadores.runwayMeses * 10) / 10, runwayMeses(INPUT).valor);

  // Sem queima o runway é o teto, não zero — zero diria o oposto do que ocorre.
  const gerador: RiskInput = {
    ...INPUT,
    movements: [mv("g1", "entrada", "pago", 50_000, "2026-08-01", "2026-08-01")],
  };
  ok("ritmo: quem gera caixa tem burn 0", burn(gerador).valor === 0);
  ok("ritmo: quem gera caixa tem runway no teto", runway(gerador).valor >= 999);

  // Caixa já negativo E queimando: runway 0, nunca negativo (um runway de −40
  // dias já foi exibido como se fossem 40 dias de folga).
  const quebrado: RiskInput = {
    hoje: HOJE, saldoAtual: -5_000,
    movements: [mv("q1", "saida", "pago", 30_000, "2026-08-01", "2026-08-01")],
  } as RiskInput;
  ok("ritmo: dataset queimando tem burn > 0", burn(quebrado).valor > 0);
  ok("ritmo: caixa negativo tem runway 0", runway(quebrado).valor === 0,
     `runway = ${runway(quebrado).valor}`);
}

/* ========================================================================== */
/* LINHA 7 — MRR / ARR: normalizar o ciclo é a regra inteira.                  */
/* ========================================================================== */
{
  const contratos = [
    { ativo: true, valorCiclo: 1_200, mesesCiclo: 12 }, // anual → 100/mês
    { ativo: true, valorCiclo: 300, mesesCiclo: 1 },    // mensal → 300/mês
    { ativo: true, valorCiclo: 600, mesesCiclo: 3 },    // trimestral → 200/mês
    { ativo: false, valorCiclo: 9_999, mesesCiclo: 1 }, // cancelado → 0
  ];
  eq("mrr: normaliza o ciclo (anual/12, trimestral/3)", mrr(INPUT, contratos).valor, 600);
  eq("mrr: contrato inativo não entra", mrr(INPUT, contratos).valor, 600);
  eq("arr: é MRR × 12, não uma segunda apuração", arr(INPUT, contratos).valor, 7_200);

  // Sem contratos, o número é ESTIMADO — e a procedência tem de dizer isso.
  const est = mrr(INPUT);
  ok("mrr: sem contratos, a procedência marca ESTIMADO", est.procedencia.formula.startsWith("ESTIMADO"));

  // ⚠️ CRUZAMENTO: o painel de assinaturas e o Investor Update têm de dizer o
  // MESMO MRR. Havia QUATRO implementações no sistema, e a do Investor Update
  // usava outra definição inteira (`share recorrente × receita mensal`), então
  // o número que ia para o investidor não era o da tela.
  const assinaturas = [
    { id: "a1", clienteId: "c1", criadoEm: "2026-01-10", status: "ativa" as const, valorFatura: 1_200, mesesCiclo: 12, itens: [] },
    { id: "a2", clienteId: "c2", criadoEm: "2026-02-10", status: "ativa" as const, valorFatura: 300, mesesCiclo: 1, itens: [] },
  ];
  const painel = painelAssinaturas(assinaturas, "2026-08", HOJE);
  eq("cruzado: MRR do painel de assinaturas == MRR canônico", painel.mrr,
     mrr(INPUT, assinaturas.map((a) => ({ ativo: true, valorCiclo: a.valorFatura, mesesCiclo: a.mesesCiclo }))).valor);

  const upd = montarInvestorUpdate(INPUT);
  eq("cruzado: MRR do Investor Update == MRR canônico", upd.raw.mrrEstimado, mrr(INPUT).valor);
  const kpiMrr = upd.kpis.find((k) => k.id === "mrr");
  eq("cruzado: KPI de MRR do relatório == MRR canônico", kpiMrr?.valor ?? -1, mrr(INPUT).valor);
  const kpiArr = upd.kpis.find((k) => k.id === "arr");
  eq("cruzado: KPI de ARR do relatório == ARR canônico", kpiArr?.valor ?? -1, arr(INPUT).valor);
}

/* ========================================================================== */
/* LINHA 8 — INADIMPLÊNCIA: o que venceu, não o que vence hoje.                */
/* ========================================================================== */
{
  const inad = inadimplencia(INPUT).valor;
  // v1 3.300 + v2 1.100 = 4.400. O h1 (7.000) vence HOJE e não está vencido.
  eq("inadimplência: só o vencido (valor fechado)", inad, 4_400);
  ok("inadimplência: título que vence hoje fica fora", inad < 7_000);

  const taxa = inadimplenciaTaxa(INPUT).valor;
  ok("inadimplência: taxa entre 0 e 1", taxa >= 0 && taxa <= 1, `taxa = ${taxa}`);

  // O outro lado (a pagar) usa a MESMA função, só trocando a direção.
  eq("inadimplência: lado a pagar (valor fechado)", inadimplencia(INPUT, undefined, "saida").valor, 2_400);
}

/* ========================================================================== */
/* LINHA 9 — RECEITA TRIBUTÁVEL: nem toda entrada é faturamento.               */
/* ========================================================================== */
{
  const rt = receitaTributavel(INPUT, AGOSTO, "caixa").valor;
  // Das entradas de caixa de agosto (61.400), saem transferência 20.000,
  // rendimento 900 e empréstimo 15.000 → 25.500.
  eq("tributável: exclui transferência, rendimento e empréstimo", rt, 25_500);
  ok("tributável: é menor que o total de entradas", rt < entradas(INPUT, AGOSTO).valor);

  // ⚠️ Âncora `\b`: sem ela "aporte" casa dentro de "transporte" e um frete
  // sairia da base do imposto — o mesmo erro de `iss` dentro de "comissão".
  ok("tributável: 'transporte' NÃO é confundido com 'aporte'", !foraDaBaseTributavel("Transporte de carga"));
  ok("tributável: 'aporte' de sócio fica fora", foraDaBaseTributavel("Aporte de sócio"));
  ok("tributável: 'transferência' fica fora", foraDaBaseTributavel("Transferência entre contas"));
}

/* ========================================================================== */
/* LINHA 10 — JANELA: intervalo impossível não devolve zero mudo.              */
/* ========================================================================== */
{
  // O caso real: "maior que hoje" combinado com "menor que o fim do mês
  // passado". Nenhuma data satisfaz as duas.
  const impossivel = janela("2026-08-16", "2026-07-31", "Filtro combinado");
  ok("janela: intervalo invertido é marcado como vazio", impossivel.vazia);
  ok("janela: intervalo invertido explica o motivo", !!impossivel.motivo && impossivel.motivo.includes("impossível"));

  const r = resultado(INPUT, impossivel);
  eq("janela: indicador de janela impossível devolve 0", r.valor, 0);
  ok("janela: o 0 vem com aviso, não mudo", !!r.procedencia.aviso,
     "um zero sem aviso lê-se 'não há nada' em vez de 'o filtro não existe'");
  ok("janela: janela impossível não conta lançamentos", r.procedencia.lancamentos === 0);

  // Janela válida NÃO carrega aviso — senão o aviso vira ruído permanente.
  ok("janela: janela válida não tem aviso", !resultado(INPUT, AGOSTO).procedencia.aviso);

  // Contagem de dias e a régua de comparação.
  eq("janela: agosto tem 31 dias", diasDe(AGOSTO), 31);
  eq("janela: últimos 30 dias tem 30 dias (as duas pontas contam)", diasDe(janelaUltimosDias(30, HOJE)), 30);
  const ant = janelaAnterior(AGOSTO);
  eq("janela: a anterior tem o mesmo tamanho", diasDe(ant), diasDe(AGOSTO));
  ok("janela: a anterior termina um dia antes do início", ant.ate === "2026-07-31");
}

/* ========================================================================== */
/* LINHA 11 — "MÊS SELECIONADO" ≠ "HOJE".                                      */
/* ========================================================================== */
{
  const marco = janelaMes(2026, 2);
  ok("rótulo: março de 2026 não contém hoje", !contemHoje(marco, HOJE));
  ok("rótulo: agosto de 2026 contém hoje", contemHoje(AGOSTO, HOJE));
  ok("rótulo: a janela de hoje é de um dia só", diasDe(janelaHoje(HOJE)) === 1);
  ok("rótulo: janelaDoMesDe(hoje) == mês corrente", janelaDoMesDe(HOJE).de === AGOSTO.de);

  // Navegar para um mês passado não pode mudar o SALDO DE HOJE (posição), mas
  // tem de mudar o resultado (fluxo). Confundir os dois é o que fazia o card
  // "saldo" parecer errado ao trocar o mês.
  ok("rótulo: saldo de hoje independe do mês navegado",
     saldo(INPUT, janelaHoje(HOJE)).valor === SALDO);
  ok("rótulo: resultado depende do mês navegado",
     resultado(INPUT, marco).valor !== resultado(INPUT, AGOSTO).valor);
  ok("rótulo: saldo do fim de março ≠ saldo de hoje",
     saldo(INPUT, marco).valor !== saldo(INPUT, janelaHoje(HOJE)).valor);
}

/* ========================================================================== */
/* LINHA 12 — RAZÃO × EXTRATO: a conta que faltava.                            */
/* ========================================================================== */
{
  const rec = reconciliarSaldo(INPUT);
  eq("reconciliação: o extrato é a autoridade", rec.extrato, SALDO);
  ok("reconciliação: fecha depois de explicada", rec.fecha,
     `extrato ${rec.extrato} vs derivado ${rec.derivado}`);
  ok("reconciliação: lista as parcelas que explicam a diferença", rec.parcelas.length === 3);
  // A soma das parcelas explicativas tem de cobrir a diferença inteira — uma
  // reconciliação com "resto" não reconciliou nada.
  const previstos = rec.parcelas[0].valor;
  const abertura = rec.parcelas[1].valor;
  eq("reconciliação: derivado + previstos + abertura == extrato",
     rec.derivado + previstos + abertura, rec.extrato);

  // ⚠️ O RAZÃO SÓ POSTA O LIQUIDADO. Postar previstos no caixa é o que fazia o
  // balancete divergir do extrato — o defeito de R$ 420.984,91 × −R$ 31.000,16.
  const entries = lancamentosDeMovimentos(INPUT).map((e) => ({
    id: e.externalKey!, data: e.entryDate, descricao: e.description ?? "", origem: e.source ?? "",
    externalKey: e.externalKey,
    linhas: e.lines.map((l) => ({
      conta: l.accountId, nome: nomeConta(l.accountId), tipo: tipoConta(l.accountId),
      debito: l.debit ?? 0, credito: l.credit ?? 0,
    })),
  }));
  const bal = balancete(entries);
  const caixa = bal.find((c) => c.conta === CAIXA);
  ok("razão: existe conta caixa no balancete", !!caixa);
  const pendentesNoRazao = entries.filter((e) => {
    const m = DATASET.find((d) => `mov:${d.id}` === e.externalKey);
    return m && m.status !== "pago";
  });
  ok("razão: nenhum título pendente vira lançamento de caixa", pendentesNoRazao.length === 0,
     `${pendentesNoRazao.length} pendente(s) postado(s) no razão`);

  // O caixa do razão mede a VARIAÇÃO; somado à abertura, fecha no extrato.
  const variacao = caixa ? saldoPorNatureza(caixa.tipo, caixa.debito, caixa.credito) : 0;
  eq("razão: variação do caixa == soma dos líquidos", variacao,
     DATASET.filter(liquidado).reduce((s, m) => s + assinado(m), 0));
  eq("razão: variação + abertura == extrato", variacao + abertura, SALDO);

  // E o balancete continua fechando (D = C) — a invariante do razão.
  const totD = bal.reduce((s, c) => s + c.debito, 0);
  const totC = bal.reduce((s, c) => s + c.credito, 0);
  eq("razão: débito == crédito", totD, totC);
}

/* ========================================================================== */
/* LINHA 13 — O PAINEL: os dez indicadores saem coerentes de uma execução.     */
/* ========================================================================== */
{
  const p = painelIndicadores(INPUT, AGOSTO, "caixa");
  ok("painel: carrega a versão da camada", p.versao === INDICADORES_VERSION);
  eq("painel: resultado bate com entradas − saídas", p.resultado.valor, p.entradas.valor - p.saidas.valor);

  // A identidade fundamental do caixa: abertura + resultado realizado = saldo
  // no fim. Vale num mês FECHADO (julho), onde não há previsto a projetar; no
  // mês corrente ela só vale até hoje, e cobrar o fim do mês compararia
  // realizado com projetado.
  const julho = janelaMes(2026, 6);
  const pj = painelIndicadores(INPUT, julho, "caixa");
  eq("painel: abertura + resultado == saldo de fechamento (mês fechado)",
     pj.saldoInicial.valor + pj.resultado.valor, saldoEm(INPUT, julho.ate));
  eq("painel: arr == mrr × 12", p.arr.valor, p.mrr.valor * 12);
  ok("painel: toda procedência declara a janela",
     Object.values(p).every((v) => typeof v !== "object" || !v || !("procedencia" in v) ||
       (v as { procedencia: { janela: unknown } }).procedencia.janela === AGOSTO ||
       !!(v as { procedencia: { janela: unknown } }).procedencia.janela));

  // Chamar o painel duas vezes com a mesma entrada dá o mesmo número — puro.
  const p2 = painelIndicadores(INPUT, AGOSTO, "caixa");
  eq("painel: é determinístico", p.resultado.valor, p2.resultado.valor);
}

/* ========================================================================== */
/* LINHA 14 — DADOS DEGENERADOS: nada de NaN, nada de Infinity.                */
/* ========================================================================== */
{
  const casos: [string, RiskInput][] = [
    ["vazio", { hoje: HOJE, saldoAtual: 0, movements: [] } as RiskInput],
    ["só cancelados", { hoje: HOJE, saldoAtual: 100, movements: [mv("c", "entrada", "cancelado", 999, HOJE, HOJE)] } as RiskInput],
    ["saldo negativo", { ...INPUT, saldoAtual: -10_000 }],
    ["tudo pendente", { hoje: HOJE, saldoAtual: 0, movements: DATASET.map((m) => ({ ...m, status: "pendente" as const })) } as RiskInput],
  ];
  for (const [nome, inp] of casos) {
    const p = painelIndicadores(inp, AGOSTO, "caixa");
    for (const [chave, ind] of Object.entries(p)) {
      if (!ind || typeof ind !== "object" || !("valor" in ind)) continue;
      const v = (ind as { valor: number }).valor;
      ok(`degenerado/${nome}: ${chave} é finito`, Number.isFinite(v), `valor = ${v}`);
    }
  }
}


/* ========================================================================== */
/* LINHA 15 — INGESTÃO: reimportar o mesmo extrato não duplica nada.           */
/* ========================================================================== */
{
  const extrato: LinhaBruta[] = [
    { contaId: "c1", data: "2026-08-03", valor: 12_000, tipo: "entrada", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", contraparte: "Loja Alpha", origem: "extrato" },
    { contaId: "c1", data: "2026-08-05", valor: 4_200, tipo: "saida", descritivo: "TED ENVIADO FOLHA DE PAGAMENTO", origem: "extrato" },
    { contaId: "c1", data: "2026-08-06", valor: 310.5, tipo: "saida", descritivo: "COMPRA CARTAO POSTO SHELL 042", origem: "extrato" },
  ];

  const p1 = prepararIngestao(extrato);
  eq("ingestão: primeira passada aceita tudo", p1.resumo.novas + p1.resumo.revisar, 3);
  eq("ingestão: nada é duplicata na primeira vez", p1.resumo.duplicatasBase, 0);

  // A base depois de gravar a primeira passada.
  const gravadas: LinhaExistente[] = linhasAGravar(p1).map((l, i) => ({
    id: `m${i}`, chave: l.chave, account_id: l.contaId, paid_date: l.data, due_date: l.data,
    amount: l.valor, type: l.tipo, descritivo_bruto: l.descritivoBruto,
  }));

  // ⚠️ O TESTE CENTRAL DA ONDA: o MESMO arquivo, de novo.
  const p2 = prepararIngestao(extrato, gravadas);
  eq("ingestão: reimportar o mesmo extrato não grava NADA", linhasAGravar(p2).length, 0);
  eq("ingestão: as três viram duplicata da base", p2.resumo.duplicatasBase, 3);

  // ⚠️ O MESMO lançamento em OUTRO formato ("Pix recebido - Alpha" vindo da API
  // × "PIX RECEBIDO 998877 LOJA ALPHA LTDA" vindo do OFX). Nenhuma normalização
  // honesta cola os dois textos sem também colar textos que descrevem coisas
  // diferentes — e um falso positivo aqui DESCARTA dinheiro real, calado.
  // Então a resposta é SUSPEITA, não descarte: conta+data+valor+sinal batem, o
  // descritivo não, e quem decide é a pessoa.
  const outroFormato: LinhaBruta[] = [
    { contaId: "c1", data: "2026-08-03", valor: 12_000, tipo: "entrada", descritivo: "Pix recebido - Alpha", origem: "openfinance" },
  ];
  const pf = prepararIngestao(outroFormato, gravadas);
  eq("ingestão: formato diferente vira SUSPEITA, não duplicata exata", pf.resumo.possiveisDuplicatas, 1);
  eq("ingestão: e não é descartada em silêncio", linhasAGravar(pf).length, 1);
  ok("ingestão: a suspeita aponta o lançamento existente", !!pf.linhas[0].duplicataDe);

  // Duplicata DENTRO do arquivo (linha repetida na planilha) entra uma vez só.
  const comRepetida = [...extrato, extrato[0]];
  const p3 = prepararIngestao(comRepetida);
  eq("ingestão: linha repetida no arquivo entra uma vez", linhasAGravar(p3).length, 3);
  eq("ingestão: a repetição é marcada, não descartada em silêncio", p3.resumo.duplicatasArquivo, 1);

  // ⚠️ O QUE **NÃO** PODE SER DUPLICATA — os falsos positivos que descartariam
  // dinheiro de verdade:
  const legitimas: LinhaBruta[] = [
    // valor igual, dia seguinte
    { contaId: "c1", data: "2026-08-04", valor: 12_000, tipo: "entrada", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", origem: "extrato" },
    // mesmo dia e valor, SINAL oposto (um estorno)
    { contaId: "c1", data: "2026-08-03", valor: 12_000, tipo: "saida", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", origem: "extrato" },
    // mesmo tudo, OUTRA conta (as duas pernas de uma transferência)
    { contaId: "c2", data: "2026-08-03", valor: 12_000, tipo: "entrada", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", origem: "extrato" },
    // um centavo de diferença
    { contaId: "c1", data: "2026-08-03", valor: 12_000.01, tipo: "entrada", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", origem: "extrato" },
  ];
  const pl = prepararIngestao(legitimas, gravadas);
  eq("ingestão: nenhuma linha legítima vira duplicata EXATA", pl.resumo.duplicatasBase, 0);
  // E, o que mais importa: todas continuam entrando.
  eq("ingestão: todas as linhas legítimas são gravadas", linhasAGravar(pl).length, 4);
  // Dia diferente, conta diferente e centavo diferente nem suspeita geram — só
  // o estorno (mesmo dia/valor/conta, sinal oposto)… que também não, porque o
  // sinal entra na chave aproximada.
  eq("ingestão: variações de dia/conta/centavo não levantam suspeita", pl.resumo.possiveisDuplicatas, 0);

  // Float não separa o que é igual.
  eq("ingestão: 1234.56 e 1234.5600000001 são a mesma chave", 0,
     chaveIdempotencia({ contaId: "c", data: "2026-08-01", valor: 1234.56, tipo: "saida", descritivo: "X" }) ===
     chaveIdempotencia({ contaId: "c", data: "2026-08-01", valor: 1234.5600000001, tipo: "saida", descritivo: "X" }) ? 0 : 1);

  // O descritivo BRUTO é preservado, não sobrescrito pela normalização.
  const bruto = "PIX RECEBIDO 998877 LOJA ALPHA LTDA";
  ok("ingestão: descritivo bruto preservado intacto",
     p1.linhas[0].descritivoBruto === bruto && p1.linhas[0].descritivoNormalizado !== bruto,
     `bruto="${p1.linhas[0].descritivoBruto}" norm="${p1.linhas[0].descritivoNormalizado}"`);

  // `prepararIngestao` NÃO grava — é um plano. (Se gravasse, chamá-la duas
  // vezes com a mesma base mudaria o resultado da segunda.)
  const a = prepararIngestao(extrato, gravadas);
  const b = prepararIngestao(extrato, gravadas);
  eq("ingestão: preparar é puro (não grava)", a.resumo.duplicatasBase, b.resumo.duplicatasBase);
}

/* ========================================================================== */
/* LINHA 16 — TAXONOMIA ÚNICA: uma porta ou outra, a mesma categoria.          */
/* ========================================================================== */
{
  // O MESMO gasto entrando pelo extrato e pelo OCR de documento.
  const porExtrato = prepararIngestao([
    { contaId: "c1", data: "2026-08-10", valor: 890, tipo: "saida", descritivo: "PAGAMENTO ALUGUEL IMOBILIARIA CENTRO", origem: "extrato" },
  ]);
  const porOcr = prepararIngestao([
    { contaId: "c1", data: "2026-08-10", valor: 890, tipo: "saida", descritivo: "ALUGUEL IMOBILIARIA CENTRO", origem: "ocr" },
  ]);
  ok("taxonomia: extrato e OCR classificam igual",
     porExtrato.linhas[0].classificacao.categoria === porOcr.linhas[0].classificacao.categoria,
     `${porExtrato.linhas[0].classificacao.categoria} ≠ ${porOcr.linhas[0].classificacao.categoria}`);
  ok("taxonomia: a categoria sai da lista única",
     CATEGORIAS_TODAS.some((c) => c.id === porOcr.linhas[0].classificacao.categoria));

  // ⚠️ Categoria de RECEITA não captura uma SAÍDA: "pagamento ao Mercado Pago"
  // é despesa, mesmo casando com o padrão da plataforma de recebimento.
  const saidaPlataforma = prepararIngestao([
    { contaId: "c1", data: "2026-08-10", valor: 100, tipo: "saida", descritivo: "MERCADO PAGO TAXA", origem: "extrato" },
  ]);
  ok("taxonomia: padrão de receita não classifica uma saída",
     saidaPlataforma.linhas[0].classificacao.natureza !== "receita",
     `caiu em ${saidaPlataforma.linhas[0].classificacao.categoria}`);

  // O desconhecido entra marcado para REVISAR, não passa batido como certo.
  const opaco = prepararIngestao([
    { contaId: "c1", data: "2026-08-10", valor: 42, tipo: "saida", descritivo: "DEB AUT 9931 XPTO", origem: "extrato" },
  ]);
  ok("taxonomia: o que não se reconhece cai em 'revisar'", opaco.linhas[0].situacao === "revisar");
  ok("taxonomia: e diz por quê", opaco.linhas[0].classificacao.motivo.includes("confira"));
}

/* ========================================================================== */
/* LINHA 17 — LIMPEZA RETROATIVA: remove as cópias, mantém a primeira.         */
/* ========================================================================== */
{
  const base: LinhaExistente[] = [
    { id: "m001", due_date: "2026-08-03", paid_date: "2026-08-03", amount: 12_000, type: "entrada", account_id: "c1", descritivo_bruto: "PIX LOJA ALPHA" },
    { id: "m002", due_date: "2026-08-03", paid_date: "2026-08-03", amount: 12_000, type: "entrada", account_id: "c1", descritivo_bruto: "PIX LOJA ALPHA" },
    { id: "m003", due_date: "2026-08-03", paid_date: "2026-08-03", amount: 12_000, type: "entrada", account_id: "c1", descritivo_bruto: "PIX LOJA ALPHA" },
    { id: "m004", due_date: "2026-08-05", paid_date: "2026-08-05", amount: 4_200, type: "saida", account_id: "c1", descritivo_bruto: "FOLHA" },
  ];
  const r = planejarLimpeza(base);
  eq("limpeza: encontra as duas cópias", r.remover.length, 2);
  ok("limpeza: MANTÉM a primeira (id estável), não a última",
     r.grupos[0].manter === "m001", `manteria ${r.grupos[0].manter}`);
  ok("limpeza: as removidas são as cópias", r.remover.includes("m002") && r.remover.includes("m003"));
  ok("limpeza: o lançamento único não é tocado", !r.remover.includes("m004"));
  eq("limpeza: mostra o impacto no caixa", r.impactoEntradas, 24_000);
  eq("limpeza: e no resultado", r.impactoResultado, 24_000);

  // Base limpa: nada a remover, e o relatório diz isso sem inventar grupo.
  const limpa = planejarLimpeza(base.slice(0, 1).concat(base[3]));
  eq("limpeza: base sem duplicata não remove nada", limpa.remover.length, 0);
  eq("limpeza: e não lista grupos", limpa.grupos.length, 0);
}


/* ========================================================================== */
/* LINHA 18 — GATING DE PLANO: menu e servidor dizem a MESMA coisa.            */
/* ========================================================================== */
{
  // ⚠️ A guarda central do P0-18. O Modo Pro era uma cortina: os grupos sumiam
  // do menu e as rotas continuavam abrindo. Agora quem tranca é o middleware,
  // e ele lê `ROTAS_PRO`. Se as duas listas divergirem, um recurso some do menu
  // e continua acessível por digitação — a cortina de volta, sem ninguém notar.
  const doMenu = SECTIONS
    .filter((sec) => sec.pro)
    .flatMap((sec) => [sec.href, ...sec.items.map((i) => i.href)])
    .filter((h): h is string => !!h);

  const semGate = doMenu.filter((h) => !exigePro(h));
  ok("planos: toda rota Pro do menu é bloqueada no servidor", semGate.length === 0,
     `sem gate: ${semGate.join(", ")}`);

  // E o inverso: a lista do servidor não pode trancar o que o menu entrega no
  // Simples — bloquear o que a pessoa já tem é o outro lado do mesmo defeito.
  const doSimples = SECTIONS
    .filter((sec) => !sec.pro)
    .flatMap((sec) => [sec.href, ...sec.items.map((i) => i.href)])
    .filter((h): h is string => !!h);
  const trancadoAToa = doSimples.filter((h) => exigePro(h));
  ok("planos: nenhuma rota do Simples é trancada", trancadoAToa.length === 0,
     `trancadas à toa: ${trancadoAToa.join(", ")}`);

  // As rotas LEGADAS que redirecionam para as telas Pro também têm de estar
  // trancadas — senão o redirect é uma porta lateral aberta para a mesma tela.
  for (const legada of ["/decisao", "/risco", "/autonomo", "/inteligencia"]) {
    ok(`planos: rota legada ${legada} exige Pro`, exigePro(legada));
  }

  // Sub-rotas e query string entram pelo mesmo prefixo.
  ok("planos: sub-rota herda o bloqueio", exigePro("/copiloto/qualquer-coisa"));
  ok("planos: query string não escapa do bloqueio", exigePro("/copiloto?aba=risco"));

  // ⚠️ A tela de UPGRADE e a de assinatura nunca são bloqueadas: trancá-las
  // deixaria quem não tem o plano sem caminho para comprá-lo.
  ok("planos: /planos nunca é bloqueada", !exigePro("/planos"));
  ok("planos: a tela de assinatura nunca é bloqueada",
     !exigePro("/dashboard/administration/subscription"));

  // O Simples não abre Pro; o Pro abre tudo; demo abre tudo.
  ok("planos: Simples não abre rota Pro", !podeAbrir("/copiloto", PLANO_SIMPLES));
  ok("planos: Simples abre rota comum", podeAbrir("/", PLANO_SIMPLES));
  ok("planos: Pro abre rota Pro", podeAbrir("/copiloto", { ...PLANO_SIMPLES, plano: "pro" }));
  ok("planos: demonstração abre tudo", podeAbrir("/copiloto", PLANO_ABERTO));
}


/* ========================================================================== */
/* LINHA 19 — DUAS TELAS DE "A RECEBER": nomes distintos e leituras declaradas */
/* ========================================================================== */
{
  const ponte = pontePosicaoFluxo(INPUT, AGOSTO, "entrada");

  // As duas leituras são DIFERENTES por construção — e é isso que precisa ficar
  // dito na tela. Um sistema em que elas coincidem por acaso esconde o problema.
  ok("telas: posição e fluxo são leituras distintas",
     ponte.posicao.total !== ponte.fluxo.resultado);

  // A posição fecha: liquidado + aberto + atrasado == total, e conta TODOS os
  // títulos do lado, sem recorte de período.
  eq("telas: estoque fecha (liquidado + aberto + atrasado)",
     ponte.posicao.liquidado + ponte.posicao.aberto + ponte.posicao.atrasado, ponte.posicao.total);
  eq("telas: o estoque conta todos os títulos do lado",
     ponte.posicao.titulos, DATASET.filter((m) => m.type === "entrada" && m.status !== "cancelado").length);

  // O fluxo é o indicador canônico, não uma terceira conta.
  eq("telas: o fluxo da ponte == resultado canônico", ponte.fluxo.resultado, resultado(INPUT, AGOSTO).valor);
  eq("telas: as entradas da ponte == entradas canônicas", ponte.fluxo.entradas, entradas(INPUT, AGOSTO).valor);

  // ⚠️ O fluxo PODE ser negativo (mês em que se pagou mais do que se recebeu) e
  // a posição NUNCA é — somar magnitudes de títulos não produz número negativo.
  // Confundir os dois é o que fazia um usuário achar que "a receber" era −33 mil.
  ok("telas: o estoque nunca é negativo", ponte.posicao.total >= 0);

  // A explicação nomeia as duas leituras — é ela que a interface mostra, e sem
  // ela o usuário não tem como saber qual das telas é a verdade (são as duas).
  ok("telas: a explicação nomeia ESTOQUE e RESULTADO",
     ponte.explicacao.includes("ESTOQUE") && ponte.explicacao.includes("RESULTADO"));
  ok("telas: a explicação diz o período do fluxo", ponte.explicacao.includes(AGOSTO.label));

  // ⚠️ E os NOMES no menu têm de ser distintos. Rótulos quase idênticos apontando
  // para leituras diferentes é o defeito original: mesmo nome, números diferentes.
  const rotulos = SECTIONS
    .flatMap((sec) => sec.items)
    .filter((i) => i.href === "/recebimentos" || i.href?.includes("tab=receivables"))
    .map((i) => i.label);
  ok("telas: as duas entradas de menu têm nomes distintos",
     new Set(rotulos).size === rotulos.length, `rótulos: ${rotulos.join(" | ")}`);
  ok("telas: e nenhum é o genérico 'Contas a receber'",
     !rotulos.includes("Contas a receber"), `rótulos: ${rotulos.join(" | ")}`);
}


/* ========================================================================== */
/* LINHA 20 — PERSISTÊNCIA: dado de negócio não pode morar só no navegador.    */
/* ========================================================================== */
{
  // ⚠️ A guarda do P0-17. 74 chaves de localStorage carregavam entidades de
  // negócio inteiras: quem trocasse de máquina perdia aprovações, orçamento e
  // fechamento; dois usuários da mesma empresa nunca viam o mesmo estado; e a
  // trilha de auditoria ficava em zero porque nada passava pelo servidor.
  //
  // Esta guarda não conserta isso sozinha — ela impede que a lista de
  // classificação se perca de vista enquanto a migração acontece por etapas.

  // Nenhuma chave pode estar nas DUAS listas: ou é dado, ou é preferência.
  const nasDuas = CHAVES_DE_NEGOCIO.filter((c) => PREFERENCIAS_LOCAIS.includes(c));
  ok("persistência: nenhuma chave é dado E preferência", nasDuas.length === 0,
     `ambíguas: ${nasDuas.join(", ")}`);
  const emTres = PRECISAM_DE_TABELA_PROPRIA.filter(
    (c) => CHAVES_DE_NEGOCIO.includes(c) || PREFERENCIAS_LOCAIS.includes(c));
  ok("persistência: 'precisa de tabela própria' não se mistura", emTres.length === 0,
     `ambíguas: ${emTres.join(", ")}`);

  // As chaves de negócio são únicas (um typo duplicaria a sincronização).
  ok("persistência: sem chaves de negócio repetidas",
     new Set(CHAVES_DE_NEGOCIO).size === CHAVES_DE_NEGOCIO.length);

  // ⚠️ As chaves que o CÓDIGO usa têm de estar classificadas. Uma chave nova
  // que ninguém classifica é uma entidade de negócio que volta a morar só no
  // navegador — em silêncio, que é como este defeito nasceu.
  const usadas = chavesUsadasNoCodigo();
  const classificadas = new Set([
    ...CHAVES_DE_NEGOCIO, ...PREFERENCIAS_LOCAIS, ...PRECISAM_DE_TABELA_PROPRIA,
  ]);
  const orfas = usadas.filter((c) => !classificadas.has(c));
  // ⚠️ TETO ZERO. Toda chave usada no código tem de estar em uma das três
  // listas — dado de negócio, preferência do dispositivo, ou "precisa de tabela
  // própria". Uma chave nova sem classificação é uma entidade que voltou a
  // morar só no navegador, e foi assim, em silêncio, que este defeito nasceu.
  ok("persistência: toda chave usada no código está classificada",
     orfas.length === 0,
     `${orfas.length} sem classificação: ${orfas.join(", ")}`);

  // As entidades que a auditoria nomeou explicitamente têm de estar na lista de
  // NEGÓCIO — são justamente as que doem quando se perdem.
  for (const critica of [
    "a4p_aprovacoes", "a4p_orcamentos", "a4p_reembolsos", "a4p_comprovantes",
    "a4p_close_tasks", "a4p_pos_taxas", "a4p_company",
  ]) {
    ok(`persistência: ${critica} é dado de negócio`, CHAVES_DE_NEGOCIO.includes(critica));
  }

  // Tema e largura da barra NÃO são dado de negócio — sincronizá-los faria a
  // preferência de um usuário mudar a tela do outro.
  for (const pref of ["a4p_theme", "a4p_sidebar_width", "a4p_modo"]) {
    ok(`persistência: ${pref} continua local`, PREFERENCIAS_LOCAIS.includes(pref));
  }
}


/* ========================================================================== */
/* LINHA 21 — ROTAS: aliases documentados, sem ciclo e sem porta lateral.      */
/* ========================================================================== */
{
  // ⚠️ Eram 34 desvios vivos na raiz do domínio: nenhum no menu, nenhum
  // documentado, nenhum testado, e todos feitos no cliente (página em branco +
  // useEffect). Agora vivem num registro só, viram 308 no middleware, e esta
  // guarda cobra o que ninguém cobrava.

  // Nenhum alias aponta para outro alias — um desvio em cadeia é um salto a
  // mais no navegador e, no pior caso, um laço.
  const emCiclo = TODOS_OS_DESVIOS.filter((a) => destinoDe(a.para) !== null);
  ok("rotas: nenhum alias aponta para outro alias", emCiclo.length === 0,
     `em cadeia: ${emCiclo.map((a) => `${a.de}→${a.para}`).join(", ")}`);

  // Nenhum alias aponta para si mesmo.
  const auto = TODOS_OS_DESVIOS.filter((a) => a.de === a.para.split("?")[0]);
  ok("rotas: nenhum alias aponta para si mesmo", auto.length === 0,
     `${auto.map((a) => a.de).join(", ")}`);

  // Origem única: dois desvios com a mesma origem tornam o destino uma questão
  // de ordem no arquivo, que é a pior forma de decidir para onde um link vai.
  const origens = TODOS_OS_DESVIOS.map((a) => a.de);
  ok("rotas: cada endereço antigo aparece uma vez só",
     new Set(origens).size === origens.length);

  // ⚠️ Nenhum alias pode estar no MENU. Se estivesse, o menu levaria a um
  // redirecionamento — um salto visível a cada clique, no caminho mais usado.
  const doMenu = new Set(
    SECTIONS.flatMap((sec) => [sec.href, ...sec.items.map((i) => i.href)])
      .filter((h): h is string => !!h)
      .map((h) => h.split("?")[0]),
  );
  const aliasNoMenu = TODOS_OS_DESVIOS.filter((a) => doMenu.has(a.de));
  ok("rotas: nenhum alias aparece no menu", aliasNoMenu.length === 0,
     `${aliasNoMenu.map((a) => a.de).join(", ")}`);

  // Todo alias carrega o MOTIVO. Sem ele, ninguém daqui a um ano sabe se pode
  // remover — e a lista vira um cemitério que só cresce.
  const semMotivo = TODOS_OS_DESVIOS.filter((a) => !a.motivo || a.motivo.length < 10);
  ok("rotas: todo desvio explica por que existe", semMotivo.length === 0,
     `${semMotivo.map((a) => a.de).join(", ")}`);

  // As rotas REMOVIDAS que ainda aparecem em rastro antigo (marcadores de tour
  // no navegador) têm de estar cobertas: um 404 num sistema recém-comprado
  // lê-se como produto quebrado, não como página aposentada.
  for (const morta of ["/arquitetura", "/infraestrutura", "/orquestracao", "/dados", "/plataforma"]) {
    ok(`rotas: ${morta} (removida) tem destino, não 404`, destinoDe(morta) !== null);
  }

  // ⚠️ PORTA LATERAL: um alias Pro não pode desembocar em rota aberta. O
  // `/consolidado` estava em ROTAS_PRO e o alias o mandava para
  // `/contabilidade?aba=consolidado`, que é do Simples — o redirecionamento
  // virava a porta que o gate deveria fechar.
  const vazamentos = TODOS_OS_DESVIOS.filter((a) => exigePro(a.de) && !exigePro(a.para));
  ok("rotas: alias de rota Pro não desemboca em rota aberta", vazamentos.length === 0,
     `${vazamentos.map((a) => `${a.de}→${a.para}`).join(", ")}`);

  // E a aba paga dentro de hub do Simples continua trancada, sem trancar o hub.
  ok("rotas: a aba paga do hub exige Pro", exigePro("/contabilidade?aba=consolidado"));
  ok("rotas: o hub em si continua aberto", !exigePro("/contabilidade"));
  ok("rotas: outra aba do mesmo hub continua aberta", !exigePro("/contabilidade?aba=razao"));
}

/* ========================================================================== */
/* LINHA 22 — TÍTULO DA ABA: uma grafia da marca, a tela primeiro.             */
/* ========================================================================== */
{
  // ⚠️ Quase todo o sistema anunciava "all4pay — Tesouraria": Clientes,
  // Produtos, DRE, Vendas, todos iguais. Com dez abas abertas, histórico e
  // favoritos ficam indistinguíveis — e trabalhar com várias telas ao mesmo
  // tempo é exatamente o que se faz num fechamento.
  ok("título: a tela vem primeiro", tituloDaAba("Clientes").startsWith("Clientes"));
  ok("título: a marca vem depois", tituloDaAba("Clientes").endsWith(MARCA));
  ok("título: telas diferentes, títulos diferentes",
     tituloDaAba("Clientes") !== tituloDaAba("Produtos"));
  ok("título: sem tela, só a marca", tituloDaAba(null) === MARCA);
  ok("título: string vazia não vira ' · all4pay'", tituloDaAba("   ") === MARCA);
  // Uma grafia só: `all4pay` minúsculo, como no wordmark.
  ok("título: a grafia canônica é minúscula", MARCA === "all4pay");
}


/* ========================================================================== */
/* LINHA 23 — CADASTRO IMPORTADO: nome é nome, documento é documento.         */
/* ========================================================================== */
{
  // ⚠️ Os três casos que a auditoria encontrou na PRIMEIRA linha da lista de
  // clientes. Todo relatório por cliente nasce daqui — DRE por cliente,
  // cobrança, segmentação, score de crédito.

  // 1. CNPJ colado à razão social, com o parêntese invertido.
  const colado = sanearContraparte("ACME COMERCIO LTDA (11.222.333/0001-81");
  ok("cadastro: separa o documento da razão social", colado.documento === "11222333000181");
  ok("cadastro: o nome sai sem o documento", !/\d{4}/.test(colado.nome), `nome = "${colado.nome}"`);
  ok("cadastro: o nome sai sem parêntese órfão", !/[()]/.test(colado.nome), `nome = "${colado.nome}"`);
  ok("cadastro: e continua sendo uma pessoa jurídica", colado.ehPessoa);

  // 2. O nome que é APENAS um CPF.
  const soCpf = sanearContraparte("529.982.247-25");
  ok("cadastro: um CPF solto NÃO vira cliente", !soCpf.ehPessoa);
  ok("cadastro: mas o documento é aproveitado", soCpf.documento === "52998224725");

  // 3. Descrição de cobrança no lugar do favorecido.
  ok("cadastro: 'ANUIDADE DIFERENCIADA' não vira cliente",
     !sanearContraparte("ANUIDADE DIFERENCIADA").ehPessoa);

  // ⚠️ E O QUE **NÃO** PODE SER RECUSADO — recusar um cliente real dói mais
  // que aceitar um nome feio. Um detector que grita lobo é um detector que
  // ninguém lê (a mesma regra do detector de segredos da Central de Ajuda).
  for (const legitimo of [
    "Mensalidade Servicos Ltda",   // começa com palavra de cobrança E é empresa
    "Anuidade Clube SA",
    "Taxa Consultoria EIRELI",
    "Transporte Ipiranga Ltda",
    "Joao da Silva ME",
    "Padaria do Bairro",
  ]) {
    ok(`cadastro: "${legitimo}" é aceito`, sanearContraparte(legitimo).ehPessoa,
       sanearContraparte(legitimo).motivo);
  }

  // Documento INVÁLIDO não é extraído — senão a linha digitável de um boleto
  // vira CNPJ e o nome perde um pedaço.
  const docFalso = sanearContraparte("EMPRESA X 11.111.111/1111-11");
  ok("cadastro: documento com DV inválido não é extraído", docFalso.documento === null);

  // ⚠️ O NOME NÃO É MAIS "O ALIAS MAIS LONGO". O mais longo é justamente o que
  // tem o documento grudado — era essa a causa raiz.
  const escolhido = melhorNome([
    "ACME COMERCIO LTDA (11.222.333/0001-81",
    "ACME",
    "ACME COMERCIO",
  ]);
  ok("cadastro: o alias com documento colado não é escolhido como nome",
     !/\d/.test(escolhido.nome), `escolheu "${escolhido.nome}"`);
  ok("cadastro: mas o documento dele é aproveitado", escolhido.documento === "11222333000181");

  // DEDUPLICAÇÃO: mesmo documento, grafias diferentes = uma contraparte só.
  const dedup = deduplicar([
    sanearContraparte("ACME COMERCIO LTDA 11.222.333/0001-81"),
    sanearContraparte("Acme Comercio 11222333000181"),
    sanearContraparte("Outra Empresa Ltda"),
  ]);
  eq("cadastro: mesmo CNPJ vira uma contraparte só", dedup.length, 2);

  // E nomes diferentes SEM documento não são fundidos por engano.
  eq("cadastro: empresas diferentes não são fundidas",
     deduplicar([sanearContraparte("Alpha Ltda"), sanearContraparte("Beta Ltda")]).length, 2);
}


/* ========================================================================== */
/* LINHA 24 — CRIAR: toda ação tem endereço, e a forma é declarada.           */
/* ========================================================================== */
{
  const todas = [...ACOES_CADASTROS, ...ACOES_MOVIMENTACOES, ACAO_NOVA_EMPRESA];

  // ⚠️ Eram dezesseis `<button>` com navegação por código: nenhuma abria em
  // nova aba, nenhuma respondia a Ctrl+clique, nenhuma tinha endereço para
  // mandar a um colega. Toda ação passa a ter rota.
  const semRota = todas.filter((a) => !a.rota || !a.rota.startsWith("/"));
  ok("criar: toda ação tem endereço próprio", semRota.length === 0,
     `sem rota: ${semRota.map((a) => a.label).join(", ")}`);

  // Endereços únicos: dois itens no mesmo link tornam um deles inalcançável
  // por endereço.
  const rotas = todas.map((a) => a.rota);
  ok("criar: nenhum endereço repetido", new Set(rotas).size === rotas.length,
     `repetidos: ${rotas.filter((r, i) => rotas.indexOf(r) !== i).join(", ")}`);

  // ⚠️ A FORMA é declarada em cada ação. Sem regra visível, "Novo cliente"
  // abria modal e "Nova venda" trocava de tela, e o usuário não tinha como
  // saber se ia perder o contexto ao clicar.
  const semForma = todas.filter((a) => a.forma !== "modal" && a.forma !== "pagina");
  ok("criar: toda ação declara modal ou página", semForma.length === 0);

  // Documento COMPOSTO (itens, totais, impostos) é sempre PÁGINA — um
  // formulário desses num modal é um formulário que não cabe.
  for (const composto of ["Nova venda", "Nova compra", "Novo orçamento"]) {
    const a = todas.find((x) => x.label === composto);
    ok(`criar: "${composto}" abre em página`, a?.forma === "pagina", `forma = ${a?.forma}`);
  }
  // Cadastro simples é sempre MODAL — trocar de tela para digitar três campos
  // custa o contexto por nada.
  for (const simples of ["Novo cliente", "Novo fornecedor", "Novo produto"]) {
    const a = todas.find((x) => x.label === simples);
    ok(`criar: "${simples}" abre em modal`, a?.forma === "modal", `forma = ${a?.forma}`);
  }

  // ⚠️ CRIAR EMPRESA fora das listas: cria uma organização inteira, não um
  // registro. Na mesma lista e com o mesmo peso de "Novo produto", a
  // proximidade convida ao acidente.
  ok("criar: 'Nova empresa' não está entre os cadastros",
     !ACOES_CADASTROS.some((a) => a.label === ACAO_NOVA_EMPRESA.label));
  ok("criar: nem entre as movimentações",
     !ACOES_MOVIMENTACOES.some((a) => a.label === ACAO_NOVA_EMPRESA.label));

  // As lacunas que a auditoria nomeou.
  for (const faltava of [
    "Nova nota fiscal", "Novo link de pagamento",
    "Nova assinatura / recorrência", "Novo usuário",
  ]) {
    ok(`criar: "${faltava}" existe no painel`, todas.some((a) => a.label === faltava));
  }
}


/* ========================================================================== */
/* LINHA 25 — CONSOLIDAÇÃO: não se aposenta rota com pendência de porte.      */
/* ========================================================================== */
{
  // ⚠️ A INVARIANTE QUE DÁ VALOR AO MAPA. Fundir não é apagar: a rota legada
  // quase sempre faz UMA coisa melhor que a canônica, e apagá-la sem portar
  // essa coisa é perda funcional que ninguém registra — o usuário descobre
  // meses depois procurando um painel que sumiu.
  //
  // Enquanto uma fusão tiver item pendente, a rota legada NÃO pode virar alias.
  const desligadasCedo = FUSOES.flatMap((f) =>
    prontaParaAposentar(f)
      ? []
      : f.aposentar
          .filter((r) => destinoDe(r) !== null)
          .map((r) => `${r} (falta: ${pendencias(f).map((p) => p.o_que.slice(0, 40)).join(" · ")})`),
  );
  ok("consolidação: nenhuma rota é aposentada com porte pendente", desligadasCedo.length === 0,
     desligadasCedo.join(" | "));

  // O inverso: uma fusão PRONTA cujos aliases não existem é trabalho feito e
  // não colhido — a canônica já tem tudo e o endereço antigo continua solto.
  const prontasSemAlias = PRONTAS.flatMap((f) =>
    f.aposentar.filter((r) => destinoDe(r) === null).map((r) => `${f.id}:${r}`),
  );
  ok("consolidação: fusão pronta tem o alias criado", prontasSemAlias.length === 0,
     `sem alias: ${prontasSemAlias.join(", ")}`);

  // Cada fusão declara canônico, motivo e ao menos um item de porte — uma
  // fusão sem item declarado é uma que ninguém examinou.
  for (const f of FUSOES) {
    ok(`consolidação: ${f.id} tem canônico`, f.canonico.startsWith("/"));
    ok(`consolidação: ${f.id} explica a escolha`, f.porque.length > 40);
    ok(`consolidação: ${f.id} lista o que portar`, f.portar.length > 0);
    // ⚠️ Todo item diz o CUSTO DE PERDER. Sem isso a lista vira inventário, e
    // inventário é fácil de despachar num "isso ninguém usa".
    const semCusto = f.portar.filter((p) => p.custo_de_perder.length < 40);
    ok(`consolidação: ${f.id} declara o custo de cada perda`, semCusto.length === 0);
  }

  // A canônica de uma fusão não pode ser rota aposentada por OUTRA — seria
  // fundir para dentro de algo que também vai embora.
  const canonicoMorto = FUSOES.filter((f) =>
    ROTAS_A_APOSENTAR.some((r) => r.split("?")[0] === f.canonico.split("?")[0]),
  );
  ok("consolidação: nenhuma canônica está na lista de aposentadas", canonicoMorto.length === 0,
     `${canonicoMorto.map((f) => f.id).join(", ")}`);

  // Nenhuma rota é aposentada por duas fusões diferentes.
  ok("consolidação: cada rota é aposentada uma vez só",
     new Set(ROTAS_A_APOSENTAR).size === ROTAS_A_APOSENTAR.length);

  // O tamanho da dívida em um número — a guarda o publica para não virar
  // conhecimento tribal.
  console.log(`  · consolidação: ${PRONTAS.length}/${FUSOES.length} fusões prontas · ${ITENS_PENDENTES} itens a portar`);
}


/* ========================================================================== */
/* LINHA 26 — INVENTÁRIO DE ROTAS: nenhuma rota viva fora do registro.        */
/* ========================================================================== */
{
  // ⚠️ O CRITÉRIO DE CONCLUSÃO DA ONDA 6, em código: varre `src/app` atrás dos
  // `page.tsx` que o Next realmente publica e confronta com o inventário
  // declarado. Rota que ninguém declarou é rota que quebra sem ninguém ver,
  // duplica uma função sem ninguém notar, e que o suporte não sabe explicar
  // quando alguém a manda num print.
  const publicadas = rotasPublicadas();
  const declaradas = new Set(INVENTARIO.map((i) => i.rota));

  const naoDeclaradas = publicadas.filter((r) => !declaradas.has(r));
  ok("inventário: nenhuma rota publicada fora do inventário", naoDeclaradas.length === 0,
     `${naoDeclaradas.length} não declarada(s): ${naoDeclaradas.join(", ")}`);

  // O inverso: entrada no inventário sem página publicada é rota fantasma —
  // o suporte manda o cliente para um 404.
  const fantasmas = INVENTARIO.map((i) => i.rota).filter((r) => !publicadas.includes(r));
  ok("inventário: nenhuma entrada aponta para rota inexistente", fantasmas.length === 0,
     `fantasmas: ${fantasmas.join(", ")}`);

  // ⚠️ NOME ÚNICO por tela. Dois nomes iguais tornam duas abas abertas
  // indistinguíveis — que é o P1-16 voltando pela porta dos fundos.
  const dupes = nomesDuplicados();
  ok("inventário: cada tela tem um nome único", dupes.length === 0,
     dupes.map((d) => `"${d.nome}" em ${d.rotas.join(" e ")}`).join(" | "));

  // Toda rota tem DONO. Sem dono, uma rota órfã fica anos no ar porque remover
  // parece arriscado e ninguém sabe a quem perguntar.
  const semDono = INVENTARIO.filter((i) => !i.dono || i.dono === "outro");
  ok("inventário: toda rota tem módulo dono", semDono.length === 0,
     `sem dono: ${semDono.map((i) => i.rota).join(", ")}`);

  // ⚠️ `aposentando` SEM DATA é uma intenção que nunca vence.
  const semData = APOSENTANDO.filter((i) => !i.aposentadoriaEm);
  ok("inventário: toda rota em aposentadoria tem data-limite", semData.length === 0,
     `${semData.map((i) => i.rota).join(", ")}`);

  // E as que estão em aposentadoria são EXATAMENTE as que o mapa manda fundir —
  // duas listas discordando é a dívida contada duas vezes com números
  // diferentes.
  const doMapa = new Set(ROTAS_A_APOSENTAR.map((r) => r.split("?")[0]).filter((r) => r !== ""));
  const noInventario = new Set(APOSENTANDO.map((i) => i.rota));
  const soNoInventario = Array.from(noInventario).filter((r) => !doMapa.has(r));
  const soNoMapa = Array.from(doMapa).filter((r) => !noInventario.has(r) && publicadas.includes(r));
  ok("inventário: aposentadorias coincidem com o mapa de consolidação",
     soNoInventario.length === 0 && soNoMapa.length === 0,
     `só no inventário: ${soNoInventario.join(", ")} | só no mapa: ${soNoMapa.join(", ")}`);

  // Nenhuma rota é ao mesmo tempo alias e página publicada — o alias venceria
  // no middleware e a página ficaria morta no repositório, sem ninguém saber.
  const aliasComPagina = TODOS_OS_DESVIOS
    .map((a) => a.de)
    .filter((d) => publicadas.includes(d));
  ok("inventário: nenhum alias tem página publicada por baixo", aliasComPagina.length === 0,
     `${aliasComPagina.join(", ")}`);

  console.log(`  · inventário: ${publicadas.length} rotas publicadas · ${CANONICAS.length} canônicas · ${APOSENTANDO.length} em aposentadoria`);
}


/* ========================================================================== */
/* LINHA 27 — NOMENCLATURA: o menu diz o mesmo que a tela.                    */
/* ========================================================================== */
{
  // ⚠️ O menu dizia "Movimentações" e a tela dizia "Tesouraria"; o menu dizia
  // "Vendas e NFs" e a aba do navegador dizia outra coisa. Clicar num nome e
  // chegar em outro faz a pessoa duvidar de que clicou certo — e, num produto
  // com 81 rotas, duvidar do caminho é perder o caminho.
  const nomePorRota = new Map(INVENTARIO.map((i) => [i.rota, i.nome]));
  const itensDoMenu = [...SECTIONS, CONFIG].flatMap((s) => [
    ...(s.href ? [{ label: s.label, href: s.href }] : []),
    ...s.items.filter((i) => i.href).map((i) => ({ label: i.label, href: i.href as string })),
  ]);

  // Só rotas SEM query: a aba de um hub tem nome próprio, que legitimamente
  // não é o nome do hub.
  const divergentes = itensDoMenu
    .filter((it) => !it.href.includes("?"))
    .map((it) => ({ it, nome: nomePorRota.get(it.href) }))
    .filter((x) => x.nome && x.nome !== x.it.label);
  ok("nomenclatura: o rótulo do menu é o nome da tela", divergentes.length === 0,
     divergentes.map((d) => `"${d.it.label}" → "${d.nome}"`).join(" | "));

  // Todo destino do menu está no inventário — item de menu apontando para rota
  // não declarada é como uma rota nova entra sem ninguém ver.
  const foraDoInventario = itensDoMenu
    .map((it) => it.href.split("?")[0])
    .filter((r) => !nomePorRota.has(r) && destinoDe(r) === null);
  ok("nomenclatura: todo destino do menu está no inventário", foraDoInventario.length === 0,
     `${Array.from(new Set(foraDoInventario)).join(", ")}`);
}

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — matriz de consistência cruzada (${INDICADORES_VERSION})`);
if (fails > 0) process.exit(1);
