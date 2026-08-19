/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ALÇADA — uma morada só, e a conversão de faixa que estava errada
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O DEFEITO QUE ISTO SUBSTITUI.** `parseLimite` (lib/governance) tirava as
 * LETRAS da faixa antes de converter:
 *
 *     "R$50 mil"   → tira não-dígitos → "50"  → **50**       (mil vezes menor)
 *     "Sem limite" → tira tudo        → ""    → **0**        (a inversão exata)
 *
 * O segundo é o pior: quem escolheu "sem teto" ficava gravado como "não aprova
 * nada". A coluna nunca teve leitor, então nunca doeu — mas a conversão viajava
 * pronta para o dia em que alguém a ligasse.
 *
 * Aqui a faixa e o número andam JUNTOS, numa tabela só, e a conversão é uma
 * busca — não uma limpeza de string que depende de como o rótulo foi escrito.
 */
import type { Papel } from "./index";

/** As faixas oferecidas na tela. ⚠️ `null` é SEM TETO, e não é zero. */
export const FAIXAS_ALCADA: { rotulo: string; teto: number | null }[] = [
  { rotulo: "R$10 mil", teto: 10_000 },
  { rotulo: "R$50 mil", teto: 50_000 },
  { rotulo: "R$500 mil", teto: 500_000 },
  { rotulo: "Sem limite", teto: null },
];

/** Faixa → valor. Rótulo desconhecido devolve 0 (fechado), nunca "sem teto". */
export function tetoDaFaixa(rotulo: string | undefined | null): number | null {
  const achou = FAIXAS_ALCADA.find((f) => f.rotulo === rotulo);
  // ⚠️ A ausência é FECHADA: um rótulo que não reconhecemos não pode virar
  // "sem limite" por descuido — seria dar teto infinito a quem ninguém liberou.
  return achou ? achou.teto : 0;
}

/** Valor → faixa, para a tela reabrir no que foi escolhido. */
export function faixaDoTeto(teto: number | null | undefined): string {
  if (teto === null) return "Sem limite";
  const achou = FAIXAS_ALCADA.find((f) => f.teto === teto);
  return achou ? achou.rotulo : "";
}

/**
 * O papel que o participante do onboarding recebe.
 *
 * ⚠️ **"Pode aprovar" é a pergunta que define o PAPEL**, porque com a Blindagem
 * B quem confirma sai de `role_permissions` — o teto só responde QUANTO. Marcar
 * "pode aprovar" e receber um papel sem a ação `aprovar` produziria alguém que
 * a tela diz que aprova e o banco recusa, com mensagem de permissão.
 */
export function papelDoParticipante(p: { aprovaPagamentos?: boolean }): Papel {
  return p.aprovaPagamentos ? "aprovador" : "lancador";
}

/** Sem teto vence qualquer número; entre números, o maior. */
function maiorTeto(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.max(a, b);
}

export type AlcadaDoOnboarding = {
  tetos: { papel: Papel; teto: number | null }[];
  /**
   * ⚠️ Dois participantes com o MESMO papel e limites diferentes não cabem numa
   * alçada por papel. Fica com o MAIOR — o menor bloquearia alguém que o dono
   * quis liberar — e o conflito é DEVOLVIDO para a tela dizer, em vez de o
   * sistema escolher calado. Escolha silenciosa aqui é a pessoa descobrindo o
   * teto no dia em que precisa aprovar.
   */
  conflitos: { papel: Papel; escolhido: number | null; ignorados: (number | null)[] }[];
};

/**
 * Traduz os participantes do onboarding em tetos POR PAPEL.
 * Puro: não grava nada — quem grava é `lib/alcada`.
 */
export function alcadaDoOnboarding(
  participantes: { aprovaPagamentos?: boolean; limite?: string }[],
): AlcadaDoOnboarding {
  const porPapel = new Map<Papel, (number | null)[]>();
  for (const p of participantes) {
    // ⚠️ Só quem aprova define teto. O `lancador` tem teto 0 por definição (não
    // tem a ação `aprovar`), e deixá-lo herdar o limite digitado criaria um
    // número que não decide nada — a semente da quarta morada.
    if (!p.aprovaPagamentos) continue;
    const papel = papelDoParticipante(p);
    const lista = porPapel.get(papel) ?? [];
    lista.push(tetoDaFaixa(p.limite));
    porPapel.set(papel, lista);
  }

  const tetos: AlcadaDoOnboarding["tetos"] = [];
  const conflitos: AlcadaDoOnboarding["conflitos"] = [];
  for (const [papel, lista] of Array.from(porPapel.entries())) {
    const escolhido: number | null = lista.reduce(maiorTeto);
    tetos.push({ papel, teto: escolhido });
    const ignorados = lista.filter((t: number | null) => t !== escolhido);
    if (ignorados.length > 0) conflitos.push({ papel, escolhido, ignorados });
  }
  return { tetos, conflitos };
}
