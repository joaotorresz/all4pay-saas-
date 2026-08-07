/**
 * Aplica as regras do dono sobre um relatório do FDIP.
 *
 * Onde isto entra na cascata de classificação:
 *   1. REGRA do dono      ← aqui (intenção explícita, vence tudo)
 *   2. aprendizado exato  (contraparte já confirmada antes)
 *   3. CNPJ → CNAE        (atividade econômica)
 *   4. palavra-chave      (heurística do FDIP)
 *   5. inferência por tipo
 *
 * Regra vence até o "aprendido" porque o aprendizado é implícito (nasceu de uma
 * confirmação pontual) e a regra é explícita — se o dono escreveu, ele quis.
 */
import type { Classificacao, FinancialRecord } from "@/core/fdip/types";
import { aplicarRegras, contarAplicacoes, type AlvoRegra, type RegraCategorizacao } from "@/core/regras";
import { registrarUso } from "@/lib/regras";

export interface ResultadoAplicacao {
  classificacoes: Classificacao[];
  /** Quantos lançamentos foram categorizados por regra. */
  aplicados: number;
  /** regraId → nº de aplicações nesta rodada. */
  porRegra: Record<string, number>;
  /** Nome das regras que pegaram algo (para a mensagem ao usuário). */
  nomes: string[];
}

/** cnaePorRecord: recordId → CNAE, quando o enriquecimento já resolveu. */
export function aplicarRegrasNoRelatorio(
  records: FinancialRecord[],
  classificacoes: Classificacao[],
  regras: RegraCategorizacao[],
  cnaePorRecord?: Map<string, string>,
): ResultadoAplicacao {
  if (regras.length === 0) {
    return { classificacoes, aplicados: 0, porRegra: {}, nomes: [] };
  }

  const alvos: AlvoRegra[] = records.map((r) => ({
    id: r.id,
    tipo: r.tipo === "entrada" ? "entrada" : "saida",
    valor: r.valor,
    descricao: r.descricao,
    contraparte: r.contraparte || r.contraparteNorm,
    cnae: cnaePorRecord?.get(r.id),
  }));

  const res = aplicarRegras(alvos, regras);
  if (res.length === 0) return { classificacoes, aplicados: 0, porRegra: {}, nomes: [] };

  const porId = new Map(res.map((r) => [r.alvoId, r]));
  let aplicados = 0;
  const saida = classificacoes.map((c): Classificacao => {
    const hit = porId.get(c.recordId);
    if (!hit || !hit.categoria) return c;
    aplicados++;
    return {
      ...c,
      categoria: hit.categoria,
      // Regra do dono é certeza declarada — a confiança reflete isso, e com ela
      // o lançamento sai da fila de revisão e da fila da IA.
      confianca: 1,
      motivo: `regra: ${hit.regraNome}`,
      aprendido: true,
    };
  });

  const porRegra = contarAplicacoes(res);
  registrarUso(porRegra);
  const nomes = Array.from(new Set(res.map((r) => r.regraNome)));
  return { classificacoes: saida, aplicados, porRegra, nomes };
}
