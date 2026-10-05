import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lerEnvelope,
  planejarEvento,
  transacaoDoEvento,
  type EstadoTransacao,
  type TituloExistente,
  type VinculoPinbank,
} from "@/core/pinbank";
import { documentoDaVenda, itensDoDocumento, vendaDaPinbank } from "@/core/vendas/documento";

/**
 * O processamento de UM evento da maquininha — SERVER-ONLY (chave de serviço).
 *
 *   contexto (banco) → transação (envelope guardado) → plano (puro) → aplicar (banco)
 *
 * É o mesmo caminho para o webhook e para o reprocessamento: o envelope é lido
 * do que FOI GUARDADO, nunca do que a requisição trouxe, então reprocessar dá o
 * mesmo resultado que processar na hora.
 *
 * ⚠️ Nada aqui decide regra de dinheiro: quem decide é `core/pinbank/plano`, e
 * quem grava, numa transação só, é `pinbank_aplicar`. Esta função liga os dois
 * e traduz a venda para o documento (`core/vendas/documento`), o mesmo tradutor
 * da tela — senão a venda da maquininha e a da tela divergiriam no primeiro
 * campo novo.
 */

export type ResultadoProcessamento =
  | { situacao: "processado"; acao: string; detalhe?: string }
  | { situacao: "sem_vinculo" | "aguardando_ativacao" | "bloqueado" | "ignorado" | "erro"; motivo: string }
  | { situacao: "transitorio"; motivo: string };

interface Contexto {
  envelope: unknown;
  vinculo: (VinculoPinbank & { contaId: string | null }) | null;
  pode_escrever?: boolean;
  estado: (Omit<EstadoTransacao, "valor" | "valorOriginal"> & { valor: number | string; valorOriginal: number | string }) | null;
  titulos: (Omit<TituloExistente, "amount"> & { amount: number | string })[];
}

/** A data de hoje em São Paulo — o "hoje" do vencimento do estorno. */
export function hojeSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

async function marcar(admin: SupabaseClient, eventId: string, situacao: string, motivo: string) {
  const { error } = await admin.rpc("pinbank_marcar_evento", { p_event_id: eventId, p_situacao: situacao, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

export async function processarEvento(admin: SupabaseClient, eventId: string, tentativa = 1): Promise<ResultadoProcessamento> {
  const { data, error } = await admin.rpc("pinbank_contexto", { p_event_id: eventId });
  if (error) return { situacao: "transitorio", motivo: error.message };
  const ctx = data as Contexto;

  const env = lerEnvelope(ctx.envelope);
  if (!env.ok) {
    await marcar(admin, eventId, "erro", env.motivo);
    return { situacao: "erro", motivo: env.motivo };
  }
  const tr = transacaoDoEvento(env.valor);
  if (!tr.ok) {
    await marcar(admin, eventId, "ignorado", tr.motivo);
    return { situacao: "ignorado", motivo: tr.motivo };
  }

  const estado: EstadoTransacao | null = ctx.estado
    ? { ...ctx.estado, valor: Number(ctx.estado.valor), valorOriginal: Number(ctx.estado.valorOriginal) }
    : null;
  const plano = planejarEvento({
    transacao: tr.valor,
    estado,
    vinculo: ctx.vinculo,
    titulos: (ctx.titulos ?? []).map((t) => ({ ...t, amount: Number(t.amount) })),
    hoje: hojeSaoPaulo(),
  });

  if (plano.acao === "sem_vinculo" || plano.acao === "aguardando_ativacao" || plano.acao === "erro") {
    const situacao = plano.acao;
    await marcar(admin, eventId, situacao, plano.motivo);
    return { situacao, motivo: plano.motivo };
  }
  if ((plano.acao === "criar_venda" || plano.acao === "desfazer_venda") && ctx.pode_escrever === false) {
    const motivo = "Assinatura da empresa vencida: o evento fica guardado e entra no reprocessamento depois de regularizar.";
    await marcar(admin, eventId, "bloqueado", motivo);
    return { situacao: "bloqueado", motivo };
  }

  let carga: Record<string, unknown> = { ...plano };
  if (plano.acao === "criar_venda") {
    // O número da venda é decidido pelo BANCO (máximo + 1 sob trava); o
    // documento vai sem ele.
    const venda = vendaDaPinbank(plano.venda, randomUUID(), "", ctx.vinculo?.contaId ?? "");
    const { numero: _n, ...documento } = documentoDaVenda(venda);
    carga = { ...plano, documento, itens: itensDoDocumento(venda) };
  }

  const { data: r, error: e2 } = await admin.rpc("pinbank_aplicar", {
    p_event_id: eventId,
    p_versao: estado?.versao ?? 0,
    p_plano: carga,
  });
  if (e2) {
    // A versão mudou entre a leitura e a escrita: outro evento da MESMA venda
    // chegou junto. Relê e planeja de novo, uma vez; depois devolve como
    // transitório para a Pinbank reentregar.
    if (/A4P-PINBANK-VERSAO/.test(e2.message)) {
      return tentativa < 2
        ? processarEvento(admin, eventId, tentativa + 1)
        : { situacao: "transitorio", motivo: e2.message };
    }
    const situacao = /A4P-PINBANK-BLOQUEIO/.test(e2.message) ? "bloqueado" : "erro";
    await marcar(admin, eventId, situacao, e2.message);
    return { situacao, motivo: e2.message };
  }
  const res = r as { acao?: string; titulos?: number; cancelados?: number } | null;
  return {
    situacao: "processado",
    acao: plano.acao,
    detalhe: res ? `${res.titulos ?? 0} título(s) · ${res.cancelados ?? 0} cancelado(s)` : undefined,
  };
}
