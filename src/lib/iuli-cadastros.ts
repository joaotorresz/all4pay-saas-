"use client";

/**
 * ⚠️ **O CADASTRO ANTIGO de projetos e centros de custo — SÓ LEITURA.**
 *
 * Desde a migration `20260930180000` os dois moram em `projects` e
 * `cost_centers`, lidos e gravados por `lib/cadastros-hierarquia`. Aqui eles
 * moravam em `localStorage` CRU com id numérico ("5001"), que nenhuma coluna
 * UUID aceita: escolher um projeto num lançamento em produção era recusado, e a
 * recusa mandava "criar de novo em Cadastros" — que gravava no mesmo lugar.
 *
 * Os ESCRITORES foram REMOVIDOS. O que sobra alimenta o bloco "Cadastros
 * antigos deste navegador" (o botão "Trazer para o cadastro") e os formulários
 * que a parte 2 ainda vai migrar.
 */

export interface Projeto {
  id: string;
  nome: string;
  codigo: string;
  descricao: string;
  dataInicial: string; // ISO
  dataFinal: string; // ISO
  previsaoReceita: number;
  previsaoDespesa: number;
}

export interface CentroCusto {
  id: string;
  nome: string;
  codigo: string;
  codigoContabil: string; // Domínio (TXT contábil)
  descricao: string;
  ativo: boolean;
}

const K_PROJ = "a4p_projetos";
const K_CC = "a4p_centros_custo";

function load<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T[]) : []; } catch { return []; }
}
export function listProjetos(): Projeto[] { return load<Projeto>(K_PROJ); }
export function listCentrosCusto(): CentroCusto[] { return load<CentroCusto>(K_CC); }
