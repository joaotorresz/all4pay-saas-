/**
 * documentos-morada — contratos e a equipe da folha têm UMA morada em
 * produção: a tabela de cada um (Fase 3 do plano, 03/11/2026).
 *
 *   npm run documentos-morada        (dentro de npm test)
 *
 * Os dois saíram da lista inteira em `org_state`, onde a última gravação
 * vencia, para uma linha por item, pelo caminho único `lib/documentos`. Esta
 * guarda reprova se alguém desfizer qualquer metade:
 *
 *   1. a chave antiga deixa de estar CONGELADA em store-org;
 *   2. o módulo da entidade volta a gravar a chave (ou `org_state`) direto, ou
 *      deixa de passar por `documentos("<tabela>", …)`;
 *   3. `lib/documentos` grava a chave fora de `if (isDemo)`, ou deixa de
 *      gravar um item por vez na tabela, ou de excluir pela lixeira;
 *   4. a migration perde o papel, a lixeira, a trilha ou a cópia idempotente;
 *   5. o CI deixa de rodar `scripts/documentos.sql` para a tabela.
 *
 * ⚠️ Âncoras literais, sem importar o código auditado (regra 11).
 */
import { readFileSync } from "node:fs";

let falhas = 0;
const ok = (nome: string, cond: boolean, dica = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${dica ? ` — ${dica}` : ""}`); }
};

const ENTIDADES = [
  { tabela: "contratos", chave: "a4p_contratos", modulo: "src/lib/registros.ts", migration: "20261103210000_contratos_morada_unica" },
  { tabela: "colaboradores", chave: "a4p_colaboradores", modulo: "src/lib/folha.ts", migration: "20261103220000_colaboradores_morada_unica" },
];

const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const store = readFileSync("src/lib/store-org.ts", "utf8");
const congeladas = store.slice(store.indexOf("export const CHAVES_CONGELADAS"), store.indexOf("export const estaCongelada"));
const lib = readFileSync("src/lib/documentos.ts", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");

/* ── o caminho único ─────────────────────────────────────────────────────── */
const libCodigo = semComentario(lib);
const gravacoes = [...libCodigo.matchAll(/gravar\(chaveDemo/g)].map((m) => m.index ?? 0);
ok("lib/documentos: grava a chave da demonstração", gravacoes.length > 0, "a guarda perdeu a âncora");
const fora = gravacoes.filter((i) => !/if \(isDemo\) \{[^}]*$/.test(libCodigo.slice(0, i)));
ok(`lib/documentos: toda gravação da chave está dentro de if (isDemo) (${gravacoes.length})`, fora.length === 0,
   "em produção o item mora na tabela; gravar a chave seria a segunda morada");
ok("lib/documentos: grava UM item por vez na tabela", /\.from\(tabela\)\.upsert\(\{ id: doc\.id, dados: doc \}/.test(libCodigo));
ok("lib/documentos: exclui e restaura pela lixeira", /excluirLogico\(tabela, id, motivo\)/.test(libCodigo) && /restaurarLogico\(tabela, doc\.id\)/.test(libCodigo));
ok("lib/documentos: não toca org_state", !/org_state/.test(libCodigo));

for (const e of ENTIDADES) {
  console.log(`\n${e.tabela}`);
  ok(`a chave ${e.chave} está congelada em store-org`, congeladas.includes(`"${e.chave}"`),
     "sem o congelamento, a gravação local sobe para org_state: duas moradas");
  ok(`lib/documentos declara a tabela ${e.tabela}`, new RegExp(`TabelaDocumento = [^;]*"${e.tabela}"`).test(lib));

  const mod = semComentario(readFileSync(e.modulo, "utf8"));
  ok(`${e.modulo}: passa por documentos("${e.tabela}", …)`, new RegExp(`documentos<\\w+>\\("${e.tabela}"`).test(mod));
  const chaveCrua = new RegExp(`(gravar|ler)(<[^>]*>)?\\((\\s*"${e.chave}"|\\s*CHAVES_ORG\\.${e.tabela}\\b|\\s*K_${e.tabela.toUpperCase()}\\b)`);
  ok(`${e.modulo}: não lê nem grava a chave antiga direto`, !chaveCrua.test(mod),
     "a leitura e a gravação passam por lib/documentos");
  ok(`${e.modulo}: não toca org_state`, !/org_state/.test(mod));

  const mig = readFileSync(`supabase/migrations/${e.migration}.sql`, "utf8");
  ok("migration: escrita exige papel (lancar)", new RegExp(`create policy ${e.tabela}_escrita_exige_papel[\\s\\S]*?tem_permissao\\('lancar'\\)`).test(mig));
  ok("migration: leitura só da empresa aberta", /using \(org_id = public\.auth_org_id\(\)\)/.test(mig));
  ok("migration: sem DELETE para o cliente, e a lixeira esconde o excluído",
     new RegExp(`grant select, insert, update on table public\\.${e.tabela} to authenticated;`).test(mig)
     && new RegExp(`create policy ${e.tabela}_esconde_excluido[\\s\\S]*?using \\(excluido_em is null\\)`).test(mig));
  ok("migration: trilha", new RegExp(`create trigger zz_auditar_${e.tabela}`).test(mig));
  ok("migration: id da linha = id do documento", new RegExp(`constraint ${e.tabela}_id_do_documento check \\(id <> '' and id = dados ->> 'id'\\)`).test(mig));
  ok("migration: a cópia de org_state não duplica", new RegExp(`where s\\.chave = '${e.chave}'[\\s\\S]*on conflict do nothing`).test(mig));
  ok("CI roda a guarda de banco para a tabela", new RegExp(`-v tabela=${e.tabela} -v chave=${e.chave}[^\\n]*-f scripts/documentos\\.sql`).test(ci));
}

if (falhas > 0) {
  console.log(`\n✗ documentos-morada: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ documentos-morada: contratos e equipe da folha moram só nas tabelas em produção\n");
