import { NextResponse } from "next/server";
import { recusaDeCron } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";
import { TETO_LINHAS } from "@/lib/supabase/filtros";
import { provedorReal, statusNotificacoes } from "@/core/financial-os/notifications.server";
import {
  hojeEm, mensagensDoDia, despachar, relatorioVazio, type ConfigAutomacao,
} from "@/core/automacoes";
import { contextoDaRpc, configDaLinha, type ContextoBruto } from "@/lib/automacoes-contexto";
import { registroSupabase } from "@/lib/automacoes-registro";
import { saidasPara } from "@/lib/whatsapp-saidas";
import { rodarLembretesReais } from "@/lib/cadastro-lembretes-servidor";
import { linksDaRegua } from "@/lib/regua-links";
import { registrarExecucaoCron } from "@/lib/cron-execucao";
import { agentesLigados } from "@/core/agentes/ligado";
import type { ConfigAgente } from "@/core/agentes";
import { empresasComCobranca, empresasComAgente, reguaDaEmpresaServidor, rodarAgenteCobranca, rodarAgenteConciliacao, rodarAgenteContasPagar, rodarAgenteCaixa, pedirPorWhatsapp, type RelatorioAgente } from "@/lib/agentes-servidor";

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
  const iniciadoEm = new Date().toISOString();

  const { data: linhas, error } = await admin
    .from("automacoes").select("org_id,tipo,ativo,canais,destinatarios,parametros")
    .eq("ativo", true).limit(TETO_LINHAS);
  if (error) {
    if (!dryRun) await registrarExecucaoCron(admin, "automacoes", iniciadoEm, false, { erro: error.message });
    return NextResponse.json({ ok: false, motivo: error.message }, { status: 500 });
  }

  const porOrg = new Map<string, ConfigAutomacao[]>();
  for (const r of (linhas ?? []) as { org_id: string; tipo: string; ativo: boolean; canais: string[]; destinatarios: unknown; parametros: unknown }[]) {
    const cfg = configDaLinha(r);
    if (!cfg) continue;
    porOrg.set(r.org_id, [...(porOrg.get(r.org_id) ?? []), cfg]);
  }

  // O agente de cobrança (Etapa 2 do plano "AI first"). ⚠️ Com ele ligado, a
  // régua automática da empresa NÃO envia sozinha: cada cobrança passa pelo
  // agente (proposta → aprovação ou limite). Uma porta só para a mesma cobrança.
  let comAgente = new Map<string, ConfigAgente>();
  let erroAgentes: string | undefined;
  if (agentesLigados(process.env)) {
    try { comAgente = await empresasComCobranca(admin); }
    catch (e) { erroAgentes = e instanceof Error ? e.message : "falha ao ler os agentes"; }
  }
  for (const orgId of Array.from(comAgente.keys())) if (!porOrg.has(orgId)) porOrg.set(orgId, []);

  const provedor = provedorReal();
  const registro = registroSupabase(admin);
  const rel = relatorioVazio();
  const empresas: {
    orgId: string; erro?: string;
    automacoes: { tipo: string; mensagens: { canal: string; destino: string }[]; semEnvio?: string; pulados: number }[];
    agenteCobranca?: RelatorioAgente;
    pedidosWhatsapp?: { pedidos: number; falhas: number; erro?: string };
  }[] = [];

  for (const [orgId, todas] of Array.from(porOrg)) {
    const agente = comAgente.get(orgId);
    // ⚠️ Sem saber quem ligou o agente (leitura falhou), a régua de NINGUÉM sai
    // sozinha hoje: quem ligou o agente espera aprovar antes (falha fechada).
    const cfgs = agente || erroAgentes ? todas.filter((c) => c.tipo !== "regua_cobranca") : todas;
    let regua = agente ? todas.find((c) => c.tipo === "regua_cobranca") : undefined;
    if (agente && !regua) {
      try { regua = await reguaDaEmpresaServidor(admin, orgId); }
      catch (e) { empresas.push({ orgId, erro: e instanceof Error ? e.message : "régua", automacoes: [] }); continue; }
    }
    const reguaDoAgente = regua ? { ...regua, ativo: true } : undefined;
    const { data: bruto, error: e } = await admin.rpc("automacao_contexto", { p_org: orgId });
    if (e) { empresas.push({ orgId, erro: e.message, automacoes: [] }); continue; }
    const ctx = contextoDaRpc(orgId, (bruto ?? {}) as ContextoBruto, hoje, appUrl);
    // O link de pagamento que cada título da régua já tem (vazio sem cobrança liberada).
    const { links, aviso: avisoLinks } = await linksDaRegua(admin, ctx, reguaDoAgente ? [...cfgs, reguaDoAgente] : cfgs);
    ctx.linksDePagamento = links;
    const antes = { ...rel };
    const resultados = mensagensDoDia(cfgs, ctx);
    // Quem respondeu SAIR não recebe WhatsApp de nenhuma automação.
    const saidas = await saidasPara(admin, resultados.flatMap((r) => r.mensagens));
    for (const r of resultados) await despachar(orgId, r.mensagens, { registro, provedor, dryRun, saidas }, rel);
    const agenteCobranca = agente && reguaDoAgente
      ? await rodarAgenteCobranca(admin, orgId, agente, ctx, reguaDoAgente, { registro, provedor, dryRun })
        .catch((e: unknown): RelatorioAgente => ({ agente: "cobranca", ativo: true, propostas: 0, paraAprovar: 0, feitasSozinho: 0, executadasAprovadas: 0, falhas: 0, expiradas: 0, soAviso: 0, pulados: 0, erro: e instanceof Error ? e.message : "falha no agente" }))
      : undefined;
    // Etapa 3: o que espera aprovação vai ao WhatsApp de quem aprova (número
    // confirmado), atrás do mesmo interruptor da aprovação de título.
    const pedidosWhatsapp = agenteCobranca?.idsParaAprovar?.length && !dryRun && process.env.WHATSAPP_APROVACAO === "ligado"
      ? await pedirPorWhatsapp(admin, agenteCobranca.idsParaAprovar)
        .catch((e: unknown) => ({ pedidos: 0, falhas: 0, erro: e instanceof Error ? e.message : "falha no pedido" }))
      : undefined;
    empresas.push({
      orgId,
      ...(avisoLinks ? { erro: avisoLinks } : {}),
      ...(agenteCobranca ? { agenteCobranca } : {}),
      ...(pedidosWhatsapp ? { pedidosWhatsapp } : {}),
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
          falhas: rel.falhas - antes.falhas, ja_registrados: rel.jaRegistrados - antes.jaRegistrados, bloqueados: rel.bloqueados - antes.bloqueados,
          automacoes: resultados.map((r) => r.tipo),
          ...(agenteCobranca ? { agente_cobranca: agenteCobranca } : {}),
        },
      });
      // ⚠️ Falha na trilha não é engolida: vai para a resposta, que é o que o
      // cron registra. Os envios já estão em `automacao_envios` de qualquer jeito.
      if (erroTrilha) empresas[empresas.length - 1].erro = `trilha: ${erroTrilha.message}`;
    }
  }

  // O agente de conciliação (Etapa 4): fora do laço das automações, porque não
  // depende de régua nem de provedor. Falha numa empresa não para as outras.
  const conciliacao: { orgId: string; agente?: RelatorioAgente; pedidosWhatsapp?: { pedidos: number; falhas: number; erro?: string }; erro?: string }[] = [];
  if (agentesLigados(process.env)) {
    let comConc = new Map<string, ConfigAgente>();
    try { comConc = await empresasComAgente(admin, "conciliacao"); }
    catch (e) { conciliacao.push({ orgId: "*", erro: e instanceof Error ? e.message : "falha ao ler os agentes" }); }
    for (const [orgId, cfg] of Array.from(comConc)) {
      try {
        const agente = await rodarAgenteConciliacao(admin, orgId, cfg, hoje, { dryRun });
        const pedidosWhatsapp = agente.idsParaAprovar?.length && !dryRun && process.env.WHATSAPP_APROVACAO === "ligado"
          ? await pedirPorWhatsapp(admin, agente.idsParaAprovar)
            .catch((e: unknown) => ({ pedidos: 0, falhas: 0, erro: e instanceof Error ? e.message : "falha no pedido" }))
          : undefined;
        conciliacao.push({ orgId, agente, ...(pedidosWhatsapp ? { pedidosWhatsapp } : {}) });
        if (!dryRun) {
          const { error } = await admin.from("audit_log").insert({
            org_id: orgId, usuario: "cron:agentes", acao: "agente_conciliacao", antes: null, depois: { hoje, ...agente },
          });
          if (error) conciliacao[conciliacao.length - 1].erro = `trilha: ${error.message}`;
        }
      } catch (e) { conciliacao.push({ orgId, erro: e instanceof Error ? e.message : "falha no agente" }); }
    }
  }

  // O agente de contas a pagar (Etapa 6): lê a caixa de entrada e propõe
  // agendar. Nunca grava conta; o Aprovar abre o cadastro na tela.
  const contasPagar: { orgId: string; agente?: RelatorioAgente; erro?: string }[] = [];
  if (agentesLigados(process.env)) {
    let comCP = new Map<string, ConfigAgente>();
    try { comCP = await empresasComAgente(admin, "contas_pagar"); }
    catch (e) { contasPagar.push({ orgId: "*", erro: e instanceof Error ? e.message : "falha ao ler os agentes" }); }
    for (const [orgId, cfg] of Array.from(comCP)) {
      try {
        const agente = await rodarAgenteContasPagar(admin, orgId, cfg, hoje, { dryRun });
        contasPagar.push({ orgId, agente });
        if (!dryRun) {
          const { error } = await admin.from("audit_log").insert({
            org_id: orgId, usuario: "cron:agentes", acao: "agente_contas_pagar", antes: null, depois: { hoje, ...agente },
          });
          if (error) contasPagar[contasPagar.length - 1].erro = `trilha: ${error.message}`;
        }
      } catch (e) { contasPagar.push({ orgId, erro: e instanceof Error ? e.message : "falha no agente" }); }
    }
  }

  // O agente de caixa (Etapa 7): procura o furo da semana e sugere adiar ou
  // antecipar. Nunca muda conta; o Aprovar abre a conta na tela.
  const caixa: { orgId: string; agente?: RelatorioAgente; erro?: string }[] = [];
  if (agentesLigados(process.env)) {
    let comCx = new Map<string, ConfigAgente>();
    try { comCx = await empresasComAgente(admin, "caixa"); }
    catch (e) { caixa.push({ orgId: "*", erro: e instanceof Error ? e.message : "falha ao ler os agentes" }); }
    for (const [orgId, cfg] of Array.from(comCx)) {
      try {
        const agente = await rodarAgenteCaixa(admin, orgId, cfg, hoje, { dryRun });
        caixa.push({ orgId, agente });
        if (!dryRun) {
          const { error } = await admin.from("audit_log").insert({
            org_id: orgId, usuario: "cron:agentes", acao: "agente_caixa", antes: null, depois: { hoje, ...agente },
          });
          if (error) caixa[caixa.length - 1].erro = `trilha: ${error.message}`;
        }
      } catch (e) { caixa.push({ orgId, erro: e instanceof Error ? e.message : "falha no agente" }); }
    }
  }

  // Os lembretes de quem parou no cadastro vão na MESMA vaga de cron (o plano
  // da Vercel tem duas). Falha aqui não derruba as automações: vai na resposta.
  const lembretesCadastro = await rodarLembretesReais(admin, url.origin, dryRun)
    .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : "falha nos lembretes do cadastro" }));

  // O rastro da EXECUÇÃO (guarda `crons-no-ar`), mesmo sem empresa ligada.
  const erroRegistro = dryRun ? null : await registrarExecucaoCron(admin, "automacoes", iniciadoEm, true, {
    empresas: porOrg.size, enviados: rel.enviados, simulados: rel.simulados, falhas: rel.falhas,
  });

  return NextResponse.json({
    ok: true,
    hoje,
    dryRun,
    ...(erroRegistro ? { erroRegistro } : {}),
    lembretesCadastro,
    ...(erroAgentes ? { erroAgentes } : {}),
    empresas: porOrg.size,
    totais: { sairiam: rel.sairiam, enviados: rel.enviados, simulados: rel.simulados, falhas: rel.falhas, jaRegistrados: rel.jaRegistrados, bloqueados: rel.bloqueados },
    porEmpresa: empresas,
    agenteConciliacao: conciliacao,
    agenteContasPagar: contasPagar,
    agenteCaixa: caixa,
    provedores: statusNotificacoes(),
  });
}
