import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consultarExtratoPos, descreverErroApi } from "@/lib/pinbank/api";
import type { MeioCapturaExtratoPos, StatusExtratoPos } from "@/core/pinbank/extrato-pos";

/**
 * O TESTE DO EXTRATO CONSOLIDADO DA PINBANK (`ExtratoPos`) — só o administrador
 * da plataforma.
 *
 *   GET /api/admin/pinbank-extrato?cliente=<CodigoCliente>&de=AAAA-MM-DD&ate=AAAA-MM-DD
 *       [&status=Todos|Pago|Pendente] [&meio=Todos|Ecommerce|Terminal] [&terminal=…]
 *
 * Roda DENTRO da função da Vercel, com a credencial de `PINBANK_API_*` e pelos 2
 * IPs fixos. É a prova que a Pinbank pediu antes de liberar o método em
 * produção: o token sai, o pedido cifrado é aceito, a resposta abre, e as
 * parcelas trazem a data do repasse e a taxa. NÃO grava nada.
 *
 * ⚠️ A resposta nunca traz dado pessoal (CPF/CNPJ, nome do comprador, cartão):
 * as linhas passam pela leitura por lista de permitidos de `core/pinbank`. E
 * nunca traz a credencial — os erros nomeiam a variável, não o valor.
 *
 * ⚠️ Muda QUEM PODE CHAMAR O QUÊ (uma chamada nova, com credencial, à
 * Pinbank): o merge espera o OK do dono.
 *
 * Portões, na ordem — os mesmos da prova da saída fixa: sem banco
 * (demonstração) a rota se recusa; o middleware já barra `/api/admin/*` para
 * quem não é administrador; aqui, sessão → `admin_exigir_acesso` (prazo,
 * segundo fator, registro) → só então a Pinbank.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Token (até 10 s) + extrato (até 25 s) pela saída fixa.
export const maxDuration = 60;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

/** Quantas parcelas aparecem na resposta. O resumo conta todas. */
const AMOSTRA = 20;

export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, motivo: "Indisponível sem o banco (demonstração)." });
  }
  const doChamador = createClient();
  const { data: auth } = await doChamador.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, motivo: "não autenticado" });
  const q = new URL(req.url).searchParams;
  const cliente = (q.get("cliente") ?? "").trim();
  const { error: negado } = await doChamador.rpc("admin_exigir_acesso", { p_funcao: "admin_pinbank_extrato", p_alvo: cliente || null });
  if (negado) return resposta(403, { ok: false, motivo: negado.message });

  const filtro = {
    codigoCliente: /^\d{1,10}$/.test(cliente) ? Number(cliente) : NaN,
    de: (q.get("de") ?? "").trim(),
    ate: (q.get("ate") ?? q.get("de") ?? "").trim(),
    status: ((q.get("status") ?? "Todos").trim() || "Todos") as StatusExtratoPos,
    meio: ((q.get("meio") ?? "Todos").trim() || "Todos") as MeioCapturaExtratoPos,
    ...(q.get("terminal")?.trim() ? { idTerminalPos: q.get("terminal")!.trim() } : {}),
  };

  const inicio = Date.now();
  try {
    const r = await consultarExtratoPos(filtro);
    // "ok" pede a LISTA: zero parcelas sem a lista é recusa ou envelope que não
    // abrimos, não "sem vendas". O ResultCode vai à tela como veio — a doc não
    // diz qual valor é sucesso, e julgar por ele seria adivinhar.
    const ok = r.resposta.erros.length === 0 && r.resposta.listaRecebida;
    const codigoIncomum = r.resposta.codigo != null && r.resposta.codigo !== 0;
    return resposta(200, {
      ok,
      ...(r.resposta.listaRecebida ? {} : { motivo: `A resposta não trouxe a lista de parcelas (formato ${r.formato}; campos: ${r.campos.join(", ") || "nenhum"}).` }),
      ambiente: r.ambiente,
      via: r.via,
      ms: Date.now() - inicio,
      etapas: r.etapas,
      formatoResposta: { formato: r.formato, campos: r.campos },
      pinbank: { codigo: r.resposta.codigo, mensagem: r.resposta.mensagem, erros: r.resposta.erros },
      resumo: r.resumo,
      amostra: r.resposta.linhas.slice(0, AMOSTRA),
      ...(r.resposta.linhas.length > AMOSTRA ? { aviso: `Mostrando ${AMOSTRA} de ${r.resposta.linhas.length} parcelas; o resumo conta todas.` } : {}),
      ...(codigoIncomum ? { avisoCodigo: `A Pinbank devolveu o código ${r.resposta.codigo}: confira a mensagem.` } : {}),
    });
  } catch (e) {
    const d = descreverErroApi(e);
    // O log leva a etapa e o motivo (sem segredo: os erros do cliente nunca o citam).
    console.error(`[falha·pinbank] extrato_pos ${d.etapa}: ${d.motivo}`);
    return resposta(200, { ok: false, etapa: d.etapa, motivo: d.motivo, statusPinbank: d.status ?? null, ms: Date.now() - inicio });
  }
}
