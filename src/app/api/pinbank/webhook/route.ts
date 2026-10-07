import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { chavesPinbank, verificarAssinatura } from "@/lib/pinbank/assinatura";
import { processarEvento } from "@/lib/pinbank/processar";
import { ehEventoDeCompra, lerEnvelope, semDadoSensivel, transacaoDoEvento } from "@/core/pinbank";

/**
 * Webhook da MAQUININHA PINBANK — os eventos `Compra.*`.
 *
 *   POST /api/pinbank/webhook
 *
 * ⚠️ **DESLIGADO POR PADRÃO.** Sem `PINBANK_WEBHOOK=ligado` responde 503 e não
 * toca em nada. Ligar exige: a migration `20261005120000` aplicada, a URL
 * cadastrada no suporte da Pinbank com os eventos `Compra.*`, e (recomendado)
 * `PINBANK_WEBHOOK_JWKS` com a resposta de `/webhook/signing-key` salva.
 *
 * A ordem das portas é a regra: interruptor → assinatura Ed25519 (sobre o corpo
 * BRUTO) → envelope → só então o banco. Uma rota que consulta o banco antes de
 * conferir quem chama vira, no mínimo, um oráculo de estabelecimentos.
 *
 * ⚠️ **O CÓDIGO DE RESPOSTA É PARTE DO CONTRATO.** A Pinbank reenvia 408, 429 e
 * 5xx, e NÃO reenvia os demais 4xx. Então:
 *   · assinatura inválida ou fora da janela → 401 (não há o que reenviar);
 *   · envelope malformado → 400;
 *   · evento que não é de venda → 200 (entregue; nada a fazer);
 *   · banco fora, chave pública indisponível (inclusive na rotação de chave,
 *     quando a busca da nova falha) → 503 (reenvie, por favor);
 *   · evento GUARDADO → 200, mesmo quando o processamento parou num motivo
 *     nomeado (sem vínculo, aguardando ativação, erro): o evento está seguro na
 *     caixa de entrada e entra pelo reprocessamento. Reenviar não mudaria nada.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resposta = (status: number, corpo: Record<string, unknown>) => NextResponse.json(corpo, { status });

export async function POST(req: Request) {
  // 1. O INTERRUPTOR — antes de qualquer outra coisa.
  if (process.env.PINBANK_WEBHOOK !== "ligado") {
    return resposta(503, { ok: false, motivo: "A integração com a maquininha Pinbank está desligada." });
  }

  // 2. A ASSINATURA — sobre o corpo exatamente como chegou.
  const corpo = await req.text();
  const cab = {
    timestamp: req.headers.get("webhook-timestamp"),
    assinatura: req.headers.get("webhook-signature"),
    kid: req.headers.get("webhook-key-id"),
  };
  // ⚠️ Chave indisponível é 503 (a Pinbank reenvia), e o motivo vai para o
  // LOG, não para a resposta: a rota é pública, e o motivo pode citar o
  // endereço dos servidores da saída fixa.
  const chaveIndisponivel = (e: unknown) => {
    console.error("[falha·pinbank] pinbank.chave_publica:", (e as Error).message);
    return resposta(503, { ok: false, motivo: "Chave pública da Pinbank indisponível; reenvie." });
  };
  let chaves;
  try {
    chaves = await chavesPinbank();
  } catch (e) {
    return chaveIndisponivel(e);
  }
  const agoraSegundos = Math.floor(Date.now() / 1000);
  let v = verificarAssinatura({ corpo, ...cab, agoraSegundos, chaves });
  if (!v.ok && v.kidDesconhecido) {
    // Rotação de chave: busca de novo. ⚠️ Não conseguir buscar é 503, nunca o
    // 401 do veredito anterior — 401 a Pinbank não reenvia, e a venda
    // assinada com a chave nova se perderia.
    try {
      v = verificarAssinatura({ corpo, ...cab, agoraSegundos, chaves: await chavesPinbank(true) });
    } catch (e) {
      return chaveIndisponivel(e);
    }
  }
  if (!v.ok) return resposta(401, { ok: false, motivo: "não autorizado" });

  // 3. O ENVELOPE.
  let bruto: unknown;
  try {
    bruto = JSON.parse(corpo);
  } catch {
    return resposta(400, { ok: false, motivo: "Corpo não é JSON." });
  }
  const env = lerEnvelope(bruto);
  if (!env.ok) return resposta(400, { ok: false, motivo: env.motivo });
  // ⚠️ O Webhook-Id é o MESMO EventId; divergindo, não há como saber qual
  // deduplicar.
  const webhookId = req.headers.get("webhook-id");
  if (webhookId && webhookId.toLowerCase() !== env.valor.eventId) {
    return resposta(400, { ok: false, motivo: "Webhook-Id diferente do EventId." });
  }
  if (!ehEventoDeCompra(env.valor.eventType)) {
    return resposta(200, { ok: true, ignorado: env.valor.eventType });
  }
  const tr = transacaoDoEvento(env.valor);

  // 4. Só agora o banco — e o evento é GUARDADO antes de qualquer decisão.
  const admin = createAdmin();
  if (!admin) return resposta(503, { ok: false, motivo: "O servidor está sem a chave de serviço do banco." });
  const t = tr.ok ? tr.valor : null;
  const { data: reg, error } = await admin.rpc("pinbank_registrar_evento", {
    p_event_id: env.valor.eventId,
    p_event_type: env.valor.eventType,
    p_event_version: env.valor.eventVersion,
    p_entity_id: env.valor.entityId,
    p_ocorrido_em: env.valor.ocorridoEm,
    p_nsu: t?.nsu ?? null,
    p_estabelecimento_id: t?.estabelecimento.id ?? null,
    p_chave_gateway: t?.estabelecimento.chaveGateway ?? null,
    p_estabelecimento_nome: t?.estabelecimento.nome ?? null,
    // ⚠️ O dado sensível sai AQUI, antes do banco (que ainda recusa o que vier).
    p_payload: semDadoSensivel(env.valor.data),
  });
  if (error) return resposta(503, { ok: false, motivo: "Não foi possível guardar o evento; reenvie." });

  const situacaoAnterior = (reg as { situacao?: string } | null)?.situacao;
  if (situacaoAnterior === "processado" || situacaoAnterior === "ignorado") {
    return resposta(200, { ok: true, duplicado: true });
  }

  // 5. Processar.
  const res = await processarEvento(admin, env.valor.eventId);
  if (res.situacao === "transitorio") return resposta(503, { ok: false, motivo: "Processamento concorrente; reenvie." });
  return resposta(200, { ok: true, situacao: res.situacao });
}
