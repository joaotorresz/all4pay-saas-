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
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/i.test(m.text())) erros.push(`console: ${m.text().slice(0, 200)}`); });
  const ir = async (rota) => {
    const r = await page.goto(BASE + rota, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
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

/** "R$24.691,34" → 24691.34 (aceita o texto quebrado em partes pelo <BRL>). */
export const brl = (s) => Number(String(s).replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", "."));
