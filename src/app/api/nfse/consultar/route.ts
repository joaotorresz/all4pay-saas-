import { NextResponse } from "next/server";
import { baseFocus, consultarNaFocus, focusConfigurada } from "@/lib/focusnfe";
import { abrirSessao, lerNota, registrar, resposta, UUID } from "@/lib/nfse-servidor";
import { interpretarConsulta } from "@/core/nfse/focus";

/**
 * O DESFECHO DA NFS-e na prefeitura.
 *
 *   GET /api/nfse/consultar?id=<nota>
 *
 * Só consulta nota PROCESSANDO com referência; as outras devolvem o estado que
 * já têm. ⚠️ A gravação do desfecho é CONDICIONAL (`status = processando`):
 * duas abas consultando ao mesmo tempo, só uma "vence" e recebe `mudou: true`
 * — é ela que lança a receita no DRE, uma vez só.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const sessao = await abrirSessao();
  if (sessao instanceof NextResponse) return sessao;
  const { s, userId } = sessao;

  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID.test(id)) return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: "Nota não informada." });

  const nota = await lerNota(s, id);
  if (nota === "falhou") return resposta(500, { ok: false, codigo: "leitura_falhou", motivo: "Não foi possível ler a nota." });
  if (!nota) return resposta(404, { ok: false, codigo: "nota_nao_encontrada", motivo: "Esta nota não é da empresa aberta." });
  if (nota.status !== "processando" || !nota.provedor_ref) {
    return resposta(200, { ok: true, estado: nota.status, mudou: false });
  }
  if (!focusConfigurada()) {
    return resposta(503, { ok: false, codigo: "nao_configurada", motivo: "A emissão de notas está desligada. Fale com o suporte." });
  }

  const r = await consultarNaFocus(nota.provedor_ref);
  registrar("consultar", userId, nota.id, nota.provedor_ref, r.http);
  if (r.http === 0 || r.http >= 500) return resposta(200, { ok: true, estado: "processando", mudou: false });

  const d = r.http === 404
    ? { estado: "rejeitada" as const, motivo: "A nota não chegou ao provedor. Transmita de novo." }
    : interpretarConsulta(r.corpo, baseFocus());
  if (d.estado === "processando") return resposta(200, { ok: true, estado: "processando", mudou: false });

  const { data: gravada, error } = await s.from("nfse").update({
    status: d.estado,
    ...("numero" in d && d.numero ? { numero: d.numero } : {}),
    ...("codigoVerificacao" in d && d.codigoVerificacao ? { codigo_verificacao: d.codigoVerificacao } : {}),
    ...("urlPdf" in d && d.urlPdf ? { url_pdf: d.urlPdf } : {}),
    ...("urlXml" in d && d.urlXml ? { url_xml: d.urlXml } : {}),
    ...("urlNota" in d && d.urlNota ? { url_nota: d.urlNota } : {}),
    motivo_rejeicao: "motivo" in d && d.motivo ? d.motivo : null,
  }).eq("id", nota.id).eq("status", "processando").select("id").maybeSingle();
  if (error) return resposta(500, { ok: false, codigo: "gravacao_falhou", motivo: "A prefeitura respondeu, mas o resultado não foi gravado. Atualize de novo." });

  return resposta(200, { ok: true, mudou: !!gravada, ...d });
}
