/**
 * tz-boundary — guarda contra a classe de bug de FUSO no 1º dia do mês.
 *
 * `new Date("YYYY-MM-DD")` parseia como meia-noite UTC; em UTC-3 (todo o Brasil)
 * isso é o dia ANTERIOR local, então getMonth()/getDate() locais caem no mês/dia
 * errado no 1º dia do mês. Este teste roda os motores em 2026-07-01 e exige que
 * eles enxerguem JULHO (não junho). DEVE ser executado com TZ=America/Sao_Paulo
 * (o npm script força isso).
 *
 *   npm run tz   (também roda dentro de npm test)
 */
import { serieMensal, receitaRecorrente } from "@/core/quant/series";
import { periodoPreset } from "@/core/dre/index";
import { calcularLiquidezProjetada } from "@/core/risk-engine/liquidez.engine";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

const HOJE = "2026-07-01"; // 1º dia do mês — o gatilho do bug
const mk = (o: Partial<RiskMovement>): RiskMovement =>
  ({ id: Math.random().toString(36).slice(2), type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;

const input: RiskInput = {
  hoje: HOJE, saldoAtual: 1000, partyNames: {},
  movements: [mk({ type: "entrada", amount: 9999, paid_date: "2026-07-01", due_date: "2026-07-01", party_id: "A" })],
} as RiskInput;

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (c) return; fails++; console.log(`✗ ${n} ${extra}`); };

// aviso se o ambiente não estiver em fuso negativo (o teste só é significativo aí)
const off = new Date("2026-07-01").getTimezoneOffset(); // minutos; UTC-3 → 180
if (off <= 0) console.log(`⚠ TZ offset=${-off / 60}h (>=UTC): rode com TZ=America/Sao_Paulo para o teste ser significativo`);

// 1. quant série mensal deve incluir julho como mês corrente com a receita
const serie = serieMensal(input);
const ult = serie[serie.length - 1];
ok("serieMensal inclui o mês corrente (2026-07)", ult.ym === "2026-07", `veio ${ult.ym}`);
ok("serieMensal capta a receita do mês corrente", ult.receita === 9999, `veio ${ult.receita}`);

// 2. receitaRecorrente não deve estourar / deve considerar a janela até o mês atual
ok("receitaRecorrente finita em [0,1]", Number.isFinite(receitaRecorrente(input)));

// 3. DRE periodoPreset: mês anterior = junho; 12m começa em ago/2025
const pa = periodoPreset(HOJE, "mes_anterior");
ok("DRE mês anterior = junho (2026-06)", pa.de === "2026-06-01" && pa.ate === "2026-06-30", `veio ${pa.de}..${pa.ate}`);
const p12 = periodoPreset(HOJE, "12m");
ok("DRE 12m começa em ago/2025", p12.de.slice(0, 7) === "2025-08", `veio ${p12.de}`);
const pm = periodoPreset(HOJE, "mes");
ok("DRE mês atual começa em julho (2026-07)", pm.de === "2026-07-01", `veio ${pm.de}`);

// 4. liquidez: rótulo DD/MM bate com a chave (não um dia atrás)
const { pontos } = calcularLiquidezProjetada({ ...input, horizonDias: 2 } as RiskInput);
ok("liquidez: rótulo[0] = 01/07 e chave = 2026-07-01", pontos[0].label === "01/07" && pontos[0].date === "2026-07-01", `veio ${pontos[0].label}/${pontos[0].date}`);

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — fronteira de mês em fuso UTC-3`);
if (fails > 0) process.exit(1);
