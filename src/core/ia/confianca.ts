/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIANÇA — um número que se explica, ou nenhum número
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ O motor devolvia `confianca: 0.82` e a tela exibia "82%". Ninguém — nem
 * quem escreveu — sabe dizer o que separa 0,82 de 0,79. Um número de confiança
 * sem critério é pior que nenhum: ele **empresta autoridade** a uma resposta sem
 * dar ao leitor como conferi-la, e é exatamente sobre essas respostas que se
 * toma decisão sem checar.
 *
 * Aqui a confiança é COMPOSTA de fatores nomeados, cada um com o que mede e
 * quanto pesa. A tela mostra o total e, ao lado, **por que** ele é esse. Se o
 * critério não couber numa frase, o fator não entra.
 *
 * Os quatro fatores, e a razão de cada um:
 *
 *  1. **Base** — de quantos lançamentos a resposta saiu. Três lançamentos e
 *     trezentos não sustentam a mesma afirmação.
 *  2. **Recência** — dado velho responde sobre um passado que pode não valer
 *     mais. Um cliente que pagava em dia até março não diz nada sobre agosto.
 *  3. **Natureza** — fato, estimativa ou projeção (ONDA 10). Projeção não pode
 *     ter a mesma confiança de uma soma de extrato.
 *  4. **Cobertura** — a pergunta foi respondida inteira ou em parte? Responder
 *     metade com confiança alta é o pior dos casos.
 *
 * Puro, tipado, sem I/O. Versão `ia-confianca/1.0.0`.
 */
import type { Natureza } from "@/core/indicadores";

export const CONFIANCA_VERSION = "ia-confianca/1.0.0";

export interface FatorConfianca {
  id: "base" | "recencia" | "natureza" | "cobertura";
  rotulo: string;
  /** 0..1 — quanto ESTE fator sustenta a resposta. */
  valor: number;
  peso: number;
  /** A frase que explica o valor. Sem ela o fator não existe. */
  porque: string;
}

export type NivelConfianca = "alta" | "media" | "baixa";

export interface Confianca {
  /** 0..1. */
  valor: number;
  nivel: NivelConfianca;
  fatores: FatorConfianca[];
  /** O fator que mais derruba — é o que a tela mostra primeiro. */
  limitante: FatorConfianca | null;
  /** Uma frase para o usuário. */
  resumo: string;
}

/** Pesos somam 1. Alterar aqui é decisão de produto, não ajuste solto. */
const PESOS = { base: 0.3, recencia: 0.2, natureza: 0.35, cobertura: 0.15 } as const;

/**
 * ⚠️ A natureza é o fator de maior peso, e de propósito: uma projeção sobre
 * mil lançamentos recentes continua sendo uma projeção. Nenhuma quantidade de
 * dado transforma suposição sobre o futuro em fato.
 */
const PESO_NATUREZA: Record<Natureza, number> = { fato: 1, estimativa: 0.65, projecao: 0.4 };

export interface EntradaConfianca {
  /** Quantos lançamentos entraram na conta. */
  lancamentos: number;
  /** Dias entre o dado mais recente usado e hoje. */
  diasDesdeODado: number;
  natureza: Natureza;
  /** 0..1 — quanto da pergunta foi respondido. */
  cobertura: number;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function calcularConfianca(e: EntradaConfianca): Confianca {
  // 30 lançamentos já sustentam uma média; abaixo de 5 não sustentam nada.
  const base = clamp((e.lancamentos - 3) / 27);
  // 30 dias é atual; 180 dias já não descreve o presente.
  const recencia = clamp(1 - (e.diasDesdeODado - 30) / 150);
  const natureza = PESO_NATUREZA[e.natureza];
  const cobertura = clamp(e.cobertura);

  const fatores: FatorConfianca[] = [
    {
      id: "base", rotulo: "Volume de dados", valor: base, peso: PESOS.base,
      porque: e.lancamentos <= 3
        ? `só ${e.lancamentos} lançamento${e.lancamentos === 1 ? "" : "s"} sustentam esta conta`
        : `${e.lancamentos} lançamentos entraram na conta`,
    },
    {
      id: "recencia", rotulo: "Atualidade", valor: recencia, peso: PESOS.recencia,
      porque: e.diasDesdeODado <= 30
        ? "o dado mais recente é deste mês"
        : `o dado mais recente tem ${e.diasDesdeODado} dias`,
    },
    {
      id: "natureza", rotulo: "Tipo do número", valor: natureza, peso: PESOS.natureza,
      porque: e.natureza === "fato"
        ? "é soma de lançamentos que já aconteceram"
        : e.natureza === "estimativa"
          ? "é média ou proxy, não contagem"
          : "é conta sobre o futuro e depende de os previstos se confirmarem",
    },
    {
      id: "cobertura", rotulo: "Alcance da resposta", valor: cobertura, peso: PESOS.cobertura,
      porque: cobertura >= 0.99 ? "a pergunta foi respondida por inteiro"
        : `parte da pergunta ficou sem resposta (${Math.round(cobertura * 100)}% coberta)`,
    },
  ];

  const valor = clamp(fatores.reduce((s, f) => s + f.valor * f.peso, 0));
  const nivel: NivelConfianca = valor >= 0.75 ? "alta" : valor >= 0.5 ? "media" : "baixa";
  // ⚠️ O limitante é o que mais SUBTRAI (peso × o quanto falta), não o de menor
  // valor: um fator fraco de peso baixo não é o que derruba a resposta, e
  // apontá-lo mandaria a pessoa consertar o que não importa.
  const limitante = [...fatores].sort((a, b) => (1 - a.valor) * a.peso < (1 - b.valor) * b.peso ? 1 : -1)[0] ?? null;

  return {
    valor, nivel, fatores, limitante,
    resumo: limitante && limitante.valor < 0.95
      ? `Confiança ${nivel} — o que mais limita: ${limitante.porque}.`
      : `Confiança ${nivel} — ${fatores[2].porque}.`,
  };
}

/** Rótulo curto para a tela. Nunca só o número. */
export const rotuloConfianca = (c: Confianca): string =>
  `${Math.round(c.valor * 100)}% · ${c.nivel}`;
