"use client";

/**
 * "Lançar de novo" um título CANCELADO — o que a Lixeira oferece no lugar do
 * antigo "Restaurar".
 *
 * ⚠️ **O "RESTAURAR" ERA IMPOSSÍVEL EM PRODUÇÃO, e a tela escondia o motivo.**
 * Ele fazia `situacao: cancelado → previsto`. A máquina de estados do banco
 * (`central_transicao_valida`, migrations 20260818210000 e 20260825170000)
 * declara `cancelado` TERMINAL — decisão do dono, escrita no CLAUDE.md:
 * "título cancelado não ressuscita; quem precisa dele de novo LANÇA de novo,
 * com procedência própria". O gatilho recusava com `A4P-CENTRAL: transição
 * cancelado → previsto não é permitida`, e o `catch` da tela trocava isso por
 * "Não foi possível restaurar". Em demonstração funcionava (o dataset local não
 * tem máquina de estados) — o defeito clássico que passa na demo e quebra no
 * ar.
 *
 * Agora o gesto é o que a regra manda: um título NOVO, com os mesmos dados de
 * negócio (conta, valor, vencimento, competência, categoria, contraparte,
 * centro, projeto) e procedência `manual`; o cancelado sai da lista de
 * cancelados pela exclusão LÓGICA (continua no banco e na lixeira lógica, com
 * o motivo dizendo para onde foi). O histórico não é reescrito: o cancelado
 * continua cancelado, e o novo existe por um ato com autor e data.
 *
 * ⚠️ Não copia `chave` nem `reference_code`: os dois têm índice ÚNICO parcial
 * e o cancelado ainda os ocupa — copiar faria o banco recusar o novo título.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { appendImported, importedMovements, removerImported } from "@/lib/imported";
import { excluirLogico } from "@/lib/exclusao";
import type { Movement } from "@/lib/types";
import { semAmostra } from "@/lib/supabase/consulta";

const COLUNAS_DE_NEGOCIO =
  "id,account_id,type,amount,due_date,competence_date,category,category_id,description,party_id,cost_center_id,project_id,sale_doc_id";

export async function relancarCancelado(m: Movement): Promise<void> {
  if (isDemo) {
    // O dataset da demonstração não tem lixeira lógica: o cancelado sai e o
    // novo entra — o número volta para "A receber/A pagar" do mesmo jeito.
    const original = (importedMovements() ?? []).find((x) => x.id === m.id) ?? m;
    appendImported({
      movement: {
        ...original,
        id: `mv_${Date.now().toString(36)}_relancado`,
        status: "pendente",
        paid_date: null,
        reconciled: false,
        origem: "manual",
        chave: null,
        reference_code: null,
      } as never,
    });
    removerImported([m.id]);
    return;
  }

  const supabase = createClient();
  const { data: linhas, error: erroLeitura } = await semAmostra(supabase
    .from("movements").select(COLUNAS_DE_NEGOCIO)).eq("id", m.id).limit(1);
  const linha = linhas?.[0];
  if (erroLeitura) throw new Error(erroLeitura.message);
  if (!linha) throw new Error("Lançamento não encontrado nesta empresa.");
  const { id: _id, ...dados } = linha as Record<string, unknown>;

  const { error } = await supabase.from("movements").insert({
    ...dados,
    situacao: "previsto",
    paid_date: null,
    reconciled: false,
    // ⚠️ `origem` é a chave da fechadura da ONDA 5 (`titulo_exige_origem`
    // recusa com A4P05 o título sem procedência). O novo título é um ato da
    // pessoa, agora — não herda a procedência do cancelado.
    origem: "manual",
    especie: "titulo",
  });
  // Um escritor de dinheiro que engole erro é indistinguível de um que funciona.
  if (error) throw new Error(error.message);

  try {
    await excluirLogico("movements", m.id, "Lançado de novo a partir da lista de cancelados");
  } catch (e) {
    // O novo título JÁ existe: dizer só "falhou" convidaria a clicar de novo e
    // lançar o mesmo dinheiro duas vezes.
    throw new Error(`O novo título foi criado, mas o cancelado continua na lista (não clique de novo): ${e instanceof Error ? e.message : String(e)}`);
  }
}
