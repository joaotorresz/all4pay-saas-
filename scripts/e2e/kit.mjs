/**
 * Kit dos testes de JORNADA — o sistema dirigido como um usuário dirige.
 *
 *   npm run e2e              (exige o build de DEMONSTRAÇÃO servido em :3121)
 *
 * ⚠️ Por que existe, além do smoke de rotas: "a tela abre" e "a tarefa
 * termina com o dinheiro no lugar certo" são perguntas diferentes. O primeiro
 * teste desta pasta achou três defeitos que nenhuma guarda via: a venda não
 * salvava (categoria obrigatória sem opção), o total ignorava os itens, e o
 * título saía com o código da categoria no lugar do nome.
 *
 * Cada jornada CRIA algo, e confere que ele chegou em TODOS os lugares onde
 * deveria aparecer (lista, títulos, extrato, DRE…) — e em nenhum onde não
 * deveria. Cada uma roda num contexto de navegador novo: o dataset da
 * demonstração vive no localStorage, então as jornadas não se contaminam.
 */
import { chromium } from "playwright";

export const BASE = process.env.ALVO ?? "http://127.0.0.1:3121";

export async function abrirNavegador() {
  return chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
}

/** Um usuário novo: contexto limpo, com erro de página e de console coletados. */
export async function novoUsuario(navegador) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  // "Failed to fetch RSC payload" é o Next avisando que um PREFETCH foi cortado
  // porque a jornada navegou (page.goto) antes de ele terminar — ele mesmo cai
  // na navegação normal. É artefato da automação, não defeito da tela.
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|Failed to fetch RSC payload/i.test(m.text())) erros.push(`console: ${m.text().slice(0, 200)}`); });
  const ir = async (rota) => {
    const r = await page.goto(BASE + rota, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    // O Painel de despesas (27/10/2026) abre a TABELA dos títulos só depois de
    // escolher um card. As jornadas leem a tabela inteira: abrimos "Total a
    // pagar", que é o recorte que a lista de títulos mostrava antes.
    if (new URL(page.url()).pathname === "/contas-a-pagar/painel-de-despesas") {
      const total = page.getByRole("button", { name: "Abrir a tabela de Total a pagar" });
      if (await total.count()) { await total.first().click(); await page.waitForTimeout(800); }
    }
    return r?.status() ?? 0;
  };
  const texto = () => page.evaluate(() => document.body.innerText);
  const select = (aria) => page.locator(`select[aria-label="${aria}"]`).first();
  return { ctx, page, erros, ir, texto, select };
}

/** Coletor de verificações: cada `ok` é uma linha; `fim()` sai com 1 se algo reprovou. */
export function verificador(jornada) {
  let falhas = 0;
  const ok = (cond, nome, detalhe = "") => {
    if (!cond) falhas++;
    console.log(`${cond ? "✓" : "✗"} [${jornada}] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  };
  return { ok, falhas: () => falhas };
}

/** "R$ 24.691,34" → 24691.34 (aceita o texto quebrado em partes pelo <BRL>). */
export const brl = (s) => Number(String(s).replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", "."));

/**
 * O saldo da Visão geral, em reais (com sinal e centavos). Desde o card
 * "Saldo total em contas" (#277) o rótulo antigo "Saldo em conta hoje" saiu da
 * Home, e cada jornada tinha a sua cópia da leitura — oito jornadas ficaram
 * lendo NaN no mesmo dia. Uma leitura só: a próxima troca de rótulo muda aqui.
 */
export async function saldoDaHome(u) {
  await u.ir("/");
  await u.page.getByText("Saldo total em contas").first().waitFor({ timeout: 20000 }).catch(() => {});
  const t = (await u.texto()).replace(/\s+/g, " ");
  const m = t.match(/Saldo total em contas.*?(−|-)?\s*R\$\s*([\d.]+)\s*(,\s*\d{2})?/);
  return m ? (m[1] ? -1 : 1) * brl(`${m[2]}${(m[3] ?? ",00").replace(/\s/g, "")}`) : NaN;
}

/**
 * Desde 26/10/2026 a análise do extrato abre sozinha o assistente "Revisar a
 * importação" (quatro passos). As jornadas que conferem a PRÉ-VISUALIZAÇÃO
 * (contagem, competência, duplicatas) fecham o assistente e seguem por ela.
 */
export async function fecharAssistenteImportacao(u) {
  const dlg = u.page.locator('[role="dialog"][aria-label="Revisar a importação"]');
  await dlg.waitFor({ timeout: 60000 }).catch(() => {});
  if (await dlg.count()) {
    await dlg.getByRole("button", { name: "Fechar" }).first().click();
    await dlg.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  }
}
