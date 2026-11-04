/**
 * O SISTEMA TEM UM TEMA SÓ, O CLARO — `npm run tema-unico`.
 *
 * Decisão do dono (04/11/2026): "exclua a variante onde a página de fundo do
 * sistema fica no modo dark (isso no admin e sistema geral)". O tema escuro
 * era aplicado pela classe `dark` no `<html>`, ligada por um script no layout
 * (que também seguia o escuro do sistema operacional) e por um botão "Tema
 * escuro" no menu da conta. Quem tinha o Mac no escuro abria o sistema no
 * escuro sem ter pedido.
 *
 * O que esta guarda reprova, e por quê:
 *   1. Código que põe a classe `dark` no `<html>` ou lê a preferência de
 *      escuro do aparelho → o escuro volta pela porta de trás.
 *   2. Regra `html.dark` no CSS, ou variante `dark:` do Tailwind → a segunda
 *      paleta volta, e ninguém a mantém.
 *   3. Valor `escuro` no `tokens.json` ou contexto escuro no gerador → o DS
 *      volta a ter dois temas.
 *   4. Botão ou item de menu "Tema escuro".
 *
 * E ela prova que reprova: planta cada defeito numa cópia em memória e exige
 * que seja nomeado (CLAUDE.md, "toda guarda só conta depois de reprovar").
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Fonte = { arquivo: string; texto: string };

function arquivos(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...arquivos(p, ext));
    else if (ext.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

const REGRAS: { codigo: string; motivo: string; teste: (f: Fonte) => boolean }[] = [
  {
    codigo: "classe_dark",
    motivo: "põe a classe `dark` no <html> ou segue o escuro do aparelho",
    teste: (f) => /\.(ts|tsx)$/.test(f.arquivo) &&
      (/classList\.(add|toggle)\(\s*["']dark["']/.test(f.texto) || /prefers-color-scheme\s*:\s*dark/.test(f.texto)),
  },
  {
    codigo: "css_escuro",
    motivo: "regra `html.dark` ou `prefers-color-scheme: dark` no CSS",
    teste: (f) => f.arquivo.endsWith(".css") && (/html\.dark\b/.test(f.texto) || /prefers-color-scheme\s*:\s*dark/.test(f.texto)),
  },
  {
    codigo: "variante_dark",
    motivo: "variante `dark:` do Tailwind numa classe",
    teste: (f) => f.arquivo.endsWith(".tsx") && /["'`\s]dark:[a-z[]/.test(f.texto),
  },
  {
    codigo: "token_escuro",
    motivo: "valor `escuro` no tokens.json ou contexto `html.dark` no gerador",
    teste: (f) => (f.arquivo.endsWith("tokens.json") && /"escuro"\s*:/.test(f.texto)) ||
      (f.arquivo.endsWith("design/gerar.ts") && /seletor:\s*["']html\.dark["']/.test(f.texto)),
  },
  {
    codigo: "botao_tema",
    motivo: "botão ou item de menu \"Tema escuro\"",
    teste: (f) => /\.(ts|tsx)$/.test(f.arquivo) && /["'>]\s*Tema escuro/.test(f.texto),
  },
];

function conferir(fontes: Fonte[]): { codigo: string; msg: string }[] {
  const achados: { codigo: string; msg: string }[] = [];
  for (const f of fontes)
    for (const r of REGRAS)
      if (r.teste(f)) achados.push({ codigo: r.codigo, msg: `${f.arquivo}: ${r.motivo}` });
  return achados;
}

const fontes: Fonte[] = [
  ...arquivos("src", [".ts", ".tsx", ".css"]),
  "src/design/tokens.json",
].map((arquivo) => ({ arquivo: arquivo.replace(/\\/g, "/"), texto: readFileSync(arquivo, "utf8") }));

const falhas: string[] = conferir(fontes).map((a) => `[${a.codigo}] ${a.msg}`);

/* A prova: cada defeito plantado tem de ser nomeado pelo código certo. */
const PLANTAS: [string, Fonte][] = [
  ["classe_dark", { arquivo: "src/app/layout.tsx", texto: "document.documentElement.classList.add('dark')" }],
  ["classe_dark", { arquivo: "src/x.ts", texto: "matchMedia('(prefers-color-scheme:dark)')" }],
  ["css_escuro", { arquivo: "src/app/globals.css", texto: "html.dark { --color-ink: #fff; }" }],
  ["variante_dark", { arquivo: "src/x.tsx", texto: '<div className="bg-white dark:bg-ink" />' }],
  ["token_escuro", { arquivo: "src/design/tokens.json", texto: '{ "nome": "--color-ink", "claro": "#3b4332", "escuro": "#f3f1ee" }' }],
  ["token_escuro", { arquivo: "src/design/gerar.ts", texto: '{ chave: "escuro", seletor: "html.dark", nome: "tema escuro" }' }],
  ["botao_tema", { arquivo: "src/x.tsx", texto: 'rotulo: "Tema escuro"' }],
];
let provadas = 0;
for (const [codigo, planta] of PLANTAS) {
  const achados = conferir([planta]);
  if (achados.some((a) => a.codigo === codigo)) provadas++;
  else falhas.push(`prova: o defeito plantado "${planta.texto}" devia reprovar com ${codigo} e reprovou com [${achados.map((a) => a.codigo).join(", ") || "nada"}]`);
}

if (falhas.length) {
  console.error("✗ tema-unico: o tema escuro voltou (decisão do dono, 04/11/2026: o sistema tem um tema só, o claro)");
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ tema-unico: ${fontes.length} arquivos sem tema escuro · ${provadas} defeitos plantados, ${provadas} reprovados`);
