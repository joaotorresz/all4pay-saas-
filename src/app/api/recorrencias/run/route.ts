import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { datasFaturaCron, refFatura } from "@/lib/recorrencias-sched";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduler de faturamento das Recorrências (N6 — "a recorrência recorre sozinha").
 * Para cada `recurrences` ativa (entrada), materializa as faturas dos próximos
 * ~90 dias como `movements` de entrada PREVISTOS. IDEMPOTENTE via
 * `reference_code = rec:<recId>:<data>` (reexecutar não duplica). Acionado por
 * Vercel Cron (ver vercel.json); protegido por CRON_SECRET quando definido.
 *
 * Usa o admin client (service-role) → passa `org_id` explícito em cada insert.
 */
const HORIZONTE_DIAS = 90;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, reason: "sem SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const { data: recs, error } = await admin
    .from("recurrences")
    .select("id,org_id,party_id,amount,freq,start_date,end_date,due_day,description,category_id,cost_center_id")
    .eq("active", true)
    .eq("type", "entrada");
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  let geradas = 0;
  let falhas = 0;
  const contaPorOrg = new Map<string, string | null>();
  for (const r of (recs ?? []) as Record<string, string | number | null>[]) {
    const orgId = r.org_id as string;
    // 1 conta por org (cache)
    if (!contaPorOrg.has(orgId)) {
      const { data: accs } = await admin.from("financial_accounts").select("id").eq("org_id", orgId).limit(1);
      contaPorOrg.set(orgId, (accs as { id: string }[] | null)?.[0]?.id ?? null);
    }
    const accId = contaPorOrg.get(orgId);
    if (!accId) continue;

    const endOk = !r.end_date || (r.end_date as string) >= iso(hoje);
    if (!endOk) continue;

    const datas = datasFaturaCron(r.start_date as string, r.freq as string, (r.due_day as number) ?? null, iso(hoje), HORIZONTE_DIAS);
    for (const d of datas) {
      // Idempotência GARANTIDA pelo banco: índice único parcial
      // movements_rec_ref_uniq (org_id, reference_code) WHERE reference_code LIKE 'rec:%'.
      // Inserimos direto; a corrida é resolvida pela constraint (23505 = já existe).
      const { error: insErr } = await admin.from("movements").insert({
        org_id: orgId, account_id: accId, type: "entrada", status: "pendente",
        amount: r.amount, due_date: d, party_id: r.party_id, category_id: r.category_id,
        cost_center_id: r.cost_center_id, reconciled: false,
        description: r.description ?? "Fatura recorrente", reference_code: refFatura(r.id as string, d),
      });
      if (!insErr) geradas++;
      else if (insErr.code !== "23505") falhas++;
    }
  }

  return NextResponse.json({ ok: true, geradoEm: new Date().toISOString(), recorrencias: recs?.length ?? 0, faturasGeradas: geradas, falhas });
}
