"use server";

/**
 * O CELULAR DA QUATTRO AI NO WHATSAPP — pedir, confirmar e remover.
 *
 * ⚠️ NASCE DESLIGADO: sem `WHATSAPP_IA=ligado`, nenhum código é gerado nem
 * enviado. A tela nem mostra o cartão (a página lê o mesmo portão), mas o
 * portão mora AQUI — esconder o cartão não é controle.
 *
 * ⚠️ O CÓDIGO SÓ SAI NA MENSAGEM: quem o gera é a chave de serviço (a pessoa
 * não pode pedi-lo ao banco pela própria sessão, senão o leria sem ter o
 * celular na mão), e esta ação devolve à tela só o veredito. Nada de log.
 *
 * ⚠️ ENVIO SIMULADO NUNCA É "ENVIADO": sem a Twilio configurada, a ação recusa
 * ANTES de gerar o código.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { isDemo } from "@/lib/demo";
import { enviarWhatsapp, statusNotificacoes, templateDe } from "@/core/financial-os/notifications.server";
import {
  celularCanonico, iaWhatsappLigada, mensagemDoCodigo, semPrefixoNumero,
} from "@/core/whatsapp/numero";

export type ResultadoNumero = { ok: true; mensagem: string } | { ok: false; motivo: string };

export interface SituacaoNumero {
  ligado: boolean;
  podeCadastrar: boolean;
  telefone: string | null;
  confirmadoEm: string | null;
  pendente: string | null;
}

const DESLIGADO: SituacaoNumero = { ligado: false, podeCadastrar: false, telefone: null, confirmadoEm: null, pendente: null };

export async function situacaoNumeroAction(): Promise<SituacaoNumero> {
  if (!iaWhatsappLigada()) return DESLIGADO;
  // Em demonstração não há conta: o cartão aparece vazio, e pedir o código
  // recusa por falta de provedor (nada é gerado).
  if (isDemo || !process.env.NEXT_PUBLIC_SUPABASE_URL) return { ...DESLIGADO, ligado: true, podeCadastrar: true };
  const { data, error } = await createClient().rpc("whatsapp_numero_meu");
  if (error || !data) return { ...DESLIGADO, ligado: true };
  const r = data as { telefone: string | null; confirmado_em: string | null; pendente_telefone: string | null; pode_cadastrar: boolean };
  return {
    ligado: true,
    podeCadastrar: !!r.pode_cadastrar,
    telefone: r.telefone,
    confirmadoEm: r.confirmado_em,
    pendente: r.pendente_telefone,
  };
}

export async function pedirCodigoNumeroAction(celular: string): Promise<ResultadoNumero> {
  // 1. O portão.
  if (!iaWhatsappLigada()) {
    return { ok: false, motivo: "A Quattro AI no WhatsApp está desligada neste ambiente. Nada foi enviado." };
  }
  // 2. Sem provedor, o envio seria simulado — e simulado não é enviado.
  if (!statusNotificacoes().whatsapp) {
    return { ok: false, motivo: "O envio de WhatsApp não está configurado neste ambiente. Nada foi enviado." };
  }
  const tel = celularCanonico(celular);
  if (!tel) return { ok: false, motivo: "Celular inválido — informe DDD e número." };
  if (isDemo) return { ok: false, motivo: "No modo demonstração não há conta: nenhum código foi enviado." };

  // 3. Quem pede é a SESSÃO; o banco recebe o id dela, nunca um do formulário.
  const { data: sessao } = await createClient().auth.getUser();
  const uid = sessao.user?.id;
  if (!uid) return { ok: false, motivo: "Sua sessão expirou. Entre de novo." };

  const admin = createAdmin();
  if (!admin) return { ok: false, motivo: "O servidor está sem acesso ao banco agora. Tente em alguns minutos." };

  const { data: codigo, error } = await admin.rpc("whatsapp_numero_pedir_codigo", { p_usuario: uid, p_telefone: tel });
  if (error || typeof codigo !== "string") {
    return { ok: false, motivo: semPrefixoNumero(error?.message ?? "O código não foi gerado.") };
  }

  // 4. Fora da janela de 24 h, só o modelo aprovado chega.
  const modelo = templateDe("codigo_whatsapp");
  const envio = await enviarWhatsapp(`+55${tel}`, mensagemDoCodigo(codigo),
    modelo ? { contentSid: modelo, contentVariables: { "1": codigo } } : undefined);
  if (!envio.ok) {
    return {
      ok: false,
      motivo: modelo
        ? `O provedor recusou a mensagem (${envio.detalhe}). Nada chegou ao celular — peça de novo.`
        : `O provedor recusou a mensagem (${envio.detalhe}). Mande "oi" para o número da Quattro no WhatsApp e peça o código de novo.`,
    };
  }
  return { ok: true, mensagem: `Código enviado por WhatsApp para o celular final ${tel.slice(-4)}. Ele vale por 10 minutos.` };
}

export async function confirmarNumeroAction(codigo: string): Promise<ResultadoNumero> {
  const { data, error } = await createClient().rpc("whatsapp_numero_confirmar", { p_codigo: codigo });
  if (error) return { ok: false, motivo: "Não foi possível conferir o código agora. Tente de novo." };
  const r = (data ?? {}) as { ok?: boolean; motivo?: string };
  if (!r.ok) return { ok: false, motivo: r.motivo ?? "Código não conferido." };
  return { ok: true, mensagem: "Celular confirmado." };
}

export async function removerNumeroAction(): Promise<ResultadoNumero> {
  const { error } = await createClient().rpc("whatsapp_numero_remover");
  if (error) return { ok: false, motivo: "Não foi possível remover agora. Tente de novo." };
  return { ok: true, mensagem: "Celular removido. A Quattro AI não responde mais a ele." };
}
