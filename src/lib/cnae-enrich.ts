/**
 * Enriquecimento da importação por CNPJ/CNAE.
 *
 * Um extrato vem cheio de "PIX ENVIADO 12.345.678/0001-95" — a palavra-chave
 * não classifica isso, mas o CNPJ sim: consultado o CNAE, sabe-se que aquela
 * empresa é um posto (Combustível), uma imobiliária (Aluguel) ou um escritório
 * contábil (Serviços profissionais). Este módulo faz essa passada sobre o
 * relatório do FDIP e devolve as classificações melhoradas.
 *
 * Princípios:
 *  • NUNCA sobrescreve o que o usuário já confirmou (`aprendido`) nem uma
 *    classificação que já está confiante — o CNAE entra onde há dúvida.
 *  • É best-effort: sem rede, devolve tudo como estava (o import não depende).
 *  • Também melhora o NOME da contraparte (razão social no lugar do número).
 */
import type { Classificacao, FinancialRecord } from "@/core/fdip/types";
import { extrairCNPJ } from "@/core/cnae";
import { consultarCNPJs, type DadosCNPJ } from "@/lib/cnpj";

/** Acima disso a classificação já é boa — não vale gastar consulta. */
const LIMITE_CONFIANCA = 0.9;

export interface ResultadoEnriquecimento {
  classificacoes: Classificacao[];
  /** Quantos lançamentos foram efetivamente re-categorizados pelo CNAE. */
  recategorizados: number;
  /** Quantos CNPJs distintos foram resolvidos. */
  empresasResolvidas: number;
  /** cnpj → dados (para exibir razão social/atividade na revisão). */
  empresas: Map<string, DadosCNPJ>;
  /** recordId → cnpj (para o UI mostrar de onde veio a sugestão). */
  porRecord: Map<string, string>;
}

/** Junta os campos onde um CNPJ pode aparecer num lançamento. */
const textoDoRecord = (r: FinancialRecord): string =>
  `${r.descricao || ""} ${r.contraparte || ""} ${r.documento || ""}`;

/**
 * Roda a passada de CNPJ→CNAE sobre um relatório já classificado.
 * `onProgresso` permite a UI mostrar "consultando 12 de 30…".
 */
export async function enriquecerPorCNPJ(
  records: FinancialRecord[],
  classificacoes: Classificacao[],
  opts?: { limiteConfianca?: number },
): Promise<ResultadoEnriquecimento> {
  const limite = opts?.limiteConfianca ?? LIMITE_CONFIANCA;
  const clsPorId = new Map(classificacoes.map((c) => [c.recordId, c]));

  // 1) descobrir os CNPJs que valem a consulta
  const porRecord = new Map<string, string>();
  const candidatos = new Set<string>();
  for (const r of records) {
    const cls = clsPorId.get(r.id);
    // O que o usuário já confirmou manda; o que já está confiante, deixa.
    if (cls?.aprendido) continue;
    const cnpj = extrairCNPJ(textoDoRecord(r));
    if (!cnpj) continue;
    porRecord.set(r.id, cnpj);
    if (!cls || cls.confianca < limite) candidatos.add(cnpj);
  }

  if (candidatos.size === 0) {
    return { classificacoes, recategorizados: 0, empresasResolvidas: 0, empresas: new Map(), porRecord };
  }

  // 2) consultar (best-effort, concorrência limitada, com cache)
  const empresas = await consultarCNPJs(Array.from(candidatos));
  if (empresas.size === 0) {
    return { classificacoes, recategorizados: 0, empresasResolvidas: 0, empresas, porRecord };
  }

  // 3) aplicar a sugestão onde há dúvida
  let recategorizados = 0;
  const saida = classificacoes.map((c): Classificacao => {
    if (c.aprendido || c.confianca >= limite) return c;
    const cnpj = porRecord.get(c.recordId);
    if (!cnpj) return c;
    const emp = empresas.get(cnpj);
    const sug = emp?.sugestao;
    if (!emp || !sug) return c;
    // Só troca se a sugestão for MAIS confiante que a classificação atual.
    if (sug.confianca <= c.confianca) return c;
    recategorizados++;
    return {
      ...c,
      categoria: sug.categoria,
      confianca: sug.confianca,
      motivo: `CNAE ${formatarCNAE(emp.cnaePrincipal)} · ${emp.cnaeDescricao || sug.atividade}`,
    };
  });

  return { classificacoes: saida, recategorizados, empresasResolvidas: empresas.size, empresas, porRecord };
}

/** 4731800 → "4731-8/00" (formato oficial). */
export function formatarCNAE(cnae: string): string {
  const c = (cnae || "").replace(/\D/g, "");
  if (c.length < 7) return c;
  return `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5, 7)}`;
}

/**
 * Nome melhor para a contraparte: razão social (ou fantasia) no lugar de um
 * número solto. Só troca quando o nome atual é claramente pobre — um nome que
 * o usuário já reconhece não deve mudar debaixo dele.
 */
export function melhorNomeContraparte(atual: string, emp: DadosCNPJ | undefined): string {
  if (!emp) return atual;
  const bom = (emp.nomeFantasia || emp.razaoSocial || "").trim();
  if (!bom) return atual;
  const a = (atual || "").trim();
  // "pobre" = vazio, só dígitos/pontuação, ou muito curto.
  const pobre = !a || /^[\d\s./-]+$/.test(a) || a.length < 4;
  return pobre ? bom : a;
}
