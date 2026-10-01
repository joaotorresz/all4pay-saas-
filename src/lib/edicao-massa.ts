"use client";

/**
 * O ESCRITOR da edição em massa (`core/movimentacoes/edicao-massa`).
 *
 * Grava SÓ o que o plano mandou aplicar — o plano já tirou o mês fechado, o
 * baixado (no vencimento) e o terminal. Em produção a gravação é UMA ATUALIZAÇÃO
 * POR TÍTULO, e isso é de propósito:
 *
 *  - ⚠️ **a trilha é por título.** O gatilho `auditar_escrita` do banco grava um
 *    evento por linha alterada, com o campo de antes e o de depois. Uma edição
 *    em massa de 30 títulos são 30 eventos de UMA decisão — e cada título
 *    guarda, no próprio histórico, que foi reclassificado;
 *  - ⚠️ **a trava do mês fechado continua sendo do BANCO.** O plano recusa na
 *    tela, mas quem tranca é o gatilho `movements_periodo_fechado`. Se a tela
 *    estiver com a lista de meses fechados desatualizada (outro usuário fechou
 *    agosto agora), o banco recusa a linha — e a recusa volta NOMEADA, com a
 *    mensagem real, em vez de sumir num "algumas falharam";
 *  - uma falha não derruba as outras: cada título é um fato próprio.
 *
 * ⚠️ **ESCRITOR QUE ENGOLE ERRO É DEFEITO.** Nada aqui tem `catch` vazio: cada
 * recusa entra em `falhas` com a mensagem do banco, e a tela mostra.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { updateImportedMovement } from "@/lib/imported";
import { vincularProjeto } from "@/lib/projeto-vinculo";
import { registrarLog, listarLogsAdmin } from "@/lib/administracao-store";
import { resumoDoEvento, ROTULO_CAMPO, type PlanoEdicao } from "@/core/movimentacoes/edicao-massa";
import type { Movement } from "@/lib/types";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResultadoEdicao {
  aplicados: string[];
  falhas: { id: string; mensagem: string }[];
}

export async function aplicarEdicaoEmMassa(plano: PlanoEdicao): Promise<ResultadoEdicao> {
  const { campo, para, paraRotulo } = plano.alteracao;
  const aplicados: string[] = [];
  const falhas: { id: string; mensagem: string }[] = [];

  if (isDemo) {
    const quando = new Date().toISOString();
    for (const item of plano.aplicar) {
      const patch: Record<string, unknown> =
        campo === "categoria" ? { category: paraRotulo || null }
        : campo === "centro" ? { centro_nome: paraRotulo || null }
        : campo === "vencimento" ? { due_date: para }
        : {};
      if (campo === "projeto") vincularProjeto(item.id, para ?? "");
      else updateImportedMovement(item.id, patch as Partial<Movement>);
      aplicados.push(item.id);
      // ⚠️ Na demonstração não há gatilho de banco: o evento é escrito aqui,
      // UM POR TÍTULO, na mesma trilha que a tela de Logs lê.
      registrarLog({
        id: `edm_${item.id}_${Date.now().toString(36)}_${listarLogsAdmin().length}`,
        quando,
        acao: "alterou",
        usuario: "você",
        origem: "Web",
        tipoEntidade: "Lançamento",
        entidadeId: item.id,
        entidade: item.id,
        resumo: resumoDoEvento(campo, item.de, item.para),
        antes: { [ROTULO_CAMPO[campo]]: item.de },
        depois: { [ROTULO_CAMPO[campo]]: item.para },
      });
    }
    return { aplicados, falhas };
  }

  const s = createClient();
  for (const item of plano.aplicar) {
    let patch: Record<string, unknown>;
    if (campo === "categoria") {
      // O nome viaja junto do id: o texto `category` é o que a classificação
      // lê quando o embed não resolve, e deixá-lo com o nome antigo faria duas
      // telas discordarem sobre a categoria do mesmo título.
      if (para && !RE_UUID.test(para)) { falhas.push({ id: item.id, mensagem: `A categoria "${paraRotulo}" ainda não existe no banco.` }); continue; }
      patch = { category_id: para || null, category: paraRotulo || null };
    } else if (campo === "centro") {
      if (para && !RE_UUID.test(para)) { falhas.push({ id: item.id, mensagem: `O centro de custo "${paraRotulo}" ainda não existe no banco.` }); continue; }
      patch = { cost_center_id: para || null };
    } else if (campo === "projeto") {
      // O projeto do cadastro local (id não-UUID) vive no vínculo; a coluna
      // recebe nulo para o embed antigo não vencer o vínculo novo.
      patch = { project_id: para && RE_UUID.test(para) ? para : null };
    } else {
      patch = { due_date: para };
    }
    // `maybeSingle`: atualiza por id (no máximo uma linha) e devolve `null`, sem
    // erro, quando a política filtrou a linha.
    const { data: alterado, error } = await s.from("movements").update(patch).eq("id", item.id).select("id").maybeSingle();
    if (error) { falhas.push({ id: item.id, mensagem: error.message }); continue; }
    // ⚠️ REVISÃO CAMP-B — UPDATE QUE NÃO ALTEROU NADA NÃO É SUCESSO. As
    // políticas restritivas (papel sem `lancar`, título na lixeira, outra
    // empresa) não levantam erro num UPDATE: elas FILTRAM a linha, e o PostgREST
    // devolve 200 com zero linhas. Sem conferir o retorno, o título entrava em
    // "aplicados", o toast dizia "1 título alterado" e nada tinha mudado — o
    // escritor que engole a recusa, sem nem haver erro para engolir.
    if (!alterado) {
      falhas.push({ id: item.id, mensagem: "O banco não alterou este título: ele não está visível para o seu papel nesta empresa (sem permissão de lançar, na lixeira ou removido)." });
      continue;
    }
    if (campo === "projeto") vincularProjeto(item.id, para ?? "");
    aplicados.push(item.id);
  }
  return { aplicados, falhas };
}
