/**
 * analisarInadimplencia() — orquestra o motor de inteligência de crédito.
 * Comportamento → Features → Scoring → Probabilística → Explicabilidade
 * → Early Warning → Recuperação → Recomendação → Segmentação, sobre a
 * carteira inteira. Puro, demo-safe, auditável (versão de modelo).
 *
 * Consome o mesmo RiskInput do motor de risco de caixa.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { motivoSemScore } from "@/core/dominio/contraparte";
import type {
  CustomerRiskProfile,
  InadimplenciaPortfolio,
  SegmentoCliente,
  SegmentoResumo,
  ClienteFeatures,
} from "./types";
import { VERSAO_MODELO_CREDITO, SEGMENTO_LABEL } from "./types";
import { eventosDoCliente, extrairFeatures } from "./behavior";
import { pontuar, recomendar } from "./scoring";
import { detectarEarlyWarning } from "./early-warning";
import { preverRecuperacao } from "./recovery";
import { recomendarCredito } from "./credit";

const SEM_CLIENTE = "—";

function segmentar(
  f: ClienteFeatures,
  score: number,
  classificacao: string,
): SegmentoCliente {
  if (f.totalPagamentos < 3) return "novo";
  if (f.recorrenciaAtraso > 0.6 && classificacao === "critico")
    return "inadimplente_cronico";
  if (f.tendenciaRecente > 0.3) return "deteriorando";
  if (f.sazonalidade > 0.45 && f.recorrenciaAtraso < 0.5) return "sazonal";
  if (score <= 25) return "bom_pagador";
  return f.recorrenciaAtraso > 0.4 ? "inadimplente_cronico" : "deteriorando";
}

export function analisarInadimplencia(
  input: RiskInput,
): InadimplenciaPortfolio {
  const hoje = input.hoje;

  // Agrupa recebíveis por cliente.
  const porCliente = new Map<string, RiskMovement[]>();
  let receitaTotalCarteira = 0;
  for (const m of input.movements) {
    if (m.type !== "entrada" || m.status === "cancelado") continue;
    const id = m.party_id ?? SEM_CLIENTE;
    (porCliente.get(id) ?? porCliente.set(id, []).get(id)!).push(m);
    receitaTotalCarteira += m.amount;
  }

  const clientes: CustomerRiskProfile[] = [];
  for (const [id, movs] of Array.from(porCliente)) {
    const nome =
      input.partyNames?.[id] ?? (id === SEM_CLIENTE ? "Sem contraparte" : id);
    const eventos = eventosDoCliente(movs, hoje);
    if (eventos.length === 0) continue;

    // ⚠️ ONDA 5 — O PORTÃO DO SCORE. "DISNEY PLUS" e "IOF ROTATIVO" chegaram
    // aqui como clientes porque a importação transformou descritivo de extrato
    // em cadastro, e o motor lhes atribuiu probabilidade de pagamento. Não é só
    // inútil: o número tem aparência de análise e ainda entra na média
    // ponderada da carteira, movendo o indicador que o dono usa para decidir a
    // quem vender a prazo.
    //
    // O portão fica AQUI, no motor, e não na tela: é ele que produz o número, e
    // filtrar na exibição deixaria a média já contaminada.
    if (motivoSemScore({ tipo: "cliente", nome })) continue;

    const features = extrairFeatures(
      id,
      nome,
      eventos,
      hoje,
      receitaTotalCarteira,
    );
    const s = pontuar(features);
    const earlyWarning = detectarEarlyWarning(features);
    const recovery = preverRecuperacao(eventos, s.score);
    const credito = recomendarCredito(
      features,
      s.score,
      s.classificacao,
      earlyWarning,
    );
    const segmento = segmentar(features, s.score, s.classificacao);

    clientes.push({
      clienteId: id,
      nome,
      score: s.score,
      probabilidadeInadimplencia: s.probabilidadeInadimplencia,
      classificacao: s.classificacao,
      segmento,
      features,
      fatoresRisco: s.fatoresRisco,
      recomendacoes: recomendar(features, s.classificacao, s.fatoresRisco),
      earlyWarning,
      recovery,
      credito,
    });
  }

  clientes.sort(
    (a, b) =>
      b.score - a.score || b.features.volumeAberto - a.features.volumeAberto,
  );

  // ---- Resumo da carteira ----
  const exposicaoTotal = clientes.reduce(
    (s, c) => s + c.features.volumeAberto,
    0,
  );
  const exposicaoVencida = clientes.reduce(
    (s, c) => s + c.features.volumeVencido,
    0,
  );
  const inadimplenciaEsperada = clientes.reduce(
    (s, c) => s + c.features.volumeAberto * c.probabilidadeInadimplencia,
    0,
  );
  const scoreCarteira =
    exposicaoTotal > 0
      ? Math.round(
          clientes.reduce(
            (s, c) => s + c.score * c.features.volumeAberto,
            0,
          ) / exposicaoTotal,
        )
      : clientes.length
        ? Math.round(clientes.reduce((s, c) => s + c.score, 0) / clientes.length)
        : 0;

  // ---- Segmentação ----
  const segMap = new Map<SegmentoCliente, SegmentoResumo>();
  for (const c of clientes) {
    const cur =
      segMap.get(c.segmento) ??
      segMap
        .set(c.segmento, {
          segmento: c.segmento,
          label: SEGMENTO_LABEL[c.segmento],
          clientes: 0,
          exposicao: 0,
        })
        .get(c.segmento)!;
    cur.clientes += 1;
    cur.exposicao += c.features.volumeAberto;
  }

  return {
    hoje,
    clientes,
    resumo: {
      totalClientes: clientes.length,
      exposicaoTotal,
      exposicaoVencida,
      inadimplenciaEsperada,
      clientesCriticos: clientes.filter((c) => c.classificacao === "critico")
        .length,
      clientesAlto: clientes.filter((c) => c.classificacao === "alto").length,
      scoreCarteira,
    },
    segmentos: Array.from(segMap.values()).sort(
      (a, b) => b.exposicao - a.exposicao,
    ),
    versaoModelo: VERSAO_MODELO_CREDITO,
  };
}

export type {
  InadimplenciaPortfolio,
  CustomerRiskProfile,
} from "./types";
export { analisarInadimplencia as default };
