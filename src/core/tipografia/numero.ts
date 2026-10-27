/**
 * Texto que é NÚMERO (27/10/2026, decisão do dono: todo número do sistema em
 * Agrandir). Decide pelo CONTEÚDO, não pela classe, porque a varredura das 76
 * telas achou mais de mil números sem marca nenhuma — um `<span>` com "12",
 * um eixo de gráfico, um percentual solto. Puro: o marcador da tela
 * (`components/app/MarcaNumeros`) e a guarda usam a MESMA regra.
 *
 * É número: valor ("R$ 1.234,56", "−R$ 300,00"), percentual ("12,4%",
 * "+2,4%"), data ("27/10/2026", "27/10"), hora ("21:00"), contagem ("12"),
 * parcela ("3x", "2/12") e valor compacto ("R$ 312 mil", "1,2 mi").
 *
 * NÃO é número: frase com número no meio ("12 lançamentos", "vence em 3
 * dias"), nome com dígito ("Q3", "Conta 2"), e rótulo de eixo de categoria.
 * Nesses a palavra manda, e a palavra é Inter.
 */
const NUMERO =
  /^[+\-−–]?\s?(?:R\$\s?)?[+\-−–]?\s?\(?\d[\d.,:/\s]*\)?\s?(?:%|x|×|mil|mi|bi|k|d|h|min|pp|p\.p\.)?$/i;

export function ehNumero(texto: string): boolean {
  const t = texto.replace(/ /g, " ").trim();
  if (!t || t.length > 40) return false;
  return NUMERO.test(t);
}
