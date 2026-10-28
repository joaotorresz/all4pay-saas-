import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { BUCKET_DOCUMENTOS } from "@/core/cadastro/documentos";

/**
 * Abrir um documento do cofre do cadastro (etapa 3) — SERVER-ONLY.
 *
 * ⚠️ A ORDEM É A REGRA. Primeiro o banco, com a sessão de QUEM PEDE:
 * `admin_cadastro_documento_abrir` aplica o veredito administrativo, exige o
 * segundo fator (`aal2`) e grava em `admin_audit` quem abriu qual documento.
 * Só então a chave de serviço gera o link — o bucket é privado e não tem
 * política de leitura, então sem esta rota ninguém o lê. O link vence em 60 s:
 * um endereço que vazasse num histórico ou num print não serve depois.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALIDADE_S = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const recusa = (texto: string, status: number) =>
  new NextResponse(texto, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return recusa("Documento inválido.", 400);

  const doChamador = createClient();
  const { data: auth } = await doChamador.auth.getUser();
  if (!auth?.user) return recusa("Entre na área da plataforma para ver o documento.", 401);

  const { data: caminho, error } = await doChamador.rpc("admin_cadastro_documento_abrir", { p_documento: id });
  if (error || typeof caminho !== "string" || !caminho) {
    return recusa(error?.message ?? "Documento não encontrado.", error ? 403 : 404);
  }

  const admin = createAdmin();
  if (!admin) return recusa("O servidor está sem a chave de serviço; o documento não pode ser aberto.", 501);
  const { data: assinado, error: falha } = await admin.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(caminho, VALIDADE_S);
  if (falha || !assinado?.signedUrl) return recusa("O arquivo não foi encontrado no cofre.", 404);

  const res = NextResponse.redirect(assinado.signedUrl, 302);
  res.headers.set("cache-control", "no-store");
  return res;
}
