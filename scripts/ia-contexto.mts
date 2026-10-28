/**
 * ia-contexto — guarda do botão "Pergunte à Quattro AI" do rodapé
 * (`core/ia/contexto-tela`). Cobra o que faz o botão prestar:
 *  - toda pergunta sugerida é respondida pelo motor nativo (sugestão que cai
 *    em "não entendi" é pior que nenhuma);
 *  - todo "adicionar" leva a uma rota que existe no inventário;
 *  - todo ícone existe no mapa do `Icon`;
 *  - o prefixo mais longo vence (a folha não vira "contas a pagar");
 *  - a Home e a própria IA não ganham o botão.
 *
 *   npm run ia-contexto
 */
import { readFileSync } from "node:fs";
import { responderLocal } from "@/core/assistant/engine";
import { INVENTARIO } from "@/core/rotas/inventario";
import { MOLDES_DE_TELA, botaoNaTela, contextoDaTela } from "@/core/ia/contexto-tela";
import { input, ctx } from "./fixtures/corpus-ia.mts";

const falhas: string[] = [];
const ok = (nome: string, cond: boolean) => { if (!cond) falhas.push(nome); };

const icones = readFileSync(new URL("../src/components/ui/lucide-icons.ts", import.meta.url), "utf8");
const temIcone = (k: string) => new RegExp(`^\\s+"?${k}"?:`, "m").test(icones);
const rotas = new Set(INVENTARIO.map((r) => r.rota));

let perguntas = 0;
const todos = [...MOLDES_DE_TELA.map((m) => contextoDaTela(m.rota)), contextoDaTela("/lixeira", "Lixeira")];
for (const c of todos) {
  ok(`${c.rota}: abertura é pergunta`, /\?$/.test(c.abertura));
  ok(`${c.rota}: tem caminho de saber`, c.caminhos.some((x) => x.tipo === "saber"));
  ok(`${c.rota}: ids únicos`, new Set(c.caminhos.map((x) => x.id)).size === c.caminhos.length);
  for (const x of c.caminhos) {
    ok(`${x.id}: ícone "${x.icone}" existe`, temIcone(x.icone));
    if (x.tipo === "adicionar") ok(`${x.id}: rota ${x.href} existe`, !!x.href && rotas.has(x.href));
    else {
      perguntas++;
      const r = x.pergunta ? responderLocal(x.pergunta, input, ctx) : null;
      ok(`${x.id}: "${x.pergunta}" é respondida pelo motor`, !!r && r.resposta.length > 0);
    }
  }
}
for (const m of MOLDES_DE_TELA) ok(`${m.rota}: rota do molde existe ou é prefixo`, [...rotas].some((r) => r === m.rota || r.startsWith(`${m.rota}/`)));

ok("folha casa a folha, não contas a pagar", contextoDaTela("/contas-a-pagar/folha").rota === "/contas-a-pagar/folha");
ok("títulos a pagar casam contas a pagar", contextoDaTela("/contas-a-pagar/painel-de-despesas").rota === "/contas-a-pagar/painel-de-despesas");
ok("fluxo de caixa abre falando do fluxo", /fluxo de caixa/.test(contextoDaTela("/fluxo-caixa").abertura));
ok("tela sem molde usa o nome da tela", contextoDaTela("/lixeira", "Lixeira").abertura.includes("Lixeira"));
ok("sem botão na Home", !botaoNaTela("/"));
ok("sem botão na própria IA", !botaoNaTela("/quattro-ai"));
ok("sem botão na plataforma", !botaoNaTela("/admin/clientes"));
ok("botão no fluxo de caixa", botaoNaTela("/fluxo-caixa"));

for (const f of falhas) console.log(`✗ ${f}`);
console.log(`\n${falhas.length ? `✗ ${falhas.length} FALHA(S)` : "✓ ia-contexto"} — ${todos.length} telas · ${perguntas} perguntas no motor`);
if (falhas.length) process.exit(1);
