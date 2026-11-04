/**
 * A SUGESTÃO DA QUATTRO AI PARA O PLANO DE CONTAS (Fase 4.1, 04/11/2026).
 *
 * O defeito de origem (Rodada 4, A4P "DRE adivinhado"): ninguém terminava a
 * entrada com o plano de contas declarado, então o DRE de todo cliente novo
 * era montado pelo palpite por palavra-chave. E o palpite erra justamente no
 * caso mais caro: `ehImpostoVenda` casa `\binss\b`, e INSS patronal e FGTS
 * caíam como DEDUÇÃO DA RECEITA (47,54% da receita bruta na organização
 * auditada).
 *
 * Aqui mora UMA regra só para "qual linha eu sugiro": a importação (onboarding),
 * o aviso de palpite do DRE e a jornada leem esta função. Ela não grava nada:
 * a pessoa confirma, e a gravação é a do Plano de contas (`declararLinhas`).
 *
 *   1. encargo de folha (INSS patronal, FGTS, GPS, salário, pró-labore, férias,
 *      13º, vale e benefício) → Despesas Operacionais, com o motivo dito;
 *   2. o resto → a mesma linha que o DRE usa hoje (o palpite), para que
 *      confirmar sem mexer não mude número nenhum.
 *
 * ⚠️ "INSS sobre a receita" (CPRB, desoneração da folha) É dedução: a regra 1
 * não o leva.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { ESTRUTURA_DRE, montarRelatorio, palpiteDoRelatorio } from "@/core/relatorios";
import { chaveCategoria } from "@/core/categorias/chave";
import { ehTransferenciaEntreContas } from "@/core/indicadores/convencoes";
import { linhaDREvalida } from "./index";

type Natureza = "receita" | "despesa";

export const LINHA_ENCARGO = "despesas_operacionais";

const ENCARGO_FOLHA =
  /\b(inss|fgts|gps)\b|patronal|folha|sal[aá]rio|pr[oó][- ]?labore|f[eé]rias|\b13[oº°]?\b|d[eé]cimo terceiro|encargo|vale[- ]?(refei|transp|alim)|benef[ií]cio/;
const SOBRE_RECEITA = /cprb|sobre (a )?receita|faturamento|desonera/;

export interface Sugestao {
  linha: string;
  /** Por que esta linha, em uma frase para a tela. */
  motivo: string;
  /** A regra que decidiu: a de encargo de folha ou o mesmo palpite do DRE. */
  regra: "encargo-folha" | "palpite";
}

/** A sugestão para UMA categoria, dado o palpite que o DRE usa hoje. */
export function sugerirLinhaDRE(nome: string, natureza: Natureza, palpite: string): Sugestao {
  const n = nome.toLowerCase();
  if (natureza === "despesa" && ENCARGO_FOLHA.test(n) && !SOBRE_RECEITA.test(n)) {
    return {
      linha: LINHA_ENCARGO,
      motivo: "Encargo de folha é despesa operacional, não dedução da receita.",
      regra: "encargo-folha",
    };
  }
  return {
    linha: linhaDREvalida(palpite, natureza) ? palpite : "",
    motivo: "A mesma linha em que o DRE já põe esta categoria hoje.",
    regra: "palpite",
  };
}

export interface CategoriaParaDeclarar {
  nome: string;
  valor: number;
  natureza: Natureza;
  /** A linha em que o DRE põe a categoria hoje, sem declaração. */
  palpite: string;
  sugestao: Sugestao;
}

/**
 * As categorias com lançamento e SEM linha declarada, cada uma com a sugestão.
 * "Sem categoria" e transferência entre contas ficam fora: a primeira não tem
 * nome para declarar, a segunda já sai do DRE sem declaração.
 */
export function planoParaDeclarar(input: RiskInput | undefined, declaradas: Record<string, string>): CategoriaParaDeclarar[] {
  const movs = (input?.movements ?? []).filter((m) => {
    const nome = (m.category ?? "").trim();
    return nome && chaveCategoria(nome) !== chaveCategoria("Sem categoria")
      && !declaradas[chaveCategoria(nome)] && !ehTransferenciaEntreContas(m.category);
  });
  if (!movs.length) return [];
  const datas = movs.map((m) => (m.due_date || m.paid_date || "").slice(0, 10)).filter(Boolean).sort();
  const rel = montarRelatorio({ ...(input as RiskInput), movements: movs }, ESTRUTURA_DRE, {
    intervalo: { de: datas[0], ate: datas[datas.length - 1] },
    regime: "competencia",
    linhaPorCategoria: declaradas,
  } as Parameters<typeof montarRelatorio>[2]);
  return palpiteDoRelatorio(rel, { ...(input as RiskInput), movements: movs }).categorias
    .filter((c) => chaveCategoria(c.nome) !== chaveCategoria("Sem categoria"))
    .map((c) => ({ ...c, palpite: c.linha, sugestao: sugerirLinhaDRE(c.nome, c.natureza, c.linha) }))
    .map(({ linha: _l, ...resto }) => resto);
}
