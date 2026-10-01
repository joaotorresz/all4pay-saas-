/**
 * A CHAVE de uma categoria — UMA normalização para quem declara e para quem lê.
 *
 * ⚠️ Eram duas. A declaração do palpite (`planoDeDeclaracao`) casava o nome
 * SEM acento ("manutencao" = "Manutenção"), e o DRE procurava a linha
 * declarada COM acento (`trim().toLowerCase()`). Com o lançamento gravado
 * "Manutencao" e a categoria "Manutenção", a pessoa confirmava a linha, a
 * declaração ia para a categoria acentuada — e o DRE continuava procurando
 * "manutencao", não achava, e seguia no palpite com o aviso aceso. Um botão
 * que diz "declarado" e não muda nada.
 *
 * Medido em produção (01/10/2026): nenhum par só-por-acento hoje. Defeito
 * latente — fecha antes de alguém digitar "Combustivel" sem acento.
 *
 * Puro, sem I/O.
 */
export function chaveCategoria(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
