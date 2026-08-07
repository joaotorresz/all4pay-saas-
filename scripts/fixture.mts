/**
 * A FIXTURE — o dataset determinístico que as guardas compartilham.
 *
 * ⚠️ Vive num arquivo só porque duas guardas que conferem a MESMA coisa sobre
 * datasets diferentes podem discordar sem que nenhuma esteja errada — e aí a
 * divergência que elas existem para achar passa entre as duas. Cada linha aqui
 * é uma armadilha específica que já produziu número errado em tela.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

export const HOJE = "2026-08-15";
export const SALDO = 42_000;

export const mv = (
  id: string, type: "entrada" | "saida", status: "pago" | "pendente" | "cancelado",
  amount: number, due: string, paid?: string | null, category = "Geral", party = "A",
): RiskMovement => ({ id, type, status, amount, due_date: due, paid_date: paid ?? null, category, party_id: party });

export const DATASET: RiskMovement[] = [
  // — liquidados dentro do mês corrente —
  mv("e1", "entrada", "pago", 12_000, "2026-08-03", "2026-08-03", "Vendas", "A"),
  mv("e2", "entrada", "pago", 8_500, "2026-08-10", "2026-08-11", "Serviços", "B"),
  mv("s1", "saida", "pago", 4_200, "2026-08-05", "2026-08-05", "Folha", "F"),
  mv("s2", "saida", "pago", 1_800, "2026-08-12", "2026-08-12", "Aluguel", "G"),
  // — ARMADILHA 1: pago com paid_date FORA do mês (competência ≠ caixa) —
  mv("e3", "entrada", "pago", 5_000, "2026-07-28", "2026-08-02", "Vendas", "A"),
  // — ARMADILHA 2: pendente COM paid_date preenchido. Três regras diferentes
  //   do sistema discordavam exatamente aqui. Não é caixa: não foi liquidado. —
  mv("x1", "entrada", "pendente", 9_900, "2026-08-20", "2026-08-20", "Vendas", "A"),
  // — ARMADILHA 3: pendente vencido (inadimplência) —
  mv("v1", "entrada", "pendente", 3_300, "2026-07-10", null, "Vendas", "C"),
  mv("v2", "entrada", "pendente", 1_100, "2026-08-14", null, "Vendas", "C"),
  // — ARMADILHA 4: vence HOJE — não está vencido —
  mv("h1", "entrada", "pendente", 7_000, "2026-08-15", null, "Vendas", "D"),
  // — ARMADILHA 5: cancelado com valor alto — não conta em lugar nenhum —
  mv("c1", "entrada", "cancelado", 50_000, "2026-08-08", "2026-08-08", "Vendas", "A"),
  // — ARMADILHA 6: entradas que NÃO são faturamento —
  mv("t1", "entrada", "pago", 20_000, "2026-08-06", "2026-08-06", "Transferência entre contas", "A"),
  mv("t2", "entrada", "pago", 900, "2026-08-07", "2026-08-07", "Rendimento de aplicação", "A"),
  mv("t3", "entrada", "pago", 15_000, "2026-08-09", "2026-08-09", "Empréstimo bancário", "A"),
  // — histórico para o ritmo de 90 dias —
  mv("h2", "entrada", "pago", 11_000, "2026-06-05", "2026-06-05", "Vendas", "A"),
  mv("h3", "saida", "pago", 14_500, "2026-06-20", "2026-06-20", "Folha", "F"),
  mv("h4", "entrada", "pago", 9_000, "2026-07-05", "2026-07-05", "Vendas", "B"),
  mv("h5", "saida", "pago", 16_000, "2026-07-18", "2026-07-18", "Folha", "F"),
  // — pagáveis vencidos (o outro lado) —
  mv("p1", "saida", "pendente", 2_400, "2026-08-01", null, "Fornecedores", "F"),
];

export const INPUT: RiskInput = {
  hoje: HOJE, saldoAtual: SALDO, movements: DATASET,
  partyNames: { A: "Alpha", B: "Beta", C: "Gama", D: "Delta", F: "Forn", G: "Loc" },
} as RiskInput;


/**
 * ⚠️ A EMPRESA QUE QUEIMA CAIXA.
 *
 * A fixture principal gera caixa, e por isso o burn dela é ZERO e o runway bate
 * no teto. Reconciliar burn e runway ali seria comparar zeros com zeros: os
 * pares fechariam por degeneração, não por acordo — e uma guarda que passa
 * porque não há o que comparar é pior que nenhuma, porque produz confiança.
 *
 * Aqui a operação queima de verdade (despesa recorrente maior que a receita),
 * então cada motor precisa chegar ao MESMO número diferente de zero.
 */
export const INPUT_QUEIMANDO: RiskInput = {
  hoje: HOJE,
  saldoAtual: 90_000,
  movements: [
    mv("qe1", "entrada", "pago", 20_000, "2026-06-05", "2026-06-05", "Vendas", "A"),
    mv("qe2", "entrada", "pago", 18_000, "2026-07-05", "2026-07-05", "Vendas", "A"),
    mv("qe3", "entrada", "pago", 16_000, "2026-08-05", "2026-08-05", "Vendas", "A"),
    mv("qs1", "saida", "pago", 41_000, "2026-06-10", "2026-06-10", "Folha", "F"),
    mv("qs2", "saida", "pago", 39_500, "2026-07-10", "2026-07-10", "Folha", "F"),
    mv("qs3", "saida", "pago", 38_250, "2026-08-10", "2026-08-10", "Folha", "F"),
  ],
  partyNames: { A: "Alpha", F: "Forn" },
} as RiskInput;
