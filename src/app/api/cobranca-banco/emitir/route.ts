import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { problemasDoPedido, type ResultadoCobrancaBanco } from "@/core/cobranca-banco";
import { cobrancaBancoLigada, lerReservaBanco, type ReservaBanco } from "@/core/cobranca-banco/conexao";
import { cofreDisponivel } from "@/lib/cobranca-banco/cofre";
import { configDaConexao } from "@/lib/cobranca-banco/conexao-servidor";
import { acharCobrancaInter, consultarCobrancaInter, emitirCobrancaInter, type ConfigInter } from "@/lib/cobranca-banco/inter-api";

/**
 * BOLETO COM PIX PELA CONTA BANCÁRIA CONECTADA — pedido a partir de um título
 * a receber.
 *
 *   GET  /api/cobranca-banco/emitir?movementId=<uuid>  → { ligada, conectada, cobrancas }
 *   POST /api/cobranca-banco/emitir  { movementId }
 *
 * ⚠️ **O PEDIDO SÓ DIZ QUAL TÍTULO.** Valor, vencimento, pagador e a conta que
 * recebe saem de `cobranca_banco_reservar` (como a pessoa: empresa aberta +
 * papel de lançar + a conexão viva). O resultado volta por
 * `cobranca_banco_registrar`, só da chave de serviço.
 *
 * ⚠️ **O segundo clique nunca é uma segunda cobrança.** Com uma cobrança
 * `processando` (o banco tem o id), a rota CONSULTA pelo id; com uma
 * `incerta` (o pedido saiu e a resposta não voltou), PROCURA pelo nosso
 * número. Só a recusa clara libera outra.
 *
 * ⚠️ Um registro no log por chamada ao banco: quem, título, cobrança e a
 * situação; nenhum valor, nenhum dado do pagador, nenhum pedaço da credencial.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Token (até 10 s) + cobrança (até 25 s) + uma consulta.
export const maxDuration = 60;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNAS =
  "id, provedor, ambiente, tipo, situacao, valor, vencimento, linha_digitavel, pix_copia_cola, motivo, emitida_em, pago_em, criado_em";

function fraseDoBanco(msg: string | undefined): string {
  const m = /A4P-COBRANCA-BANCO:\s*(.+)$/.exec(msg ?? "");
  return m ? m[1].trim() : "Não foi possível gerar a cobrança agora. Nada foi enviado ao banco.";
}

const semBanco = () => !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(req: Request) {
  if (semBanco()) return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });
  const movementId = new URL(req.url).searchParams.get("movementId")?.trim() ?? "";
  if (!UUID.test(movementId)) return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Título não informado." });
  if (!cobrancaBancoLigada(process.env)) return resposta(200, { ok: true, ligada: false, conectada: false, cobrancas: [] });

  const [{ data: conexoes, error: eC }, { data: cobrancas, error }] = await Promise.all([
    s.from("cobranca_banco_conexoes").select("id, ambiente").is("desligada_em", null).limit(1),
    s.from("cobrancas_banco").select(COLUNAS).eq("movement_id", movementId).order("criado_em", { ascending: false }).limit(20),
  ]);
  if (eC || error) return resposta(200, { ok: true, ligada: false, conectada: false, cobrancas: [] });
  const c = (conexoes ?? [])[0] as { ambiente?: string } | undefined;
  return resposta(200, { ok: true, ligada: true, conectada: !!c, ambiente: c?.ambiente ?? null, cobrancas: cobrancas ?? [] });
}

/** Confere a pendente no banco: pelo id (processando) ou pelo nosso número (incerta). */
async function conferir(cfg: ConfigInter, r: Extract<ReservaBanco, { forma: "pendente" }>): Promise<ResultadoCobrancaBanco> {
  if (r.idProvedor) return consultarCobrancaInter(cfg, r.idProvedor);
  try {
    const codigo = await acharCobrancaInter(cfg, r.seuNumero, r.vencimento);
    if (!codigo) return { situacao: "incerta", motivo: "O banco ainda não mostra esta cobrança; confira de novo em alguns minutos." };
    return consultarCobrancaInter(cfg, codigo);
  } catch (e) {
    return { situacao: "incerta", motivo: e instanceof Error ? e.message : "O banco não respondeu à procura." };
  }
}

export async function POST(req: Request) {
  if (semBanco()) return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo para gerar a cobrança." });

  let pedido: unknown = null;
  try {
    pedido = await req.json();
  } catch {
    pedido = null;
  }
  const bruto = pedido && typeof pedido === "object" ? (pedido as Record<string, unknown>).movementId : undefined;
  const movementId = typeof bruto === "string" ? bruto.trim() : "";
  if (!UUID.test(movementId)) return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Informe o título." });

  if (!cobrancaBancoLigada(process.env)) {
    return resposta(503, { ok: false, codigo: "desligada", motivo: "A cobrança pela conta bancária ainda não foi liberada pela Quattro." });
  }
  const admin = createAdmin();
  if (!admin || !cofreDisponivel()) {
    return resposta(503, { ok: false, codigo: "sem_servico", motivo: "A cobrança pela conta bancária não está configurada no servidor." });
  }

  // A RESERVA, como a pessoa.
  const { data: res, error: eR } = await s.rpc("cobranca_banco_reservar", { p_movement: movementId, p_tipo: "boleto_pix" });
  if (eR) {
    const permissao = eR.code === "42501";
    return resposta(permissao ? 403 : 409, { ok: false, codigo: permissao ? "sem_permissao" : "recusada", motivo: fraseDoBanco(eR.message) });
  }
  let reserva: ReservaBanco;
  try {
    reserva = lerReservaBanco(res);
  } catch {
    return resposta(500, { ok: false, codigo: "reserva_ilegivel", motivo: "Não foi possível gerar a cobrança agora. Nada foi enviado ao banco." });
  }

  const devolver = async (status: number, extra: Record<string, unknown> = {}) => {
    const { data } = await s.from("cobrancas_banco").select(COLUNAS).eq("id", reserva.id).maybeSingle();
    return resposta(status, { ok: status < 300, cobranca: data, ...extra });
  };
  if (reserva.forma === "existente") return devolver(200, { existente: true });

  const registrar = (r: ResultadoCobrancaBanco) => admin.rpc("cobranca_banco_registrar", { p_id: reserva.id, p_resultado: r });

  let cfg: ConfigInter;
  try {
    cfg = await configDaConexao(admin, reserva.conexaoId);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Não foi possível abrir a credencial da conta conectada.";
    // Nada saiu para o banco: a NOVA pode ser liberada; a pendente continua como está.
    if (reserva.forma === "nova") await registrar({ situacao: "falhou", motivo });
    return devolver(503, { codigo: "credencial", motivo });
  }

  let resultado: ResultadoCobrancaBanco;
  if (reserva.forma === "pendente") {
    resultado = await conferir(cfg, reserva);
  } else {
    const faltam = problemasDoPedido(reserva.pedido);
    if (faltam.length) {
      await registrar({ situacao: "falhou", motivo: faltam.join(" ") });
      return devolver(422, { codigo: "cadastro_incompleto", motivo: faltam.join(" ") });
    }
    resultado = await emitirCobrancaInter(cfg, reserva.pedido);
    // O Inter costuma devolver só o id e montar o boleto em seguida: uma consulta já resolve na maioria das vezes.
    if (resultado.situacao === "processando") {
      const { error: eP } = await registrar(resultado);
      if (!eP) {
        const consulta = await consultarCobrancaInter(cfg, resultado.idProvedor);
        if (consulta.situacao !== "incerta") resultado = consulta;
      }
    }
  }

  const { error: eG } = await registrar(resultado);
  console.info(JSON.stringify({
    evento: "cobranca_banco.emitir",
    usuario: auth.user.id,
    titulo: movementId,
    cobranca: reserva.id,
    forma: reserva.forma,
    situacao: resultado.situacao,
    gravou: !eG,
  }));
  if (eG) {
    return resposta(500, {
      ok: false,
      codigo: "registro_falhou",
      motivo: "O banco respondeu, mas o resultado não foi gravado. O título fica bloqueado para nova cobrança até a conferência.",
    });
  }
  if (resultado.situacao === "emitida" || resultado.situacao === "paga") return devolver(reserva.forma === "nova" ? 201 : 200);
  if (resultado.situacao === "processando") return devolver(202, { codigo: "processando", motivo: "O banco aceitou e está montando a cobrança. Abra o título de novo em instantes." });
  if (resultado.situacao === "cancelada") return devolver(200, { codigo: "cancelada", motivo: resultado.motivo });
  return devolver(resultado.situacao === "incerta" ? 504 : 502, { codigo: resultado.situacao, motivo: resultado.motivo });
}
