/**
 * contador-optin — quem confirma o e-mail do contador é o contador
 * (Fase 3.4 do plano, 04/11/2026).
 *
 *   npm run contador-optin        (dentro de npm test)
 *
 * O pacote de NFs leva a escrituração fiscal da empresa. Em produção nada
 * mandava o link de confirmação; agora a rota manda, e só o clique no link
 * marca o e-mail como confirmado. A guarda reprova se alguém desfizer:
 *
 *   VALOR
 *   1. em produção o "verificado" sai SÓ da confirmação do mesmo destinatário
 *      com o mesmo e-mail (o campo gravado na lista é ignorado; trocar o
 *      e-mail exige confirmar de novo);
 *   2. o interruptor só liga com o valor exato "ligado".
 *
 *   FORMA
 *   3. UM escritor de confirmado_em: a rota do link (teto zero fora dela);
 *   4. o token nunca sai: nenhuma resposta da rota de pedido o traz e o app
 *      não o lê;
 *   5. a rota de pedido confere o interruptor e o papel de lançar;
 *   6. a migration não dá ao app o token nem escrita; o CI roda a guarda de
 *      banco; o interruptor aparece na área da plataforma.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { mesclarConfirmacoes, optinContadorLigado } from "@/core/contabilidade/optin";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${det ? ` — ${det}` : ""}`); }
};

console.log("\nvalor");
const dest = { id: "d1", email: "contador@escritorio.test", verificado: true, criadoEm: "2026-11-01", verificadoEm: "2026-11-01" };
ok("1. o 'verificado' gravado na lista, sem confirmação, NÃO vale",
   mesclarConfirmacoes([dest], [])[0].verificado === false);
ok("1. confirmação do mesmo destinatário e e-mail vale, com a data do clique",
   (() => { const r = mesclarConfirmacoes([dest], [{ dest_id: "d1", email: "Contador@Escritorio.test", pedido_em: "2026-11-02T10:00:00Z", confirmado_em: "2026-11-02T11:00:00Z" }])[0];
     return r.verificado === true && r.verificadoEm === "2026-11-02T11:00:00Z"; })());
ok("1. confirmação de OUTRO e-mail não vale (trocou o e-mail, confirma de novo)",
   mesclarConfirmacoes([dest], [{ dest_id: "d1", email: "antigo@escritorio.test", pedido_em: "2026-11-02T10:00:00Z", confirmado_em: "2026-11-02T11:00:00Z" }])[0].verificado === false);
ok("1. pedido sem clique fica pendente, com a data do link",
   (() => { const r = mesclarConfirmacoes([dest], [{ dest_id: "d1", email: dest.email, pedido_em: "2026-11-02T10:00:00Z", confirmado_em: null }])[0];
     return r.verificado === false && r.linkPedidoEm === "2026-11-02T10:00:00Z"; })());
ok("2. o interruptor só liga com 'ligado'",
   optinContadorLigado({ CONTADOR_OPTIN: "ligado" }) && !optinContadorLigado({ CONTADOR_OPTIN: "true" }) && !optinContadorLigado({}));

console.log("\nforma");
const arquivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROTA_LINK = "src/app/api/contador/confirmar/route.ts";
const escritores = arquivos("src").filter((p) => {
  const t = semComentario(readFileSync(p, "utf8"));
  return /contador_confirmacoes/.test(t) && /confirmado_em:(?!\s*(?:null|string)\b)/.test(t);
});
ok("3. só a rota do link grava confirmado_em", escritores.length === 1 && escritores[0] === ROTA_LINK, escritores.join(", "));

const pedido = semComentario(readFileSync("src/app/api/contador/confirmacao/route.ts", "utf8"));
// Cada chamada de resposta, do parêntese até o fim da instrução (`);`).
const respostas = Array.from(pedido.matchAll(/resposta\(\d+,[\s\S]*?\}\);/g)).map((m) => m[0]);
ok("4. nenhuma resposta da rota de pedido traz o token", respostas.length >= 5 && respostas.every((r) => !/token/i.test(r)));
const store = semComentario(readFileSync("src/lib/contabilidade-store.ts", "utf8"));
ok("4. o app lê só as colunas da situação", /\.select\("dest_id, email, pedido_em, confirmado_em"\)/.test(store) && !/token/.test(store));
const view = semComentario(readFileSync("src/components/contabilidade-export/EnvioNFsView.tsx", "utf8"));
ok("1. a tela de produção usa mesclarConfirmacoes", /\(ENVIO_SIMULADO \?[\s\S]{0,140}: mesclarConfirmacoes\(cadastrados, confirmacoes\)\)/.test(view));

const iLig = pedido.indexOf("if (!optinContadorLigado())");
const iPerm = pedido.indexOf('s.rpc("tem_permissao", { p_acao: "lancar" })');
const iGrava = pedido.indexOf('.from("contador_confirmacoes").upsert(');
ok("5. a rota confere o interruptor e o papel ANTES de gravar", iLig > -1 && iPerm > iLig && iGrava > iPerm);

const mig = readFileSync("supabase/migrations/20261104130000_contador_confirmacoes.sql", "utf8");
ok("6. a migration dá ao app só as colunas da situação",
   /grant select \(org_id, dest_id, email, pedido_em, confirmado_em\) on table public\.contador_confirmacoes to authenticated;/.test(mig)
   && !/grant[^;]*(insert|update|delete)[^;]*to authenticated/.test(mig));
ok("6. o CI roda a guarda de banco", /-f scripts\/contador-optin\.sql/.test(readFileSync(".github/workflows/ci.yml", "utf8")));
ok("6. o interruptor aparece na área da plataforma",
   /id: "contador_optin"/.test(readFileSync("src/core/interruptores/index.ts", "utf8"))
   && /contador_optin: !optinContadorLigado\(env\)/.test(readFileSync("src/lib/interruptores.ts", "utf8")));

if (falhas > 0) {
  console.log(`\n✗ contador-optin: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ contador-optin: só o clique do contador confirma o e-mail\n");
