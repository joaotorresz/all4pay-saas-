import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { cobrancaPinbankLiberada, emitirCobrancaPinbank } from "@/lib/pinbank/api";
import { lerReservaCobranca, problemasDoDevedor, type ReservaCobranca, type ResultadoCobranca } from "@/core/pinbank/cobranca";

/**
 * A COBRANÇA POR PIX E BOLETO PELA CONTA PINBANK — pedida pela EMPRESA a partir
 * de um título a receber.
 *
 *   GET  /api/pinbank/cobranca?movementId=<uuid>   → { liberada, ligada, contaPronta, pedidoConta, cobrancas }
 *   POST /api/pinbank/cobranca  { movementId, tipo: "pix" | "boleto" }
 *
 * ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ.** É o primeiro caminho em que a EMPRESA faz
 * a Pinbank CRIAR algo (uma cobrança, para a conta da empresa RECEBER). Nenhum
 * caminho paga, transfere ou devolve. O merge espera o OK do dono.
 *
 * ⚠️ **O PEDIDO SÓ DIZ QUAL TÍTULO E QUAL TIPO.** Valor, vencimento, pagador e
 * o código de quem recebe saem do banco (`pinbank_cobranca_reservar`, como a
 * pessoa: empresa aberta + papel de lançar + a cobrança ligada pela empresa no
 * vínculo que a plataforma fez). O resultado volta por
 * `pinbank_cobranca_registrar`, que só o servidor executa.
 *
 * Portões, na ordem: sem banco (demonstração) → sessão → pedido bem formado →
 * a cobrança está liberada (interruptor + ambiente de produção) → o servidor
 * tem a chave de serviço → a RESERVA no banco (o título, a permissão, a conta)
 * → o cadastro do pagador → só então a Pinbank → o registro.
 *
 * ⚠️ Um registro no log do servidor por chamada à Pinbank — quem, empresa,
 * título, tipo e a situação; nenhum valor, nenhum dado do pagador.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leituras do banco + token (até 10 s) + a cobrança (até 25 s) pela saída fixa.
export const maxDuration = 60;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNAS = "id, tipo, situacao, valor, vencimento, texto_qrcode, qrcode_url, linha_digitavel, motivo, emitida_em, criado_em";

const FRASE_INDISPONIVEL: Record<string, string> = {
  desligada: "A cobrança pela conta Pinbank ainda não foi liberada pela Quattro.",
  sem_configuracao: "A cobrança pela conta Pinbank não está configurada no servidor.",
  ambiente_teste: "A cobrança pela conta Pinbank só roda com a credencial de produção.",
};

/** A frase do banco (A4P-COBRANCA: …) sem o prefixo; o resto vira frase genérica. */
function fraseDoBanco(msg: string | undefined): string {
  const m = /A4P-COBRANCA:\s*(.+)$/.exec(msg ?? "");
  return m ? m[1].trim() : "Não foi possível gerar a cobrança agora. Nada foi enviado à Pinbank.";
}

export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  }
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });
  const movementId = new URL(req.url).searchParams.get("movementId")?.trim() ?? "";
  if (!UUID.test(movementId)) return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Título não informado." });

  const liberada = cobrancaPinbankLiberada();
  if (!liberada.liberada) return resposta(200, { ok: true, liberada: false, ligada: false, contaPronta: false, pedidoConta: null, cobrancas: [] });

  // Como a pessoa: a política só devolve o que é da empresa aberta.
  const [{ data: vinculos }, { data: cobrancas, error }, { data: links }, { data: pedidos }] = await Promise.all([
    s.from("pinbank_vinculos").select("cobranca_ativa, codigo_cliente, ativo").is("excluido_em", null).limit(20),
    s.from("pinbank_cobrancas").select(COLUNAS).eq("movement_id", movementId).order("criado_em", { ascending: false }).limit(20),
    // O link de pagamento vivo (etapa 4). Sem a migration a leitura falha e o link some, nada mais.
    s.from("pinbank_checkout_links").select("token").eq("movement_id", movementId).is("revogado_em", null).limit(1),
    // O pedido de conta Quattro em aberto (quem não tem conta pede na própria baixa).
    s.from("maquininha_pedidos").select("criado_em, situacao").eq("tipo", "conta_pix")
      .not("situacao", "in", "(concluido,cancelado)").order("criado_em", { ascending: false }).limit(1),
  ]);
  const vivos = vinculos ?? [];
  if (error) return resposta(500, { ok: false, codigo: "leitura_falhou", motivo: "Não foi possível ler as cobranças deste título." });
  return resposta(200, {
    ok: true,
    liberada: true,
    ligada: vivos.some((v) => v.cobranca_ativa),
    // A conta existe (a plataforma pôs o código no vínculo) mas a empresa ainda não ligou a cobrança.
    contaPronta: vivos.some((v) => v.ativo && v.codigo_cliente != null),
    pedidoConta: (pedidos ?? [])[0] ?? null,
    cobrancas: cobrancas ?? [],
    link: (links ?? [])[0]?.token ?? null,
  });
}

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  }
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) {
    return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo para gerar a cobrança." });
  }

  // O pedido: só estes dois campos são lidos.
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
  const movementId = campo("movementId");
  const tipo = campo("tipo");
  if (!UUID.test(movementId) || (tipo !== "pix" && tipo !== "boleto")) {
    return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Informe o título e se é Pix ou boleto." });
  }

  const liberada = cobrancaPinbankLiberada();
  if (!liberada.liberada) return resposta(503, { ok: false, codigo: liberada.codigo, motivo: FRASE_INDISPONIVEL[liberada.codigo] });

  // Sem a chave de serviço, o resultado não teria como ser gravado: nem reserva.
  const admin = createAdmin();
  if (!admin) return resposta(503, { ok: false, codigo: "sem_servico", motivo: FRASE_INDISPONIVEL.sem_configuracao });

  // A RESERVA, como a pessoa: o banco confere título, empresa, papel e conta.
  const { data: bruto, error: eR } = await s.rpc("pinbank_cobranca_reservar", { p_movement: movementId, p_tipo: tipo });
  if (eR) {
    const permissao = eR.code === "42501";
    return resposta(permissao ? 403 : 409, { ok: false, codigo: permissao ? "sem_permissao" : "recusada", motivo: fraseDoBanco(eR.message) });
  }
  let reserva: ReservaCobranca;
  try {
    reserva = lerReservaCobranca(bruto);
  } catch {
    return resposta(500, { ok: false, codigo: "reserva_ilegivel", motivo: "Não foi possível gerar a cobrança agora. Nada foi enviado à Pinbank." });
  }

  const devolver = async (status: number, extra: Record<string, unknown> = {}) => {
    const { data } = await s.from("pinbank_cobrancas").select(COLUNAS).eq("id", reserva.id).maybeSingle();
    return resposta(status, { ok: status < 300, cobranca: data, ...extra });
  };
  // O segundo clique: a cobrança emitida volta, nada novo é pedido.
  if (reserva.existente) return devolver(200, { existente: true });

  const registrar = (r: ResultadoCobranca) => admin.rpc("pinbank_cobranca_registrar", { p_id: reserva.id, p_resultado: r });

  // O pagador: sem o cadastro completo, a Pinbank recusaria — nem sai.
  const faltam = problemasDoDevedor(reserva.tipo, reserva.devedor);
  if (faltam.length) {
    await registrar({ situacao: "falhou", motivo: faltam.join(" ") });
    return devolver(422, { codigo: "cadastro_incompleto", motivo: faltam.join(" ") });
  }

  const resultado = await emitirCobrancaPinbank(reserva);
  const { error: eG } = await registrar(resultado);
  console.info(JSON.stringify({
    evento: "pinbank.cobranca",
    usuario: auth.user.id,
    titulo: movementId,
    cobranca: reserva.id,
    tipo: reserva.tipo,
    situacao: resultado.situacao,
    gravou: !eG,
  }));
  if (eG) {
    // A reserva fica `reservada` e segura o título: melhor que uma segunda cobrança.
    return resposta(500, { ok: false, codigo: "registro_falhou", motivo: "A Pinbank respondeu, mas o resultado não foi gravado. O título fica bloqueado para nova cobrança até a conferência." });
  }
  if (resultado.situacao === "emitida") return devolver(201);
  return devolver(resultado.situacao === "incerta" ? 504 : 502, { codigo: resultado.situacao, motivo: resultado.motivo });
}
