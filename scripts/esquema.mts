/**
 * esquema — A GUARDA DE DIFF: repositório × banco.
 *
 *   npm run esquema        (dentro de npm test e do CI)
 *
 * ⚠️ **A guarda que faltava, e a prova de que faltava.** Onze guardas verdes
 * conviveram com 29 migrations aplicadas sem arquivo, 5 arquivos sem aplicação
 * e o patch `0030b` — que eu mesmo apliquei à mão durante a ONDA 13, com toda a
 * suíte passando. Nenhuma das onze compara código com BANCO: elas comparam
 * código com código e número com número, e o `apply_migration` escreve no
 * servidor sem passar por arquivo nenhum.
 *
 * Esta guarda fecha isso com a mesma invariante do mapa de consolidação:
 * **a dívida existe declarada, ou não existe.**
 *
 *  · Migration aplicada sem arquivo ⇒ tem de estar em `divergencias_conhecidas`
 *    com motivo e DATA-LIMITE. Sem data, "vamos reconstruir" é intenção que
 *    nunca vence.
 *  · Arquivo sem aplicação ⇒ idem, com os objetos ausentes NOMEADOS e o impacto
 *    escrito. Foi assim que se descobriu que a consolidação multiempresa não
 *    tem fonte em produção.
 *  · Divergência não declarada ⇒ REPROVA.
 *  · Data-limite vencida ⇒ REPROVA. Uma dívida com prazo que passou e ninguém
 *    renovou é uma dívida que virou permanente em silêncio.
 *
 * Ela roda OFFLINE, contra o manifesto (`supabase/esquema.json`), porque o CI
 * não tem credencial do banco. O manifesto é atualizado por
 * `npm run esquema:sync`, que exige as credenciais — e é justamente na hora do
 * sync que uma alteração manual aparece e obriga a decisão: vira arquivo, ou
 * vira divergência declarada.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";

const CAMINHO = "supabase/esquema.json";
const DIR = "supabase/migrations";
/** A data de referência vem do manifesto — não do relógio, para o teste ser determinístico. */

interface Divergencia { nome: string; motivo?: string; impacto?: string; reconstruir_ate?: string; resolver_ate?: string; objetos_ausentes?: string[] }
interface Manifesto {
  gerado_em: string;
  contagens: Record<string, number>;
  migrations_aplicadas: string[];
  divergencias_conhecidas: {
    aplicadas_sem_arquivo: Divergencia[];
    arquivo_sem_aplicacao: Divergencia[];
  };
}

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (!cond) { falhas++; console.log(`✗ ${nome}${det ? ` — ${det}` : ""}`); }
};

if (!existsSync(CAMINHO)) {
  console.log(`✗ manifesto ausente (${CAMINHO}). Rode \`npm run esquema:sync\`.`);
  process.exit(1);
}

const m: Manifesto = JSON.parse(readFileSync(CAMINHO, "utf8"));
const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, ""));

const semArquivo = new Map(m.divergencias_conhecidas.aplicadas_sem_arquivo.map((d) => [d.nome, d]));
const semAplicacao = new Map(m.divergencias_conhecidas.arquivo_sem_aplicacao.map((d) => [d.nome, d]));

/* ── 1. Toda migration aplicada tem arquivo, ou é divergência declarada ───── */
const aplicadasSemArquivo = m.migrations_aplicadas.filter((a) => !arquivos.includes(a));
for (const a of aplicadasSemArquivo) {
  ok(`aplicada sem arquivo e SEM declaração: ${a}`, semArquivo.has(a),
     "aplicaram no banco e o repositório não sabe — vire arquivo ou declare a dívida");
}

/* ── 2. Todo arquivo foi aplicado, ou é divergência declarada ─────────────── */
const arquivosSemAplicacao = arquivos.filter((f) => !m.migrations_aplicadas.includes(f));
for (const f of arquivosSemAplicacao) {
  ok(`arquivo sem aplicação e SEM declaração: ${f}`, semAplicacao.has(f),
     "o arquivo existe e o banco não tem — declare com os objetos ausentes e o impacto");
}

/* ── 3. Declaração fantasma: divergência que já não existe ────────────────── */
// ⚠️ Sem isto a lista só cresce: alguém conserta a divergência, esquece de tirar
// a linha, e a próxima pessoa lê uma dívida que não existe mais.
for (const d of semArquivo.keys()) {
  ok(`declaração obsoleta (já tem arquivo): ${d}`, !arquivos.includes(d) || !m.migrations_aplicadas.includes(d),
     "resolvida — remova da lista");
}

/* ── 4. Toda dívida tem MOTIVO e DATA-LIMITE ──────────────────────────────── */
for (const d of [...semArquivo.values()]) {
  ok(`sem motivo: ${d.nome}`, !!d.motivo && d.motivo.length > 10);
  ok(`sem data-limite: ${d.nome}`, !!d.reconstruir_ate);
}
for (const d of [...semAplicacao.values()]) {
  ok(`sem impacto declarado: ${d.nome}`, !!d.impacto && d.impacto.length > 20,
     "'o que o usuário perde' é o que decide a prioridade");
  ok(`sem data-limite: ${d.nome}`, !!d.resolver_ate);
  ok(`objetos ausentes não nomeados: ${d.nome}`, Array.isArray(d.objetos_ausentes));
}

/* ── 5. Data-limite vencida REPROVA ───────────────────────────────────────── */
// ⚠️ A referência é a data de HOJE do sistema. Uma dívida cujo prazo passou e
// ninguém renovou deixou de ser dívida e virou estado permanente — que é
// exatamente como as 29 divergências chegaram até aqui.
const hoje = new Date().toISOString().slice(0, 10);
for (const d of [...semArquivo.values(), ...semAplicacao.values()]) {
  const prazo = d.reconstruir_ate ?? d.resolver_ate ?? "";
  ok(`prazo VENCIDO: ${d.nome} (${prazo})`, !prazo || prazo >= hoje,
     "renove com justificativa ou resolva");
}

/* ── Placar ───────────────────────────────────────────────────────────────── */
const total = m.migrations_aplicadas.length;
console.log(
  `\nesquema: ${total} migrations aplicadas · ${arquivos.length} arquivos · `
  + `${aplicadasSemArquivo.length} sem arquivo · ${arquivosSemAplicacao.length} sem aplicação`
  + ` (manifesto de ${m.gerado_em})`,
);

if (falhas > 0) {
  console.log(`\n✗ ${falhas} DIVERGÊNCIA(S) não declarada(s) entre repositório e banco.\n`);
  process.exit(1);
}
console.log(`✓ TODOS — nenhuma divergência repositório × banco fora do declarado\n`);
