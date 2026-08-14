/**
 * reconciliação — A MATRIZ DE DIVERGÊNCIAS, PAR A PAR.
 *
 *   npm run reconciliacao   (dentro de npm test e do CI)
 *
 * ⚠️ **A diferença para a matriz de consistência.** Aquela compara PARES
 * ESCOLHIDOS: alguém percebeu que a Home e o DRE discordavam, escreveu a linha,
 * e a linha passou a proteger aquele par. É valiosa e é insuficiente — protege
 * o que alguém já viu quebrar. Esta aqui parte do outro lado: para cada
 * indicador, ela lista TODOS os caminhos que o sistema tem de calcular o número
 * e confronta **todas as combinações** entre eles. Com n caminhos são n(n−1)/2
 * comparações, e nenhuma depende de alguém ter previsto qual delas quebraria.
 *
 * O critério é o CENTAVO. Um centavo de diferença entre duas telas é a mesma
 * classe de defeito que mil reais: significa que existem duas contas, e a
 * segunda vai divergir mais amanhã. Tolerância de arredondamento é como a
 * divergência entra sem ninguém notar.
 *
 * Registrar um caminho novo aqui é obrigação de quem escreve um cálculo novo:
 * um indicador com um único caminho registrado não é reconciliado com nada, e a
 * própria saída denuncia isso ("1 caminho").
 *
 * Determinístico: a fixture compartilhada, sem relógio e sem rede.
 */
import { INPUT, INPUT_QUEIMANDO, DATASET, HOJE } from "./fixture.mts";
import { ehReceitaOperacional } from "@/core/relatorios";
import type { Movement } from "@/lib/types";
import {
  saldo, saldoEm, entradas, saidas, resultado, burn, runway, runwayMeses,
  geracaoCaixaMensal, mrr, arr, inadimplencia, painelIndicadores, reconciliarSaldo,
  janelaMes, janelaHoje, saldoAbertura, INDICADORES_VERSION,
} from "@/core/indicadores";
import { calcularBurnRate } from "@/core/risk-engine/burn.engine";
import { calcularRunway } from "@/core/risk-engine/liquidez.engine";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarQuantitativo } from "@/core/quant";
import { dreGerencial, movimentosNoPeriodo } from "@/core/dre/engine";
import { painelResultado } from "@/core/indicadores/resultado";
import { cascataDRE } from "@/core/relatorios/cascata";
import { classificarReceita } from "@/core/indicadores/classificacao";
import { dailyCashflowRange } from "@/lib/aggregations";
import { painelAssinaturas } from "@/core/paineis";
import { montarInvestorUpdate } from "@/core/investor";

const AGOSTO = janelaMes(2026, 7);

/* ========================================================================== */
/* Os caminhos                                                                 */
/* ========================================================================== */

interface Caminho { via: string; valor: number }
interface Linha {
  indicador: string;
  unidade: "R$" | "dias" | "meses" | "×";
  /** Por que estes caminhos existem — a razão de o número aparecer em N lugares. */
  porque: string;
  caminhos: Caminho[];
}

/* Pré-cálculos compartilhados (rodar os motores uma vez só). */
const pontosAgosto = dailyCashflowRange(DATASET as unknown as Movement[], AGOSTO.de, AGOSTO.ate, 0);
const rowsComp = movimentosNoPeriodo(INPUT, "competencia", AGOSTO.de, AGOSTO.ate);
const dre = dreGerencial(rowsComp);
// ⚠️ Burn e runway são reconciliados sobre a empresa QUE QUEIMA: na fixture
// principal os dois dão zero/teto, e comparar zeros não reconcilia nada.
const risco = scoreRiscoCaixa(INPUT_QUEIMANDO);
const burnEngine = calcularBurnRate(INPUT_QUEIMANDO);
const quant = analisarQuantitativo(INPUT_QUEIMANDO);
const painel = painelIndicadores(INPUT, AGOSTO);
const upd = montarInvestorUpdate(INPUT);
const CONTRATOS = [
  { ativo: true, valorCiclo: 1_200, mesesCiclo: 12 },
  { ativo: true, valorCiclo: 300, mesesCiclo: 1 },
];
const assinaturas = [
  { id: "a1", clienteId: "c1", criadoEm: "2026-01-10", status: "ativa" as const, valorFatura: 1_200, mesesCiclo: 12, itens: [] },
  { id: "a2", clienteId: "c2", criadoEm: "2026-02-10", status: "ativa" as const, valorFatura: 300, mesesCiclo: 1, itens: [] },
];

const MATRIZ: Linha[] = [
  {
    indicador: "saldo (hoje)",
    unidade: "R$",
    porque: "o número mais visível do produto: herói da Home, painel financeiro, razão e conciliação.",
    caminhos: [
      { via: "canônico saldo()", valor: saldo(INPUT, janelaHoje(HOJE)).valor },
      { via: "convenção saldoEm()", valor: saldoEm(INPUT, HOJE) },
      { via: "painel canônico", valor: painelIndicadores(INPUT, janelaHoje(HOJE)).saldo.valor },
      { via: "reconciliação (extrato)", valor: reconciliarSaldo(INPUT).extrato },
      { via: "abertura do mês + líquidos", valor: saldoAbertura(INPUT, AGOSTO.de)
        + DATASET.filter((m) => m.status === "pago" && (m.paid_date ?? "") >= AGOSTO.de && (m.paid_date ?? "") <= HOJE)
            .reduce((s, m) => s + (m.type === "entrada" ? Math.abs(m.amount) : -Math.abs(m.amount)), 0) },
    ],
  },
  {
    indicador: "entradas (agosto, caixa)",
    unidade: "R$",
    porque: "o gráfico diário, o painel e a Home somam a mesma coisa por caminhos diferentes.",
    caminhos: [
      { via: "canônico entradas()", valor: entradas(INPUT, AGOSTO).valor },
      { via: "painel canônico", valor: painel.entradas.valor },
      { via: "gráfico diário (soma)", valor: pontosAgosto.reduce((a, p) => a + p.inflow, 0) },
    ],
  },
  {
    indicador: "saídas (agosto, caixa)",
    unidade: "R$",
    porque: "idem — e a saída é onde o sinal costuma inverter no caminho.",
    caminhos: [
      { via: "canônico saidas()", valor: saidas(INPUT, AGOSTO).valor },
      { via: "painel canônico", valor: painel.saidas.valor },
      { via: "gráfico diário (soma)", valor: pontosAgosto.reduce((a, p) => a + Math.abs(p.outflow), 0) },
    ],
  },
  {
    indicador: "resultado (agosto, caixa)",
    unidade: "R$",
    porque: "resultado é diferença: se ele fecha por três caminhos, entradas e saídas fecham juntas.",
    caminhos: [
      { via: "canônico resultado()", valor: resultado(INPUT, AGOSTO).valor },
      { via: "painel canônico", valor: painel.resultado.valor },
      { via: "entradas − saídas", valor: entradas(INPUT, AGOSTO).valor - saidas(INPUT, AGOSTO).valor },
      { via: "gráfico diário (entradas − saídas)", valor:
        pontosAgosto.reduce((a, p) => a + p.inflow, 0) - pontosAgosto.reduce((a, p) => a + Math.abs(p.outflow), 0) },
    ],
  },
  {
    /**
     * ⚠️ **ENTRADAS e RECEITA BRUTA deixaram de ser o mesmo indicador.**
     *
     * Esta linha somava os três caminhos como se fossem um só, e por isso
     * OBRIGAVA `dreGerencial.receitaBruta` a valer o mesmo que a soma de todas
     * as entradas — o que é falso assim que existe rendimento de aplicação.
     * *Entradas* é CAIXA (tudo que entrou); *receita bruta* é RESULTADO (o que
     * a operação faturou). Juros recebidos entram no caixa e não são
     * faturamento; eles pertencem ao resultado financeiro.
     *
     * Somar os dois numa linha só é o mesmo defeito que a ONDA 1 achou entre
     * POSIÇÃO e FLUXO: duas perguntas diferentes com o mesmo rótulo.
     */
    indicador: "entradas de caixa (agosto, competência)",
    unidade: "R$",
    porque: "tudo que entrou na janela, sem separar operação de resultado financeiro.",
    caminhos: [
      { via: "canônico entradas(competência)", valor: entradas(INPUT, AGOSTO, "competencia").valor },
      { via: "movimentos do DRE (soma)", valor:
        rowsComp.filter((m) => m.type === "entrada").reduce((s, m) => s + Math.abs(m.amount), 0) },
    ],
  },
  {
    indicador: "receita bruta operacional (agosto, competência)",
    unidade: "R$",
    porque: "TRÊS motores apuram a mesma cascata. Nada além desta linha os obriga a concordar, e foi por isso que dois deles somaram receita financeira dentro da receita bruta por meses.",
    caminhos: [
      /**
       * ✅ **O PRIMEIRO DEFEITO DESTA NOTA FOI FECHADO.** Ele dizia que
       * `core/relatorios` media R$ 58.500 onde os outros mediam R$ 73.500, e
       * que a diferença de R$ 15.000 era um **"Empréstimo bancário"** tratado
       * como financeiro por um lado (certo: dinheiro emprestado não é
       * faturamento) e como receita operacional pelo outro.
       *
       * Agora existe UM predicado — `ehReceitaOperacional`, exportado de
       * `core/relatorios` — e os três caminhos o compartilham. Os quatro medem
       * R$ 58.500. Esta nota fica como registro de que a divergência era
       * conhecida, tinha valor e causa escritos, e foi fechada quando
       * `dreGerencial` virou fachada da cascata.
       *
       * ⚠️ E há um segundo, PIOR, em que os quatro caminhos concordam e todos
       * erram: **R$ 20.000 de "Transferência entre contas" contam como receita
       * bruta** nos quatro. É dinheiro que já era da empresa. O predicado
       * canônico `foraDaBaseTributavel` (core/indicadores) já nomeia
       * exatamente esse conjunto — transferência, resgate, empréstimo, aporte,
       * juros — e a cascata do DRE nunca o consultou.
       *
       * Corrigir o SEGUNDO muda a taxonomia `LinhaReceita`, que é a espinha do
       * drill-down do DRE inteiro, então segue DECLARADO com número em vez de
       * corrigido de passagem — e agora é o único que sobra desta nota.
       */
      { via: "DRE receita bruta", valor: dre.receitaBruta },
      { via: "canônico painelResultado", valor: painelResultado(INPUT, AGOSTO, "competencia").receitaBruta.valor },
      // ⚠️ O terceiro caminho subtraía só os JUROS — a definição que deixava o
      // empréstimo dentro da receita. Agora subtrai TODA entrada que não é
      // faturamento, pelo mesmo predicado que monta a linha de Receita Bruta.
      { via: "entradas − entradas não operacionais", valor:
        rowsComp.filter((m) => m.type === "entrada").reduce((s, m) => s + Math.abs(m.amount), 0)
        - rowsComp.filter((m) => m.type === "entrada" && !ehReceitaOperacional(m))
                  .reduce((s, m) => s + Math.abs(m.amount), 0) },
    ],
  },
  {
    indicador: "despesa (agosto, competência)",
    unidade: "R$",
    porque: "a cascata do DRE deduz linha a linha; a soma direta é a conferência dela.",
    caminhos: [
      { via: "canônico saidas(competência)", valor: saidas(INPUT, AGOSTO, "competencia").valor },
      { via: "movimentos do DRE (soma)", valor:
        rowsComp.filter((m) => m.type === "saida").reduce((s, m) => s + Math.abs(m.amount), 0) },
    ],
  },
  {
    indicador: "burn mensal",
    unidade: "R$",
    porque: "quatro motores calculam ritmo de queima: risco, score, quantitativo e a camada canônica.",
    caminhos: [
      { via: "canônico burn()", valor: burn(INPUT_QUEIMANDO).valor },
      { via: "risk-engine calcularBurnRate", valor: burnEngine.burnMensal },
      { via: "score de risco", valor: risco.burn.burnMensal },
      { via: "quantitativo", valor: quant.indicadores.burnRate },
      { via: "max(0, −geração de caixa)", valor: Math.max(0, -geracaoCaixaMensal(INPUT_QUEIMANDO).valor) },
    ],
  },
  {
    indicador: "runway",
    unidade: "dias",
    porque: "a unidade era o problema: havia versões em dias, em meses e com teto próprio de 24 meses.",
    caminhos: [
      { via: "canônico runway()", valor: runway(INPUT_QUEIMANDO).valor },
      { via: "risk-engine calcularRunway", valor: calcularRunway(INPUT_QUEIMANDO.saldoAtual, burnEngine).base },
      { via: "score de risco (base)", valor: risco.runway.base },
      { via: "score de risco (runwayDias)", valor: risco.runwayDias },
    ],
  },
  {
    indicador: "runway",
    unidade: "meses",
    porque: "meses é CONVERSÃO (÷30), nunca um segundo cálculo com outro teto.",
    caminhos: [
      { via: "canônico runwayMeses()", valor: runwayMeses(INPUT_QUEIMANDO).valor },
      { via: "quantitativo", valor: quant.indicadores.runwayMeses },
    ],
  },
  {
    indicador: "MRR (com contratos)",
    unidade: "R$",
    porque: "havia QUATRO implementações; a do Investor Update usava outra definição inteira.",
    caminhos: [
      { via: "canônico mrr(contratos)", valor: mrr(INPUT, CONTRATOS).valor },
      { via: "painel de assinaturas", valor: painelAssinaturas(assinaturas, "2026-08", HOJE).mrr },
    ],
  },
  {
    indicador: "MRR (estimado, sem contratos)",
    unidade: "R$",
    porque: "sem contrato cadastrado o número é inferido — e a inferência tem de ser a mesma em toda parte.",
    caminhos: [
      { via: "canônico mrr()", valor: mrr(INPUT).valor },
      { via: "Investor Update", valor: upd.raw.mrrEstimado },
      { via: "KPI do relatório", valor: upd.kpis.find((k) => k.id === "mrr")?.valor ?? Number.NaN },
    ],
  },
  {
    indicador: "ARR",
    unidade: "R$",
    porque: "apurar ARR somando doze meses faz ARR e MRR discordarem em todo mês em que a base mudou.",
    caminhos: [
      { via: "canônico arr()", valor: arr(INPUT).valor },
      { via: "MRR × 12", valor: mrr(INPUT).valor * 12 },
      { via: "KPI do relatório", valor: upd.kpis.find((k) => k.id === "arr")?.valor ?? Number.NaN },
    ],
  },
  {
    indicador: "inadimplência (a receber vencido)",
    unidade: "R$",
    porque: "vencido é fato e alimenta cobrança, score de crédito e o painel — os três precisam do mesmo total.",
    caminhos: [
      { via: "canônico inadimplencia()", valor: inadimplencia(INPUT).valor },
      { via: "painel canônico", valor: painel.inadimplencia.valor },
      { via: "soma direta dos vencidos", valor: DATASET
        .filter((m) => m.type === "entrada" && m.status === "pendente" && m.due_date.slice(0, 10) < HOJE)
        .reduce((s, m) => s + Math.abs(m.amount), 0) },
    ],
  },
];

/* ========================================================================== */
/* A comparação — todas as combinações                                         */
/* ========================================================================== */

/** CENTAVOS INTEIROS. Ver a nota do cabeçalho sobre tolerância. */
const cent = (n: number) => Math.round(n * 100);

let falhas = 0;
let pares = 0;
let caminhosSemPar = 0;

console.log(`\nMATRIZ DE RECONCILIAÇÃO — ${INDICADORES_VERSION}\n`);

for (const linha of MATRIZ) {
  const n = linha.caminhos.length;
  if (n < 2) {
    caminhosSemPar++;
    console.log(`⚠  ${linha.indicador} (${linha.unidade}) — 1 caminho: nada foi reconciliado.`);
    continue;
  }

  const naoNumero = linha.caminhos.filter((c) => !Number.isFinite(c.valor));
  if (naoNumero.length > 0) {
    falhas++;
    console.log(`✗ ${linha.indicador} (${linha.unidade}) — caminho sem número: ${naoNumero.map((c) => c.via).join(", ")}`);
    continue;
  }

  const divergentes: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pares++;
      const a = linha.caminhos[i], b = linha.caminhos[j];
      if (cent(a.valor) !== cent(b.valor)) {
        divergentes.push(
          `${a.via} (${a.valor.toFixed(2)}) ≠ ${b.via} (${b.valor.toFixed(2)}) — Δ ${(a.valor - b.valor).toFixed(2)}`,
        );
      }
    }
  }

  const totalPares = (n * (n - 1)) / 2;
  if (divergentes.length === 0) {
    console.log(`✓ ${linha.indicador} (${linha.unidade}) — ${n} caminhos · ${totalPares} pares · ${linha.caminhos[0].valor.toFixed(2)}`);
  } else {
    falhas += divergentes.length;
    console.log(`✗ ${linha.indicador} (${linha.unidade}) — ${divergentes.length} de ${totalPares} pares divergem:`);
    for (const d of divergentes) console.log(`    ${d}`);
  }
}

const caminhos = MATRIZ.reduce((s, l) => s + l.caminhos.length, 0);
console.log(
  `\n${MATRIZ.length} indicadores · ${caminhos} caminhos · ${pares} pares conferidos`
  + (caminhosSemPar ? ` · ⚠ ${caminhosSemPar} sem par` : ""),
);

if (falhas > 0) {
  console.log(`\n✗ ${falhas} DIVERGÊNCIA(S) — a mesma pergunta com duas respostas.\n`);
  process.exit(1);
}
console.log(`\n✓ TODOS — nenhuma divergência de um centavo entre caminhos.\n`);
