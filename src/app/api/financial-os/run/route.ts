import { NextResponse } from "next/server";
import { recusaDeCron } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { provedorReal, statusNotificacoes } from "@/core/financial-os/notifications.server";
import {
  hojeEm, mensagensDoDia, despachar, relatorioVazio, type ConfigAutomacao,
} from "@/core/automacoes";
import { contextoDaRpc, configDaLinha, type ContextoBruto } from "@/lib/automacoes-contexto";
import { registroSupabase } from "@/lib/automacoes-registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RUNNER DAS AUTOMAÇÕES — uma execução por dia, por empresa ativa
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Reescrito em 30/09/2026. A versão anterior lia com o cliente do NAVEGADOR,
 * sem sessão: rodava como `anon`, que não lê tabela nenhuma desde a 0027, e
 * morria em "permission denied" antes da primeira regra — por isso nunca deixou
 * rastro diário. E, se rodasse, mandaria o alerta de qualquer empresa para o
 * número GLOBAL do dono da plataforma, sem deduplicação.
 *
 * Agora, para cada empresa com alguma automação LIGADA:
 *   1. lê o contexto pela RPC `automacao_contexto` (SECURITY DEFINER, só a
 *      chave de serviço executa);
 *   2. o núcleo puro (`core/automacoes`) decide o que sai, para quem e com
 *      qual chave;
 *   3. cada mensagem é GRAVADA em `automacao_envios` ANTES do provedor — o
 *      índice único (org, tipo, chave, canal) é o que impede reexecutar de
 *      mandar de novo;
 *   4. sem credencial do provedor, o registro fica SIMULADO, nunca "enviado".
 *
 * `?dryRun=1` — a prova de carga (7ª regra): só LÊ e responde quantas
 * mensagens sairiam e para quem (mascarado). Nenhuma linha é gravada, nenhum
 * provedor é chamado.
 *
 * Acionado pela vaga de cron diária da Vercel (12h UTC = 9h de Brasília),
 * protegido por CRON_SECRET (`recusaDeCron`, que falha FECHADA).
 */
export async function GET(req: Request) {
  const recusa = recusaDeCron(req);
  if (recusa) return NextResponse.json({ ok: false, reason: recusa.motivo }, { status: recusa.status });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const admin = createAdmin();
  // ⚠️ Sem a chave de serviço o runner não tem como ler empresa nenhuma — e diz
  // isso em vez de responder "0 mensagens", que leria como "nada a avisar".
  if (!admin) return NextResponse.json({ ok: false, motivo: "chave de serviço ausente: o runner não lê as empresas sem ela" }, { status: 503 });

  const hoje = hojeEm(new Date());
  const appUrl = url.origin;

  const { data: linhas, error } = await admin
    .from("automacoes").select("org_id,tipo,ativo,canais,destinatarios,parametros")
    .eq("ativo", true).limit(TETO_LINHAS);
  if (error) return NextResponse.json({ ok: false, motivo: error.message }, { status: 500 });

  const porOrg = new Map<string, ConfigAutomacao[]>();
  for (const r of (linhas ?? []) as { org_id: string; tipo: string; ativo: boolean; canais: string[]; destinatarios: unknown; parametros: unknown }[]) {
    const cfg = configDaLinha(r);
    if (!cfg) continue;
    porOrg.set(r.org_id, [...(porOrg.get(r.org_id) ?? []), cfg]);
  }

  const provedor = provedorReal();
  const registro = registroSupabase(admin);
  const rel = relatorioVazio();
  const empresas: {
    orgId: string; erro?: string;
    automacoes: { tipo: string; mensagens: { canal: string; destino: string }[]; semEnvio?: string; pulados: number }[];
  }[] = [];

  for (const [orgId, cfgs] of Array.from(porOrg)) {
    const { data: bruto, error: e } = await admin.rpc("automacao_contexto", { p_org: orgId });
    if (e) { empresas.push({ orgId, erro: e.message, automacoes: [] }); continue; }
    const ctx = contextoDaRpc(orgId, (bruto ?? {}) as ContextoBruto, hoje, appUrl);
    const antes = { ...rel };
    const resultados = mensagensDoDia(cfgs, ctx);
    for (const r of resultados) await despachar(orgId, r.mensagens, { registro, provedor, dryRun }, rel);
    empresas.push({
      orgId,
      automacoes: resultados.map((r) => ({
        tipo: r.tipo,
        mensagens: r.mensagens.map((m) => ({ canal: m.canal, destino: m.destinoMascarado })),
        semEnvio: r.semEnvio?.motivo, pulados: r.pulados.length,
      })),
    });
    // O rastro diário que o runner antigo nunca deixou: uma linha por empresa,
    // mesmo quando nada saiu — "rodou e não havia o que avisar" é diferente de
    // "não rodou".
    if (!dryRun) {
      const { error: erroTrilha } = await admin.from("audit_log").insert({
        org_id: orgId,
        usuario: "cron:automacoes",
        acao: "executar_automacoes",
        antes: null,
        depois: {
          hoje, enviados: rel.enviados - antes.enviados, simulados: rel.simulados - antes.simulados,
          falhas: rel.falhas - antes.falhas, ja_registrados: rel.jaRegistrados - antes.jaRegistrados,
          automacoes: resultados.map((r) => r.tipo),
        },
      });
      // ⚠️ Falha na trilha não é engolida: vai para a resposta, que é o que o
      // cron registra. Os envios já estão em `automacao_envios` de qualquer jeito.
      if (erroTrilha) empresas[empresas.length - 1].erro = `trilha: ${erroTrilha.message}`;
    }
  }

  return NextResponse.json({
    ok: true,
    hoje,
    dryRun,
    empresas: porOrg.size,
    totais: { sairiam: rel.sairiam, enviados: rel.enviados, simulados: rel.simulados, falhas: rel.falhas, jaRegistrados: rel.jaRegistrados },
    porEmpresa: empresas,
    provedores: statusNotificacoes(),
  });
}
