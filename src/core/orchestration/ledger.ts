/**
 * Real-Time Ledger — pensar como banco: toda movimentação é dupla
 * partida (débito numa conta, crédito noutra), com hash e status. Daí
 * nasce contabilidade automática, rastreabilidade, antifraude e compliance.
 */
import { sha256 } from "@/core/institutional/sha256";
import type { EventoArmazenado, LancamentoLedger, SaldoConta, EventoTipo } from "./types";
import { uid } from "./types";

/** Mapeia um evento → partidas (conta a debitar / creditar). */
function partidas(tipo: EventoTipo): { debito: string; credito: string; status: LancamentoLedger["status"] } | null {
  switch (tipo) {
    case "PIX_RECEBIDO":
      return { debito: "Caixa e bancos", credito: "Receitas", status: "confirmado" };
    case "BOLETO_EMITIDO":
      return { debito: "Clientes a receber", credito: "Receita a realizar", status: "pendente" };
    case "BOLETO_VENCIDO":
      return { debito: "Clientes em atraso", credito: "Clientes a receber", status: "pendente" };
    case "PAGAMENTO_APROVADO":
      return { debito: "Despesas", credito: "Contas a pagar", status: "pendente" };
    case "PAGAMENTO_EXECUTADO":
      return { debito: "Contas a pagar", credito: "Caixa e bancos", status: "confirmado" };
    default:
      return null; // eventos sem efeito contábil direto
  }
}

export class Ledger {
  private lancamentos: LancamentoLedger[] = [];

  /** Registra a dupla partida correspondente ao evento (se houver). */
  registrar(e: EventoArmazenado): LancamentoLedger | null {
    const p = partidas(e.tipo);
    if (!p || e.valor <= 0) return null;
    const timestamp = e.timestamp;
    const seq = this.lancamentos.length;
    const lanc: LancamentoLedger = {
      id: uid("led"),
      seq,
      contaDebito: p.debito,
      contaCredito: p.credito,
      valor: e.valor,
      tipo: e.tipo,
      status: p.status,
      timestamp,
      hash: sha256(`${seq}|${p.debito}|${p.credito}|${e.valor}|${timestamp}`),
    };
    this.lancamentos.push(lanc);
    return lanc;
  }

  todos(): LancamentoLedger[] {
    return [...this.lancamentos];
  }

  /** Saldos por conta (débitos somam, créditos subtraem). */
  saldos(): SaldoConta[] {
    const m = new Map<string, number>();
    for (const l of this.lancamentos) {
      m.set(l.contaDebito, (m.get(l.contaDebito) ?? 0) + l.valor);
      m.set(l.contaCredito, (m.get(l.contaCredito) ?? 0) - l.valor);
    }
    return Array.from(m.entries())
      .map(([conta, saldo]) => ({ conta, saldo }))
      .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
  }
}
