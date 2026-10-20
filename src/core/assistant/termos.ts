/**
 * TERMOS EXPLICADOS — o jargão financeiro que a resposta usa, dito em
 * palavras simples, para quem não é do ramo.
 *
 * O motor nativo responde com o vocabulário certo ("runway", "EBITDA",
 * "inadimplência"), e o dono de uma empresa pequena nem sempre sabe o que é.
 * Uma resposta que ele não entende não ajuda a decidir nada. Esta função
 * acrescenta, no fim, a explicação curta dos termos que apareceram — no
 * máximo dois, para a explicação não ficar maior que a resposta.
 *
 * ⚠️ Nada aqui tem número: a explicação é do CONCEITO. O número continua
 * sendo o do motor, e a conferência de número inventado não muda.
 */

export interface TermoExplicado {
  /** Como aparece no texto da resposta (regex, sem acento, sem caixa). */
  padrao: RegExp;
  /** O nome que vai em negrito. */
  nome: string;
  /** O que é, numa frase que um leigo entende. */
  explica: string;
}

export const TERMOS_EXPLICADOS: TermoExplicado[] = [
  { padrao: /\brunway\b/, nome: "Runway", explica: "é por quanto tempo o dinheiro em caixa aguenta pagar as contas, se os gastos continuarem no ritmo de hoje." },
  { padrao: /\bburn( rate)?\b|\bqueima de caixa\b/, nome: "Burn", explica: "é quanto a empresa gasta a mais do que recebe por mês, ou seja, quanto o caixa diminui." },
  { padrao: /\bebitda\b/, nome: "EBITDA", explica: "é o que sobra da operação antes de juros, impostos sobre o lucro e depreciação. Mostra se o negócio em si dá lucro." },
  { padrao: /\bdre\b/, nome: "DRE", explica: "é o relatório que mostra, mês a mês, quanto a empresa vendeu, quanto gastou e quanto sobrou de lucro ou prejuízo." },
  { padrao: /\binadimplencia\b|\binadimplente/, nome: "Inadimplência", explica: "é o dinheiro que clientes deviam ter pago e ainda não pagaram, depois do vencimento." },
  { padrao: /\bmargem (liquida|bruta|operacional)?\b|\bmargem\b/, nome: "Margem", explica: "é a fatia do que se vende que sobra depois de pagar os custos. Quanto maior, melhor." },
  { padrao: /\bponto de equilibrio\b|\bbreak.?even\b/, nome: "Ponto de equilíbrio", explica: "é quanto a empresa precisa faturar por mês para pagar todas as contas sem lucro nem prejuízo." },
  { padrao: /\bticket medio\b/, nome: "Ticket médio", explica: "é o valor médio de cada venda." },
  { padrao: /\bcompetencia\b/, nome: "Competência", explica: "é o mês em que a venda ou o gasto aconteceu, mesmo que o dinheiro entre ou saia em outro mês." },
  { padrao: /\bconcilia(cao|r|do|da)\b/, nome: "Conciliação", explica: "é conferir se o que está lançado no sistema bate com o extrato do banco." },
  { padrao: /\bmrr\b/, nome: "MRR", explica: "é a receita que se repete todo mês, como assinaturas e contratos." },
  { padrao: /\barr\b/, nome: "ARR", explica: "é a receita recorrente do mês projetada para o ano inteiro." },
  { padrao: /\bchurn\b/, nome: "Churn", explica: "é a parcela de clientes que cancelou ou deixou de pagar no período." },
  { padrao: /\bltv\b/, nome: "LTV", explica: "é quanto, em média, um cliente deixa de lucro enquanto continua comprando." },
  { padrao: /\bcac\b/, nome: "CAC", explica: "é quanto custa conquistar cada cliente novo, somando marketing e vendas." },
  { padrao: /\bliquidez\b/, nome: "Liquidez", explica: "é a capacidade de pagar as contas que vencem logo com o dinheiro disponível." },
  { padrao: /\bcapital de giro\b/, nome: "Capital de giro", explica: "é o dinheiro que a empresa precisa ter para tocar o dia a dia enquanto espera os clientes pagarem." },
  { padrao: /\bfluxo de caixa livre\b/, nome: "Fluxo de caixa livre", explica: "é o dinheiro que sobra da operação depois dos gastos e investimentos, livre para usar." },
  { padrao: /\bcarga tributaria\b/, nome: "Carga tributária", explica: "é quanto do faturamento vai para impostos." },
  { padrao: /\bprovis(ao|ionar)\b/, nome: "Provisão", explica: "é separar hoje um dinheiro para uma conta que vai chegar depois, como o décimo terceiro." },
  { padrao: /\bprazo medio de recebimento\b|\bdso\b/, nome: "Prazo médio de recebimento", explica: "é quantos dias, em média, os clientes levam para pagar." },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const JA_EXPLICADO = /ou seja|significa|quer dizer|— e |: (a|o) /;

/** A frase do texto que contém a posição. */
function fraseEm(t: string, pos: number): string {
  const ini = Math.max(t.lastIndexOf(". ", pos), t.lastIndexOf("\n", pos)) + 1;
  const fins = [t.indexOf(". ", pos), t.indexOf("\n", pos)].filter((i) => i >= 0);
  return t.slice(ini, fins.length ? Math.min(...fins) : t.length);
}

/** Os termos da lista que aparecem no texto, na ordem em que aparecem. */
export function termosNoTexto(texto: string): TermoExplicado[] {
  const t = semAcento(texto);
  return TERMOS_EXPLICADOS
    .map((termo) => ({ termo, pos: t.search(termo.padrao) }))
    .filter((x) => x.pos >= 0)
    // Já explicado na própria frase ("runway (por quanto tempo…)", "ou seja",
    // "— é o faturamento…") não repete.
    .filter((x) => !JA_EXPLICADO.test(fraseEm(t, x.pos)) && !/^\s*\(/.test(t.slice(x.pos).replace(x.termo.padrao, "")))
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.termo);
}

/**
 * A resposta com a explicação dos termos no fim. Sem termo de jargão, devolve
 * o texto como veio.
 */
export function explicarTermos(texto: string, max = 2): string {
  if (!texto) return texto;
  const termos = termosNoTexto(texto).slice(0, max);
  if (!termos.length) return texto;
  const linhas = termos.map((x) => `**${x.nome}** ${x.explica}`);
  return `${texto.trimEnd()}\n\nPara entender: ${linhas.join(" ")}`;
}
