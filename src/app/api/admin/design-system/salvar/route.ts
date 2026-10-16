import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import {
  aplicarRascunho, mudancasDoRascunho, serializarTokens, substituirBloco, validarRascunho,
  ROTULO_CONTEXTO, type ArquivoTokens, type Rascunho,
} from "@/design/gerar";

/**
 * "SALVAR NO SISTEMA" do editor do design system (Administração › Design
 * system) — SERVER-ONLY.
 *
 * Não grava nada em produção. Abre um PULL REQUEST no repositório com o
 * `src/design/tokens.json` editado E o bloco gerado do `globals.css` refeito
 * pela MESMA função da guarda (`@/design/gerar`), num commit só. O PR passa
 * pelo CI como qualquer outro: a paleta, os tokens e o resto do `npm test`
 * conferem o valor novo, e é o merge que publica. Um editor que escrevesse
 * direto no ar pularia todas as guardas do sistema, e é exatamente isso que
 * o design system existe para impedir.
 *
 * Portões, nesta ordem:
 *   1. demonstração → 503 (não há a quem atribuir a mudança);
 *   2. sessão → 401;
 *   3. `admin_exigir_acesso` com a sessão de QUEM PEDE (segundo fator, prazo,
 *      expiração) — e a tentativa fica em `admin_acessos` mesmo negada;
 *   4. credencial do GitHub (`GITHUB_TOKEN_DESIGN`) → 503 nomeando a variável;
 *   5. o rascunho é conferido contra o tokens.json do `main` de AGORA (não o
 *      do build publicado): token, contexto e escala que não existem, e valor
 *      que quebraria o CSS, são recusados com o nome do problema (400).
 *
 * ⚠️ A credencial precisa só de "Contents: write" e "Pull requests: write"
 * neste repositório. Ela nunca sai do servidor.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARQ_TOKENS = "src/design/tokens.json";
const ARQ_CSS = "src/app/globals.css";

function resposta(status: number, codigo: string, mensagem: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: status < 300, codigo, mensagem, ...extra }, { status });
}

export async function POST(req: Request) {
  if (isDemo) return resposta(503, "demonstracao", "Na demonstração o editor não abre PR. Use \"Baixar tokens.json\".");

  const body = (await req.json().catch(() => ({}))) as { rascunho?: Rascunho; descricao?: string };
  const rascunho: Rascunho = { tokens: body.rascunho?.tokens ?? {}, escalas: body.rascunho?.escalas ?? {} };
  const descricao = String(body.descricao ?? "").slice(0, 500).trim();

  const doChamador = createClient();
  const { data: auth } = await doChamador.auth.getUser();
  const quem = auth?.user;
  if (!quem) return resposta(401, "sem_sessao", "Entre de novo para salvar.");

  const { error: negado } = await doChamador.rpc("admin_exigir_acesso", { p_funcao: "design_system_salvar", p_alvo: null });
  if (negado) return resposta(403, "negado", negado.message);

  const token = process.env.GITHUB_TOKEN_DESIGN;
  const repo = process.env.GITHUB_REPO_DESIGN || "joaotorresz/all4pay-saas-";
  const base = process.env.GITHUB_BASE_DESIGN || "main";
  if (!token)
    return resposta(503, "sem_credencial", "Falta a variável GITHUB_TOKEN_DESIGN no servidor. Enquanto isso, use \"Baixar tokens.json\".");

  const gh = async <T,>(caminho: string, init?: RequestInit): Promise<T> => {
    const r = await fetch(`https://api.github.com/repos/${repo}${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`GitHub ${r.status} em ${caminho.split("?")[0]}: ${txt.slice(0, 200)}`);
    }
    return (await r.json()) as T;
  };
  const conteudo = async (arquivo: string, ref: string) => {
    const c = await gh<{ content: string; encoding: string }>(`/contents/${arquivo}?ref=${ref}`);
    return Buffer.from(c.content, "base64").toString("utf8");
  };

  try {
    const ref = await gh<{ object: { sha: string } }>(`/git/ref/heads/${base}`);
    const shaBase = ref.object.sha;
    const arq = JSON.parse(await conteudo(ARQ_TOKENS, shaBase)) as ArquivoTokens;
    const css = await conteudo(ARQ_CSS, shaBase);

    const erros = validarRascunho(arq, rascunho);
    if (erros.length) return resposta(400, "rascunho_invalido", erros.slice(0, 8).join(" · "), { erros });
    const mudancas = mudancasDoRascunho(arq, rascunho);
    if (!mudancas.length) return resposta(400, "nada_mudou", "Nenhum valor difere do que está no sistema.");

    const novo = aplicarRascunho(arq, rascunho);
    const novoCss = substituirBloco(css, novo);
    if (novoCss === null) return resposta(500, "sem_marcadores", "O globals.css do repositório não tem o bloco gerado.");

    // Um commit só, com os dois arquivos: nunca um PR com o JSON novo e o CSS velho.
    const commitBase = await gh<{ tree: { sha: string } }>(`/git/commits/${shaBase}`);
    const arvore = await gh<{ sha: string }>(`/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: commitBase.tree.sha,
        tree: [
          { path: ARQ_TOKENS, mode: "100644", type: "blob", content: serializarTokens(novo) },
          { path: ARQ_CSS, mode: "100644", type: "blob", content: novoCss },
        ],
      }),
    });
    const resumo = `${mudancas.length} valor${mudancas.length > 1 ? "es" : ""}`;
    const commit = await gh<{ sha: string }>(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: `Design system: ${resumo} pelo editor\n\nSalvo por ${quem.email ?? quem.id} em Administração › Design system.`,
        tree: arvore.sha,
        parents: [shaBase],
      }),
    });
    const agora = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const ramo = `design-system/${agora}-${Math.random().toString(36).slice(2, 6)}`;
    await gh(`/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${ramo}`, sha: commit.sha }) });

    const linhas = mudancas.map((m) =>
      `| \`${m.alvo}\` | ${m.tipo === "escala" ? "escala do Tailwind" : ROTULO_CONTEXTO[m.contexto!]} | \`${m.de}\` | \`${m.para}\` |`);
    const corpo = [
      `Antes: o design system tinha os valores da tabela na coluna "De".`,
      "",
      `Depois: ${resumo} mudam para a coluna "Para", salvos por ${quem.email ?? quem.id} no editor (Administração › Design system).`,
      ...(descricao ? ["", `> ${descricao.replace(/\n/g, " ")}`] : []),
      "",
      "| Valor | Onde | De | Para |",
      "| --- | --- | --- | --- |",
      ...linhas,
      "",
      "Como: o editor aplicou o rascunho ao `src/design/tokens.json` do `main` e refez o bloco gerado do `src/app/globals.css` com a mesma função do `npm run tokens`. O CI confere a paleta e os tokens; o merge publica.",
    ].join("\n");
    const pr = await gh<{ html_url: string; number: number }>(`/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: `Design system: ${resumo} pelo editor`, head: ramo, base, body: corpo }),
    });
    return resposta(200, "pr_aberto", `PR #${pr.number} aberto com ${resumo}.`, { url: pr.html_url, numero: pr.number });
  } catch (e) {
    console.error("[design-system/salvar]", e);
    return resposta(502, "github", e instanceof Error ? e.message : "Falha ao falar com o GitHub.");
  }
}
