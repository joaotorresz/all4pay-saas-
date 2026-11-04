import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cadastrarEmpresaNaFocus, cadastroEmpresasLigado, tokenDeProducaoConfigurado } from "@/lib/focusnfe";
import { lerRespostaEmpresa, montarEmpresaFocus, type DadosEmpresaFocus } from "@/core/nfse/empresa-focus";

/**
 * CADASTRAR A EMPRESA DO CLIENTE NA FOCUS — só a plataforma (03/11/2026).
 *
 *   POST /api/admin/focus-empresa  { dados: DadosEmpresaFocus, simular: boolean }
 *
 * Nasce DESLIGADO (interruptor `=ligado` lido só em `lib/focusnfe`).
 * Portões, nesta ordem: banco → sessão → `admin_exigir_acesso` → interruptor
 * → validação → só então a Focus. `simular` usa o `dry_run` da Focus: confere
 * o certificado e os dados sem criar a empresa.
 *
 * ⚠️ O certificado e a senha só atravessam: não são gravados, não vão a log e
 * a resposta não os ecoa.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, motivo: "Indisponível sem o banco (demonstração)." });
  }
  const doChamador = createClient();
  const { data: auth } = await doChamador.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, motivo: "não autenticado" });
  const { error: negado } = await doChamador.rpc("admin_exigir_acesso", { p_funcao: "admin_focus_empresa", p_alvo: null });
  if (negado) return resposta(403, { ok: false, motivo: negado.message });

  if (!cadastroEmpresasLigado()) return resposta(409, { ok: false, motivo: "O cadastro de empresas na Focus está desligado." });
  if (!tokenDeProducaoConfigurado()) return resposta(409, { ok: false, motivo: "Falta o token de produção da Focus." });

  let corpo: { dados?: unknown; simular?: unknown };
  try { corpo = await req.json(); } catch { return resposta(400, { ok: false, motivo: "Pedido ilegível." }); }
  const montado = montarEmpresaFocus((corpo.dados ?? {}) as DadosEmpresaFocus);
  if (!montado.ok) return resposta(422, { ok: false, problemas: montado.problemas });

  const simular = corpo.simular !== false;
  const r = await cadastrarEmpresaNaFocus(montado.corpo, simular);
  const lido = lerRespostaEmpresa(r.http, r.corpo);
  return resposta(lido.ok ? 200 : 422, { ok: lido.ok, simulado: simular, mensagem: simular && lido.ok ? "Simulação aprovada: a Focus aceitaria este cadastro." : lido.mensagem });
}
