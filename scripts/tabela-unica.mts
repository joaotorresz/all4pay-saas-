/**
 * tabela-unica — toda lista em linhas sai da peça do DS (`ui/Tabela`).
 *
 *   npm run tabela-unica        (dentro de npm test)
 *
 * Decisão do plano (Fase 3.2, 03/11/2026): um componente de tabela único, com
 * cartão no celular. Cada `<table>` escrita à mão numa tela é uma tabela que
 * no telefone rola de lado e esconde a coluna que responde a pergunta.
 *
 * A guarda conta as `<table` escritas fora de `components/ui/Tabela.tsx`. O
 * TETO só desce: passar dele reprova (tabela nova à mão), e ficar abaixo dele
 * também reprova até alguém baixar o número aqui (senão a folga deixaria a
 * próxima tabela à mão entrar calada).
 *
 * As que ficam de fora estão em EXCECOES, com o motivo.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Começou em 36 (03/11/2026) e chegou a ZERO no mesmo PR: todas as listas
// viraram <Tabela>. As três matrizes que ficam estão em EXCECOES, com motivo.
const TETO = 0;

/** Tabelas que NÃO viram cartão, com o motivo. Não contam no teto. */
const EXCECOES: Record<string, string> = {
  "src/components/ui/Tabela.tsx": "é a própria peça",
  "src/components/design-system/VitrineDesign.tsx": "a vitrine mostra a tabela crua do DS como amostra de tokens",
  "src/components/app/ExtratoContato.tsx": "é o DOCUMENTO que vai ao papel (impressão em modo documento); não aparece na tela",
  "src/components/relatorios/kit.tsx": "DRE e relatórios em MATRIZ (linha × mês, com sub-colunas por período e coluna fixa): no celular rola de lado com a categoria presa",
  "src/components/contas-pagar/AgingContasPagar.tsx": "matriz de faixas de vencimento com cabeçalho em dois níveis; o cartão perderia a leitura por faixa",
};

const contagem: { arquivo: string; n: number }[] = [];
const varrer = (dir: string) => {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) { varrer(p); continue; }
    if (!p.endsWith(".tsx")) continue;
    const arq = p.replace(/\\/g, "/");
    if (EXCECOES[arq]) continue;
    const n = (readFileSync(p, "utf8").match(/<table[\s>]/g) ?? []).length;
    if (n > 0) contagem.push({ arquivo: arq, n });
  }
};
varrer("src/components");
varrer("src/app");

const total = contagem.reduce((s, c) => s + c.n, 0);
for (const c of contagem.sort((a, b) => b.n - a.n)) console.log(`  ${c.n}  ${c.arquivo}`);
console.log(`\ntabela-unica: ${total} tabela(s) escrita(s) à mão fora da peça · teto ${TETO}`);

const peca = readFileSync("src/components/ui/Tabela.tsx", "utf8");
let falhas = 0;
if (!/sm:hidden/.test(peca) || !/hidden sm:block/.test(peca)) {
  falhas++;
  console.log("✗ a peça perdeu o cartão do celular (sm:hidden / hidden sm:block)");
}
if (!/tabIndex: 0/.test(peca) || !/e\.key === "Enter"/.test(peca)) {
  falhas++;
  console.log("✗ a linha clicável da peça perdeu o teclado (foco e Enter): quem não usa o mouse não abre a linha");
}
// O adaptador da lista de cadastros só traduz colunas: quem desenha é a peça. Um segundo desenho de cartão ao
// lado dela seria a segunda fonte do mesmo fato visual.
for (const arq of ["src/components/registros/kit.tsx"]) {
  const x = readFileSync(arq, "utf8");
  if (!/<Tabela\b/.test(x) || /lg:hidden|function CartaoDeLinha/.test(x)) {
    falhas++;
    console.log(`✗ ${arq} voltou a desenhar a própria lista em vez de passar pela <Tabela>`);
  }
}
// Exceção sem motivo, ou que deixou de ter tabela, também reprova.
for (const [arq, motivo] of Object.entries(EXCECOES)) {
  let texto = "";
  try { texto = readFileSync(arq, "utf8"); } catch { /* sumiu */ }
  if (!motivo.trim() || !/<table[\s>]/.test(texto)) {
    falhas++;
    console.log(`✗ a exceção ${arq} não tem mais tabela (ou não tem motivo): tire-a de EXCECOES`);
  }
}
if (total > TETO) {
  falhas++;
  console.log(`✗ ${total - TETO} tabela(s) nova(s) escrita(s) à mão: monte com <Tabela> de @/components/ui`);
} else if (total < TETO) {
  falhas++;
  console.log(`✗ o teto ficou folgado: baixe TETO para ${total} em scripts/tabela-unica.mts`);
}
if (falhas > 0) process.exit(1);
console.log("✓ nenhuma tabela nova à mão; o teto está justo\n");
