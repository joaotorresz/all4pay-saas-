/** ITEM 2 — MEDIÇÃO: "Para onde foi" mostra Receita == Despesas == total. */
import { readFileSync } from "node:fs";
import { compararFluxo } from "@/core/cashflow/comparativo";
import { montarDRE } from "@/core/relatorios";
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

for (const dias of [90, 365]) {
  const c = compararFluxo(input, { dias });
  const s = c.sankey;
  const receita = s.nodes.find((n) => n.nivel === 0);
  const despesa = s.nodes.find((n) => n.nivel === 1);
  console.log(`\n== "PARA ONDE FOI" · últimos ${dias} dias ==`);
  console.log(`nó "Receita" : ${brl(receita?.valor ?? 0)}`);
  console.log(`nó "Despesas": ${brl(despesa?.valor ?? 0)}`);
  console.log(`total widget : ${brl(s.total)}`);
  console.log(`OS TRÊS SÃO IGUAIS? ${receita?.valor === despesa?.valor && despesa?.valor === s.total}`);

  // O que a receita DEVERIA ser, no mesmo recorte.
  const de = new Date(new Date(HOJE + "T00:00:00").getTime() - dias * 864e5).toISOString().slice(0, 10);
  const ent = movements.filter((m) => m.status !== "cancelado" && m.type === "entrada"
    && (m.paid_date ?? m.due_date) >= de && (m.paid_date ?? m.due_date) <= HOJE)
    .reduce((s2, m) => s2 + m.amount, 0);
  const sai = movements.filter((m) => m.status !== "cancelado" && m.type === "saida"
    && (m.paid_date ?? m.due_date) >= de && (m.paid_date ?? m.due_date) <= HOJE)
    .reduce((s2, m) => s2 + m.amount, 0);
  console.log(`entradas reais no recorte: ${brl(ent)}`);
  console.log(`saídas reais no recorte  : ${brl(sai)}`);
  console.log(`→ a "Receita" exibida está ${ent === (receita?.valor ?? 0) ? "certa" : "ERRADA"}: exibe ${brl(receita?.valor ?? 0)}, deveria ser ${brl(ent)}`);

  // Reconciliação com o DRE do MESMO período.
  const dre = montarDRE(input, { intervalo: { de, ate: HOJE }, tipo: "vertical" });
  const rb = dre.linhas.find((l) => l.id === "receita_bruta")?.total.valor ?? 0;
  console.log(`Receita Bruta do DRE (competência, mesmo período): ${brl(rb)}`);
}
