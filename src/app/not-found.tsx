import Link from "next/link";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { MARCA } from "@/core/marca";

export const metadata = { title: `Página não encontrada · ${MARCA}` };

/**
 * A PÁGINA QUE NÃO EXISTE — agora nossa, e em português.
 *
 * ⚠️ Até aqui, um endereço errado devolvia a tela padrão do Next.js: fundo
 * branco, "404" e **"This page could not be found."** em inglês, sem marca, sem
 * caminho de volta e sem nenhuma relação visual com o resto do produto.
 *
 * Três coisas erradas ao mesmo tempo, e a terceira é a pior:
 *
 *  1. **Em inglês**, num produto inteiramente em português — a pessoa que caiu
 *     aqui não é obrigada a ler outro idioma para entender que errou o endereço.
 *  2. **Sem marca**: ela parece um erro da internet, não uma tela do sistema.
 *     Quem vê conclui que o sistema caiu, e quem conclui isso liga para o
 *     suporte ou fecha a aba.
 *  3. **Sem saída.** Uma tela de erro sem caminho de volta transforma um engano
 *     de digitação no fim da sessão. O botão para o Início é o conteúdo
 *     principal desta página, não um detalhe do rodapé.
 *
 * Ela é deliberadamente sóbria: um erro de endereço não é uma ocasião para
 * ilustração nem para piada. A pessoa quer voltar ao trabalho.
 */
export default function NaoEncontrada() {
  return (
    <MolduraPublica>
      <main className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="flex flex-col items-start gap-5 max-w-[520px]">
        <span className="text-caption tracking-[0.08em] text-faint">{MARCA}</span>

        <h1 className="m-0 text-h2 text-ink">Esta página não existe</h1>

        <p className="m-0 text-body text-muted">
          O endereço que você abriu não corresponde a nenhuma tela do sistema. Pode ser um
          link antigo, um endereço digitado com um caractere a mais, ou uma tela que mudou
          de lugar.
        </p>

        {/* Endereços antigos são desviados no servidor (308) antes de chegar aqui;
            quem chega nesta tela digitou algo que nunca existiu. Dizer isso evita
            que a pessoa fique tentando variações do mesmo endereço. */}
        <p className="m-0 text-caption text-faint">
          Os endereços antigos do sistema continuam funcionando e levam sozinhos para o
          lugar novo — então este aqui não é um deles.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center rounded-pill bg-surface-2 px-4 py-2 text-label font-medium text-ink hover:bg-surface-3 transition-colors"
          >
            Voltar ao início
          </Link>
          <Link href="/dashboard/help" className="text-label text-muted hover:text-ink transition-colors">
            Central de ajuda
          </Link>
        </div>
      </div>
      </main>
    </MolduraPublica>
  );
}
