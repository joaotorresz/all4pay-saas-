/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A GUARDA DA IMPRESSÃO — um PDF de N páginas, não uma fotografia da tela
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O defeito medido: ZERO regras `@media print` no projeto inteiro**, com
 * um botão "Exportar PDF" chamando `window.print()` cru sobre um app cuja raiz
 * é `.a4p-canvas { position: fixed; inset: 0; overflow: hidden }` e cuja área
 * de conteúdo é `overflow-y-auto`. Imprimir isso não gera um documento: gera
 * UMA página com o que coubesse na tela, moldura e menu inclusos. Um DRE de
 * doze meses saía truncado.
 *
 * ⚠️ **É a pior forma de defeito de saída, e é por isso que ele mereceu
 * guarda: o arquivo ABRE.** Não há erro, não há aviso, e os números que
 * aparecem estão certos. O contador recebe um PDF plausível ao qual faltam
 * linhas — e a única forma de perceber é comparar com o XLSX, que ninguém faz.
 *
 * ⚠️ **A asserção que carrega o valor é a que prova o PROIBIDO** (a doutrina do
 * bloco `abertura:`): não basta conferir que a folha de impressão existe — o
 * jeito óbvio de "testar" isto seria procurar `@media print` no CSS, e isso
 * passaria igualzinho se o bloco estivesse vazio ou se uma tela nova voltasse
 * a chamar `window.print()` direto. Então a guarda varre o repositório inteiro
 * exigindo que **nenhuma superfície chame `window.print()` por fora do
 * ajudante** — o caminho que trata o modo escuro e devolve o tema no
 * `afterprint`. Uma chamada crua imprime a folha em branco de quem está no
 * tema escuro, que é um defeito NOVO com a mesma cara de funcionar.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let falhas = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) console.log(`✓ ${nome}`);
  else { falhas++; console.log(`✗ FAIL ${nome}${detalhe ? `\n    ${detalhe}` : ""}`); }
};

function arquivos(dir: string, ext: string[]): string[] {
  const fora: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fora.push(...arquivos(p, ext));
    else if (ext.some((x) => p.endsWith(x))) fora.push(p);
  }
  return fora;
}

const css = readFileSync("src/app/globals.css", "utf8");
/** O bloco de impressão, sem comentários — comentário não é regra. */
const bloco = (() => {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const i = limpo.indexOf("@media print");
  if (i < 0) return "";
  // Casa as chaves do bloco para não colher o CSS que vem depois.
  let nivel = 0, j = limpo.indexOf("{", i);
  const inicio = j;
  for (; j < limpo.length; j++) {
    if (limpo[j] === "{") nivel++;
    else if (limpo[j] === "}") { nivel--; if (nivel === 0) break; }
  }
  return limpo.slice(inicio, j + 1);
})();

console.log("\nA FOLHA DE IMPRESSÃO\n");

ok("impressao: existe um bloco @media print", bloco.length > 0);

/*
 * ⚠️ Os quatro defeitos, um a um. Cada linha aqui corresponde a uma coisa que
 * o papel fazia errado — e o teste é sobre o EFEITO (a propriedade que desfaz
 * o recorte), não sobre o texto do seletor, que alguém pode renomear.
 */
ok("impressao: a raiz fixa vira fluxo normal (senão imprime UMA dobra)",
   /\.a4p-canvas\s*\{[^}]*position:\s*static/.test(bloco),
   "`.a4p-canvas` é `fixed inset-0 overflow-hidden`: em papel isso é uma tesoura");

ok("impressao: a área que rola deixa de rolar (senão o resto do relatório não existe)",
   /overflow-y-auto[\s\S]{0,240}overflow:\s*visible/.test(bloco),
   "sem isto, só a primeira dobra da tabela chega à folha");

ok("impressao: o cabeçalho da tabela REPETE em cada página",
   /thead\s*\{[^}]*table-header-group/.test(bloco),
   "`position: sticky` resolve a tela e não repete no papel — a página 3 sairia sem dizer de que mês é cada coluna");

for (const alvo of [".a4p-topbar", ".a4p-sidebar", ".a4p-ia-fab", "[data-nao-imprime]"])
  ok(`impressao: ${alvo} fica fora do papel`, bloco.includes(alvo));

ok("impressao: linha de valor não é partida entre duas folhas",
   /break-inside:\s*avoid/.test(bloco),
   "metade do número numa página e metade na outra é a linha que se soma errado");

/* ─────────────────────────────────────────────────────────────────────────
   TETO ZERO — a asserção que prova o PROIBIDO.
   ───────────────────────────────────────────────────────────────────────── */
const AJUDANTE = "src/lib/imprimir.ts";
const CRU = /window\.print\s*\(/;
const cruas: string[] = [];
for (const f of arquivos("src", [".ts", ".tsx"])) {
  if (f.replace(/\\/g, "/") === AJUDANTE) continue;
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (CRU.test(src)) cruas.push(f);
}
ok("impressao: nenhuma tela chama window.print() por fora do ajudante",
   cruas.length === 0,
   cruas.length ? `${cruas.join(", ")} — use \`imprimirRelatorio\` (lib/imprimir): a chamada crua imprime a folha EM BRANCO para quem está no tema escuro` : "");

/* ⚠️ E o ajudante tem de continuar fazendo as duas coisas pelas quais existe.
   Sem estas, alguém "simplifica" o arquivo para um `window.print()` de uma
   linha, a guarda acima continua verde, e o defeito do tema escuro volta. */
const aj = readFileSync(AJUDANTE, "utf8");
ok("impressao: o ajudante desliga o tema escuro (senão a folha sai em branco)",
   /classList\.remove\(["']dark["']\)/.test(aj),
   "a impressão descarta FUNDO e mantém a COR DO TEXTO: texto quase branco sobre folha branca");
ok("impressao: o ajudante devolve o tema no afterprint, não na linha seguinte",
   /addEventListener\(\s*["']afterprint["']/.test(aj),
   "`window.print()` retorna antes de a pessoa decidir: restaurar na linha seguinte escurece a pré-visualização");

/* ─────────────────────────────────────────────────────────────────────────
   O CABEÇALHO DO DOCUMENTO — identificação, não decoração.
   ───────────────────────────────────────────────────────────────────────── */
const cab = readFileSync("src/components/relatorios/CabecalhoImpressao.tsx", "utf8");
for (const [campo, padrao] of [
  ["empresa", /empresa/i],
  ["período", /Período/],
  ["regime", /Regime/],
  ["data de geração", /Gerado em/],
] as [string, RegExp][])
  ok(`impressao: o cabeçalho identifica ${campo}`, padrao.test(cab));

/* ⚠️ DISCRIMINA: o cabeçalho tem de estar MONTADO na tela do relatório. Um
   componente perfeito que ninguém renderiza passa em toda asserção acima e
   não põe uma letra no papel. */
const tela = readFileSync("src/components/relatorios/DemonstrativoView.tsx", "utf8");
ok("impressao: a tela do DRE/DFC monta o cabeçalho do documento",
   /<CabecalhoImpressao/.test(tela));
ok("impressao: o cabeçalho recebe o regime que a tela apura",
   /regime=\{tipo === "dre" \? "competencia" : "caixa"\}/.test(tela),
   "o MESMO mês tem dois resultados legítimos; dois PDFs sem o regime parecem um erro do sistema");

/* ⚠️ E ele NÃO aparece na tela: lá empresa/período/regime já estão na
   interface, e repeti-los seria ruído em toda visita para servir à impressão. */
ok("impressao: o cabeçalho do documento não aparece na tela",
   /\[data-imprimir-cabecalho\]\s*\{\s*display:\s*none/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));

/* ─────────────────────────────────────────────────────────────────────────
   O RAZÃO — o documento que o contador pede PRIMEIRO.
   ⚠️ Ele não tinha exportação nenhuma: nem planilha, nem papel.
   ───────────────────────────────────────────────────────────────────────── */
const razao = readFileSync("src/components/razao/RazaoView.tsx", "utf8");
ok("impressao: o razão exporta em papel e em planilha",
   /imprimirRelatorio/.test(razao) && /baixarXLSX/.test(razao));
ok("impressao: o razão monta o cabeçalho do documento", /<CabecalhoImpressao/.test(razao));

/* ⚠️ A asserção que DISCRIMINA no razão: as linhas de débito e crédito só
   existem no DOM quando o lançamento está aberto, e são elas que fazem do
   razão um razão. Sem abrir tudo antes, o papel sai com uma lista de
   descrições — um extrato, não a partida dobrada. CSS não resolve: ele não
   revela o que não foi renderizado. */
ok("impressao: o razão ABRE os lançamentos antes de imprimir",
   /addEventListener\(\s*["']beforeprint["']/.test(razao),
   "imprimir com tudo fechado entrega descrições sem débito nem crédito");

/* ⚠️ E o corte da tela não pode virar corte do documento. */
ok("impressao: a exportação do razão leva TODOS, não os da tela",
   /for \(const e of entries \?\? \[\]\)/.test(razao),
   "exportar o recorte da tela entrega um razão incompleto com cara de completo");
ok("impressao: a tela DIZ que está mostrando só os primeiros",
   /mostrando os \{TETO_TELA\} primeiros/.test(razao),
   "um razão a que faltam linhas não parece quebrado — parece um razão");

console.log(
  falhas === 0
    ? `\n✓ TODOS — a folha de impressão desfaz o recorte, repete o cabeçalho e identifica o documento\n`
    : `\n✗ ${falhas} problema(s) na saída impressa\n`,
);
if (falhas > 0) process.exit(1);
