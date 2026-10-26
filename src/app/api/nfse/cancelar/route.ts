import { NextResponse } from "next/server";
import { cancelarNaFocus, focusConfigurada } from "@/lib/focusnfe";
import { abrirSessao, lerId, lerNota, podeLancar, registrar, resposta, UUID } from "@/lib/nfse-servidor";
import { justificativaValida, motivoDosErros } from "@/core/nfse/focus";

/**
 * CANCELAR A NFS-e NA PREFEITURA, pela Focus NFe.
 *
 *   POST /api/nfse/cancelar   { id, justificativa }
 *
 * ⚠️ A prefeitura cancela PRIMEIRO; só depois o sistema tira a receita (o
 * cliente chama o cancelamento local quando esta rota diz `ok`). Ao contrário,
 * a receita sumiria do DRE com a nota ainda valendo na prefeitura.
 *
 * Nota SEM referência no provedor (emitida antes da emissão real, na
 * simulação) não existe na prefeitura: a rota responde `semProvedor` e o
 * cancelamento é só no sistema.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const sessao = await abrirSessao();
  if (sessao instanceof NextResponse) return sessao;
  const { s, userId } = sessao;

  const { id, justificativa } = await lerId(req);
  if (!UUID.test(id)) return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Nota não informada." });

  const nota = await lerNota(s, id);
  if (nota === "falhou") return resposta(500, { ok: false, codigo: "leitura_falhou", motivo: "Não foi possível ler a nota. Nada foi cancelado." });
  if (!nota) return resposta(404, { ok: false, codigo: "nota_nao_encontrada", motivo: "Esta nota não é da empresa aberta." });
  if (!(await podeLancar(s, nota.org_id))) {
    return resposta(403, { ok: false, codigo: "sem_permissao", motivo: "Seu papel nesta empresa não permite cancelar notas." });
  }
  if (nota.status === "cancelada") return resposta(200, { ok: true, estado: "cancelada" });
  if (!nota.provedor_ref || nota.status !== "autorizada") {
    // Rascunho, recusada ou nota da simulação: nada a cancelar na prefeitura.
    if (nota.status === "processando") return resposta(409, { ok: false, codigo: "estado_invalido", motivo: "A nota ainda está na prefeitura. Espere o resultado antes de cancelar." });
    return resposta(200, { ok: true, semProvedor: true });
  }
  const problema = justificativaValida(justificativa);
  if (problema) return resposta(400, { ok: false, codigo: "justificativa_invalida", motivo: problema });
  if (!focusConfigurada()) {
    return resposta(503, { ok: false, codigo: "nao_configurada", motivo: "A emissão de notas está desligada. Fale com o suporte." });
  }

  const r = await cancelarNaFocus(nota.provedor_ref, justificativa.trim());
  registrar("cancelar", userId, nota.id, nota.provedor_ref, r.http);
  const corpo = (r.corpo && typeof r.corpo === "object" ? r.corpo : {}) as Record<string, unknown>;
  if (r.http === 200 && corpo.status === "cancelado") return resposta(200, { ok: true, estado: "cancelada" });
  const motivo = motivoDosErros(corpo.erros) ?? (typeof corpo.mensagem === "string" ? corpo.mensagem : null) ?? `O provedor não cancelou a nota (código ${r.http}).`;
  return resposta(422, { ok: false, codigo: "cancelamento_recusado", motivo: `A prefeitura não cancelou: ${motivo}` });
}
