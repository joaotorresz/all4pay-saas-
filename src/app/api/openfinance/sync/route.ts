/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O SYNC PERIÓDICO DO OPEN FINANCE — o cron que nunca existiu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **MEDIDO em produção (19/08/2026), e o diagnóstico é "vivo, não agendado":**
 *
 *   3 pluggy_items · todos com status UPDATED (saudável)
 *   última atualização: 23/06/2026 19:54 — quase DOIS MESES parada
 *   52 bank_transactions · TODAS as 52 vieram do Pluggy · zero por outro caminho
 *   transações de 15/04 a 23/06 — a janela de UMA sincronização, no dia da conexão
 *
 * A integração não está quebrada: ela **rodou uma vez e nunca mais**. Havia dois
 * caminhos — o passivo (webhook) e o ativo (`pluggy-sync-item`) — e o ativo só
 * é invocado no `onSuccess` do widget, ou seja, no instante em que a pessoa
 * conecta a conta. Depois disso, ninguém chama. E `vercel.json` tinha crons
 * para `financial-os` e `recorrencias`, nenhum para o Open Finance.
 *
 * ⚠️ **É por isso que a conciliação está em 5,5%.** 889 lançamentos liquidados
 * contra 52 transações bancárias: o casador não tem com o que casar porque o
 * extrato PAROU DE ENTRAR. Melhorar o algoritmo sem consertar isto é otimizar a
 * ponta errada.
 *
 * ⚠️ **A CADÊNCIA DESEJADA É DUAS VEZES AO DIA, e ela é DÍVIDA.** Um ERP que
 * mostra o extrato de ontem é um ERP que o cliente confere no banco antes de
 * confiar — e aí ele deixou de ser a fonte e virou a segunda opinião. Mas a
 * Vercel recusou o deploy: *"Hobby accounts are limited to daily cron jobs"*.
 * Roda uma vez (08:00 UTC) até o plano subir para Pro ou o agendamento migrar
 * para o `pg_cron` do Supabase, que não tem esse teto. Não é escolha de
 * desenho — é limite de plataforma, e está declarado para não virar paisagem.
 *
 * ⚠️ Este arquivo **não reimplementa o ETL**. Ele chama a MESMA Edge Function
 * que o widget chama (`pluggy-sync-item`), que é idempotente e já convive com o
 * webhook. Um segundo ETL divergiria do primeiro no dia em que o Pluggy mudasse
 * um campo — e aí o extrato entraria diferente conforme a hora do dia.
 */
import { NextResponse } from "next/server";
import { recusaDeCron } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // ⚠️ A4P-078: a regra vive em `lib/cron-auth` — uma implementação só, que
  // FALHA FECHADA. Quatro cópias dela foi a razão de o defeito ser quádruplo.
  const recusa = recusaDeCron(req);
  if (recusa) return NextResponse.json({ ok: false, reason: recusa.motivo }, { status: recusa.status });
  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, reason: "sem SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });

  const { data: items, error } = await admin
    .from("pluggy_items")
    .select("pluggy_item_id, org_id, status")
    .limit(500);
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  const resultados: { item: string; ok: boolean; motivo?: string; transacoes?: number }[] = [];
  for (const it of items ?? []) {
    const id = (it as { pluggy_item_id: string }).pluggy_item_id;
    try {
      const { data, error: e } = await admin.functions.invoke("pluggy-sync-item", { body: { itemId: id } });
      if (e) throw new Error(e.message);
      const r = data as { ok?: boolean; transactions?: number } | null;
      // ⚠️ NÃO engole a falha: um sync que falha calado é indistinguível de um
      // que funciona, e foi exatamente assim que dois meses passaram sem
      // ninguém notar. O resultado por item vai para a resposta E para a trilha.
      if (!r?.ok) throw new Error("sync devolveu falha");
      resultados.push({ item: id, ok: true, transacoes: r.transactions ?? 0 });
    } catch (err) {
      resultados.push({ item: id, ok: false, motivo: err instanceof Error ? err.message : String(err) });
    }
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  // A trilha: sem ela, "o cron rodou" é conhecimento tribal — e a ausência de
  // registro foi o que deixou o materializador de recorrências parado por oito
  // dias sem aparecer em lugar nenhum.
  try {
    await admin.from("audit_log").insert({
      action: falhas > 0 ? "openfinance.sync.parcial" : "openfinance.sync",
      entity_type: "state",
      after: { items: resultados.length, falhas, resultados },
    });
  } catch { /* telemetria não derruba o cron */ }

  return NextResponse.json({
    ok: falhas === 0, items: resultados.length, falhas, resultados,
  }, { status: falhas > 0 ? 207 : 200 });
}
