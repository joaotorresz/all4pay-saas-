/**
 * painel-conversa — painéis montados pela conversa (Fase 4.6 do plano,
 * 04/11/2026).
 *
 *   npm run painel-conversa        (dentro de npm test)
 *
 * O painel customizado só se montava arrastando widget por widget. Agora a
 * conversa monta ("coloca o saldo em cima", "tira o runway"), como a Home já
 * faz. A guarda reprova se alguém desfizer:
 *
 *   VALOR
 *   1. "em cima" leva o cartão ao topo; pedir de novo não duplica;
 *   2. o mais específico vence ("vencido a receber" não vira "a receber",
 *      "resultado dos 12 meses" é a série, "saldo acumulado" não é o saldo);
 *   3. "tira" remove, e tirar o que não está não muda nada;
 *   4. o trecho sem verbo herda o anterior ("põe X e Y");
 *   5. indicador fora do catálogo (EBITDA) é dito, e não vira cartão de outra
 *      coisa com o nome dele;
 *   6. "como estou hoje?" monta o básico sem repetir cartão;
 *   7. pedido que não se entende não mexe no painel e lista o que dá;
 *   8. o pedido não altera a lista de entrada (o desfazer depende disso).
 *
 *   FORMA
 *   9. "Criar com IA" abre o painel com a conversa, e o editor tem "Montar
 *      pela conversa" no lugar do botão que despejava a sugestão;
 *  10. a conversa não salva: o "Salvar" do editor segue o único escritor.
 */
import { readFileSync } from "node:fs";
import { aplicarPedidoPainel, respostaDoPedidoPainel } from "@/core/dashboards/conversa";
import type { Widget } from "@/core/dashboards";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${det ? ` — ${det}` : ""}`); }
};
const kpi = (fonte: string, titulo = fonte): Widget => ({ id: `w-${fonte}`, tipo: "kpi", titulo, largura: 1, fonte });
const fontes = (ws: Widget[]) => ws.map((w) => ("fonte" in w ? `${w.tipo}:${w.fonte}` : w.tipo)).join(",");

console.log("\nvalor");
const base = [kpi("receita_mes"), kpi("saldo"), kpi("runway")];
const cima = aplicarPedidoPainel("Coloca o saldo em cima", base);
ok("1. 'em cima' leva o saldo ao topo", fontes(cima.widgets) === "kpi:saldo,kpi:receita_mes,kpi:runway", fontes(cima.widgets));
ok("1. a conversa conta o que mudou", cima.mudancas.join(" ") === "Levei Saldo em caixa para cima.", cima.mudancas.join(" "));
ok("1. pedir de novo não duplica", aplicarPedidoPainel("coloca o saldo em cima", cima.widgets).widgets.length === 3);

const venc = aplicarPedidoPainel("Põe o vencido a receber e o a pagar", []);
ok("2+4. 'vencido a receber' e 'a pagar' (o segundo herda o verbo)", fontes(venc.widgets) === "kpi:vencido_receber,kpi:a_pagar", fontes(venc.widgets));
ok("2. o título do cartão é o da fonte", venc.widgets[0]?.titulo === "Vencido a receber", venc.widgets[0]?.titulo);
const serie = aplicarPedidoPainel("Mostra o resultado dos 12 meses", []);
ok("2. 'resultado dos 12 meses' é a série", fontes(serie.widgets) === "serie:resultado_12m", fontes(serie.widgets));
const acum = aplicarPedidoPainel("quero ver o saldo acumulado", []);
ok("2. 'saldo acumulado' não é o saldo", fontes(acum.widgets) === "serie:saldo_acumulado", fontes(acum.widgets));
const pizza = aplicarPedidoPainel("mostra onde eu gasto", []);
ok("2. 'onde eu gasto' é a despesa por categoria", fontes(pizza.widgets) === "pizza:despesa_categoria", fontes(pizza.widgets));

const tira = aplicarPedidoPainel("Tira o runway", base);
ok("3. 'tira' remove", fontes(tira.widgets) === "kpi:receita_mes,kpi:saldo" && tira.mudancas[0] === "Tirei Runway.", fontes(tira.widgets));
const tiraNada = aplicarPedidoPainel("tira o burn", base);
ok("3. tirar o que não está não muda nada", fontes(tiraNada.widgets) === fontes(base) && tiraNada.mudancas.length === 0);
const misto = aplicarPedidoPainel("coloca o a receber e tira o runway", base);
ok("4. 'coloca X e tira Y' faz as duas coisas", fontes(misto.widgets) === "kpi:receita_mes,kpi:saldo,kpi:a_receber", fontes(misto.widgets));

const ebitda = aplicarPedidoPainel("Coloca o EBITDA em cima", base);
ok("5. EBITDA não vira cartão de outra coisa", fontes(ebitda.widgets) === fontes(base) && ebitda.naoTenho.join() === "EBITDA", JSON.stringify(ebitda));
ok("5. a resposta diz que ainda não tem (e não 'não entendi')",
   /EBITDA ainda não está entre os indicadores/.test(respostaDoPedidoPainel(ebitda).abertura)
   && !/Não entendi/.test(respostaDoPedidoPainel(ebitda).abertura));

const hoje = aplicarPedidoPainel("Como estou hoje?", []);
ok("6. 'como estou hoje?' monta o básico", hoje.widgets.length === 5, String(hoje.widgets.length));
ok("6. pedir de novo não repete cartão", aplicarPedidoPainel("como estou hoje", hoje.widgets).widgets.length === 5);

const nada = aplicarPedidoPainel("bom dia", base);
const rNada = respostaDoPedidoPainel(nada);
ok("7. pedido que não se entende não mexe", fontes(nada.widgets) === fontes(base) && nada.mudancas.length === 0);
ok("7. e lista o que dá para pôr", /Não entendi/.test(rNada.abertura) && /Saldo em caixa/.test(rNada.fecho));

const copia = fontes(base);
aplicarPedidoPainel("tira o saldo e coloca o burn em cima", base);
ok("8. o pedido não altera a lista de entrada", fontes(base) === copia);

console.log("\nforma");
const semComentario = (t: string) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
const tela = semComentario(readFileSync("src/components/dashboards-custom/DashboardsCustomView.tsx", "utf8"));
ok("9. 'Criar com IA' abre o painel com a conversa", /onClick=\{criarConversando\}/.test(tela) && /conversar=\{conversar\}/.test(tela));
ok("9. o editor monta pela conversa", /abrirChat\(\{ ajuste: conversaDoPainel\(\) \}\)/.test(tela) && /Montar pela conversa/.test(tela));
ok("9. o botão que despejava a sugestão saiu", !/sugerirWidgets\(\)/.test(tela));
const resp = tela.slice(tela.indexOf("responder: async"), tela.indexOf("const abrirConversa"));
ok("10. a conversa não salva o painel", resp.length > 0 && !/salvarDashboard|onSalvar/.test(resp) && /aplicarPedidoPainel\(texto, antes\)/.test(resp));

if (falhas > 0) {
  console.log(`\n✗ painel-conversa: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ painel-conversa: o painel se monta pela conversa, só com as fontes que existem\n");
