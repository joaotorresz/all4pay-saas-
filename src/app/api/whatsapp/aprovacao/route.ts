import { receberWhatsapp } from "@/lib/whatsapp-entrada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O endereço ANTIGO do webhook da Twilio (a resposta do aprovador). Continua
 * respondendo porque já pode estar configurado no número; desde a etapa 5
 * das automações ele é a MESMA porta de `/api/whatsapp/entrada` — e por isso
 * também atende SAIR/VOLTAR mesmo com a aprovação desligada.
 *
 * ⚠️ Mudou quem pode chamar o quê: antes, sem `WHATSAPP_APROVACAO=ligado`,
 * respondia 503 a tudo. Agora, com a assinatura da Twilio conferida, registra
 * o pedido de saída. Ver `lib/whatsapp-entrada`.
 */
export async function POST(req: Request) {
  return receberWhatsapp(req);
}
