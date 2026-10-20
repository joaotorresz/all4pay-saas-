/**
 * As regras puras do design system — o que transforma `tokens.json` no bloco
 * gerado do `globals.css`, e o que aplica um RASCUNHO do editor ao arquivo.
 *
 * ⚠️ Mora em `src/` (e não só em `scripts/tokens.mts`) porque três lugares
 * precisam da MESMA conta: o `npm run tokens` (que gera e confere), a vitrine
 * de Administração › Design system (que mostra a prévia ao vivo) e a rota que
 * salva o rascunho num PR. Três cópias da geração seriam três jeitos de o
 * bloco do PR discordar do que a guarda espera — e a guarda reprovaria o PR
 * que o próprio editor abriu.
 *
 * Puro: sem `fs`, sem rede, sem relógio.
 */

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

/** Rótulo curto de cada contexto, para a tela e para o PR. */
export const ROTULO_CONTEXTO: Record<ChaveContexto, string> = {
  claro: "Claro",
  escuro: "Escuro",
  app: "No app",
  appClaro: "No app, claro",
};

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

/** Valor de um token num contexto, já resolvendo o espelho. */
export function valorEm(t: Token, chave: ChaveContexto): string | undefined {
  if (chave === "appClaro") return t.appClaro ?? (t.espelhoNoApp ? t.claro : undefined);
  return t[chave];
}

/**
 * Os contextos que se editam num token: os que têm valor PRÓPRIO. O
 * "no app, claro" de um token espelhado não se edita à parte — ele É o claro,
 * e deixá-lo editável recriaria a segunda fonte que o espelho existe para
 * matar.
 */
export function contextosEditaveis(t: Token): ChaveContexto[] {
  return CONTEXTOS.map((c) => c.chave).filter(
    (c) => t[c] !== undefined && !(c === "appClaro" && t.espelhoNoApp && t.appClaro === undefined),
  );
}

function comentario(texto: string, recuo: string): string {
  const linhas = texto.split("\n");
  return `${recuo}/* ${linhas.join(`\n${recuo}   `)} */\n`;
}

/** Só as declarações (sem marcadores nem aviso) — é o que a prévia injeta. */
export function gerarDeclaracoes(arq: ArquivoTokens, comNotas = true): string {
  let s = "";
  for (const ctx of CONTEXTOS) {
    const linhas = arq.tokens
      .map((t) => ({ t, v: valorEm(t, ctx.chave) }))
      .filter((x) => x.v !== undefined);
    if (!linhas.length) continue;
    s += `/* ${ctx.nome} */\n${ctx.seletor} {\n`;
    for (const { t, v } of linhas) {
      const nota = comNotas ? t.nota?.[ctx.chave] : undefined;
      if (nota) s += comentario(nota, "  ");
      s += `  ${t.nome}: ${v};\n`;
    }
    s += `}\n`;
  }
  return s;
}

/** O texto exato do bloco gerado, marcadores incluídos. */
export function gerarBloco(arq: ArquivoTokens): string {
  let s = `${INICIO}\n`;
  s += `/* ⚠️ GERADO — NÃO EDITE À MÃO. A fonte é src/design/tokens.json; depois de
   mudá-lo, rode \`npm run tokens\`. Uma edição aqui some na próxima geração e
   reprova a guarda \`npm run tokens -- --conferir\` (dentro do \`npm test\`). */\n`;
  s += gerarDeclaracoes(arq);
  s += FIM;
  return s;
}

/** Troca o bloco gerado de um `globals.css`; `null` quando os marcadores faltam. */
export function substituirBloco(css: string, arq: ArquivoTokens): string | null {
  const i = css.indexOf(INICIO);
  const f = css.indexOf(FIM);
  if (i < 0 || f < i) return null;
  return css.slice(0, i) + gerarBloco(arq) + css.slice(f + FIM.length);
}

/** O `tokens.json` como o repositório o guarda (2 espaços, quebra no fim). */
export function serializarTokens(arq: ArquivoTokens): string {
  return JSON.stringify(arq, null, 2) + "\n";
}

/* ------------------------------------------------------------------ */
/* Escalas do Tailwind: as folhas que se editam                         */
/* ------------------------------------------------------------------ */

export interface FolhaEscala {
  /** `borderRadius.card`, `fontSize.h2.0`, `fontSize.h2.1.lineHeight`… */
  caminho: string;
  valor: string;
}

/**
 * Toda folha de TEXTO das escalas, com o caminho até ela. Só folhas que já
 * existem se editam: acrescentar uma escala nova é decisão de código (alguém
 * tem de usar a classe), não de valor.
 */
export function folhasDeEscala(escalas: Record<string, unknown>): FolhaEscala[] {
  const out: FolhaEscala[] = [];
  const andar = (no: unknown, caminho: string[]) => {
    if (typeof no === "string") {
      out.push({ caminho: caminho.join("."), valor: no });
      return;
    }
    if (Array.isArray(no)) no.forEach((v, i) => andar(v, [...caminho, String(i)]));
    else if (no && typeof no === "object")
      for (const [k, v] of Object.entries(no as Record<string, unknown>)) {
        if (k.startsWith("$")) continue;
        andar(v, [...caminho, k]);
      }
  };
  andar(escalas, []);
  return out;
}

function gravarFolha(escalas: Record<string, unknown>, caminho: string, valor: string) {
  const partes = caminho.split(".");
  let no: unknown = escalas;
  for (const p of partes.slice(0, -1)) no = (no as Record<string, unknown>)[p];
  (no as Record<string, unknown>)[partes[partes.length - 1]] = valor;
}

/* ------------------------------------------------------------------ */
/* O rascunho do editor                                                 */
/* ------------------------------------------------------------------ */

/** O que o editor mudou: só os valores, nunca a estrutura. */
export interface Rascunho {
  tokens: Record<string, Partial<Record<ChaveContexto, string>>>;
  escalas: Record<string, string>;
}

export const RASCUNHO_VAZIO: Rascunho = { tokens: {}, escalas: {} };

/**
 * ⚠️ Um valor do editor vira TEXTO DENTRO DO CSS do sistema inteiro. Sem esta
 * conferência, um `;}` no campo fecharia a regra e abriria outra — o editor
 * viraria uma porta para escrever qualquer CSS em produção, e um fecho de
 * comentário quebraria o aviso do bloco. Recusa em vez de escapar: não há valor de token
 * legítimo que precise desses caracteres.
 */
export function problemaDoValor(valor: string): string | null {
  const v = valor.trim();
  if (!v) return "vazio";
  if (v.length > 400) return "mais de 400 caracteres";
  if (/[;{}<>\\\n\r]/.test(v)) return "tem ; { } < > \\ ou quebra de linha";
  if (v.includes("/*") || v.includes("*/")) return "tem comentário de CSS";
  return null;
}

export interface Mudanca {
  /** Nome do token (`--color-ink`) ou caminho da escala (`borderRadius.card`). */
  alvo: string;
  tipo: "token" | "escala";
  contexto?: ChaveContexto;
  de: string;
  para: string;
}

/**
 * Confere o rascunho contra o arquivo. Token que não existe, contexto que o
 * token não tem, escala que não existe e valor que quebraria o CSS são
 * recusados com o nome do problema.
 */
export function validarRascunho(arq: ArquivoTokens, r: Rascunho): string[] {
  const erros: string[] = [];
  const porNome = new Map(arq.tokens.map((t) => [t.nome, t]));
  for (const [nome, ctxs] of Object.entries(r.tokens ?? {})) {
    const t = porNome.get(nome);
    if (!t) {
      erros.push(`${nome}: não existe no tokens.json`);
      continue;
    }
    const editaveis = contextosEditaveis(t);
    for (const [ctx, valor] of Object.entries(ctxs ?? {})) {
      if (!editaveis.includes(ctx as ChaveContexto)) {
        erros.push(`${nome}: o contexto "${ctx}" não se edita neste token`);
        continue;
      }
      const p = typeof valor === "string" ? problemaDoValor(valor) : "não é texto";
      if (p) erros.push(`${nome} (${ctx}): ${p}`);
    }
  }
  const folhas = new Set(folhasDeEscala(arq.escalas).map((f) => f.caminho));
  for (const [caminho, valor] of Object.entries(r.escalas ?? {})) {
    if (!folhas.has(caminho)) {
      erros.push(`escala ${caminho}: não existe`);
      continue;
    }
    const p = typeof valor === "string" ? problemaDoValor(valor) : "não é texto";
    if (p) erros.push(`escala ${caminho}: ${p}`);
  }
  return erros;
}

/** O arquivo com o rascunho aplicado. Não muda o arquivo de entrada. */
export function aplicarRascunho(arq: ArquivoTokens, r: Rascunho): ArquivoTokens {
  const novo = JSON.parse(JSON.stringify(arq)) as ArquivoTokens;
  const porNome = new Map(novo.tokens.map((t) => [t.nome, t]));
  for (const [nome, ctxs] of Object.entries(r.tokens ?? {})) {
    const t = porNome.get(nome);
    if (!t) continue;
    for (const [ctx, valor] of Object.entries(ctxs ?? {})) {
      if (typeof valor === "string" && contextosEditaveis(t).includes(ctx as ChaveContexto))
        t[ctx as ChaveContexto] = valor.trim();
    }
  }
  const folhas = new Set(folhasDeEscala(novo.escalas).map((f) => f.caminho));
  for (const [caminho, valor] of Object.entries(r.escalas ?? {}))
    if (folhas.has(caminho) && typeof valor === "string") gravarFolha(novo.escalas, caminho, valor.trim());
  return novo;
}

/** O que de fato muda — o editado igual ao atual não conta. */
export function mudancasDoRascunho(arq: ArquivoTokens, r: Rascunho): Mudanca[] {
  const out: Mudanca[] = [];
  const porNome = new Map(arq.tokens.map((t) => [t.nome, t]));
  for (const [nome, ctxs] of Object.entries(r.tokens ?? {})) {
    const t = porNome.get(nome);
    if (!t) continue;
    for (const [ctx, valor] of Object.entries(ctxs ?? {})) {
      const de = t[ctx as ChaveContexto];
      if (typeof valor === "string" && de !== undefined && de !== valor.trim())
        out.push({ alvo: nome, tipo: "token", contexto: ctx as ChaveContexto, de, para: valor.trim() });
    }
  }
  const atuais = new Map(folhasDeEscala(arq.escalas).map((f) => [f.caminho, f.valor]));
  for (const [caminho, valor] of Object.entries(r.escalas ?? {})) {
    const de = atuais.get(caminho);
    if (de !== undefined && typeof valor === "string" && de !== valor.trim())
      out.push({ alvo: caminho, tipo: "escala", de, para: valor.trim() });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Prévia das escalas (só na tela)                                      */
/* ------------------------------------------------------------------ */

const PREFIXOS_ESCALA: Record<string, (k: string) => { classes: string[]; prop: string }> = {
  borderRadius: (k) => ({ classes: [`rounded-${k}`], prop: "border-radius" }),
  borderWidth: (k) => ({ classes: [`border-${k}`], prop: "border-width" }),
  minWidth: (k) => ({ classes: [`min-w-${k}`], prop: "min-width" }),
};

/**
 * CSS que imita, na vitrine, as classes do Tailwind com a escala do rascunho.
 * ⚠️ É PRÉVIA: o Tailwind só gera a classe de verdade no build, então o valor
 * definitivo aparece depois do PR publicado. O `!important` existe porque a
 * classe compilada tem a mesma especificidade e vem antes.
 */
export function cssDaPreviaDeEscalas(arq: ArquivoTokens, r: Rascunho, escalaTexto = 1): string {
  // ⚠️ A prévia não passa pelo PostCSS: o fator da escala de texto
  // (`escala-texto.json`) entra aqui, senão a vitrine mostraria o tipo 20%
  // menor que o resto do app.
  const px = (v: string | undefined) =>
    v?.replace(/(-?\d*\.?\d+)px\b/g, (_, n: string) => `${Math.round(Number(n) * escalaTexto * 100) / 100}px`);
  const novo = aplicarRascunho(arq, r);
  const e = novo.escalas as Record<string, Record<string, unknown>>;
  const mudou = new Set(Object.keys(r.escalas ?? {}).map((c) => c.split(".").slice(0, 2).join(".")));
  let s = "";
  for (const chave of Array.from(mudou)) {
    const [escala, nome] = chave.split(".");
    const v = e[escala]?.[nome];
    const pref = PREFIXOS_ESCALA[escala];
    if (pref && typeof v === "string") {
      const { classes, prop } = pref(nome);
      for (const c of classes) s += `.ds-previa .${c}{${prop}:${v}!important}\n`;
    } else if (escala === "fontSize" && Array.isArray(v)) {
      const [tam, extra] = v as [string, Record<string, string>?];
      s += `.ds-previa .text-${nome}{font-size:${px(tam)}!important;${extra?.lineHeight ? `line-height:${px(extra.lineHeight)}!important;` : ""}${extra?.letterSpacing ? `letter-spacing:${px(extra.letterSpacing)}!important;` : ""}}\n`;
    } else if (escala === "spacingNomeado" && typeof v === "string") {
      for (const [p, prop] of [["px", "padding-inline"], ["py", "padding-block"], ["w", "width"]] as const)
        s += `.ds-previa .${p}-${nome}{${prop}:${v}!important}\n`;
    }
  }
  return s;
}
