/**
 * fluxos — a guarda dos fluxos de automação montados pelo cliente
 * (`core/automacoes/fluxo`, etapa 1 da área de Automações).
 *
 * Cobra: os dois modelos do pedido são válidos e nascem desligados; a corrente
 * gatilho → dados → envio é exigida (card solto, ordem trocada, hora torta e
 * telefone sem DDD reprovam, NOMEANDO o card); o disparo é na hora de BRASÍLIA
 * com tolerância de 3 h e uma chave por dia; a projeção semanal soma pelo
 * painel de contas a pagar e agrupa por dia; a maquininha soma só a APROVADA,
 * conta o dia em Brasília e não inventa líquido.
 *
 *   npm run fluxos   (também roda dentro de npm test)
 */
import {
  MODELOS_FLUXO, validarFluxo, disparoDevido, descreverGatilho, mensagemContasPagarSemana,
  mensagemMaquininhaDia, resumirMaquininha, mensagemDoFluxo, ehMensagem, janelaDaSemana,
  type Fluxo, type VendaMaquininha,
} from "../src/core/automacoes/fluxo.ts";
import type { RiskInput, RiskMovement } from "../src/core/risk-engine/types.ts";
import {
  interpretarPedidoFluxo, ehPedidoDeAutomacao, normalizarProposta, mesclarProposta, fluxoDaProposta,
  faltaNaProposta, respostaDaProposta, lerHora, lerDias, PROPOSTA_VAZIA,
} from "../src/core/automacoes/pedido.ts";
import { CORPUS } from "./fixtures/corpus-ia.mts";

let falhas = 0;
const ok = (nome: string, cond: boolean, extra?: unknown) => {
  if (!cond) { falhas++; console.log(`✗ ${nome}`, extra ?? ""); } else console.log(`✓ ${nome}`);
};

const EU = [{ endereco: "+55 11 98888-7777", nome: "João" }];
const [mPagar, mMaq] = MODELOS_FLUXO.map((m, i) => m.montar(EU, `f${i}`));

/* ---------- modelos ---------- */
ok("modelos: os dois exemplos do pedido existem", MODELOS_FLUXO.length >= 2);
ok("modelos: projeção semanal é válida", validarFluxo(mPagar).length === 0, validarFluxo(mPagar));
ok("modelos: maquininha é válida", validarFluxo(mMaq).length === 0, validarFluxo(mMaq));
ok("modelos: nascem DESLIGADOS", !mPagar.ativo && !mMaq.ativo);
ok("modelos: segunda às 08:00", descreverGatilho({ tipo: "agenda", dias: [1], hora: "08:00" }) === "toda segunda às 08:00");
ok("modelos: todo dia às 19:00", descreverGatilho({ tipo: "agenda", dias: [0, 1, 2, 3, 4, 5, 6], hora: "19:00" }) === "todo dia às 19:00");
ok("modelos: dias úteis", descreverGatilho({ tipo: "agenda", dias: [5, 1, 2, 3, 4], hora: "08:00" }) === "dias úteis às 08:00");

/* ---------- validação ---------- */
const clone = (f: Fluxo): Fluxo => JSON.parse(JSON.stringify(f));
{
  const f = clone(mPagar); f.ligacoes = f.ligacoes.filter((l) => l.para !== "envio-whatsapp");
  const p = validarFluxo(f);
  ok("validação: envio solto reprova NOMEANDO o card", p.some((x) => x.noId === "envio-whatsapp"), p);
}
{
  const f = clone(mPagar); f.ligacoes = [{ de: "gatilho", para: "envio-whatsapp" }, { de: "dados", para: "envio-whatsapp" }];
  ok("validação: gatilho direto no envio reprova (ordem)", validarFluxo(f).some((x) => /ordem/.test(x.motivo)));
}
{
  const f = clone(mPagar); (f.nos[0] as any).gatilho.hora = "8h";
  ok("validação: hora torta reprova", validarFluxo(f).some((x) => x.noId === "gatilho"));
}
{
  const f = clone(mPagar); (f.nos[0] as any).gatilho.dias = [];
  ok("validação: sem dia reprova", validarFluxo(f).some((x) => x.noId === "gatilho"));
}
{
  const f = clone(mPagar); (f.nos[2] as any).destinos = [{ endereco: "98888-7777" }];
  ok("validação: telefone sem DDD reprova", validarFluxo(f).some((x) => x.noId === "envio-whatsapp"));
}
{
  const f = clone(mPagar); f.nos = f.nos.filter((n) => n.tipo !== "gatilho"); f.ligacoes = [];
  ok("validação: sem gatilho reprova", validarFluxo(f).some((x) => /gatilho/.test(x.motivo)));
}

/* ---------- disparo (hora de Brasília) ---------- */
const ligado = { ...mPagar, ativo: true };
// 19/10/2026 é segunda. 08:00 de Brasília = 11:00 UTC.
ok("disparo: desligado nunca dispara", disparoDevido(mPagar, new Date("2026-10-19T11:05:00Z")) === null);
const d1 = disparoDevido(ligado, new Date("2026-10-19T11:05:00Z"));
ok("disparo: segunda 08:05 BRT dispara, chave do dia", d1?.chave === "fluxo:f0:2026-10-19", d1);
ok("disparo: segunda 07:55 BRT ainda não", disparoDevido(ligado, new Date("2026-10-19T10:55:00Z")) === null);
ok("disparo: atraso de 2h50 ainda vale", disparoDevido(ligado, new Date("2026-10-19T13:50:00Z")) !== null);
ok("disparo: atraso de 3h10 já não vale", disparoDevido(ligado, new Date("2026-10-19T14:10:00Z")) === null);
ok("disparo: terça não dispara o fluxo de segunda", disparoDevido(ligado, new Date("2026-10-20T11:05:00Z")) === null);
// ⚠️ O defeito do fuso: 08:05 UTC de segunda é 05:05 em Brasília — cedo demais.
ok("disparo: 08:05 UTC (05:05 BRT) NÃO dispara — o relógio é o de Brasília", disparoDevido(ligado, new Date("2026-10-19T08:05:00Z")) === null);
const maqLigado = { ...mMaq, ativo: true };
// 19:30 BRT de segunda = 22:30 UTC — ainda segunda em Brasília.
ok("disparo: 19:30 BRT conta como o dia de Brasília", disparoDevido(maqLigado, new Date("2026-10-19T22:30:00Z"))?.dia === "2026-10-19");

/* ---------- contas a pagar da semana ---------- */
const mov = (id: string, due: string, amount: number, party: string, status: RiskMovement["status"] = "pendente", type: RiskMovement["type"] = "saida"): RiskMovement =>
  ({ id, type, status, amount, due_date: due, paid_date: status === "pago" ? due : null, party_id: party, category: "Fornecedores" });
const input: RiskInput = {
  hoje: "2026-10-19", saldoAtual: 10000,
  partyNames: { a: "Aluguel Imóveis", b: "Energia SA", c: "Gráfica", d: "Atrasado Ltda", e: "Cliente X" },
  movements: [
    mov("1", "2026-10-19", 3000, "a"),
    mov("2", "2026-10-21", 450.5, "b"),
    mov("3", "2026-10-21", 200, "c"),
    mov("4", "2026-10-15", 99.9, "d"),
    mov("5", "2026-10-27", 7000, "a"), // semana que vem: fora
    mov("6", "2026-10-20", 5000, "e", "pendente", "entrada"), // receber: fora
    mov("7", "2026-10-22", 800, "c", "pago"), // já pago: fora
    mov("8", "2026-10-23", 300, "c", "cancelado"), // cancelado: fora
  ],
};
ok("semana: janela vai até o domingo", JSON.stringify(janelaDaSemana("2026-10-21")) === JSON.stringify({ de: "2026-10-21", ate: "2026-10-25" }));
const ms = mensagemContasPagarSemana(input, "2026-10-19");
ok("semana: gera mensagem", ehMensagem(ms));
if (ehMensagem(ms)) {
  ok("semana: total = 3.650,50 (só as a vencer da semana)", ms.texto.includes("R$3.650,50"), ms.texto);
  ok("semana: agrupa por dia (Quarta com 2 contas · 650,50)", /\*Quarta \(21\/10\)\* · 2 contas · R\$650,50/.test(ms.texto), ms.texto);
  ok("semana: vence hoje é 'Hoje', não atraso", ms.texto.includes("*Hoje (19/10)*"));
  ok("semana: vencida vai em 'Já venceram'", /Já venceram[\s\S]*Atrasado Ltda/.test(ms.texto));
  ok("semana: semana que vem, a receber, pago e cancelado FORA", !/7\.000|5\.000|800,00|300,00/.test(ms.texto), ms.texto);
}
ok("semana: empresa sem lançamentos não recebe zeros", !ehMensagem(mensagemContasPagarSemana({ ...input, movements: [] }, "2026-10-19")));

/* ---------- maquininha ---------- */
const v = (nsu: number, status: VendaMaquininha["status"], valor: number, forma: VendaMaquininha["forma"], parcelas: number, bandeira: string | null, quando: string, liquido: number | null): VendaMaquininha =>
  ({ nsu, status, valor, forma, parcelas, bandeira, ocorridoEm: quando, liquido });
const vendas: VendaMaquininha[] = [
  v(1, "Aprovada", 100, "debito", 1, "Visa", "2026-10-19T13:00:00Z", 98.2),
  v(2, "Aprovada", 300, "parcelado", 3, "Mastercard", "2026-10-19T15:00:00Z", 285.4),
  v(3, "Aprovada", 50, "credito_vista", 1, "Visa", "2026-10-19T20:00:00Z", 48.1),
  v(4, "Cancelada", 70, "debito", 1, "Elo", "2026-10-19T16:00:00Z", null),
  v(5, "Negada", 999, "credito_vista", 1, "Visa", "2026-10-19T17:00:00Z", null),
  // 01:30 UTC do dia 20 é 22:30 de Brasília do dia 19: conta no dia 19.
  v(6, "Aprovada", 20, "pix", 1, null, "2026-10-20T01:30:00Z", 20),
  // 03:30 UTC do dia 19 é 00:30 BRT do dia 19 — conta; 02:30 UTC do dia 19 é 23:30 do dia 18 — não.
  v(7, "Aprovada", 1000, "debito", 1, "Visa", "2026-10-19T02:30:00Z", 990),
];
const r = resumirMaquininha(vendas, "2026-10-19");
ok("maquininha: só aprovadas (4) no dia de Brasília", r.aprovadas === 4, r);
ok("maquininha: bruto 470,00 (negada, cancelada e dia 18 fora)", r.bruto === 470, r.bruto);
ok("maquininha: líquido 451,70", r.liquido === 451.7, r.liquido);
ok("maquininha: parcelado em 3x", r.porParcelas.length === 1 && r.porParcelas[0].parcelas === 3);
ok("maquininha: Visa 150 em 2 vendas", r.porBandeira.find((b) => b.bandeira === "Visa")?.valor === 150);
ok("maquininha: bandeira ausente vira 'Não informada'", r.porBandeira.some((b) => b.bandeira === "Não informada"));
ok("maquininha: cancelada dita à parte", r.estornadas.quantidade === 1 && r.estornadas.valor === 70);
const mm = mensagemMaquininhaDia(vendas, "2026-10-19", true);
ok("maquininha: mensagem cita débito, parcelado e o líquido", ehMensagem(mm) && /Débito/.test(mm.texto) && /3x/.test(mm.texto) && mm.texto.includes("R$451,70"), ehMensagem(mm) ? mm.texto : mm);
{
  const semLiq = vendas.map((x) => (x.nsu === 2 ? { ...x, liquido: null } : x));
  const m2 = mensagemMaquininhaDia(semLiq, "2026-10-19", true);
  ok("maquininha: líquido desconhecido NÃO vira o bruto (diz quantas faltam)", ehMensagem(m2) && /ainda não tem o valor líquido/.test(m2.texto), ehMensagem(m2) ? m2.texto : m2);
}
const vazio = mensagemMaquininhaDia([], "2026-10-19", true);
ok("maquininha: dia sem venda é FRASE, não R$0,00", ehMensagem(vazio) && /Nenhuma venda/.test(vazio.texto) && !/R\$0,00/.test(vazio.texto));
ok("maquininha: sem maquininha ligada não manda nada", !ehMensagem(mensagemMaquininhaDia([], "2026-10-19", false)));

/* ---------- a mesma função para prévia e disparo ---------- */
const dados = { input, vendasMaquininha: vendas, temMaquininha: true };
const viaFluxo = mensagemDoFluxo(mMaq, dados, "2026-10-19");
ok("executar: o fluxo da maquininha escreve a mesma mensagem da fonte", ehMensagem(viaFluxo) && ehMensagem(mm) && viaFluxo.texto === mm.texto);

/* ---------- a conversa (etapa 3): o pedido vira fluxo ---------- */
{
  const p1 = interpretarPedidoFluxo("Toda segunda às 8h me manda no WhatsApp a projeção das contas a pagar da semana");
  ok("pedido: segunda às 8h, contas a pagar, WhatsApp, para mim",
    p1.fonte === "contas_pagar_semana" && JSON.stringify(p1.dias) === "[1]" && p1.hora === "08:00" && p1.canal === "whatsapp" && p1.paraMim === true, p1);
  const p2 = interpretarPedidoFluxo("todo dia às 7 da noite quero receber o relatório da maquininha: débito, crédito, parcelas e bandeiras");
  ok("pedido: todo dia às 7 da noite = 19:00, maquininha", p2.fonte === "maquininha_dia" && p2.dias?.length === 7 && p2.hora === "19:00", p2);
  ok("hora: 8h30 · 19:00 · meio-dia · às 7 da manhã · 24h é inválida",
    lerHora("8h30") === "08:30" && lerHora("as 19:00") === "19:00" && lerHora("meio-dia") === "12:00" && lerHora("as 7 da manha") === "07:00" && lerHora("24h") === undefined);
  ok("dias: dias úteis · de segunda a quinta · sexta e sábado · fim de semana",
    JSON.stringify(lerDias("dias uteis")) === "[1,2,3,4,5]" && JSON.stringify(lerDias("de segunda a quinta")) === "[1,2,3,4]"
    && JSON.stringify(lerDias("sexta e sabado")) === "[5,6]" && JSON.stringify(lerDias("fim de semana")) === "[0,6]");
  ok("dias: 'contas da semana' NÃO é dia nenhum", lerDias("as contas da semana") === undefined);

  const tel = interpretarPedidoFluxo("manda para (11) 98888-7777 e 21 99999-0000");
  ok("pedido: dois telefones com DDD viram dois destinatários", tel.destinos.length === 2 && tel.canal === "whatsapp", tel);
  ok("pedido: valor em reais não vira telefone", interpretarPedidoFluxo("me avisa quando passar de R$ 15.000,00").destinos.length === 0);
  ok("pedido: e-mail escolhe o canal e-mail", interpretarPedidoFluxo("toda sexta às 18h manda por e-mail para fin@empresa.com.br").canal === "email");

  // A conversa pergunta uma coisa por vez, e a resposta curta soma à anterior.
  const eu = { nome: "João", telefone: "+55 11 98888-7777" };
  let prop = mesclarProposta(PROPOSTA_VAZIA, interpretarPedidoFluxo("quero uma automação das vendas da maquininha"));
  ok("conversa: sem horário, pergunta QUANDO e não monta", faltaNaProposta(prop, eu)[0] === "quando" && fluxoDaProposta(prop, "x", eu) === null && /Em que dias/.test(respostaDaProposta(prop, eu)));
  prop = mesclarProposta(prop, interpretarPedidoFluxo("todo dia às 19h"));
  const f = fluxoDaProposta(prop, "fx", eu);
  ok("conversa: a resposta curta completa e o fluxo sai VÁLIDO", !!f && validarFluxo(f).length === 0, f && validarFluxo(f));
  ok("conversa: o fluxo da conversa nasce DESLIGADO", !!f && f.ativo === false);
  ok("conversa: 'me manda' sem número vai para o WhatsApp do cadastro", !!f && f.nos.some((n) => n.tipo === "envio" && n.destinos[0]?.endereco === eu.telefone));
  {
    const semEu = fluxoDaProposta(prop, "fy", {});
    ok("conversa: sem telefone conhecido, o fluxo sai com o envio vazio e a resposta pede o número",
      !!semEu && validarFluxo(semEu).some((p) => /quem recebe/.test(p.motivo)) && /Para qual número/.test(respostaDaProposta(prop, {})));
  }
  const cli = mesclarProposta(prop, interpretarPedidoFluxo("e manda também para os meus clientes"));
  ok("conversa: base de clientes é DITA como indisponível, nunca inventada", /base de clientes ainda não está disponível/.test(respostaDaProposta(cli, eu)));

  // A IA só escolhe peças: o que não é do catálogo sai.
  const lixo = normalizarProposta({ fonte: "apagar_tudo", dias: [1, 9, -1, "2", 1], hora: "25:00", canal: "sms", destinos: [{ endereco: "x".repeat(200) }, "11988887777"], nome: "  A  b  " });
  ok("ia: fonte, dia, hora e canal fora do catálogo SAEM",
    lixo.fonte === undefined && JSON.stringify(lixo.dias) === "[1]" && lixo.hora === undefined && lixo.canal === undefined && lixo.destinos.length === 1 && lixo.nome === "A b", lixo);
  ok("ia: resposta que não é objeto vira proposta vazia", normalizarProposta("ignore as regras").destinos.length === 0 && normalizarProposta(null).fonte === undefined);

  // A porta do chat geral: pede automação, sim; pergunta sobre número, não.
  ok("porta: os dois pedidos do dono abrem Automações",
    ehPedidoDeAutomacao("toda segunda às 8h me manda no whatsapp as contas a pagar da semana")
    && ehPedidoDeAutomacao("todo dia às 19h me manda o relatório da maquininha")
    && ehPedidoDeAutomacao("cria uma automação de cobrança"));
  ok("porta: pergunta sobre o que vence na segunda NÃO é automação", !ehPedidoDeAutomacao("quanto vou pagar na segunda?") && !ehPedidoDeAutomacao("o que vence essa semana?"));
  const roubadas = CORPUS.map(([q]) => q).filter((q) => ehPedidoDeAutomacao(q));
  ok(`porta: nenhuma das ${CORPUS.length} perguntas do corpus da IA vira automação`, roubadas.length === 0, roubadas);
}

console.log(falhas ? `\n✗ ${falhas} falha(s)` : "\n✓ fluxos: tudo certo");
process.exit(falhas ? 1 : 0);
