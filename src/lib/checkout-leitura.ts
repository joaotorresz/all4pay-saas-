import { createAdmin } from "@/lib/supabase/admin";
import { cobrancaPinbankLiberada } from "@/lib/pinbank/api";
import type { LeituraFatura } from "@/components/checkout/FaturaView";

/**
 * A LEITURA do link de pagamento, pelo token — UMA para a fatura (`/pagar`) e
 * para o boleto para imprimir (`/pagar/boleto`), senão as duas páginas
 * poderiam discordar sobre o mesmo link.
 *
 * ⚠️ Só do servidor: `pinbank_checkout_ler` executa apenas como `service_role`,
 * depois do interruptor da cobrança.
 */
const TOKEN = /^[0-9a-f]{64}$/;

export function tokenDoLink(t: string | string[] | undefined): string {
  return typeof t === "string" ? t.trim().toLowerCase() : "";
}

export async function lerLinkDePagamento(token: string): Promise<LeituraFatura | "invalido" | "fora_do_ar"> {
  if (!TOKEN.test(token)) return "invalido";
  if (!cobrancaPinbankLiberada().liberada) return "fora_do_ar";
  const admin = createAdmin();
  if (!admin) return "fora_do_ar";
  const { data, error } = await admin.rpc("pinbank_checkout_ler", { p_token: token });
  if (error) return "fora_do_ar";
  if (!data) return "invalido";
  return data as LeituraFatura;
}
