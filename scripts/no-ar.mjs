#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A4P-075 — "NO AR" É UM ESTADO CONTÍNUO, NÃO UM EVENTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O defeito que criou esta guarda, medido em 17/08/2026: o deploy do PR #103
 * demorou, o PR #104 foi mergeado e publicado depois dele — e então o build
 * ATRASADO do #103 pousou e **sobrescreveu** o novo. `/api/versao` voltou de
 * `4132318` para `998d800`, e o conserto do A4P-073 saiu do ar sem que ninguém
 * tocasse em nada. A tela do Razão voltou a dizer "nada absorvido" sobre
 * R$ 1.080.562,75.
 *
 * ⚠️ **E eu tinha declarado o item "no ar" com uma leitura única de
 * `/api/versao`.** Uma leitura prova o MOMENTO; ela não prova o ESTADO. Entre a
 * leitura e a próxima hora, qualquer build concorrente desfaz o que ela
 * afirmou — e a afirmação continua no relatório, agora falsa.
 *
 * Por isso esta guarda roda em SCHEDULE, não só no CI: a divergência aparece
 * DEPOIS do merge, quando ninguém está olhando o pipeline.
 *
 * Uso:
 *   node scripts/no-ar.mjs                      # compara com origin/main
 *   node scripts/no-ar.mjs --esperado <sha>     # compara com um SHA dado
 *   node scripts/no-ar.mjs --tolerancia 10      # minutos de espera pelo deploy
 */

import { execSync } from "node:child_process";

const URL_VERSAO = process.env.A4P_URL_VERSAO
  ?? "https://all4pay-saas.vercel.app/api/versao";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};

/**
 * ⚠️ A tolerância existe porque o deploy leva minutos, e uma guarda que reprova
 * durante a janela normal de publicação seria desligada na primeira semana. Ela
 * NÃO é indulgência com o defeito: passado o prazo, a divergência é reprovada
 * com os dois SHAs à vista.
 */
const TOLERANCIA_MIN = Number(arg("tolerancia", "10"));
const esperado = (arg("esperado", "") || execSync("git rev-parse origin/main").toString().trim()).trim();

const curto = (s) => (s ?? "").slice(0, 7);

async function servido() {
  const r = await fetch(URL_VERSAO, { headers: { "cache-control": "no-cache" } });
  if (!r.ok) throw new Error(`${URL_VERSAO} respondeu ${r.status}`);
  const j = await r.json();
  if (!j?.commit) throw new Error(`resposta sem campo "commit": ${JSON.stringify(j)}`);
  return j;
}

/** O commit servido é um ANCESTRAL do esperado? Então é build velho, não desconhecido. */
function ehAncestral(sha) {
  try {
    execSync(`git merge-base --is-ancestor ${sha} ${esperado}`, { stdio: "ignore" });
    return true;
  } catch { return false; }
}

const fim = Date.now() + TOLERANCIA_MIN * 60_000;
let ultimo = null;
let tentativas = 0;

while (Date.now() <= fim) {
  tentativas++;
  try {
    ultimo = await servido();
    if (ultimo.commit === esperado) {
      console.log(`✓ NO AR — ${curto(esperado)} servido em ${ultimo.ambiente ?? "?"} `
        + `(${tentativas} leitura${tentativas > 1 ? "s" : ""})`);
      process.exit(0);
    }
  } catch (e) {
    console.log(`  … ${e.message}`);
  }
  if (Date.now() > fim) break;
  await new Promise((r) => setTimeout(r, 30_000));
}

/* ── Reprovou: a divergência com o diagnóstico junto ───────────────────────── */
const servidoSha = ultimo?.commit ?? "(sem resposta)";
const velho = ultimo?.commit ? ehAncestral(ultimo.commit) : false;

console.error("");
console.error("✗ FORA DO AR — o que produção serve não é o HEAD.");
console.error(`  esperado (origin/main): ${esperado}`);
console.error(`  servido  (/api/versao): ${servidoSha}`);
console.error(`  tolerância: ${TOLERANCIA_MIN} min · leituras: ${tentativas}`);
console.error("");
if (velho) {
  // ⚠️ Esta é a assinatura do A4P-075: o servido é ANTERIOR ao HEAD, ou seja,
  // um build atrasado pousou por cima de um mais novo. Não é lentidão — é
  // sobrescrita, e o conserto é cancelar build obsoleto na publicação.
  console.error("  DIAGNÓSTICO: o commit servido é ANCESTRAL do HEAD — build antigo");
  console.error("  sobrescreveu um mais novo (A4P-075). Não é atraso: é regressão.");
} else {
  console.error("  DIAGNÓSTICO: o commit servido NÃO é ancestral do HEAD — pode ser");
  console.error("  outro branch publicando, ou um HEAD local desatualizado.");
}
process.exit(1);
