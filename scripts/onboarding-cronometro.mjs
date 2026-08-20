/**
 * onboarding-cronometro — QUANTO TEMPO LEVA, DE VERDADE, DO ZERO AO DRE.
 *
 *   npm run cronometro        (exige o build de produção servido)
 *
 * Dirige o caminho inteiro num navegador — criar a empresa, declarar o regime,
 * importar um extrato REAL e abrir o DRE — e responde à única pergunta que
 * importa antes de vender: **quanto tempo isso custa a uma pessoa?**
 *
 * ⚠️ **O CRONÔMETRO DA MÁQUINA NÃO É A RESPOSTA, e medir só ele seria mentir
 * para o meu lado.** Um robô preenche quinze campos em 40 ms; uma pessoa não.
 * Se eu publicasse "onboarding em 12 segundos", o número seria exato e inútil —
 * a meta de 10 minutos é sobre gente. Então a medida tem DUAS metades:
 *
 *   1. **Tempo de máquina** — medido de verdade, com relógio: carregar tela,
 *      processar o extrato, montar o DRE. É o que o produto controla.
 *   2. **Tempo de pessoa** — contado do DOM real (quantos campos, quantas
 *      escolhas, quantas telas novas) e convertido por uma tabela de ritmo
 *      DECLARADA abaixo. É o que o desenho do produto impõe.
 *
 * ⚠️ **A tabela de ritmo é declarada, não escondida num número final.** Ela é
 * uma suposição, e suposição que não aparece vira fato por descuido. Quem
 * discordar do ritmo recalcula sem reabrir o navegador — e é por isso que ela
 * mora aqui e não dentro da conta.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.ALVO ?? "http://127.0.0.1:3117";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const META_S = 600; // 10 minutos

/**
 * RITMO HUMANO, em segundos. Ancorado em faixas correntes de estudo de
 * usabilidade para formulário de cadastro; são ESTIMATIVAS declaradas, não
 * medição de usuário real — trocá-las é um gesto, não uma reescrita.
 */
const RITMO = {
  campoCurto: 4,     // nome, cargo — digitar o que já se sabe
  campoFormatado: 8, // CNPJ, telefone, data: conferir enquanto digita
  escolha: 5,        // ler as opções de um select e decidir
  clique: 2,         // apertar um botão já identificado
  telaNova: 8,       // reconhecer uma tela pela primeira vez
  arquivo: 12,       // achar o extrato no computador
  revisao: 30,       // conferir a prévia da importação antes de confirmar
};

const b = await chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

/* ─── A PRÉ-CONDIÇÃO, e ela existe porque eu caí nela ───────────────────────
 * ⚠️ Na primeira execução deste arquivo a fase 4 reprovou com "o DRE abriu sem
 * um único valor", e eu quase publiquei isso como defeito de produto. Era
 * artefato de AMBIENTE: o build local não tinha `NEXT_PUBLIC_ALL4PAY_DEMO` nem
 * as variáveis do Supabase, então toda consulta falhava e o DRE não tinha de
 * onde tirar número nenhum. É exatamente o erro do A4P-036 — medir uma ponta
 * com uma entrada e concluir sobre a outra.
 *
 * Um cronômetro que não distingue "vazio porque quebrou" de "vazio porque não
 * há fonte" fabrica defeito, e defeito fabricado custa duas rodadas. Então ele
 * PARA antes de medir, em vez de produzir um número que parece resultado. */
{
  // Servidor no ar? Sem esta checagem o Playwright estoura com ERR_CONNECTION
  // e a mensagem fala de rede, não do que o operador precisa fazer.
  const alcancavel = await page.goto(`${BASE}/api/versao`, { waitUntil: "domcontentloaded", timeout: 30000 })
    .then(() => true).catch(() => false);
  if (!alcancavel) {
    console.log(`\n✗ CRONÔMETRO NÃO EXECUTADO — nada respondendo em ${BASE}.`);
    console.log("  Suba o build de produção antes de medir:");
    console.log("    NEXT_PUBLIC_ALL4PAY_DEMO=true npm run build && npx next start -p 3121");
    await b.close();
    process.exit(2);
  }
  const cfg = await page.evaluate(() => {
    try { return JSON.parse(document.body.innerText); } catch { return null; }
  });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });
  const temFonte = await page.evaluate(() => {
    // A página de login monta o cliente do navegador; se não houver fonte de
    // dado nenhuma, a marca de demonstração e o Supabase estão os dois fora.
    return Boolean(document.querySelector("form, input"));
  });
  const demo = process.env.NEXT_PUBLIC_ALL4PAY_DEMO === "true";
  const supa = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!demo && !supa) {
    console.log("\n✗ CRONÔMETRO NÃO EXECUTADO — nem demonstração nem Supabase configurados.");
    console.log("  Sem fonte de dado, o DRE abre vazio por FALTA DE DADO e o cronômetro");
    console.log("  reportaria isso como defeito de produto. Rode com:");
    console.log("    NEXT_PUBLIC_ALL4PAY_DEMO=true npm run build && npx next start -p 3117");
    console.log(`    (servidor visto: ${cfg?.commit?.slice(0, 7) ?? "?"} · login renderiza: ${temFonte})`);
    await b.close();
    process.exit(2);
  }
}

const fases = [];
let falhas = 0;
const agora = () => Number(process.hrtime.bigint() / 1000000n);

/**
 * ⚠️ **A SEGUNDA ARMADILHA, e ela também me pegou.** Depois de reconstruir em
 * modo demonstração, o cronômetro reprovou TRÊS fases: sem campo de regime, sem
 * campo de arquivo, DRE vazio. Parecia um produto quebrado. Era um servidor
 * ANTIGO ainda de pé na porta, servindo o `.next` novo: os hashes dos pedaços
 * mudaram, o navegador tomou `ChunkLoadError` e a tela caiu na fronteira de
 * erro. Nada disso é do produto.
 *
 * Duas vezes seguidas eu quase publiquei defeito de ambiente como defeito de
 * produto — e a diferença entre os dois é invisível na tela, porque **os dois
 * mostram vazio**. Por isso o cronômetro passou a reconhecer a fronteira de
 * erro e o `ChunkLoadError` e ABORTAR, em vez de pontuar. Medição que não sabe
 * distinguir "quebrou" de "não carregou" fabrica achado.
 */
async function abortarSeAmbienteQuebrou(page, ondeEstou) {
  const quebra = await page.evaluate(() => {
    const t = document.body.innerText;
    if (/Esta tela não abriu/.test(t)) return "a fronteira de erro do app apareceu";
    return null;
  }).catch(() => null);
  if (quebra) {
    console.log(`\n✗ CRONÔMETRO ABORTADO em "${ondeEstou}" — ${quebra}.`);
    console.log("  Causa mais provável: servidor antigo de pé servindo um build novo");
    console.log("  (ChunkLoadError). Libere a porta e suba o servidor de novo antes de medir:");
    console.log("    fuser -k -n tcp 3121 && NEXT_PUBLIC_ALL4PAY_DEMO=true npx next start -p 3121");
    await b.close();
    process.exit(2);
  }
}

async function fase(nome, humano, fn) {
  const t0 = agora();
  let detalhe = "";
  try { detalhe = (await fn()) ?? ""; }
  catch (e) { falhas++; detalhe = `ERRO: ${String(e).slice(0, 120)}`; }
  const maquina = (agora() - t0) / 1000;
  fases.push({ nome, maquina, humano, detalhe });
}

/* ─── 1. CRIAR A EMPRESA + DECLARAR O REGIME ───────────────────────────────
   ⚠️ O regime entra AQUI, e é a decisão mais cara do cadastro: sem ele o
   sistema não sabe se a folha recolhe contribuição patronal por fora nem qual
   tabela de imposto usar. Preencher a etapa e pular o regime "funciona" e
   produz número errado depois — por isso o cronômetro o trata como parada
   obrigatória e reprova se o campo não existir. */
await fase("1. Criar empresa e declarar regime",
  RITMO.telaNova + RITMO.campoFormatado * 2 + RITMO.campoCurto * 3 + RITMO.escolha * 2 + RITMO.clique,
  async () => {
    await page.goto(`${BASE}/comecar`, { waitUntil: "networkidle", timeout: 60000 });
    await abortarSeAmbienteQuebrou(page, "criar empresa");
    const preencher = async (label, valor) => {
      const c = page.getByLabel(label, { exact: false }).first();
      if (await c.count() === 0) return false;
      await c.fill(valor); return true;
    };
    await preencher("CNPJ", "11222333000181");
    await preencher("Razão social", "Cronômetro Comércio Ltda");
    await preencher("Nome fantasia", "Cronômetro");
    await preencher("Nome", "Maria Silva");
    await preencher("E-mail", "maria@cronometro.com.br");

    const regime = page.getByLabel("Regime tributário", { exact: false }).first();
    const temRegime = await regime.count() > 0;
    if (!temRegime) { falhas++; return "REPROVA: não há campo de regime no cadastro"; }
    const opcoes = await regime.evaluate((s) => [...s.options].map((o) => o.value).filter(Boolean));
    await regime.selectOption(opcoes[0]);
    return `regime declarado: ${opcoes[0]} · ${opcoes.length} opções`;
  });

/* ─── 2. ATRAVESSAR ATÉ A IMPORTAÇÃO ───────────────────────────────────────
   Três etapas entre o cadastro e o extrato. Elas são opcionais no produto — e
   o cronômetro passa por elas como um usuário apressado passaria, clicando
   "Próximo". O custo de cada tela nova conta mesmo sem preencher nada: ler e
   decidir pular também é tempo. */
await fase("2. Atravessar perfil, governança e estrutura",
  RITMO.telaNova * 3 + RITMO.clique * 3,
  async () => {
    let etapas = 0;
    for (let i = 0; i < 3; i++) {
      const prox = page.getByRole("button", { name: /^(Próximo|Continuar|Avançar)$/i }).first();
      if (await prox.count() === 0) break;
      await prox.click(); await page.waitForTimeout(500); etapas++;
    }
    return `${etapas} etapas atravessadas`;
  });

/* ─── 3. IMPORTAR O EXTRATO ────────────────────────────────────────────────
   ⚠️ Com o arquivo REAL de `public/exemplos`, não com um CSV de três linhas
   escrito para o teste: o que se quer medir é o tempo de processar um extrato
   de doze meses, e um arquivo de brinquedo processa rápido e não prova nada. */
const CSV = readFileSync("public/exemplos/extrato-exemplo-all4pay.csv");
await fase("3. Importar o extrato (12 meses, arquivo real)",
  RITMO.telaNova + RITMO.arquivo + RITMO.clique + RITMO.revisao,
  async () => {
    const prox = page.getByRole("button", { name: /^(Próximo|Continuar|Avançar)$/i }).first();
    if (await prox.count() > 0) { await prox.click(); await page.waitForTimeout(600); }
    const campo = page.locator('input[type="file"]').first();
    if (await campo.count() === 0) { falhas++; return "REPROVA: não há campo de arquivo na etapa de importação"; }
    await campo.setInputFiles({ name: "extrato.csv", mimeType: "text/csv", buffer: CSV });
    await page.waitForTimeout(400);
    const analisar = page.getByRole("button", { name: /Analisar/i }).first();
    if (await analisar.count() > 0) await analisar.click();
    // Espera o relatório aparecer — é ESTE o tempo de máquina que interessa.
    await page.waitForFunction(
      () => /lançamento|transaç|classificad/i.test(document.body.innerText),
      { timeout: 60000 },
    ).catch(() => { falhas++; });
    const lidos = await page.evaluate(() => {
      const m = document.body.innerText.match(/(\d+)\s+lançamentos?/i);
      return m ? Number(m[1]) : 0;
    });
    if (lidos === 0) falhas++;
    return `${lidos} lançamentos lidos e classificados`;
  });

/* ─── 4. CONCLUIR E VER O DRE ──────────────────────────────────────────────
   ⚠️ A prova não é "a tela do DRE abriu": é **um número aparecer**. Uma tela de
   DRE vazia abre igualzinho, e foi assim que a jornada pareceu completa em
   auditorias anteriores. */
await fase("4. Concluir o cadastro e abrir o DRE",
  RITMO.telaNova * 2 + RITMO.clique * 2,
  async () => {
    for (let i = 0; i < 3; i++) {
      const btn = page.getByRole("button", { name: /Concluir e entrar|Concluir|^(Próximo|Continuar)$/i }).first();
      if (await btn.count() === 0) break;
      await btn.click(); await page.waitForTimeout(1200);
      if (!page.url().includes("/comecar")) break;
    }
    await page.goto(`${BASE}/dashboard/reports/dre`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2500);
    await abortarSeAmbienteQuebrou(page, "abrir o DRE");
    const r = await page.evaluate(() => {
      const t = document.body.innerText;
      const valores = t.match(/R\$\s?[\d.]+,\d{2}/g) ?? [];
      const naoZero = valores.filter((v) => !/^R\$\s?0,00$/.test(v));
      return { total: valores.length, naoZero: naoZero.length, amostra: naoZero.slice(0, 3) };
    });
    if (r.naoZero === 0) { falhas++; return "REPROVA: o DRE abriu sem um único valor"; }
    return `${r.naoZero} valores no DRE (ex.: ${r.amostra.join(", ")})`;
  });

await b.close();

/* ─── O PLACAR ─────────────────────────────────────────────────────────── */
const maquina = fases.reduce((a, f) => a + f.maquina, 0);
const humano = fases.reduce((a, f) => a + f.humano, 0);
const total = maquina + humano;
const mmss = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;

console.log("\nONBOARDING CRONOMETRADO — do zero ao DRE\n");
console.log("fase".padEnd(46), "máquina".padStart(9), "pessoa".padStart(9), "  o que aconteceu");
for (const f of fases)
  console.log(f.nome.padEnd(46), `${f.maquina.toFixed(1)}s`.padStart(9), `${f.humano}s`.padStart(9), " ", f.detalhe);
console.log("".padEnd(46, "─"), "─────────".padStart(9), "─────────".padStart(9));
console.log("TOTAL".padEnd(46), `${maquina.toFixed(1)}s`.padStart(9), `${humano}s`.padStart(9));

console.log(`\n  tempo de máquina  ${mmss(maquina)}   (o que o produto controla)`);
console.log(`  tempo de pessoa   ${mmss(humano)}   (o que o desenho impõe, pela tabela de ritmo)`);
console.log(`  TOTAL             ${mmss(total)}   · meta ${mmss(META_S)}`);

// ⚠️ Onde o tempo VAI é a metade acionável. "Passou em 6 minutos" não diz o que
// encurtar; a fase mais cara diz.
const pior = [...fases].sort((a, b) => (b.maquina + b.humano) - (a.maquina + a.humano))[0];
const pct = (n) => `${Math.round((n / total) * 100)}%`;
console.log(`\n  a fase mais cara é "${pior.nome}" — ${mmss(pior.maquina + pior.humano)}, ${pct(pior.maquina + pior.humano)} do total`);
console.log(`  a máquina responde por ${pct(maquina)} do tempo; o resto é preenchimento e decisão`);

const passou = total <= META_S && falhas === 0;
console.log(`\n${passou ? "✓" : "✗"} ${passou ? `dentro da meta com ${mmss(META_S - total)} de folga` : falhas > 0 ? `${falhas} etapa(s) do fluxo reprovaram` : `${mmss(total - META_S)} ACIMA da meta`}`);
if (!passou) process.exit(1);
