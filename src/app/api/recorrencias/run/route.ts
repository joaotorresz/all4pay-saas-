import { NextResponse } from "next/server";
import { recusaDeCron } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";
import { datasFaturaCron, refFatura } from "@/lib/recorrencias-sched";
import { simularMaterializacao, type RecorrenciaParaSimular } from "@/lib/recorrencias-simulacao";
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
 *
 * ⚠️ **Modo simulação (`?dryRun=1`), a SÉTIMA regra do CLAUDE.md.** O cron está
 * com 0 execuções na trilha; religá-lo sem provar o que ele geraria publica uma
 * suposição em produção. Com `dryRun=1` a rota faz SÓ leituras (recurrences,
 * saldo das contas, `reference_code` já materializados) e devolve os títulos
 * que SERIAM criados + o efeito no saldo projetado por organização — nenhum
 * `insert` em `movements` nem em `audit_log` acontece nesse caminho. O job
 * continua desligado: nada aqui muda `vercel.json` nem o CRON_SECRET.
 */
const HORIZONTE_DIAS = 90;
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Tally { entradas: number; saidas: number; falhas: number; recorrencias: number }

type Admin = NonNullable<ReturnType<typeof createAdmin>>;

/** Só leitura: recorrências ativas, sem filtro de amostra (mesma consulta do caminho real). */
async function lerRecorrenciasAtivas(admin: Admin) {
  return semAmostra(admin
    .from("recurrences")
    .select("id,org_id,type,party_id,amount,freq,start_date,end_date,due_day,description,category_id,cost_center_id"))
    .eq("active", true).limit(TETO_LINHAS);
}

/**
 * Modo simulação: só leitura. Lê o saldo consolidado (todas as contas) por
 * org e quais `reference_code` candidatos já existem em `movements`, e
 * delega o cálculo à função pura `simularMaterializacao` — nada é gravado.
 */
async function simular(admin: Admin, recs: Record<string, string | number | null>[], hojeISO: string) {
  const orgIds = Array.from(new Set(recs.map((r) => r.org_id as string)));

  const contaPorOrg = new Map<string, { temConta: boolean; saldo: number | null }>();
  for (const orgId of orgIds) {
    const { data: accs } = await admin.from("financial_accounts").select("balance").eq("org_id", orgId).limit(TETO_LINHAS);
    const lista = (accs ?? []) as { balance: number | null }[];
    const saldo = lista.length ? lista.reduce((acc, a) => acc + (a.balance ?? 0), 0) : null;
    contaPorOrg.set(orgId, { temConta: lista.length > 0, saldo });
  }

  const entrada: RecorrenciaParaSimular[] = recs.map((r) => ({
    id: r.id as string,
    orgId: r.org_id as string,
    type: r.type as string,
    amount: Number(r.amount),
    freq: r.freq as string,
    startDate: r.start_date as string,
    endDate: (r.end_date as string | null) ?? null,
    dueDay: (r.due_day as number | null) ?? null,
  }));

  // Candidatos de reference_code (a mesma agenda que o cron real usaria) para
  // saber quais já foram materializados — só leitura, em lotes.
  const candidatos: string[] = [];
  for (const r of entrada) {
    if (!contaPorOrg.get(r.orgId)?.temConta) continue;
    if (r.endDate && r.endDate < hojeISO) continue;
    for (const d of datasFaturaCron(r.startDate, r.freq, r.dueDay ?? null, hojeISO, HORIZONTE_DIAS)) {
      candidatos.push(refFatura(r.id, d));
    }
  }
  const existentes = new Set<string>();
  const LOTE = 500;
  for (let i = 0; i < candidatos.length; i += LOTE) {
    const lote = candidatos.slice(i, i + LOTE);
    if (!lote.length) continue;
    const { data } = await semAmostra(admin.from("movements").select("reference_code"))
      .in("reference_code", lote).limit(TETO_LINHAS);
    for (const m of (data ?? []) as { reference_code: string }[]) existentes.add(m.reference_code);
  }

  const resultado = simularMaterializacao({
    hojeISO,
    horizonteDias: HORIZONTE_DIAS,
    recorrencias: entrada,
    temConta: (orgId) => contaPorOrg.get(orgId)?.temConta ?? false,
    referenciaExiste: (ref) => existentes.has(ref),
    saldoDaOrg: (orgId) => contaPorOrg.get(orgId)?.saldo ?? null,
  });

  const titulosNovos = resultado.titulos.filter((t) => !t.jaExiste).length;
  return NextResponse.json({
    ok: true,
    dryRun: true,
    geradoEm: new Date().toISOString(),
    horizonteDias: resultado.horizonteDias,
    recorrenciasProcessadas: resultado.recorrenciasProcessadas,
    recorrenciasSemConta: resultado.recorrenciasSemConta,
    titulosNovos,
    titulosJaMaterializados: resultado.titulos.length - titulosNovos,
    titulos: resultado.titulos,
    porOrg: resultado.porOrg,
  });
}

export async function GET(req: Request) {
  // ⚠️ A4P-078: a regra vive em `lib/cron-auth` — uma implementação só, que
  // FALHA FECHADA. Quatro cópias dela foi a razão de o defeito ser quádruplo.
  const recusa = recusaDeCron(req);
  if (recusa) return NextResponse.json({ ok: false, reason: recusa.motivo }, { status: recusa.status });
  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, reason: "sem SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const hojeISO = iso(hoje);
  const geradoEm = new Date().toISOString();

  const { data: recs, error } = await lerRecorrenciasAtivas(admin);
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  if (dryRun) {
    return simular(admin, (recs ?? []) as Record<string, string | number | null>[], hojeISO);
  }

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
        org_id: orgId, account_id: accId, type: tipo,
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
