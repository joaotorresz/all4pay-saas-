"use client";

/**
 * EXCLUSÃO LÓGICA — a única porta de exclusão do produto.
 *
 * ⚠️ Ela existe porque o `DELETE` foi REVOGADO do papel do cliente em toda
 * tabela de negócio. Não é uma convenção que o código respeita enquanto alguém
 * lembra: o caminho físico não existe mais, e `supabase.from(x).delete()`
 * devolve `permission denied`. Foi essa revogação que quebrou os oito pontos
 * que este arquivo substitui — de propósito, e de uma vez, para não sobrar meio
 * produto apagando de verdade.
 *
 * ⚠️ Nada aqui apaga. `excluirLogico` marca; o registro continua no banco,
 * aparece em `/lixeira` e volta com `restaurarLogico`. Apagar de vez é
 * `expurgar`, exige o papel de quem administra, exige motivo escrito e **só
 * funciona sobre o que já está na lixeira** — dois atos, dois eventos, e uma
 * janela entre eles em que dá para voltar atrás.
 */
import { isDemo } from "@/lib/demo";

async function cliente() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

export interface ItemDaLixeira {
  entidade: string;
  id: string;
  excluidoEm: string;
  excluidoPor: string | null;
  excluidoPorEmail: string | null;
  motivo: string | null;
  /** `description` ou `name` do registro — sem isto a lixeira lista uuids. */
  resumo: string;
}

/**
 * ⚠️ Em demonstração não há servidor, e as telas que chamam isto já têm o seu
 * próprio caminho local (`removerImported`, `saveLocal`). Devolver silêncio
 * aqui é o certo: fingir uma exclusão que não aconteceu seria pior.
 */
export async function excluirLogico(
  entidade: string, id: string, motivo?: string,
): Promise<void> {
  if (isDemo) return;
  const { error } = await (await cliente())
    .rpc("excluir_logico", { p_entidade: entidade, p_id: id, p_motivo: motivo ?? null });
  if (error) throw new Error(error.message);
}

/**
 * ⚠️ Em lote é uma chamada POR ITEM, e não um `in (...)`: a função do banco
 * confere empresa e papel a cada registro, e é ela que grava o evento com o
 * antes de cada linha. Um `update ... in (...)` seria mais rápido e deixaria
 * uma trilha que diz "algo mudou em 300 linhas" — que é a trilha que não
 * responde nada quando alguém pergunta por UMA delas.
 *
 * As falhas são COLECIONADAS, não interrompem: parar no primeiro erro deixaria
 * o lote pela metade sem dizer onde parou.
 */
export async function excluirLogicoEmLote(
  entidade: string, ids: readonly string[], motivo?: string,
): Promise<{ excluidos: number; falhas: { id: string; erro: string }[] }> {
  if (isDemo) return { excluidos: 0, falhas: [] };
  const falhas: { id: string; erro: string }[] = [];
  let excluidos = 0;
  for (const id of ids) {
    try {
      await excluirLogico(entidade, id, motivo);
      excluidos += 1;
    } catch (e) {
      falhas.push({ id, erro: e instanceof Error ? e.message : "falha desconhecida" });
    }
  }
  return { excluidos, falhas };
}

export async function listarLixeira(dias = 90): Promise<ItemDaLixeira[]> {
  if (isDemo) return [];
  const { data, error } = await (await cliente()).rpc("lixeira_listar", { p_dias: dias });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((l) => ({
    entidade: String(l.entidade),
    id: String(l.id),
    excluidoEm: String(l.excluido_em),
    excluidoPor: (l.excluido_por as string) ?? null,
    excluidoPorEmail: (l.excluido_por_email as string) ?? null,
    motivo: (l.motivo as string) ?? null,
    resumo: String(l.resumo ?? l.id),
  }));
}

/** Devolve quantos registros voltaram — o próprio mais os filhos que caíram junto. */
export async function restaurarLogico(entidade: string, id: string): Promise<number> {
  if (isDemo) return 0;
  const { data, error } = await (await cliente())
    .rpc("restaurar_logico", { p_entidade: entidade, p_id: id });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Apaga em definitivo. ⚠️ O servidor recusa se o registro NÃO estiver na
 * lixeira — não existe caminho direto — e exige papel de administrador mais um
 * motivo escrito. A checagem no cliente é cortesia; a regra é do banco.
 */
export async function expurgar(
  entidade: string, id: string, motivo: string,
): Promise<void> {
  if (isDemo) return;
  const { error } = await (await cliente())
    .rpc("lixeira_expurgar", { p_entidade: entidade, p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

/**
 * Traduz o nome da tabela para o que a pessoa reconhece.
 *
 * ⚠️ Vive aqui e não na tela porque a lixeira é UMA lista de entidades
 * MISTURADAS — é o único lugar do produto onde `sales_docs` e `parties`
 * aparecem lado a lado, e "sales_docs" numa coluna obriga quem lê a decifrar o
 * esquema para saber o que apagou.
 */
export const NOME_DA_ENTIDADE: Record<string, string> = {
  movements: "Lançamento",
  parties: "Contato",
  products: "Produto",
  services: "Serviço",
  sales_docs: "Venda",
  sale_items: "Item de venda",
  categories: "Categoria",
  cost_centers: "Centro de custo",
  projects: "Projeto",
  financial_accounts: "Conta bancária",
  recurrences: "Recorrência",
  schedules: "Cronograma",
  budgets: "Orçamento",
  journal_entries: "Lançamento contábil",
  journal_lines: "Linha contábil",
  ledger_accounts: "Conta contábil",
  brands: "Marca",
  units: "Unidade",
  salespeople: "Vendedor",
  approvals: "Solicitação",
  reembolsos: "Reembolso",
  nfse: "Nota fiscal",
  financial_rules: "Regra",
  movement_splits: "Rateio",
  bank_accounts: "Conta conectada",
  bank_transactions: "Transação bancária",
  close_tasks: "Tarefa de fechamento",
  dimensions: "Dimensão",
  entities: "Entidade contábil",
  revenue_contracts: "Contrato de receita",
  revenue_schedule: "Cronograma de receita",
  accounting_periods: "Período contábil",
  pluggy_items: "Conexão bancária",
  ai_learning: "Aprendizado da IA",
};

export const nomeDaEntidade = (e: string): string => NOME_DA_ENTIDADE[e] ?? e;
