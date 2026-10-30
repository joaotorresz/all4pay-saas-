import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOME_DO_PROVEDOR, type PedidoCobrancaBanco } from "@/core/cobranca-banco";
import { nossoNumeroValido } from "@/core/cobranca-banco/itau";
import { configItauDoAmbiente, consultarCobrancaItau, emitirCobrancaItau, testarCredencialItau } from "@/lib/cobranca-banco/itau-api";

/**
 * O TESTE DA COBRANÇA DO ITAÚ — só o administrador da plataforma. Etapa 3 de
 * `docs/rodada-11/cobranca-itau.md`.
 *
 *   GET /api/admin/itau-teste                          → o token sai? (não cria nada)
 *   GET /api/admin/itau-teste?acao=emitir&numero=      → boleto com Pix de R$ 2,50 (SÓ no sandbox)
 *   GET /api/admin/itau-teste?acao=consultar&numero=   → a situação de um título pelo nosso número
 *
 * É a prova de que a credencial das variáveis `ITAU_*` funciona DENTRO da
 * função da Vercel, e o lugar onde os NOMES dos campos do core são conferidos
 * contra o sandbox antes de qualquer cobrança de cliente. NÃO grava nada no banco.
 *
 * ⚠️ `emitir` é recusado fora do sandbox: em produção, uma cobrança de teste
 * seria um boleto de verdade em nome de alguém. O nosso número de teste é
 * digitado no link (8 dígitos): esta rota não reserva número.
 *
 * ⚠️ Muda QUEM PODE CHAMAR O QUÊ (uma chamada nova, com credencial, a um
 * banco): o merge espera o OK do dono.
 *
 * Portões, na ordem: sem banco (demonstração) a rota se recusa; o middleware
 * já barra `/api/admin/*` para quem não é administrador; aqui, sessão →
 * `admin_exigir_acesso` (prazo, segundo fator, registro) → só então o Itaú.
 */
export const runtime = "nodejs";
/** São Paulo: o sandbox do Itaú barra no CloudFront o tráfego de fora do Brasil (30/10/2026). */
export const preferredRegion = "gru1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

/** O pagador fictício do sandbox (CNPJ de teste com dígito válido). */
function pedidoDeTeste(hoje: string): PedidoCobrancaBanco {
  const venc = new Date(Date.parse(`${hoje}T12:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
  return {
    tipo: "boleto_pix",
    seuNumero: `T${Date.now().toString(36)}`.slice(0, 15),
    valor: 2.5,
    vencimento: venc,
    descricao: "Teste de integração Quattro",
    devedor: {
      nome: "Cliente Teste Quattro",
      documento: "11222333000181",
      email: null,
      telefone: null,
      cep: "01310100",
      logradouro: "Avenida Paulista",
      numero: "1000",
      complemento: null,
      bairro: "Bela Vista",
      cidade: "São Paulo",
      uf: "SP",
    },
  };
}

export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, motivo: "Indisponível sem o banco (demonstração)." });
  }
  const doChamador = createClient();
  const { data: auth } = await doChamador.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, motivo: "não autenticado" });
  const q = new URL(req.url).searchParams;
  const acao = (q.get("acao") ?? "token").trim();
  const { error: negado } = await doChamador.rpc("admin_exigir_acesso", { p_funcao: "admin_itau_teste", p_alvo: acao });
  if (negado) return resposta(403, { ok: false, motivo: negado.message });

  const cfg = configItauDoAmbiente();
  if ("faltam" in cfg) return resposta(200, { ok: false, motivo: `Falta configurar: ${cfg.faltam.join(" · ")}` });
  const base = { provedor: NOME_DO_PROVEDOR.itau, ambiente: cfg.config.ambiente, comCertificado: !!cfg.config.mtls };
  const inicio = Date.now();
  // O dia em Brasília (UTC−3), fatiado da string.
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const numero = (q.get("numero") ?? "").trim();

  if (acao === "token") {
    const r = await testarCredencialItau(cfg.config);
    return resposta(200, { ...base, ...r, ms: Date.now() - inicio });
  }
  if (acao === "emitir") {
    if (cfg.config.ambiente !== "sandbox") return resposta(400, { ...base, ok: false, motivo: "Emitir de teste só no sandbox." });
    if (!nossoNumeroValido(numero)) return resposta(400, { ...base, ok: false, motivo: "Informe numero= com 8 dígitos (o nosso número do teste)." });
    const pedido = pedidoDeTeste(hoje);
    const r = await emitirCobrancaItau(cfg.config, pedido, numero, hoje);
    return resposta(200, { ...base, ok: r.situacao === "emitida", nossoNumero: numero, vencimento: pedido.vencimento, resultado: r, ms: Date.now() - inicio });
  }
  if (acao === "consultar") {
    if (!nossoNumeroValido(numero)) return resposta(400, { ...base, ok: false, motivo: "Informe numero= com 8 dígitos." });
    const r = await consultarCobrancaItau(cfg.config, numero);
    return resposta(200, { ...base, ok: r.situacao !== "incerta", resultado: r, ms: Date.now() - inicio });
  }
  return resposta(400, { ok: false, motivo: "acao= token | emitir | consultar" });
}
