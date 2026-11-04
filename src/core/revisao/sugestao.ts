/**
 * A SUGESTÃO DA QUATTRO AI EM CADA LINHA DA FILA "REVISAR" (Fase 4.3,
 * 04/11/2026).
 *
 * A fila continua sem classificar nada sozinha: a sugestão mora num campo
 * PRÓPRIO, ao lado das três fontes, e só vira gravação quando a pessoa clica
 * em "Aplicar". Ela nunca ocupa o lugar da resposta (a regra de
 * `core/revisao`): o caso que a montou é a chave que dizia "Assinaturas /
 * software" num lançamento de salário, e propagar a chave sem ninguém olhar
 * arquivaria R$ 140.000 de folha dentro de software.
 *
 * De onde vem a sugestão, em ordem de força:
 *   1. o que a empresa já fez: a categoria que a MESMA contraparte recebe nos
 *      outros lançamentos (maioria, com pelo menos dois);
 *   2. a taxonomia da importação (`classificar`), a mesma regra que classifica
 *      o extrato: o texto da descrição e da contraparte;
 *   3. nenhuma: a sugestão diz o que conferir e não chuta categoria. "Outras
 *      despesas" não é sugestão, é desistência.
 *
 * Puro, sem I/O e sem relógio (a data de hoje entra por parâmetro).
 */
import { classificar } from "@/core/ingestao/taxonomia";
import { normalizarDescritivo } from "@/core/ingestao/chave";
import type { ItemRevisao, MotivoRevisao } from "./index";

export type AcaoSugerida = "classificar" | "confirmar" | "cancelar" | "conferir";

export interface SugestaoRevisao {
  acao: AcaoSugerida;
  /** A categoria proposta, quando a ação é classificar ou confirmar. */
  categoria?: string;
  /** Por que, numa frase para a tela. */
  motivo: string;
  /** De onde veio: o histórico da empresa, a taxonomia ou só a regra da fila. */
  fonte: "historico" | "taxonomia" | "regra";
}

const GENERICAS = new Set(["Outras receitas", "Outras despesas"]);
const chave = (s: string | null | undefined) => normalizarDescritivo(s ?? "");

/**
 * Contraparte → a categoria que ela recebe na maioria dos lançamentos com
 * categoria. Só vale com dois ou mais e maioria estrita: um lançamento só não
 * é hábito, e empate não é maioria.
 */
export function historicoPorContraparte(itens: readonly ItemRevisao[]): Map<string, string> {
  const contagem = new Map<string, Map<string, number>>();
  for (const it of itens) {
    const cat = (it.categoriaTexto ?? "").trim();
    const cp = chave(it.contraparte);
    if (it.origem !== "lancamento" || !cat || !cp) continue;
    const m = contagem.get(cp) ?? new Map<string, number>();
    m.set(cat, (m.get(cat) ?? 0) + 1);
    contagem.set(cp, m);
  }
  const out = new Map<string, string>();
  contagem.forEach((m, cp) => {
    const pares = Array.from(m.entries());
    const total = pares.reduce((s, [, n]) => s + n, 0);
    const [cat, n] = pares.sort((a, b) => b[1] - a[1])[0];
    if (total >= 2 && n * 2 > total) out.set(cp, cat);
  });
  return out;
}

/** A categoria que a taxonomia da importação daria, ou null se só a genérica. */
function daTaxonomia(it: ItemRevisao): string | null {
  const texto = chave(it.contraparte ? `${it.contraparte} ${it.descricao ?? ""}` : it.descricao);
  if (!texto) return null;
  const c = classificar(texto, it.tipo);
  return GENERICAS.has(c.categoria) ? null : c.categoria;
}

const mesma = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && chave(a) === chave(b);

export function sugerirRevisao(
  it: ItemRevisao,
  motivo: MotivoRevisao,
  historico: ReadonlyMap<string, string>,
  hoje: string,
): SugestaoRevisao {
  const doHistorico = it.contraparte ? historico.get(chave(it.contraparte)) ?? null : null;
  const taxonomia = daTaxonomia(it);
  const proposta = doHistorico ?? taxonomia;
  const fonte = doHistorico ? "historico" : "taxonomia";
  const porque = doHistorico
    ? `é a categoria que ${it.contraparte} recebe nos outros lançamentos`
    : `a descrição tem cara de "${proposta}"`;

  switch (motivo) {
    case "valor_zero":
      return { acao: "cancelar", fonte: "regra", motivo: "Lançamento de valor zero não move nada: se faltou o valor, corrija; se não, cancele." };
    case "descritivo_ilegivel":
      return it.status === "pendente" && it.data < hoje
        ? { acao: "cancelar", fonte: "regra", motivo: "Ilegível, vencido e em aberto: enquanto existir, entra na projeção de caixa." }
        : { acao: "conferir", fonte: "regra", motivo: "Confira no extrato do banco se este lançamento existiu e corrija a descrição." };
    case "entrada_com_cara_de_folha":
      // Sem chute: reembolso, estorno e aporte mandam fazer coisas diferentes.
      return { acao: "conferir", fonte: "regra", motivo: "Entrada com nome de salário costuma ser reembolso ou estorno. Confira o tipo antes de classificar." };
    case "categoria_nao_propagada":
      if (proposta && !mesma(proposta, it.categoriaChave)) {
        return { acao: "classificar", categoria: proposta, fonte, motivo: `A chave diz "${it.categoriaChave}", mas ${porque}.` };
      }
      return { acao: "confirmar", categoria: it.categoriaChave ?? undefined, fonte: proposta ? fonte : "regra",
        motivo: proposta ? `A chave e a descrição concordam: ${it.categoriaChave}.` : `Nada contradiz a chave: ${it.categoriaChave}.` };
    case "sem_categoria":
      return proposta
        ? { acao: "classificar", categoria: proposta, fonte, motivo: `Sugiro ${proposta}: ${porque}.` }
        : { acao: "conferir", fonte: "regra", motivo: "Nem o histórico nem a descrição dizem a categoria. Escolha uma em Corrigir." };
    case "regra_inconsistente":
      return proposta && !mesma(proposta, it.categoriaChave)
        ? { acao: "conferir", categoria: proposta, fonte, motivo: `A regra provavelmente é de ${proposta}: ${porque}. Corrija a regra, não só os títulos.` }
        : { acao: "conferir", fonte: "regra", motivo: "Confira a contraparte e a categoria da regra: uma das duas está errada." };
  }
}
