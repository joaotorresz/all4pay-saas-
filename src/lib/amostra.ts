"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A AMOSTRA QUE FICOU — contar e purgar o dado de demonstração
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O botão "Carregar amostra" da tela `/upload` grava lançamentos de mentira no
 * banco de verdade, e até a migration `20260813141626` eles eram
 * indistinguíveis de um extrato importado. Medido em produção: 458 lançamentos,
 * R$ 6,18 milhões, em 3 organizações reais.
 *
 * `semAmostra` (em `lib/supabase/consulta`) já os tira de todo relatório. Este
 * módulo responde as outras duas perguntas: **ainda tem?** (o banner) e
 * **tira daqui** (a purga).
 *
 * ⚠️ **Esconder e apagar são coisas diferentes, e as duas precisam existir.**
 * O filtro conserta os números na hora, sem risco; a purga é o que devolve a
 * base limpa, e é irreversível. Oferecer só a purga obrigaria a decidir sob
 * pressão com o DRE errado na tela; oferecer só o filtro deixaria a base suja
 * para sempre, e um dia alguém consulta o banco por fora do produto.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { TABELAS_COM_AMOSTRA, TETO_LINHAS, type MotivoAmostra } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";
import { excluirLogico } from "@/lib/exclusao";

/**
 * ⚠️ **O MOTIVO QUE A PURGA APAGA — e é só ele.**
 *
 * `is_sample` marca duas coisas com destinos opostos, e o vocabulário já dizia
 * isso desde que nasceu (`MotivoAmostra`): `onboarding_demo` não é dado de
 * ninguém e purga em lote; `lancamento_teste` é um registro que EXISTIU na
 * operação de uma empresa, marcado à mão pelo id, e o desfecho correto dele é
 * ser cancelado com trilha, não sumir junto num clique.
 *
 * A purga apagava os dois — `.eq("is_sample", true)`. Medido em produção
 * (14/08/26): o botão levaria junto **1 lançamento de R$ 500.000,00**, com
 * descrição "Teste", debaixo de um aviso que anuncia "dados de demonstração".
 * O que o botão apaga tem de ser o que o botão diz.
 */
export const MOTIVO_PURGAVEL: MotivoAmostra = "onboarding_demo";

export interface ContagemAmostra {
  /** Quantas linhas de demonstração existem, somando as cinco tabelas. */
  total: number;
  /** Quebrado por tabela — o que a tela mostra antes de deixar apagar. */
  porTabela: Record<string, number>;
  /**
   * Quebrado por MOTIVO. É o que separa o que o botão remove do que ele
   * deixa — sem isso o banner conta uma coisa e a purga faz outra.
   */
  porMotivo: Record<string, number>;
  /** Quantas linhas o botão de purga realmente removeria. */
  purgaveis: number;
  /** Quantas ficam, por não serem amostra de onboarding. */
  preservadas: number;
}

const VAZIO: ContagemAmostra = {
  total: 0, porTabela: {}, porMotivo: {}, purgaveis: 0, preservadas: 0,
};

/**
 * Conta o que está marcado como demonstração na organização ATIVA.
 *
 * ⚠️ A política de acesso por linha já escopa à organização — não há (nem pode
 * haver) um `org_id` vindo do cliente aqui. Passar o id pelo navegador seria
 * oferecer a chave de outra empresa a quem soubesse editar a requisição.
 *
 * ⚠️ **Em demonstração devolve ZERO de propósito.** Com `NEXT_PUBLIC_ALL4PAY_DEMO`
 * ligado o produto inteiro é uma demonstração e o `DemoBadge` já diz isso; um
 * banner avisando que há dado de demonstração dentro da demonstração é ruído
 * que ensina a ignorar o banner — e é justamente quando ele aparecer numa base
 * real que ele precisa ser lido.
 */
export async function contarAmostra(): Promise<ContagemAmostra> {
  if (isDemo) return VAZIO;
  const supabase = createClient();
  const porTabela: Record<string, number> = {};
  const porMotivo: Record<string, number> = {};
  let total = 0;
  let purgaveis = 0;
  for (const tabela of TABELAS_COM_AMOSTRA) {
    // `head: true` + `count: exact` traz só o número — trazer as linhas para
    // contá-las no navegador puxaria as 458 a cada troca de tela.
    const { count, error } = await supabase
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .eq("is_sample", true);
    // ⚠️ A contagem do PURGÁVEL é uma consulta à parte, e não uma subtração
    // esperta sobre a primeira: é ela que o botão promete apagar, e ela tem de
    // sair do MESMO predicado que a purga usa. Duas contas para a mesma
    // pergunta é como o banner e o botão passaram a discordar.
    const { count: nPurgavel } = await supabase
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .eq("is_sample", true)
      .eq("sample_reason", MOTIVO_PURGAVEL);
    if (nPurgavel) {
      purgaveis += nPurgavel;
      porMotivo[MOTIVO_PURGAVEL] = (porMotivo[MOTIVO_PURGAVEL] ?? 0) + nPurgavel;
    }
    if (count && nPurgavel !== null && nPurgavel !== undefined && count - nPurgavel > 0) {
      porMotivo.outros = (porMotivo.outros ?? 0) + (count - nPurgavel);
    }
    if (error) {
      // ⚠️ Não derruba a tela: o banner é um AVISO, e um aviso que quebra o app
      // quando falha é pior que a ausência dele. Mas também não some calado —
      // "não sei se tem amostra" não pode virar "não tem".
      reportar(
        "amostra.contar", error,
        "o aviso de dado de demonstração pode não aparecer nesta tela",
        true,
      );
      continue;
    }
    if (count) { porTabela[tabela] = count; total += count; }
  }
  return { total, porTabela, porMotivo, purgaveis, preservadas: total - purgaveis };
}

/**
 * Apaga TODO lançamento de demonstração da organização ativa.
 *
 * ⚠️ **Não tem desfazer, e a tela diz isso.** O `AcaoDestrutiva` aceita ação sem
 * reversão quando o impacto é mostrado ANTES — é o caso aqui: a contagem por
 * tabela está na tela no momento do clique. Guardar as linhas apagadas para um
 * "desfazer" significaria copiá-las para outro lugar, e aí a base continua com
 * dado de demonstração dentro, só que num canto que nenhum relatório varre.
 *
 * ⚠️ **A ordem importa:** filho antes de pai. `movement_splits` e `sale_items`
 * apontam para `movements`/`sales_docs`; apagar o pai primeiro ou explode na
 * chave estrangeira, ou (pior, se a chave for `on delete cascade`) leva junto
 * um filho que não estava marcado.
 */
export async function purgarAmostra(): Promise<number> {
  if (isDemo) return 0;
  const supabase = createClient();
  // Os contatos são decididos ANTES de apagar: depois, a amostra que os
  // referenciava não existe mais para dizer de onde eles vieram.
  const contatos = await contatosDaAmostra();
  const ordem = ["movement_splits", "sale_items", "movements", "sales_docs", "recurrences"] as const;
  let apagadas = 0;
  for (const tabela of ordem) {
    const { data, error } = await supabase
      .from(tabela).delete()
      .eq("is_sample", true)
      // ⚠️ **SÓ O MOTIVO PURGÁVEL.** Sem esta linha o botão levava junto o
      // `lancamento_teste` — um registro que existiu na operação da empresa,
      // marcado à mão pelo id. Ele sai por decisão explícita, nomeada, com
      // trilha; nunca de carona num clique que anuncia outra coisa.
      .eq("sample_reason", MOTIVO_PURGAVEL)
      .select("id");
    // ⚠️ A falha SOBE. Uma purga que apaga metade e diz que deu certo deixa a
    // base num estado que ninguém consegue descrever — e o usuário acabou de
    // ser informado de que estava limpa.
    if (error) throw error;
    apagadas += (data ?? []).length;
  }
  for (const id of contatos) {
    await excluirLogico("parties", id, "contato criado pela amostra de demonstração");
  }
  return apagadas;
}


/**
 * ⚠️ RODADA 6 — OS CONTATOS QUE A AMOSTRA CRIOU. A purga levava os
 * lançamentos e deixava as contrapartes (pendência declarada desde a marca
 * `is_sample`): 15 contatos em produção, medidos em 01/10, só existiam por
 * causa da amostra e continuavam na lista de clientes e fornecedores.
 *
 * Regra (pura): um contato sai quando TODA referência a ele é amostra
 * purgável — nenhum lançamento, venda ou recorrência fora dela. Um contato que
 * a empresa também usou de verdade FICA. E ele vai para a LIXEIRA, não some:
 * pode ter sido editado e virado cadastro, e a lixeira devolve.
 */
export function contatosSoDaAmostra(
  daAmostra: readonly string[], usadosForaDaAmostra: ReadonlySet<string>,
): string[] {
  return Array.from(new Set(daAmostra)).filter((id) => !usadosForaDaAmostra.has(id));
}

/** Os ids dos contatos que só a amostra purgável referencia — a MESMA consulta para o banner e para a purga. */
export async function contatosDaAmostra(): Promise<string[]> {
  if (isDemo) return [];
  const supabase = createClient();
  const { data: daAmostra, error } = await supabase.from("movements").select("party_id")
    .eq("is_sample", true).eq("sample_reason", MOTIVO_PURGAVEL).not("party_id", "is", null).limit(TETO_LINHAS);
  if (error) throw error;
  const ids = Array.from(new Set(((daAmostra ?? []) as { party_id: string }[]).map((r) => r.party_id)));
  if (!ids.length) return [];
  const usados = new Set<string>();
  for (const tabela of ["movements", "sales_docs", "recurrences"] as const) {
    // "Fora da amostra purgável": não marcada, ou marcada por outro motivo.
    const { data, error: e } = await supabase.from(tabela).select("party_id")
      .in("party_id", ids).or(`is_sample.eq.false,sample_reason.neq.${MOTIVO_PURGAVEL}`).limit(TETO_LINHAS);
    if (e) throw e;
    for (const r of (data ?? []) as { party_id: string | null }[]) if (r.party_id) usados.add(r.party_id);
  }
  return contatosSoDaAmostra(ids, usados);
}
