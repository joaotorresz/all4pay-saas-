"use client";

/**
 * O acessor da fila de revisão.
 *
 * ⚠️ Ele NÃO usa `getRiscoInput`, e a razão é a mesma que fez o item 1 do lote
 * P-06B ser diagnosticado no lugar errado: `RiskMovement` não carrega
 * `description` nem `category_id`, e a fila existe exatamente para mostrar
 * quando esses dois DISCORDAM do texto que os relatórios leem. Medir pelo tipo
 * que não tem os campos seria concluir sobre uma superfície a partir de outra.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { semAmostra } from "@/lib/supabase/consulta";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";
import { montarFilaRevisao, type FilaRevisao, type ItemRevisao } from "@/core/revisao";

const VAZIA: FilaRevisao = { achados: [], total: 0, porMotivo: {} };

type LinhaMov = {
  id: string; type: "entrada" | "saida"; status: string; amount: number;
  due_date: string; description: string | null; category: string | null;
  categories: { name: string } | null; parties: { name: string } | null;
};
type LinhaRec = {
  id: string; type: "entrada" | "saida"; amount: number; start_date: string;
  description: string | null; active: boolean;
  categories: { name: string } | null; parties: { name: string } | null;
};

export async function getFilaRevisao(): Promise<FilaRevisao> {
  // Em demonstração a fila é vazia de propósito: o seed é conferido, e uma fila
  // de pendências dentro de uma demonstração ensina a ignorar a fila.
  if (isDemo) return VAZIA;
  const supabase = createClient();
  if (!supabase) return VAZIA;

  const itens: ItemRevisao[] = [];
  try {
    const { data, error } = await semAmostra(
      supabase
        .from("movements")
        .select("id,type,status,amount,due_date,description,category,categories(name),parties(name)")
        .neq("status", "cancelado")
        .limit(TETO_LINHAS),
    );
    if (error) throw error;
    for (const m of (data ?? []) as unknown as LinhaMov[]) {
      itens.push({
        id: m.id, origem: "lancamento", descricao: m.description, valor: Number(m.amount),
        data: m.due_date, tipo: m.type, status: m.status,
        categoriaTexto: m.category, categoriaChave: m.categories?.name ?? null,
        contraparte: m.parties?.name ?? null,
      });
    }
  } catch (e) {
    reportar("revisao.lancamentos", e, "a fila de revisão pode aparecer incompleta", false);
  }

  try {
    // ⚠️ A REGRA entra na fila, não só os títulos que ela gera. Corrigir os
    // filhos e deixar a regra viva faz o defeito voltar no mês seguinte.
    const { data, error } = await semAmostra(
      supabase
        .from("recurrences")
        .select("id,type,amount,start_date,description,active,categories(name),parties(name)")
        .eq("active", true)
        .limit(TETO_LINHAS),
    );
    if (error) throw error;
    for (const r of (data ?? []) as unknown as LinhaRec[]) {
      itens.push({
        id: r.id, origem: "recorrencia", descricao: r.description, valor: Number(r.amount),
        data: r.start_date, tipo: r.type, categoriaTexto: null,
        categoriaChave: r.categories?.name ?? null, contraparte: r.parties?.name ?? null,
      });
    }
  } catch (e) {
    reportar("revisao.recorrencias", e, "as regras recorrentes podem não aparecer na fila", false);
  }

  return montarFilaRevisao(itens);
}

/**
 * Cancelar o item — a única ação da fila que MOVE dinheiro (para fora).
 *
 * ⚠️ Cancelar é exclusão LÓGICA, como manda a ONDA 3: o registro fica, sai dos
 * relatórios e da projeção. O lixo de leitura ótica vencido desde 2023 é o caso
 * que a motivou — em aberto, ele é dinheiro dentro da projeção de caixa.
 */
export async function cancelarItemRevisao(id: string, origem: "lancamento" | "recorrencia"): Promise<void> {
  if (isDemo) return;
  const supabase = createClient();
  if (!supabase) return;
  const { error } = origem === "lancamento"
    ? await supabase.from("movements").update({ status: "cancelado" }).eq("id", id)
    : await supabase.from("recurrences").update({ active: false }).eq("id", id);
  // Um escritor que engole erro é indistinguível de um que funciona.
  if (error) throw error;
}

/**
 * Confirmar: a classificação da chave está certa, propague-a para o texto.
 *
 * ⚠️ É a ação que a fila existe para NÃO fazer sozinha. Ela só é oferecida
 * depois de alguém ler a descrição ao lado do nome da categoria — foi
 * exatamente a propagação automática que arquivaria R$ 140.000 de folha dentro
 * de "Assinaturas / software".
 */
export async function confirmarClassificacao(id: string, nomeCategoria: string): Promise<void> {
  if (isDemo) return;
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.from("movements").update({ category: nomeCategoria }).eq("id", id);
  if (error) throw error;
}
