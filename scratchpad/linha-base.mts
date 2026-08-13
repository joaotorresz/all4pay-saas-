/**
 * LINHA DE BASE DA AUDITORIA — org `joaov.yoshimi` (835278a9), com o filtro de
 * amostra ATIVO (`is_sample = false`).
 *
 * ⚠️ A classificação de cada categoria em linha do DRE vem do MOTOR REAL
 * (`core/relatorios`), não de uma regra reescrita aqui. Só a agregação por
 * (tipo, status, categoria, mês) foi feita no banco — soma é soma, e é o que
 * dá para conferir num relance. A classificação é a parte com julgamento, e
 * duas classificações que começam idênticas divergem na primeira categoria
 * nova: é exatamente o defeito que a camada canônica existe para impedir.
 *
 * Rodar:
 *   TZ=America/Sao_Paulo node --experimental-strip-types \
 *     --loader ./scripts/ts-alias-loader.mjs ./scratchpad/linha-base.mts
 *
 * `base-joaov.json` foi extraído de produção em 13/08/2026 com:
 *
 *   with m as (
 *     select mv.type, mv.status,
 *            coalesce(c.name, mv.category, '(sem categoria)') as categoria,
 *            to_char(mv.due_date,'YYYY-MM')  as mes_comp,
 *            to_char(mv.paid_date,'YYYY-MM') as mes_caixa,
 *            mv.amount
 *     from public.movements mv
 *     left join public.categories c on c.id = mv.category_id
 *     where mv.org_id = '835278a9-2e4f-447f-b2e2-2aedb6daa9c6'
 *       and not mv.is_sample                     -- o filtro da marca de amostra
 *   )
 *   select json_agg(json_build_array(type,status,categoria,mes_comp,mes_caixa,
 *                                    round(soma,2), n))
 *   from (select type,status,categoria,mes_comp,mes_caixa,
 *                sum(amount) soma, count(*) n from m group by 1,2,3,4,5) g;
 *
 * ⚠️ **É um retrato, não uma consulta viva.** Ele existe para a auditoria poder
 * comparar contra os números medidos em 13/08 mesmo depois de a base mudar —
 * recalcular ao abrir faria a linha de base se mover junto com o que ela deve
 * medir, que é o oposto de uma linha de base.
 *
 * ⚠️ **Agregado por MÊS.** Um pagamento feito depois do dia 13 dentro do mês
 * corrente entra como se fosse do dia 1º. Nesta org isso alcança R$ 1,54.
 */
import { readFileSync } from "node:fs";
import { montarRelatorio, montarDFC, ESTRUTURA_DRE } from "@/core/relatorios";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

const HOJE = "2026-08-13";
const SALDO_ATUAL = -31000.16;

type Grupo = [string, string, string, string, string | null, number, number];
const grupos = JSON.parse(readFileSync("scratchpad/base-joaov.json", "utf8")) as Grupo[];

// Um movimento sintético por grupo. A cascata do DRE é linear nos valores, então
// agregar antes é exato: o que muda de linha para linha é a CLASSIFICAÇÃO, e ela
// depende de (categoria, tipo), que o agrupamento preserva.
const movements: RiskMovement[] = grupos.map(([tipo, status, cat, mesComp, mesCaixa, valor], i) => ({
  id: `g${i}`,
  type: tipo as "entrada" | "saida",
  status: status as "pendente" | "pago" | "cancelado",
  amount: valor,
  due_date: `${mesComp}-01`,
  paid_date: mesCaixa ? `${mesCaixa}-01` : null,
  category: cat === "(sem categoria)" || cat === "" ? null : cat,
}));

const input: RiskInput = { hoje: HOJE, saldoAtual: SALDO_ATUAL, movements };

/* Os 12 meses fechados que terminam no mês corrente. */
const DE = "2025-09-01", ATE = "2026-08-31";
const intervalo = { de: DE, ate: ATE };

const brl = (n: number) =>
  (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log(`\nORG joaov.yoshimi (835278a9) · janela ${DE} a ${ATE} · filtro de amostra ATIVO`);
console.log(`${movements.length} grupos · ${grupos.reduce((s, g) => s + g[6], 0)} lançamentos reais\n`);

/* ── 1. DRE de 12 meses, todas as linhas de nível 1 ───────────────────────── */
const dre = montarRelatorio(input, ESTRUTURA_DRE, { intervalo, tipo: "dre", regime: "competencia" });
console.log("== DRE · 12 MESES · REGIME DE COMPETÊNCIA (por vencimento) ==");
console.log("linha|sinal|total 12m|média/mês");
for (const l of dre.linhas.filter((x) => x.nivel === 1)) {
  console.log(`${l.label}|${l.sinal}|${brl(l.total.valor)}|${brl(l.media.valor)}`);
}

/* ── 2. DFC: saldo de abertura e de fechamento ────────────────────────────── */
// ⚠️ `montarDFC`, não o montador cru: é ele que RECONSTRÓI o saldo de abertura
// a partir do saldo de hoje (saldoAtual − o que foi liquidado depois do início
// da janela). Chamando `montarRelatorio` direto, a abertura entra como zero e o
// extrato mostra saldo inicial e final zerados — que foi o que aconteceu na
// primeira execução.
const dfc = montarDFC(input, { intervalo, tipo: "dfc" });
console.log("\n== EXTRATO / DFC · REGIME DE CAIXA (por pagamento) ==");
console.log("linha|total 12m");
for (const l of dfc.linhas.filter((x) => x.nivel === 1)) {
  const v = l.id === "saldo_inicial" ? l.celulas[0].valor
    : l.id === "saldo_final" ? l.celulas[l.celulas.length - 1].valor
    : l.total.valor;
  console.log(`${l.label}|${brl(v)}`);
}

/* ── 3. Previsto (pendentes) e a receber / a pagar por status ─────────────── */
const soma = (f: (m: RiskMovement) => boolean) =>
  movements.filter(f).reduce((s, m) => s + m.amount, 0);
const cont = (f: (m: RiskMovement) => boolean) =>
  grupos.filter((g, i) => f(movements[i])).reduce((s, g) => s + g[6], 0);

const naJanela = (m: RiskMovement) => m.due_date >= DE && m.due_date <= ATE;
const futuro = (m: RiskMovement) => m.status === "pendente" && m.due_date > HOJE;
const vencido = (m: RiskMovement) => m.status === "pendente" && m.due_date <= HOJE;

console.log("\n== PREVISTO (pendentes, todo o horizonte) ==");
console.log("recorte|valor|lançamentos");
console.log(`Entradas previstas|${brl(soma((m) => futuro(m) && m.type === "entrada"))}|${cont((m) => futuro(m) && m.type === "entrada")}`);
console.log(`Saídas previstas|${brl(soma((m) => futuro(m) && m.type === "saida"))}|${cont((m) => futuro(m) && m.type === "saida")}`);
console.log(`Resultado previsto|${brl(soma((m) => futuro(m) && m.type === "entrada") - soma((m) => futuro(m) && m.type === "saida"))}|`);

console.log("\n== GERAÇÃO DE CAIXA (liquidado, 12 meses) ==");
const naJanelaCaixa = (m: RiskMovement) => m.status === "pago" && !!m.paid_date && m.paid_date >= DE && m.paid_date <= ATE;
const ent = soma((m) => naJanelaCaixa(m) && m.type === "entrada");
const sai = soma((m) => naJanelaCaixa(m) && m.type === "saida");
console.log("recorte|valor");
console.log(`Entradas liquidadas|${brl(ent)}`);
console.log(`Saídas liquidadas|${brl(sai)}`);
console.log(`Geração de caixa|${brl(ent - sai)}`);

console.log("\n== TÍTULOS EM ABERTO, POR SITUAÇÃO (carteira inteira, sem recorte) ==");
console.log("lado|situação|valor|lançamentos");
for (const [lado, tipo] of [["A receber", "entrada"], ["A pagar", "saida"]] as const) {
  const venc = soma((m) => vencido(m) && m.type === tipo);
  const aVencer = soma((m) => futuro(m) && m.type === tipo);
  console.log(`${lado}|Vencido (venc. ≤ ${HOJE})|${brl(venc)}|${cont((m) => vencido(m) && m.type === tipo)}`);
  console.log(`${lado}|A vencer|${brl(aVencer)}|${cont((m) => futuro(m) && m.type === tipo)}`);
  console.log(`${lado}|TOTAL em aberto|${brl(venc + aVencer)}|${cont((m) => m.status === "pendente" && m.type === tipo)}`);
}

console.log("\n== CONFERÊNCIA ==");
const cancel = soma((m) => m.status === "cancelado");
console.log(`Cancelados (fora de tudo)|${brl(cancel)}|${cont((m) => m.status === "cancelado")} lançamentos`);
console.log(`Saldo em conta hoje|${brl(SALDO_ATUAL)}`);
