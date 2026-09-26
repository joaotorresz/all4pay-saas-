/**
 * ⚠️ **O COMMIT É INLINADO NO BUILD, e isso é o que mantém o `/api/versao`
 * honesto quando quem publica é o CI.**
 *
 * A rota lia `process.env.VERCEL_GIT_COMMIT_SHA` em tempo de EXECUÇÃO. Isso
 * funciona enquanto quem constrói é a integração Git da Vercel, que injeta a
 * variável na lambda. Publicando por `vercel build` + `vercel deploy
 * --prebuilt` a partir do CI, essa variável não chega ao runtime — e
 * `/api/versao` passaria a responder `"local"`.
 *
 * Seria o pior efeito colateral possível: `/api/versao` é a única prova direta
 * de qual commit está no ar, e é dela que a guarda `npm run no-ar` depende para
 * pegar o A4P-075 (build atrasado sobrescrevendo o novo). Trocar o publicador e
 * cegar a verificação da publicação no mesmo gesto seria trocar um defeito por
 * outro maior.
 *
 * `env` do Next é INLINADO no build: o valor vai para dentro do bundle, então
 * chega ao runtime venha de onde vier o build. `VERCEL_GIT_COMMIT_SHA` continua
 * primeiro (é o que a integração Git dá); `GITHUB_SHA` é o que o CI dá.
 */
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "";
const branch = process.env.VERCEL_GIT_COMMIT_REF ?? process.env.GITHUB_REF_NAME ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    A4P_COMMIT: commit,
    A4P_BRANCH: branch,
  },
};

export default nextConfig;
