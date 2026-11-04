/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * A fonte e o logo dos e-mails são carregados de fora do app: pelo leitor de
   * e-mail e pela prévia na tela (iframe isolado, origem "null"). Fonte de
   * outra origem só carrega com CORS, então estes arquivos públicos levam o
   * cabeçalho. Sem ele, a Agrandir cai na Inter e a prévia acusa erro.
   */
  async headers() {
    const cors = [{ key: "Access-Control-Allow-Origin", value: "*" }];
    return [
      { source: "/fonts/:arquivo*", headers: cors },
      { source: "/email/:arquivo*", headers: cors },
    ];
  },
};

export default nextConfig;
