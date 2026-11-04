/**
 * compras-morada — a compra tem UMA morada em produção: `public.compras`.
 *
 *   npm run compras-morada        (dentro de npm test)
 *
 * Decisão de 03/11/2026 (Fase 3 do plano): a compra saiu da lista inteira em
 * `org_state` (`a4p_compras`), onde a última gravação vencia, para uma linha
 * por pedido. Esta guarda reprova se alguém desfizer qualquer metade:
 *
 *   1. a chave `a4p_compras` deixa de estar CONGELADA em store-org (ela
 *      voltaria a subir para org_state: duas moradas);
 *   2. alguma função de `compras-store` grava a chave fora de `if (isDemo)`;
 *   3. o caminho de produção deixa de ler ou gravar em `compras`, ou de
 *      excluir pela lixeira;
 *   4. a migration perde a exigência de papel, a trilha ou as colunas geradas;
 *   5. o CI deixa de rodar a guarda de banco (`scripts/compras.sql`).
 *
 * ⚠️ Âncoras literais, sem importar o código auditado (regra 11).
 */
import { readFileSync } from "node:fs";

let falhas = 0;
const ok = (nome: string, cond: boolean, dica = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${dica ? ` — ${dica}` : ""}`); }
};

const store = readFileSync("src/lib/store-org.ts", "utf8");
const congeladas = store.slice(store.indexOf("export const CHAVES_CONGELADAS"), store.indexOf("export const estaCongelada"));
ok("a chave a4p_compras está congelada em store-org", /"a4p_compras"/.test(congeladas),
   "sem o congelamento, a gravação local sobe para org_state e a compra volta a ter duas moradas");

const fonte = readFileSync("src/lib/compras-store.ts", "utf8");
// Cada função do arquivo, do cabeçalho até o próximo cabeçalho.
const funcoes = fonte.split(/\n(?=(?:export )?(?:async )?function |export const )/);
const comGravacao = funcoes.filter((f) => /gravar\(CHAVES_ORG\.compras/.test(f));
ok("há escritor da chave só para a demonstração", comGravacao.length > 0, "a guarda perdeu a âncora");
for (const f of comGravacao) {
  const nome = f.match(/function (\w+)/)?.[1] ?? "?";
  // TODA ocorrência, não só a primeira: uma segunda gravação depois do bloco
  // da demonstração é exatamente o defeito.
  const posicoes = [...f.matchAll(/gravar\(CHAVES_ORG\.compras/g)].map((m) => m.index ?? 0);
  const fora = posicoes.filter((i) => !/if \(isDemo\) \{[^}]*$/.test(f.slice(0, i)));
  ok(`${nome}: grava a chave só dentro de if (isDemo) (${posicoes.length} gravação(ões))`, fora.length === 0,
     "em produção a compra mora em `compras`; gravar a chave aqui seria a segunda morada");
}
ok("produção lê de compras", /\.from\("compras"\)\.select\(/.test(fonte));
ok("produção grava em compras (uma linha por pedido)", /\.from\("compras"\)\.upsert\(/.test(fonte));
ok("produção exclui a compra pela lixeira (exclusão lógica)", /excluirLogico\("compras"/.test(fonte) && /restaurarLogico\("compras"/.test(fonte));
ok("compras-store não toca org_state direto", !/org_state/.test(fonte.replace(/^\s*(\*|\/\/).*$/gm, "")));

const mig = readFileSync("supabase/migrations/20261103200000_compras_morada_unica.sql", "utf8");
ok("migration: escrita exige papel (lancar)", /create policy compras_escrita_exige_papel[\s\S]*?tem_permissao\('lancar'\)/.test(mig));
ok("migration: sem DELETE para o cliente, e a lixeira esconde o excluído",
   /grant select, insert, update on table public\.compras to authenticated;/.test(mig)
   && /create policy compras_esconde_excluido[\s\S]*?using \(excluido_em is null\)/.test(mig));
ok("migration: leitura só da empresa aberta", /using \(org_id = public\.auth_org_id\(\)\)/.test(mig));
ok("migration: trilha", /create trigger zz_auditar_compras/.test(mig));
ok("migration: status e número gerados do documento",
   /status text generated always as \(dados ->> 'status'\) stored/.test(mig)
   && /numero text generated always as \(dados ->> 'numero'\) stored/.test(mig));
ok("migration: número único por empresa", /unique index if not exists compras_numero_unico\s+on public\.compras \(org_id, numero\) where excluido_em is null/.test(mig));
ok("migration: a cópia de org_state não duplica", /where s\.chave = 'a4p_compras'[\s\S]*on conflict do nothing/.test(mig));

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
ok("CI roda a guarda de banco das compras", /-f scripts\/compras\.sql/.test(ci));

if (falhas > 0) {
  console.log(`\n✗ compras-morada: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ compras-morada: a compra mora só em `compras` em produção\n");
