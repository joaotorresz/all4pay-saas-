/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRANSCRIÇÃO NÃO É FATO — nenhum palpite nasce confirmado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O defeito, medido:** `movements.review_status` tinha
 * `DEFAULT 'confirmado'` e o caminho do OCR gravava sem defini-lo. Uma foto ruim
 * virava lançamento CONFIRMADO no DRE de um cliente, sem passar pela fila de
 * revisão e sem nenhuma marca de baixa confiança. Foi assim que
 * `"! [=]E?s rica NE Bro,"`, com vencimento de 2023, chegou ao topo da Central.
 *
 * É a família de "inventar procedência" e "inventar autoria", com a diferença
 * que aqui o palpite entra como dinheiro.
 *
 * ⚠️ **DEFAULT QUE DECIDE CONFIANÇA É DECISÃO ESCONDIDA NUMA COLUNA.** Quem
 * escreve sabe se produziu AFIRMAÇÃO ou PALPITE; o default tirava a pergunta de
 * quem tinha a resposta e respondia sozinho, sempre pelo lado otimista.
 *
 * Esta guarda cobre a metade de CÓDIGO. A de BANCO — o default removido e o
 * gatilho que recusa — vive em `scripts/transcricao.sql`, no job de isolamento.
 * Uma sem a outra deixa metade do caminho descoberta: o banco alcança a RPC e o
 * `psql` na mão; o código pega o erro antes de alguém subir uma foto.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let falhas = 0;
const ok = (t: string, cond: boolean, detalhe = "") => {
  console.log(`${cond ? "✓" : "✗"} ${t}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas++;
};

/** As origens que ADIVINHAM. As demais são afirmação de alguém. */
const ADIVINHAM = ["importacao", "extrato", "conciliacao"];

const INSERT = /from\(["']movements["']\)[\s\S]{0,400}?\.(?:insert|upsert)\(/;

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome)) out.push(p);
  }
  return out;
}

/** Comentários fora ANTES da busca — este repositório documenta cada defeito
 *  citando o código que o causou, e a guarda reprovaria a própria explicação. */
const semComentario = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ══════════ 1 · TETO ZERO — todo escritor DIZ, nenhum herda default ══════ */

console.log("\n── 1 · todo insert em `movements` declara `review_status` ──");

const varridos = arquivos("src");
const mudos: string[] = [];
for (const f of varridos) {
  const src = semComentario(readFileSync(f, "utf8"));
  if (!INSERT.test(src)) continue;
  if (!src.includes("review_status")) mudos.push(f);
}
for (const m of mudos) {
  console.log(`   ✗ escritor MUDO: ${m}`);
  console.log("     Sem `review_status` a linha nasce pelo que o banco decidir — e era");
  console.log("     `confirmado`. Diga: afirmação → `confirmado`; palpite → `pendente`.");
}
ok("teto ZERO de escritor mudo", mudos.length === 0, `${mudos.length} arquivo(s)`);

/*
 * ⚠️ A canária é SINTÉTICA. "O padrão casa com algum arquivo" reprovaria
 * justamente no dia em que o último escritor mudo é corrigido — foi o que
 * aconteceu com a guarda da baixa.
 */
const AMOSTRA = 'await s.from("movements").insert({ origem: "manual", amount: 1 });';
ok("a amostra plantada casa — o padrão não ficou cego",
   INSERT.test(AMOSTRA) && !AMOSTRA.includes("review_status"));

/* ═══════ 2 · VALOR — o que ADIVINHA não se declara confirmado ════════════ */

console.log("\n── 2 · nenhuma origem de palpite se declara confirmada ──");

const errados: string[] = [];
for (const f of varridos) {
  const src = semComentario(readFileSync(f, "utf8"));
  if (!INSERT.test(src)) continue;
  for (const o of ADIVINHAM) {
    // origem de palpite e `confirmado` no MESMO objeto de insert (600 chars).
    const juntos = new RegExp(
      `origem:\\s*["']${o}["'][\\s\\S]{0,600}?review_status:\\s*["']confirmado["']`
      + `|review_status:\\s*["']confirmado["'][\\s\\S]{0,600}?origem:\\s*["']${o}["']`,
    );
    if (juntos.test(src)) errados.push(`${f} (origem: ${o})`);
  }
}
for (const e of errados) console.log(`   ✗ palpite nascendo confirmado: ${e}`);
ok("teto ZERO de palpite confirmado na origem", errados.length === 0, `${errados.length}`);

/* O caminho do OCR, nomeado: é dele que veio o defeito. */
const ocr = semComentario(readFileSync("src/lib/upload-doc.ts", "utf8"));
ok("o caminho do OCR declara `pendente`",
   /origem:\s*["']importacao["'][\s\S]{0,600}?review_status:\s*["']pendente["']/.test(ocr));

/* ══════════════════════ 3 · TESTE NEGATIVO ══════════════════════════════ */

console.log("\n── 3 · TESTE NEGATIVO: os dois defeitos, plantados ──");
{
  const mudo = 'await s.from("movements").insert({ origem: "importacao", amount: 1 });';
  ok("um escritor mudo REPROVA, e a asserção o nomeia",
     INSERT.test(mudo) && !mudo.includes("review_status"));

  const confirmado =
    'await s.from("movements").insert({ origem: "importacao", review_status: "confirmado", amount: 1 });';
  const pega = new RegExp(
    `origem:\\s*["']importacao["'][\\s\\S]{0,600}?review_status:\\s*["']confirmado["']`,
  );
  ok("OCR nascendo confirmado REPROVA", pega.test(confirmado));
  ok("e o caminho CERTO não reprova",
     !pega.test('insert({ origem: "importacao", review_status: "pendente", amount: 1 })'));
}

console.log(
  falhas === 0
    ? `\n✓ TODOS — transcrição entra como suspeita · ${varridos.length} arquivos varridos\n`
    : `\n✗ ${falhas} falha(s): há palpite entrando como fato\n`,
);
process.exit(falhas === 0 ? 0 : 1);
