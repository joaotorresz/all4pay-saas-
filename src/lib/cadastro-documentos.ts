"use client";

import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { organizacaoAtivaDoServidor } from "@/lib/store-org";
import { BUCKET_DOCUMENTOS, caminhoDoDocumento, type TipoDocumento } from "@/core/cadastro/documentos";

/**
 * O lado do navegador do cofre (`core/cadastro/documentos`).
 *
 * O cadastro guarda os arquivos na MEMÓRIA da aba enquanto a conta não existe
 * (não há sessão para subir) e chama `enviarDocumentosDoCadastro` logo depois de
 * a conta nascer. ⚠️ Nada aqui trava o cadastro: a falha é DEVOLVIDA (quem chama
 * reporta) e o cliente segue — o documento fica como "a validar" lá dentro.
 * Em demonstração nada sai.
 */
export type DocumentoPendente = { tipo: TipoDocumento; arquivo: Blob };

export type ResultadoEnvio = { enviados: number; falhas: { tipo: TipoDocumento; motivo: string }[] };

export async function enviarDocumentosDoCadastro(pendentes: DocumentoPendente[]): Promise<ResultadoEnvio> {
  const r: ResultadoEnvio = { enviados: 0, falhas: [] };
  if (isDemo || pendentes.length === 0) return r;
  const org = await organizacaoAtivaDoServidor();
  if (!org) return { enviados: 0, falhas: pendentes.map((p) => ({ tipo: p.tipo, motivo: "sem empresa aberta" })) };
  const sb = createClient();
  for (const p of pendentes) {
    const caminho = caminhoDoDocumento(org, p.tipo, crypto.randomUUID(), p.arquivo.type, p.arquivo.size);
    if (!caminho) { r.falhas.push({ tipo: p.tipo, motivo: "formato ou tamanho fora do aceito" }); continue; }
    const { error: erroEnvio } = await sb.storage.from(BUCKET_DOCUMENTOS).upload(caminho, p.arquivo, { contentType: p.arquivo.type, upsert: false });
    if (erroEnvio) { r.falhas.push({ tipo: p.tipo, motivo: erroEnvio.message }); continue; }
    const { data, error } = await sb.rpc("cadastro_documento_registrar", { p_tipo: p.tipo, p_caminho: caminho });
    if (error || data !== "ok") { r.falhas.push({ tipo: p.tipo, motivo: error?.message ?? String(data) }); continue; }
    r.enviados += 1;
  }
  return r;
}
