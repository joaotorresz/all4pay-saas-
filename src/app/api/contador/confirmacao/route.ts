import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { enviarEmail } from "@/core/financial-os/notifications.server";
import { emailValido, LIMITE_DESTINATARIOS } from "@/core/contabilidade";
import { emailDoLink, INTERVALO_REENVIO_MIN, optinContadorLigado } from "@/core/contabilidade/optin";

/**
 * PEDE O LINK DE CONFIRMAÇÃO DO CONTADOR (double opt-in, Fase 3.4).
 *
 *   POST /api/contador/confirmacao  { destId, email }  → { ok, codigo, motivo }
 *
 * ⚠️ Quem pede não confirma: o token nasce aqui, com a chave de serviço, e só
 * viaja no e-mail para o DESTINATÁRIO. A resposta nunca o traz.
 * ⚠️ Exige o papel de lançar na empresa aberta (o mesmo de cadastrar o
 * destinatário). Limites contra uso como disparador de e-mail: no máximo
 * LIMITE_DESTINATARIOS destinatários por empresa e um pedido a cada
 * INTERVALO_REENVIO_MIN minutos para o mesmo destinatário.
 * ⚠️ Nasce DESLIGADA (`CONTADOR_OPTIN=ligado`).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const ID = /^[A-Za-z0-9_-]{1,80}$/;

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  }
  if (!optinContadorLigado()) {
    return resposta(503, { ok: false, codigo: "desligado", motivo: "O envio do link de confirmação ainda não foi ligado pela Quattro." });
  }
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });

  const corpo = (await req.json().catch(() => null)) as { destId?: unknown; email?: unknown } | null;
  const destId = typeof corpo?.destId === "string" ? corpo.destId.trim() : "";
  const email = typeof corpo?.email === "string" ? corpo.email.trim().toLowerCase() : "";
  if (!ID.test(destId) || !emailValido(email)) {
    return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "E-mail do contador inválido." });
  }

  const { data: pode } = await s.rpc("tem_permissao", { p_acao: "lancar" });
  if (!pode) return resposta(403, { ok: false, codigo: "sem_permissao", motivo: "Só quem lança na empresa cadastra o contador." });
  const { data: orgId } = await s.rpc("auth_org_id");
  if (typeof orgId !== "string" || !orgId) return resposta(403, { ok: false, codigo: "sem_empresa", motivo: "Abra uma empresa antes." });

  const admin = createAdmin();
  if (!admin) return resposta(503, { ok: false, codigo: "sem_configuracao", motivo: "O servidor está sem a chave de serviço." });

  const { data: atuais, error: eL } = await admin.from("contador_confirmacoes")
    .select("dest_id, email, pedido_em, confirmado_em").eq("org_id", orgId).limit(LIMITE_DESTINATARIOS * 4);
  if (eL) return resposta(500, { ok: false, codigo: "falha", motivo: eL.message });
  const lista = (atuais ?? []) as { dest_id: string; email: string; pedido_em: string; confirmado_em: string | null }[];
  const deste = lista.find((x) => x.dest_id === destId);
  if (!deste && lista.length >= LIMITE_DESTINATARIOS) {
    return resposta(422, { ok: false, codigo: "limite", motivo: `Limite de ${LIMITE_DESTINATARIOS} destinatários atingido.` });
  }
  if (deste && deste.email === email && deste.confirmado_em) {
    return resposta(200, { ok: true, codigo: "ja_confirmado", motivo: "Este e-mail já foi confirmado pelo contador." });
  }
  if (deste && Date.now() - new Date(deste.pedido_em).getTime() < INTERVALO_REENVIO_MIN * 60_000) {
    return resposta(429, { ok: false, codigo: "aguarde", motivo: `O link acabou de ser enviado. Peça de novo daqui a ${INTERVALO_REENVIO_MIN} minutos.` });
  }

  // Um token NOVO a cada pedido: o link anterior deixa de valer.
  const { data: linha, error: eG } = await admin.from("contador_confirmacoes").upsert({
    org_id: orgId, dest_id: destId, email, token: crypto.randomUUID(),
    pedido_em: new Date().toISOString(), confirmado_em: null,
  }, { onConflict: "org_id,dest_id" }).select("token").single();
  if (eG || !linha) return resposta(500, { ok: false, codigo: "falha", motivo: eG?.message ?? "Falha ao registrar o pedido." });

  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const empresa = String(org?.name ?? "").trim() || "Uma empresa";
  const link = `${new URL(req.url).origin}/api/contador/confirmar?t=${linha.token}`;
  const m = emailDoLink(empresa, link);
  const r = await enviarEmail(email, m.assunto, m.texto);
  if (!r.ok) {
    return resposta(502, { ok: false, codigo: "envio_falhou", motivo: `O e-mail não saiu (${r.detalhe}). Tente de novo em alguns minutos.` });
  }
  return resposta(200, { ok: true, codigo: "enviado", motivo: `Link de confirmação enviado para ${email}.` });
}
