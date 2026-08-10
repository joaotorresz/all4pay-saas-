import { NextResponse } from "next/server";

/**
 * QUAL COMMIT ESTÁ NO AR — em uma requisição.
 *
 * ⚠️ Isto existe porque conferir uma publicação virou adivinhação. O método
 * anterior era comparar o hash do CSS construído localmente com o que a
 * produção serve: funciona enquanto a mudança MEXE no CSS, e falha calado
 * quando não mexe — uma mudança só de texto ou de ícone produz o mesmo hash, e
 * "igual" passa a significar as duas coisas opostas ("não publicou" e
 * "publicou, sem tocar no CSS").
 *
 * A tentativa seguinte, comparar o nome do chunk de JavaScript, é PIOR: o nome
 * depende de detalhes do build, e o mesmo commit gera nomes diferentes aqui e
 * na Vercel. Foi medido — produção servia o arquivo certo com outro nome, e a
 * conferência disse que o deploy não tinha saído.
 *
 * O commit é a única resposta que não depende do que a mudança tocou.
 *
 * Só metadados de build, e de propósito: nada de variável de ambiente, chave
 * ou configuração. Uma rota pública que ecoa ambiente é como um segredo vaza.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
      ambiente: process.env.VERCEL_ENV ?? "local",
    },
    // Sem cache: uma resposta guardada na borda responderia pelo build
    // ANTERIOR, que é exatamente a pergunta que esta rota existe para fechar.
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
