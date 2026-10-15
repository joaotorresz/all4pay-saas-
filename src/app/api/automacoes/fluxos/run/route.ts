import { NextResponse } from "next/server";
import { recusaDeCron } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";
import { provedorReal, statusNotificacoes } from "@/core/financial-os/notifications.server";
import { despachar, relatorioVazio } from "@/core/automacoes";
import {
  fluxosDoServidor, devidosAgora, fontesNecessarias, disparosDaEmpresa, vendasDaRpc, type VendasBrutas,
} from "@/core/automacoes/disparo";
import type { DadosDoFluxo } from "@/core/automacoes/fluxo";
import { contextoDaRpc, type ContextoBruto } from "@/lib/automacoes-contexto";
import { registroSupabase } from "@/lib/automacoes-registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O EXECUTOR DOS FLUXOS — a cada 15 minutos (pg_cron), toda empresa com fluxo
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. lê os fluxos de todas as empresas (`automacao_fluxos_ligados`, só a
 *    chave de serviço executa);
 * 2. o núcleo puro (`core/automacoes/disparo`) decide quais vencem AGORA e o
 *    que cada um escreve — e não roda nada que quem administra não salvou;
 * 3. só então lê os dados da fonte (contas a pagar, maquininha) da empresa
 *    que tem fluxo devido — os outros 14 minutos e meio não leem nada;
 * 4. cada envio é GRAVADO em `automacao_envios` antes do provedor (a mesma
 *    trava das automações fixas): reexecutar dentro da tolerância não manda
 *    de novo, e um cron atrasado ainda manda.
 *
 * `?dryRun=1` responde o que sairia, mascarado, sem gravar nem enviar.
 * `?agora=<ISO>` (só com dryRun) simula outro instante — a prova de carga de
 * "segunda às 8h" não precisa esperar a segunda.
 *
 * Protegido por CRON_SECRET (`recusaDeCron`, que falha FECHADA).
 */
export async function GET(req: Request) {
  const recusa = recusaDeCron(req);
  if (recusa) return NextResponse.json({ ok: false, reason: recusa.motivo }, { status: recusa.status });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const pedido = url.searchParams.get("agora");
  const agora = dryRun && pedido && !Number.isNaN(Date.parse(pedido)) ? new Date(pedido) : new Date();
  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, motivo: "chave de serviço ausente: o executor não lê as empresas sem ela" }, { status: 503 });

  const { data: linhas, error } = await admin.rpc("automacao_fluxos_ligados");
  if (error) return NextResponse.json({ ok: false, motivo: error.message }, { status: 500 });

  const provedor = provedorReal();
  const registro = registroSupabase(admin);
  const rel = relatorioVazio();
  const appUrl = url.origin;
  const empresas: {
    orgId: string; erro?: string;
    fluxos: { id: string; nome: string; mensagens: { canal: string; destino: string }[]; semEnvio?: string }[];
  }[] = [];

  for (const l of (linhas ?? []) as { org_id: string; fluxos: unknown; salvo_por_administra: boolean }[]) {
    const devidos = devidosAgora(fluxosDoServidor(l.fluxos), agora);
    if (!devidos.length) continue;
    const orgId = l.org_id;
    const dia = devidos[0].dia;
    const fontes = fontesNecessarias(devidos);

    let dados: DadosDoFluxo;
    try {
      let input = contextoDaRpc(orgId, {}, dia, appUrl).input;
      if (fontes.has("contas_pagar_semana") && l.salvo_por_administra) {
        const { data: bruto, error: e } = await admin.rpc("automacao_contexto", { p_org: orgId });
        if (e) throw new Error(`contexto: ${e.message}`);
        input = contextoDaRpc(orgId, (bruto ?? {}) as ContextoBruto, dia, appUrl).input;
      }
      let maq = { temMaquininha: false, vendas: [] as DadosDoFluxo["vendasMaquininha"] };
      if (fontes.has("maquininha_dia") && l.salvo_por_administra) {
        const { data: bruto, error: e } = await admin.rpc("automacao_vendas_maquininha", { p_org: orgId, p_dia: dia });
        if (e) throw new Error(`maquininha: ${e.message}`);
        maq = vendasDaRpc(bruto as VendasBrutas);
      }
      dados = { input, vendasMaquininha: maq.vendas, temMaquininha: maq.temMaquininha };
    } catch (e) {
      // Uma empresa com erro não para as outras — e o erro vai para a resposta.
      empresas.push({ orgId, erro: e instanceof Error ? e.message : String(e), fluxos: [] });
      continue;
    }

    const antes = { ...rel };
    const resultados = disparosDaEmpresa(devidos, dados, { salvoPorAdministra: l.salvo_por_administra, appUrl });
    for (const r of resultados) await despachar(orgId, r.mensagens, { registro, provedor, dryRun }, rel);
    empresas.push({
      orgId,
      fluxos: resultados.map((r) => ({
        id: r.fluxoId, nome: r.nome,
        mensagens: r.mensagens.map((m) => ({ canal: m.canal, destino: m.destinoMascarado })),
        semEnvio: r.semEnvio?.motivo,
      })),
    });
    // Rastro só quando um fluxo VENCEU: uma linha por empresa a cada 15
    // minutos encheria a trilha de "nada a fazer".
    if (!dryRun) {
      const { error: erroTrilha } = await admin.from("audit_log").insert({
        org_id: orgId,
        usuario: "cron:automacoes-fluxos",
        acao: "executar_fluxos",
        antes: null,
        depois: {
          dia, enviados: rel.enviados - antes.enviados, simulados: rel.simulados - antes.simulados,
          falhas: rel.falhas - antes.falhas, ja_registrados: rel.jaRegistrados - antes.jaRegistrados,
          fluxos: resultados.map((r) => ({ id: r.fluxoId, sem_envio: r.semEnvio?.codigo ?? null })),
        },
      });
      if (erroTrilha) empresas[empresas.length - 1].erro = `trilha: ${erroTrilha.message}`;
    }
  }

  return NextResponse.json({
    ok: true,
    agora: agora.toISOString(),
    dryRun,
    empresasComFluxo: (linhas ?? []).length,
    totais: { sairiam: rel.sairiam, enviados: rel.enviados, simulados: rel.simulados, falhas: rel.falhas, jaRegistrados: rel.jaRegistrados },
    porEmpresa: empresas,
    provedores: statusNotificacoes(),
  });
}
