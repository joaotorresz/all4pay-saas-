/**
 * Smart Payment Routing — a IA escolhe de qual conta/banco pagar para
 * reduzir custo e risco e preservar liquidez (evita concentrar saída num
 * único banco e mantém colchão por instituição).
 */
import type { PaymentRoute } from "./types";

interface ContaSaldo {
  nome: string;
  banco: string;
  saldo: number;
}

export function rotearPagamentos(contas: ContaSaldo[], pagamentos: number[]): PaymentRoute[] {
  // Trabalha sobre uma cópia dos saldos (simula a alocação).
  const saldos = contas.map((c) => ({ ...c }));
  const routes: PaymentRoute[] = [];

  for (const valor of pagamentos) {
    // Candidatas com saldo suficiente, preferindo preservar liquidez:
    // escolhe a conta que fica com MAIOR folga relativa após o pagamento,
    // evitando esvaziar uma conta (preserva colchão e dilui concentração).
    const aptas = saldos.filter((s) => s.saldo >= valor);
    const pool = aptas.length ? aptas : saldos;
    // Sem nenhuma conta cadastrada não há para onde rotear — não quebra a tela.
    if (!pool.length) {
      routes.push({ valor, contaEscolhida: "—", banco: "—", motivo: "sem conta cadastrada — cadastre uma conta para rotear o pagamento" });
      continue;
    }
    const escolhida = pool
      .map((s) => ({ s, folga: (s.saldo - valor) / Math.max(1, s.saldo) }))
      .sort((a, b) => b.folga - a.folga)[0].s;

    const motivo = aptas.length
      ? `maior folga pós-pagamento — preserva liquidez e dilui concentração`
      : `saldo insuficiente nas contas — requer aporte/transferência`;

    routes.push({ valor, contaEscolhida: escolhida.nome, banco: escolhida.banco, motivo });
    escolhida.saldo -= valor;
  }
  return routes;
}
