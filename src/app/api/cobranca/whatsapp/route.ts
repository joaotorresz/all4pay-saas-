import { NextResponse } from "next/server";
import { dispararCobrancas, statusNotificacoes, type AlvoCobranca } from "@/core/financial-os/notifications.server";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { soDigitosFone } from "@/lib/telefone";

/**
 * Disparo de cobrança por cliente via WhatsApp (server-side; chaves Twilio
 * ficam no servidor). Recebe os alvos já montados pelo app (cliente +
 * telefone + mensagem) — a segmentação/decisão é do Quattro, a Twilio só entrega.
 *
 * ⚠️ ESTA ROTA ESTAVA ABERTA PARA A INTERNET (achado de 30/09/2026). O
 * middleware deixa `/api` público, e ela aceitava POST sem sessão nenhuma: com
 * a Twilio ativa em produção, qualquer pessoa fazia o número da plataforma
 * mandar texto arbitrário para até 200 telefones por chamada.
 *
 * Agora ela exige, na ordem:
 *   1. SESSÃO — quem chama está logado;
 *   2. PERMISSÃO — o papel dele na empresa ativa lança ou dá baixa (leitor e
 *      contador externo não cobram cliente);
 *   3. DESTINO CONHECIDO — cada telefone tem de ser de um contato cadastrado
 *      na empresa de quem chama (a leitura passa pela RLS da sessão). É esta
 *      a trava que impede usar o número da empresa como megafone: mesmo um
 *      usuário legítimo não manda mensagem para um telefone que não é de
 *      cliente seu.
 * Em demonstração não há banco nem sessão: a rota responde SIMULADO, sem
 * chamar a Twilio — uma instância de demonstração com chave configurada não
 * pode virar porta de envio.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TETO_POR_CHAMADA = 50;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const lista: unknown[] = Array.isArray(body?.alvos) ? body.alvos : [];
  const candidatos: AlvoCobranca[] = lista
    .slice(0, TETO_POR_CHAMADA)
    .filter((a): a is { cliente?: string; telefone?: string; mensagem?: string; variaveis?: Record<string, string> } => !!a && typeof a === "object")
    .filter((a) => typeof a.telefone === "string" && a.telefone.trim().length > 0 && typeof a.mensagem === "string")
    .map((a) => ({
      cliente: String(a.cliente ?? "Cliente"),
      telefone: a.telefone!.trim(),
      mensagem: String(a.mensagem).slice(0, 400),
      variaveis:
        a.variaveis && typeof a.variaveis === "object"
          ? Object.fromEntries(Object.entries(a.variaveis).slice(0, 10).map(([k, v]) => [String(k), String(v).slice(0, 200)]))
          : undefined,
    }));

  if (isDemo) {
    return NextResponse.json({
      ok: true,
      provedores: { ...statusNotificacoes(), whatsapp: false },
      total: candidatos.length,
      sucesso: 0,
      simulado: true,
      enviados: candidatos.map((a) => ({ alvo: a, resultado: { ok: false, simulado: true } })),
    });
  }

  // 1) sessão
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, motivo: "Entre na sua conta para enviar cobranças." }, { status: 401 });

  // 2) permissão na empresa ativa
  const [{ data: podeLancar }, { data: podeBaixar }] = await Promise.all([
    supabase.rpc("tem_permissao", { p_acao: "lancar" }),
    supabase.rpc("tem_permissao", { p_acao: "baixar" }),
  ]);
  if (!podeLancar && !podeBaixar) {
    return NextResponse.json({ ok: false, motivo: "Seu papel nesta empresa não envia cobranças a clientes." }, { status: 403 });
  }

  // 3) só telefones de contatos da própria empresa (a RLS recorta pela sessão)
  const { data: partes, error } = await supabase.from("parties").select("phone").not("phone", "is", null).limit(5000);
  if (error) return NextResponse.json({ ok: false, motivo: error.message }, { status: 500 });
  const conhecidos = new Set(((partes ?? []) as { phone: string | null }[]).map((p) => soDigitosFone(p.phone ?? "")).filter(Boolean));
  const alvos = candidatos.filter((a) => conhecidos.has(soDigitosFone(a.telefone)));
  const recusados = candidatos.length - alvos.length;

  const enviados = await dispararCobrancas(alvos);
  return NextResponse.json({
    ok: true,
    provedores: statusNotificacoes(),
    total: enviados.length,
    sucesso: enviados.filter((e) => e.resultado.ok).length,
    recusados,
    enviados,
  });
}
