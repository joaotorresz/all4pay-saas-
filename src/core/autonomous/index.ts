/**
 * operacaoAutonoma() — Autonomous Financial Ops. Monta o contexto a
 * partir dos motores (decisão/crédito/anomalias/tesouraria), roda as
 * políticas, pontua confiança, aplica guardrails (human-in-the-loop) e
 * devolve decisões executáveis + cobrança autônoma + roteamento de
 * pagamento + próxima melhor ação. O operador humano vira supervisor.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type { FinancialAccount } from "@/lib/types";
import { decidir } from "@/core/decision";
import { analisarInadimplencia } from "@/core/risk";
import { detectarAnomalias } from "@/core/executive/anomalies";
import { treasuryCore } from "@/core/treasury";
import type {
  AutonomousOpsReport,
  FinancialDecision,
  HumanInTheLoop,
  NextBestAction,
  PoliticaAutonoma,
} from "./types";
import { VERSAO_AUTONOMOUS } from "./types";
import { POLITICAS, type DecisionContext, type DecisionDraft } from "./policies";
import { planoDeCobranca } from "./collections";
import { rotearPagamentos } from "./payment-routing";

import { formatBRL } from "@/lib/format";
const LIMITE_AUTOMATICO = 2000; // R$ até onde a IA executa sozinha (move dinheiro)
const CONFIANCA_MINIMA = 0.7;

const URGENCIA: { match: string; valor: number }[] = [
  { match: "saldo crítico", valor: 1 },
  { match: "cliente de alto risco", valor: 0.8 },
  { match: "inadimplência", valor: 0.72 },
  { match: "anomalia", valor: 0.66 },
  { match: "otimização", valor: 0.58 },
  { match: "concentração", valor: 0.5 },
];
const urgenciaDe = (origem: string) =>
  URGENCIA.find((u) => origem.toLowerCase().includes(u.match))?.valor ?? 0.5;

/** Guardrail: a IA executa sozinha ou escala para aprovação humana. */
function modoExecucao(d: DecisionDraft): FinancialDecision["modo"] {
  const segura = d.tipo === "cobranca" || d.tipo === "risco"; // ação interna/reversível
  if (segura) return d.confianca >= CONFIANCA_MINIMA ? "automatico" : "requer_aprovacao";
  return d.valor <= LIMITE_AUTOMATICO && d.confianca >= CONFIANCA_MINIMA && d.riscoExecucao < 0.35
    ? "automatico"
    : "requer_aprovacao";
}

export function operacaoAutonoma(input: RiskInput, accounts: FinancialAccount[]): AutonomousOpsReport {
  const dec = decidir(input);
  const credito = analisarInadimplencia(input);
  const anomalias = detectarAnomalias(input);
  const treasury = treasuryCore(accounts, input);

  const clientesRisco = credito.clientes
    .filter((c) => c.features.volumeVencido > 0 || c.classificacao === "alto" || c.classificacao === "critico")
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((c) => ({ nome: c.nome, score: c.score, exposicao: c.features.volumeAberto, classificacao: c.classificacao }));

  const ctx: DecisionContext = {
    hoje: input.hoje,
    saldoAtual: dec.features.atual.saldo,
    rupturaDia: dec.features.atual.rupturaDia,
    probRuptura: dec.features.atual.probRuptura,
    probStress: dec.risco.probabilidadeStress,
    runwayDias: dec.features.atual.runwayDias,
    inadimplencia: dec.features.atual.inadimplencia,
    topBancoShare: treasury.topBancoShare,
    clientesRisco,
    anomalias: anomalias.map((a) => ({ titulo: a.titulo, descricao: a.descricao, valor: a.valor, severidade: a.severidade })),
    recomendacoes: dec.recomendacoes.map((r) => ({
      titulo: r.titulo,
      descricao: r.descricao,
      valorEnvolvido: r.valorEnvolvido,
      deltaScore: r.deltaScore,
      deltaRunwayDias: r.deltaRunwayDias,
      deltaProbRuptura: r.deltaProbRuptura,
    })),
  };

  /*
   * ⚠️ O id da sugestão é DERIVADO DO CONTEÚDO, não de um contador (Rodada 9).
   * Era `uid("dec")`, um contador global — e o motor roda de novo a cada
   * renderização da tela. A mesma sugestão nascia com outro id a cada
   * redesenho: a confirmação da cobrança sumia no instante em que abria, e o
   * selo "Em aprovação" desaparecia na renderização seguinte, devolvendo o
   * botão — a mesma sugestão podia ir para a alçada duas vezes. Mesma
   * política, mesmo tipo e mesmo título são a MESMA sugestão; quando a
   * situação muda (outro valor, outros clientes), o título muda e ela é outra.
   */
  const idEstavel = (d: DecisionDraft) =>
    `dec:${d.origem}:${d.tipo}:${d.titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  // Roda as políticas.
  const politicas: PoliticaAutonoma[] = [];
  const drafts: DecisionDraft[] = [];
  for (const p of POLITICAS) {
    const ds = p.avaliar(ctx);
    drafts.push(...ds);
    politicas.push({ id: p.id, nome: p.nome, se: p.se, entao: p.entao, tipo: p.tipo, disparou: ds.length > 0, decisoes: ds.length });
  }

  // Pontua/ordena e finaliza (prioridade + modo).
  const maxImpacto = Math.max(1, ...drafts.map((d) => d.impactoEsperado));
  const pont = (d: DecisionDraft) => 0.5 * urgenciaDe(d.origem) + 0.3 * d.confianca + 0.2 * (d.impactoEsperado / maxImpacto);
  const decisoes: FinancialDecision[] = drafts
    .map((d) => ({ d, s: pont(d) }))
    .sort((a, b) => b.s - a.s)
    .map(({ d }, i) => ({ ...d, id: idEstavel(d), prioridade: i + 1, modo: modoExecucao(d) }));
  // Duas sugestões com a mesma chave (mesma política, tipo e título) ganham um
  // sufixo pela ordem — sem isso a tela misturaria o estado das duas.
  const vistos = new Map<string, number>();
  for (const d of decisoes) {
    const n = vistos.get(d.id) ?? 0;
    vistos.set(d.id, n + 1);
    if (n > 0) d.id = `${d.id}#${n}`;
  }

  const automaticas = decisoes.filter((d) => d.modo === "automatico").length;
  const pendentes = decisoes.length - automaticas;
  const hitl: HumanInTheLoop = {
    limiteAutomatico: LIMITE_AUTOMATICO,
    confiancaMinima: CONFIANCA_MINIMA,
    automaticas,
    pendentesAprovacao: pendentes,
  };

  const collections = planoDeCobranca(clientesRisco);

  // Roteamento dos maiores pagamentos pendentes.
  const pagamentos = input.movements
    .filter((m) => m.type === "saida" && m.status === "pendente")
    .map((m) => m.amount)
    .sort((a, b) => b - a)
    .slice(0, 3);
  const routing = pagamentos.length
    ? rotearPagamentos(
        treasury.contas.map((c) => ({ nome: c.nome, banco: c.banco, saldo: c.saldo })),
        pagamentos,
      )
    : [];

  const top = decisoes[0];
  const nextBestAction: NextBestAction | null = top
    ? {
        acao: top.titulo,
        tipo: top.tipo,
        impacto: top.impactoEsperado > 0 ? `≈ ${fmt(top.impactoEsperado)} em jogo` : top.fatores[0] ?? "—",
        confianca: top.confianca,
      }
    : null;

  const headline = top
    ? `${decisoes.length} decisões avaliadas: ${automaticas} executáveis automaticamente, ${pendentes} aguardam aprovação. Próxima melhor ação: ${top.titulo.toLowerCase()}.`
    : "Operação estável — nenhuma decisão acionável no momento.";

  return {
    hoje: input.hoje,
    headline,
    decisoes,
    nextBestAction,
    politicas,
    collections,
    routing,
    hitl,
    versaoModelo: VERSAO_AUTONOMOUS,
  };
}

const fmt = (v: number) =>
  formatBRL(v);

export type { AutonomousOpsReport } from "./types";
export { operacaoAutonoma as default };
