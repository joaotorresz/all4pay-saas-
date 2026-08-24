/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CENTRAL, LIGADA AO BANCO — a máquina de estados alcançada pela interface
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O que faltava.** A máquina de estados existe no banco desde a migration
 * `central_maquina_de_estados` — transição válida, segregação de funções e
 * alçada, tudo em gatilho. E **ninguém a alcançava pela interface**: a tela
 * derivava a fila do `RiskInput` e confirmava em estado local, otimista. Uma
 * regra que só o banco conhece e nenhuma tela exercita é uma regra que ninguém
 * usa — e a primeira vez que alguém a encontra é quando ela recusa.
 *
 * ⚠️ **E as recusas são QUATRO, não uma.** O gatilho distingue:
 *   `A4P-CENTRAL`            — a transição não existe na máquina
 *   `A4P-CENTRAL-SEGREGACAO` — quem lançou não confirma o próprio (R1)
 *   `A4P-CENTRAL-PERMISSAO`  — o PAPEL não confirma títulos
 *   `A4P-CENTRAL-ALCADA`     — o valor passa do TETO daquele papel
 *
 * Permissão e alçada são problemas DIFERENTES e a saída de cada um é diferente:
 * a primeira se resolve mudando o papel da pessoa, a segunda mudando o teto (ou
 * pedindo a outro). Colapsar as duas em "não autorizado" manda quem opera
 * procurar no lugar errado — por isso cada código vira uma frase própria, com o
 * que fazer.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";
import type { Situacao } from "@/core/central";

export interface TituloDaFila {
  id: string;
  descricao: string;
  contraparte: string | null;
  valor: number;
  direcao: "entrada" | "saida";
  vencimento: string;
  situacao: Situacao;
  /** De onde o título veio — a coluna real, não um palpite pela direção. */
  origem: string | null;
  lancadoPor: string | null;
}

export interface Transicao {
  id: string;
  de: string;
  para: string;
  por: string | null;
  motivo: string | null;
  quando: string;
}

/** O que a recusa do banco quer dizer para quem opera. */
export interface RecusaCentral {
  codigo: "transicao" | "segregacao" | "permissao" | "alcada" | "desconhecida";
  motivo: string;
  comoResolver: string;
}

/**
 * ⚠️ A tradução é por CÓDIGO, nunca por substring da frase em português.
 * Casar texto de mensagem já custou caro neste repositório três vezes (o
 * auditor de RLS, o classificador `maq_*`, o extrator do `ia-eval`): a frase
 * muda, o código não.
 */
export function traduzirRecusa(bruto: string): RecusaCentral {
  if (bruto.includes("A4P-CENTRAL-SEGREGACAO")) {
    return {
      codigo: "segregacao",
      motivo: "Você lançou este título — quem lança não confirma o próprio lançamento.",
      comoResolver: "Peça a confirmação a outra pessoa da equipe. É a regra que separa quem registra de quem autoriza.",
    };
  }
  if (bruto.includes("A4P-CENTRAL-PERMISSAO")) {
    return {
      codigo: "permissao",
      motivo: "O seu papel não confirma títulos.",
      comoResolver: "Isto se resolve mudando o PAPEL em Configurações → Usuários, não o valor da alçada.",
    };
  }
  if (bruto.includes("A4P-CENTRAL-ALCADA")) {
    return {
      codigo: "alcada",
      motivo: "O valor deste título passa do teto do seu papel.",
      comoResolver: "Peça a quem tem alçada maior, ou ajuste o teto do papel em Configurações. O papel está certo; o limite é que não alcança.",
    };
  }
  if (bruto.includes("A4P-CENTRAL")) {
    return {
      codigo: "transicao",
      motivo: "Este título não pode ir direto para essa situação.",
      comoResolver: "Um título previsto precisa ser CONFIRMADO antes de ser baixado.",
    };
  }
  return {
    codigo: "desconhecida",
    motivo: "Não foi possível concluir agora.",
    comoResolver: "Tente de novo; se repetir, informe o suporte.",
  };
}

/** A fila: tudo que aguarda confirmação, com a procedência REAL. */
export async function getFilaCentral(): Promise<TituloDaFila[]> {
  if (isDemo) return [];
  const s = createClient();
  const { data, error } = await semAmostra(
    s.from("movements").select(
      "id,description,category,amount,type,due_date,situacao,origem,lancado_por,party_id,parties(name)",
    ),
  ).eq("situacao", "previsto").order("due_date", { ascending: true }).limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const m = r as Record<string, unknown>;
    const parte = m.parties as { name?: string } | null;
    return {
      id: String(m.id),
      descricao: String(m.description || m.category || "Lançamento"),
      contraparte: parte?.name ?? null,
      valor: Number(m.amount),
      direcao: m.type === "entrada" ? "entrada" : "saida",
      vencimento: String(m.due_date),
      situacao: (m.situacao as Situacao) ?? "previsto",
      origem: (m.origem as string) ?? null,
      lancadoPor: (m.lancado_por as string) ?? null,
    };
  });
}

/**
 * Move o título na máquina. ⚠️ Quem AUTORIZA é o banco — esta função só pede e
 * traduz a recusa. Repetir a regra aqui criaria a segunda morada da alçada, que
 * é o defeito que este repositório passou dois dias matando.
 */
export async function moverTitulo(
  id: string, para: Situacao, motivo?: string,
): Promise<{ ok: true } | { ok: false; recusa: RecusaCentral }> {
  if (isDemo) return { ok: true };
  const s = createClient();
  /**
   * ⚠️ **`motivo` NÃO É GRAVÁVEL HOJE, e o parâmetro fica documentando isso.**
   * A tabela `central_transicoes` tem a coluna `motivo`, e o gatilho
   * `central_maquina` — o ÚNICO escritor da trilha — insere sem ela:
   *
   *     insert into central_transicoes (org_id, movement_id, de, para, por)
   *
   * É o espelho de "instrumentação sem consumidor": aqui há um consumidor (a
   * tela sabe mostrar o motivo) e nenhum PRODUTOR. Escrever na trilha por fora
   * criaria um segundo escritor e a trilha deixaria de ter dono único — o preço
   * é alto demais para um campo. Fica declarado, e a tela mostra o motivo
   * "quando houver", que hoje é nunca.
   */
  void motivo;
  const { error } = await s.from("movements").update({ situacao: para }).eq("id", id);
  if (error) return { ok: false, recusa: traduzirRecusa(`${error.message} ${error.details ?? ""} ${error.hint ?? ""}`) };
  return { ok: true };
}

/** A trilha do próprio título — quem, quando, de onde para onde, e por quê. */
export async function getTransicoes(movementId: string): Promise<Transicao[]> {
  if (isDemo) return [];
  const s = createClient();
  const { data, error } = await s
    .from("central_transicoes")
    .select("id,de,para,por,motivo,quando")
    .eq("movement_id", movementId)
    .order("quando", { ascending: true })
    .limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []) as Transicao[];
}
