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
import { falhaDaConferenciaSemCorpo, type PrazosPinbank, type RelatorioParaEmpresa, type TaxasPinbank } from "@/core/pinbank";

export interface VinculoTela {
  id: string;
  estabelecimento_id: number | null;
  chave_gateway: string | null;
  nome: string | null;
  /** O `CodigoCliente` do extrato consolidado (o EC) — cadastrado pela plataforma; `null` = ainda não. */
  codigo_cliente: number | null;
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
      .select("id, estabelecimento_id, chave_gateway, nome, codigo_cliente, conta_id, taxas, prazos, antecipado, ativo, ativado_em")
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

export type ResultadoConferencia =
  | { ok: true; relatorio: RelatorioParaEmpresa; consultadoEm: string }
  /** `restanteMs`: só no 429 (`aguarde`) — quanto o BANCO disse que falta; o botão espera isso. */
  | { ok: false; codigo: string; motivo: string; restanteMs?: number };

/**
 * Quanto a tela espera pela rota: o `maxDuration` dela (60 s) e uma folga.
 * Passado isso, a resposta não vem mais — e a pessoa precisa saber disso em vez
 * de olhar um botão girando para sempre.
 */
const ESPERA_DA_ROTA_MS = 75_000;

/**
 * Pede a conferência extrato × sistema de UMA maquininha num período. Só
 * leitura — a rota não grava nada. Nunca lança: toda falha volta como
 * `{ ok: false, codigo, motivo }`, com a frase pronta para a tela.
 *
 * ⚠️ O pedido leva só o id do vínculo e o período: o código do estabelecimento
 * no extrato é lido pela rota a partir do vínculo, nunca daqui.
 *
 * ⚠️ Resposta SEM a frase da rota (o 504 da plataforma, uma página de erro no
 * caminho, o tempo esgotado): a frase sai de `falhaDaConferenciaSemCorpo`, e o
 * número do status fica só no CÓDIGO — nunca na frase que a pessoa lê.
 */
export async function conferirComExtrato(p: { vinculoId: string; de: string; ate: string }): Promise<ResultadoConferencia> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_DA_ROTA_MS);
  let r: Response;
  try {
    r = await fetch("/api/pinbank/conferencia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vinculoId: p.vinculoId, de: p.de, ate: p.ate }),
      signal: controle.signal,
    });
  } catch {
    clearTimeout(relogio);
    if (controle.signal.aborted) return { ok: false, ...falhaDaConferenciaSemCorpo(null) };
    return { ok: false, codigo: "rede", motivo: "Não foi possível falar com o servidor. Confira a conexão e tente de novo. Nada foi alterado." };
  }
  const corpo = (await r.json().catch(() => null)) as
    | { ok?: boolean; codigo?: string; motivo?: string; erro?: string; relatorio?: RelatorioParaEmpresa; consultadoEm?: string; restanteMs?: unknown }
    | null;
  clearTimeout(relogio);
  // O tempo acabou no meio do corpo: a resposta não veio inteira.
  if (corpo == null && controle.signal.aborted) return { ok: false, ...falhaDaConferenciaSemCorpo(null) };
  if (corpo?.erro === "codigo_pendente") {
    return { ok: false, codigo: "codigo_pendente", motivo: "Confirme o código do aplicativo autenticador para continuar." };
  }
  if (r.ok && corpo?.ok && corpo.relatorio && corpo.consultadoEm) {
    return { ok: true, relatorio: corpo.relatorio, consultadoEm: corpo.consultadoEm };
  }
  const semFrase = falhaDaConferenciaSemCorpo(r.status);
  return {
    ok: false,
    codigo: typeof corpo?.codigo === "string" && corpo.codigo ? corpo.codigo : semFrase.codigo,
    motivo: typeof corpo?.motivo === "string" && corpo.motivo.trim() ? corpo.motivo : semFrase.motivo,
    // O 429 diz quanto o BANCO ainda recusa; a tela o lê por `esperaDoBotao` (que o limita a 1 ms … 60 s).
    ...(typeof corpo?.restanteMs === "number" && Number.isFinite(corpo.restanteMs) ? { restanteMs: corpo.restanteMs } : {}),
  };
}
