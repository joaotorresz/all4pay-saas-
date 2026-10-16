import { receberWhatsapp } from "@/lib/whatsapp-entrada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook da Twilio: tudo o que chega ao número da plataforma — SAIR/VOLTAR
 * (sempre) e a resposta de aprovação (só ligada). A regra mora em
 * `lib/whatsapp-entrada`; `/api/whatsapp/aprovacao` é a mesma porta.
 */
export async function POST(req: Request) {
  return receberWhatsapp(req);
}
