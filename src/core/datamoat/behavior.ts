/**
 * Behavioral Finance Models — reconhece comportamento financeiro
 * comparando a empresa com os PARES mais semelhantes da coorte (KNN) e
 * o desfecho que tiveram. "Padrão semelhante a empresas que entraram em
 * stress em 6–9 meses."
 */
import type { EmpresaFeatures, BehavioralMatch, Desfecho } from "./types";
import { coorte, FEATURE_KEYS } from "./cohort";

function distancia(a: EmpresaFeatures, b: EmpresaFeatures): number {
  // distância normalizada por escala aproximada de cada feature
  const escala: Record<string, number> = {
    margem: 0.3, runwayMeses: 12, burnMultiple: 2, inadimplencia: 0.2, concentracao: 0.4,
    volatilidade: 0.6, crescimento: 0.15, liquidez: 2, recorrencia: 1,
  };
  let s = 0;
  for (const k of FEATURE_KEYS) {
    const d = (a[k] - b[k]) / (escala[k as string] || 1);
    s += d * d;
  }
  return Math.sqrt(s);
}

export function behavioralMatch(e: EmpresaFeatures): BehavioralMatch {
  const co = coorte();
  const k = 25;
  const vizinhos = co
    .map((c) => ({ c, d: distancia(e, c) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k);

  const shareStress = vizinhos.filter((v) => v.c.stress === 1).length / k;
  const contagem = new Map<Desfecho, number>();
  for (const v of vizinhos) contagem.set(v.c.desfecho, (contagem.get(v.c.desfecho) ?? 0) + 1);
  const desfechoProvavel = Array.from(contagem.entries()).sort((a, b) => b[1] - a[1])[0][0];

  // Padrão clássico de deterioração silenciosa (≥2 sinais com crescimento).
  const sinais = [e.burnMultiple > 1.4, e.inadimplencia > 0.12, e.volatilidade > 0.5].filter(Boolean).length;
  const deterioracao = e.crescimento > 0.03 && sinais >= 2;

  const padrao = deterioracao
    ? "Receita crescendo, mas burn/atraso/volatilidade subindo — deterioração silenciosa."
    : shareStress > 0.5
      ? "Perfil próximo de empresas que enfrentaram stress operacional."
      : "Perfil próximo de empresas saudáveis/escaláveis.";

  const alerta =
    shareStress >= 0.4
      ? `${Math.round(shareStress * 100)}% dos pares mais semelhantes entraram em stress em 6–9 meses.`
      : deterioracao
        ? "Sinais de deterioração isolados — monitorar burn e atraso."
        : null;

  return { similares: k, shareStress, desfechoProvavel, padrao, alerta };
}
