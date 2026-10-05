"use client";

/**
 * A maquininha Pinbank vista pela EMPRESA — leitura e as duas ações dela.
 *
 * Lê pela sessão do usuário (a política recorta pela empresa aberta). As duas
 * escritas são RPC/rota que recusam quem não administra: ativar/configurar o
 * vínculo (`pinbank_configurar_vinculo`) e reprocessar os eventos
 * (`/api/pinbank/reprocessar`).
 *
 * ⚠️ Nada aqui grava venda nem título. Quem grava é o banco
 * (`pinbank_aplicar`), chamado pelo webhook com a chave de serviço.
 *
 * ⚠️ Em demonstração não há maquininha conectada: a leitura é vazia e a tela
 * diz isso. Inventar vendas de maquininha aqui seria mostrar dado que não existe.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { motivoDaRecusa } from "@/lib/erros";
import type { PrazosPinbank, TaxasPinbank } from "@/core/pinbank";

export interface VinculoTela {
  id: string;
  estabelecimento_id: number | null;
  chave_gateway: string | null;
  nome: string | null;
  conta_id: string | null;
  taxas: TaxasPinbank;
  prazos: PrazosPinbank;
  antecipado: boolean;
  ativo: boolean;
  ativado_em: string | null;
}

export interface EventoTela {
  event_id: string;
  event_type: string;
  nsu: number | null;
  ocorrido_em: string;
  recebido_em: string;
  situacao: string;
  motivo: string | null;
  tentativas: number;
  /** `Data.valor` em centavos, como chegou. */
  valor_centavos: number | null;
}

export interface EstadoPinbank {
  vinculos: VinculoTela[];
  eventos: EventoTela[];
  pendentes: number;
}

const VAZIO: EstadoPinbank = { vinculos: [], eventos: [], pendentes: 0 };
export const SITUACOES_PENDENTES = ["aguardando_ativacao", "bloqueado", "erro", "recebido"];

export async function lerPinbank(): Promise<EstadoPinbank> {
  if (isDemo) return VAZIO;
  const s = createClient();
  const [v, e] = await Promise.all([
    s.from("pinbank_vinculos")
      .select("id, estabelecimento_id, chave_gateway, nome, conta_id, taxas, prazos, antecipado, ativo, ativado_em")
      .order("criado_em").limit(50),
    s.from("pinbank_eventos")
      .select("event_id, event_type, nsu, ocorrido_em, recebido_em, situacao, motivo, tentativas, valor_centavos:payload->valor")
      .order("recebido_em", { ascending: false }).limit(50),
  ]);
  if (v.error) throw new Error(motivoDaRecusa(v.error));
  if (e.error) throw new Error(motivoDaRecusa(e.error));
  const eventos = (e.data ?? []) as EventoTela[];
  return {
    vinculos: (v.data ?? []) as VinculoTela[],
    eventos,
    pendentes: eventos.filter((x) => SITUACOES_PENDENTES.includes(x.situacao)).length,
  };
}

export async function configurarVinculo(p: {
  id: string; contaId: string | null; taxas: TaxasPinbank; prazos: PrazosPinbank; antecipado: boolean; ativo: boolean;
}): Promise<void> {
  const { error } = await createClient().rpc("pinbank_configurar_vinculo", {
    p_vinculo: p.id, p_conta: p.contaId, p_taxas: p.taxas, p_prazos: p.prazos,
    p_antecipado: p.antecipado, p_ativo: p.ativo,
  });
  if (error) throw new Error(motivoDaRecusa(error));
}

export async function reprocessarPinbank(): Promise<{ total: number; contagem: Record<string, number> }> {
  const r = await fetch("/api/pinbank/reprocessar", { method: "POST" });
  const corpo = (await r.json().catch(() => null)) as { ok?: boolean; motivo?: string; total?: number; contagem?: Record<string, number> } | null;
  if (!r.ok || !corpo?.ok) throw new Error(corpo?.motivo ?? `O reprocessamento respondeu ${r.status}.`);
  return { total: corpo.total ?? 0, contagem: corpo.contagem ?? {} };
}
