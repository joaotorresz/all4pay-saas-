/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGING DE CONTAS A PAGAR — quanto se deve, há quanto tempo, e para quem.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O painel de contas a pagar responde "o que vence no PERÍODO". Esta leitura
 * responde a outra pergunta: da CARTEIRA INTEIRA em aberto, quanto já venceu
 * (e há quanto tempo) e quanto vence nas próximas semanas — por fornecedor e
 * por categoria. É a tabela que o dono abre antes de decidir quem pagar
 * primeiro quando o caixa não cobre tudo.
 *
 * ⚠️ **É POSIÇÃO, não fluxo.** Sem recorte de período: um boleto vencido em
 * junho continua devido em agosto, e recortá-lo pelo mês escolhido o faria
 * sumir justamente quando ele é mais urgente. A tela diz "carteira inteira" ao
 * lado do título — sem o rótulo, este bloco e o card "Contas atrasadas" (que é
 * do período) pareceriam discordar.
 *
 * ⚠️ **As faixas de atraso são as MESMAS do contas a receber** (`faixaDoAtraso`
 * importada de lá, não reescrita). Duas definições de "até 30 dias" divergiriam
 * na primeira correção de borda, e as duas telas de aging passariam a
 * classificar o mesmo atraso em faixas diferentes.
 *
 * ⚠️ **"Vence hoje" é A VENCER** (zero dias), nunca atraso — a regra de todo o
 * produto. E as faixas a vencer são de ESPERA até o vencimento: até 7 dias ·
 * 8 a 15 · 16 a 30 · mais de 30. A última existe para a soma das linhas fechar
 * com o total em aberto; sem ela, o que vence em 45 dias sumiria da tabela.
 *
 * ⚠️ **Toda soma mora aqui** (teto ZERO da ONDA 10). Cada linha traz as oito
 * faixas e o total, e há guarda exigindo que a soma das linhas feche com a
 * carteira ao centavo.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão `contas-pagar-aging/1.0.0`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { magnitude, previsto, cancelado } from "@/core/indicadores/convencoes";
import { faixaDoAtraso, ROTULO_FAIXA, type FaixaAtraso } from "@/core/contas-receber";
import { contraparteDe } from "./recorrentes";

export const AGING_PAGAR_VERSION = "contas-pagar-aging/1.0.0";

export type FaixaAVencer = "ate_7" | "de_8_a_15" | "de_16_a_30" | "acima_30";
export type FaixaAging = FaixaAtraso | FaixaAVencer;

export const ROTULO_FAIXA_A_VENCER: Record<FaixaAVencer, string> = {
  ate_7: "Em até 7 dias",
  de_8_a_15: "8 a 15 dias",
  de_16_a_30: "16 a 30 dias",
  acima_30: "Mais de 30 dias",
};

/** A ordem das colunas: o atraso mais velho primeiro, depois o que vence logo. */
export const ORDEM_VENCIDO: readonly FaixaAtraso[] = ["acima_90", "de_61_a_90", "de_31_a_60", "ate_30"];
export const ORDEM_A_VENCER: readonly FaixaAVencer[] = ["ate_7", "de_8_a_15", "de_16_a_30", "acima_30"];

export const ROTULO_FAIXA_AGING: Record<FaixaAging, string> = { ...ROTULO_FAIXA, ...ROTULO_FAIXA_A_VENCER };

/**
 * Dias até o vencimento (0 = hoje). ⚠️ A faixa começa em ZERO: o que vence hoje
 * cai em "até 7 dias", não num limbo.
 */
export function faixaAVencer(dias: number): FaixaAVencer {
  if (dias <= 7) return "ate_7";
  if (dias <= 15) return "de_8_a_15";
  if (dias <= 30) return "de_16_a_30";
  return "acima_30";
}

export type Dimensao = "fornecedor" | "categoria";

export interface LinhaAging {
  nome: string;
  faixas: Record<FaixaAging, number>;
  vencido: number;
  aVencer: number;
  total: number;
  quantidade: number;
}

export interface TotaisAging {
  faixas: Record<FaixaAging, number>;
  quantidades: Record<FaixaAging, number>;
  vencido: number;
  aVencer: number;
  total: number;
  quantidade: number;
}

export interface AgingContasPagar {
  versao: string;
  hoje: string;
  totais: TotaisAging;
  porFornecedor: LinhaAging[];
  porCategoria: LinhaAging[];
  /** Quantas linhas foram agregadas em "Demais" por dimensão (0 = nenhuma). */
  agregadas: Record<Dimensao, number>;
}

/** Quantas linhas a tabela lista antes de juntar o resto em "Demais". */
export const TETO_LINHAS_AGING = 10;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dias entre duas datas-só, fatiando a string (`Date.UTC`, nunca `new Date(iso)` local). */
function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ate.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

const zeros = (): Record<FaixaAging, number> => ({
  ate_30: 0, de_31_a_60: 0, de_61_a_90: 0, acima_90: 0,
  ate_7: 0, de_8_a_15: 0, de_16_a_30: 0, acima_30: 0,
});

/** Uma conta a pagar EM ABERTO: saída, prevista, não cancelada. */
const emAberto = (m: RiskMovement) => m.type === "saida" && previsto(m) && !cancelado(m);

/** A faixa de um título em aberto, relativa a `hoje`. */
export function faixaDoTitulo(dueDate: string, hoje: string): FaixaAging {
  const atraso = diasEntre(dueDate.slice(0, 10), hoje);
  // ⚠️ `> 0`, não `>= 0`: zero dias de atraso é o que vence HOJE, e ele está no prazo.
  return atraso > 0 ? faixaDoAtraso(atraso) : faixaAVencer(-atraso);
}

function agrupar(
  ms: RiskMovement[], hoje: string, nomeDe: (m: RiskMovement) => string,
): { linhas: LinhaAging[]; agregadas: number } {
  const por = new Map<string, LinhaAging>();
  for (const m of ms) {
    const nome = nomeDe(m);
    const l = por.get(nome) ?? { nome, faixas: zeros(), vencido: 0, aVencer: 0, total: 0, quantidade: 0 };
    const f = faixaDoTitulo(m.due_date, hoje);
    const v = magnitude(m);
    l.faixas[f] = round2(l.faixas[f] + v);
    if ((ORDEM_VENCIDO as readonly string[]).includes(f)) l.vencido = round2(l.vencido + v);
    else l.aVencer = round2(l.aVencer + v);
    l.total = round2(l.total + v);
    l.quantidade += 1;
    por.set(nome, l);
  }
  // O que mais pesa primeiro; empate pelo que tem mais VENCIDO (é o que cobra antes).
  const todas = Array.from(por.values()).sort((a, b) => b.total - a.total || b.vencido - a.vencido || a.nome.localeCompare(b.nome, "pt-BR"));
  if (todas.length <= TETO_LINHAS_AGING) return { linhas: todas, agregadas: 0 };
  // ⚠️ O resto vira UMA linha "Demais", não some: sem ela, a soma das linhas
  // deixaria de fechar com o total da carteira.
  const cabeca = todas.slice(0, TETO_LINHAS_AGING - 1);
  const resto = todas.slice(TETO_LINHAS_AGING - 1);
  const demais: LinhaAging = { nome: `Demais (${resto.length})`, faixas: zeros(), vencido: 0, aVencer: 0, total: 0, quantidade: 0 };
  for (const l of resto) {
    for (const k of Object.keys(demais.faixas) as FaixaAging[]) demais.faixas[k] = round2(demais.faixas[k] + l.faixas[k]);
    demais.vencido = round2(demais.vencido + l.vencido);
    demais.aVencer = round2(demais.aVencer + l.aVencer);
    demais.total = round2(demais.total + l.total);
    demais.quantidade += l.quantidade;
  }
  return { linhas: [...cabeca, demais], agregadas: resto.length };
}

export function montarAgingContasPagar(input: RiskInput): AgingContasPagar {
  const hoje = input.hoje.slice(0, 10);
  const nomes = input.partyNames ?? {};
  const carteira = input.movements.filter(emAberto);

  const totais: TotaisAging = { faixas: zeros(), quantidades: zeros(), vencido: 0, aVencer: 0, total: 0, quantidade: 0 };
  for (const m of carteira) {
    const f = faixaDoTitulo(m.due_date, hoje);
    const v = magnitude(m);
    totais.faixas[f] = round2(totais.faixas[f] + v);
    totais.quantidades[f] += 1;
    if ((ORDEM_VENCIDO as readonly string[]).includes(f)) totais.vencido = round2(totais.vencido + v);
    else totais.aVencer = round2(totais.aVencer + v);
    totais.total = round2(totais.total + v);
    totais.quantidade += 1;
  }

  // ⚠️ O fornecedor sai de `contraparteDe` (cadastro → descrição → "Sem
  // contraparte"), a mesma do painel de recorrentes. A CATEGORIA nunca vira o
  // nome do fornecedor — senão a linha "Marketing" fundiria o Google e a Meta.
  const f = agrupar(carteira, hoje, (m) => contraparteDe(m, nomes));
  const c = agrupar(carteira, hoje, (m) => m.category?.trim() || "Sem categoria");

  return {
    versao: AGING_PAGAR_VERSION,
    hoje,
    totais,
    porFornecedor: f.linhas,
    porCategoria: c.linhas,
    agregadas: { fornecedor: f.agregadas, categoria: c.agregadas },
  };
}
