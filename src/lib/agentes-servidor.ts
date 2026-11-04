/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O SERVIDOR DOS AGENTES — quem cria proposta e quem executa (chave de serviço)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Só aqui uma proposta nasce (o banco só deixa a chave de serviço inserir).
 * Duas portas chamam:
 *   · o runner diário (`/api/financial-os/run`) — produz as propostas do dia,
 *     expira as de ontem e executa as aprovadas que ainda não saíram;
 *   · `/api/agentes/executar` — executa NA HORA a proposta que a pessoa acabou
 *     de aprovar.
 *
 * ⚠️ As duas executam pelo MESMO caminho (`executarCobranca`), que refaz a
 * mensagem do dia antes de enviar e envia pelo `despachar` das automações: a
 * reserva em `automacao_envios` (índice único) é a trava contra enviar duas
 * vezes, mesmo com as duas portas rodando ao mesmo tempo.
 *
 * ⚠️ Atrás do interruptor `AGENTES=ligado` (leitor único em `core/agentes`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  configPadrao as configPadraoAutomacao, despachar, relatorioVazio,
  type ConfigAutomacao, type ContextoAutomacao, type ProvedorEnvio, type RegistroEnvios,
} from "@/core/automacoes";
import { configPadrao, type ConfigAgente, type NivelAgente } from "@/core/agentes";
import {
  propostasDeCobranca, planejarCobranca, propostaDoDia, resultadoDoEnvio,
  MOTIVO_EXPIRADA, ERRO_FORA_DO_DIA, ERRO_SEM_COBRANCA, MOTIVO_NO_LIMITE,
  type PropostaDeCobranca,
} from "@/core/agentes/cobranca";
import { contextoDaRpc, configDaLinha, type ContextoBruto } from "@/lib/automacoes-contexto";
import { linksDaRegua } from "@/lib/regua-links";
import { saidasPara } from "@/lib/whatsapp-saidas";
import { enviarWhatsapp, statusNotificacoes } from "@/core/financial-os/notifications.server";
import { descricaoDe, type IdAgente } from "@/core/agentes";
import { mensagemDoPedidoAgente, avisoDoResto, TETO_PEDIDOS_POR_EXECUCAO } from "@/core/agentes/whatsapp";
import { formatBRL } from "@/lib/format";
import { semAmostra } from "@/lib/supabase/filtros";
import { casarExtrato, type MovimentoParaCasar } from "@/core/conciliacao/pares";
import { propostasDeConciliacao, planejarConciliacao, MOTIVO_PAR_DESFEITO } from "@/core/agentes/conciliacao";
import {
  propostasDeContasPagar, planejarContasPagar, desfechoDoDocumento, MOTIVO_DOCUMENTO, type ContaAberta,
} from "@/core/agentes/contas-pagar";
import {
  documentosDasFontes, montarCaixaEntrada,
  type DecisaoEntrada, type DocumentoOCR, type MensagemEmail,
} from "@/core/caixa-entrada";
import type { BoletoRecebido, NFRecebida } from "@/core/compras";
import { propostasDeCaixa, planejarCaixa, propostaDeCaixaVale } from "@/core/agentes/caixa";

export interface DepsAgente {
  registro: RegistroEnvios;
  provedor: ProvedorEnvio;
  dryRun?: boolean;
}

export interface RelatorioAgente {
  agente: "cobranca" | "conciliacao" | "contas_pagar" | "caixa";
  ativo: boolean;
  propostas: number;
  paraAprovar: number;
  feitasSozinho: number;
  executadasAprovadas: number;
  falhas: number;
  expiradas: number;
  /** Nível 0: o que ele faria, sem propor nada. */
  soAviso: number;
  pulados: number;
  /** As propostas novas que esperam aprovação (para o pedido pelo WhatsApp). */
  idsParaAprovar?: string[];
  erro?: string;
}

const relatorio = (ativo: boolean, agente: RelatorioAgente["agente"] = "cobranca"): RelatorioAgente => ({
  agente, ativo, propostas: 0, paraAprovar: 0, feitasSozinho: 0, executadasAprovadas: 0,
  falhas: 0, expiradas: 0, soAviso: 0, pulados: 0,
});

/** A linha de `agentes` → configuração (o banco já recusou o que não cabe). */
export function configDaLinhaDeAgente(l: { ativo?: boolean | null; nivel?: number | null; limite_valor?: number | string | null; limite_dia?: number | null } | null, agente: IdAgente = "cobranca"): ConfigAgente {
  if (!l) return configPadrao(agente);
  return {
    agente, ativo: !!l.ativo,
    nivel: Math.max(0, Math.min(3, Number(l.nivel) || 0)) as NivelAgente,
    limiteValor: Number(l.limite_valor) || 0, limiteDia: Number(l.limite_dia) || 0,
  };
}

/** As empresas com o agente LIGADO, com a configuração de cada uma. */
export async function empresasComAgente(admin: SupabaseClient, agente: IdAgente): Promise<Map<string, ConfigAgente>> {
  const { data, error } = await admin
    .from("agentes").select("org_id,ativo,nivel,limite_valor,limite_dia")
    .eq("agente", agente).eq("ativo", true).limit(5000);
  if (error) throw new Error(`agentes: ${error.message}`);
  const out = new Map<string, ConfigAgente>();
  for (const l of (data ?? []) as { org_id: string; ativo: boolean; nivel: number; limite_valor: number | string; limite_dia: number }[]) {
    out.set(l.org_id, configDaLinhaDeAgente(l, agente));
  }
  return out;
}

export const empresasComCobranca = (admin: SupabaseClient) => empresasComAgente(admin, "cobranca");

/** A régua da empresa (ligada ou não). Sem linha, a régua padrão. */
export async function reguaDaEmpresaServidor(admin: SupabaseClient, orgId: string): Promise<ConfigAutomacao> {
  const { data, error } = await admin
    .from("automacoes").select("tipo,ativo,canais,destinatarios,parametros")
    .eq("org_id", orgId).eq("tipo", "regua_cobranca").maybeSingle();
  if (error) throw new Error(`régua: ${error.message}`);
  const cfg = data ? configDaLinha(data as { tipo: string }) : null;
  return { ...(cfg ?? configPadraoAutomacao("regua_cobranca")), ativo: true };
}

/** O contexto de UMA empresa, com os links de pagamento da régua. */
export async function contextoDoAgente(admin: SupabaseClient, orgId: string, hoje: string, appUrl: string, regua: ConfigAutomacao): Promise<ContextoAutomacao> {
  const { data: bruto, error } = await admin.rpc("automacao_contexto", { p_org: orgId });
  if (error) throw new Error(`contexto: ${error.message}`);
  const ctx = contextoDaRpc(orgId, (bruto ?? {}) as ContextoBruto, hoje, appUrl);
  const { links } = await linksDaRegua(admin, ctx, [{ ...regua, ativo: true }]);
  ctx.linksDePagamento = links;
  return ctx;
}

interface LinhaProposta { id: string; chave: string; estado: string; decidida_por: string | null }

/**
 * Envia UMA proposta (aprovada, ou dentro do limite) e grava o resultado.
 * ⚠️ A mensagem é a de HOJE: se a proposta não está mais na régua do dia,
 * nada sai e a proposta termina com o motivo.
 */
async function executarUma(
  admin: SupabaseClient, orgId: string, linha: LinhaProposta, doDia: Map<string, PropostaDeCobranca>, hoje: string,
  deps: DepsAgente, sozinho: boolean,
): Promise<"executada" | "falhou"> {
  const agora = new Date().toISOString();
  const p = propostaDoDia(linha.chave, hoje) ? doDia.get(linha.chave) : undefined;
  const marcas = sozinho ? { decidida_em: agora, motivo: MOTIVO_NO_LIMITE } : {};
  if (!p) {
    if (!deps.dryRun) {
      await admin.from("agente_propostas")
        .update({ estado: "falhou", erro: propostaDoDia(linha.chave, hoje) ? ERRO_SEM_COBRANCA : ERRO_FORA_DO_DIA, ...marcas })
        .eq("id", linha.id);
    }
    return "falhou";
  }
  const saidas = await saidasPara(admin, [p.mensagem]);
  const rel = await despachar(orgId, [p.mensagem], { registro: deps.registro, provedor: deps.provedor, dryRun: deps.dryRun, saidas }, relatorioVazio());
  const r = resultadoDoEnvio(rel.itens[0]);
  if (!deps.dryRun) {
    const { error } = await admin.from("agente_propostas").update({
      estado: r.estado, erro: r.erro, ...(r.estado === "executada" ? { executada_em: agora } : {}), ...marcas,
    }).eq("id", linha.id);
    if (error) throw new Error(`proposta ${linha.id}: ${error.message}`);
  }
  return r.estado;
}

/**
 * O agente de cobrança numa empresa, num dia: expira o que é de ontem, propõe
 * o de hoje, faz sozinho o que o nível deixa e envia o que já foi aprovado.
 * Reexecutar no mesmo dia não cria proposta nem envio novo (índices únicos).
 */
export async function rodarAgenteCobranca(
  admin: SupabaseClient, orgId: string, config: ConfigAgente, ctx: ContextoAutomacao, regua: ConfigAutomacao, deps: DepsAgente,
): Promise<RelatorioAgente> {
  const rel = relatorio(config.ativo);
  if (!config.ativo) return rel;
  const hoje = ctx.hoje;

  const { data: abertas, error: e1 } = await admin
    .from("agente_propostas").select("id,chave,estado,decidida_por")
    .eq("org_id", orgId).eq("agente", "cobranca").in("estado", ["pendente", "aprovada"]).limit(2000);
  if (e1) return { ...rel, erro: `propostas: ${e1.message}` };

  // 1. o que é de outro dia e ninguém decidiu, expira
  const vencidas = ((abertas ?? []) as LinhaProposta[]).filter((l) => l.estado === "pendente" && !propostaDoDia(l.chave, hoje));
  if (vencidas.length && !deps.dryRun) {
    const { error } = await admin.from("agente_propostas")
      .update({ estado: "expirada", motivo: MOTIVO_EXPIRADA })
      .in("id", vencidas.map((l) => l.id)).eq("estado", "pendente");
    if (error) return { ...rel, erro: `expirar: ${error.message}` };
  }
  rel.expiradas = vencidas.length;

  // 2. as de hoje
  const { propostas, pulados } = propostasDeCobranca(regua, ctx);
  rel.pulados = pulados.length;
  const doDia = new Map(propostas.map((p) => [p.chave, p]));

  const { data: deHoje, error: e2 } = await admin
    .from("agente_propostas").select("id,chave,estado,decidida_por")
    .eq("org_id", orgId).eq("agente", "cobranca").like("chave", `%:${hoje}`).limit(2000);
  if (e2) return { ...rel, erro: `propostas de hoje: ${e2.message}` };
  const existentes = new Map(((deHoje ?? []) as LinhaProposta[]).map((l) => [l.chave, l]));
  const feitasHoje = ((deHoje ?? []) as LinhaProposta[]).filter((l) => l.estado === "executada" && !l.decidida_por).length;

  const novas = propostas.filter((p) => !existentes.has(p.chave));
  const plano = planejarCobranca(novas, config, feitasHoje);
  for (const { chave, destino } of plano) {
    const p = doDia.get(chave)!;
    if (destino === "avisar") { rel.soAviso++; continue; }
    rel.propostas++;
    if (deps.dryRun) { if (destino === "aprovar") rel.paraAprovar++; else rel.feitasSozinho++; continue; }
    const { data: criada, error } = await admin.from("agente_propostas").upsert({
      org_id: orgId, agente: "cobranca", chave: p.chave, titulo: p.titulo, porque: p.porque, valor: p.valor, dados: p.dados,
    }, { onConflict: "org_id,agente,chave", ignoreDuplicates: true }).select("id,chave,estado,decidida_por").limit(1);
    if (error) return { ...rel, erro: `criar proposta: ${error.message}` };
    const linha = ((criada ?? []) as LinhaProposta[])[0];
    // Outra execução criou ao mesmo tempo: ela decide o destino.
    if (!linha) continue;
    if (destino === "aprovar") { rel.paraAprovar++; (rel.idsParaAprovar ??= []).push(linha.id); continue; }
    const r = await executarUma(admin, orgId, linha, doDia, hoje, deps, true);
    if (r === "executada") rel.feitasSozinho++; else rel.falhas++;
  }

  // 3. as aprovadas que ainda não saíram (a porta da tela pode ter falhado)
  for (const l of ((abertas ?? []) as LinhaProposta[]).filter((x) => x.estado === "aprovada")) {
    const r = await executarUma(admin, orgId, l, doDia, hoje, deps, false);
    if (r === "executada") rel.executadasAprovadas++; else rel.falhas++;
  }
  return rel;
}

/**
 * Executa NA HORA uma proposta que acabou de ser aprovada (a porta da tela).
 * ⚠️ Só a APROVADA: quem chama não decide nada aqui, só antecipa o envio do
 * que alguém com permissão já aprovou pela função do banco.
 */
export async function executarAprovada(
  admin: SupabaseClient, orgId: string, propostaId: string, hoje: string, appUrl: string, deps: DepsAgente,
): Promise<{ estado: string; erro?: string | null; agente?: string }> {
  const { data: l, error } = await admin
    .from("agente_propostas").select("id,chave,estado,decidida_por,agente,org_id,erro")
    .eq("id", propostaId).eq("org_id", orgId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!l) return { estado: "inexistente", erro: "Proposta não encontrada nesta empresa." };
  const linha = l as LinhaProposta & { agente: string; erro: string | null };
  if (linha.estado !== "aprovada") return { estado: linha.estado, erro: linha.erro };
  if (linha.agente === "conciliacao") return { ...(await conciliarProposta(admin, linha.id, false, deps.dryRun)), agente: "conciliacao" };
  if (linha.agente === "contas_pagar") return { ...(await concluirContaPagar(admin, linha.id)), agente: "contas_pagar" };
  if (linha.agente === "caixa") return { ...(await concluirCaixa(admin, linha.id, deps.dryRun)), agente: "caixa" };
  if (linha.agente !== "cobranca") return { estado: linha.estado, erro: "Este agente ainda não executa." };
  const regua = await reguaDaEmpresaServidor(admin, orgId);
  const ctx = await contextoDoAgente(admin, orgId, hoje, appUrl, regua);
  const doDia = new Map(propostasDeCobranca(regua, ctx).propostas.map((p) => [p.chave, p]));
  const estado = await executarUma(admin, orgId, linha, doDia, hoje, deps, false);
  const { data: depois } = await admin.from("agente_propostas").select("estado,erro").eq("id", propostaId).maybeSingle();
  return { estado: (depois as { estado: string } | null)?.estado ?? estado, erro: (depois as { erro: string | null } | null)?.erro ?? null, agente: "cobranca" };
}

/**
 * Pede a decisão pelo WhatsApp a quem aprova E tem o número confirmado
 * (Etapa 3). ⚠️ O banco escolhe quem recebe e gera o código
 * (`agente_pedir_whatsapp`); aqui só se escreve e se envia. Sem provedor
 * configurado, nenhum código é gerado (simulado não é pedido).
 */
export async function pedirPorWhatsapp(
  admin: SupabaseClient, ids: string[],
  enviar: typeof enviarWhatsapp = enviarWhatsapp, provedorAtivo = statusNotificacoes().whatsapp,
): Promise<{ pedidos: number; falhas: number; erro?: string }> {
  if (!ids.length) return { pedidos: 0, falhas: 0 };
  if (!provedorAtivo) return { pedidos: 0, falhas: 0, erro: "WhatsApp sem provedor neste ambiente: nenhum pedido saiu" };
  const agora = ids.slice(0, TETO_PEDIDOS_POR_EXECUCAO);
  const { data: props, error } = await admin.from("agente_propostas")
    .select("id,agente,titulo,porque,valor").in("id", agora).limit(TETO_PEDIDOS_POR_EXECUCAO);
  if (error) return { pedidos: 0, falhas: 0, erro: `propostas: ${error.message}` };
  let pedidos = 0, falhas = 0;
  const avisados = new Set<string>();
  for (const p of (props ?? []) as { id: string; agente: IdAgente; titulo: string; porque: string; valor: number | string | null }[]) {
    const { data: linhas, error: e } = await admin.rpc("agente_pedir_whatsapp", { p_proposta: p.id });
    if (e) { falhas++; continue; }
    for (const l of (linhas ?? []) as { fone: string; codigo: string }[]) {
      const texto = mensagemDoPedidoAgente({
        agente: descricaoDe(p.agente).nome, titulo: p.titulo, porque: p.porque,
        valorFormatado: p.valor == null ? null : formatBRL(Number(p.valor)), codigo: l.codigo,
      });
      const r = await enviar(`+${l.fone}`, texto);
      if (r.ok) { pedidos++; avisados.add(l.fone); } else falhas++;
    }
  }
  // O resto da leva não vira uma mensagem por proposta: um aviso só.
  const resto = ids.length - agora.length;
  if (resto > 0) for (const fone of Array.from(avisados)) await enviar(`+${fone}`, avisoDoResto(resto));
  return { pedidos, falhas };
}

/* ═════════════════════════ O AGENTE DE CONCILIAÇÃO (Etapa 4) ═════════════════
 * Os pares são os MESMOS da aba Conciliar (`casarExtrato`), lidos com a chave
 * de serviço e o filtro da empresa. Quem concilia é o banco
 * (`agente_conciliar`), pela mesma regra do botão da tela, e grava o
 * resultado na proposta na mesma transação.
 */

const COLS_CASAR = "id,type,amount,due_date,paid_date,party_id,description";

/** Concilia UMA proposta pelo banco. Na prova sem envio, nada muda. */
async function conciliarProposta(admin: SupabaseClient, id: string, sozinho: boolean, dryRun?: boolean): Promise<{ estado: string; erro?: string | null }> {
  if (dryRun) return { estado: sozinho ? "pendente" : "aprovada", erro: "Prova sem envio: nada foi conciliado." };
  const { data, error } = await admin.rpc("agente_conciliar", { p_proposta: id, p_sozinho: sozinho });
  // O banco recusou ANTES de mudar qualquer coisa: a proposta segue onde estava.
  if (error) return { estado: sozinho ? "pendente" : "aprovada", erro: error.message };
  const r = (data ?? {}) as { estado?: string; erro?: string | null };
  return { estado: r.estado ?? "falhou", erro: r.erro ?? null };
}

/** Os pares de hoje de UMA empresa: títulos em aberto × extrato do banco ainda sem par. */
export async function paresDaEmpresa(admin: SupabaseClient, orgId: string) {
  const [pend, ofs] = await Promise.all([
    semAmostra(admin.from("movements").select(COLS_CASAR)).eq("org_id", orgId).eq("status", "pendente").limit(5000),
    semAmostra(admin.from("movements").select(COLS_CASAR)).eq("org_id", orgId).eq("status", "pago")
      .like("reference_code", "pluggy:%").is("conciliado_com", null).limit(5000),
  ]);
  if (pend.error) throw new Error(`títulos: ${pend.error.message}`);
  if (ofs.error) throw new Error(`extrato: ${ofs.error.message}`);
  return casarExtrato((pend.data ?? []) as MovimentoParaCasar[], (ofs.data ?? []) as MovimentoParaCasar[]);
}

interface LinhaPropostaConc { id: string; chave: string; estado: string; decidida_por: string | null; dados: { previsto?: string; extrato?: string } | null }

/**
 * O agente de conciliação numa empresa: solta o que não fecha mais, concilia
 * o que já foi aprovado, propõe os pares novos e concilia sozinho só o que o
 * nível deixa (e o banco confere de novo). Reexecutar não propõe o mesmo par
 * duas vezes (índice único na chave do par).
 */
export async function rodarAgenteConciliacao(
  admin: SupabaseClient, orgId: string, config: ConfigAgente, hoje: string, deps: { dryRun?: boolean } = {},
): Promise<RelatorioAgente> {
  const rel = relatorio(config.ativo, "conciliacao");
  if (!config.ativo) return rel;

  const { pares } = await paresDaEmpresa(admin, orgId);
  const doPar = new Set(pares.map((p) => `${p.pendId}:${p.ofId}`));

  const { data: abertas, error: e1 } = await admin
    .from("agente_propostas").select("id,chave,estado,decidida_por,dados")
    .eq("org_id", orgId).eq("agente", "conciliacao").in("estado", ["pendente", "aprovada"]).limit(2000);
  if (e1) return { ...rel, erro: `propostas: ${e1.message}` };
  const linhas = (abertas ?? []) as LinhaPropostaConc[];

  // 1. a pendente cujo par não existe mais (outra porta conciliou, o título mudou) expira
  const desfeitas = linhas.filter((l) => l.estado === "pendente" && !doPar.has(`${l.dados?.previsto}:${l.dados?.extrato}`));
  if (desfeitas.length && !deps.dryRun) {
    const { error } = await admin.from("agente_propostas")
      .update({ estado: "expirada", motivo: MOTIVO_PAR_DESFEITO })
      .in("id", desfeitas.map((l) => l.id)).eq("estado", "pendente");
    if (error) return { ...rel, erro: `expirar: ${error.message}` };
  }
  rel.expiradas = desfeitas.length;

  // 2. as aprovadas que ainda não foram conciliadas (o banco confere o par de novo)
  for (const l of linhas.filter((x) => x.estado === "aprovada")) {
    const r = await conciliarProposta(admin, l.id, false, deps.dryRun);
    if (r.estado === "executada") rel.executadasAprovadas++; else if (r.estado === "falhou") rel.falhas++;
  }

  // 3. os pares novos: nem o título nem a linha do extrato com proposta esperando
  const esperando = linhas.filter((l) => l.estado === "pendente" && !desfeitas.includes(l));
  const ocupados = {
    previstos: new Set(esperando.map((l) => l.dados?.previsto ?? "")),
    extratos: new Set(esperando.map((l) => l.dados?.extrato ?? "")),
  };
  const candidatas = propostasDeConciliacao(pares, ocupados);
  // o par que já teve proposta (recusada, expirada, feita) não volta
  const jaVistas = new Set<string>();
  for (let i = 0; i < candidatas.length; i += 200) {
    const { data, error } = await admin.from("agente_propostas").select("chave")
      .eq("org_id", orgId).eq("agente", "conciliacao").in("chave", candidatas.slice(i, i + 200).map((c) => c.chave)).limit(200);
    if (error) return { ...rel, erro: `propostas antigas: ${error.message}` };
    for (const l of (data ?? []) as { chave: string }[]) jaVistas.add(l.chave);
  }
  const novas = candidatas.filter((c) => !jaVistas.has(c.chave));

  const { count: feitasHoje, error: e3 } = await admin.from("agente_propostas").select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("agente", "conciliacao").eq("estado", "executada").is("decidida_por", null)
    .gte("executada_em", `${hoje}T00:00:00-03:00`).limit(1);
  if (e3) return { ...rel, erro: `feitas hoje: ${e3.message}` };

  const porChave = new Map(novas.map((p) => [p.chave, p]));
  for (const { chave, destino } of planejarConciliacao(novas, config, feitasHoje ?? 0)) {
    const p = porChave.get(chave)!;
    if (destino === "avisar") { rel.soAviso++; continue; }
    rel.propostas++;
    if (deps.dryRun) { if (destino === "aprovar") rel.paraAprovar++; else rel.feitasSozinho++; continue; }
    const { data: criada, error } = await admin.from("agente_propostas").upsert({
      org_id: orgId, agente: "conciliacao", chave: p.chave, titulo: p.titulo, porque: p.porque, valor: p.valor, dados: p.dados,
    }, { onConflict: "org_id,agente,chave", ignoreDuplicates: true }).select("id").limit(1);
    if (error) return { ...rel, erro: `criar proposta: ${error.message}` };
    const linha = ((criada ?? []) as { id: string }[])[0];
    if (!linha) continue;
    if (destino === "aprovar") { rel.paraAprovar++; (rel.idsParaAprovar ??= []).push(linha.id); continue; }
    const r = await conciliarProposta(admin, linha.id, true);
    if (r.estado === "executada") rel.feitasSozinho++;
    // o banco não deixou fazer sozinho: a proposta espera a aprovação
    else if (r.estado === "pendente") { rel.paraAprovar++; (rel.idsParaAprovar ??= []).push(linha.id); }
    else rel.falhas++;
  }
  return rel;
}


/* ═══════════════════════════════════════════════════════════════════════════
 * O AGENTE DE CONTAS A PAGAR (Etapa 6)
 * ═══════════════════════════════════════════════════════════════════════════
 * Lê a MESMA caixa de entrada da tela (pela função do banco, que é a única
 * leitura que a chave de serviço tem dela) e propõe agendar cada documento
 * pendente. Nunca grava conta: o "Aprovar" abre o cadastro preenchido, e a
 * proposta termina quando o banco vê o documento convertido na caixa
 * (`agente_contas_pagar_concluir_servidor`).
 */
interface FontesContasPagar {
  boletos?: BoletoRecebido[];
  nfs?: NFRecebida[];
  caixa?: { ocr?: DocumentoOCR[]; decisoes?: DecisaoEntrada[] };
  emails?: MensagemEmail[];
}

async function concluirContaPagar(admin: SupabaseClient, id: string): Promise<{ estado: string; erro?: string | null }> {
  const { data, error } = await admin.rpc("agente_contas_pagar_concluir_servidor", { p_proposta: id });
  if (error) return { estado: "aprovada", erro: error.message };
  const r = (data ?? {}) as { estado?: string; erro?: string | null };
  return { estado: r.estado ?? "aprovada", erro: r.erro ?? null };
}

/** A caixa de entrada de UMA empresa, como a tela a vê. */
export async function caixaDaEmpresa(admin: SupabaseClient, orgId: string) {
  const { data, error } = await admin.rpc("agente_contas_pagar_fontes", { p_org: orgId });
  if (error) throw new Error(`caixa de entrada: ${error.message}`);
  const f = (data ?? {}) as FontesContasPagar;
  const docs = documentosDasFontes({
    boletos: Array.isArray(f.boletos) ? f.boletos : [],
    nfs: Array.isArray(f.nfs) ? f.nfs : [],
    ocr: Array.isArray(f.caixa?.ocr) ? f.caixa!.ocr! : [],
    emails: Array.isArray(f.emails) ? f.emails : [],
  });
  const decisoes = Array.isArray(f.caixa?.decisoes) ? f.caixa!.decisoes! : [];
  return { pendentes: montarCaixaEntrada(docs, decisoes, "pendentes").itens.map((i) => i.documento), decisoes };
}

interface LinhaPropostaCP { id: string; chave: string; estado: string; dados: { entrada?: string } | null }

/**
 * O agente de contas a pagar numa empresa: conclui as aprovadas cujo documento
 * já virou conta, solta as pendentes cujo documento já foi decidido ou saiu da
 * caixa, e propõe os documentos novos. Reexecutar não propõe o mesmo documento
 * duas vezes (índice único na chave), e o recusado não volta.
 */
export async function rodarAgenteContasPagar(
  admin: SupabaseClient, orgId: string, config: ConfigAgente, hoje: string, deps: { dryRun?: boolean } = {},
): Promise<RelatorioAgente> {
  const rel = relatorio(config.ativo, "contas_pagar");
  if (!config.ativo) return rel;

  const { pendentes, decisoes } = await caixaDaEmpresa(admin, orgId);
  const chavesPendentes = new Set(pendentes.map((d) => d.chave));

  const { data: abertas, error: e1 } = await admin
    .from("agente_propostas").select("id,chave,estado,dados")
    .eq("org_id", orgId).eq("agente", "contas_pagar").in("estado", ["pendente", "aprovada"]).limit(2000);
  if (e1) return { ...rel, erro: `propostas: ${e1.message}` };
  const linhas = (abertas ?? []) as LinhaPropostaCP[];

  // 1. as aprovadas: o banco confere a caixa e conclui (convertido → executada)
  for (const l of linhas.filter((x) => x.estado === "aprovada")) {
    if (deps.dryRun) continue;
    const r = await concluirContaPagar(admin, l.id);
    if (r.estado === "executada") rel.executadasAprovadas++; else if (r.estado === "falhou") rel.falhas++;
    // Aprovada, sem decisão na caixa, e o documento já saiu dela: não há mais
    // cadastro para abrir. Termina como falhou, com o motivo.
    else if (r.estado === "aprovada" && desfechoDoDocumento(l.dados?.entrada ?? "", chavesPendentes, decisoes) === "sumiu") {
      const { error } = await admin.from("agente_propostas").update({ estado: "falhou", erro: MOTIVO_DOCUMENTO.sumiu })
        .eq("id", l.id).eq("estado", "aprovada");
      if (error) return { ...rel, erro: `encerrar: ${error.message}` };
      rel.falhas++;
    }
  }

  // 2. a pendente cujo documento já foi decidido pela tela, ou saiu da caixa, expira
  const porMotivo = new Map<string, string[]>();
  for (const l of linhas.filter((x) => x.estado === "pendente")) {
    const desfecho = desfechoDoDocumento(l.dados?.entrada ?? "", chavesPendentes, decisoes);
    if (desfecho === "pendente") continue;
    const m = MOTIVO_DOCUMENTO[desfecho];
    porMotivo.set(m, [...(porMotivo.get(m) ?? []), l.id]);
  }
  for (const [motivo, ids] of Array.from(porMotivo)) {
    rel.expiradas += ids.length;
    if (deps.dryRun) continue;
    const { error } = await admin.from("agente_propostas").update({ estado: "expirada", motivo })
      .in("id", ids).eq("estado", "pendente");
    if (error) return { ...rel, erro: `expirar: ${error.message}` };
  }

  // 3. os documentos novos: nenhum que já teve proposta (esperando ou terminada)
  const candidatasChaves = pendentes.map((d) => `doc:${d.chave}`);
  const jaPropostas = new Set<string>();
  for (let i = 0; i < candidatasChaves.length; i += 200) {
    const { data, error } = await admin.from("agente_propostas").select("chave")
      .eq("org_id", orgId).eq("agente", "contas_pagar").in("chave", candidatasChaves.slice(i, i + 200)).limit(200);
    if (error) return { ...rel, erro: `propostas antigas: ${error.message}` };
    for (const l of (data ?? []) as { chave: string }[]) jaPropostas.add(l.chave);
  }

  // As contas a pagar que já existem, para o aviso de duplicidade.
  const { data: contas, error: e2 } = await semAmostra(admin.from("movements").select("amount,due_date"))
    .eq("org_id", orgId).eq("type", "saida").eq("status", "pendente").limit(5000);
  if (e2) return { ...rel, erro: `contas a pagar: ${e2.message}` };
  const abertasConta: ContaAberta[] = ((contas ?? []) as { amount: number | string; due_date: string | null }[])
    .map((c) => ({ valor: Number(c.amount), vencimento: c.due_date }));

  const novas = propostasDeContasPagar(pendentes, jaPropostas, hoje, abertasConta);
  const porChave = new Map(novas.map((p) => [p.chave, p]));
  for (const { chave, destino } of planejarContasPagar(novas, config)) {
    const p = porChave.get(chave)!;
    if (destino === "avisar") { rel.soAviso++; continue; }
    rel.propostas++;
    if (deps.dryRun) { rel.paraAprovar++; continue; }
    const { data: criada, error } = await admin.from("agente_propostas").upsert({
      org_id: orgId, agente: "contas_pagar", chave: p.chave, titulo: p.titulo, porque: p.porque, valor: p.valor, dados: p.dados,
    }, { onConflict: "org_id,agente,chave", ignoreDuplicates: true }).select("id").limit(1);
    if (error) return { ...rel, erro: `criar proposta: ${error.message}` };
    const linha = ((criada ?? []) as { id: string }[])[0];
    if (!linha) continue;
    // Não vai para o pedido no WhatsApp: aprovar aqui é abrir o cadastro na tela.
    rel.paraAprovar++;
  }
  return rel;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * O AGENTE DE CAIXA (Etapa 7)
 * ═══════════════════════════════════════════════════════════════════════════
 * Lê o MESMO contexto das automações (`automacao_contexto`, o mapeador único
 * de `lib/risco-linhas`) e procura o furo da semana pelo saldo canônico.
 * Nunca muda conta nem move dinheiro: o "Aprovar" abre a conta na tela, e a
 * proposta aprovada termina como executada ("você abriu a conta").
 */
async function concluirCaixa(admin: SupabaseClient, id: string, dryRun?: boolean): Promise<{ estado: string; erro?: string | null }> {
  if (dryRun) return { estado: "aprovada", erro: null };
  const { data, error } = await admin.from("agente_propostas")
    .update({ estado: "executada", executada_em: new Date().toISOString() })
    .eq("id", id).eq("agente", "caixa").eq("estado", "aprovada").select("estado").limit(1);
  if (error) return { estado: "aprovada", erro: error.message };
  return { estado: ((data ?? []) as { estado: string }[])[0]?.estado ?? "aprovada", erro: null };
}

export async function rodarAgenteCaixa(
  admin: SupabaseClient, orgId: string, config: ConfigAgente, hoje: string, deps: { dryRun?: boolean } = {},
): Promise<RelatorioAgente & { furo?: string | null }> {
  const rel = relatorio(config.ativo, "caixa");
  if (!config.ativo) return rel;

  const { data: bruto, error: e0 } = await admin.rpc("automacao_contexto", { p_org: orgId });
  if (e0) return { ...rel, erro: `contexto: ${e0.message}` };
  const { input } = contextoDaRpc(orgId, (bruto ?? {}) as ContextoBruto, hoje, "");

  const { data: abertas, error: e1 } = await admin
    .from("agente_propostas").select("id,chave,estado")
    .eq("org_id", orgId).eq("agente", "caixa").in("estado", ["pendente", "aprovada"]).limit(500);
  if (e1) return { ...rel, erro: `propostas: ${e1.message}` };
  const linhas = (abertas ?? []) as { id: string; chave: string; estado: string }[];

  // 1. a aprovada de ontem já foi aberta pela pessoa: termina
  for (const l of linhas.filter((x) => x.estado === "aprovada")) {
    const r = await concluirCaixa(admin, l.id, deps.dryRun);
    if (r.estado === "executada") rel.executadasAprovadas++;
  }

  // 2. o furo de hoje, e as propostas que ele pede
  const jaPropostas = new Set<string>();
  const { furo } = propostasDeCaixa(input, hoje, jaPropostas);
  const candidatas = propostasDeCaixa(input, hoje, new Set()).propostas.map((p) => p.chave);
  for (let i = 0; i < candidatas.length; i += 200) {
    const { data, error } = await admin.from("agente_propostas").select("chave")
      .eq("org_id", orgId).eq("agente", "caixa").in("chave", candidatas.slice(i, i + 200)).limit(200);
    if (error) return { ...rel, erro: `propostas antigas: ${error.message}` };
    for (const l of (data ?? []) as { chave: string }[]) jaPropostas.add(l.chave);
  }

  // 3. a pendente que já não resolve (furo sumiu, mudou de dia, conta mudou) expira
  const porMotivo = new Map<string, string[]>();
  for (const l of linhas.filter((x) => x.estado === "pendente")) {
    const motivo = propostaDeCaixaVale(l.chave, furo, input);
    if (motivo) porMotivo.set(motivo, [...(porMotivo.get(motivo) ?? []), l.id]);
  }
  for (const [motivo, ids] of Array.from(porMotivo)) {
    rel.expiradas += ids.length;
    if (deps.dryRun) continue;
    const { error } = await admin.from("agente_propostas").update({ estado: "expirada", motivo })
      .in("id", ids).eq("estado", "pendente");
    if (error) return { ...rel, erro: `expirar: ${error.message}` };
  }

  const novas = propostasDeCaixa(input, hoje, jaPropostas).propostas;
  const porChave = new Map(novas.map((p) => [p.chave, p]));
  for (const { chave, destino } of planejarCaixa(novas, config)) {
    const p = porChave.get(chave)!;
    if (destino === "avisar") { rel.soAviso++; continue; }
    rel.propostas++;
    if (deps.dryRun) { rel.paraAprovar++; continue; }
    const { data: criada, error } = await admin.from("agente_propostas").upsert({
      org_id: orgId, agente: "caixa", chave: p.chave, titulo: p.titulo, porque: p.porque, valor: p.valor, dados: p.dados,
    }, { onConflict: "org_id,agente,chave", ignoreDuplicates: true }).select("id").limit(1);
    if (error) return { ...rel, erro: `criar proposta: ${error.message}` };
    if (((criada ?? []) as { id: string }[])[0]) rel.paraAprovar++;
  }
  return { ...rel, furo: furo?.dia ?? null };
}
