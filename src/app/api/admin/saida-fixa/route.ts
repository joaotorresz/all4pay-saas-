import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lerProxies, provarSaidas } from "@/lib/pinbank/saida";

/**
 * A PROVA DOS DOIS IPs FIXOS — por onde as chamadas à Pinbank saem DE VERDADE.
 *
 *   GET /api/admin/saida-fixa   (só o administrador da plataforma)
 *
 * Roda DENTRO da função da Vercel, com as variáveis de PRODUÇÃO
 * (`PINBANK_SAIDA_1/2`): para cada servidor da saída fixa, abre o túnel e
 * pergunta ao eco de IP da AWS de onde a chamada veio. É a única medida que
 * responde "a Pinbank vai ver os IPs que liberou?" — o `quattro-saida-url` do
 * servidor mede o servidor; esta mede o CAMINHO inteiro, função → servidor →
 * internet, com a credencial que a função de fato usa.
 *
 * Cada servidor é provado SOZINHO (sem troca): um servidor fora do ar aparece
 * como fora, não é encoberto pelo outro. E o IP medido é comparado ao endereço
 * da própria variável — no Lightsail o IP fixo é o mesmo na entrada e na saída;
 * se divergir, a Pinbank veria um IP que não liberou.
 *
 * ⚠️ Muda QUEM PODE CHAMAR O QUÊ (uma rota nova, só de administrador): o merge
 * espera o OK do dono. A credencial do proxy NUNCA sai daqui — só "IP:porta".
 *
 * Portões, na ordem: o middleware já barra `/api/admin/*` para quem não é
 * administrador da plataforma; aqui, sessão → `admin_exigir_acesso` (prazo,
 * segundo fator, registro) → só então a rede. Sem banco (demonstração) não há
 * administrador a conferir e a rota se recusa — senão viraria um testador de
 * proxy aberto.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, motivo: "Indisponível sem o banco (demonstração)." });
  }
  const doChamador = createClient();
  const { data: auth } = await doChamador.auth.getUser();
  if (!auth?.user) return resposta(401, { ok: false, motivo: "não autenticado" });
  const { error: negado } = await doChamador.rpc("admin_exigir_acesso", { p_funcao: "admin_saida_fixa", p_alvo: null });
  if (negado) return resposta(403, { ok: false, motivo: negado.message });

  let proxies;
  try {
    proxies = lerProxies();
  } catch (e) {
    // A mensagem nomeia a VARIÁVEL e o defeito, nunca o valor (que tem a senha).
    return resposta(200, { ok: false, modo: "configuracao_invalida", motivo: (e as Error).message });
  }
  if (proxies.length === 0) {
    return resposta(200, {
      ok: false,
      modo: "direto",
      motivo: "Nenhuma PINBANK_SAIDA_<n> configurada: as chamadas à Pinbank saem direto da Vercel, por IP que muda.",
    });
  }

  const medidas = await provarSaidas(proxies);
  const saidas = medidas.map((m, i) => ({ ...m, ipConfereComOEndereco: !!m.ip && m.ip === proxies[i].host }));
  const ips = new Set(saidas.map((s) => s.ip).filter(Boolean));
  const ok = saidas.length === 2 && saidas.every((s) => s.ip && s.ipConfereComOEndereco) && ips.size === 2;
  return resposta(200, {
    ok,
    modo: "saida_fixa",
    regiaoDaFuncao: process.env.VERCEL_REGION ?? null,
    saidas,
    ...(ok ? {} : { motivo: saidas.length !== 2 ? "São dois servidores; há " + saidas.length + " configurado(s)." : "Algum servidor não respondeu, saiu por outro IP ou repete o IP do outro." }),
  });
}
