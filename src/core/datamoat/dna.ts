/**
 * Company DNA Engine — cada empresa ganha um "DNA financeiro": como ela
 * opera (sazonal/agressiva/conservadora…). Daí a IA responde
 * contextualmente, não genericamente.
 */
import type { EmpresaFeatures, CompanyDNA, DnaTraco } from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const norm = (v: number, min: number, max: number) => clamp01((v - min) / (max - min));

export function companyDNA(e: EmpresaFeatures): CompanyDNA {
  const tracos: DnaTraco[] = [
    { nome: "Agressividade", valor: Math.round(clamp01(e.burnMultiple / 2.5) * 100) },
    { nome: "Previsibilidade", valor: Math.round((1 - clamp01(e.volatilidade)) * 100) },
    { nome: "Crescimento", valor: Math.round(norm(e.crescimento, -0.05, 0.12) * 100) },
    { nome: "Rentabilidade", valor: Math.round(norm(e.margem, 0, 0.35) * 100) },
    { nome: "Recorrência", valor: Math.round(clamp01(e.recorrencia) * 100) },
    { nome: "Resiliência", valor: Math.round(norm(e.runwayMeses, 2, 18) * 100) },
  ];

  // Arquétipo a partir dos traços dominantes.
  const agr = e.burnMultiple > 1.4 && e.crescimento > 0.04;
  const conserv = e.volatilidade < 0.35 && e.margem > 0.18;
  const sazonal = e.volatilidade > 0.5;
  const recorrente = e.recorrencia > 0.6;

  let arquetipo: string;
  let descricao: string;
  if (agr) {
    arquetipo = "Agressiva de crescimento";
    descricao = "Cresce rápido com burn elevado — alto retorno, exige disciplina de caixa.";
  } else if (conserv) {
    arquetipo = "Conservadora previsível";
    descricao = "Margem alta e baixa volatilidade — operação robusta e estável.";
  } else if (recorrente) {
    arquetipo = "Recorrente resiliente";
    descricao = "Receita recorrente forte — previsível e defensável.";
  } else if (sazonal) {
    arquetipo = "Sazonal cíclica";
    descricao = "Fluxo marcado por sazonalidade — exige planejamento de capital de giro.";
  } else {
    arquetipo = "Equilibrada";
    descricao = "Perfil balanceado entre crescimento, margem e risco.";
  }

  const assinatura = [
    agr ? "AGR" : conserv ? "CON" : "EQU",
    sazonal ? "SAZ" : "EST",
    recorrente ? "REC" : e.crescimento > 0.04 ? "CRE" : "MAD",
  ].join("-");

  return { arquetipo, descricao, tracos, assinatura };
}
