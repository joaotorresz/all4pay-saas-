import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ambienteFocus, consultarTabelaDoMunicipio, type TabelaMunicipioFocus } from "@/lib/focusnfe";

/**
 * O QUE O MUNICÍPIO ACEITA NA FOCUS — só leitura, só a plataforma.
 *
 *   GET /api/admin/focus-municipio?tabela=itens|tributarios&municipio=3550308
 *       [&codigo=1703][&descricao=pagamento][&offset=100]
 *
 * A recusa E0312 ("o código de tributação nacional não está administrado pelo
 * município") não se resolve chutando código: é preciso a lista que a
 * prefeitura administra. A Focus a publica, mas só com o token da conta, que
 * mora na Vercel — daí esta rota. Nenhuma escrita, nenhum dado de cliente; o
 * token nunca sai na resposta.
 *
 * Portões: o middleware já barra `/api/admin/*` para quem não é da
 * plataforma; aqui, sessão → `admin_exigir_acesso` (prazo, segundo fator,
 * registro) → só então a Focus.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABELAS: Record<string, TabelaMunicipioFocus> = {
  itens: "itens_lista_servico",
  tributarios: "codigos_tributarios_municipio",
};

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, motivo: "Indisponível sem o banco (demonstração)." });
  }
  const doChamador = createClient();
  const { data: auth } = await doChamador.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, motivo: "não autenticado" });
  const { error: negado } = await doChamador.rpc("admin_exigir_acesso", { p_funcao: "admin_focus_municipio", p_alvo: null });
  if (negado) return resposta(403, { ok: false, motivo: negado.message });

  const url = new URL(req.url);
  const tabela = TABELAS[url.searchParams.get("tabela") ?? "itens"];
  if (!tabela) return resposta(400, { ok: false, motivo: "tabela deve ser itens ou tributarios" });
  const municipio = (url.searchParams.get("municipio") ?? "3550308").replace(/\D/g, "");
  if (municipio.length !== 7) return resposta(400, { ok: false, motivo: "municipio deve ser o código IBGE de 7 dígitos" });

  const r = await consultarTabelaDoMunicipio(municipio, tabela, {
    codigo: url.searchParams.get("codigo") ?? undefined,
    descricao: url.searchParams.get("descricao") ?? undefined,
    offset: Number(url.searchParams.get("offset") ?? 0) || 0,
  });
  return resposta(200, { ok: r.http >= 200 && r.http < 300, ambiente: ambienteFocus(), municipio, tabela, http: r.http, resultado: r.corpo });
}
