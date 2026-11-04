/**
 * O aviso de pago da Pinbank baixa o título — SERVER-ONLY.
 *
 * Duas chamadas ao banco, nesta ordem:
 *   1. `pinbank_cobranca_do_aviso` — QUAL cobrança o aviso paga (só lê; uma
 *      chave que aponta para duas cobranças não paga nenhuma);
 *   2. `pinbank_cobranca_liquidar` — o escritor único: a cobrança vira paga e
 *      o título vai a recebido pela transição "pago pelo banco".
 *
 * ⚠️ **O CÓDIGO DE RESPOSTA É PARTE DO CONTRATO** (a Pinbank reenvia 408, 429 e
 * 5xx; os demais 4xx são falha definitiva):
 *   · banco fora do ar ou erro que não é uma recusa nomeada → 503 (reenvie);
 *   · nenhuma cobrança, várias, ou a recusa nomeada do escritor
 *     (`A4P-LIQUIDACAO`: já liquidada por outro aviso, cancelada…) → 200 com o
 *     motivo, e o motivo vai ao LOG: reenviar não mudaria nada, e quem resolve
 *     é a conferência;
 *   · baixado, ou o MESMO aviso de novo → 200.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvisoDeLiquidacao } from "@/core/pinbank/liquidacao";

export interface RespostaDoAviso {
  status: 200 | 503;
  corpo: Record<string, unknown>;
}

export async function liquidarPeloAviso(admin: SupabaseClient, a: AvisoDeLiquidacao): Promise<RespostaDoAviso> {
  const { data: achado, error: eAchar } = await admin.rpc("pinbank_cobranca_do_aviso", {
    p_tipo: a.tipo,
    p_codigo_cliente: a.codigoCliente,
    p_nsu_origem: a.nsuOrigem,
    p_txid: a.txid,
    p_pinbank_id: a.pinbankId,
    p_codigo_barras: a.codigoBarras,
  });
  if (eAchar) {
    console.error("[falha·pinbank] aviso.achar:", eAchar.message);
    return { status: 503, corpo: { ok: false, motivo: "Não foi possível conferir o aviso; reenvie." } };
  }
  const r = (achado ?? {}) as { achado?: string; cobranca?: string; motivo?: string };
  if (r.achado !== "uma" || !r.cobranca) {
    // Um Pix que não é de cobrança do ERP (chave da conta, mensalidade) cai
    // aqui; várias é o caso grave — o log diz qual aviso.
    console.error(`[falha·pinbank] aviso.${r.achado ?? "ilegivel"}: ${a.ref} ${r.motivo ?? ""}`);
    return { status: 200, corpo: { ok: true, ignorado: r.achado ?? "ilegivel" } };
  }

  const { data: liq, error: eLiq } = await admin.rpc("pinbank_cobranca_liquidar", {
    p_cobranca: r.cobranca,
    p_valor: a.valor,
    p_pago_em: a.pagoEm,
    p_origem: "aviso_do_banco",
    p_ref: a.ref,
  });
  if (eLiq) {
    if (/A4P-LIQUIDACAO/.test(eLiq.message)) {
      console.error(`[falha·pinbank] aviso.recusado: ${a.ref} ${eLiq.message}`);
      return { status: 200, corpo: { ok: false, recusado: true } };
    }
    console.error("[falha·pinbank] aviso.liquidar:", eLiq.message);
    return { status: 503, corpo: { ok: false, motivo: "Não foi possível baixar agora; reenvie." } };
  }
  const l = (liq ?? {}) as { duplicado?: boolean; titulo?: string; motivo?: string };
  if (l.titulo !== "recebido" && l.titulo !== "ja_recebido" && !l.duplicado) {
    console.error(`[falha·pinbank] aviso.titulo_${l.titulo ?? "?"}: ${a.ref} ${l.motivo ?? ""}`);
  }
  return { status: 200, corpo: { ok: true, duplicado: l.duplicado === true, titulo: l.titulo ?? null } };
}
