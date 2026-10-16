/**
 * OS VALORES DO DESIGN SYSTEM TÊM UMA FONTE SÓ — `npm run tokens`.
 *
 * ⚠️ Antes desta guarda, cada cor, raio e medida do sistema morava em até
 * QUATRO lugares: o `:root`, o `html.dark`, o espelho `html:not(.dark)
 * .ds-visor` (que vence a raiz dentro do app) e as escalas do Tailwind. Mudar
 * um deles e esquecer outro deixava o app com dois valores para o mesmo
 * papel — o raio do card valia 20px no CSS e 26px no Tailwind, e ninguém via.
 * É a regra "duas fontes para um fato é um defeito agendado" do CLAUDE.md,
 * aplicada ao design.
 *
 * Agora a fonte é `src/design/tokens.json`. Este script:
 *
 *   npm run tokens               → reescreve o bloco gerado do `globals.css`
 *   npm run tokens -- --conferir → só confere (é o que roda no `npm test`)
 *
 * O que a conferência reprova, e por quê:
 *   1. O bloco gerado DIFERE do que o arquivo produz → alguém editou o CSS à
 *      mão (a mudança sumiria na próxima geração) ou o JSON sem gerar.
 *   2. Uma variável declarada FORA do bloco num dos quatro seletores de tema
 *      → é a segunda fonte voltando por outra porta.
 *   3. O Tailwind deixou de ler as escalas do JSON → o mesmo defeito do raio.
 *   4. Token mal formado (nome repetido, sem valor, espelho sem valor claro).
 *
 * E ela PROVA que reprova: planta os três primeiros defeitos numa cópia em
 * memória e exige que cada um seja nomeado. Guarda que nunca reprovou é
 * decoração (CLAUDE.md, "toda guarda só conta como guarda depois de reprovar").
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const RAIZ = process.cwd();
const ARQ_TOKENS = join(RAIZ, "src/design/tokens.json");
const ARQ_CSS = join(RAIZ, "src/app/globals.css");
const ARQ_TAILWIND = join(RAIZ, "tailwind.config.ts");

export const INICIO = "/* <tokens-gerados> */";
export const FIM = "/* </tokens-gerados> */";

/**
 * Os quatro contextos em que uma variável de tema pode ser declarada. A ordem
 * dos blocos no CSS não decide nada entre eles (são elementos ou
 * especificidades diferentes), mas fica fixa para o arquivo gerado ser estável.
 */
export const CONTEXTOS = [
  { chave: "claro", seletor: ":root", nome: "tema claro (fora e dentro do app)" },
  { chave: "escuro", seletor: "html.dark", nome: "tema escuro" },
  { chave: "app", seletor: ".ds-visor", nome: "dentro do app, nos dois temas" },
  { chave: "appClaro", seletor: "html:not(.dark) .ds-visor", nome: "dentro do app, tema claro" },
] as const;
export type ChaveContexto = (typeof CONTEXTOS)[number]["chave"];
const SELETORES = new Set<string>(CONTEXTOS.map((c) => c.seletor));

export interface Token {
  nome: string;
  grupo: string;
  tipo: "cor" | "medida" | "fonte" | "sombra" | "degrade" | "movimento" | "outro";
  claro?: string;
  escuro?: string;
  app?: string;
  appClaro?: string;
  /**
   * `true` = dentro do app, no tema claro, vale o MESMO valor de `claro`. É o
   * espelho que a guarda da paleta exige; gerado daqui ele não tem como
   * divergir, que é o defeito que o espelho escrito à mão já causou.
   */
  espelhoNoApp?: boolean;
  /** Comentário que acompanha a declaração, por contexto. */
  nota?: Partial<Record<ChaveContexto, string>>;
}

export interface ArquivoTokens {
  $leia: string;
  tokens: Token[];
  /** Escalas que o Tailwind lê direto daqui (`tailwind.config.ts`). */
  escalas: Record<string, unknown>;
}

export function lerTokens(): ArquivoTokens {
  return JSON.parse(readFileSync(ARQ_TOKENS, "utf8")) as ArquivoTokens;
}

/** Valor de um token num contexto, já resolvendo o espelho. */
export function valorEm(t: Token, chave: ChaveContexto): string | undefined {
  if (chave === "appClaro") return t.appClaro ?? (t.espelhoNoApp ? t.claro : undefined);
  return t[chave];
}

function comentario(texto: string, recuo: string): string {
  const linhas = texto.split("\n");
  return `${recuo}/* ${linhas.join(`\n${recuo}   `)} */\n`;
}

/** O texto exato do bloco gerado, marcadores incluídos. */
export function gerarBloco(arq: ArquivoTokens): string {
  let s = `${INICIO}\n`;
  s += `/* ⚠️ GERADO — NÃO EDITE À MÃO. A fonte é src/design/tokens.json; depois de
   mudá-lo, rode \`npm run tokens\`. Uma edição aqui some na próxima geração e
   reprova a guarda \`npm run tokens -- --conferir\` (dentro do \`npm test\`). */\n`;
  for (const ctx of CONTEXTOS) {
    const linhas = arq.tokens
      .map((t) => ({ t, v: valorEm(t, ctx.chave) }))
      .filter((x) => x.v !== undefined);
    if (!linhas.length) continue;
    s += `/* ${ctx.nome} */\n${ctx.seletor} {\n`;
    for (const { t, v } of linhas) {
      const nota = t.nota?.[ctx.chave];
      if (nota) s += comentario(nota, "  ");
      s += `  ${t.nome}: ${v};\n`;
    }
    s += `}\n`;
  }
  s += FIM;
  return s;
}

export interface Achado {
  codigo: "bloco_ausente" | "bloco_editado" | "variavel_fora" | "tailwind_nao_le" | "token_invalido";
  msg: string;
}

/** Confere um conjunto (CSS, Tailwind, tokens) — pura, para a prova rodar em memória. */
export function conferir(css: string, tailwind: string, arq: ArquivoTokens): Achado[] {
  const achados: Achado[] = [];

  const nomes = new Set<string>();
  for (const t of arq.tokens) {
    if (!/^--[a-z0-9-]+$/.test(t.nome)) achados.push({ codigo: "token_invalido", msg: `nome inválido: "${t.nome}"` });
    if (nomes.has(t.nome)) achados.push({ codigo: "token_invalido", msg: `${t.nome} aparece duas vezes no arquivo` });
    nomes.add(t.nome);
    if (!CONTEXTOS.some((c) => valorEm(t, c.chave) !== undefined))
      achados.push({ codigo: "token_invalido", msg: `${t.nome} não tem valor em contexto nenhum` });
    if (t.espelhoNoApp && t.claro === undefined)
      achados.push({ codigo: "token_invalido", msg: `${t.nome} espelha o claro no app, mas não tem valor claro` });
  }

  const i = css.indexOf(INICIO);
  const f = css.indexOf(FIM);
  if (i < 0 || f < i) {
    achados.push({ codigo: "bloco_ausente", msg: "o globals.css não tem o bloco gerado (marcadores <tokens-gerados>)" });
    return achados;
  }
  const atual = css.slice(i, f + FIM.length);
  const esperado = gerarBloco(arq);
  if (atual !== esperado) {
    const a = atual.split("\n");
    const e = esperado.split("\n");
    let n = 0;
    while (n < a.length && a[n] === e[n]) n++;
    achados.push({
      codigo: "bloco_editado",
      msg: `o bloco gerado do globals.css difere do tokens.json (primeira diferença na linha ${n + 1} do bloco: "${(a[n] ?? "").trim()}" × esperado "${(e[n] ?? "").trim()}"). Edite o JSON e rode \`npm run tokens\`.`,
    });
  }

  const fora = css.slice(0, i) + css.slice(f + FIM.length);
  postcss.parse(fora).walkDecls(/^--/, (d) => {
    const regra = d.parent as postcss.Rule | undefined;
    if (regra?.type === "rule" && SELETORES.has(regra.selector) && regra.parent?.type === "root") {
      achados.push({
        codigo: "variavel_fora",
        msg: `${d.prop} declarada à mão em "${regra.selector}" fora do bloco gerado (globals.css). Leve-a para src/design/tokens.json.`,
      });
    }
  });

  if (!/from\s+["']\.\/src\/design\/tokens\.json["']/.test(tailwind))
    achados.push({ codigo: "tailwind_nao_le", msg: "tailwind.config.ts não lê as escalas de src/design/tokens.json" });

  return achados;
}

/** Planta cada defeito numa cópia e exige que a guarda o NOMEIE. */
function provar(css: string, tailwind: string, arq: ArquivoTokens): string[] {
  const falhas: string[] = [];
  const espera = (nome: string, achados: Achado[], codigo: Achado["codigo"]) => {
    if (!achados.some((a) => a.codigo === codigo))
      falhas.push(`prova "${nome}": esperava reprovar com ${codigo}, reprovou com [${achados.map((a) => a.codigo).join(", ") || "nada"}]`);
  };
  const alvo = arq.tokens.find((t) => t.claro !== undefined)!;
  // 1) valor editado à mão dentro do bloco
  const editado = css.replace(`  ${alvo.nome}: ${alvo.claro};`, `  ${alvo.nome}: #123456;`);
  espera("valor editado à mão no CSS", conferir(editado, tailwind, arq), "bloco_editado");
  // 2) JSON mudou e ninguém gerou
  const json2: ArquivoTokens = { ...arq, tokens: arq.tokens.map((t) => (t === alvo ? { ...t, claro: "#123456" } : t)) };
  espera("JSON mudado sem gerar", conferir(css, tailwind, json2), "bloco_editado");
  // 3) segunda fonte fora do bloco
  espera("variável fora do bloco", conferir(`${css}\n:root { ${alvo.nome}: #123456; }\n`, tailwind, arq), "variavel_fora");
  // 4) Tailwind com valor próprio
  espera("Tailwind sem ler o JSON", conferir(css, tailwind.replace(/from\s+["']\.\/src\/design\/tokens\.json["']/, 'from "./outro.json"'), arq), "tailwind_nao_le");
  // 5) token repetido
  espera("token repetido", conferir(css, tailwind, { ...arq, tokens: [...arq.tokens, alvo] }), "token_invalido");
  return falhas;
}

function principal() {
  const somenteConferir = process.argv.includes("--conferir");
  const arq = lerTokens();
  let css = readFileSync(ARQ_CSS, "utf8");
  const tailwind = readFileSync(ARQ_TAILWIND, "utf8");

  if (!somenteConferir) {
    const i = css.indexOf(INICIO);
    const f = css.indexOf(FIM);
    if (i < 0 || f < i) {
      console.error("✗ globals.css sem os marcadores <tokens-gerados>; não sei onde escrever.");
      process.exit(1);
    }
    const novo = css.slice(0, i) + gerarBloco(arq) + css.slice(f + FIM.length);
    if (novo !== css) {
      writeFileSync(ARQ_CSS, novo);
      console.log("✓ bloco gerado reescrito em src/app/globals.css");
    }
    css = novo;
  }

  const achados = conferir(css, tailwind, arq);
  const prova = provar(css, tailwind, arq);
  for (const a of achados) console.error(`✗ ${a.msg}`);
  for (const p of prova) console.error(`✗ ${p}`);
  if (achados.length || prova.length) process.exit(1);
  const porCtx = CONTEXTOS.map((c) => `${arq.tokens.filter((t) => valorEm(t, c.chave) !== undefined).length} ${c.chave}`).join(" · ");
  console.log(`✓ tokens: ${arq.tokens.length} valores numa fonte só (${porCtx}) · 5 defeitos plantados, 5 reprovados`);
}

if (import.meta.url === `file://${process.argv[1]}`) principal();
