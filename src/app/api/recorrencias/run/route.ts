import { NextResponse } from "next/server";
import { recusaDeCron } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";
import { datasFaturaCron, refFatura } from "@/lib/recorrencias-sched";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduler de materialização das Recorrências. Para cada `recurrences` ativa
 * (ENTRADA **e** SAÍDA), gera os `movements` PREVISTOS dos próximos
 * `HORIZONTE_DIAS` como pendentes — o tipo do movement herda o tipo da
 * recorrência. IDEMPOTENTE via `reference_code = rec:<recId>:<data>` (índice
 * único parcial `movements_rec_ref_uniq` cobre `rec:%` p/ os dois tipos).
 * `review_status='confirmado'` explícito (previsto programado pelo usuário, não
 * cai na fila de Confirmação). Registra a execução em `audit_log` por org.
 *
 * Usa o admin client (service-role) → passa `org_id` explícito em cada insert.
 * Acionado por Vercel Cron (vercel.json); protegido por CRON_SECRET quando definido.
 */
const HORIZONTE_DIAS = 90;
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Tally { entradas: number; saidas: number; falhas: number; recorrencias: number }

export async function GET(req: Request) {
  // ⚠️ A4P-078: a regra vive em `lib/cron-auth` — uma implementação só, que
  // FALHA FECHADA. Quatro cópias dela foi a razão de o defeito ser quádruplo.
  const recusa = recusaDeCron(req);
  if (recusa) return NextResponse.json({ ok: false, reason: recusa.motivo }, { status: recusa.status });
  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, reason: "sem SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const geradoEm = new Date().toISOString();

  const { data: recs, error } = await semAmostra(admin
    .from("recurrences")
    .select("id,org_id,type,party_id,amount,freq,start_date,end_date,due_day,description,category_id,cost_center_id"))
    .eq("active", true).limit(TETO_LINHAS);
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  const contaPorOrg = new Map<string, string | null>();
  const porOrg = new Map<string, Tally>();
  const tally = (org: string): Tally => {
    let t = porOrg.get(org);
    if (!t) { t = { entradas: 0, saidas: 0, falhas: 0, recorrencias: 0 }; porOrg.set(org, t); }
    return t;
  };

  for (const r of (recs ?? []) as Record<string, string | number | null>[]) {
    const orgId = r.org_id as string;
    const t = tally(orgId);
    t.recorrencias++;

    if (!contaPorOrg.has(orgId)) {
      const { data: accs } = await admin.from("financial_accounts").select("id").eq("org_id", orgId).limit(1);
      contaPorOrg.set(orgId, (accs as { id: string }[] | null)?.[0]?.id ?? null);
    }
    const accId = contaPorOrg.get(orgId);
    if (!accId) continue;

    const endOk = !r.end_date || (r.end_date as string) >= iso(hoje);
    if (!endOk) continue;

    const tipo = (r.type as string) === "saida" ? "saida" : "entrada";
    const datas = datasFaturaCron(r.start_date as string, r.freq as string, (r.due_day as number) ?? null, iso(hoje), HORIZONTE_DIAS);
    for (const d of datas) {
      // Idempotência GARANTIDA pelo banco (índice parcial em rec:%). Insere direto;
      // 23505 = já existe → ignora. Mesma chave para entrada e saída.
      const { error: insErr } = await admin.from("movements").insert({
        org_id: orgId, account_id: accId, type: tipo, status: "pendente",
        amount: r.amount, due_date: d, party_id: r.party_id, category_id: r.category_id,
        cost_center_id: r.cost_center_id, reconciled: false,
        description: r.description ?? (tipo === "saida" ? "Despesa recorrente" : "Fatura recorrente"),
        reference_code: refFatura(r.id as string, d),
        review_status: "confirmado", // previsto programado — não vai p/ a fila de Confirmação
        // ⚠️ O SEGUNDO buraco da mesma família, e o mais caro: aqui a recusa do
        // gatilho `titulo_exige_origem()` cairia num `insert` cujo erro só é
        // contado quando não é 23505 — ou seja, a fatura recorrente deixaria de
        // ser gerada e o único vestígio seria um contador de falhas num job que
        // ninguém abre. Contrato é o que ele materializa.
        origem: "contrato",
      });
      if (!insErr) (tipo === "saida" ? t.saidas++ : t.entradas++);
      else if (insErr.code !== "23505") t.falhas++;
    }
  }

  // Registro de execução por org (compliance/auditoria).
  let entradas = 0, saidas = 0, falhas = 0;
  for (const [orgId, t] of Array.from(porOrg)) {
    entradas += t.entradas; saidas += t.saidas; falhas += t.falhas;
    await admin.from("audit_log").insert({
      org_id: orgId,
      usuario: "cron:recorrencias",
      acao: "materializar_recorrencias",
      antes: null,
      depois: { geradoEm, entradas_geradas: t.entradas, saidas_geradas: t.saidas, falhas: t.falhas, recorrencias_processadas: t.recorrencias },
    });
  }

  return NextResponse.json({
    ok: true, geradoEm, recorrencias: recs?.length ?? 0,
    entradasGeradas: entradas, saidasGeradas: saidas, falhas, orgs: porOrg.size,
  });
}
