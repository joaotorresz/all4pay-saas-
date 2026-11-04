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

export interface DepsAgente {
  registro: RegistroEnvios;
  provedor: ProvedorEnvio;
  dryRun?: boolean;
}

export interface RelatorioAgente {
  agente: "cobranca";
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
  erro?: string;
}

const relatorio = (ativo: boolean): RelatorioAgente => ({
  agente: "cobranca", ativo, propostas: 0, paraAprovar: 0, feitasSozinho: 0, executadasAprovadas: 0,
  falhas: 0, expiradas: 0, soAviso: 0, pulados: 0,
});

/** A linha de `agentes` → configuração (o banco já recusou o que não cabe). */
export function configDaLinhaDeAgente(l: { ativo?: boolean | null; nivel?: number | null; limite_valor?: number | string | null; limite_dia?: number | null } | null): ConfigAgente {
  if (!l) return configPadrao("cobranca");
  return {
    agente: "cobranca", ativo: !!l.ativo,
    nivel: Math.max(0, Math.min(3, Number(l.nivel) || 0)) as NivelAgente,
    limiteValor: Number(l.limite_valor) || 0, limiteDia: Number(l.limite_dia) || 0,
  };
}

/** As empresas com o agente de cobrança LIGADO, com a configuração de cada uma. */
export async function empresasComCobranca(admin: SupabaseClient): Promise<Map<string, ConfigAgente>> {
  const { data, error } = await admin
    .from("agentes").select("org_id,ativo,nivel,limite_valor,limite_dia")
    .eq("agente", "cobranca").eq("ativo", true).limit(5000);
  if (error) throw new Error(`agentes: ${error.message}`);
  const out = new Map<string, ConfigAgente>();
  for (const l of (data ?? []) as { org_id: string; ativo: boolean; nivel: number; limite_valor: number | string; limite_dia: number }[]) {
    out.set(l.org_id, configDaLinhaDeAgente(l));
  }
  return out;
}

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
    if (destino === "aprovar") { rel.paraAprovar++; continue; }
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
): Promise<{ estado: string; erro?: string | null }> {
  const { data: l, error } = await admin
    .from("agente_propostas").select("id,chave,estado,decidida_por,agente,org_id,erro")
    .eq("id", propostaId).eq("org_id", orgId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!l) return { estado: "inexistente", erro: "Proposta não encontrada nesta empresa." };
  const linha = l as LinhaProposta & { agente: string; erro: string | null };
  if (linha.estado !== "aprovada") return { estado: linha.estado, erro: linha.erro };
  if (linha.agente !== "cobranca") return { estado: linha.estado, erro: "Este agente ainda não executa." };
  const regua = await reguaDaEmpresaServidor(admin, orgId);
  const ctx = await contextoDoAgente(admin, orgId, hoje, appUrl, regua);
  const doDia = new Map(propostasDeCobranca(regua, ctx).propostas.map((p) => [p.chave, p]));
  const estado = await executarUma(admin, orgId, linha, doDia, hoje, deps, false);
  const { data: depois } = await admin.from("agente_propostas").select("estado,erro").eq("id", propostaId).maybeSingle();
  return { estado: (depois as { estado: string } | null)?.estado ?? estado, erro: (depois as { erro: string | null } | null)?.erro ?? null };
}
