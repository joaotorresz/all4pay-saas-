/**
 * Autonomous Collections — cobrança vira modelo preditivo: o sistema
 * escolhe o melhor canal, horário, linguagem e estratégia por cliente.
 * Aumenta recuperação sem aumentar o time. Determinístico (perfil + hash).
 */
import type { CollectionPlan } from "./types";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function planoDeCobranca(
  clientes: { nome: string; score: number; exposicao: number }[],
): CollectionPlan[] {
  return clientes.map((c) => {
    const h = hash(c.nome);
    const estrategia: CollectionPlan["estrategia"] =
      c.score >= 76 ? "agressiva_precoce" : c.score >= 51 ? "proativa" : "amigavel";

    // Canal: risco alto favorece contato mais direto; variação determinística.
    const canal: CollectionPlan["canal"] =
      c.score >= 76 ? (h % 2 === 0 ? "ligacao" : "whatsapp") : c.score >= 51 ? "whatsapp" : "email";

    const horario =
      canal === "email"
        ? "após 17h (e-mail formal reduz atrito)"
        : h % 3 === 0
          ? "09h (maior conversão)"
          : h % 3 === 1
            ? "11h30"
            : "14h";

    const tom =
      estrategia === "agressiva_precoce"
        ? "objetivo e com prazo definido"
        : estrategia === "proativa"
          ? "cordial e proativo, antes do vencimento"
          : "amigável e flexível";

    return { cliente: c.nome, score: c.score, exposicao: c.exposicao, canal, horario, estrategia, tom };
  });
}
