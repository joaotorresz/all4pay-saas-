import { NextResponse } from "next/server";
import { MODELO_CLAUDE, SAIDA_CLAUDE } from "@/lib/ia/claude";
import { normalizarPaginaIA } from "@/core/fdip/extrato-ia";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";

/**
 * Extrato ou fatura de cartão ESCANEADO — uma PÁGINA por chamada (SERVER-ONLY).
 *
 * O navegador transforma cada página do PDF em imagem e manda uma de cada
 * vez: um extrato de 12 páginas inteiro numa resposta só não cabe na saída do
 * modelo, e a resposta cortada no meio perderia o fim do mês em silêncio.
 *
 * O modelo só TRANSCREVE (data, descrição, valor com sinal, MCC). Classificar
 * é do FDIP. E a resposta passa por `normalizarPaginaIA` aqui no servidor, antes
 * de voltar: o que não é data, valor ou descrição não chega à tela.
 *
 * Gated por ANTHROPIC_API_KEY; sem ela, `ok:false` e o arquivo segue o caminho
 * que já existia (OCR local de documento).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ~6 MB de base64: uma página a 1600px em JPEG fica muito abaixo disso. */
const TETO_BYTES = 6_000_000;

const PROMPT = `Você transcreve extratos bancários e faturas de cartão de crédito brasileiros.
Esta imagem é UMA página de um arquivo{CONTEXTO}.

Responda APENAS com JSON válido, sem markdown:
{"tipo":"extrato"|"fatura"|"documento","linhas":[["AAAA-MM-DD","descrição",valor,"mcc"|null]]}

Regras:
- "documento" quando a página NÃO é uma lista de lançamentos (boleto, nota fiscal, comprovante, capa, termos). Nesse caso "linhas": [].
- Uma linha por lançamento, na ordem da página. Não pule nenhum.
- valor: número em reais com sinal. Negativo = saiu dinheiro (débito, pagamento, compra no cartão, tarifa). Positivo = entrou (crédito, depósito, estorno, pagamento da fatura recebido).
- Em fatura de cartão, toda compra é negativa.
- Quando a data não traz o ano, deduza pelo período, fechamento ou vencimento impressos no documento.
- descrição: o texto do lançamento como está impresso, incluindo nome do estabelecimento e parcela ("2/6").
- mcc: só se o código de 4 dígitos do estabelecimento estiver impresso; senão null.
- NÃO inclua linhas de saldo (saldo anterior, saldo do dia, saldo final), totais, subtotais nem limites.
- Não invente: o que não está legível fica de fora.`;

interface Req { imagemBase64?: string; pagina?: number; total?: number }

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODELO_CLAUDE });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY no servidor" });

  // Cada página é uma chamada paga ao modelo: fora da demonstração, só com sessão.
  if (!isDemo) {
    const { data: auth } = await createClient().auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, reason: "sem_sessao" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Req;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body.imagemBase64 || "");
  if (!m) return NextResponse.json({ ok: false, reason: "imagem ausente ou em formato não aceito" }, { status: 400 });
  if (m[2].length > TETO_BYTES) return NextResponse.json({ ok: false, reason: "página grande demais" }, { status: 413 });

  const pagina = Number.isInteger(body.pagina) && body.pagina! > 0 ? body.pagina! : 1;
  const total = Number.isInteger(body.total) && body.total! >= pagina ? body.total! : pagina;
  const contexto = total > 1 ? ` de ${total} páginas (esta é a página ${pagina})` : "";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO_CLAUDE,
        ...SAIDA_CLAUDE,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
            { type: "text", text: PROMPT.replace("{CONTEXTO}", contexto) },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, reason: `falha Anthropic ${res.status}`, detalhe: t.slice(0, 200) });
    }
    const j = await res.json();
    const texto: string = (j.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text).join("\n");
    const limpo = texto.replace(/```json|```/g, "").trim();
    let cru: unknown = null;
    try { cru = JSON.parse(limpo); }
    catch {
      const achado = limpo.match(/\{[\s\S]*\}/);
      try { cru = achado ? JSON.parse(achado[0]) : null; } catch { cru = null; }
    }
    // ⚠️ Resposta cortada (teto de saída) não é página vazia: é página que
    // precisa ser conferida. Volta como falha nomeada, nunca como zero linhas.
    if (j.stop_reason === "max_tokens") return NextResponse.json({ ok: false, reason: "página longa demais para uma leitura" });
    if (!cru) return NextResponse.json({ ok: false, reason: "resposta não estruturada" });
    return NextResponse.json({ ok: true, pagina: normalizarPaginaIA(cru) });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : "erro de rede" });
  }
}
