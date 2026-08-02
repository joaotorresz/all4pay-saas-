/**
 * A LINHA DIGITÁVEL SE EXPLICA SOZINHA.
 *
 * O DDA depende de integração bancária, mas o boleto em si não depende de
 * ninguém: os 47 dígitos que o fornecedor manda carregam o banco emissor, o
 * valor e a data de vencimento, e trazem quatro dígitos verificadores que
 * provam que o número não foi digitado errado. Ler isso é aritmética — e é o
 * que faz a tela de Boletos Recebidos funcionar antes de existir integração.
 *
 * Puro, sem dependência. Layout FEBRABAN (título bancário) + detecção de
 * arrecadação/concessionária.
 */

const so = (s: string) => (s ?? "").replace(/\D/g, "");

export type TipoBoleto = "bancario" | "arrecadacao";

export interface BoletoLido {
  tipo: TipoBoleto;
  linhaDigitavel: string;
  codigoBarras: string;
  banco: string;
  /** Nome do banco quando conhecido — o código é o que manda. */
  bancoNome: string | null;
  valor: number;
  /** ISO (aaaa-mm-dd) ou null: fator 0000 = boleto sem vencimento definido. */
  vencimento: string | null;
  /** Todos os dígitos verificadores conferem. */
  valido: boolean;
  /** Por que não confere — vazio quando `valido`. */
  problemas: string[];
}

/* ------------------------------ verificadores ------------------------------ */

/** DV de campo da linha digitável: módulo 10 (dobra alternada, soma os dígitos). */
export function dvModulo10(campo: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = campo.length - 1; i >= 0; i--) {
    const p = Number(campo[i]) * peso;
    soma += p > 9 ? p - 9 : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/**
 * DV geral do código de barras: módulo 11 com pesos 2..9 da direita para a
 * esquerda. Resto 0, 1 ou 10 vira 1 — a regra da FEBRABAN, não um arredondamento:
 * o dígito precisa caber numa casa só.
 */
export function dvModulo11(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/* --------------------------- fator de vencimento --------------------------- */

const BASE_FATOR = Date.UTC(1997, 9, 7); // 07/10/1997 = fator 1000
const DIA = 86_400_000;

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Converte o fator de vencimento em data.
 *
 * ⚠️ O fator tem 4 dígitos e por isso ACABA. Em 21/02/2025 chegou a 9999 e a
 * FEBRABAN o reiniciou em 1000 — ou seja, o mesmo fator representa duas datas
 * separadas por 9000 dias. Sem tratar o ciclo, todo boleto emitido de 2025 em
 * diante é lido com data de 2000-e-poucos e cai como "vencido há 20 anos".
 *
 * A desambiguação é por janela: se a data do ciclo antigo está a mais de três
 * anos no passado, o boleto é do ciclo novo. Um título de fato vencido há mais
 * de três anos fica indistinguível — e nesse empate a leitura recente é a
 * menos danosa, porque boleto em circulação é boleto recente.
 */
export function dataDoFator(fator: number, hojeISO?: string): string | null {
  if (!Number.isFinite(fator) || fator <= 0) return null;
  const hoje = hojeISO ? Date.parse(`${hojeISO}T00:00:00Z`) : Date.now();
  let ms = BASE_FATOR + fator * DIA;
  while (hoje - ms > 3 * 365 * DIA) ms += 9000 * DIA;
  return iso(ms);
}

/**
 * O inverso — usado para gerar linha digitável no seed e nos testes.
 *
 * ⚠️ Devolve o fator DO CICLO CORRENTE, sempre em quatro dígitos. A contagem
 * crua desde 1997 já passou de 9999 (uma data de 2026 dá ~10.545), e um fator
 * de cinco dígitos não cabe no código de barras: ele empurraria todo o campo
 * livre uma casa e produziria um boleto de 45 dígitos que nenhum banco lê.
 */
export function fatorDaData(dataISO: string): number {
  let f = Math.round((Date.parse(`${dataISO}T00:00:00Z`) - BASE_FATOR) / DIA);
  while (f > 9999) f -= 9000;
  return f;
}

/* --------------------------------- bancos --------------------------------- */

const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil", "033": "Santander", "041": "Banrisul",
  "070": "BRB", "077": "Inter", "104": "Caixa Econômica Federal",
  "197": "Stone", "208": "BTG Pactual", "212": "Banco Original",
  "237": "Bradesco", "260": "Nubank", "290": "PagBank",
  "323": "Mercado Pago", "336": "C6 Bank", "341": "Itaú",
  "380": "PicPay", "422": "Safra", "745": "Citibank", "748": "Sicredi",
  "756": "Sicoob",
};

export const nomeDoBanco = (codigo: string): string | null => BANCOS[codigo] ?? null;

/* --------------------------------- leitura --------------------------------- */

/**
 * Reconstrói o código de barras (44) a partir da linha digitável (47).
 *
 * A linha NÃO é o código de barras com pontinhos: ela reordena os campos e
 * intercala quatro dígitos verificadores que o código de barras não tem. Por
 * isso a montagem é posicional, e não um `replace` de separadores.
 */
export function codigoDeBarrasDaLinha(linha47: string): string {
  return (
    linha47.slice(0, 4) +   // banco (3) + moeda (1)      → posições 1-4
    linha47[32] +           // DV geral                    → posição 5
    linha47.slice(33, 47) + // fator (4) + valor (10)      → posições 6-19
    linha47.slice(4, 9) +   // campo livre                 → posições 20-24
    linha47.slice(10, 20) + //                             → posições 25-34
    linha47.slice(21, 31)   //                             → posições 35-44
  );
}

/**
 * Lê uma linha digitável (47 dígitos) ou um código de barras (44).
 *
 * Devolve o que conseguiu ler MESMO quando um DV falha — o operador precisa ver
 * o valor e a data para saber se digitou errado. `valido` e `problemas` contam
 * a verdade; quem decide o que fazer com um boleto suspeito é a tela.
 */
export function lerBoleto(entrada: string, hojeISO?: string): BoletoLido | null {
  const d = so(entrada);

  // Concessionária/arrecadação: começa com 8 e tem 48 dígitos na linha.
  if (d[0] === "8" && (d.length === 48 || d.length === 44)) {
    const barras = d.length === 44 ? d : d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
    const valor = Number(barras.slice(4, 15)) / 100;
    return {
      tipo: "arrecadacao",
      linhaDigitavel: d,
      codigoBarras: barras,
      banco: barras.slice(0, 3),
      bancoNome: null,
      valor: Number.isFinite(valor) ? Math.round(valor * 100) / 100 : 0,
      // Guia de arrecadação não carrega fator de vencimento — a data está no
      // convênio, não no número. Fingir uma data aqui seria inventar.
      vencimento: null,
      valido: true,
      problemas: [],
    };
  }

  if (d.length !== 47 && d.length !== 44) return null;
  const linha = d.length === 47 ? d : linhaDeCodigoDeBarras(d);
  const barras = d.length === 44 ? d : codigoDeBarrasDaLinha(linha);

  const problemas: string[] = [];
  if (d.length === 47) {
    const campos: [string, number][] = [
      [linha.slice(0, 9), Number(linha[9])],
      [linha.slice(10, 20), Number(linha[20])],
      [linha.slice(21, 31), Number(linha[31])],
    ];
    campos.forEach(([campo, dv], k) => {
      if (dvModulo10(campo) !== dv) problemas.push(`Dígito verificador do campo ${k + 1} não confere.`);
    });
  }
  const base43 = barras.slice(0, 4) + barras.slice(5);
  if (dvModulo11(base43) !== Number(barras[4])) {
    problemas.push("Dígito verificador geral do código de barras não confere.");
  }

  const fator = Number(barras.slice(5, 9));
  const valor = Number(barras.slice(9, 19)) / 100;
  const banco = barras.slice(0, 3);

  return {
    tipo: "bancario",
    linhaDigitavel: linha,
    codigoBarras: barras,
    banco,
    bancoNome: nomeDoBanco(banco),
    valor: Number.isFinite(valor) ? Math.round(valor * 100) / 100 : 0,
    vencimento: dataDoFator(fator, hojeISO),
    valido: problemas.length === 0,
    problemas,
  };
}

/** Monta a linha digitável (47) a partir do código de barras (44). */
export function linhaDeCodigoDeBarras(barras44: string): string {
  const c1 = barras44.slice(0, 4) + barras44.slice(19, 24);
  const c2 = barras44.slice(24, 34);
  const c3 = barras44.slice(34, 44);
  return (
    c1 + dvModulo10(c1) +
    c2 + dvModulo10(c2) +
    c3 + dvModulo10(c3) +
    barras44[4] +
    barras44.slice(5, 19)
  );
}

/** Formatação de exibição: 00000.00000 00000.000000 00000.000000 0 00000000000000 */
export function formatarLinha(linha47: string): string {
  const d = so(linha47);
  if (d.length !== 47) return linha47;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
}
