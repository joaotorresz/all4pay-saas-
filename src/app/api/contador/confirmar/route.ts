import { createAdmin } from "@/lib/supabase/admin";
import { PRAZO_LINK_DIAS } from "@/core/contabilidade/optin";

/**
 * O LINK QUE O CONTADOR CLICA (double opt-in, Fase 3.4).
 *
 *   GET /api/contador/confirmar?t=<token>
 *
 * É o ÚNICO escritor de `contador_confirmacoes.confirmado_em`. O contador não
 * tem conta no Quattro, por isso a rota responde com uma página simples, sem
 * sessão, e fica sob `/api` (já pública no middleware: nenhuma rota nova foi
 * aberta no portão). O token vale PRAZO_LINK_DIAS dias e só confirma uma vez.
 * Nada da URL é ecoado na página.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pagina(status: number, titulo: string, texto: string): Response {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quattro</title>
<style>body{margin:0;background:#F5F5F5;color:#3B4332;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:520px;margin:12vh auto;padding:32px;background:#FFFFFF;border-radius:24px}h1{font-size:24px;margin:0 0 12px}p{font-size:15px;line-height:1.5;color:#5F5E4E;margin:0}</style></head>
<body><main><h1>${esc(titulo)}</h1><p>${esc(texto)}</p></main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!UUID.test(t)) return pagina(400, "Link inválido", "Este link de confirmação está incompleto. Abra de novo o e-mail que você recebeu.");
  const admin = createAdmin();
  if (!admin) return pagina(503, "Indisponível", "A confirmação está fora do ar agora. Tente de novo em alguns minutos.");

  const { data: linha } = await admin.from("contador_confirmacoes")
    .select("org_id, pedido_em, confirmado_em").eq("token", t).maybeSingle();
  if (!linha) return pagina(404, "Link vencido", "Este link não vale mais. Peça à empresa que envie a confirmação de novo.");
  if (linha.confirmado_em) return pagina(200, "E-mail já confirmado", "Este e-mail já estava confirmado. Nada mais a fazer.");
  if (Date.now() - new Date(linha.pedido_em).getTime() > PRAZO_LINK_DIAS * 86_400_000) {
    return pagina(410, "Link vencido", `O link vale ${PRAZO_LINK_DIAS} dias. Peça à empresa que envie a confirmação de novo.`);
  }
  const { error } = await admin.from("contador_confirmacoes")
    .update({ confirmado_em: new Date().toISOString() }).eq("token", t).is("confirmado_em", null);
  if (error) return pagina(500, "Não foi possível confirmar", "Tente abrir o link de novo em alguns minutos.");
  const { data: org } = await admin.from("organizations").select("name").eq("id", linha.org_id).maybeSingle();
  const empresa = String(org?.name ?? "").trim() || "a empresa";
  return pagina(200, "E-mail confirmado", `Pronto. Este e-mail foi confirmado como destinatário das notas fiscais de ${empresa}.`);
}
