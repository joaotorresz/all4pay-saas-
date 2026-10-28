/**
 * OS LINKS DE PAGAMENTO DA RÉGUA — o runner pergunta ao banco qual link
 * `/pagar` vivo cada título da fila de hoje já tem (servidor, chave de serviço).
 *
 * ⚠️ Só com a cobrança LIBERADA (`cobrancaPinbankLiberada`): com ela desligada
 * a página `/pagar` não mostra Pix nem boleto, e mandar o link levaria o
 * cliente a uma página sem como pagar.
 * ⚠️ Falha na leitura NÃO derruba a régua: a mensagem sai sem link, como
 * antes, e o motivo volta para a resposta do runner.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { filaAutomatica, type ConfigAutomacao, type ContextoAutomacao } from "@/core/automacoes";
import { cobrancaPinbankLiberada } from "@/lib/pinbank/api";

export async function linksDaRegua(
  admin: SupabaseClient, ctx: ContextoAutomacao, cfgs: ConfigAutomacao[], env: NodeJS.ProcessEnv = process.env,
): Promise<{ links: Record<string, string>; aviso?: string }> {
  const regua = cfgs.find((c) => c.tipo === "regua_cobranca" && c.ativo);
  if (!regua || !cobrancaPinbankLiberada(env).liberada) return { links: {} };
  const ids = Array.from(new Set(filaAutomatica(ctx, regua.parametros).grupos.flatMap((g) => g.itens.map((i) => i.movimentoId))));
  if (!ids.length) return { links: {} };
  const { data, error } = await admin.rpc("regua_links_de_pagamento", { p_org: ctx.orgId, p_movements: ids });
  if (error) return { links: {}, aviso: `links de pagamento: ${error.message}` };
  const links: Record<string, string> = {};
  for (const r of (data ?? []) as { movement_id: string; token: string }[]) links[r.movement_id] = r.token;
  return { links };
}
