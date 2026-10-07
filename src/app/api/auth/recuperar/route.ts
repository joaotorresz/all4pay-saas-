import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DESTINO_RECUPERACAO, motivoDaFalha, type MotivoRecuperacao } from "@/core/recuperacao";

/**
 * RETORNO DO LINK DE REDEFINIÇÃO DE SENHA — troca o código pela sessão.
 *
 *   GET /api/auth/recuperar?code=…
 *
 * O e-mail de "esqueci a senha" leva para cá (`pedirRedefinicao`, lib/entrada).
 * O Auth usa PKCE: o link traz um `code`, e a prova de que foi ESTA pessoa que
 * pediu está num cookie do navegador que pediu. A troca acontece aqui, no
 * servidor, e a sessão de recuperação volta nos cookies da resposta.
 *
 * ⚠️ **Rota, e não a tela, porque só uma rota grava cookie.** Numa página
 * (Server Component) a gravação da sessão falha calada — o cliente de
 * servidor engole o erro de propósito (`lib/supabase/server.ts`).
 *
 * ⚠️ **Sob `/api`, que já é público no middleware.** Quem abre o link ainda
 * não tem sessão; fora de `/api` o portão o mandaria ao login ANTES desta rota
 * rodar, e o código se perderia. Nenhuma rota nova foi aberta no portão.
 *
 * ⚠️ **Três destinos, todos FIXOS.** Nada daqui lê um destino da URL: um
 * `?next=` seria um redirecionamento aberto — um link do nosso domínio que
 * entrega a pessoa, já com sessão, num endereço de terceiro. Na falha, o que
 * viaja é uma palavra da lista (`MotivoRecuperacao`), nunca o texto do erro.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  /*
   * ⚠️ **Destino RELATIVO, não `new URL(caminho, url.origin)`.** Medido com
   * `next start`: chamada em 127.0.0.1 saía redirecionada para localhost — a
   * origem vem de como o servidor se apresenta, não do domínio que a pessoa
   * abriu. Trocar de domínio no meio do caminho deixa para trás o cookie da
   * sessão que esta rota acabou de gravar. Um `Location` relativo fica sempre
   * no domínio do link, e não depende de cabeçalho de host nenhum.
   */
  const para = (caminho: string) => new NextResponse(null, { status: 303, headers: { location: caminho } });
  const falhou = (motivo: MotivoRecuperacao) => para(`/login?recuperacao=${motivo}`);

  // Sem Supabase (demonstração) não há conta a recuperar.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return para("/login");

  const code = url.searchParams.get("code");
  // Link vencido no próprio Auth: ele devolve o erro na URL em vez do código.
  if (!code) {
    return falhou(motivoDaFalha({
      codigo: url.searchParams.get("error_code"),
      mensagem: url.searchParams.get("error_description"),
    }));
  }

  try {
    const { data, error } = await createClient().auth.exchangeCodeForSession(code);
    if (error) {
      const motivo = motivoDaFalha({ codigo: error.code, mensagem: error.message, status: error.status, nome: error.name });
      // "expirado" e "outro-navegador" são o caminho esperado de quem demorou
      // ou trocou de aparelho; o resto é o que alguém precisa ver no log.
      if (motivo === "invalido" || motivo === "falha") {
        console.error("[falha·acesso] acesso.recuperar_senha:", error.name, error.code ?? "-", error.status ?? "-", error.message);
      }
      return falhou(motivo);
    }
    // ⚠️ O tipo publicado não declara `redirectType`, mas a biblioteca o
    // devolve (auth-js, `_exchangeCodeForSession`): "recovery" quando o código
    // nasceu de um pedido de redefinição. É ele — e não um parâmetro da URL —
    // que decide se a tela de senha nova abre.
    const tipo = (data as { redirectType?: string | null }).redirectType;
    return para(tipo === "recovery" ? DESTINO_RECUPERACAO : "/");
  } catch (e) {
    console.error("[falha·acesso] acesso.recuperar_senha:", e instanceof Error ? e.message : String(e));
    return falhou("falha");
  }
}
