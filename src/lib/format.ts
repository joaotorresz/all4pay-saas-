/**
 * pt-BR / BRL formatting helpers.
 * The whole product speaks Brazilian Real with "," decimals and "."
 * thousands. Use these everywhere numbers are shown.
 */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const groupedInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/*
 * ⚠️ SEM ESPAÇO entre a moeda e o número: `R$1.284.900,00`.
 *
 * O `Intl` do pt-BR insere um espaço NÃO SEPARÁVEL (U+00A0) depois do `R$` —
 * não é o espaço do teclado, então procurar por `"R$ "` no código não acha
 * nada e a diferença atravessa a revisão. Foi assim que `Money`/`BRL` ficaram
 * colados enquanto a frase da dica ao lado seguia com respiro: o mesmo valor
 * sai por dois caminhos, e só um tinha sido corrigido.
 *
 * Vale para o texto que a IA escreve, o rótulo de leitor de tela, o tooltip e
 * a planilha exportada — é o mesmo dinheiro, e uma grafia só.
 */
function semRespiro(s: string): string {
  // Só o separador que vem LOGO APÓS a moeda: `\s` alcança o U+00A0, e ancorar
  // na moeda preserva o espaço do formato compacto ("R$1,3 mi") — colar ali
  // produziria "R$1,3mi", que é outra coisa.
  return s.replace(/R\$\s+/g, "R$");
}

/** "R$1.284.900,00" — full BRL string (for tooltips, sr-only, axes). */
export function formatBRL(value: number): string {
  return semRespiro(brl.format(value));
}

/** "R$1,3 mi" — compact BRL (for tight chart axes). */
export function formatBRLCompact(value: number): string {
  return semRespiro(brlCompact.format(value));
}

/**
 * Split a number into the parts the <Money> component expects:
 * grouped integer ("1.284.900") + two decimal digits ("00").
 * Always works on the absolute value — sign is conveyed by color/label.
 */
export function brlParts(value: number): { integer: string; decimals: string } {
  // Arredonda para CENTAVOS primeiro e só então separa: senão a fração que
  // arredonda p/ 100 (ex.: 1,999) vira decimals "100" sem carregar o inteiro
  // ("1,100" em vez de "2,00"). Assim `Money` bate sempre com formatBRL.
  const cents = Math.round(Math.abs(value) * 100);
  const integer = groupedInt.format(Math.trunc(cents / 100));
  const decimals = (cents % 100).toString().padStart(2, "0");
  return { integer, decimals };
}

/* ========================================================================== */
/* ONDA 11 — um jeito só de escrever cada tipo de número                       */
/* ========================================================================== */

/**
 * Percentual, **uma casa decimal**, vírgula decimal, sem espaço antes do `%`.
 *
 * ⚠️ O produto escrevia percentual com 0, 1 e 2 casas — em `paineis/shared.tsx`
 * as três precisões conviviam no MESMO arquivo. Três formatos para a mesma
 * grandeza fazem a tela parecer montada por três pessoas que não se falaram, e
 * é a partir daí que o leitor começa a conferir o número na calculadora.
 *
 * Uma casa é a escolha: zero apaga a diferença entre 12,4% e 12,9%, que é
 * justamente a que importa numa margem; duas fingem uma exatidão que uma média
 * de 90 dias não tem.
 *
 * @param fracao valor de 0 a 1 (0,124 → "12,4%"). Use `pctDeInteiro` se já vier
 *               em pontos percentuais.
 */
export function pct(fracao: number, casas = 1): string {
  if (!Number.isFinite(fracao)) return "—";
  return `${(fracao * 100).toFixed(casas).replace(".", ",")}%`;
}

/** O mesmo, para quem já tem o número em pontos percentuais (12,4 → "12,4%"). */
export function pctDeInteiro(pontos: number, casas = 1): string {
  if (!Number.isFinite(pontos)) return "—";
  return `${pontos.toFixed(casas).replace(".", ",")}%`;
}

/**
 * Data em `dd/mm/aaaa`, **fatiada da string ISO**.
 *
 * ⚠️ Nunca via `new Date(iso).toLocaleDateString()`: `new Date("2026-08-01")` é
 * meia-noite UTC, e em UTC−3 isso é 31/07 às 21h. A data do dia 1º aparecia
 * como o último dia do mês anterior — o erro que a guarda `npm run tz` existe
 * para pegar.
 */
export function dataBR(iso: string | null | undefined): string {
  const s = (iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

/** `dd/mm` — quando o ano já está declarado no contexto (um filtro de mês). */
export function dataCurtaBR(iso: string | null | undefined): string {
  const s = (iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

/**
 * O SINAL DE MENOS do produto: `−` (U+2212), nunca o hífen do teclado.
 *
 * ⚠️ O hífen é mais curto que os algarismos e desalinha a coluna de valores —
 * numa tabela de cem linhas isso aparece como uma borda serrilhada à esquerda.
 * E parênteses (a convenção de balanço) estão fora: metade dos usuários lê
 * parêntese como observação, não como negativo.
 */
export const MENOS = "−";

/** Prefixa o menos tipográfico quando o valor é negativo. */
export function comSinal(valor: number, texto: string): string {
  return valor < 0 ? `${MENOS}${texto.replace(/^-/, "")}` : texto;
}
