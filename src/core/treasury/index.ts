/**
 * all4pay — Treasury Core (GAP 6)
 * -------------------------------
 * Infraestrutura de tesouraria institucional (raro em fintech PME):
 * posição consolidada, concentração bancária, liquidez em buckets, cash
 * positioning, exposição e stress testing. Já parece infra de fundo.
 * Puro, tipado, demo-safe.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import type { FinancialAccount } from "@/lib/types";

export interface ContaPosicao {
  id: string;
  nome: string;
  banco: string;
  saldo: number;
  share: number;
}
export interface BancoPosicao {
  banco: string;
  saldo: number;
  share: number;
  contas: number;
}
export interface CashWeek {
  semana: string;
  entradas: number;
  saidas: number;
  liquido: number;
  acumulado: number;
}
export interface TreasuryStress {
  id: string;
  label: string;
  descricao: string;
  impacto: number;
  runwayDias: number;
}
export interface TreasuryCoreResult {
  posicaoTotal: number;
  contas: ContaPosicao[];
  bancos: BancoPosicao[];
  concentracaoBancariaHHI: number; // 0..10000
  topBancoShare: number; // 0..1
  liquidez: { imediata: number; curto30: number; projetada90: number };
  cashPositioning: CashWeek[];
  exposicao: { aReceber: number; aPagar: number; liquida: number };
  stress: TreasuryStress[];
  versaoModelo: string;
}

const BANK_LABEL: Record<string, string> = {
  itau: "Itaú",
  bradesco: "Bradesco",
  nubank: "Nubank",
  inter: "Inter",
  caixa: "Caixa",
  santander: "Santander",
  bb: "Banco do Brasil",
};
const bankName = (b: string) => BANK_LABEL[b] ?? b.charAt(0).toUpperCase() + b.slice(1);

function diasFuturo(hoje: string, dias: number) {
  const d = new Date(hoje);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function treasuryCore(accounts: FinancialAccount[], input: RiskInput): TreasuryCoreResult {
  const posicaoTotal = accounts.reduce((s, a) => s + a.balance, 0);

  const contas: ContaPosicao[] = accounts
    .map((a) => ({ id: a.id, nome: a.name, banco: bankName(a.bank), saldo: a.balance, share: posicaoTotal > 0 ? a.balance / posicaoTotal : 0 }))
    .sort((a, b) => b.saldo - a.saldo);

  const porBanco = new Map<string, { saldo: number; contas: number }>();
  for (const a of accounts) {
    const k = bankName(a.bank);
    const cur = porBanco.get(k) ?? { saldo: 0, contas: 0 };
    cur.saldo += a.balance;
    cur.contas += 1;
    porBanco.set(k, cur);
  }
  const bancos: BancoPosicao[] = Array.from(porBanco.entries())
    .map(([banco, v]) => ({ banco, saldo: v.saldo, contas: v.contas, share: posicaoTotal > 0 ? v.saldo / posicaoTotal : 0 }))
    .sort((a, b) => b.saldo - a.saldo);
  const concentracaoBancariaHHI = bancos.reduce((s, b) => s + b.share * b.share, 0) * 10000;
  const topBancoShare = bancos[0]?.share ?? 0;

  // Exposição / liquidez por janela.
  const pend = input.movements.filter((m) => m.status === "pendente");
  const receb = (ate: string) => pend.filter((m) => m.type === "entrada" && m.due_date <= ate).reduce((s, m) => s + m.amount, 0);
  const pagar = (ate: string) => pend.filter((m) => m.type === "saida" && m.due_date <= ate).reduce((s, m) => s + m.amount, 0);

  const aReceber = pend.filter((m) => m.type === "entrada").reduce((s, m) => s + m.amount, 0);
  const aPagar = pend.filter((m) => m.type === "saida").reduce((s, m) => s + m.amount, 0);
  const d30 = diasFuturo(input.hoje, 30);
  const d90 = diasFuturo(input.hoje, 90);
  const liquidez = {
    imediata: posicaoTotal,
    curto30: posicaoTotal + receb(d30) - pagar(d30),
    projetada90: posicaoTotal + receb(d90) * 0.9 - pagar(d90),
  };

  // Cash positioning — 8 semanas.
  const cashPositioning: CashWeek[] = [];
  let acumulado = posicaoTotal;
  for (let w = 0; w < 8; w++) {
    const ini = diasFuturo(input.hoje, w * 7);
    const fim = diasFuturo(input.hoje, (w + 1) * 7);
    const entradas = pend.filter((m) => m.type === "entrada" && m.due_date >= ini && m.due_date < fim).reduce((s, m) => s + m.amount, 0);
    const saidas = pend.filter((m) => m.type === "saida" && m.due_date >= ini && m.due_date < fim).reduce((s, m) => s + m.amount, 0);
    const liquido = entradas - saidas;
    acumulado += liquido;
    cashPositioning.push({ semana: `S${w + 1}`, entradas, saidas, liquido, acumulado });
  }

  // Stress testing (reusa o motor de risco de caixa).
  const r = scoreRiscoCaixa(input);
  const stress: TreasuryStress[] = r.stress.map((s) => ({
    id: s.id,
    label: s.label,
    descricao: s.descricao,
    impacto: s.impactoSaldo,
    runwayDias: s.runwayDias,
  }));

  return {
    posicaoTotal,
    contas,
    bancos,
    concentracaoBancariaHHI,
    topBancoShare,
    liquidez,
    cashPositioning,
    exposicao: { aReceber, aPagar, liquida: aReceber - aPagar },
    stress,
    versaoModelo: "treasury/1.0.0",
  };
}
