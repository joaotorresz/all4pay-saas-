/** Área da plataforma · Notas fiscais. Os cadeados de servidor moram em `layout.tsx`. */
import { AdminShell } from "@/components/admin/AdminShell";
import { NotasFiscaisAdmin, type EmpresaFiscal } from "@/components/admin/NotasFiscaisAdmin";
import { createAdmin } from "@/lib/supabase/admin";
import { cadastroEmpresasLigado } from "@/lib/focusnfe";
import { isDemo } from "@/lib/demo";

// A configuração muda pela própria tela: cada pedido lê o banco de novo.
export const dynamic = "force-dynamic";

async function empresas(): Promise<EmpresaFiscal[]> {
  const admin = createAdmin();
  // Demonstração: uma empresa fictícia, marcada no nome, para ver a tela.
  if (!admin) return isDemo ? [{ id: "00000000-0000-4000-8000-000000000001", nome: "Empresa de demonstração", config: { cnpj: "00000000000191", inscricaoMunicipal: "12345678", codigoMunicipio: "3550308", optanteSimples: false, itemListaServico: "150103", aliquota: 2, grupoIbsCbs: false }, atualizadoPor: null, atualizadoEm: null }] : [];
  const [{ data: orgs }, { data: emit }] = await Promise.all([
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("nfse_emitentes").select("org_id, config, atualizado_por, atualizado_em"),
  ]);
  const porOrg = new Map((emit ?? []).map((e) => [e.org_id as string, e]));
  return (orgs ?? []).map((o) => {
    const e = porOrg.get(o.id as string);
    return {
      id: o.id as string,
      nome: (o.name as string) || "Sem nome",
      config: (e?.config as Record<string, unknown> | undefined) ?? null,
      atualizadoPor: (e?.atualizado_por as string | undefined) ?? null,
      atualizadoEm: (e?.atualizado_em as string | undefined) ?? null,
    };
  });
}

export default async function Page() {
  return (
    <AdminShell>
      <NotasFiscaisAdmin empresas={await empresas()} cadastroFocusLigado={cadastroEmpresasLigado()} />
    </AdminShell>
  );
}
