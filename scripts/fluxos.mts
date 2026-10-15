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

console.log(falhas ? `\n✗ ${falhas} falha(s)` : "\n✓ fluxos: tudo certo");
process.exit(falhas ? 1 : 0);
