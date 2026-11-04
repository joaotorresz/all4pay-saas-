import { NextResponse } from "next/server";
import { lerLinkDePagamento, tokenDoLink } from "@/lib/checkout-leitura";

/**
 * A SITUAÇÃO DO LINK DE PAGAMENTO, para a página se atualizar sozinha
 * (04/11/2026, pedido do dono: pago o Pix ou o boleto, a tela do link mostra
 * "pago" sem o cliente recarregar).
 *
 *   GET /api/pinbank/checkout/situacao?t=<token>  → { situacao }
 *
 * ⚠️ Rota PÚBLICA, como a página: lê pela MESMA leitura (`lerLinkDePagamento`,
 * `pinbank_checkout_ler` como o servidor, depois do interruptor) e devolve SÓ
 * a situação — nada da empresa, do valor ou do pagador. Uma leitura só, senão a
 * página e a consulta poderiam discordar sobre o mesmo link.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

export async function GET(req: Request) {
  const t = tokenDoLink(new URL(req.url).searchParams.get("t") ?? undefined);
  const r = await lerLinkDePagamento(t);
  if (r === "invalido") return resposta(404, { situacao: "invalido" });
  if (r === "fora_do_ar") return resposta(503, { situacao: "fora_do_ar" });
  return resposta(200, { situacao: r.situacao });
}
