/**
 * TETO ZERO: toda variável de ambiente que o app lê está no `.env.example`.
 *
 * Em 03/11/2026 o arquivo estava com 38 variáveis, e o código lia mais 60
 * (Focus NFe, Inter, Itaú, a cobrança pela conta do cliente, os interruptores
 * do WhatsApp, o Google, os modelos da Twilio). Quem montava um ambiente novo
 * descobria cada uma pelo erro em produção. Esta guarda cobra as duas pontas:
 * a variável lida tem de estar documentada, e a documentada que ninguém mais lê
 * é acusada (é assim que o modelo único da cobrança ficou anunciado depois de
 * aposentado).
 *
 * O que conta como "lida": `process.env.X`, `env.X` (o objeto que as portas
 * recebem por parâmetro) e o NOME entre aspas num mapa de variáveis (os modelos
 * da Twilio são escolhidos por finalidade). Só nomes com cara de variável
 * (prefixo conhecido) entram pelo terceiro caminho (o mapa da Twilio, a lista
 * `VARIAVEIS_SAIDA`, a constante do interruptor), senão toda constante em
 * caixa alta do código viraria "variável sem documentação".
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let falhas = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) console.log(`✓ ${nome}`);
  else { falhas++; console.log(`✗ FAIL ${nome}${detalhe ? `\n    ${detalhe}` : ""}`); }
};

const arquivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

/** Comentários saem: o código explica cada variável citando o nome dela. */
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** As que a plataforma injeta: não se configuram. */
const DA_PLATAFORMA = /^(NODE_ENV|NEXT_RUNTIME|CI|VERCEL(_[A-Z_]+)?)$/;
const PREFIXOS = /^(TWILIO|PINBANK|INTER|ITAU|FOCUS_NFE|COBRANCA|WHATSAPP|GOOGLE|NEXT_PUBLIC|GITHUB|RESEND|ALERTS|ANTHROPIC|SUPABASE|CAIXA_EMAIL|CADASTRO|MENSALIDADE|ADMIN|APP|CRON|CONTADOR)_/;

export function variaveisLidas(fontes: string[]): Set<string> {
  const lidas = new Set<string>();
  for (const bruto of fontes) {
    const t = semComentario(bruto);
    for (const m of t.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) lidas.add(m[1]);
    for (const m of t.matchAll(/process\.env\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g)) lidas.add(m[1]);
    for (const m of t.matchAll(/\benv\??\.([A-Z][A-Z0-9_]{2,})\b/g)) if (PREFIXOS.test(m[1])) lidas.add(m[1]);
    for (const m of t.matchAll(/["'`]([A-Z][A-Z0-9]*_[A-Z0-9_]+)["'`]/g)) if (PREFIXOS.test(m[1])) lidas.add(m[1]);
  }
  for (const n of [...lidas]) if (DA_PLATAFORMA.test(n)) lidas.delete(n);
  return lidas;
}

export function documentadas(envExample: string): Set<string> {
  return new Set([...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
}

const fontes = arquivos("src").map((p) => readFileSync(p, "utf8"));
const lidas = variaveisLidas(fontes);
const doc = documentadas(readFileSync(".env.example", "utf8"));

const semDoc = [...lidas].filter((n) => !doc.has(n)).sort();
ok(`toda variável lida pelo app está no .env.example (${lidas.size} lidas)`, lidas.size > 40 && semDoc.length === 0, semDoc.join(", "));

const orfas = [...doc].filter((n) => !lidas.has(n)).sort();
ok("nenhuma variável documentada ficou sem quem a leia", orfas.length === 0, orfas.join(", "));

/* Os defeitos plantados: a guarda tem de reprovar os dois sentidos. */
const comNova = variaveisLidas([...fontes, "const x = process.env.FOCUS_NFE_INVENTADA;"]);
ok("(defeito plantado) variável nova lida sem documentar é ACUSADA", [...comNova].some((n) => n === "FOCUS_NFE_INVENTADA" && !doc.has(n)));
const docComOrfa = documentadas(readFileSync(".env.example", "utf8") + "\nTWILIO_TEMPLATE_COBRANCA_SID=\n");
ok("(defeito plantado) variável aposentada que volta ao .env.example é ACUSADA", [...docComOrfa].some((n) => !lidas.has(n)));
const soComentario = variaveisLidas(["/* process.env.PINBANK_SO_NO_COMENTARIO */"]);
ok("(controle) nome citado só em comentário não conta como lido", !soComentario.has("PINBANK_SO_NO_COMENTARIO"));

if (falhas) { console.log(`\n✗ ${falhas} falha(s)`); process.exit(1); }
console.log("\n✓ .env.example em dia com o código");
