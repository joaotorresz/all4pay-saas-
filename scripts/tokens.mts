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

import {
  CONTEXTOS, INICIO, FIM, gerarBloco, valorEm, validarRascunho, aplicarRascunho, mudancasDoRascunho,
  serializarTokens, type ArquivoTokens,
} from "@/design/gerar";

const RAIZ = process.cwd();
const ARQ_TOKENS = join(RAIZ, "src/design/tokens.json");
const ARQ_CSS = join(RAIZ, "src/app/globals.css");
const ARQ_TAILWIND = join(RAIZ, "tailwind.config.ts");
const SELETORES = new Set<string>(CONTEXTOS.map((c) => c.seletor));

export function lerTokens(): ArquivoTokens {
  return JSON.parse(readFileSync(ARQ_TOKENS, "utf8")) as ArquivoTokens;
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

  /*
   * O RASCUNHO DO EDITOR (Administração › Design system). O que ele salva vira
   * CSS do sistema inteiro, então a recusa é provada aqui, com o defeito
   * plantado: um valor que fecha a regra, um token inventado, o "no app,
   * claro" de um token espelhado (a segunda fonte de volta) e uma escala que
   * não existe. E o caminho bom: aplicar e regerar sai idêntico ao que a
   * guarda espera, e o arquivo escrito volta ao mesmo objeto.
   */
  const recusa = (nome: string, r: Parameters<typeof validarRascunho>[1], trecho: string) => {
    const erros = validarRascunho(arq, r);
    if (!erros.some((e) => e.includes(trecho)))
      falhas.push(`prova do editor "${nome}": esperava recusa citando "${trecho}", veio [${erros.join(" | ") || "nada"}]`);
  };
  recusa("valor que fecha a regra", { tokens: { [alvo.nome]: { claro: "red;}body{display:none" } }, escalas: {} }, "tem ;");
  recusa("comentário no valor", { tokens: { [alvo.nome]: { claro: "red /* x" } }, escalas: {} }, "comentário");
  recusa("token inventado", { tokens: { "--nao-existe": { claro: "#123456" } }, escalas: {} }, "não existe");
  const espelhado = arq.tokens.find((t) => t.espelhoNoApp && t.appClaro === undefined);
  if (espelhado) recusa("espelho editado à parte", { tokens: { [espelhado.nome]: { appClaro: "#123456" } }, escalas: {} }, "não se edita");
  recusa("escala inventada", { tokens: {}, escalas: { "borderRadius.nao-existe": "1px" } }, "não existe");
  const bom = { tokens: { [alvo.nome]: { claro: "#123456" } }, escalas: { "borderRadius.card": "21.5px" } };
  if (validarRascunho(arq, bom).length) falhas.push(`prova do editor: rascunho válido recusado: ${validarRascunho(arq, bom).join(" | ")}`);
  const aplicado = aplicarRascunho(arq, bom);
  if (mudancasDoRascunho(arq, bom).length !== 2) falhas.push("prova do editor: o rascunho com 2 valores não descreveu 2 mudanças");
  if (!gerarBloco(aplicado).includes(`  ${alvo.nome}: #123456;`)) falhas.push("prova do editor: o bloco regerado não traz o valor novo");
  if (JSON.stringify(JSON.parse(serializarTokens(aplicado))) !== JSON.stringify(aplicado)) falhas.push("prova do editor: o arquivo escrito não volta ao mesmo objeto");
  if (alvo.claro === "#123456" || JSON.stringify(arq).includes('"21.5px"')) falhas.push("prova do editor: aplicar o rascunho mudou o arquivo de ENTRADA");
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
  // O editor reescreve o tokens.json por `serializarTokens`: o arquivo do
  // repositório tem de estar NESSE formato, senão todo PR do editor viria com
  // o arquivo inteiro reformatado e a mudança de verdade se perderia no diff.
  if (serializarTokens(arq) !== readFileSync(ARQ_TOKENS, "utf8"))
    achados.push({ codigo: "token_invalido", msg: "src/design/tokens.json fora do formato que o editor escreve (JSON com 2 espaços e quebra no fim)" });
  const prova = provar(css, tailwind, arq);
  for (const a of achados) console.error(`✗ ${a.msg}`);
  for (const p of prova) console.error(`✗ ${p}`);
  if (achados.length || prova.length) process.exit(1);
  const porCtx = CONTEXTOS.map((c) => `${arq.tokens.filter((t) => valorEm(t, c.chave) !== undefined).length} ${c.chave}`).join(" · ");
  console.log(`✓ tokens: ${arq.tokens.length} valores numa fonte só (${porCtx}) · 10 defeitos plantados, 10 reprovados (5 do editor)`);
}

if (import.meta.url === `file://${process.argv[1]}`) principal();
