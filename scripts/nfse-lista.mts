/**
 * A LISTA DAS NOTAS FISCAIS — a guarda (`npm run nfse-lista`, 04/11/2026).
 *
 * O defeito auditado: a tela "Notas fiscais" lia o status gravado na VENDA e
 * não via a nota avulsa (a NFS-e nº 62, autorizada e cancelada em produção,
 * nunca apareceu lá). Duas metades:
 *  1. o motor puro (`core/nfse/lista`): toda nota não rascunho entra, avulsa
 *     inclusive; o resumo soma as MESMAS linhas;
 *  2. a tela lê a tabela das notas (`listNfse`) e não o status da venda.
 * ⚠️ No fim, defeitos plantados: cada um derruba o caso que o nomeia.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Motor = typeof import("../src/core/nfse/lista.ts");
const ARQ = path.resolve("src/core/nfse/lista.ts");
const TELA = path.resolve("src/components/vendas-nf/OutrasViews.tsx");
const VENDAS = path.resolve("src/core/vendas/index.ts");
type Caso = [string, boolean];

const nota = (id: string, status: string, valor: number, criadoEm: string, numero?: string) =>
  ({ id, status, valorServico: valor, criadoEm, competencia: criadoEm.slice(0, 10), tomadorNome: "Cliente", numero }) as never;
const NOTAS = [
  nota("avulsa", "cancelada", 1, "2026-11-04T17:14:00Z", "62"),
  nota("da-venda", "autorizada", 100, "2026-11-03T10:00:00Z", "61"),
  nota("enviada", "enviada", 50, "2026-11-02T10:00:00Z", "60"),
  nota("negada", "rejeitada", 10, "2026-10-27T10:00:00Z"),
  nota("fila", "processando", 7, "2026-10-28T10:00:00Z"),
  nota("rasc", "rascunho", 999, "2026-11-05T10:00:00Z"),
];

function casosDoMotor(m: Motor): Caso[] {
  const linhas = m.linhasDasNotas(NOTAS, new Map([["da-venda", "2026-0003"]]));
  const cards = m.painelDasNotas(linhas);
  const card = (id: string) => cards.find((c) => c.id === id);
  return [
    ["lista: a nota avulsa entra (a nº 62 sumia da tela)", linhas.some((l) => l.id === "avulsa" && l.numero === "62" && l.venda === "")],
    ["lista: o rascunho não é nota e fica fora", !linhas.some((l) => l.id === "rasc") && linhas.length === 5],
    ["lista: a venda de origem vai na linha quando existe", linhas.find((l) => l.id === "da-venda")?.venda === "2026-0003"],
    ["lista: mais novas primeiro", linhas[0]?.id === "avulsa" && linhas[linhas.length - 1]?.id === "negada"],
    ["resumo: emitidas = autorizadas + enviadas (150 em 2)", card("emitida")?.quantidade === 2 && card("emitida")?.valor === 150],
    ["resumo: a cancelada conta em canceladas", card("cancelada")?.quantidade === 1 && card("cancelada")?.valor === 1],
    ["resumo: a recusada conta em negadas", card("negada")?.quantidade === 1 && card("negada")?.valor === 10],
    ["resumo: o total soma as MESMAS linhas da lista (168 em 5)", card("total")?.quantidade === 5 && card("total")?.valor === 168],
  ];
}

function casosDaTela(tela: string, vendas: string): Caso[] {
  const corpo = tela.slice(tela.indexOf("export function NotasFiscaisView"), tela.indexOf("/* ========================= provisionamento"));
  return [
    ["tela: a lista sai da tabela das notas (listNfse), a mesma do emissor", /listNfse\(\)/.test(corpo) && /linhasDasNotas\(/.test(corpo)],
    ["tela: o resumo sai das MESMAS linhas (painelDasNotas)", /painelDasNotas\(linhas\)/.test(corpo)],
    ["tela: nada da lista lê o status da nota gravado na venda", !/statusNF|numeroNF/.test(corpo)],
    ["core: o painel antigo, das vendas, não existe mais", !/export const painelNotasFiscais/.test(vendas)],
  ];
}

let falhas = 0;
const relatar = (c: Caso[]) => { for (const [nome, ok] of c) { if (!ok) falhas++; console.log(`${ok ? "✓" : "✗"} ${nome}`); } };
const motor = (await import(pathToFileURL(ARQ).href)) as Motor;
const fonte = fs.readFileSync(ARQ, "utf8");
const tela = fs.readFileSync(TELA, "utf8");
const vendas = fs.readFileSync(VENDAS, "utf8");
relatar(casosDoMotor(motor));
relatar(casosDaTela(tela, vendas));
if (falhas) { console.log(`\n✗ nfse-lista: ${falhas} caso(s) reprovado(s).`); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nfse-lista-"));
let n = 0;
async function plantarMotor(nome: string, de: string, para: string, esperado: string) {
  if (!fonte.includes(de)) { console.log(`✗ DEFEITO "${nome}": o trecho sumiu do motor`); falhas++; return; }
  const arq = path.join(tmp, `lista-${n++}.ts`);
  fs.writeFileSync(arq, fonte.replace(de, para));
  const caiu = casosDoMotor((await import(pathToFileURL(arq).href)) as Motor).filter(([, p]) => !p).map(([c]) => c);
  const ok = caiu.includes(esperado); if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗"} defeito plantado "${nome}" derruba "${esperado}"${ok ? "" : ` (caíram: ${caiu.join(" | ") || "nenhum"})`}`);
}
function plantarTela(nome: string, de: string, para: string, esperado: string) {
  if (!tela.includes(de)) { console.log(`✗ DEFEITO "${nome}": o trecho sumiu da tela`); falhas++; return; }
  const caiu = casosDaTela(tela.replace(de, para), vendas).filter(([, p]) => !p).map(([c]) => c);
  const ok = caiu.includes(esperado); if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗"} defeito plantado "${nome}" derruba "${esperado}"${ok ? "" : ` (caíram: ${caiu.join(" | ") || "nenhum"})`}`);
}

await plantarMotor("só notas de venda", '.filter((n) => n.status !== "rascunho")', '.filter((n) => n.status !== "rascunho" && vendaDaNota.has(n.id))', "lista: a nota avulsa entra (a nº 62 sumia da tela)");
await plantarMotor("rascunho na lista", '.filter((n) => n.status !== "rascunho")', ".filter(() => true)", "lista: o rascunho não é nota e fica fora");
await plantarMotor("enviada fora das emitidas", 'export const notaEmitida = (s: StatusNota) => s === "autorizada" || s === "enviada";', 'export const notaEmitida = (s: StatusNota) => s === "autorizada";', "resumo: emitidas = autorizadas + enviadas (150 em 2)");
plantarTela("lista volta a ler a venda", "const emitidas = linhas.filter((n) => notaEmitida(n.status));", "const emitidas = (vendas ?? []).filter((v) => v.statusNF === \"emitida\");", "tela: nada da lista lê o status da nota gravado na venda");
plantarTela("resumo de outra fonte", "painelDasNotas(linhas)", "painelDasNotas(linhasDasNotas(listNfse(), new Map()))", "tela: o resumo sai das MESMAS linhas (painelDasNotas)");

fs.rmSync(tmp, { recursive: true, force: true });
if (falhas) { console.log(`\n✗ nfse-lista: ${falhas} defeito(s) plantado(s) passaram.`); process.exit(1); }
console.log("\n✓ nfse-lista: a tela de notas lê as notas, e cada defeito plantado reprovou.");
