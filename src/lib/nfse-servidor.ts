/**
 * As leituras e os portões comuns das rotas `/api/nfse/*`. SERVER-ONLY.
 *
 * ⚠️ Toda leitura é COMO A PESSOA (cliente do servidor com a sessão dela): a
 * política de linha de `nfse` só devolve as notas da empresa aberta, e é isso
 * que impede pedir a emissão da nota de outra empresa pelo id.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TomadorParaEmitir } from "@/core/nfse/focus";

export const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A permissão que emitir e cancelar nota exigem: é lançar receita. */
export const ACAO_NOTA = "lancar";

export interface LinhaNota {
  id: string;
  org_id: string;
  status: string;
  description: string | null;
  service_code: string | null;
  amount: number;
  iss_retained: boolean | null;
  provedor_ref: string | null;
  ambiente: string | null;
  numero: string | null;
  tomador: TomadorParaEmitir | null;
}

type Parte = {
  name: string | null; doc: string | null; email: string | null; phone: string | null; zip: string | null;
  street: string | null; number: string | null; complement: string | null; district: string | null; state: string | null;
};

const COLUNAS = "id, org_id, status, description, service_code, amount, iss_retained, provedor_ref, ambiente, numero, "
  + "parties(name, doc, email, phone, zip, street, number, complement, district, state)";

export type Sessao = { s: ReturnType<typeof createClient>; userId: string };

/** Sem banco (demonstração) ou sem sessão: a resposta pronta; senão, o cliente. */
export async function abrirSessao(): Promise<Sessao | NextResponse> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  }
  const s = createClient();
  const { data } = await s.auth.getUser();
  if (!data?.user) return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo." });
  return { s, userId: data.user.id };
}

export async function lerNota(s: Sessao["s"], id: string): Promise<LinhaNota | null | "falhou"> {
  const { data, error } = await s.from("nfse").select(COLUNAS).eq("id", id).maybeSingle();
  if (error) return "falhou";
  if (!data) return null;
  const r = data as unknown as Omit<LinhaNota, "tomador"> & { parties: Parte | Parte[] | null };
  const p = Array.isArray(r.parties) ? (r.parties[0] ?? null) : r.parties;
  return {
    ...r,
    amount: Number(r.amount),
    tomador: p ? {
      nome: p.name ?? "", documento: p.doc, email: p.email, telefone: p.phone, cep: p.zip,
      rua: p.street, numero: p.number, complemento: p.complement, bairro: p.district, uf: p.state,
    } : null,
  };
}

export async function podeLancar(s: Sessao["s"], orgId: string): Promise<boolean> {
  const { data, error } = await s.rpc("tem_permissao", { p_acao: ACAO_NOTA, p_org: orgId });
  return !error && data === true;
}

export async function lerId(req: Request): Promise<{ id: string; justificativa: string }> {
  let corpo: unknown = null;
  try { corpo = await req.json(); } catch { corpo = null; }
  const o = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  return {
    id: typeof o.id === "string" ? o.id.trim() : "",
    justificativa: typeof o.justificativa === "string" ? o.justificativa : "",
  };
}

/** Uma linha por chamada ao provedor: quem, qual nota, qual referência e o código. Nunca o token nem dado do tomador. */
export function registrar(acao: string, quem: string, nota: string, ref: string | null, http: number): void {
  console.info(`[nfse] ${acao} usuario=${quem} nota=${nota} ref=${ref ?? "—"} http=${http}`);
}
