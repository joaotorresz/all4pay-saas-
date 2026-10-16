"use client";

/**
 * A autorização de WhatsApp dos CLIENTES (etapa 5 das automações, decisão do
 * dono 15/10/2026): cliente sem autorização registrada não recebe WhatsApp —
 * a cobrança dele segue por e-mail. Quem registra é a empresa, dizendo COMO o
 * cliente autorizou (a evidência fica na trilha).
 *
 * ⚠️ Quem decide é o banco (`whatsapp_autorizar`, `whatsapp_revogar`,
 * `whatsapp_situacao_contatos`): permissão de lançar, baixar ou administrar,
 * contatos só da empresa aberta, e quem respondeu SAIR não volta por aqui.
 * Em demonstração o registro vive só na memória desta aba.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";

export interface SituacaoWhatsappContato {
  partyId: string;
  telefone: string | null;
  autorizado: boolean;
  autorizadoEm: string | null;
  forma: "declarada" | "resposta" | null;
  evidencia: string | null;
  saiu: boolean;
}

export interface ResultadoAutorizacao {
  autorizados: number;
  jaAutorizados: number;
  semTelefone: number;
  pediramSaida: number;
  foraDaEmpresa: number;
}

const demo = new Map<string, SituacaoWhatsappContato>();
const CHAVE = ["whatsapp-situacao"] as const;

async function lerSituacao(): Promise<Record<string, SituacaoWhatsappContato>> {
  if (isDemo) return Object.fromEntries(demo);
  const { data, error } = await createClient().rpc("whatsapp_situacao_contatos");
  if (error) throw new Error(error.message);
  type Linha = { party_id: string; telefone: string | null; autorizado: boolean; autorizado_em: string | null; forma: string | null; evidencia: string | null; saiu: boolean };
  return Object.fromEntries(((data ?? []) as Linha[]).map((l) => [l.party_id, {
    partyId: l.party_id, telefone: l.telefone, autorizado: !!l.autorizado, autorizadoEm: l.autorizado_em,
    forma: l.forma === "resposta" ? "resposta" : l.forma === "declarada" ? "declarada" : null,
    evidencia: l.evidencia, saiu: !!l.saiu,
  }]));
}

export function useSituacaoWhatsapp() {
  return useQuery({ queryKey: CHAVE, queryFn: lerSituacao });
}

export function useAutorizarWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, evidencia }: { ids: string[]; evidencia: string }): Promise<ResultadoAutorizacao> => {
      if (isDemo) {
        const em = new Date().toISOString();
        ids.forEach((id) => demo.set(id, { partyId: id, telefone: null, autorizado: true, autorizadoEm: em, forma: "declarada", evidencia, saiu: false }));
        return { autorizados: ids.length, jaAutorizados: 0, semTelefone: 0, pediramSaida: 0, foraDaEmpresa: 0 };
      }
      const { data, error } = await createClient().rpc("whatsapp_autorizar", { p_partes: ids, p_evidencia: evidencia });
      if (error) throw new Error(error.message);
      return data as ResultadoAutorizacao;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useRevogarWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      if (isDemo) { ids.forEach((id) => demo.delete(id)); return ids.length; }
      const { data, error } = await createClient().rpc("whatsapp_revogar", { p_partes: ids });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

/** A frase do resultado: o que foi registrado e o que ficou de fora, e por quê. */
export function fraseDoResultado(r: ResultadoAutorizacao): string {
  const partes = [`${r.autorizados} ${r.autorizados === 1 ? "cliente autorizado" : "clientes autorizados"}`];
  if (r.jaAutorizados) partes.push(`${r.jaAutorizados} já estava${r.jaAutorizados === 1 ? "" : "m"} autorizado${r.jaAutorizados === 1 ? "" : "s"}`);
  if (r.semTelefone) partes.push(`${r.semTelefone} sem telefone no cadastro`);
  if (r.pediramSaida) partes.push(`${r.pediramSaida} pediu${r.pediramSaida === 1 ? "" : "ram"} para não receber (só volta respondendo VOLTAR)`);
  return partes.join(" · ") + ".";
}
