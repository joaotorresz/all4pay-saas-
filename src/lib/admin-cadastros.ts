/**
 * O funil do cadastro no admin (etapa 3): leitura da jornada e do cofre.
 * **live**: as RPCs `admin_cadastro_*` (portão `admin_exigir_acesso`; o
 * documento exige o segundo fator no BANCO). **demo**: jornadas sintéticas
 * determinísticas e nenhum documento — o cofre não existe na demonstração.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import type { TipoDocumento } from "@/core/cadastro/documentos";
import { jornadaDaLinha, type JornadaAdmin } from "@/core/cadastro/funil";

export interface DocumentoAdmin {
  id: string;
  tipo: TipoDocumento;
  mime: string;
  tamanho: number;
  enviadoEm: string;
  guardarAte: string;
}

export const NOME_DOCUMENTO: Record<TipoDocumento, string> = {
  selfie: "Foto do rosto",
  rg: "RG",
  cnh: "CNH",
  contrato: "Contrato social",
  comprovante: "Comprovante",
};

/** A rota que gera o link assinado (60 s) e registra quem abriu. */
export const rotaDoDocumento = (id: string) => `/api/admin/cadastro/documento?id=${encodeURIComponent(id)}`;

function jornadasDeDemonstracao(agora: Date): JornadaAdmin[] {
  const h = (horas: number) => new Date(agora.getTime() - horas * 3_600_000).toISOString();
  const base = (id: string, etapa: string, passos: string[], horasInicio: number, horasUltimo: number, extra: Partial<JornadaAdmin> = {}): JornadaAdmin => ({
    id, etapa, tipo: "pj", nome: null, whatsapp: null, email: null, orgId: null, empresa: null,
    etapas: Object.fromEntries(passos.map((p, i) => [p, h(horasInicio - (i * (horasInicio - horasUltimo)) / Math.max(passos.length - 1, 1))])),
    iniciadaEm: h(horasInicio), atualizadaEm: h(horasUltimo), concluidaEm: null, documentos: 0, ...extra,
  });
  return [
    base("00000000-0000-4000-8000-000000000001", "pronto", ["tipo", "documento", "repNome", "repTelefone", "repEmail", "senha", "facial", "pronto"], 50, 49.5,
      { nome: "Marina Alves", whatsapp: "11987654321", email: "marina@alvesconsultoria.com.br", orgId: "demo-org-1", empresa: "Alves Consultoria", concluidaEm: h(49.5), documentos: 3 }),
    base("00000000-0000-4000-8000-000000000002", "facial", ["tipo", "documento", "repNome", "repTelefone", "repEmail", "senha", "facial"], 30, 29.6,
      { nome: "Rafael Souza", whatsapp: "21991234567", email: "rafael@souzalog.com.br" }),
    base("00000000-0000-4000-8000-000000000003", "repTelefone", ["tipo", "documento", "repNome", "repTelefone"], 5, 4.8, { nome: "Carla Mendes" }),
    base("00000000-0000-4000-8000-000000000004", "documento", ["tipo", "documento"], 0.2, 0.1),
    base("00000000-0000-4000-8000-000000000005", "pronto", ["tipo", "documento", "nome", "emailPf", "senha", "pronto"], 80, 79.7,
      { tipo: "pf", nome: "João Pedro Lima", email: "joaopedro@email.com", orgId: "demo-org-2", empresa: "João Pedro Lima", concluidaEm: h(79.7), documentos: 2 }),
  ];
}

export async function getFunilCadastro(dias = 90): Promise<JornadaAdmin[]> {
  if (isDemo) return jornadasDeDemonstracao(new Date());
  const { data, error } = await createClient().rpc("admin_cadastro_funil", { p_dias: dias });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(jornadaDaLinha).filter((j): j is JornadaAdmin => j !== null);
}

export async function getDocumentosCadastro(orgId: string): Promise<DocumentoAdmin[]> {
  if (isDemo) return [];
  const { data, error } = await createClient().rpc("admin_cadastro_documentos", { p_org: orgId });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), tipo: r.tipo as TipoDocumento, mime: String(r.mime ?? ""), tamanho: Number(r.tamanho ?? 0),
    enviadoEm: String(r.enviado_em ?? ""), guardarAte: String(r.guardar_ate ?? ""),
  }));
}
