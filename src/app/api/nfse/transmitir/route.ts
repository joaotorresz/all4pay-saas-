import { NextResponse } from "next/server";
import { emitenteDaOrg, emitirNaFocus, focusConfigurada, ambienteFocus } from "@/lib/focusnfe";
import { abrirSessao, lerId, lerNota, podeLancar, registrar, resposta, UUID } from "@/lib/nfse-servidor";
import { montarPedido, montarPedidoNacional, motivoDaRecusa, proximaTentativa, refDaTentativa } from "@/core/nfse/focus";

/**
 * TRANSMITIR A NFS-e À PREFEITURA, pela Focus NFe.
 *
 *   POST /api/nfse/transmitir   { id }
 *
 * Portões, na ordem: demonstração → sessão → pedido → a nota é da empresa
 * aberta (lida COMO A PESSOA) → a pessoa pode lançar nessa empresa → a
 * emissão está configurada → a PLATAFORMA vinculou um emitente a esta empresa
 * → a nota está pronta (rascunho ou recusada) → o pedido está completo → a
 * nota é MARCADA processando antes de sair (condicional: dois cliques não
 * transmitem duas vezes) → só então a Focus.
 *
 * ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ.** Alguém da EMPRESA dispara uma chamada com
 * a credencial da PLATAFORMA. O CNPJ, a inscrição e o município do prestador
 * saem do vínculo da plataforma, nunca do pedido nem do cadastro da empresa.
 *
 * ⚠️ O `201` da Focus é "recebi", não "autorizei": a resposta é `processando`,
 * e quem diz o desfecho é `GET /api/nfse/consultar`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const sessao = await abrirSessao();
  if (sessao instanceof NextResponse) return sessao;
  const { s, userId } = sessao;

  const { id } = await lerId(req);
  if (!UUID.test(id)) return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Nota não informada." });

  const nota = await lerNota(s, id);
  if (nota === "falhou") return resposta(500, { ok: false, codigo: "leitura_falhou", motivo: "Não foi possível ler a nota. Nada foi enviado." });
  if (!nota) return resposta(404, { ok: false, codigo: "nota_nao_encontrada", motivo: "Esta nota não é da empresa aberta." });
  if (!(await podeLancar(s, nota.org_id))) {
    return resposta(403, { ok: false, codigo: "sem_permissao", motivo: "Seu papel nesta empresa não permite emitir notas." });
  }
  if (!focusConfigurada()) {
    return resposta(503, { ok: false, codigo: "nao_configurada", motivo: "A emissão de notas ainda não foi ligada na Quattro. Fale com o suporte." });
  }
  const emitente = emitenteDaOrg(nota.org_id);
  if (!emitente) {
    return resposta(409, { ok: false, codigo: "sem_emitente", motivo: "Esta empresa ainda não está habilitada a emitir notas (cadastro fiscal e certificado). Fale com o suporte da Quattro." });
  }
  if (nota.status !== "rascunho" && nota.status !== "rejeitada") {
    return resposta(409, { ok: false, codigo: "estado_invalido", motivo: nota.status === "processando" ? "A nota já está na prefeitura. Atualize para ver o resultado." : "Só rascunho ou nota recusada pode ser transmitida." });
  }
  if (!nota.tomador) return resposta(422, { ok: false, codigo: "pedido_incompleto", motivo: "A nota não tem cliente (tomador)." });

  const dadosNota = { id: nota.id, descricao: nota.description ?? "", codigoServico: nota.service_code ?? "", valor: nota.amount, issRetido: nota.iss_retained === true };
  const nacional = emitente.padrao === "nacional";
  const agora = new Date();
  // Competência na data de São Paulo (UTC−3): às 22h o UTC já é amanhã.
  const competencia = new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const montado = nacional
    ? montarPedidoNacional(dadosNota, nota.tomador, emitente, agora.toISOString(), competencia, agora.getTime())
    : montarPedido(dadosNota, nota.tomador, emitente, agora.toISOString());
  if (!montado.ok) return resposta(422, { ok: false, codigo: "pedido_incompleto", motivo: montado.problemas.join(" ") });

  const ref = refDaTentativa(nota.id, proximaTentativa(nota.provedor_ref), nacional);
  const ambiente = ambienteFocus();
  // ⚠️ Marca ANTES de enviar, e só se a nota ainda estiver como foi lida: dois
  // cliques (ou duas abas) não viram duas notas na prefeitura.
  const { data: marcada, error: eM } = await s.from("nfse")
    .update({ status: "processando", provedor_ref: ref, ambiente, motivo_rejeicao: null })
    .eq("id", nota.id).eq("status", nota.status).select("id").maybeSingle();
  if (eM) return resposta(500, { ok: false, codigo: "gravacao_falhou", motivo: "Não foi possível preparar a nota. Nada foi enviado." });
  if (!marcada) return resposta(409, { ok: false, codigo: "concorrencia", motivo: "A nota mudou enquanto era enviada. Recarregue a lista." });

  const r = await emitirNaFocus(ref, montado.pedido);
  registrar("emitir", userId, nota.id, ref, r.http);

  // 0 = rede caiu no envio: o pedido pode ter chegado. Fica processando e a
  // consulta pela MESMA referência resolve (404 lá = não chegou).
  if (r.http === 0 || (r.http >= 200 && r.http < 300) || r.http >= 500) {
    return resposta(202, { ok: true, estado: "processando", ambiente });
  }
  const motivo = motivoDaRecusa(r.corpo, r.http);
  await s.from("nfse").update({ status: "rejeitada", motivo_rejeicao: motivo }).eq("id", nota.id).eq("status", "processando");
  return resposta(422, { ok: false, codigo: "recusada", estado: "rejeitada", motivo });
}
