import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOME_DO_PROVEDOR, type PedidoCobrancaBanco } from "@/core/cobranca-banco";
import {
  acharCobrancaInter,
  configInterDoAmbiente,
  consultarCobrancaInter,
  emitirCobrancaInter,
  testarCredencialInter,
} from "@/lib/cobranca-banco/inter-api";

/**
 * O TESTE DA COBRANÇA DO INTER — só o administrador da plataforma.
 *
 *   GET /api/admin/inter-teste                         → o token sai? (não cria nada)
 *   GET /api/admin/inter-teste?acao=emitir             → emite um boleto com Pix de R$ 2,50 (SÓ no sandbox)
 *   GET /api/admin/inter-teste?acao=consultar&codigo=  → a situação de uma cobrança
 *   GET /api/admin/inter-teste?acao=achar&numero=&vencimento= → acha pelo nosso número
 *
 * É a prova de que a credencial das variáveis `INTER_*` funciona DENTRO da
 * função da Vercel (o certificado mTLS chega, o token sai, a API responde)
 * antes de existir qualquer cobrança de cliente. NÃO grava nada no banco.
 *
 * ⚠️ `emitir` é recusado fora do sandbox: em produção, uma cobrança de teste
 * seria um boleto de verdade em nome de alguém.
 *
 * ⚠️ Muda QUEM PODE CHAMAR O QUÊ (uma chamada nova, com credencial, a um
 * banco): o merge espera o OK do dono.
 *
 * Portões, na ordem: sem banco (demonstração) a rota se recusa; o middleware
 * já barra `/api/admin/*` para quem não é administrador; aqui, sessão →
 * `admin_exigir_acesso` (prazo, segundo fator, registro) → só então o Inter.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O pagador fictício do sandbox (CNPJ de teste com dígito válido). */
function pedidoDeTeste(): PedidoCobrancaBanco {
  const hoje = new Date(Date.now() - 3 * 3600_000);
  const venc = new Date(hoje.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
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
  const { error: negado } = await doChamador.rpc("admin_exigir_acesso", { p_funcao: "admin_inter_teste", p_alvo: acao });
  if (negado) return resposta(403, { ok: false, motivo: negado.message });

  const cfg = configInterDoAmbiente();
  if ("faltam" in cfg) return resposta(200, { ok: false, motivo: `Faltam as variáveis: ${cfg.faltam.join(", ")}.` });
  const base = { provedor: NOME_DO_PROVEDOR.inter, ambiente: cfg.config.ambiente };
  const inicio = Date.now();

  if (acao === "token") {
    const r = await testarCredencialInter(cfg.config);
    return resposta(200, { ...base, ...r, ms: Date.now() - inicio });
  }
  if (acao === "emitir") {
    if (cfg.config.ambiente !== "sandbox") return resposta(400, { ...base, ok: false, motivo: "Emitir de teste só no sandbox." });
    const pedido = pedidoDeTeste();
    const r = await emitirCobrancaInter(cfg.config, pedido);
    return resposta(200, { ...base, ok: r.situacao === "processando" || r.situacao === "emitida", seuNumero: pedido.seuNumero, vencimento: pedido.vencimento, resultado: r, ms: Date.now() - inicio });
  }
  if (acao === "consultar") {
    const codigo = (q.get("codigo") ?? "").trim();
    if (!UUID.test(codigo)) return resposta(400, { ...base, ok: false, motivo: "Informe codigo= (o codigoSolicitacao)." });
    const r = await consultarCobrancaInter(cfg.config, codigo);
    return resposta(200, { ...base, ok: r.situacao !== "incerta", resultado: r, ms: Date.now() - inicio });
  }
  if (acao === "achar") {
    const numero = (q.get("numero") ?? "").trim();
    const vencimento = (q.get("vencimento") ?? "").trim();
    try {
      const codigo = await acharCobrancaInter(cfg.config, numero, vencimento);
      return resposta(200, { ...base, ok: !!codigo, codigo, ms: Date.now() - inicio });
    } catch (e) {
      return resposta(200, { ...base, ok: false, motivo: e instanceof Error ? e.message : "Falha na busca.", ms: Date.now() - inicio });
    }
  }
  return resposta(400, { ok: false, motivo: "acao= token | emitir | consultar | achar" });
}
