import { randomUUID, X509Certificate } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cobrancaBancoLigada, problemasDaConexao, type FormularioConexao } from "@/core/cobranca-banco/conexao";
import { cifrarSegredo, cofreDisponivel } from "@/lib/cobranca-banco/cofre";
import { lerPem, testarCredencialInter } from "@/lib/cobranca-banco/inter-api";

/**
 * "CONECTAR MEU BANCO" — a conta da empresa que recebe as cobranças.
 *
 *   GET    /api/cobranca-banco/conexao   → { ligada, cofre, conexao }
 *   POST   /api/cobranca-banco/conexao   { ambiente, clientId, clientSecret, certificado, chave, contaCorrente }
 *   DELETE /api/cobranca-banco/conexao
 *
 * ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ.** Só quem ADMINISTRA a empresa aberta
 * conecta ou desconecta (o banco confere em `cobranca_banco_conectar`; a rota
 * pergunta ANTES de testar, para não emprestar o servidor a quem só lança).
 *
 * Portões do POST, na ordem: demonstração → interruptor (`COBRANCA_BANCO`) →
 * cofre (`COBRANCA_CHAVE_MESTRA`) → sessão → papel de administrar → forma do
 * formulário → o TOKEN do banco sai com esta credencial → cifra → grava.
 *
 * ⚠️ **O segredo é mostrado uma vez: no momento em que se digita.** Nenhuma
 * resposta o devolve, e o log registra só quem, a empresa, o ambiente e se
 * o teste passou.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const COLUNAS = "id, provedor, ambiente, client_id, conta_corrente, certificado_ate, testada_em, criado_em";

function fraseDoBanco(msg: string | undefined, padrao: string): string {
  const m = /A4P-COBRANCA-BANCO:\s*(.+)$/.exec(msg ?? "");
  return m ? m[1].trim() : padrao;
}

const semBanco = () => !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET() {
  if (semBanco()) return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });
  const ligada = cobrancaBancoLigada(process.env);
  // Como a pessoa: a política só devolve a conexão da empresa aberta.
  const { data, error } = await s
    .from("cobranca_banco_conexoes")
    .select(COLUNAS)
    .is("desligada_em", null)
    .eq("provedor", "inter")
    .limit(1);
  if (error) {
    // Sem a migration aplicada a tabela não existe: a tela diz que ainda não está disponível.
    return resposta(200, { ok: true, ligada: false, cofre: false, conexao: null, pendente: "migration" });
  }
  return resposta(200, { ok: true, ligada, cofre: cofreDisponivel(), conexao: (data ?? [])[0] ?? null });
}

export async function POST(req: Request) {
  if (semBanco()) return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  if (!cobrancaBancoLigada(process.env)) {
    return resposta(503, { ok: false, codigo: "desligada", motivo: "A cobrança pela conta bancária ainda não foi liberada pela Quattro." });
  }
  if (!cofreDisponivel()) {
    return resposta(503, { ok: false, codigo: "sem_cofre", motivo: "O servidor ainda não tem onde guardar a credencial com segurança." });
  }
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });

  const { data: pode } = await s.rpc("tem_permissao", { p_acao: "administrar" });
  if (pode !== true) {
    return resposta(403, { ok: false, codigo: "sem_permissao", motivo: "Só quem administra a empresa conecta a conta que recebe as cobranças." });
  }

  let pedido: unknown = null;
  try {
    pedido = await req.json();
  } catch {
    pedido = null;
  }
  const campo = (k: string) => {
    const v = pedido && typeof pedido === "object" ? (pedido as Record<string, unknown>)[k] : undefined;
    return typeof v === "string" ? v : "";
  };
  const f: FormularioConexao = {
    ambiente: campo("ambiente").trim(),
    clientId: campo("clientId").trim(),
    clientSecret: campo("clientSecret").trim(),
    certificado: lerPem(campo("certificado"), "CERTIFICATE") ?? campo("certificado"),
    chave: lerPem(campo("chave"), "PRIVATE KEY") ?? campo("chave"),
    contaCorrente: campo("contaCorrente").trim(),
  };
  const problemas = problemasDaConexao(f);
  if (problemas.length) return resposta(400, { ok: false, codigo: "formulario", motivo: problemas.join(" ") });

  // A validade do certificado, para a tela avisar antes de a cobrança parar.
  let certificadoAte: string | null = null;
  try {
    const x = new X509Certificate(f.certificado);
    certificadoAte = new Date(x.validTo).toISOString().slice(0, 10);
  } catch {
    return resposta(400, { ok: false, codigo: "formulario", motivo: "O certificado não pôde ser lido; confira se é o .crt da integração." });
  }

  const conta = f.contaCorrente.replace(/\D/g, "");
  const teste = await testarCredencialInter({
    ambiente: f.ambiente as "sandbox" | "producao",
    clientId: f.clientId,
    clientSecret: f.clientSecret,
    mtls: { certificado: f.certificado, chave: f.chave },
    contaCorrente: conta || null,
  });
  console.info(JSON.stringify({ evento: "cobranca_banco.conectar", usuario: auth.user.id, ambiente: f.ambiente, teste: teste.ok }));
  if (!teste.ok) {
    return resposta(422, { ok: false, codigo: "credencial_recusada", motivo: `O Inter não aceitou esta credencial. ${teste.motivo}` });
  }

  const id = randomUUID();
  const cifrado = cifrarSegredo({ clientSecret: f.clientSecret, certificado: f.certificado, chave: f.chave }, id);
  const { error } = await s.rpc("cobranca_banco_conectar", {
    p_id: id,
    p_provedor: "inter",
    p_ambiente: f.ambiente,
    p_client_id: f.clientId,
    p_conta_corrente: conta || null,
    p_certificado_ate: certificadoAte,
    p_cifrado: cifrado,
  });
  if (error) {
    const permissao = error.code === "42501";
    return resposta(permissao ? 403 : 409, {
      ok: false,
      codigo: permissao ? "sem_permissao" : "recusada",
      motivo: fraseDoBanco(error.message, "A credencial funcionou, mas não foi possível guardá-la agora. Tente de novo."),
    });
  }
  const { data } = await s.from("cobranca_banco_conexoes").select(COLUNAS).eq("id", id).maybeSingle();
  return resposta(201, { ok: true, conexao: data });
}

export async function DELETE() {
  if (semBanco()) return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });
  const { error } = await s.rpc("cobranca_banco_desconectar", { p_provedor: "inter" });
  console.info(JSON.stringify({ evento: "cobranca_banco.desconectar", usuario: auth.user.id, ok: !error }));
  if (error) {
    const permissao = error.code === "42501";
    return resposta(permissao ? 403 : 409, {
      ok: false,
      codigo: permissao ? "sem_permissao" : "recusada",
      motivo: fraseDoBanco(error.message, "Não foi possível desconectar agora."),
    });
  }
  return resposta(200, { ok: true });
}
