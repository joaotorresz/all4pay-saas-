#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O DIFF DO RETRATO — o que entrou, o que saiu, o que mudou de definição
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O ARQUIVO NÃO É A INFORMAÇÃO; O DIFF É.** Um PR que diz "retrato
 * atualizado: 351 → 403 objetos" não permite decidir nada — 52 a mais pode ser
 * uma migration aplicada (esperado) ou 52 objetos criados à mão em produção
 * (que é exatamente o que a guarda existe para denunciar). Quem revisa precisa
 * ler os NOMES.
 *
 * ⚠️ **E ele REPROVA duas coisas, porque refrescar uma linha de base é o gesto
 * mais perigoso que existe numa guarda:**
 *
 *   1. `grants_service_role` MUDOU — só `--sync-service-role` mexe nesse bloco,
 *      e ele é a vigia da chave que passa POR FORA do RLS. Se ele se moveu num
 *      job que roda só `--sync`, ou o comando errado foi usado, ou alguém
 *      editou o arquivo à mão. Nos dois casos a chave perde a vigia em silêncio.
 *   2. O retrato saiu VAZIO ou quase — um `--sync` que falhou pela metade
 *      produziria um arquivo sem objetos, e a guarda passaria a comparar o
 *      efêmero contra o nada. Verde sobre o vazio é pior que vermelho.
 *
 * Uso: node scripts/retrato-diff.mjs <antes.json> <depois.json> [saida.md]
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , antesPath, depoisPath, saidaPath] = process.argv;
if (!antesPath || !depoisPath) {
  console.error("uso: retrato-diff.mjs <antes.json> <depois.json> [saida.md]");
  process.exit(2);
}

const antes = JSON.parse(readFileSync(antesPath, "utf8"));
const depois = JSON.parse(readFileSync(depoisPath, "utf8"));

const objA = antes.objetos ?? {};
const objD = depois.objetos ?? {};

/* ── as duas reprovações ─────────────────────────────────────────────────── */

const svcA = JSON.stringify(antes.grants_service_role ?? {});
const svcD = JSON.stringify(depois.grants_service_role ?? {});
if (svcA !== svcD) {
  console.error("✗ `grants_service_role` MUDOU, e este job roda só `--sync`.");
  console.error("  Esse bloco é a linha de base da chave que passa POR FORA do RLS.");
  console.error("  Ou o comando errado rodou (`--sync-service-role`), ou o arquivo foi");
  console.error("  editado à mão. Refrescá-lo é ato deliberado, com revisão própria.");
  process.exit(1);
}

const MINIMO = 50;
if (Object.keys(objD).length < MINIMO) {
  console.error(`✗ o retrato novo tem ${Object.keys(objD).length} objeto(s) — abaixo do piso de ${MINIMO}.`);
  console.error("  Um `--sync` que falhou pela metade deixa a guarda comparando o efêmero");
  console.error("  contra o nada, e ela fica VERDE por não ter o que reprovar.");
  process.exit(1);
}

/* ── o diff ──────────────────────────────────────────────────────────────── */

const entraram = Object.keys(objD).filter((o) => !(o in objA)).sort();
const sairam = Object.keys(objA).filter((o) => !(o in objD)).sort();
const mudaram = Object.keys(objD)
  .filter((o) => o in objA && objA[o] !== objD[o])
  .sort();

const porTipo = (lista) => {
  const g = new Map();
  for (const o of lista) {
    const t = o.slice(0, o.indexOf(":"));
    if (!g.has(t)) g.set(t, []);
    g.get(t).push(o);
  }
  return [...g.entries()].sort();
};

const bloco = (titulo, lista, nota) => {
  if (lista.length === 0) return `### ${titulo}\n\nNenhum.\n`;
  let s = `### ${titulo} — ${lista.length}\n`;
  if (nota) s += `\n${nota}\n`;
  for (const [tipo, itens] of porTipo(lista)) {
    s += `\n**${tipo}** (${itens.length})\n\n`;
    for (const i of itens) s += `- \`${i.slice(tipo.length + 1)}\`\n`;
  }
  return s;
};

const md = [
  `**${Object.keys(objA).length} → ${Object.keys(objD).length} objetos de estrutura**`,
  `· retrato de \`${antes.gerado_em}\` para \`${depois.gerado_em}\``,
  "",
  bloco(
    "Entraram (produção TEM e o retrato não tinha)",
    entraram,
    "Cada um destes ou nasceu de uma migration aplicada desde o retrato anterior —" +
      " e aí entrar é o esperado — ou foi criado À MÃO em produção, que é" +
      " justamente o que a guarda existe para denunciar. **Confira nome por nome.**",
  ),
  bloco(
    "Saíram (o retrato tinha e produção não tem mais)",
    sairam,
    "Objeto que sumiu de produção. Se não houve migration removendo, alguém o" +
      " apagou fora do repositório.",
  ),
  bloco(
    "Mudaram de definição (mesma identidade, assinatura diferente)",
    mudaram,
    "Coluna acrescentada ou trocada de tipo, função que mudou de volatilidade ou" +
      " de `SECURITY DEFINER`, política com outro `USING`. A assinatura é um md5" +
      " do que DEFINE o objeto, então reformatação não aparece aqui — só mudança" +
      " de comportamento.",
  ),
  "",
  `\`grants_service_role\`: **inalterado** (${Object.keys(depois.grants_service_role ?? {}).length} grants). Este job nunca o refresca.`,
].join("\n");

if (saidaPath) writeFileSync(saidaPath, md + "\n");
console.log(md);

console.error(
  `\nretrato-diff: ${entraram.length} entraram · ${sairam.length} saíram · ${mudaram.length} mudaram`,
);
