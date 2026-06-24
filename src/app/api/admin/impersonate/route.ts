import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * Impersonação "logar como" — SERVER-ONLY. O super-admin assume a sessão do
 * OWNER de uma organização: gera um magic link (service role) que loga como
 * aquele usuário; daí em diante o app responde via RLS daquela org. Gateado:
 * só quem está em `platform_admins`. Toda impersonação é AUDITADA (admin_audit).
 * Requer SUPABASE_SERVICE_ROLE_KEY. Para voltar à conta de admin: sair e logar.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { orgId?: string };
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ ok: false, reason: "orgId ausente" }, { status: 400 });

  // 1) quem está chamando
  const { data: auth } = await createClient().auth.getUser();
  const caller = auth?.user;
  if (!caller) return NextResponse.json({ ok: false, reason: "não autenticado" }, { status: 401 });

  // 2) service role (bypassa RLS) — necessário para gerar a sessão
  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY não configurada" }, { status: 501 });

  // 3) o chamador é super-admin?
  const { data: adm } = await admin.from("platform_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (!adm) return NextResponse.json({ ok: false, reason: "acesso negado" }, { status: 403 });

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

  // 6) auditoria
  await admin.from("admin_audit").insert({ admin_id: caller.id, action: "impersonate", target: orgId, detail: { email } });

  return NextResponse.json({ ok: true, link: link.properties.action_link, email });
}
