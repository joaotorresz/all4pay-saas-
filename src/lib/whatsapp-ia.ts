/**
 * A QUATTRO AI RESPONDENDO PELO WHATSAPP (etapas 2 a 4) — SERVER-ONLY.
 *
 * Chamada pelo webhook (`lib/whatsapp-entrada`) DEPOIS da assinatura da
 * Twilio, do SAIR/VOLTAR e da aprovação, e só com `WHATSAPP_IA=ligado`.
 *
 * ⚠️ A ordem é a regra:
 *   1. de quem é o número (`whatsapp_ia_quem`) — não confirmado devolve
 *      `null`, e o webhook segue para a resposta padrão sem saber de mais nada;
 *   2. o comando de empresa ("EMPRESAS", "2") — só para quem tem várias;
 *   3. a reserva (`whatsapp_ia_reservar`): confere de novo o número e o papel,
 *      aplica o teto por hora e põe a pergunta na trilha. Recusa = nada é lido;
 *   4. só então o contexto da empresa (`automacao_contexto`) e a resposta.
 *
 * ⚠️ O CÉREBRO é o do chat do sistema, na mesma ordem (base de conhecimento →
 * motor nativo → leitura executiva), sobre o MESMO mapeador de linhas da
 * Visão geral: o número do WhatsApp é o número da tela. ⚠️ SÓ LEITURA: o
 * lançamento falado do chat ("gastei 100 de gasolina") não entra aqui — ele
 * precisa do "Confirmar", e isso é a etapa 5.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarKB } from "@/lib/assistant-kb";
import { contextoDaRpc, type ContextoBruto } from "@/lib/automacoes-contexto";
import { responderLocal } from "@/core/assistant/engine";
import { centroInteligencia } from "@/core/executive";
import { copilotoFinanceiro } from "@/core/executive/copilot";
import {
  RESPOSTA_ESCOLHA_INVALIDA, RESPOSTA_FALHA, RESPOSTA_SAIU, RESPOSTA_SEM_EMPRESA, RESPOSTA_VAZIA,
  empresaDaConversa, lerComandoEmpresa, lerQuem, listaDeEmpresas, paraWhatsapp, respostaEscolhida,
  respostaRecusa,
} from "@/core/whatsapp/conversa";

/** Hoje no fuso de quem usa (o servidor roda em UTC). */
const hojeSP = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** O texto da resposta sobre os números de UMA empresa. Puro sobre o contexto. */
export function respostaDaPergunta(pergunta: string, bruto: ContextoBruto, orgId: string, hoje: string): string {
  const kb = buscarKB(pergunta);
  if (kb) return kb.texto;
  const input = contextoDaRpc(orgId, bruto, hoje, "").input;
  const ctx = centroInteligencia(input).context;
  const local = responderLocal(pergunta, input, ctx);
  if (local) return local.resposta;
  return copilotoFinanceiro(pergunta, ctx).resposta;
}

/**
 * A resposta para a mensagem, ou `null` quando o número não é de ninguém
 * confirmado (o webhook então dá a resposta padrão).
 */
export async function responderIaWhatsapp(admin: SupabaseClient, telefone: string, corpo: string): Promise<string | null> {
  // 1. De quem é o número.
  const { data: brutoQuem, error: eQuem } = await admin.rpc("whatsapp_ia_quem", { p_telefone: telefone });
  // Sem saber de quem é o número, não se fala de empresa nenhuma: segue a
  // resposta padrão (um estranho não pode ler "não consegui ler os números").
  if (eQuem) { console.error("whatsapp_ia_quem", eQuem.message); return null; }
  const quem = lerQuem(brutoQuem);
  if (!quem) return null;
  if (quem.saiu) return RESPOSTA_SAIU;
  if (!quem.orgs.length) return RESPOSTA_SEM_EMPRESA;

  // 2. O comando de empresa.
  const comando = lerComandoEmpresa(corpo);
  if (comando && quem.orgs.length > 1) {
    if (comando.tipo === "listar") return listaDeEmpresas(quem.orgs, quem.escolhida);
    const alvo = quem.orgs[comando.indice];
    if (!alvo) return RESPOSTA_ESCOLHA_INVALIDA;
    const { data: ok, error } = await admin.rpc("whatsapp_ia_escolher", { p_telefone: telefone, p_org: alvo.id });
    if (error || ok !== true) return RESPOSTA_ESCOLHA_INVALIDA;
    return respostaEscolhida(alvo.nome);
  }
  if (comando?.tipo === "listar") return `Você tem acesso só a ${quem.orgs[0].nome}. Pode perguntar direto.`;

  const empresa = empresaDaConversa(quem);
  if (!empresa) return listaDeEmpresas(quem.orgs, null);

  const pergunta = corpo.trim();
  if (!pergunta) return RESPOSTA_VAZIA;

  // 3. A reserva: número, papel, teto e trilha.
  const { data: reserva, error: eRes } = await admin.rpc("whatsapp_ia_reservar", {
    p_telefone: telefone, p_org: empresa.id, p_pergunta: pergunta,
  });
  if (eRes) return RESPOSTA_FALHA;
  const r = (reserva ?? {}) as { ok?: boolean; codigo?: string };
  if (!r.ok) return respostaRecusa(r.codigo);

  // 4. O contexto da empresa e a resposta.
  const { data: bruto, error: eCtx } = await admin.rpc("automacao_contexto", { p_org: empresa.id });
  if (eCtx) return RESPOSTA_FALHA;
  const texto = respostaDaPergunta(pergunta, (bruto ?? {}) as ContextoBruto, empresa.id, hojeSP());
  const rodape = quem.orgs.length > 1 ? `_${empresa.nome} · mande EMPRESAS para trocar_` : undefined;
  return paraWhatsapp(texto, rodape);
}
