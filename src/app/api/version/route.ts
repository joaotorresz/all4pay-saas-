import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QUAL COMMIT ESTÁ NO AR.
 *
 * ⚠️ Até aqui, responder "o que está em produção?" durante um incidente exigia
 * abrir o painel do Vercel. Quem atende o cliente não tem esse acesso, e quem
 * tem está resolvendo outra coisa — então a pergunta mais básica de um
 * incidente dependia de uma pessoa específica estar disponível.
 *
 * São dez linhas e elimina a dependência. `VERCEL_GIT_COMMIT_SHA` é injetado no
 * build; fora do Vercel devolve "desconhecido", que é a resposta honesta para
 * um ambiente que não sabe de onde veio.
 *
 * Sem segredo nenhum aqui: commit, branch e data de build são informação
 * pública de qualquer jeito — o commit está no repositório e o repositório é do
 * cliente. O que NÃO entra é variável de ambiente, nome de provedor ou
 * configuração, que foi o defeito que a ONDA 14 corrigiu na tela da IA.
 */
export function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "desconhecido",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "desconhecido",
    ambiente: process.env.VERCEL_ENV ?? "local",
    demo: process.env.NEXT_PUBLIC_ALL4PAY_DEMO === "true",
  });
}
