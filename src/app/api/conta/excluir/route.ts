import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { TETO_LINHAS } from "@/lib/supabase/filtros";
import { decidirExclusao, type VinculoDaConta } from "@/core/conta/exclusao";

/**
 * Excluir a PRÓPRIA conta (exigência das lojas). Regra em `core/conta/exclusao`.
 *
 * ⚠️ Quem é excluído sai da SESSÃO de quem pede, nunca de um id no corpo: a
 * rota não aceita apontar para outra pessoa. A chave de serviço só entra
 * depois da regra, porque `auth.admin.deleteUser` não existe para a sessão.
 * Os vínculos (`organization_members`, `user_active_org`) caem em cascata.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { confirmacao?: string };

  const sessao = createClient();
  const { data: auth } = await sessao.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ ok: false, motivo: "Entre na conta para excluí-la." }, { status: 401 });

  const admin = createAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, motivo: "A exclusão está indisponível agora. Fale com o suporte." }, { status: 503 });
  }

  const { data: membros, error: erroMembros } = await admin
    .from("organization_members")
    .select("org_id, role, organizations(name)")
    .eq("user_id", user.id)
    .limit(TETO_LINHAS);
  if (erroMembros) {
    console.error("[conta/excluir] vínculos", erroMembros.message);
    return NextResponse.json({ ok: false, motivo: "Não foi possível ler as suas empresas. Tente de novo." }, { status: 500 });
  }

  const vinculos: VinculoDaConta[] = [];
  for (const m of (membros ?? []) as { org_id: string; role: string; organizations: { name?: string } | null }[]) {
    const { count, error } = await admin
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", m.org_id)
      .limit(1); // a contagem exata vem inteira; o limite só corta as linhas, que nem voltam (head)
    if (error || count == null) {
      // Contagem que não veio não vira "1": isso apagaria o titular de uma equipe.
      return NextResponse.json({ ok: false, motivo: "Não foi possível conferir as suas empresas. Tente de novo." }, { status: 500 });
    }
    vinculos.push({ orgId: m.org_id, nome: m.organizations?.name ?? "uma empresa", papel: m.role, participantes: count });
  }

  const { data: plataforma } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();

  const decisao = decidirExclusao({
    vinculos,
    administradorDaPlataforma: !!plataforma,
    confirmacao: body.confirmacao ?? "",
  });
  if (!decisao.ok) return NextResponse.json(decisao, { status: 409 });

  const { error: erroExclusao } = await admin.auth.admin.deleteUser(user.id);
  if (erroExclusao) {
    console.error("[conta/excluir] deleteUser", erroExclusao.message);
    return NextResponse.json({ ok: false, motivo: "A conta não foi excluída. Tente de novo ou fale com o suporte." }, { status: 500 });
  }
  console.info("[conta/excluir] conta excluída", { empresasGuardadas: decisao.empresasGuardadas.length });
  return NextResponse.json({ ok: true, empresasGuardadas: decisao.empresasGuardadas });
}
