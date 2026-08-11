/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUANDO CADA OBRIGAÇÃO DA FOLHA VENCE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **A folha não tem UMA data, tem quatro** — e é isso que a torna difícil de
 * planejar sem ajuda. O salário sai no 5º dia útil, o FGTS no dia 20, o DARF de
 * INSS/IRRF no dia 20, e o 13º em duas parcelas no fim do ano. Quem tem cinco
 * funcionários tem vinte vencimentos por mês espalhados, e é por isso que a
 * folha é a despesa que mais surpreende o caixa de uma PME.
 *
 * ⚠️ **"5º dia útil" não é "dia 5".** Em março de 2026, o dia 5 é uma
 * quinta-feira mas o 5º dia útil é o dia 5 — em fevereiro de 2026, com o
 * Carnaval, o 5º dia útil pula para o dia 11. Tratar os dois como sinônimos
 * atrasa o salário em uma semana, o que é infração trabalhista, ou o adianta
 * em uma semana, o que estoura o caixa antes da hora.
 *
 * ⚠️ **O FGTS venceu no dia 7 até fevereiro de 2024.** Com o FGTS Digital ele
 * passou para o **dia 20**. Um sistema que ainda usa o dia 7 gera treze dias de
 * folga de caixa que não existem — e a data velha continua "funcionando",
 * porque pagar antes nunca dá erro.
 *
 * Puro, sem I/O e sem relógio. Versão `folha-calendario/1.0.0`.
 */

export const CALENDARIO_VERSION = "folha-calendario/1.0.0";

/* ========================================================================== */
/* Feriados                                                                    */
/* ========================================================================== */

const iso = (a: number, m: number, d: number) =>
  new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10);

/**
 * A Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
 *
 * ⚠️ Ela precisa ser CALCULADA porque três feriados nacionais dependem dela —
 * Carnaval (−47), Sexta-feira Santa (−2) e Corpus Christi (+60) — e os três
 * caem justamente na janela do 5º dia útil de fevereiro, março/abril e junho.
 * Uma lista de feriados fixos deixaria de fora exatamente os que mudam a data
 * do salário.
 */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

const somar = (data: string, n: number) => {
  const [a, m, d] = data.split("-").map(Number);
  return iso(a, m, d + n);
};

/**
 * Os feriados NACIONAIS do ano.
 *
 * ⚠️ Só os nacionais, e isso é uma limitação declarada: feriado municipal
 * (aniversário da cidade, padroeiro) também é dia não útil e muda o 5º dia
 * útil de quem opera naquela cidade. Adivinhar o município a partir do CEP
 * produziria uma data errada com ar de precisa; a saída honesta é o sistema
 * acertar o caso nacional e a pessoa poder corrigir a data do título.
 *
 * ⚠️ **20 de novembro entrou em 2024** (Lei 14.759/2023) e é feriado nacional
 * desde então — antes disso era estadual em parte do país. A lista respeita o
 * ano, senão um recálculo de 2023 pularia um dia útil que existia.
 */
export function feriadosNacionais(ano: number): string[] {
  const p = pascoa(ano);
  const fixos = [
    iso(ano, 1, 1),    // Confraternização Universal
    iso(ano, 4, 21),   // Tiradentes
    iso(ano, 5, 1),    // Dia do Trabalho
    iso(ano, 9, 7),    // Independência
    iso(ano, 10, 12),  // Nossa Senhora Aparecida
    iso(ano, 11, 2),   // Finados
    iso(ano, 11, 15),  // Proclamação da República
    iso(ano, 12, 25),  // Natal
  ];
  if (ano >= 2024) fixos.push(iso(ano, 11, 20)); // Consciência Negra
  return [
    ...fixos,
    somar(p, -48), // segunda de Carnaval
    somar(p, -47), // terça de Carnaval
    somar(p, -2),  // Sexta-feira Santa
    somar(p, 60),  // Corpus Christi
  ].sort();
}

const diaDaSemana = (data: string) => {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** Sábado, domingo ou feriado nacional. */
export function ehDiaUtil(data: string, feriados?: Set<string>): boolean {
  const dow = diaDaSemana(data);
  if (dow === 0 || dow === 6) return false;
  const f = feriados ?? new Set(feriadosNacionais(Number(data.slice(0, 4))));
  return !f.has(data);
}

/* ========================================================================== */
/* As datas                                                                    */
/* ========================================================================== */

/**
 * O N-ésimo dia útil de uma competência "YYYY-MM".
 *
 * ⚠️ A contagem começa no dia 1º e só conta dia útil. O 5º dia útil de um mês
 * que começa numa sexta-feira cai no dia 7; de um mês que começa numa
 * segunda, no dia 5.
 */
export function diaUtilDoMes(competencia: string, n: number): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const feriados = new Set(feriadosNacionais(ano));
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  let contados = 0;
  for (let d = 1; d <= ultimo; d++) {
    const data = iso(ano, mes, d);
    if (!ehDiaUtil(data, feriados)) continue;
    contados++;
    if (contados === n) return data;
  }
  // Mês sem N dias úteis não existe no calendário brasileiro, mas devolver o
  // último dia útil é melhor que devolver vazio e derrubar quem chamou.
  for (let d = ultimo; d >= 1; d--) {
    const data = iso(ano, mes, d);
    if (ehDiaUtil(data, feriados)) return data;
  }
  return iso(ano, mes, ultimo);
}

/**
 * Antecipa para o dia útil ANTERIOR quando a data cai em fim de semana ou
 * feriado.
 *
 * ⚠️ Antecipa, nunca posterga: tributo pago depois do vencimento tem multa e
 * juros. É a regra do DARF e do FGTS, e é o oposto do que a intuição sugere
 * (empurrar para a segunda-feira).
 */
export function anteciparParaDiaUtil(data: string): string {
  const feriados = new Set([
    ...feriadosNacionais(Number(data.slice(0, 4))),
    ...feriadosNacionais(Number(data.slice(0, 4)) - 1),
  ]);
  let d = data;
  // 10 tentativas cobrem qualquer emenda de feriado que exista.
  for (let i = 0; i < 10 && !ehDiaUtil(d, feriados); i++) d = somar(d, -1);
  return d;
}

/** O mês seguinte a uma competência "YYYY-MM". */
export const mesSeguinte = (competencia: string): string => {
  const [a, m] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Dia N de uma competência, antecipado quando não é útil. */
export function diaDoMes(competencia: string, dia: number): string {
  const [a, m] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return anteciparParaDiaUtil(iso(a, m, Math.min(dia, ultimo)));
}

/* ========================================================================== */
/* As quatro datas da folha                                                    */
/* ========================================================================== */

/** O salário da competência X vence no 5º dia útil de X+1 (art. 459 da CLT). */
export const vencimentoSalario = (competencia: string) =>
  diaUtilDoMes(mesSeguinte(competencia), 5);

/**
 * FGTS: dia 20 do mês seguinte.
 *
 * ⚠️ Era dia 7 até a competência 02/2024; o FGTS Digital mudou para o dia 20.
 * A data antiga fica registrada porque um recálculo retroativo precisa dela —
 * e porque "sempre foi dia 20" é o tipo de simplificação que faz o sistema
 * errar exatamente nos meses que alguém vai conferir.
 */
export const vencimentoFGTS = (competencia: string) =>
  competencia < "2024-03"
    ? diaDoMes(mesSeguinte(competencia), 7)
    : diaDoMes(mesSeguinte(competencia), 20);

/** INSS e IRRF retidos: DARF no dia 20 do mês seguinte. */
export const vencimentoDARF = (competencia: string) =>
  diaDoMes(mesSeguinte(competencia), 20);

/**
 * As duas parcelas do 13º.
 *
 * ⚠️ A primeira vence em **30 de novembro** e a segunda em **20 de dezembro**,
 * e as duas são do mesmo ano da competência — não do mês seguinte. Um 13º
 * tratado como "mais um salário em dezembro" concentra numa data o que a lei
 * divide em duas, e a primeira parcela pega o caixa de novembro de surpresa.
 */
export const vencimentoDecimo = (ano: number): { primeira: string; segunda: string } => ({
  primeira: anteciparParaDiaUtil(iso(ano, 11, 30)),
  segunda: anteciparParaDiaUtil(iso(ano, 12, 20)),
});
