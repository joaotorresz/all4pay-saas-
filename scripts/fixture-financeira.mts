/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FIXTURE FINANCEIRA — uma empresa sintética que ACENDE TODAS AS LINHAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Ela existe separada de `scripts/fixture.mts` de propósito.** Aquela é a
 * fixture das ARMADILHAS: cada linha é um caso que já produziu número errado
 * (pendente com `paid_date`, cancelado de valor alto, entrada que não é
 * faturamento). Esta é a fixture da CASCATA: cada linha existe para que uma
 * linha do DRE e do DFC receba valor e possa ser travada num literal.
 *
 * ⚠️ **A regra que ela obedece (a 4ª): o valor esperado é escrito À MÃO.**
 * Nenhum número aqui sai de chamar a função que o teste audita. Se a cascata
 * ganhar um defeito, o literal discorda — que é a única forma de o teste medir
 * em vez de concordar por construção.
 *
 * ⚠️ **E ela prova que o caminho recebeu valor.** Verde sobre o vazio é pior
 * que vermelho: por isso há asserção de que cada linha da cascata é DIFERENTE
 * de zero (menos as que devem mesmo ser zero, e essas são nomeadas).
 *
 * As categorias foram escolhidas contra os classificadores REAIS de
 * `core/relatorios` — `ehImpostoVenda`, `ehCustoVariavel`, `ehDespesaVariavel`,
 * `ehFinanceiro`, `ehImpostoLucro`, `ehNaoOperacional`, `ehDepreciacao`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

/** Hoje = fim de julho: as três colunas (mai · jun · jul) já aconteceram. */
export const HOJE_FIN = "2026-07-31";

/**
 * ⚠️ Escolhido para que o saldo inicial de MAIO caia num literal redondo
 * (R$ 80.000,00) e o saldo final de JULHO volte exatamente a ele — o DFC
 * reconstrói o saldo de trás para frente a partir de hoje, e essa volta é a
 * prova de que a reconstrução fecha.
 */
export const SALDO_ATUAL_FIN = 101_400.25;

const mv = (
  id: string, type: "entrada" | "saida", status: "pago" | "pendente" | "cancelado",
  amount: number, due: string, paid: string | null, category: string, party = "P1",
): RiskMovement => ({ id, type, status, amount, due_date: due, paid_date: paid, category, party_id: party });

export const MOV_FIN: RiskMovement[] = [
  /* ─────────────────────────── MAIO — o mês cheio ───────────────────────── */
  // Receita Bruta Operacional
  mv("r1", "entrada", "pago", 100_000.00, "2026-05-05", "2026-05-05", "Vendas de produtos", "CLI-A"),
  // ⚠️ CENTAVOS: a cascata inteira carrega os 50 centavos até o resultado.
  mv("r2", "entrada", "pago", 50_000.50, "2026-05-10", "2026-05-12", "Serviços prestados", "CLI-B"),
  // ⚠️ PENDENTE: existe na COMPETÊNCIA (DRE) e não existe no CAIXA (DFC). É o
  // que impede o DRE e o DFC de darem o mesmo número por acidente — e sem essa
  // diferença, um teste que trocasse os dois passaria.
  mv("r3", "entrada", "pendente", 20_000.00, "2026-05-20", null, "Vendas de produtos", "CLI-C"),

  // Dedução sobre Produtos e Serviços
  mv("d1", "saida", "pago", 12_000.00, "2026-05-20", "2026-05-20", "Simples Nacional (DAS)", "GOV"),
  mv("d2", "saida", "pago", 3_000.00, "2026-05-22", "2026-05-22", "Devolução de venda", "CLI-A"),

  // Custos Variáveis
  mv("cv1", "saida", "pago", 40_000.00, "2026-05-08", "2026-05-08", "CMV — mercadoria", "FOR-1"),
  mv("cv2", "saida", "pago", 2_500.25, "2026-05-09", "2026-05-09", "Frete sobre vendas", "FOR-2"),

  // Despesas Variáveis
  mv("dv1", "saida", "pago", 7_000.00, "2026-05-15", "2026-05-15", "Comissão de vendedores", "VEN-1"),
  mv("dv2", "saida", "pago", 5_500.00, "2026-05-16", "2026-05-16", "Marketing e anúncios", "AG-1"),

  // Despesas Operacionais
  mv("do1", "saida", "pago", 30_000.00, "2026-05-05", "2026-05-05", "Folha de pagamento", "EQ"),
  mv("do2", "saida", "pago", 8_000.00, "2026-05-10", "2026-05-10", "Aluguel do escritório", "LOC"),

  /*
   * Depreciação e Amortização — linha PRÓPRIA, abaixo do EBITDA.
   *
   * ⚠️ Lançada como PENDENTE, e é decisão: depreciação não é paga a ninguém. Se
   * entrasse como `pago`, o DFC a subtrairia do caixa — e uma saída de caixa
   * que nunca saiu do caixa é justamente o que o "A" de EBITDA existe para
   * separar. Fica REGISTRADO como limitação do produto: o DFC não tem noção de
   * despesa não-caixa, então quem lançar depreciação como paga verá o caixa
   * cair. A fixture não esconde isso — ela evita fingir que o produto resolve.
   */
  mv("da1", "saida", "pendente", 2_000.00, "2026-05-31", null, "Depreciação de equipamentos", "INT"),

  // Resultado Financeiro — linha "+/-": entra com o SINAL do movimento.
  mv("f1", "entrada", "pago", 1_200.00, "2026-05-28", "2026-05-28", "Rendimento de aplicação", "BCO"),
  mv("f2", "saida", "pago", 800.00, "2026-05-28", "2026-05-28", "Juros e tarifas bancárias", "BCO"),

  /*
   * Impostos sobre o Lucro.
   * ⚠️ Esta linha era INALCANÇÁVEL antes do `!ehImpostoLucro` na dedução:
   * `ehImpostoVenda` casa `\birpj\b` e levava o movimento primeiro. A fixture
   * mantém o caso vivo — com 6.000 aqui, um retrocesso derruba o literal da
   * dedução E o do resultado líquido no mesmo instante.
   */
  mv("il1", "saida", "pago", 6_000.00, "2026-05-25", "2026-05-25", "IRPJ e CSLL", "GOV"),

  // Resultado não Operacional — linha "+/-".
  mv("no1", "entrada", "pago", 10_000.00, "2026-05-18", "2026-05-18", "Venda de ativo imobilizado", "COMP"),

  /*
   * ⚠️ TRANSFERÊNCIA: não é linha, é a AUSÊNCIA de linha, declarada. Ela some
   * do DRE e do DFC inteiros. Sem a declaração, o palpite por palavra-chave a
   * jogaria em despesa operacional e o custo da empresa subiria R$ 25.000 de
   * dinheiro que só trocou de bolso.
   */
  mv("tr1", "saida", "pago", 25_000.00, "2026-05-27", "2026-05-27", "Transferência entre contas", "SELF"),
  mv("tr2", "entrada", "pago", 25_000.00, "2026-05-27", "2026-05-27", "Transferência entre contas", "SELF"),

  // ⚠️ CANCELADO de valor alto: não conta em lugar nenhum, nos dois regimes.
  mv("x1", "entrada", "cancelado", 999_999.99, "2026-05-14", "2026-05-14", "Vendas de produtos", "CLI-A"),

  /* ───────────── JUNHO — o mês SEM MOVIMENTO NENHUM (de propósito) ───────── */
  // ⚠️ Nada aqui. Um mês vazio tem de sair ZERO em toda linha e manter o saldo
  // — e a coluna precisa APARECER, senão o relatório liga maio a julho como se
  // junho não existisse.

  /* ─────────────────────── JULHO — o mês NEGATIVO ────────────────────────── */
  mv("j1", "saida", "pago", 25_000.00, "2026-07-05", "2026-07-05", "Folha de pagamento", "EQ"),

  /* ──────────── recebíveis em aberto, FORA da janela do relatório ────────── */
  /*
   * ⚠️ Eles ficam fora de propósito, e a razão é uma armadilha que eu caí
   * escrevendo esta fixture: um recebível em aberto com vencimento DENTRO da
   * janela entra na competência e vira receita bruta daquele mês — o "mês sem
   * movimento nenhum" deixaria de existir sem eu perceber, e o literal de
   * junho passaria a medir outra coisa. Envelhecimento é POSIÇÃO (carteira
   * inteira, sem recorte); o relatório é FLUXO (janela). Misturar os dois na
   * mesma janela apaga justamente o caso que o mês vazio existe para provar.
   */
  mv("ab1", "entrada", "pendente", 1_500.00, "2026-08-22", null, "Vendas de produtos", "CLI-D"),
  mv("ab2", "entrada", "pendente", 4_000.00, "2026-04-10", null, "Vendas de produtos", "CLI-E"),
];

/**
 * ⚠️ A declaração da transferência é do FILTRO, não do movimento: é assim que o
 * relatório a reconhece. A chave é a categoria em minúsculas, sem espaços nas
 * pontas — a mesma normalização que `montarRelatorio` aplica.
 */
export const LINHA_POR_CATEGORIA_FIN: Record<string, string> = {
  "transferência entre contas": "transferencia",
};

export const INPUT_FIN: RiskInput = {
  hoje: HOJE_FIN,
  saldoAtual: SALDO_ATUAL_FIN,
  movements: MOV_FIN,
  partyNames: {
    "CLI-A": "Cliente A", "CLI-B": "Cliente B", "CLI-C": "Cliente C",
    "CLI-D": "Cliente D", "CLI-E": "Cliente E",
    "FOR-1": "Fornecedor 1", "FOR-2": "Transportadora",
    "VEN-1": "Vendedor", "AG-1": "Agência", EQ: "Equipe", LOC: "Locador",
    BCO: "Banco", GOV: "Receita", COMP: "Comprador", SELF: "Conta própria", INT: "Interno",
  },
} as RiskInput;

export const INTERVALO_FIN = { de: "2026-05-01", ate: "2026-07-31" };

/**
 * ⚠️ **A MESMA EMPRESA, QUEIMANDO.** Na fixture acima a operação GERA caixa —
 * então `burn` dá zero e `runway` sai `indisponivel` com o código `sem_queima`.
 * Travar burn e runway ali seria comparar zeros: o caso não discrimina nada.
 * Esta variante acrescenta uma folha extra em julho e passa a queimar, e é
 * sobre ela que os dois literais são cobrados.
 *
 * ⚠️ As duas convivem de propósito. `sem_queima` é uma resposta legítima e
 * também precisa de teste — a ONDA 4 mostrou que a alternativa (devolver o
 * teto) vira "33 meses de fôlego" ao lado de burn zero.
 */
export const INPUT_FIN_QUEIMA: RiskInput = {
  ...INPUT_FIN,
  movements: [
    ...MOV_FIN,
    mv("q1", "saida", "pago", 60_000.00, "2026-07-20", "2026-07-20", "Folha de pagamento", "EQ"),
  ],
} as RiskInput;
