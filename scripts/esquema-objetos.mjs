#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A4P-076 — A GUARDA QUE COMPARA OBJETOS, NÃO NOMES DE MIGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `npm run esquema` confronta a LISTA DE MIGRATIONS aplicadas com os arquivos
 * do repositório. Isso pega migration aplicada sem arquivo — e deixa passar o
 * defeito que o nome não alcança: **um objeto criado à mão em produção**, que
 * migration nenhuma produz e cuja ausência ninguém percebe até tentar tocá-lo.
 *
 * Foi assim que `maq_cnpj_cache` viveu meses no banco sem estar no
 * repositório. O `npm run esquema` estava verde o tempo todo.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ DUAS COMPARAÇÕES, DUAS FONTES — e confundi-las foi o erro que esta versão  │
 * │ conserta.                                                                 │
 * ├───────────────────────────────────────────────────────────────────────────┤
 * │ 1. ESTRUTURA (tabela · função · policy · grant de anon/authenticated)      │
 * │    banco EFÊMERO (o que as migrations produzem) × retrato de PRODUÇÃO.     │
 * │    É a comparação que acha órfão, migration não aplicada e deriva.         │
 * │                                                                           │
 * │ 2. GRANTS DE `service_role` — `--service-role`                             │
 * │    PRODUÇÃO × a LINHA DE BASE declarada (`grants_service_role`).           │
 * │    NÃO se compara com o efêmero: ali eles são default de plataforma        │
 * │    (o supabase local difere do hospedado) e a comparação não diz nada.     │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ **POR QUE `service_role` NÃO PODE SAIR DA GUARDA.** Ele chegou a ser
 * removido daqui por um raciocínio correto com efeito errado: nenhuma migration
 * o concede (todo grant a ele é da plataforma), e comparado com o efêmero ele
 * despejava 77 DERIVA que soterravam o sinal real. Só que `service_role` é **a
 * chave que passa POR FORA do RLS** — é o que sobrou aberto do A4P-077. Tirá-lo
 * faz mudança nesses grants virar INVISÍVEL, e a próxima porta aberta seria
 * exatamente ali. **Ruído vira LINHA DE BASE, não cegueira.**
 *
 * ⚠️ E a linha de base tem conteúdo, não é formalidade: medido em 17/08, os 77
 * grants têm DUAS assinaturas. `audit_log`, `admin_audit` e `admin_acessos` não
 * têm **TRUNCATE** (a revogação da ONDA 9); as outras 74 têm. O dia em que
 * `audit_log.service_role` recuperar TRUNCATE, a trilha de auditoria vira
 * apagável pela chave que ignora RLS — e é essa mudança, exatamente, que o
 * filtro teria escondido.
 *
 * ⚠️ **O retrato é um ARQUIVO, não uma consulta viva.** Se fosse consultado na
 * hora, a guarda se moveria junto com o que deveria medir — e um órfão criado
 * hoje entraria no "esperado" de amanhã sem ninguém decidir nada. Pelo mesmo
 * motivo, `--sync` NÃO atualiza a linha de base de `service_role`: refrescá-la é
 * ato deliberado (`--sync-service-role`), que aparece no diff e passa por
 * revisão. Uma linha de base que se atualiza sozinha é a cegueira de volta.
 *
 * Uso:
 *   SUPABASE_DB_URL=<efêmero>   node scripts/esquema-objetos.mjs
 *   SUPABASE_DB_URL=<produção>  node scripts/esquema-objetos.mjs --service-role
 *   SUPABASE_DB_URL=<produção>  node scripts/esquema-objetos.mjs --sync
 *   SUPABASE_DB_URL=<produção>  node scripts/esquema-objetos.mjs --sync-service-role
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RETRATO = "supabase/objetos-producao.json";
const SYNC = process.argv.includes("--sync");
const SYNC_SVC = process.argv.includes("--sync-service-role");
const MODO_SVC = process.argv.includes("--service-role");
const URL = process.env.SUPABASE_DB_URL;

if (!URL) {
  // ⚠️ Falha, não pula. Guarda que "pula quando não tem credencial" é guarda
  // que não roda — foi exatamente o defeito que a ONDA 2 encontrou no teste de
  // isolamento, verde por nunca ter sido executado.
  console.error("✗ SUPABASE_DB_URL ausente. Esta guarda mede o banco; sem ele ela não mede nada.");
  process.exit(1);
}

/** É grant ao papel que passa por fora do RLS? */
const ehServiceRole = (obj) => obj.startsWith("grant:") && obj.endsWith(".service_role");

/** Lê o inventário do banco apontado por SUPABASE_DB_URL. */
function inventario() {
  const saida = execFileSync("psql", [URL, "-v", "ON_ERROR_STOP=1", "-f", "scripts/objetos.sql"], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  const mapa = {};
  // ⚠️ Só linhas que SÃO objeto entram. O `psql -f` ecoa as confirmações dos
  // `\pset` ("Field separator is "|".") na saída, e elas contêm `|` — sem este
  // filtro viravam um objeto fantasma `Field separator is` acusado como
  // "ausente". Todo objeto começa por um dos quatro prefixos conhecidos.
  const PREFIXO = /^(tabela|funcao|policy|grant):/;
  for (const linha of saida.split("\n")) {
    const t = linha.trim();
    if (!PREFIXO.test(t) || !t.includes("|")) continue;
    const i = t.lastIndexOf("|");
    mapa[t.slice(0, i)] = t.slice(i + 1);
  }
  return mapa;
}

const lido = inventario();
const estrutura = Object.fromEntries(Object.entries(lido).filter(([o]) => !ehServiceRole(o)));
const servico = Object.fromEntries(Object.entries(lido).filter(([o]) => ehServiceRole(o)));

const manifesto = existsSync(RETRATO) ? JSON.parse(readFileSync(RETRATO, "utf8")) : null;

/* ─────────────────────────── sincronizações ─────────────────────────────── */

if (SYNC || SYNC_SVC) {
  if (!manifesto) { console.error(`✗ ${RETRATO} não existe.`); process.exit(1); }
  if (SYNC) {
    manifesto.objetos = estrutura;
    manifesto.total = Object.keys(estrutura).length;
    manifesto.gerado_em = new Date().toISOString().slice(0, 10);
  }
  if (SYNC_SVC) {
    manifesto.grants_service_role = servico;
  }
  writeFileSync(RETRATO, JSON.stringify(manifesto, null, 1) + "\n");
  console.log(`✓ retrato atualizado: ${SYNC ? `${Object.keys(estrutura).length} objetos de estrutura` : ""}`
    + `${SYNC && SYNC_SVC ? " · " : ""}${SYNC_SVC ? `${Object.keys(servico).length} grants de service_role` : ""}`);
  process.exit(0);
}

if (!manifesto) {
  console.error(`✗ ${RETRATO} não existe. Rode \`npm run objetos:sync\` com o SUPABASE_DB_URL de produção.`);
  process.exit(1);
}

const conta = (t, lista) => {
  if (lista.length === 0) return 0;
  console.error(`\n✗ ${lista.length} ${t}:`);
  for (const o of lista.slice(0, 25)) console.error(`   · ${o}`);
  // ⚠️ O resumo DIZ que cortou e como ver o resto. Ler "… e mais 52" como se o
  // que sobrou fosse igual ao que apareceu já custou uma conclusão errada aqui:
  // "org_balances é a única deriva" saiu de uma lista truncada, e `org_movements`
  // estava na parte escondida.
  if (lista.length > 25) {
    console.error(`   … e mais ${lista.length - 25} NÃO EXIBIDO(S) — a lista acima está CORTADA;`);
    console.error("     não conclua nada sobre o que não apareceu.");
  }
  return lista.length;
};

/* ──────────────── modo --service-role: produção × linha de base ─────────── */

if (MODO_SVC) {
  const base = manifesto.grants_service_role ?? {};
  if (Object.keys(base).length === 0) {
    console.error("✗ linha de base de `service_role` vazia. Rode `--sync-service-role` contra produção e");
    console.error("  COMMITE o resultado: sem base declarada, a chave que passa por fora do RLS fica sem vigia.");
    process.exit(1);
  }
  const apareceu = Object.keys(servico).filter((o) => !(o in base));
  const sumiu = Object.keys(base).filter((o) => !(o in servico));
  const mudou = Object.keys(servico).filter((o) => o in base && servico[o] !== base[o]);

  console.log(`service_role: ${Object.keys(servico).length} grant(s) no banco · `
    + `${Object.keys(base).length} na linha de base declarada`);

  let f = 0;
  f += conta("grant(s) de service_role NOVO(S) — porta aberta que ninguém declarou", apareceu);
  f += conta("grant(s) de service_role que SUMIRAM da linha de base", sumiu);
  f += conta("grant(s) de service_role com PRIVILÉGIO diferente do declarado", mudou);
  if (f > 0) {
    console.error("\n`service_role` é a chave que passa POR FORA do RLS: um grant novo aqui é uma tabela");
    console.error("inteira exposta sem política. Se a mudança é intencional, rode `--sync-service-role`");
    console.error("e COMMITE — a linha nova aparece no diff e passa por revisão.");
    process.exit(1);
  }
  console.log("✓ TODOS — nenhum grant de service_role fora da linha de base declarada");
  process.exit(0);
}

/* ──────────────── modo padrão: efêmero × retrato de produção ────────────── */

const producao = manifesto.objetos ?? {};
/**
 * ⚠️ Órfão DECLARADO continua sendo órfão — ele só deixa de reprovar. Cada
 * entrada carrega o motivo e o dono, pela mesma regra do mapa de consolidação:
 * a dívida existe declarada, ou não existe.
 */
const declarados = manifesto.orfaos_declarados ?? {};
/**
 * ⚠️ **Pendente de aplicação NÃO é órfão, e chamá-los pelo mesmo nome mente
 * sobre a causa.** Órfão é objeto que produção tem e migration nenhuma cria.
 * Isto aqui é o inverso no tempo: a migration EXISTE no repositório, está
 * declarada como não-aplicada no manifesto do esquema, e enquanto o banco não a
 * recebe produção legitimamente difere. Some sozinho quando a migration
 * aplicar — e cada entrada nomeia QUAL migration o resolve, senão viraria um
 * "declarado" permanente com cara de dívida temporária.
 */
const pendentes = manifesto.pendentes_de_aplicacao ?? {};
const perdoado = (o) => o in declarados || o in pendentes;

const orfaos = [];   // em produção, não nas migrations
const ausentes = []; // nas migrations, não em produção
const deriva = [];   // nos dois, assinatura diferente

for (const [obj, sig] of Object.entries(producao)) {
  if (!(obj in estrutura)) { if (!perdoado(obj)) orfaos.push(obj); }
  else if (estrutura[obj] !== sig) { if (!perdoado(obj)) deriva.push(obj); }
}
for (const obj of Object.keys(estrutura)) {
  if (!(obj in producao) && !perdoado(obj)) ausentes.push(obj);
}

console.log(`objetos: ${Object.keys(estrutura).length} nas migrations · `
  + `${Object.keys(producao).length} no retrato de produção (${manifesto.gerado_em}) · `
  + `${Object.keys(declarados).length} órfão(s) declarado(s) · `
  + `${Object.keys(pendentes).length} pendente(s) de aplicação`);

let falhas = 0;
falhas += conta("ÓRFÃO(S) — existem em produção e nenhuma migration os cria", orfaos);
falhas += conta("objeto(s) nas migrations e ausentes de produção", ausentes);
falhas += conta("objeto(s) com DERIVA — mesma identidade, definição diferente", deriva);

if (falhas > 0) {
  console.error("\nCada um vira arquivo de migration, ou vira órfão DECLARADO com motivo e dono,");
  console.error("ou — se a migration já existe e o banco ainda não a recebeu — entra em");
  console.error("`pendentes_de_aplicacao` nomeando a migration que o resolve.");
  process.exit(1);
}
console.log("✓ TODOS — nenhum objeto fora do declarado");
