/**
 * ia-eval — O CONJUNTO DE AVALIAÇÃO DA IA, com casos conhecidos.
 *
 *   npm run ia-eval   (dentro de npm test e do CI)
 *
 * ⚠️ **Por que ele existe separado do corpus e do values.** O corpus garante que
 * a pergunta chega ao intent certo; o `values` garante que a fórmula acerta o
 * número. Nenhum dos dois cobre o que a ONDA 14 cobra: que a RESPOSTA, como ela
 * chega ao usuário, continue confiável quando alguém mexe no prompt ou troca o
 * modelo — e essas duas mudanças não tocam em nenhuma fórmula, então passam
 * pelas outras guardas sem serem notadas.
 *
 * O que cada caso fixa:
 *   · o número citado bate com a camada canônica (não com uma conta paralela);
 *   · a resposta cita a FONTE, para o usuário poder conferir;
 *   · projeção não é afirmada como fato;
 *   · a confiança vem com critério, não solta.
 *
 * Determinístico: a fixture compartilhada, sem rede e sem relógio.
 */
import { INPUT, INPUT_QUEIMANDO, HOJE } from "./fixture.mts";
import { responderLocal, graficoDoCatalogo, GRAFICOS_DA_IA, janela } from "@/core/assistant/engine";
import { perguntaComPeriodoNovo, ehSeguimentoDePeriodo } from "@/core/assistant/seguimento";
import { acoesParaVazio, dataDoPeriodo, acoesDasTelas, acoesDeSeguimento, TELAS_DA_IA } from "@/core/assistant/acoes";
import { perguntaComAssuntoNovo } from "@/core/assistant/seguimento";
import { INVENTARIO } from "@/core/rotas/inventario";
import { destinoDe } from "@/core/rotas/aliases";
import { numerosInventados } from "@/core/assistant/redacao";
import { buscarKB } from "@/lib/assistant-kb";
import { interpretarLancamento } from "@/core/assistant/lancamento-falado";
import { explicarTermos, termosNoTexto } from "@/core/assistant/termos";
import {
  saldo, entradas, saidas, resultado, runway, burn, inadimplencia,
  janelaHoje, janelaMes, janelaUltimosDias,
} from "@/core/indicadores";
import { calcularConfianca, rotuloConfianca } from "@/core/ia/confianca";
import { ponteRupturaRunway, contradicoesSemPonte, frasePonte } from "@/core/ia/coerencia";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (!cond) { falhas++; console.log(`✗ ${nome}${det ? ` — ${det}` : ""}`); }
};
const cent = (n: number) => Math.round(n * 100);
/**
 * Extrai os valores em reais citados no texto da resposta.
 *
 * ⚠️ Os centavos são OPCIONAIS. A primeira versão deste extrator exigia
 * `,\d{2}` e não achava nada — a IA escreve "R$ 42.000", sem centavos, quando
 * o valor é redondo. O teste acusava a IA de citar número fora do canônico
 * quando quem estava errado era ele; um teste que reprova o certo é pior que
 * teste nenhum, porque manda consertar o que funciona.
 */
const reaisNoTexto = (t: string): number[] =>
  [...t.matchAll(/R\$\s?([\d.]+(?:,\d{2})?)/g)]
    .map((m) => Number(m[1].replace(/\./g, "").replace(",", ".")));

console.log("\nAVALIAÇÃO DA IA — casos conhecidos\n");

/* ═══ 1. TODO NÚMERO CITADO SAI DA CAMADA CANÔNICA ═══════════════════════════
   ⚠️ É o critério central da onda: nenhum número citado pela IA sem origem
   conferível. Se a resposta cita um valor que a camada canônica não produz, há
   uma segunda conta no sistema — e a segunda conta é a que diverge amanhã. */
{
  const casos: { pergunta: string; esperado: number }[] = [
    { pergunta: "qual meu saldo?", esperado: saldo(INPUT, janelaHoje(HOJE)).valor },
    { pergunta: "quanto recebi este mês?", esperado: entradas(INPUT, janelaMes(2026, 7)).valor },
    { pergunta: "quanto gastei este mês?", esperado: saidas(INPUT, janelaMes(2026, 7)).valor },
    { pergunta: "qual meu resultado do mês?", esperado: resultado(INPUT, janelaMes(2026, 7)).valor },
    { pergunta: "quanto tenho em atraso?", esperado: inadimplencia(INPUT).valor },
  ];
  for (const c of casos) {
    const r = responderLocal(c.pergunta, INPUT);
    const citados = reaisNoTexto(r?.resposta ?? "");
    ok(`número citado sai do canônico: "${c.pergunta}"`,
       citados.some((v) => cent(v) === cent(c.esperado)),
       `esperado ${c.esperado.toFixed(2)}, citados [${citados.map((v) => v.toFixed(2)).join(", ")}]`);
  }
}

/* ═══ 2. A RESPOSTA DIZ DE ONDE VEIO ════════════════════════════════════════ */
{
  for (const p of ["qual meu saldo?", "quanto gastei este mês?", "qual meu runway?"]) {
    const r = responderLocal(p, INPUT);
    ok(`a resposta cita a fonte: "${p}"`,
       Array.isArray(r?.fontes) && r.fontes.length > 0,
       JSON.stringify(r?.fontes));
  }
}

/* ═══ 3. PROJEÇÃO NÃO É AFIRMADA COMO FATO ══════════════════════════════════
   ⚠️ "O runway é de 4 meses" não é verdade — SERIA, se o ritmo continuasse. A
   frase assertiva é a que vira decisão, porque quem lê "é" não confere a base. */
{
  const r = responderLocal("qual meu runway?", INPUT_QUEIMANDO);
  const t = r?.resposta ?? "";
  ok("runway é dito no condicional", /seria|cobriria|no ritmo atual/i.test(t), t.slice(0, 90));
  ok("runway não é afirmado como fato", !/\bO runway é de\b/.test(t), t.slice(0, 90));
}

/* ═══ 4. A CONFIANÇA TEM CRITÉRIO ═══════════════════════════════════════════ */
{
  const alta = calcularConfianca({ lancamentos: 120, diasDesdeODado: 5, natureza: "fato", cobertura: 1 });
  const baixa = calcularConfianca({ lancamentos: 2, diasDesdeODado: 200, natureza: "projecao", cobertura: 0.5 });
  ok("fato recente e volumoso tem confiança alta", alta.nivel === "alta", rotuloConfianca(alta));
  ok("projeção rasa e velha tem confiança baixa", baixa.nivel === "baixa", rotuloConfianca(baixa));
  // ⚠️ Todo fator explica o próprio valor. Sem a frase, o fator não existe.
  ok("todo fator traz o porquê", alta.fatores.every((f) => f.porque.length > 8));
  ok("os pesos somam 1", cent(alta.fatores.reduce((s, f) => s + f.peso, 0)) === 100);
  ok("o resumo aponta o que limita", baixa.resumo.includes("limita"), baixa.resumo);
  // ⚠️ Nenhuma quantidade de dado transforma projeção em fato.
  const projecaoRica = calcularConfianca({ lancamentos: 5000, diasDesdeODado: 1, natureza: "projecao", cobertura: 1 });
  const fatoPobre = calcularConfianca({ lancamentos: 30, diasDesdeODado: 20, natureza: "fato", cobertura: 1 });
  ok("projeção farta não supera fato modesto", projecaoRica.valor < fatoPobre.valor,
     `${projecaoRica.valor.toFixed(2)} vs ${fatoPobre.valor.toFixed(2)}`);
}

/* ═══ 5. NADA DE NARRATIVAS QUE SE CONTRADIZEM ══════════════════════════════
   O caso que a auditoria nomeou: "ruptura em zero dias" ao lado de "runway de
   vinte e quatro meses". */
{
  // Empresa que gera caixa (runway no teto) e tem título grande vencendo já.
  const ponte = ponteRupturaRunway(INPUT, 2);
  ok("a contradição aparente é detectada", ponte.pareceContradicao,
     `runway ${ponte.runway.valor}m, ruptura ${ponte.ruptura.valor}d`);
  ok("e vem com a frase que reconcilia", ponte.explicacao.length > 60);
  ok("a explicação diz o que FAZER", /antecipar|adiar/i.test(ponte.explicacao));
  ok("cada leitura declara o que mede", !!ponte.ruptura.mede && !!ponte.runway.mede);
  // ⚠️ E o que ela NÃO enxerga — é esta metade que costuma faltar.
  ok("cada leitura declara o seu ponto cego",
     !!ponte.ruptura.naoEnxerga && !!ponte.runway.naoEnxerga);
  // Sem ruptura no horizonte não há contradição a explicar.
  ok("sem ruptura, nada a reconciliar", !ponteRupturaRunway(INPUT, null).pareceContradicao);
  // ⚠️ `null` NÃO é zero: tratar ausência de ruptura como "ruptura no dia zero"
  // é, muito provavelmente, como o "zero dias" apareceu na tela.
  ok("ausência de ruptura não vira ruptura no dia zero",
     !ponteRupturaRunway(INPUT, null).ruptura.existe);

  const semPonte = contradicoesSemPonte([
    { id: "alerta", texto: "Ruptura de caixa projetada em 0 dias.", cita: ["ruptura"] },
    { id: "saude", texto: "Runway de 24 meses.", cita: ["runway"] },
  ]);
  ok("duas frases opostas sem ponte são acusadas", semPonte.length === 1, JSON.stringify(semPonte));
  const comPonte = contradicoesSemPonte([
    { id: "alerta", texto: "Ruptura de caixa projetada em 0 dias.", cita: ["ruptura"] },
    { id: "saude", texto: "Runway de 24 meses.", cita: ["runway"] },
    { id: "ponte", texto: frasePonte(0, 24, 720), cita: ["ruptura", "runway"] },
  ]);
  ok("com a ponte, não há acusação", comPonte.length === 0);
}

/* ═══ 6. REGRESSÃO DE VALORES CONHECIDOS ════════════════════════════════════
   Casos com resposta fechada: se um deles mudar, alguém mexeu no motor sem
   perceber — e é isto que a troca de prompt ou de modelo não pode alterar. */
{
  const conhecidos: [string, number][] = [
    ["saldo de hoje", saldo(INPUT, janelaHoje(HOJE)).valor],
    ["entradas de agosto", entradas(INPUT, janelaMes(2026, 7)).valor],
    ["saídas de agosto", saidas(INPUT, janelaMes(2026, 7)).valor],
    ["inadimplência", inadimplencia(INPUT).valor],
    ["burn (empresa que queima)", burn(INPUT_QUEIMANDO, janelaUltimosDias(90, HOJE)).valor],
    ["runway em dias (empresa que queima)", runway(INPUT_QUEIMANDO).valor],
  ];
  const ESPERADO: Record<string, number> = {
    "saldo de hoje": 42_000,
    "entradas de agosto": 61_400,
    "saídas de agosto": 6_000,
    "inadimplência": 4_400,
    "burn (empresa que queima)": 21_583.33,
    "runway em dias (empresa que queima)": 125,
  };
  for (const [nome, valor] of conhecidos) {
    ok(`valor conhecido: ${nome}`, cent(valor) === cent(ESPERADO[nome]),
       `${valor.toFixed(2)} ≠ ${ESPERADO[nome].toFixed(2)}`);
  }
}

// ── 7. A REDAÇÃO pela IA não troca número (16/10/2026) ───────────────────
// O motor calcula, o Claude reescreve no tom curto com negrito. A trava tem
// de aceitar o mesmo número em outra moldura e RECUSAR o abreviado e o novo.
{
  const base = ["A despesa de julho soma R$ 38.420,50, 12,4% acima de junho.", "Marketing R$ 9.800"];
  ok("redação: mesmos números com negrito passam",
     numerosInventados("Você gastou **R$ 38.420,50** em julho, **12,4%** a mais. Marketing: **R$ 9.800**.", base).length === 0);
  ok("redação: número abreviado (\"38 mil\") é recusado",
     numerosInventados("Você gastou **R$ 38 mil**.", base).length > 0);
  ok("redação: número que o motor não calculou é recusado",
     numerosInventados("A despesa subiu **15%**.", base).length > 0);
  ok("gráfico da IA: id fora do catálogo não vira gráfico", graficoDoCatalogo("inventado", INPUT) === undefined);
  ok("gráfico da IA: todo id do catálogo devolve dados do sistema",
     Object.keys(GRAFICOS_DA_IA).every((id) => { const g = graficoDoCatalogo(id, INPUT); return !g || g.dados.length >= 2; }));
}

// ═══ RECORTES DE TEMPO E SEGUIMENTO (19/10/2026) ═══
// "Meu fluxo de caixa dos últimos 3 meses" e depois "e só a última semana?":
// a segunda caía na IA genérica, sem recorte. E "última semana", "semana
// passada" e "últimos três meses" (por extenso) liam todos o período errado.
{
  const j = (p: string) => { const w = janela(p, HOJE); return `${w.from}..${w.to}`; };
  ok("janela: \"última semana\" = 7 dias até hoje", j("quanto gastei na última semana") === "2026-08-09..2026-08-15", j("quanto gastei na última semana"));
  ok("janela: \"semana passada\" = segunda a domingo anteriores", j("quanto gastei semana passada") === "2026-08-03..2026-08-09", j("quanto gastei semana passada"));
  ok("janela: \"três meses\" por extenso = 3 meses", j("gastos dos últimos três meses") === "2026-06-01..2026-08-15", j("gastos dos últimos três meses"));
  ok("janela: \"últimos 12 meses\" é rolante, não o ano", j("receita dos últimos 12 meses") === "2025-09-01..2026-08-15", j("receita dos últimos 12 meses"));

  const r3 = responderLocal("fluxo de caixa dos últimos 3 meses", INPUT);
  ok("fluxo de caixa com período responde no motor", !!r3 && /últimos 3 meses/.test(r3.resposta), r3?.resposta);

  ok("seguimento: frase só de período é seguimento", ehSeguimentoDePeriodo("e só a última semana?") && ehSeguimentoDePeriodo("agora um recorte da última semana"));
  ok("seguimento: pergunta com assunto próprio NÃO herda", !ehSeguimentoDePeriodo("quanto recebi na última semana?"));
  const c = perguntaComPeriodoNovo("meu fluxo de caixa dos últimos 3 meses", "e só a última semana?");
  const rc = c ? responderLocal(c, INPUT) : null;
  ok("seguimento: herda o assunto e troca o período", !!rc && /últimos 7 dias/.test(rc.resposta) && !/3 meses/.test(rc.resposta), `${c} → ${rc?.resposta}`);
  // O número do recorte é o da janela nova, não o do período anterior.
  const rs = responderLocal("meu fluxo de caixa da última semana", INPUT);
  ok("seguimento: mesmo número da pergunta escrita inteira", !!rc && !!rs && rc.resposta === rs.resposta);

  // Resposta vazia leva ação; resposta com número não.
  const vazia = responderLocal("quanto gastei em dezembro", INPUT);
  ok("vazio: \"não há\" no lugar de R$ 0,00", !!vazia && /^Não há gastos/.test(vazia.resposta), vazia?.resposta);
  ok("vazio: traz o botão de lançar despesa NO período", !!vazia?.acoes?.some((a) => a.rota === "/dashboard/financial/payables/new?vencimento=2025-12-31"), JSON.stringify(vazia?.acoes));
  ok("vazio: traz o caminho de enviar extrato", !!vazia?.acoes?.some((a) => a.rota.startsWith("/upload")));
  const cheia = responderLocal("quanto gastei nos últimos 3 meses", INPUT);
  ok("cheia: resposta com número não ganha ação de vazio", !!cheia && !cheia.acoes?.some((a) => a.rota.includes("/new?")), JSON.stringify(cheia?.acoes));
  ok("vazio: lado da receita lança receita", acoesParaVazio("quanto recebi", { from: "2026-03-01", to: "2026-03-31" }, HOJE)[0].rota.includes("/receivables/new"));
  ok("data do período: passado = último dia, corrente = hoje, futuro = primeiro dia",
     dataDoPeriodo({ from: "2026-03-01", to: "2026-03-31" }, HOJE) === "2026-03-31"
     && dataDoPeriodo({ from: "2026-08-01", to: "2026-08-31" }, HOJE) === HOJE
     && dataDoPeriodo({ from: "2026-09-01", to: "2026-09-30" }, HOJE) === "2026-09-01");
}

// ═══ PRÓXIMO PASSO E MAPA DAS TELAS (19/10/2026) ═══
// Toda resposta com número leva à tela onde se age sobre ele; o Claude indica
// telas por id, e id inventado não vira botão.
{
  const cheia = responderLocal("quanto gastei nos últimos 3 meses", INPUT);
  ok("próximo passo: gasto leva a contas a pagar", !!cheia?.acoes?.some((a) => a.rota === "/contas-a-pagar/painel-de-despesas"), JSON.stringify(cheia?.acoes));
  const venc = acoesDeSeguimento("quem está me devendo?", ["recebíveis vencidos"]);
  ok("próximo passo: vencido de cliente leva a cobrar", venc[0]?.rota === "/dashboard/financial/overdue", JSON.stringify(venc));
  ok("próximo passo: calculadora não leva a tela de dados", acoesDeSeguimento("2% ao mês quanto dá ao ano", ["conversão de taxa"]).length === 0);
  ok("próximo passo: no máximo dois botões", acoesDeSeguimento("saldo, receita, gastos, margem e vencidos", []).length <= 2);
  ok("telas: id inventado ou repetido não vira botão", acoesDasTelas(["dre", "inventada", "dre", 7]).length === 1);
  // Toda tela do mapa existe no inventário e não é um desvio (308) de outra.
  const vivas = new Set(INVENTARIO.map((r) => r.rota));
  const mortas = Object.values(TELAS_DA_IA).map((t) => t.rota).filter((r) => !vivas.has(r.split("?")[0]) || destinoDe(r) !== null);
  ok("telas: toda rota do mapa existe e não é alias", mortas.length === 0, mortas.join(", "));

  const a = perguntaComAssuntoNovo("quanto gastei na semana passada?", "e as receitas?");
  const ra = a ? responderLocal(a, INPUT) : null;
  ok("seguimento de assunto: herda o período, troca o assunto", !!ra && /receb|receit/i.test(ra.resposta), `${a} → ${ra?.resposta}`);
  ok("seguimento de assunto: frase com período próprio não herda", perguntaComAssuntoNovo("quanto gastei na semana passada?", "e as receitas de março?") === null);
}

// ═══ LANÇAMENTO PELA CONVERSA (19/10/2026, decisão do dono) ═══
// "Gastei 100 de gasolina" (falado ou digitado) vira PROPOSTA; gravar é só no
// "Confirmar". O que se cobra aqui é a LEITURA: valor, lado, data e categoria —
// e que pergunta nenhuma vire lançamento.
{
  const somaDias = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const g = interpretarLancamento("Gastei R$ 25, 25 não, vai, R$ 100 com gasolina, combustível", HOJE);
  ok("lançamento falado: a correção falada vale (100, não 25), em Combustível", g?.valor === 100 && g.categoria === "Combustível" && g.tipo === "saida" && g.pago, JSON.stringify(g));
  const l = interpretarLancamento("paguei 350 de luz ontem", HOJE);
  ok("lançamento falado: 'ontem' e a conta de luz", l?.valor === 350 && l.data === somaDias(HOJE, -1) && l.categoria === "Utilidades", JSON.stringify(l));
  const a = interpretarLancamento("vou pagar o aluguel de 2.500 dia 10", HOJE);
  ok("lançamento falado: compromisso fica a pagar, no próximo dia 10", a?.valor === 2500 && !a.pago && a.data > HOJE && a.data.endsWith("-10") && a.categoria === "Aluguel", JSON.stringify(a));
  const m = interpretarLancamento("comprei 2,5 mil em insumos", HOJE);
  ok("lançamento falado: '2,5 mil' é 2500", m?.valor === 2500, JSON.stringify(m));
  const r = interpretarLancamento("recebi 1.200 do cliente Alpha", HOJE);
  ok("lançamento falado: recebi é entrada", r?.tipo === "entrada" && r.valor === 1200, JSON.stringify(r));
  const perguntas = ["quanto gastei de gasolina?", "quanto gastei nos últimos 3 meses", "qual meu saldo", "posso comprar um carro de 150 mil em 48x?", "quanto recebi em maio", "paguei mais em maio ou junho?"];
  const capturadas = perguntas.filter((q) => interpretarLancamento(q, HOJE) !== null);
  ok("lançamento falado: pergunta nunca vira lançamento", capturadas.length === 0, capturadas.join(" | "));
  ok("lançamento falado: sem valor não há proposta", interpretarLancamento("gastei com gasolina", HOJE) === null);
}

// ═══ CORRELAÇÃO: a pergunta recorta, a resposta LISTA (20/10/2026) ═══
// "quais são as contas que tenho para pagar nessa semana" devolvia o total da
// carteira inteira, sem a semana e sem as contas; reescrito pelo Claude, virava
// "não tenho acesso". O recorte (período, contraparte, lista) é do motor.
{
  const sem = responderLocal("quais são as contas que tenho para pagar nessa semana", INPUT);
  ok("recorte: a pagar da semana diz a semana e o vencido à parte", !!sem && /semana/i.test(sem.resposta) && /2\.400,00/.test(sem.resposta) && /vencid/i.test(sem.resposta), sem?.resposta);
  const mes = responderLocal("o que tenho para receber este mês", INPUT);
  ok("recorte: a receber do mês lista cada título com a contraparte", !!mes && /18\.000,00/.test(mes.resposta) && /- 14\/08 · Gama/.test(mes.resposta) && /- 20\/08 · Alpha/.test(mes.resposta), mes?.resposta);
  const bol = responderLocal("quais boletos vencem este mês", INPUT);
  ok("recorte: 'quais boletos vencem' é a lista, não o verbete", !!bol && /- 01\/08 · Forn/.test(bol.resposta), bol?.resposta);
  const lan = responderLocal("me mostra os lançamentos de hoje", INPUT);
  ok("extrato na conversa: os lançamentos de hoje, nomeados", !!lan && /7\.000,00/.test(lan.resposta) && /Delta/.test(lan.resposta), lan?.resposta);
  const contas = responderLocal("qual o saldo de cada conta", { ...INPUT, contasSaldo: [{ id: "x", nome: "Itaú", saldo: 1000 }, { id: "y", nome: "Inter", saldo: 500 }] });
  ok("saldo por conta: cada conta com o seu saldo", !!contas && /- Itaú · R\$\s?1\.000,00/.test(contas.resposta) && /- Inter/.test(contas.resposta), contas?.resposta);
  const fixo = responderLocal("quais despesas fixas eu tenho", INPUT);
  ok("KB: pergunta sobre os dados não cai no verbete", buscarKB("quais boletos vencem essa semana") === null && buscarKB("o que é boleto?") !== null);
  ok("custo fixo: sem histórico não afirma custo fixo, diz por quê", !!fixo && /custo fixo/i.test(fixo.resposta) && !/custo fixo mensal estimado é R\$\s?0/.test(fixo.resposta), fixo?.resposta);
}

// ═══ TOM HUMANO: o jargão vem explicado (20/10/2026) ═══
// O dono nem sempre sabe o que é runway ou EBITDA. A resposta do motor ganha,
// no fim, a explicação curta de até dois termos, sem número nenhum novo.
{
  const r = explicarTermos("Seu runway é de **4 meses** e o EBITDA ficou em R$ 10.000,00. A margem caiu.");
  ok("termos: explica o runway e o EBITDA, nessa ordem", /Para entender: \*\*Runway\*\*.*\*\*EBITDA\*\*/.test(r), r);
  ok("termos: no máximo dois termos explicados", !/\*\*Margem\*\*/.test(r), r);
  ok("termos: a explicação não traz número novo", numerosInventados(r, ["Seu runway é de 4 meses e o EBITDA ficou em R$ 10.000,00."]).length === 0, r);
  ok("termos: texto sem jargão volta igual", explicarTermos("Hoje entraram R$ 7.000,00.") === "Hoje entraram R$ 7.000,00.");
  ok("termos: termo já explicado no texto não repete", termosNoTexto("O runway (por quanto tempo o caixa aguenta) é de 4 meses.").length === 0);
  const inad = responderLocal("qual meu runway", INPUT);
  ok("termos: resposta real do motor ganha a explicação", !!inad && /Para entender: \*\*Runway/.test(explicarTermos(inad.resposta)), inad?.resposta);
}

const total = 5 + 3 + 2 + 7 + 8 + 6 + 5 + 15 + 8 + 7 + 7 + 6;
if (falhas > 0) {
  console.log(`\n✗ ${falhas} FALHA(S) — a IA regrediu.\n`);
  process.exit(1);
}
console.log(`✓ TODOS — ${total} casos de avaliação da IA\n`);
