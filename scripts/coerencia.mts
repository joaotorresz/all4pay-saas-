/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O TESTE DE COERÊNCIA — ONDA 4
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As outras guardas conferem se um motor está certo (`smoke`, `values`), se
 * dois caminhos chegam ao mesmo número (`consistencia`, `reconciliacao`) ou se
 * a regra escrita continua valendo. Esta confere uma coisa diferente e mais
 * simples de explicar a quem não escreveu o código: **se a tela pode exibir uma
 * combinação de números que não pode ser verdade ao mesmo tempo.**
 *
 * Nenhuma das cinco é um erro de fórmula. Cada uma é um par de números que,
 * isoladamente, passa em tudo — e que, lado a lado, faz quem lê concluir que o
 * sistema está quebrado. Foi assim que a auditoria as encontrou: olhando a
 * tela, não o código.
 *
 *  1. **O saldo não bate com os lançamentos.** O nível vem das contas e os
 *     lançamentos explicam a VARIAÇÃO — então a variação medida entre dois
 *     instantes tem de ser exatamente o líquido do que foi liquidado entre
 *     eles. Quando não é, ou o extrato mente ou o razão mente, e não há como
 *     saber qual.
 *  2. **Resultado zero com lançamentos no período.** Depois da ONDA 4 isso só
 *     pode acontecer por EMPATE, e o empate tem de ser real.
 *  3. **Runway finito com burn zero.** O caso medido: 33 meses de fôlego sobre
 *     uma queima que não existe — o teto do cálculo saindo como medida.
 *  4. **Ruptura de caixa sem projeção negativa.** Anunciar o dia em que o
 *     dinheiro acaba exige que a projeção tenha um dia negativo. Sem isso o
 *     aviso é sobre nada, e um aviso sobre nada custa a credibilidade dos
 *     avisos que importam.
 *  5. **O DRE não fecha com o balancete.** A cascata é feita de fórmulas sobre
 *     as próprias linhas; se ela não fecha, alguma linha foi contada duas
 *     vezes ou nenhuma.
 *
 * ⚠️ Ela roda sobre VÁRIOS conjuntos, não sobre um. Uma incoerência que só
 * aparece na empresa que queima, ou na que só tem título pendente, é
 * exatamente a que uma fixture única não encontra — e é a que chega ao cliente.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import * as FIXTURE from "./fixture.mts";
import {
  saldo, saldoInicial, resultado, burn, runway, reconciliarSaldo,
  janelaMes, janelaDoMesDe, janelaUltimosDias, janela, previstoNaJanela,
  assinado, liquidado, dataDe, dentro,
  type Janela,
} from "@/core/indicadores";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { dreGerencial } from "@/core/dre/engine";
import { balancete } from "@/lib/ledger";
import { CAIXA, lancamentosDeMovimentos, nomeConta, tipoConta } from "@/core/ledger/chart";
import { DEMO_MOVEMENTS, DEMO_ACCOUNTS } from "@/lib/demo/seed";

const CENTAVO = 0.005;

let fails = 0;
const violacoes: string[] = [];

function exigir(conjunto: string, condicao: string, ok: boolean, detalhe = "") {
  if (ok) return;
  fails++;
  violacoes.push(`  ✗ [${conjunto}] ${condicao}${detalhe ? ` — ${detalhe}` : ""}`);
}

/* ========================================================================== */
/* Os conjuntos                                                                */
/* ========================================================================== */

const { mv, INPUT, INPUT_QUEIMANDO } = FIXTURE;
const HOJE = INPUT.hoje;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ **DUAS FONTES DE "HOJE" — o defeito que derrubou o `main` em 17/08**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O seed da demonstração gera as datas a partir de `new Date()`
 * (`src/lib/demo/seed.ts:56`), então ele ANDA com o calendário. Este conjunto
 * usava `HOJE` da fixture compartilhada, que é uma string CONGELADA
 * (`2026-08-15`). As duas concordaram enquanto o relógio esteve perto da data
 * congelada e divergiram assim que passou dela.
 *
 * Medido em 17/08: os lançamentos que o seed liquidou em 16 e 17/08 já estavam
 * dentro de `saldoAtual` (que sai do `balance` das contas, também gerado
 * relativo a hoje) e ficavam FORA da janela do resultado, que parava em 15/08.
 * Diferença: **R$ 73.448,81**, idêntica nas duas janelas — a assinatura de um
 * corte de data, não de um erro de fórmula.
 *
 * ⚠️ **A guarda estava medindo a diferença entre dois calendários e chamando
 * isso de incoerência do produto.** É a mesma família de "meça com o dado que a
 * superfície usa": o conjunto tem de usar o `hoje` da FONTE que o gerou.
 *
 * ⚠️ E por isso este é o único conjunto com data viva. Os demais saem de
 * `fixture.mts` e continuam congelados de propósito — uma guarda cujo veredito
 * depende do dia em que roda não é guarda. Aqui a data viva não é escolha: é o
 * que o dado exige, porque o seed é o produto que o cliente abre HOJE.
 */
const HOJE_DEMO = new Date().toISOString().slice(0, 10);

/** O seed da demonstração — o que o cliente vê ao abrir o produto pela 1ª vez. */
const demo: RiskInput = {
  hoje: HOJE_DEMO,
  saldoAtual: DEMO_ACCOUNTS.reduce((s, a) => s + (a.balance ?? 0), 0),
  movements: DEMO_MOVEMENTS.map((m) => ({
    id: m.id,
    type: m.type as "entrada" | "saida",
    status: m.status,
    amount: m.amount,
    due_date: m.due_date,
    paid_date: m.paid_date,
    category: m.category ?? null,
    party_id: m.party_id ?? null,
  })) as unknown as RiskMovement[],
} as RiskInput;

const CONJUNTOS: { nome: string; input: RiskInput }[] = [
  { nome: "fixture", input: INPUT },
  { nome: "queimando", input: INPUT_QUEIMANDO },
  { nome: "demonstração", input: demo },
  { nome: "vazio", input: { ...INPUT, movements: [] } },
  {
    nome: "só pendente",
    input: {
      ...INPUT,
      movements: [
        mv("p1", "entrada", "pendente", 40_000, "2026-08-20", null),
        mv("p2", "saida", "pendente", 12_000, "2026-08-22", null),
      ],
    },
  },
  {
    nome: "só cancelado",
    input: {
      ...INPUT,
      movements: [mv("c1", "entrada", "cancelado", 90_000, "2026-08-02", "2026-08-02")],
    },
  },
  {
    nome: "caixa negativo",
    input: {
      ...INPUT, saldoAtual: -31_000,
      movements: [mv("n1", "saida", "pago", 9_000, "2026-07-28", "2026-07-28")],
    },
  },
  {
    nome: "empate exato",
    input: {
      ...INPUT,
      movements: [
        mv("t1", "entrada", "pago", 5_000, "2026-08-04", "2026-08-04"),
        mv("t2", "saida", "pago", 5_000, "2026-08-05", "2026-08-05"),
      ],
    },
  },
  {
    nome: "tudo no futuro",
    input: {
      ...INPUT,
      movements: [mv("f1", "entrada", "pendente", 70_000, "2027-03-10", null)],
    },
  },
];

/* ========================================================================== */
/* 1. O SALDO BATE COM OS LANÇAMENTOS                                          */
/* ========================================================================== */

/**
 * ⚠️ O ENUNCIADO EXATO IMPORTA, e a primeira versão desta guarda estava errada.
 * "Saldo == soma dos lançamentos" é FALSO como regra, por dois motivos:
 *
 *  - o saldo é o NÍVEL reportado pelas contas, e o histórico importado quase
 *    nunca começa no primeiro dia da empresa. O que tem de bater é a VARIAÇÃO
 *    entre dois instantes, não o nível;
 *  - e a variação de uma janela que ATRAVESSA hoje inclui o previsto. Ela
 *    reprovou três dos nove conjuntos por isso, inclusive o seed da
 *    demonstração — e nenhum deles tinha defeito nenhum: eram janelas do mês
 *    corrente, indo até 31/08 com o sistema em 10/08. O comportamento estava
 *    certo e a asserção estava frouxa.
 *
 * Então são DUAS identidades, uma para cada lado de hoje. Cobrar a frouxa faria
 * a guarda reprovar toda empresa real — e uma guarda que reprova o certo é
 * desligada na primeira semana, levando junto o que ela protegia.
 */
function condicao1(nome: string, input: RiskInput) {
  const hoje = input.hoje.slice(0, 10);
  const janelas: Janela[] = [
    janelaDoMesDe(input.hoje),
    janelaUltimosDias(90, input.hoje),
    janelaMes(Number(input.hoje.slice(0, 4)), Number(input.hoje.slice(5, 7)) - 2),
  ];
  for (const j of janelas) {
    const abertura = saldoInicial(input, j);

    // (a) O PASSADO — a janela cortada em hoje. Aqui a variação é exatamente o
    //     líquido do que foi liquidado: nada de previsto entra.
    if (j.de <= hoje) {
      const ate = j.ate < hoje ? j.ate : hoje;
      const jPassado = janela(j.de, ate, j.label);
      const res = resultado(input, jPassado, "caixa");
      const liquido = res.indisponivel ? 0 : res.valor;
      const andou = saldo(input, jPassado).valor - abertura.valor;
      exigir(nome, `saldo × liquidados (${j.label}, até hoje)`,
        Math.abs(andou - liquido) < CENTAVO,
        `o saldo andou ${andou.toFixed(2)} e os liquidados somam ${liquido.toFixed(2)}`);
    }

    // (b) O FUTURO — de hoje até o fim da janela, a variação é exatamente o
    //     previsto que vence no trecho. É a identidade que separa POSIÇÃO de
    //     PROJEÇÃO, e é ela que impede um previsto de virar saldo realizado.
    if (j.ate > hoje) {
      const jFuturo = janela(hoje, j.ate, j.label);
      const entra = previstoNaJanela(input, jFuturo, "entrada").valor;
      const sai = previstoNaJanela(input, jFuturo, "saida").valor;
      const andou = saldo(input, j).valor - saldo(input).valor;
      exigir(nome, `saldo projetado × previstos (${j.label}, de hoje em diante)`,
        Math.abs(andou - (entra - sai)) < CENTAVO,
        `o saldo projeta ${andou.toFixed(2)} e os previstos somam ${(entra - sai).toFixed(2)}`);
    }
  }

  // E a reconciliação nomeia o resto: uma diferença ABSORVIDA é a que ninguém
  // descobre. Se `fecha` é falso, existe resíduo sem explicação.
  const rec = reconciliarSaldo(input);
  exigir(nome, "a reconciliação explica a diferença inteira", rec.fecha,
    `extrato ${rec.extrato.toFixed(2)} × derivado ${rec.derivado.toFixed(2)}`);
  // ⚠️ E o resíduo é NOMEADO, não absorvido: `fecha` verdadeiro exige resíduo
  // zero em reais. Era a terceira contradição da auditoria — R$ 437.983,17
  // rotulados "conciliado", com a conta certa e o resto do resto sem nome.
  exigir(nome, "fechou == resíduo zero, em reais",
    rec.fecha === (Math.abs(rec.residuo) < CENTAVO),
    `fecha=${rec.fecha} e resíduo ${rec.residuo.toFixed(2)}`);
}

/* ========================================================================== */
/* 2. RESULTADO ZERO COM LANÇAMENTOS NO PERÍODO                                */
/* ========================================================================== */

function condicao2(nome: string, input: RiskInput) {
  for (const j of [janelaDoMesDe(input.hoje), janelaUltimosDias(180, input.hoje)]) {
    const res = resultado(input, j, "caixa");
    if (res.indisponivel) {
      // Declarou ausência: então NÃO pode haver lançamento liquidado na janela.
      const dentroDaJanela = input.movements.filter(
        (m) => liquidado(m) && dentro(j, dataDe(m, "caixa")),
      );
      exigir(nome, `ausência declarada sem lançamento (${j.label})`,
        dentroDaJanela.length === 0,
        `${dentroDaJanela.length} liquidado(s) na janela e o indicador diz que não há`);
      continue;
    }
    if (Math.abs(res.valor) >= CENTAVO) continue;
    // Zero COM número: só vale se o empate for real, conferido por fora.
    const rows = input.movements.filter((m) => liquidado(m) && dentro(j, dataDe(m, "caixa")));
    const somaPorFora = rows.reduce((s, m) => s + assinado(m), 0);
    exigir(nome, `resultado zero com lançamentos (${j.label})`,
      rows.length > 0 && Math.abs(somaPorFora) < CENTAVO,
      rows.length === 0
        ? "devolveu 0 com número, sem nenhum lançamento — deveria ser ausência"
        : `os ${rows.length} lançamentos somam ${somaPorFora.toFixed(2)}, não zero`);
  }
}

/* ========================================================================== */
/* 3. RUNWAY FINITO COM BURN ZERO                                              */
/* ========================================================================== */

function condicao3(nome: string, input: RiskInput) {
  const b = burn(input);
  const r = runway(input);
  const semQueima = !!b.indisponivel || b.valor <= 0;
  if (semQueima) {
    exigir(nome, "runway com número apesar de burn zero",
      !!r.indisponivel,
      `burn ${b.indisponivel ? "indisponível" : b.valor.toFixed(2)} e runway ${r.valor}`);
    return;
  }
  // Com queima, o runway TEM de existir — a menos que o caixa já esteja
  // negativo, onde a projeção não se define (e o motivo diz isso).
  if (input.saldoAtual <= 0) {
    exigir(nome, "caixa negativo declara por quê",
      r.indisponivel?.codigo === "caixa_negativo",
      r.indisponivel?.codigo ?? "veio com número");
    return;
  }
  exigir(nome, "há queima e saldo, então há runway", !r.indisponivel,
    r.indisponivel?.motivo ?? "");
}

/* ========================================================================== */
/* 4. RUPTURA SEM PROJEÇÃO NEGATIVA                                            */
/* ========================================================================== */

function condicao4(nome: string, input: RiskInput) {
  const s = scoreRiscoCaixa(input);
  // ⚠️ `rupturaDia` e a projeção são campos do SCORE, não de um sub-objeto
  // `liquidez` — a primeira versão desta condição os leu como
  // `s.liquidez?.rupturaDia` e `s.liquidez?.projecao`, colheu `undefined` nos
  // dois e passou em todos os nove conjuntos. Ela só foi descoberta porque
  // plantar o defeito que ela existe para pegar não a fez falhar. Guarda que
  // não reprova o defeito plantado não é guarda: é a aparência de uma.
  const dia = s.rupturaDia;
  const projecao = s.liquidez;
  const temNegativo = projecao.some((p) => p.saldo < -CENTAVO || p.ruptura);

  if (dia === null || dia === undefined) {
    // Sem ruptura anunciada, a projeção não pode ter dia negativo: seria o
    // defeito na direção oposta — o aviso que deveria existir e não saiu.
    exigir(nome, "projeção negativa sem ruptura anunciada", !temNegativo,
      "há dia com saldo negativo e nenhuma ruptura foi indicada");
    return;
  }
  exigir(nome, "ruptura anunciada sem dia negativo na projeção", temNegativo,
    `ruptura no dia ${dia} e nenhum dos ${projecao.length} dias projetados fica negativo`);
}

/* ========================================================================== */
/* 5. O DRE FECHA                                                              */
/* ========================================================================== */

function condicao5(nome: string, input: RiskInput) {
  const j = janelaUltimosDias(365, input.hoje);
  const rows = input.movements.filter((m) => dentro(j, dataDe(m, "competencia")));
  const g = dreGerencial(rows);

  // ⚠️ A conferência é sobre as LINHAS, não sobre os campos do objeto. Os
  // campos saem todos das mesmas variáveis locais, então compará-los entre si
  // é tautologia — passaria mesmo com a cascata errada. As linhas são o que a
  // tela renderiza e o que o drill-down abre, e é nelas que um lançamento
  // contado duas vezes aparece.
  let acumulado = 0;
  for (const l of g.linhas) {
    if (l.papel === "receita" || l.papel === "deducao") {
      acumulado += l.valor;
      continue;
    }
    exigir(nome, `DRE: "${l.label}" fecha com as linhas acima`,
      Math.abs(l.valor - acumulado) < CENTAVO,
      `linha ${l.valor.toFixed(2)} × acumulado ${acumulado.toFixed(2)}`);
    // O subtotal NÃO reentra na soma: ele É a soma. Reentrar é exatamente a
    // forma de contar tudo duas vezes e ainda ter uma cascata de aparência
    // impecável.
  }

  // ⚠️ E o balancete: a mesma verdade pelo lado contábil. O razão só posta o
  // LIQUIDADO (postar previsto debitaria caixa com dinheiro que não está na
  // conta), então a variação de caixa dele tem de ser o líquido dos
  // liquidados — e débito tem de igualar crédito, que é a invariante que faz
  // dele um razão e não uma lista.
  const entries = lancamentosDeMovimentos(input).map((e) => ({
    id: e.externalKey!, data: e.entryDate, descricao: e.description ?? "",
    origem: e.source ?? "", externalKey: e.externalKey,
    linhas: e.lines.map((l) => ({
      conta: l.accountId, nome: nomeConta(l.accountId), tipo: tipoConta(l.accountId),
      debito: l.debit ?? 0, credito: l.credit ?? 0,
    })),
  }));
  const bal = balancete(entries);
  const totD = bal.reduce((s, c) => s + c.debito, 0);
  const totC = bal.reduce((s, c) => s + c.credito, 0);
  exigir(nome, "balancete: débito == crédito", Math.abs(totD - totC) < CENTAVO,
    `${totD.toFixed(2)} × ${totC.toFixed(2)}`);

  const caixa = bal.find((c) => c.conta === CAIXA);
  const variacao = caixa ? caixa.debito - caixa.credito : 0;
  const liquidoTotal = input.movements.filter(liquidado).reduce((s, m) => s + assinado(m), 0);
  exigir(nome, "balancete × extrato: a variação do caixa é o líquido liquidado",
    Math.abs(variacao - liquidoTotal) < CENTAVO,
    `razão ${variacao.toFixed(2)} × lançamentos ${liquidoTotal.toFixed(2)}`);
}

/* ========================================================================== */

for (const { nome, input } of CONJUNTOS) {
  condicao1(nome, input);
  condicao2(nome, input);
  condicao3(nome, input);
  condicao4(nome, input);
  condicao5(nome, input);
}

if (violacoes.length) console.log(violacoes.join("\n"));
console.log(
  `\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} INCOERÊNCIA(S)`}`
  + ` — 5 condições × ${CONJUNTOS.length} conjuntos`,
);
if (fails > 0) process.exit(1);
