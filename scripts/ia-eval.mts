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
import { responderLocal } from "@/core/assistant/engine";
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

const total = 5 + 3 + 2 + 7 + 8 + 6;
if (falhas > 0) {
  console.log(`\n✗ ${falhas} FALHA(S) — a IA regrediu.\n`);
  process.exit(1);
}
console.log(`✓ TODOS — ${total} casos de avaliação da IA\n`);
