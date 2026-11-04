/**
 * ia-widgets — guarda dos MOTORES como cartões da conversa
 * (`core/assistant/widgets`, Fase 2 de 03/11/2026). Cobra:
 *  - a pergunta de cada atalho abre o cartão DELE (atalho que abre outro
 *    cartão, ou nenhum, é atalho quebrado);
 *  - as frases de quem pergunta de verdade caem no cartão certo, e as que não
 *    pedem motor não ganham cartão nenhum;
 *  - a tela completa de cada motor existe e segue Pro no servidor;
 *  - os motores não voltaram ao menu (a decisão tem as duas metades);
 *  - a pergunta de cada atalho tem texto sem a chave da IA: o motor nativo
 *    ou o copiloto determinístico responde (cartão sem texto não).
 *
 *   npm run ia-widgets
 */
import { readFileSync } from "node:fs";
import { WIDGETS_IA, widgetDaPergunta, widgetValido } from "@/core/assistant/widgets";
import { responderLocal } from "@/core/assistant/engine";
import { copilotoFinanceiro } from "@/core/executive";
import { INVENTARIO } from "@/core/rotas/inventario";
import { ROTAS_PRO } from "@/core/planos";
import { input, ctx } from "./fixtures/corpus-ia.mts";

const falhas: string[] = [];
const ok = (nome: string, cond: boolean) => { if (!cond) falhas.push(nome); };

const rotas = new Set(INVENTARIO.map((r) => r.rota));
for (const w of WIDGETS_IA) {
  ok(`${w.id}: o atalho "${w.pergunta}" abre o próprio cartão (abriu ${widgetDaPergunta(w.pergunta)})`, widgetDaPergunta(w.pergunta) === w.id);
  ok(`${w.id}: a tela completa ${w.rota} existe no inventário`, rotas.has(w.rota));
  ok(`${w.id}: a tela completa ${w.rota} segue Pro no servidor`, (ROTAS_PRO as readonly string[]).some((p) => w.rota === p || w.rota.startsWith(p + "/")));
  const texto = responderLocal(w.pergunta, input, ctx)?.resposta ?? copilotoFinanceiro(w.pergunta, ctx).resposta;
  ok(`${w.id}: "${w.pergunta}" tem texto sem a chave da IA`, !!texto && texto.length > 0);
}

const CASOS: [string, string | null][] = [
  ["qual o meu risco de caixa?", "risco"],
  ["Quanto tempo o caixa aguenta?", "risco"],
  ["vou ficar sem dinheiro?", "risco"],
  ["qual o meu runway", "risco"],
  ["o que devo fazer agora?", "decisao"],
  ["meu caixa vai ficar negativo?", "decisao"],
  ["como está a saúde financeira?", "saude"],
  ["qual a nota da empresa", "saude"],
  ["o que você sugere?", "sugestoes"],
  ["quais as suas sugestões", "sugestoes"],
  // Não pedem motor:
  ["quanto vendi este mês?", null],
  ["o que é burn rate?", null],
  ["quais contas vencem hoje?", null],
  ["gastei 100 de gasolina", null],
];
for (const [q, esperado] of CASOS) {
  const veio = widgetDaPergunta(q);
  ok(`"${q}" → ${esperado ?? "sem cartão"} (veio ${veio ?? "sem cartão"})`, veio === esperado);
}

ok("id fora do catálogo é recusado", widgetValido("nao-existe") === null && widgetValido(3) === null);
ok("id do catálogo é aceito", widgetValido("risco") === "risco");

// Os motores saíram do menu: a linha de volta reprova aqui.
const nav = readFileSync(new URL("../src/components/dashboard/nav-data.ts", import.meta.url), "utf8");
for (const w of WIDGETS_IA) {
  ok(`menu: ${w.rota} voltou como linha do menu (o motor é cartão da conversa)`, !new RegExp(`href:\\s*"${w.rota}"`).test(nav));
}

if (falhas.length) {
  console.error(`ia-widgets: ${falhas.length} falha(s)\n - ` + falhas.join("\n - "));
  process.exit(1);
}
console.log(`ia-widgets: ${WIDGETS_IA.length} cartões, ${CASOS.length} frases, menu sem os motores. OK`);
