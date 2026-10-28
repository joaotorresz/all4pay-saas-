import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { emitirCobrancaPinbank, mensalidadePinbankLiberada } from "@/lib/pinbank/api";
import { lerReservaCobranca, problemasDoDevedor, type ReservaCobranca, type ResultadoCobranca } from "@/core/pinbank/cobranca";

/**
 * A MENSALIDADE DO ERP — Pix ou boleto pela conta Pinbank DA QUATTRO, pedido
 * por quem administra a empresa cliente, sobre uma fatura que a PLATAFORMA gerou.
 *
 *   GET  /api/mensalidade/cobranca                → { liberada, faturas, cobrancas }
 *   POST /api/mensalidade/cobranca  { faturaId, tipo: "pix" | "boleto" }
 *
 * ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ.** A empresa cliente passa a fazer a Pinbank
 * CRIAR uma cobrança — para a conta da QUATTRO receber. Nenhum caminho paga,
 * transfere ou devolve. O merge espera o OK do dono.
 *
 * ⚠️ **O PEDIDO SÓ DIZ QUAL FATURA E QUAL TIPO.** Valor, vencimento e pagador
 * saem do banco (`mensalidade_reservar`, como a pessoa: empresa aberta + papel
 * de administrar). O código da conta que RECEBE sai do servidor
 * (`mensalidadePinbankLiberada`), nunca do banco nem do pedido. O resultado
 * volta por `mensalidade_registrar`, que só a chave de serviço executa.
 *
 * Portões, na ordem: sem banco (demonstração) → sessão → pedido → liberada
 * (interruptor + código da conta + produção) → chave de serviço → a RESERVA
 * → o cadastro do pagador → só então a Pinbank → o registro.
 *
 * ⚠️ Pagar NÃO renova sozinho (ainda): a baixa é da plataforma, conferindo o
 * extrato. O aviso de pagamento da Pinbank é a próxima etapa.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNAS_FATURA = "id, competencia, plano, valor, vencimento, situacao, paga_em, acesso_ate";
const COLUNAS = "id, fatura_id, tipo, situacao, valor, vencimento, texto_qrcode, qrcode_url, linha_digitavel, motivo, emitida_em, criado_em";

const FRASE_INDISPONIVEL: Record<string, string> = {
  desligada: "O pagamento da mensalidade por Pix e boleto ainda não foi liberado pela Quattro.",
  sem_configuracao: "O pagamento da mensalidade não está configurado no servidor.",
  ambiente_teste: "O pagamento da mensalidade só roda com a credencial de produção.",
};

function fraseDoBanco(msg: string | undefined): string {
  const m = /A4P-MENSALIDADE:\s*(.+)$/.exec(msg ?? "");
  return m ? m[1].trim() : "Não foi possível gerar a cobrança agora. Nada foi enviado à Pinbank.";
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  }
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });

  // Como a pessoa: a política só devolve o que é da empresa aberta.
  const [{ data: faturas, error: eF }, { data: cobrancas, error: eC }] = await Promise.all([
    s.from("mensalidade_faturas").select(COLUNAS_FATURA).order("competencia", { ascending: false }).limit(24),
    s.from("mensalidade_cobrancas").select(COLUNAS).order("criado_em", { ascending: false }).limit(100),
  ]);
  // Sem a migration aplicada as duas leituras falham: a tela some, nada mais.
  if (eF || eC) return resposta(200, { ok: true, liberada: false, faturas: [], cobrancas: [] });
  return resposta(200, {
    ok: true,
    liberada: mensalidadePinbankLiberada().liberada,
    faturas: faturas ?? [],
    cobrancas: cobrancas ?? [],
  });
}

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  }
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) {
    return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo para pagar a mensalidade." });
  }

  let pedido: unknown = null;
  try {
    pedido = await req.json();
  } catch {
    pedido = null;
  }
  const campo = (k: string) => {
    const v = pedido && typeof pedido === "object" ? (pedido as Record<string, unknown>)[k] : undefined;
    return typeof v === "string" ? v.trim() : "";
  };
  const faturaId = campo("faturaId");
  const tipo = campo("tipo");
  if (!UUID.test(faturaId) || (tipo !== "pix" && tipo !== "boleto")) {
    return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Informe a fatura e se é Pix ou boleto." });
  }

  const liberada = mensalidadePinbankLiberada();
  if (!liberada.liberada) return resposta(503, { ok: false, codigo: liberada.codigo, motivo: FRASE_INDISPONIVEL[liberada.codigo] });

  const admin = createAdmin();
  if (!admin) return resposta(503, { ok: false, codigo: "sem_servico", motivo: FRASE_INDISPONIVEL.sem_configuracao });

  // A RESERVA, como a pessoa: o banco confere fatura, empresa e papel.
  const { data: bruto, error: eR } = await s.rpc("mensalidade_reservar", { p_fatura: faturaId, p_tipo: tipo });
  if (eR) {
    const permissao = eR.code === "42501";
    return resposta(permissao ? 403 : 409, { ok: false, codigo: permissao ? "sem_permissao" : "recusada", motivo: fraseDoBanco(eR.message) });
  }
  let reserva: ReservaCobranca;
  try {
    // O código da conta que recebe entra AQUI, do servidor — o banco não o tem.
    reserva = lerReservaCobranca(
      bruto && typeof bruto === "object" && (bruto as { existente?: unknown }).existente === false
        ? { ...(bruto as Record<string, unknown>), codigoCliente: liberada.codigoCliente }
        : bruto,
    );
  } catch {
    return resposta(500, { ok: false, codigo: "reserva_ilegivel", motivo: "Não foi possível gerar a cobrança agora. Nada foi enviado à Pinbank." });
  }

  const devolver = async (status: number, extra: Record<string, unknown> = {}) => {
    const { data } = await s.from("mensalidade_cobrancas").select(COLUNAS).eq("id", reserva.id).maybeSingle();
    return resposta(status, { ok: status < 300, cobranca: data, ...extra });
  };
  if (reserva.existente) return devolver(200, { existente: true });

  const registrar = (r: ResultadoCobranca) => admin.rpc("mensalidade_registrar", { p_id: reserva.id, p_resultado: r });

  const faltam = problemasDoDevedor(reserva.tipo, reserva.devedor);
  if (faltam.length) {
    const motivo = `Complete os dados da empresa em Administração › Dados da empresa: ${faltam.join(" ")}`;
    await registrar({ situacao: "falhou", motivo });
    return devolver(422, { codigo: "cadastro_incompleto", motivo });
  }

  const resultado = await emitirCobrancaPinbank(reserva);
  const { error: eG } = await registrar(resultado);
  console.info(JSON.stringify({
    evento: "mensalidade.cobranca",
    usuario: auth.user.id,
    fatura: faturaId,
    cobranca: reserva.id,
    tipo: reserva.tipo,
    situacao: resultado.situacao,
    gravou: !eG,
  }));
  if (eG) {
    return resposta(500, { ok: false, codigo: "registro_falhou", motivo: "A Pinbank respondeu, mas o resultado não foi gravado. Fale com o suporte da Quattro antes de gerar outra cobrança." });
  }
  if (resultado.situacao === "emitida") return devolver(201);
  return devolver(resultado.situacao === "incerta" ? 504 : 502, { codigo: resultado.situacao, motivo: resultado.motivo });
}
