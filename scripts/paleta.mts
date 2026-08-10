/**
 * A GUARDA DA PALETA — `npm run paleta`.
 *
 * ⚠️ "Nenhuma página ou elemento fora do design system" só é uma regra se
 * alguém puder reprovar quem sai dela. Sem guarda, a frase é intenção: a
 * primeira tela nova traz um hex conveniente, ninguém vê no diff, e seis
 * meses depois o sistema tem quarenta cinzas. Foi assim que as semânticas
 * neon entraram por uma janela do Laboratório e repintaram o produto inteiro.
 *
 * O que ela cobra, e por que cada item existe:
 *
 *  1. NENHUM HEX FORA DA PALETA em `src/**`. As nove cores nomeadas + as três
 *     semânticas + os stops do degradê + o punhado de exceções declaradas
 *     abaixo. Qualquer outro hex reprova, com arquivo e linha.
 *  2. NENHUM `#fff`/`#ffffff` E NENHUM `#000`/`#000000` no app. O branco é
 *     sempre quente e o preto é sempre quente — esta é a regra que o guia
 *     enuncia primeiro, e é a mais fácil de furar sem querer, porque `#fff`
 *     é o que os dedos escrevem sozinhos.
 *  3. O ESPELHO BATE. `:root`, `.ds-visor` e os `DEFAULT_CORES` do
 *     Laboratório têm de carregar os MESMOS valores. Quando divergem, o Lab
 *     repinta o app com valores que ninguém escolheu — já aconteceu.
 *
 * Não é uma varredura de "cores bonitas": é a diferença entre um sistema e
 * uma coleção de telas parecidas.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const SRC = join(RAIZ, "src");

/** As NOVE cores nomeadas do guia. */
const PALETA = new Map<string, string>([
  ["#fefdf0", "White"],
  ["#eeeddb", "Beige"],
  ["#dddcc5", "Dark Beige"],
  ["#534d41", "Grey"],
  ["#37332a", "Dark Grey"],
  ["#28211b", "Black"],
  ["#a9a6a4", "Placeholder"],
  ["#d4d3d1", "Border"],
  ["#c8d930", "Accent"],
]);

/*
 * ⚠️ AS SUPERFÍCIES DE TRABALHO. A tabela de marca descreve a IDENTIDADE
 * (branco quente + bege + preto quente); estas três descrevem a MOLDURA e a
 * ÁREA onde o operador passa o dia, e foram escolhidas no Laboratório com a
 * tela na frente. Ficam nomeadas aqui, e não soltas como "exceção", porque
 * são estruturais: qualquer tela nova as consome pelos tokens.
 */
const SUPERFICIES = new Set([
  "#2c251e", // moldura escura do app
  "#f1f3f6", // área de trabalho / chips
  "#ffffff", // superfície do card — ver a nota no bloco de branco/preto
]);

/** Stops do degradê da marca — fazem parte da identidade, não são avulsos. */
const DEGRADE = new Set(["#fffad7", "#ffefa2", "#dbff4d"]);

/**
 * ⚠️ EXCEÇÕES DECLARADAS, cada uma com o motivo escrito. Uma exceção sem
 * motivo é um vazamento com aparência de decisão — e a lista existe
 * justamente para que a próxima pessoa saiba o que pode e o que não pode
 * crescer aqui.
 */
const EXCECOES = new Map<string, string>([
  ["#2cd662", "semântica: positivo — a paleta de marca não tem verde de estado"],
  ["#d62c2c", "semântica: negativo — a paleta de marca NÃO TEM vermelho, e um ERP precisa de um"],
  ["#f45900", "semântica: atenção"],
  ["#a45c15", "semântica: atenção (variante do escopo .ds-visor)"],
  ["#57a877", "semântica: positivo no tema escuro"],
  ["#d8584c", "semântica: negativo no tema escuro"],
  ["#f0962e", "semântica: atenção no tema escuro"],
  ["#4be200", "verde-lima de estado do guia — marca/preenchimento, nunca texto"],
  ["#1c1712", "moldura do tema escuro: Black quente rebaixado, para o cartão continuar lendo como a peça de cima"],
  ["#141013", "sombra do tema escuro"],
  ["#000000", "marketing: black-pure e o hero glow — proibido no app, permitido no token que o nomeia"],
  ["#4b4d3d", "marketing: hero glow"],
  /*
   * MARCA DE TERCEIRO — a única família que não PODE sair da paleta, porque
   * não é nossa. Repintar os cinco bancos com o acento faria todos virarem o
   * mesmo ponto, e o ponto existe para distinguir a conta de relance.
   */
  ["#ec7000", "marca de terceiro: Itaú"],
  ["#cc092f", "marca de terceiro: Bradesco"],
  ["#820ad1", "marca de terceiro: Nubank"],
  ["#ff7a00", "marca de terceiro: Inter"],
  ["#ec0000", "marca de terceiro: Santander"],
]);

const permitido = (hex: string) =>
  PALETA.has(hex) || DEGRADE.has(hex) || SUPERFICIES.has(hex) || EXCECOES.has(hex);

interface Achado { arquivo: string; linha: number; hex: string; trecho: string }

/** Arquivos que declaram a paleta — nestes o hex é a definição, não um vazamento. */
const DECLARAM = ["src/app/globals.css", "src/components/app/DesignLab.tsx"];

function varrer(dir: string, saida: string[]) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) varrer(caminho, saida);
    else if (/\.(tsx?|css)$/.test(nome)) saida.push(caminho);
  }
}

const arquivos: string[] = [];
varrer(SRC, arquivos);

const achados: Achado[] = [];
const brancoPreto: Achado[] = [];

for (const arquivo of arquivos) {
  const rel = relative(RAIZ, arquivo);
  const declara = DECLARAM.includes(rel);
  /*
   * ⚠️ COMENTÁRIO NÃO PINTA NADA — e o comentário de BLOCO atravessa linhas.
   * A primeira versão limpava linha a linha e acusava a própria documentação:
   * este arquivo explica os defeitos citando os hexes que causaram cada um.
   * Uma guarda que reprova a documentação da regra treina quem a lê a
   * ignorá-la, que é o começo de toda guarda desligada. Então o bloco é
   * apagado no arquivo INTEIRO, preservando as quebras de linha para os
   * números continuarem batendo.
   */
  const bruto = readFileSync(arquivo, "utf8");
  const linhas = bruto
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .split("\n");

  linhas.forEach((linha, i) => {
    const semComentario = linha.replace(/(^|[^:])\/\/.*$/, "$1");

    for (const m of semComentario.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      let hex = m[0].toLowerCase();
      // #abc → #aabbcc, para comparar com a paleta numa forma só.
      if (hex.length === 4) hex = "#" + hex.slice(1).split("").map((c) => c + c).join("");
      if (hex.length === 9) hex = hex.slice(0, 7); // #rrggbbaa → ignora o alfa
      if (hex.length !== 7) continue;

      const trecho = linha.trim().slice(0, 110);
      if (hex === "#ffffff" || hex === "#000000") {
        // O token que NOMEIA o preto puro (marketing) é a única declaração
        // legítima; o resto é o defeito que a regra ataca.
        /*
         * ⚠️ O BRANCO PURO PASSOU A SER A SUPERFÍCIE DO CARD — decisão tomada
         * com a tela na frente, junto com a remoção da borda: o que separa o
         * card do fundo virou o CONTRASTE entre as duas superfícies, e para
         * isso o card precisa ser mais claro que a área.
         *
         * A regra NÃO foi desligada, só estreitada: `#ffffff` vale apenas na
         * linha que DECLARA o token (`--color-white`, `cardBg` no espelho do
         * Laboratório). Um `#fff` solto num componente continua reprovando —
         * é ele que produz as quarenta superfícies levemente diferentes, e é
         * a parte da regra que carrega o valor.
         */
        const ehTokenDeclarado = declara
          && /black-pure|hero-from|hero-glow|--color-white|cardBg|boxBg|--a4p-box-bg/.test(linha);
        if (!ehTokenDeclarado) brancoPreto.push({ arquivo: rel, linha: i + 1, hex, trecho });
        continue;
      }
      if (!permitido(hex)) achados.push({ arquivo: rel, linha: i + 1, hex, trecho });
    }
  });
}

/* ---- 3. o espelho: :root × .ds-visor × Laboratório ---- */
const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
const lab = readFileSync(join(SRC, "components/app/DesignLab.tsx"), "utf8");

function valorDe(bloco: string, token: string): string | null {
  const m = bloco.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  return m ? m[1].toLowerCase() : null;
}
const raiz = css.slice(css.indexOf("\n:root {"), css.indexOf("html.dark {"));
const visorIni = css.indexOf("html:not(.dark) .ds-visor {");
const visor = css.slice(visorIni, css.indexOf("}", css.indexOf("--color-negative", visorIni)));

const espelho: string[] = [];
for (const token of ["--color-ink", "--color-white", "--color-surface-1", "--color-surface-2", "--color-lime", "--color-border"]) {
  const a = valorDe(raiz, token);
  const b = valorDe(visor, token);
  if (a && b && a !== b) espelho.push(`${token}: :root=${a} × .ds-visor=${b}`);
}
// O Lab tem de conhecer o ink e o acento reais, senão repinta o app.
for (const [token, esperado] of [["ink", "#28211b"], ["lime", "#c8d930"]] as const) {
  const m = lab.match(new RegExp(`${token}\\s*:\\s*"(#[0-9a-fA-F]{6})"`));
  if (m && m[1].toLowerCase() !== esperado) {
    espelho.push(`DesignLab DEFAULT_CORES.${token}=${m[1]} × paleta=${esperado}`);
  }
}

/* ---- placar ---- */
console.log("\nGUARDA DA PALETA — paleta quente (9 cores + 3 semânticas)\n");
console.log(`  arquivos varridos: ${arquivos.length}`);

let falhou = false;

if (brancoPreto.length) {
  falhou = true;
  console.log(`\n✗ BRANCO PURO / PRETO PURO no app — ${brancoPreto.length}`);
  console.log("  O branco é sempre #FEFDF0 e o preto é sempre #28211B.");
  for (const a of brancoPreto.slice(0, 20)) console.log(`    ${a.arquivo}:${a.linha}  ${a.hex}  ${a.trecho}`);
  if (brancoPreto.length > 20) console.log(`    … e mais ${brancoPreto.length - 20}`);
}

if (achados.length) {
  falhou = true;
  const porHex = new Map<string, Achado[]>();
  for (const a of achados) porHex.set(a.hex, [...(porHex.get(a.hex) ?? []), a]);
  console.log(`\n✗ HEX FORA DA PALETA — ${achados.length} em ${porHex.size} cores`);
  for (const [hex, lista] of [...porHex].sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
    console.log(`    ${hex}  (${lista.length}×)  ex.: ${lista[0].arquivo}:${lista[0].linha}`);
  }
  if (porHex.size > 25) console.log(`    … e mais ${porHex.size - 25} cores`);
}

if (espelho.length) {
  falhou = true;
  console.log(`\n✗ ESPELHO DIVERGENTE — ${espelho.length}`);
  for (const d of espelho) console.log(`    ${d}`);
}

if (falhou) {
  console.log("\nCorrija usando um TOKEN (bg-ink, text-muted, var(--color-*)),");
  console.log("ou declare a exceção com o motivo em scripts/paleta.mts.\n");
  process.exit(1);
}

console.log(`\n✓ TODOS — nenhum hex fora da paleta · nenhum branco/preto puro · espelho batendo\n`);
