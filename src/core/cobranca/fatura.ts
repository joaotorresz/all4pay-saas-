/**
 * A FATURA PÚBLICA (`/pagar?t=…`) no modelo da Asaas — as regras puras da
 * página: em que situação a cobrança está e como se diz isso ao cliente.
 *
 * ⚠️ O VALOR da página é o EMITIDO no Pix/boleto, e ele não muda com o
 * atraso: a página não mostra juros e multa como a Asaas, porque o código que
 * o cliente paga tem valor fixo. Mostrar um total corrigido ao lado de um Pix
 * do valor original faria o cliente pagar um número e ler outro.
 */
import { diasEntre } from "@/core/automacoes/tempo";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export type TomFatura = "warning" | "neutral" | "positive";

export interface SituacaoFatura {
  /** "Cobrança vencida" · "Vence hoje" · "Aguardando pagamento" · "Pagamento recebido". */
  rotulo: string;
  tom: TomFatura;
  /** "vencida há 13 dias" · "vence em 5 dias" · "vence hoje" · null. */
  prazo: string | null;
}

export function situacaoDaFatura(s: "aberto" | "pago" | "indisponivel", vencimento: string | null, hoje: string): SituacaoFatura {
  if (s === "pago") return { rotulo: "Pagamento recebido", tom: "positive", prazo: null };
  if (s === "indisponivel") return { rotulo: "Cobrança indisponível", tom: "neutral", prazo: null };
  if (!vencimento || !/^\d{4}-\d{2}-\d{2}/.test(vencimento)) return { rotulo: "Aguardando pagamento", tom: "neutral", prazo: null };
  const d = diasEntre(vencimento.slice(0, 10), hoje.slice(0, 10));
  if (d > 0) return { rotulo: "Cobrança vencida", tom: "warning", prazo: `vencida há ${plural(d, "dia", "dias")}` };
  if (d === 0) return { rotulo: "Vence hoje", tom: "warning", prazo: "vence hoje" };
  return { rotulo: "Aguardando pagamento", tom: "neutral", prazo: `vence em ${plural(-d, "dia", "dias")}` };
}
