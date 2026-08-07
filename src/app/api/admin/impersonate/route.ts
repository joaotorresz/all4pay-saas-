import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * Impersonação "logar como" — SERVER-ONLY. O administrador da plataforma assume
 * a sessão do OWNER de uma organização: gera um magic link (chave de serviço)
 * que loga como aquele usuário; daí em diante o app responde via RLS daquela
 * org. Requer SUPABASE_SERVICE_ROLE_KEY. Para voltar: sair e logar.
 *
 * ⚠️ O PORTÃO MAIS PODEROSO DO PAINEL ERA O MAIS FRACO. Ele conferia só se o
 * `user_id` existia em `platform_admins` — sem segundo fator, sem prazo de
 * revisão, sem expiração — enquanto as treze funções administrativas, que
 * apenas LEEM, passavam por `admin_veredito()`. Ler a lista de clientes era
 * mais difícil que entrar na conta de um deles.
 *
 * Agora a conferência é `admin_exigir_acesso`, chamada com a sessão de QUEM
 * PEDE (não com a chave de serviço, que não tem dono): ela aplica o mesmo
 * veredito e REGISTRA a tentativa em `admin_acessos` — inclusive quando nega,
 * que é o registro que mais importa.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { orgId?: string };
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ ok: false, reason: "orgId ausente" }, { status: 400 });

  // 1) quem está chamando
  const doChamador = createClient();
  const { data: auth } = await doChamador.auth.getUser();
  const caller = auth?.user;
  if (!caller) return NextResponse.json({ ok: false, reason: "não autenticado" }, { status: 401 });

  /*
   * 2) O PORTÃO, com a sessão de quem pede.
   *
   * ⚠️ Tem de ser o cliente do CHAMADOR, não o de serviço: `admin_veredito()`
   * responde pelo `auth.uid()`, e a chave de serviço não tem dono — chamada por
   * ela, a função negaria sempre (e, pior, negaria sem saber de quem). É esta
   * chamada que aplica segundo fator, prazo e expiração, e que grava a
   * tentativa em `admin_acessos` mesmo quando o resultado é "não".
   */
  const { error: negado } = await doChamador.rpc("admin_exigir_acesso", {
    p_funcao: "impersonate",
    p_alvo: orgId,
  });
  if (negado) return NextResponse.json({ ok: false, reason: negado.message }, { status: 403 });

  // 3) service role (bypassa RLS) — necessário para gerar a sessão
  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY não configurada" }, { status: 501 });

  // 4) owner da org-alvo
  const { data: owner } = await admin
    .from("organization_members").select("user_id").eq("org_id", orgId).eq("role", "owner").maybeSingle();
  const ownerId = (owner as { user_id?: string } | null)?.user_id;
  if (!ownerId) return NextResponse.json({ ok: false, reason: "organização sem owner" }, { status: 404 });

  const { data: ownerUser } = await admin.auth.admin.getUserById(ownerId);
  const email = ownerUser?.user?.email;
  if (!email) return NextResponse.json({ ok: false, reason: "owner sem e-mail" }, { status: 404 });

  // 5) gera o magic link de login como o owner
  const origin = new URL(req.url).origin;
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "magiclink", email, options: { redirectTo: `${origin}/` },
  });
  if (error || !link?.properties?.action_link) {
    return NextResponse.json({ ok: false, reason: error?.message ?? "falha ao gerar sessão" }, { status: 500 });
  }

  /*
   * 6) auditoria da ação CONCLUÍDA.
   *
   * A TENTATIVA já ficou registrada em `admin_acessos` no passo 2, antes de
   * qualquer efeito — então uma falha aqui não deixa mais a impersonação sem
   * rastro nenhum, que era o caso quando este `insert` era o único registro e
   * vinha depois do link já gerado.
   */
  await admin.from("admin_audit").insert({ admin_id: caller.id, action: "impersonate", target: orgId, detail: { email } });

  return NextResponse.json({ ok: true, link: link.properties.action_link, email });
}
