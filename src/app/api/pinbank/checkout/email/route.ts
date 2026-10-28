import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { semAmostra } from "@/lib/supabase/filtros";
import { cobrancaPinbankLiberada } from "@/lib/pinbank/api";
import { provedorReal } from "@/core/financial-os/notifications.server";
import { credorDoCadastro } from "@/core/cobranca";
import {
  despachar, relatorioVazio, mascarar, ehEmail, hojeEm, redigirLinkDePagamento, type MensagemAutomacao,
} from "@/core/automacoes";
import { registroSupabase } from "@/lib/automacoes-registro";

/**
 * O LINK DE PAGAMENTO POR E-MAIL — "Enviar por e-mail" na baixa do título.
 *
 *   POST /api/pinbank/checkout/email  { movementId }  → { ok, situacao, destino }
 *
 * ⚠️ A rota não é megafone: o pedido diz SÓ o título. O destino é o e-mail do
 * CADASTRO do cliente do título, e o conteúdo é o da régua no modelo da Asaas
 * (`redigirLinkDePagamento`) — nada do corpo da requisição vai para o e-mail.
 * ⚠️ Tudo é lido como a PESSOA (política de linha da empresa aberta), e o
 * registro em `automacao_envios` exige o papel de lançar, dar baixa ou
 * administrar. A chave `link:<título>:<dia>` deixa UM envio por título por dia:
 * o segundo clique é recusado pelo índice, não por uma leitura antes.
 * ⚠️ Grava antes, envia depois (`despachar`). Sem credencial do provedor o
 * registro fica SIMULADO — e a tela diz que nada saiu.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/;

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  }
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });
  const corpo = (await req.json().catch(() => null)) as { movementId?: unknown } | null;
  const movementId = typeof corpo?.movementId === "string" ? corpo.movementId.trim() : "";
  if (!UUID.test(movementId)) return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Título não informado." });
  if (!cobrancaPinbankLiberada().liberada) {
    return resposta(503, { ok: false, codigo: "indisponivel", motivo: "A cobrança pela conta Pinbank ainda não foi liberada pela Quattro." });
  }
  const { data: pode } = await s.rpc("tem_permissao", { p_acao: "lancar" });
  if (!pode) return resposta(403, { ok: false, codigo: "sem_permissao", motivo: "Só quem lança na empresa envia a cobrança ao cliente." });

  const { data: mov } = await semAmostra(s.from("movements")
    .select("id, org_id, type, situacao, amount, due_date, party_id, excluido_em"))
    .eq("id", movementId).maybeSingle();
  if (!mov || mov.excluido_em || mov.type !== "entrada" || !["previsto", "confirmado"].includes(String(mov.situacao))) {
    return resposta(422, { ok: false, codigo: "titulo_fechado", motivo: "Este título não está a receber em aberto." });
  }

  const [{ data: links }, { data: emitidas }, { data: parte }, { data: org }, { data: perfil }] = await Promise.all([
    s.from("pinbank_checkout_links").select("token").eq("movement_id", movementId).is("revogado_em", null).limit(1),
    s.from("pinbank_cobrancas").select("id").eq("movement_id", movementId).eq("situacao", "emitida").limit(1),
    mov.party_id ? s.from("parties").select("name, email").eq("id", mov.party_id).maybeSingle() : Promise.resolve({ data: null }),
    s.from("organizations").select("name").eq("id", mov.org_id).maybeSingle(),
    s.from("company_profiles").select("profile").eq("org_id", mov.org_id).maybeSingle(),
  ]);
  const token = String((links ?? [])[0]?.token ?? "");
  if (!TOKEN.test(token) || !(emitidas ?? []).length) {
    return resposta(422, { ok: false, codigo: "sem_link", motivo: "Crie o link de pagamento antes de enviar." });
  }
  const destino = String(parte?.email ?? "").trim();
  if (!ehEmail(destino)) {
    return resposta(422, { ok: false, codigo: "sem_email", motivo: "O cliente deste título não tem e-mail no cadastro. Cadastre o e-mail em Clientes e envie de novo." });
  }

  const hoje = hojeEm(new Date());
  const credor = credorDoCadastro(org?.name, ((perfil?.profile as { db?: Record<string, unknown> } | null)?.db) ?? null);
  const c = redigirLinkDePagamento(
    { orgId: String(mov.org_id), hoje, credor, appUrl: new URL(req.url).origin, token },
    { movimentoId: movementId, cliente: String(parte?.name ?? "").trim() || "cliente", partyId: mov.party_id ?? null,
      valor: Math.abs(Number(mov.amount) || 0), vencimento: String(mov.due_date) },
  );
  const m: MensagemAutomacao = {
    tipo: "regua_cobranca", canal: "email", destino, destinoMascarado: mascarar("email", destino),
    chave: c.chaveBase, assunto: c.assunto, texto: c.texto, html: c.html, finalidade: c.finalidade, variaveis: c.variaveis,
    ...(c.remetente ? { remetente: c.remetente } : {}),
  };
  try {
    const rel = await despachar("", [m], { registro: registroSupabase(s), provedor: provedorReal() }, relatorioVazio());
    const r = rel.itens[0];
    // Um registro por envio, sem endereço nem valor.
    console.info(JSON.stringify({ evento: "checkout_email", org: mov.org_id, titulo: movementId, resultado: r?.resultado }));
    if (r?.resultado === "enviado") return resposta(200, { ok: true, situacao: "enviado", destino: m.destinoMascarado });
    if (r?.resultado === "simulado") {
      return resposta(200, { ok: true, situacao: "simulado", destino: m.destinoMascarado, motivo: "O envio de e-mail não está configurado neste ambiente: nada saiu." });
    }
    if (r?.resultado === "ja_registrado") {
      return resposta(409, { ok: false, codigo: "ja_enviado", destino: m.destinoMascarado, motivo: `O link deste título já foi enviado hoje para ${m.destinoMascarado}. Amanhã dá para enviar de novo.` });
    }
    return resposta(502, { ok: false, codigo: "falhou", motivo: "O e-mail não saiu. Tente de novo em alguns minutos." });
  } catch {
    return resposta(500, { ok: false, codigo: "falhou", motivo: "O e-mail não saiu. Tente de novo em alguns minutos." });
  }
}
