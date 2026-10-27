import type { SupabaseClient } from "@supabase/supabase-js";
import { lerCredencialGuardada } from "@/core/cobranca-banco/conexao";
import { decifrarSegredo } from "@/lib/cobranca-banco/cofre";
import { lerPem, type ConfigInter } from "@/lib/cobranca-banco/inter-api";

/**
 * A credencial de UMA conexão, aberta para falar com o banco. SERVER-ONLY.
 *
 * Quem lê é a chave de serviço (`cobranca_banco_credencial` só a ela); quem
 * abre é o cofre, com o id da conexão como dado adicional. ⚠️ O resultado
 * vive só na memória desta chamada: nunca vai para resposta, log ou cache
 * além do token que o cliente do Inter já guarda por Client ID.
 */
export async function configDaConexao(admin: SupabaseClient, conexaoId: string): Promise<ConfigInter> {
  const { data, error } = await admin.rpc("cobranca_banco_credencial", { p_conexao: conexaoId });
  if (error) {
    const m = /A4P-COBRANCA-BANCO:\s*(.+)$/.exec(error.message ?? "");
    throw new Error(m ? m[1].trim() : "Não foi possível ler a conta conectada.");
  }
  const g = lerCredencialGuardada(data);
  const s = decifrarSegredo(g.cifrado, g.id);
  const certificado = lerPem(s.certificado, "CERTIFICATE");
  const chave = lerPem(s.chave, "PRIVATE KEY");
  if (!certificado || !chave) throw new Error("A credencial guardada está incompleta; conecte de novo.");
  return {
    ambiente: g.ambiente,
    clientId: g.clientId,
    clientSecret: s.clientSecret,
    mtls: { certificado, chave },
    contaCorrente: g.contaCorrente,
  };
}
