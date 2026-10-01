/**
 * A "PRIMEIRA CONTA" dos escritores automáticos — só entre as ATIVAS.
 *
 * Seis caminhos gravam lançamento sem a pessoa escolher a conta (reembolso
 * aprovado, recorrência ativada, documento avulso do upload, importação do
 * extrato, o fechamento da Central e o cron de recorrências): cada um pegava
 * `financial_accounts … limit(1)`. Desde `20260930180000` o banco RECUSA
 * lançamento novo em conta inativa (`lancamento_em_cadastro_vigente`), e sem
 * este filtro a primeira conta desativada que caísse no `limit(1)` derrubaria
 * a importação inteira com "A conta … está inativa".
 *
 * ⚠️ O filtro por `ativo` tem QUEDA declarada: entre o deploy do código e o
 * job `migrar` do CI a coluna ainda não existe, e pedir por ela devolve erro
 * de coluna ausente — que aqui cai no `limit(1)` de antes (nenhuma conta é
 * inativa sem a coluna). Qualquer outro erro devolve `null`, como os seis
 * escritores já tratavam a ausência de conta.
 *
 * Sem `"use client"` de propósito: o cron (rota de servidor) também chama.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const COLUNA_AUSENTE = /column .* does not exist|could not find the .* column|42703|PGRST204/i;

export async function primeiraContaAtiva(
  supabase: SupabaseClient,
  orgId?: string,
): Promise<string | null> {
  const id = (data: unknown) => (data as { id: string }[] | null)?.[0]?.id ?? null;
  const { data, error } = orgId
    ? await supabase.from("financial_accounts").select("id").eq("org_id", orgId).eq("ativo", true).limit(1)
    : await supabase.from("financial_accounts").select("id").eq("ativo", true).limit(1);
  if (!error) return id(data);
  if (!COLUNA_AUSENTE.test(`${error.code ?? ""} ${error.message ?? ""}`)) return null;
  const antes = orgId
    ? await supabase.from("financial_accounts").select("id").eq("org_id", orgId).limit(1)
    : await supabase.from("financial_accounts").select("id").limit(1);
  return antes.error ? null : id(antes.data);
}
