/**
 * O INTERRUPTOR DO ESTOQUE — o único leitor de `ESTOQUE`.
 *
 * ⚠️ Sem `ESTOQUE=ligado` a aba Estoque não aparece em Produtos e o pop-up de
 * movimento não abre. O cadastro do produto ("Controla estoque?", "Estoque
 * inicial") continua como sempre esteve.
 */
export function estoqueLigado(env: Record<string, string | undefined> = process.env): boolean {
  return env.ESTOQUE === "ligado";
}
