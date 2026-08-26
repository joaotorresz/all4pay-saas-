/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATA NA TELA É EM PORTUGUÊS — ISO é o formato do FIO, não o da leitura
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `2026-08-01` é como a data viaja: coluna do banco, `value` de `<input
 * type="date">`, chave de JSON. **Não é como ela se lê.** Quem opera o caixa
 * escreve 01/08/2026, e quem recebe o arquivo do contador também.
 *
 * ⚠️ **O pior caso medido não estava na tela — estava no ARQUIVO.** O cabeçalho
 * da exportação para o contador saía com
 * `Período: 2026-08-01 a 2026-08-31` e `Gerado em: 2026-08-25T19:00:00.000Z`:
 * um carimbo de máquina, com fuso Z, num documento que sai da empresa. Ali o
 * defeito não é estético — é a primeira coisa que o contador lê para saber se
 * o período confere com o que ele pediu.
 *
 * Duas asserções, e elas cobrem coisas diferentes:
 *
 *   1. **VALOR** — o cabeçalho e as colunas de data da exportação saem em
 *      `dd/mm/aaaa`. É a que protege o arquivo; um `grep` não a alcança,
 *      porque a formatação acontece dentro do módulo.
 *   2. **VARREDURA, teto ZERO** — nenhuma tela imprime um intervalo ISO como
 *      texto. `value=` de campo de data fica de fora de propósito: ali o ISO é
 *      o contrato do elemento, e reprovar isso seria reprovar o certo.
 *
 * ⚠️ A canária é uma **amostra plantada aqui dentro**, não "o padrão casa com
 * algum arquivo do produto": essa forma reprova justamente no dia em que a
 * última ocorrência é corrigida — foi o que aconteceu com a guarda da baixa.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { planilhasDaExportacao } from "@/core/exportacao/planilha";
import type { Exportacao } from "@/core/exportacao";

let falhas = 0;
const ok = (t: string, cond: boolean, detalhe = "") => {
  console.log(`${cond ? "✓" : "✗"} ${t}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas++;
};

/* ═══════════════════ 1 · VALOR — o arquivo do contador ═══════════════════ */

console.log("\n── 1 · o arquivo sai em dd/mm/aaaa ──");

const exp: Exportacao = {
  cabecalho: {
    empresa: "Fixture Ltda", cnpj: null, regimeTributario: null,
    regime: "competencia", periodoDe: "2026-08-01", periodoAte: "2026-08-31",
    geradoEm: "2026-08-25T19:04:00.000Z", visao: "com-previsto", incluiCancelados: false,
  },
  razao: [{
    movimentoId: "m1", competencia: "2026-08-03", caixa: "2026-08-05",
    descricao: "Venda", contraparte: "Alpha", categoria: "Vendas",
    linhaDreId: "receita_bruta", linhaDre: "Receita Bruta Operacional",
    valor: 100, valorLancamento: 100, tipo: "entrada", origem: "manual",
    situacao: "baixado", lancadoPor: "", conta: "", projeto: "", centro: "",
    noDre: true, motivoFora: "",
  }],
  dre: [{ id: "receita_bruta", label: "Receita Bruta Operacional", nivel: 1, sinal: "+", tipo: "soma", valor: 100, av: null }],
  resumo: { movimentos: 1, movimentosNoDre: 1, movimentosForaDoDre: 0, cancelados: 0, totalRazao: 100, resultado: 100 },
};

const planilhas = planilhasDaExportacao(exp);
const texto = JSON.stringify(planilhas);

const periodo = planilhas[0].linhas.find((l) => l[0] === "Período")?.[1];
ok("cabeçalho · o período sai em português", periodo === "01/08/2026 a 31/08/2026", String(periodo));

const gerado = String(planilhas[0].linhas.find((l) => l[0] === "Gerado em")?.[1] ?? "");
/*
 * ⚠️ A primeira versão desta asserção cobrava `!gerado.includes("T")` para pegar
 * o separador do ISO — e reprovou o carimbo CERTO, porque `(UTC)` tem um "T".
 * Guarda que reprova o correto é desligada na primeira semana. O alvo é a
 * FORMA do ISO (`aaaa-mm-ddT`), não a letra solta.
 */
ok("cabeçalho · o carimbo de geração não é um timestamp ISO",
   /^\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/.test(gerado) && !/\d{4}-\d{2}-\d{2}T/.test(gerado), gerado);

const cab = planilhas[0].linhas.findIndex((l) => l[0] === "Competência");
ok("razão · a competência sai em português", planilhas[0].linhas[cab + 1]?.[0] === "03/08/2026",
   String(planilhas[0].linhas[cab + 1]?.[0]));
ok("razão · a data de caixa sai em português", planilhas[0].linhas[cab + 1]?.[1] === "05/08/2026",
   String(planilhas[0].linhas[cab + 1]?.[1]));

/*
 * ⚠️ A asserção que vale mais que as quatro acima: NENHUMA data ISO sobrou no
 * arquivo. As individuais dizem que os campos que eu lembrei estão certos;
 * esta pega o campo que eu esquecer amanhã.
 */
const sobrouISO = texto.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
ok("nenhuma data ISO sobrou em lugar nenhum do arquivo", sobrouISO.length === 0,
   sobrouISO.slice(0, 5).join(" · "));

/* ═══════════════ 2 · VARREDURA — teto ZERO, com amostra ══════════════════ */

console.log("\n── 2 · nenhuma tela imprime intervalo ISO como texto ──");

/**
 * O alvo é o INTERVALO impresso como texto: `{x.de} a {x.ate}` na JSX, ou
 * `${x.de} → ${x.ate}` num literal. Foram as duas formas medidas — a tela de
 * exportação e a planilha de orçamentos.
 */
const ALVO = /[{`$]\s*[\w.]*\.(de|ate|periodoDe|periodoAte)\s*\}?[^`\n{]{1,12}[{$]\{?\s*[\w.]*\.(ate|periodoAte|de|periodoDe)\s*\}/;

const AMOSTRA = '<p>{intervalo.de} a {intervalo.ate}</p>';

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome)) out.push(p);
  }
  return out;
}

/**
 * ⚠️ **UMA EXCEÇÃO, DECLARADA COM MOTIVO — e ela não é indulgência.**
 *
 * `api/exportar/route.ts` monta o NOME DO ARQUIVO com o intervalo em ISO. Ali o
 * ISO é o certo por duas razões, e as duas são fortes: `dd/mm/aaaa` tem BARRA,
 * que é separador de caminho e ilegal em nome de arquivo na maioria dos
 * sistemas; e o ISO ordena sozinho na pasta do contador, que guarda um arquivo
 * por mês. Nome de arquivo não é prosa.
 */
const DECLARADOS: { arquivo: string; porque: string }[] = [
  {
    arquivo: "src/app/api/exportar/route.ts",
    porque: "o intervalo vai no NOME DO ARQUIVO — barra é ilegal em nome, e o ISO ordena na pasta",
  },
];
const declarado = new Set(DECLARADOS.map((d) => d.arquivo));

const varridos = arquivos("src");
const achados: string[] = [];
for (const f of varridos) {
  if (declarado.has(f)) continue;
  // Comentários fora: este repositório documenta cada defeito citando o código
  // que o causou, e a guarda reprovaria a própria explicação.
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (ALVO.test(src)) achados.push(f);
}
for (const a of achados) {
  console.log(`   ✗ intervalo ISO impresso como texto: ${a}`);
  console.log("     Passe pelo `dataBR` (tela) ou pelo formatador do módulo (arquivo).");
}
ok("teto ZERO de intervalo ISO na interface", achados.length === 0, `${achados.length} arquivo(s)`);
ok("a amostra plantada casa — o padrão não ficou cego", ALVO.test(AMOSTRA));
/*
 * ⚠️ Declaração órfã é declaração que sobreviveu ao arquivo — ela silenciaria
 * um caso futuro de mesmo nome sem ninguém perceber.
 */
const orfas = DECLARADOS.filter((d) => {
  try { readFileSync(d.arquivo, "utf8"); return false; } catch { return true; }
});
ok("nenhuma exceção declarada aponta para arquivo que não existe", orfas.length === 0,
   orfas.map((d) => d.arquivo).join(", "));
ok("a varredura olhou o produto inteiro", varridos.length > 300, `${varridos.length} arquivos`);

console.log(
  falhas === 0
    ? `\n✓ TODOS — data na tela e no arquivo em português · ${varridos.length} arquivos varridos\n`
    : `\n✗ ${falhas} falha(s) no formato de data\n`,
);
process.exit(falhas === 0 ? 0 : 1);
