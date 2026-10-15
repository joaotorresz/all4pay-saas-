/**
 * Qual logo cada banco usa — puro, sem dado, sem I/O. Versão `bancos-logo/1.0.0`.
 *
 * O banco chega por DOIS caminhos: a CHAVE gravada em `financial_accounts.bank`
 * (`itau`, `bb`…, ver `core/registros/hierarquia`) e o NOME solto das listas
 * (Open Finance, onboarding, extrato: "Banco do Brasil", "Itaú Unibanco").
 * Os dois passam pela mesma função, para a mesma conta ter o mesmo logo em
 * toda tela.
 *
 * ⚠️ **A ordem dos testes é a regra.** "Banco do Nordeste" e "Banco de
 * Brasília" contêm "banco" e "brasil"; o genérico ("brasil" → Banco do Brasil)
 * fica no FIM, senão os dois herdam o logo errado. E "inter" casa por PALAVRA
 * inteira: por substring "Intermedium" e "intercompany" virariam o Inter.
 *
 * ⚠️ **Banco sem logo NÃO ganha o logo de outro.** C6, BTG, Stone, PagBank,
 * Mercado Pago, XP… não estão na biblioteca: devolvem `null` e a tela mostra
 * as iniciais. Um logo trocado é pior que nenhum — o operador confia nele
 * para escolher de que conta o dinheiro sai.
 */
import { normalizar } from "@/core/registros";

/** O nome do glifo em `components/ui/bancos-icones.ts`. */
export type GlifoBanco =
  | "banco-amazonia" | "banco-brasil" | "banco-brasilia" | "banco-nordeste"
  | "banco-real" | "banestes" | "bank-boston" | "banrisul" | "bradesco"
  | "bradesco-alt" | "caixa" | "citi-bank" | "hsbc" | "inter" | "itau"
  | "nubank" | "original" | "safra" | "santander" | "sicoob" | "sicredi";

/** Chaves EXATAS de `financial_accounts.bank` (e siglas usuais). */
const POR_CHAVE: Record<string, GlifoBanco> = {
  itau: "itau", bradesco: "bradesco", bb: "banco-brasil", santander: "santander",
  caixa: "caixa", cef: "caixa", nubank: "nubank", nu: "nubank", inter: "inter",
  sicoob: "sicoob", bancoob: "sicoob", sicredi: "sicredi", safra: "safra",
  banrisul: "banrisul", original: "original", hsbc: "hsbc", citi: "citi-bank",
  citibank: "citi-bank", banestes: "banestes", brb: "banco-brasilia",
  bnb: "banco-nordeste", basa: "banco-amazonia",
};

/** Por nome, do mais específico ao mais genérico — a ordem importa. */
const POR_NOME: [RegExp, GlifoBanco][] = [
  [/\bbrasilia\b/, "banco-brasilia"],
  [/\bnordeste\b/, "banco-nordeste"],
  [/\bamazonia\b/, "banco-amazonia"],
  [/\bitau\b/, "itau"],
  [/\bbradesco\b/, "bradesco"],
  [/\bsantander\b/, "santander"],
  [/\bcaixa\b/, "caixa"],
  [/\bnubank\b|\bnu pagamentos\b/, "nubank"],
  [/\binter\b|\bbanco inter\b/, "inter"],
  [/\bsicoob\b|\bbancoob\b/, "sicoob"],
  [/\bsicredi\b/, "sicredi"],
  [/\bsafra\b/, "safra"],
  [/\bbanrisul\b/, "banrisul"],
  [/\bbanestes\b/, "banestes"],
  [/\bbanco original\b/, "original"],
  [/\bhsbc\b/, "hsbc"],
  [/\bciti(bank)?\b/, "citi-bank"],
  [/\bbanco do brasil\b|\bbrasil\b/, "banco-brasil"],
];

/** A chave ou o nome do banco → o glifo, ou `null` quando não há logo. */
export function glifoDoBanco(bancoOuNome: string | null | undefined): GlifoBanco | null {
  const n = normalizar(bancoOuNome ?? "").trim().replace(/\s+/g, " ");
  if (!n) return null;
  const chave = n.replace(/[^a-z0-9]/g, "");
  if (POR_CHAVE[chave]) return POR_CHAVE[chave];
  for (const [re, glifo] of POR_NOME) if (re.test(n)) return glifo;
  return null;
}

/** Até duas iniciais para o banco sem logo ("C6 Bank" → "C6", "Mercado Pago" → "MP"). */
export function iniciaisDoBanco(nome: string | null | undefined): string {
  const palavras = (nome ?? "").trim().split(/\s+/).filter((p) => p && !/^(banco|bank|de|do|da|s\.?a\.?)$/i.test(p));
  if (palavras.length === 0) return "·";
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[1][0]).toUpperCase();
}
