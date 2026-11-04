/**
 * Grava que um cron COMPLETOU (`cron_execucoes`), mesmo sem trabalho a fazer.
 * O consumidor é a guarda agendada `crons-no-ar`, que reprova o cron diário
 * parado há mais de 26 horas (ver `core/crons`).
 *
 * ⚠️ A falha ao gravar não derruba o cron (o trabalho já foi feito), mas não é
 * engolida: volta para a resposta da rota, que é o que a Vercel registra.
 */
import type { createAdmin } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdmin>>;

export async function registrarExecucaoCron(
  admin: Admin, job: string, iniciadoEm: string, ok: boolean, resumo: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await admin.from("cron_execucoes").insert({
    job, iniciado_em: iniciadoEm, terminado_em: new Date().toISOString(), ok, resumo,
  });
  return error ? `registro da execução: ${error.message}` : null;
}
