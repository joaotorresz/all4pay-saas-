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
import { TABELAS_COM_AMOSTRA } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";

export interface ContagemAmostra {
  /** Quantas linhas de demonstração existem, somando as cinco tabelas. */
  total: number;
  /** Quebrado por tabela — o que a tela mostra antes de deixar apagar. */
  porTabela: Record<string, number>;
}

const VAZIO: ContagemAmostra = { total: 0, porTabela: {} };

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
  let total = 0;
  for (const tabela of TABELAS_COM_AMOSTRA) {
    // `head: true` + `count: exact` traz só o número — trazer as linhas para
    // contá-las no navegador puxaria as 458 a cada troca de tela.
    const { count, error } = await supabase
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .eq("is_sample", true);
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
  return { total, porTabela };
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
  const ordem = ["movement_splits", "sale_items", "movements", "sales_docs", "recurrences"] as const;
  let apagadas = 0;
  for (const tabela of ordem) {
    const { data, error } = await supabase
      .from(tabela).delete().eq("is_sample", true).select("id");
    // ⚠️ A falha SOBE. Uma purga que apaga metade e diz que deu certo deixa a
    // base num estado que ninguém consegue descrever — e o usuário acabou de
    // ser informado de que estava limpa.
    if (error) throw error;
    apagadas += (data ?? []).length;
  }
  return apagadas;
}
