/**
 * ITEM 1 — MEDIÇÃO: por que "Burn R$ 0,00" convive com "Geração de caixa"
 * negativa na mesma tela, e por que o runway sai como "não se aplica".
 *
 * Não altera nada.
 */
import { readFileSync } from "node:fs";
import { calcularBurnRate } from "@/core/risk-engine/burn.engine";
import { realizados } from "@/core/risk-engine/normalize";
import { runwayMeses, saldo, burn as burnCanonico } from "@/core/indicadores";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

const HOJE = "2026-08-13", SALDO = -31000.16;
type G = [string, string, string, string, string | null, number, number];
const grupos = JSON.parse(readFileSync("scratchpad/base-joaov.json", "utf8")) as G[];
const movements: RiskMovement[] = grupos.map(([t, s, c, mc, mx, v], i) => ({
  id: `g${i}`, type: t as "entrada" | "saida", status: s as "pendente" | "pago" | "cancelado",
  amount: v, due_date: `${mc}-01`, paid_date: mx ? `${mx}-01` : null,
  category: c === "(sem categoria)" || c === "" ? null : c,
}));
const input: RiskInput = { hoje: HOJE, saldoAtual: SALDO, movements };

const brl = (n: number) =>
  (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── O que o card "Burn" mostra ──────────────────────────────────────────── */
const b = calcularBurnRate(input);
console.log("\n== CARD 'BURN' (risk-engine, janela de 90 dias REALIZADOS) ==");
console.log(`lançamentos realizados na janela: ${realizados(input, 90).length}`);
console.log(`receita mensal : ${brl(b.receitaMensal)}`);
console.log(`despesa mensal : ${brl(b.despesaMensal)}`);
console.log(`líquido mensal : ${brl(b.liquidoMensal)}`);
console.log(`BURN           : ${brl(b.burnMensal)}   <- Math.max(0, −líquido)`);

/* ── O que o card "Geração de caixa" mostra ─────────────────────────────── */
// A tela usa a janela do filtro; o padrão do Fluxo de caixa é 30 dias à frente.
for (const dias of [30, 90]) {
  const fim = new Date(new Date(HOJE + "T00:00:00").getTime() + dias * 864e5)
    .toISOString().slice(0, 10);
  const pend = movements.filter((m) => m.status === "pendente");
  const na = (m: RiskMovement) => m.due_date >= HOJE && m.due_date <= fim;
  const ent = pend.filter((m) => m.type === "entrada" && na(m)).reduce((s, m) => s + m.amount, 0);
  const sai = pend.filter((m) => m.type === "saida" && na(m)).reduce((s, m) => s + m.amount, 0);
  console.log(`\n== CARD 'GERAÇÃO DE CAIXA' (${dias}d à FRENTE, só PENDENTES) ==`);
  console.log(`entradas previstas: ${brl(ent)}`);
  console.log(`saídas previstas  : ${brl(sai)}`);
  console.log(`GERAÇÃO DE CAIXA  : ${brl(ent - sai)}`);
}

/* ── O runway ────────────────────────────────────────────────────────────── */
const rw = runwayMeses(input), sd = saldo(input), bc = burnCanonico(input);
console.log("\n== RUNWAY / CAIXA (camada canônica) ==");
console.log(`saldo   : ${sd.indisponivel ? `INDISPONÍVEL (${sd.indisponivel.codigo})` : brl(sd.valor)}`);
console.log(`burn    : ${bc.indisponivel ? `INDISPONÍVEL (${bc.indisponivel.codigo}) — ${bc.indisponivel.motivo}` : brl(bc.valor)}`);
console.log(`runway  : ${rw.indisponivel ? `INDISPONÍVEL (${rw.indisponivel.codigo}) — ${rw.indisponivel.motivo}` : rw.valor.toFixed(1) + " meses"}`);

/* ── A PROVA da hipótese: as duas medidas usam janelas e bases diferentes ── */
console.log("\n== HIPÓTESE ==");
console.log("burn            = média mensal do REALIZADO dos últimos 90 dias (passado, status=pago)");
console.log("geração de caixa= entradas − saídas PREVISTAS na janela à frente (futuro, status=pendente)");
console.log(`\nrealizados nos últimos 90d: ${realizados(input, 90).length} lançamentos`);
console.log(`pendentes futuros         : ${movements.filter((m) => m.status === "pendente" && m.due_date >= HOJE).length} lançamentos`);
