/**
 * Quem pediu para sair do WhatsApp — a pergunta que TODO executor faz antes
 * de despachar (régua, automações da empresa, fluxos). SERVER-ONLY: a RPC
 * `whatsapp_saidas_entre` é só da chave de serviço.
 *
 * ⚠️ Falha FECHADA: se a consulta não responder, devolve `"todos"` e o
 * `despachar` não manda WhatsApp nenhum nesta leva (o e-mail segue). Mandar
 * sem saber quem saiu é o único erro que não se desfaz.
 */
import { telefonesDeWhatsapp, type MensagemAutomacao } from "@/core/automacoes";

interface ClienteRpc {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export async function saidasPara(admin: ClienteRpc, mensagens: MensagemAutomacao[]): Promise<Set<string> | "todos"> {
  const telefones = telefonesDeWhatsapp(mensagens);
  if (!telefones.length) return new Set();
  try {
    const { data, error } = await admin.rpc("whatsapp_saidas_entre", { p_telefones: telefones });
    if (error || !Array.isArray(data)) return "todos";
    return new Set(data.filter((t): t is string => typeof t === "string"));
  } catch {
    return "todos";
  }
}
