/**
 * Recommendation Engine — não só detecta: RECOMENDA com impacto
 * quantificado. Para cada ação candidata, constrói o cenário modificado
 * e RE-RODA o motor de risco, medindo o ganho real (Δrunway, Δscore,
 * Δprob. de ruptura). "Antecipar R$240k → +11 dias de runway".
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import type { Recomendacao, AcaoRecomendada } from "./types";
import { uid } from "./types";

interface Aval {
  runway: number;
  score: number;
  prob: number;
}
function avaliar(input: RiskInput): Aval {
  const r = scoreRiscoCaixa(input);
  return { runway: r.runway.base, score: r.score, prob: r.probabilidadeRuptura };
}

const diasFuturo = (hoje: string, dias: number) => {
  const d = new Date(hoje);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

export function gerarRecomendacoes(input: RiskInput): Recomendacao[] {
  const base = avaliar(input);
  const hoje = input.hoje;
  const candidatos: Omit<Recomendacao, "id" | "deltaRunwayDias" | "deltaScore" | "deltaProbRuptura" | "prioridade">[] = [];
  const inputs: { acao: AcaoRecomendada; input: RiskInput; meta: typeof candidatos[number] }[] = [];

  // 1) Antecipar recebíveis (próximos 60 dias) — com deságio de 3%.
  const aReceber = input.movements
    .filter((m) => m.type === "entrada" && m.status === "pendente" && m.due_date <= diasFuturo(hoje, 60))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  const somaReceb = aReceber.reduce((s, m) => s + m.amount, 0);
  if (somaReceb > 0) {
    const ids = new Set(aReceber.map((m) => m.id));
    const movements = input.movements.map((m): RiskMovement =>
      ids.has(m.id) ? { ...m, status: "pago", paid_date: hoje } : m,
    );
    const meta = {
      acao: "antecipar_recebiveis" as const,
      titulo: "Antecipar recebíveis",
      descricao: `Antecipar ${fmt(somaReceb)} em recebíveis dos próximos 60 dias (deságio ~3%).`,
      valorEnvolvido: somaReceb,
    };
    inputs.push({ acao: meta.acao, input: { ...input, saldoAtual: input.saldoAtual + somaReceb * 0.97, movements }, meta });
  }

  // 2) Postergar maior fornecedor (a pagar) em 30 dias.
  const aPagar = input.movements
    .filter((m) => m.type === "saida" && m.status === "pendente")
    .sort((a, b) => b.amount - a.amount);
  if (aPagar[0]) {
    const alvo = aPagar[0];
    const movements = input.movements.map((m): RiskMovement =>
      m.id === alvo.id ? { ...m, due_date: diasFuturo(alvo.due_date >= hoje ? alvo.due_date : hoje, 30) } : m,
    );
    const meta = {
      acao: "postergar_fornecedor" as const,
      titulo: "Postergar fornecedor",
      descricao: `Negociar +30 dias no maior pagamento em aberto (${fmt(alvo.amount)}).`,
      valorEnvolvido: alvo.amount,
    };
    inputs.push({ acao: meta.acao, input: { ...input, movements }, meta });
  }

  // 3) Reduzir despesa 15% (pagamentos pendentes).
  const pendentesSaida = input.movements.filter((m) => m.type === "saida" && m.status === "pendente");
  const somaDesp = pendentesSaida.reduce((s, m) => s + m.amount, 0);
  if (somaDesp > 0) {
    const movements = input.movements.map((m): RiskMovement =>
      m.type === "saida" && m.status === "pendente" ? { ...m, amount: m.amount * 0.85 } : m,
    );
    const meta = {
      acao: "reduzir_despesa" as const,
      titulo: "Reduzir despesas 15%",
      descricao: `Cortar 15% das despesas em aberto (${fmt(somaDesp * 0.15)} de economia).`,
      valorEnvolvido: somaDesp * 0.15,
    };
    inputs.push({ acao: meta.acao, input: { ...input, movements }, meta });
  }

  // Avalia o impacto real de cada candidato.
  const recs: Recomendacao[] = inputs.map(({ acao, input: mod, meta }) => {
    const a = avaliar(mod);
    void candidatos;
    void acao;
    return {
      id: uid("rec"),
      acao: meta.acao,
      titulo: meta.titulo,
      descricao: meta.descricao,
      valorEnvolvido: meta.valorEnvolvido,
      deltaRunwayDias: cap(a.runway) - cap(base.runway),
      deltaScore: a.score - base.score,
      deltaProbRuptura: a.prob - base.prob,
      prioridade: 0,
    };
  });

  // Mantém só as que melhoram algo; ordena por ganho.
  const ganho = (r: Recomendacao) => r.deltaRunwayDias / 30 + r.deltaScore - r.deltaProbRuptura * 100;
  return recs
    .filter((r) => r.deltaRunwayDias > 0 || r.deltaScore > 0 || r.deltaProbRuptura < 0)
    .sort((a, b) => ganho(b) - ganho(a))
    .map((r, i) => ({ ...r, prioridade: i + 1 }));
}

const cap = (d: number) => (d >= 999 ? 720 : d); // teto para deltas legíveis (24m)
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
